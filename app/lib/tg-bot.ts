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

export function startTgBot() {
    // Run the polling tight loop without overlapping
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
            setTimeout(pollTelegram, 10000); // Check again later
            return;
        }

        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const json = await res.json() as any;

        if (json.ok && Array.isArray(json.result)) {
            for (const update of json.result) {
                lastUpdateId = Math.max(lastUpdateId, update.update_id);

                if (update.callback_query) {
                    const data = update.callback_query.data;
                    const chatId = update.callback_query.message?.chat?.id;
                    const username = update.callback_query.from?.username || update.callback_query.from?.first_name || 'User';

                    if (data && data.startsWith('exec:')) {
                        const cmd = data.substring(5);
                        console.log(`[tg-bot] User approved command: ${cmd}`);

                        // Acknowledge the callback
                        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                callback_query_id: update.callback_query.id,
                                text: `Command approved...`
                            })
                        });

                        // Act as if the user typed "Execute: <cmd>"
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
        console.error("[tg-bot] Polling error:", err.message);
    } finally {
        isTgPollingActive = false;
        // Immediate re-poll
        setTimeout(pollTelegram, 1000);
    }
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
        // Apply bypass if needed to the existing session
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
        for await (const event of session.send(`Reply via Telegram to ${username}: ${text}`)) {
            if (event.type === 'thinking_delta') {
                fullText += (event as any).delta || '';
            }
            if (event.type === 'tool_result') {
                const tr = event as any;
                if (tr.tool === 'exec' && !tr.result.success && tr.result.error?.includes('Safe mode is enabled')) {
                    const cmd = tr.params.command;
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
                            { agentId: agent.id, name: obj.name },
                            { agentId: agent.id, name: obj.name, description: obj.description || '', type: obj.type || 'task', status: 'pending' },
                        )
                    } catch { }
                }
            }
            if (event.type === 'objective_check') {
                const results = (event as any).results || []
                for (const r of results) {
                    const existing = db.objectives.select().where({ agentId: agent.id, name: r.name }).first()
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
        // Strip <thinking> tags, tool-call JSON blocks, and clean up whitespace
        const cleaned = trimmed
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
            .replace(/```json\s*[\s\S]*?```/g, '')
            .replace(/\[?\s*\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:[\s\S]*?\}\s*\]?/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        clearInterval(typingInterval);

        if (cleaned) {
            db.messages.insert({ agentId: agent.id, role: 'assistant', content: fullText });

            // Send reply back to Telegram — chunk if over 4096 chars
            const chunks = splitTelegramMessage(cleaned);
            for (const chunk of chunks) {
                await sendTelegramMessage(token, chatId, chunk);
            }
        }
    } catch (err: any) {
        clearInterval(typingInterval);
        console.error("[tg-bot] Error processing message:", err);
        await sendTelegramMessage(token, chatId, `Error processing request: ${err.message}`);
    }
}

/** Send a message to Telegram with Markdown fallback to plain text */
async function sendTelegramMessage(token: string, chatId: number, text: string) {
    // Try Markdown first
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });
    const json = await res.json() as any;
    if (!json.ok) {
        // Markdown parse failed — fall back to plain text
        console.warn(`[tg-bot] Markdown send failed (${json.description}), retrying as plain text`);
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
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
        // Try to split at a newline boundary
        let splitAt = remaining.lastIndexOf('\n', maxLen);
        if (splitAt < maxLen * 0.5) splitAt = maxLen; // no good newline, hard split
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trimStart();
    }
    return chunks;
}
