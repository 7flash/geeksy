import { Session } from 'smart-agent-ai'
import { join } from 'path'
import { readdirSync } from 'fs'
import { db } from './db'
import { createScheduleTool } from './schedule-tool'
import { sessions } from './session-store'
import '../api/models/route'

const skillsDir = join(process.cwd(), "skills");
let isTgPollingActive = false;
let lastUpdateId = 0;
let consecutiveErrors = 0;

// ── Outbound Message Queue ──
// Messages are queued and sent with retry + exponential backoff.
// This prevents message loss during network hiccups or Telegram rate limits.
interface QueuedMessage {
    token: string;
    chatId: number;
    text: string;
    parseMode?: 'Markdown' | undefined;
    retries: number;
    maxRetries: number;
}

const outboundQueue: QueuedMessage[] = [];
let isProcessingQueue = false;

async function enqueueMessage(token: string, chatId: number, text: string, parseMode?: 'Markdown') {
    outboundQueue.push({ token, chatId, text, parseMode, retries: 0, maxRetries: 3 });
    processQueue();
}

async function processQueue() {
    if (isProcessingQueue || outboundQueue.length === 0) return;
    isProcessingQueue = true;

    while (outboundQueue.length > 0) {
        const msg = outboundQueue[0];
        try {
            const res = await fetch(`https://api.telegram.org/bot${msg.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: msg.chatId,
                    text: msg.text,
                    ...(msg.parseMode ? { parse_mode: msg.parseMode } : {}),
                })
            });
            const json = await res.json() as any;

            if (!json.ok) {
                if (msg.parseMode === 'Markdown') {
                    // Markdown parse failed — retry as plain text (not a network error)
                    console.warn(`[tg-bot] Markdown send failed (${json.description}), retrying as plain text`);
                    msg.parseMode = undefined;
                    continue; // retry same message without shifting
                }

                if (json.error_code === 429) {
                    // Rate limited — wait the retry_after duration
                    const waitSec = json.parameters?.retry_after || 5;
                    console.warn(`[tg-bot] Rate limited, waiting ${waitSec}s`);
                    await sleep(waitSec * 1000);
                    continue;
                }

                // Other API error — drop the message after logging
                console.error(`[tg-bot] Send failed: ${json.description}`);
            }

            // Success or non-retryable error — remove from queue
            outboundQueue.shift();
        } catch (err: any) {
            // Network error — retry with backoff
            msg.retries++;
            if (msg.retries >= msg.maxRetries) {
                console.error(`[tg-bot] Message dropped after ${msg.maxRetries} retries:`, err.message);
                outboundQueue.shift();
            } else {
                const delay = Math.min(1000 * Math.pow(2, msg.retries), 15000);
                console.warn(`[tg-bot] Send retry ${msg.retries}/${msg.maxRetries} in ${delay}ms`);
                await sleep(delay);
            }
        }
    }

    isProcessingQueue = false;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Telegram Bot ──

export function startTgBot() {
    setTimeout(pollTelegram, 5000);
}

function getBotToken() {
    const row = db.agentState.select().where({ agentId: 1, key: 'tg_bot_token' }).first();
    return row?.value;
}

async function pollTelegram() {
    if (isTgPollingActive) return;
    isTgPollingActive = true;

    try {
        const token = getBotToken();
        if (!token) {
            isTgPollingActive = false;
            setTimeout(pollTelegram, 30000); // No token — check every 30s instead of 10s
            return;
        }

        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const json = await res.json() as any;

        if (json.ok && Array.isArray(json.result)) {
            consecutiveErrors = 0; // Reset backoff on success

            for (const update of json.result) {
                lastUpdateId = Math.max(lastUpdateId, update.update_id);

                if (update.callback_query) {
                    const data = update.callback_query.data;
                    const chatId = update.callback_query.message?.chat?.id;
                    const username = update.callback_query.from?.username || update.callback_query.from?.first_name || 'User';

                    if (data && data.startsWith('exec:')) {
                        const cmd = data.substring(5);
                        console.log(`[tg-bot] User approved command: ${cmd}`);

                        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                callback_query_id: update.callback_query.id,
                                text: `Command approved...`
                            })
                        });

                        await handleUserMessage(chatId, `I approve the execution of the command: ${cmd}. Please run it using the exec tool, you now have my confirmation.`, username, token, true);
                    }
                    continue;
                }

                if (update.message && update.message.text) {
                    const text = update.message.text;
                    const chatId = update.message.chat.id;
                    const username = update.message.from?.username || update.message.from?.first_name || 'User';

                    console.log(`[tg-bot] Received from ${username}: ${text}`);
                    await handleUserMessage(chatId, text, username, token, false);
                }
            }
        }
    } catch (err: any) {
        consecutiveErrors++;
        const backoff = Math.min(1000 * Math.pow(2, consecutiveErrors), 60000);
        console.error(`[tg-bot] Polling error (attempt ${consecutiveErrors}, backoff ${backoff}ms):`, err.message);
        isTgPollingActive = false;
        setTimeout(pollTelegram, backoff);
        return;
    } finally {
        isTgPollingActive = false;
    }
    // Immediate re-poll on success
    setTimeout(pollTelegram, 1000);
}

async function handleUserMessage(chatId: number, text: string, username: string, token: string, bypassSafeMode = false) {
    const agent = db.agents.select().where({ id: 1 }).first();
    if (!agent) {
        console.warn("[tg-bot] Global agent not found");
        return;
    }

    // Persist user message to DB
    const contextualMessage = `[Telegram Message from ${username}]: ${text}`;
    db.messages.insert({ agentId: agent.id, role: 'user', content: contextualMessage });

    const skillPaths: string[] = [];
    try {
        for (const f of readdirSync(skillsDir)) {
            if (f.endsWith(".md")) {
                skillPaths.push(join(skillsDir, f));
            }
        }
    } catch { }

    const safeModeRow = db.agentState.select().where({ agentId: 1, key: 'safe_mode' }).first();
    const safeMode = bypassSafeMode ? false : (safeModeRow?.value === 'true');

    const config = {
        model: agent.model || "gemini-2.5-flash",
        cwd: process.cwd(),
        skills: skillPaths.length > 0 ? skillPaths : undefined,
        maxIterations: 10,
        safeMode,
        tools: [createScheduleTool(agent.id)],
    };

    // Per-chat sessions — each Telegram user gets their own isolated conversation
    const sessionKey = `tg:${chatId}`;
    let session = sessions.get(sessionKey);
    if (!session) {
        session = new Session(config);
        sessions.set(sessionKey, session);
        console.log(`[tg-bot] New session for chat ${chatId} (${username}): ${session.id}`);
    } else {
        (session as any).config.safeMode = safeMode;
    }

    let fullText = "";

    // Show "typing..." indicator — repeats every 4s (Telegram expires it after 5s)
    const sendTyping = () => fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    }).catch(() => { });
    await sendTyping();
    const typingInterval = setInterval(sendTyping, 4000);

    try {
        for await (const event of session.send(text)) {
            if (event.type === 'thinking_delta') {
                fullText += (event as any).delta || '';
            }
            if (event.type === 'tool_result') {
                const tr = event as any;
                if (tr.tool === 'exec' && !tr.result.success && tr.result.error?.includes('Safe mode is enabled')) {
                    const cmd = tr.params.command;
                    await enqueueMessage(token, chatId,
                        `⚠️ *Safe Mode blocked execution*\n\nCommand:\n\`${cmd}\`\n\nApprove this execution?`,
                        'Markdown'
                    );
                    // Also send inline keyboard separately (can't go through generic queue easily)
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `⚠️ *Safe Mode blocked execution*\n\nCommand:\n\`${cmd}\`\n\nApprove this execution?`,
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: `✅ Confirm run`, callback_data: `exec:${cmd.substring(0, 50)}` }
                                ]]
                            }
                        })
                    });
                }
            }
            if (event.type === 'planning') {
                const objectives = (event as any).objectives || []
                for (const obj of objectives) {
                    try {
                        db.objectives.upsert(
                            { agentId: agent.id, sessionId: dbSessionId, name: obj.name } as any,
                            { agentId: agent.id, sessionId: dbSessionId, name: obj.name, description: obj.description || '', type: obj.type || 'task', status: 'pending' },
                        )
                    } catch { }
                }
            }
            if (event.type === 'objective_check') {
                const results = (event as any).results || []
                for (const r of results) {
                    const existing = db.objectives.select().where({ agentId: agent.id, sessionId: dbSessionId, name: r.name } as any).first()
                    if (existing) {
                        db.objectives.update(existing.id, {
                            status: r.met ? 'complete' : 'failed',
                            result: r.reason || '',
                        })
                    }
                }
            }
        }

        const trimmed = fullText.trim();
        const cleaned = trimmed
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/```json\s*[\s\S]*?```/g, '')
            .replace(/\[?\s*\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:[\s\S]*?\}\s*\]?/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        clearInterval(typingInterval);

        if (cleaned) {
            db.messages.insert({ agentId: agent.id, role: 'assistant', content: fullText });

            // Send reply via message queue with retry
            const chunks = splitTelegramMessage(cleaned);
            for (const chunk of chunks) {
                await enqueueMessage(token, chatId, chunk, 'Markdown');
            }
        }
    } catch (err: any) {
        clearInterval(typingInterval);
        console.error("[tg-bot] Error processing message:", err);
        await enqueueMessage(token, chatId, `Error processing request: ${err.message}`);
    }
}

/** Split text into chunks that fit Telegram's 4096 char limit */
function splitTelegramMessage(text: string, maxLen = 4096): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }
        let splitAt = remaining.lastIndexOf('\n', maxLen);
        if (splitAt < maxLen * 0.5) splitAt = maxLen;
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trimStart();
    }
    return chunks;
}
