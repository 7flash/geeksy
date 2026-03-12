import { Session } from 'smart-agent-ai'
import { join } from 'path'
import { readdirSync } from 'fs'
import { db } from './db'
import { createScheduleTool } from './schedule-tool'
import { createAgentMessageTool } from './agent-message-tool'
import { sessions } from './session-store'
import '../api/models/route'

let isHeartbeatRunning = false;
const skillsDir = join(process.cwd(), "skills");

// ── Follow-up queue ──
// After user interactions, follow-up objectives are queued here.
// The heartbeat picks them up on the next tick.
export interface FollowUp {
    id?: number;
    reason: string;
    context: string;
    scheduledAt: number;
    agentId: number;
    status?: string;
}

/**
 * Schedule a follow-up heartbeat after a user interaction.
 * The heartbeat will pick this up on its next tick and act on it.
 */
export function scheduleFollowUp(
    agentId: number,
    reason: string,
    context: string,
    delayMs: number = 0, // 0 = next tick, otherwise min delay
) {
    db.followUps.insert({
        reason,
        context,
        scheduledAt: Date.now() + delayMs,
        agentId,
        status: 'pending'
    });
    // If heartbeat interval is slow, speed it up for the follow-up
    if (currentInterval > 60_000) {
        currentInterval = 60_000;
    }
    console.log(`[heartbeat] Follow-up scheduled: "${reason}" (delay: ${delayMs}ms)`);
}

/** Get pending follow-ups ready to execute */
function drainFollowUps(agentId: number): FollowUp[] {
    const now = Date.now();
    const ready = (db.followUps.select().where({ agentId, status: 'pending' }).all() as FollowUp[])
        .filter(fu => fu.scheduledAt <= now);
    for (const fu of ready) {
        db.followUps.update(fu.id!, { status: 'processed' });
    }
    return ready;
}

// ── Heartbeat telemetry ──
interface ToolCall { name: string; result?: string; at: number; }

const heartbeatStats = {
    lastTickAt: 0,
    lastTickResult: 'pending' as 'idle' | 'acted' | 'pruned' | 'paused' | 'error' | 'pending' | 'skipped',
    consecutiveFailures: 0,
    totalTicks: 0,
    totalSkips: 0,
    startedAt: Date.now(),
    lastToolCalls: [] as ToolCall[],
};

export function getHeartbeatStats() {
    return {
        ...heartbeatStats,
        isRunning: isHeartbeatRunning,
        uptimeMs: Date.now() - heartbeatStats.startedAt,
        currentIntervalMs: currentInterval,
        followUpQueueLength: db.followUps.select().where({ status: 'pending' }).all().length,
    };
}

/** @internal — exposed for tests only */
export function _getFollowUpQueue(): FollowUp[] { return db.followUps.select().where({ status: 'pending' }).all() as FollowUp[]; }
/** @internal — drain follow-ups for testing */
export function _drainFollowUps(agentId: number): FollowUp[] { return drainFollowUps(agentId); }
/** @internal — clear queue for test isolation */
export function _clearFollowUpQueue() {
    for (const fu of db.followUps.select().all()) {
        db.followUps.delete(fu.id!);
    }
}

// ── Adaptive interval ──
const MIN_INTERVAL = 30_000;   // 30s when active
const MAX_INTERVAL = 300_000;  // 5min when idle
let currentInterval = 60_000;  // start at 60s

function scheduleNext() {
    setTimeout(async () => {
        await runHeartbeat();
        // Adapt interval based on result
        if (heartbeatStats.lastTickResult === 'acted') {
            currentInterval = MIN_INTERVAL; // work happened, check sooner
        } else if (heartbeatStats.lastTickResult === 'idle' || heartbeatStats.lastTickResult === 'skipped') {
            currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL); // slow down
        } else if (heartbeatStats.lastTickResult === 'error') {
            currentInterval = 120_000; // 2min backoff on error
        }
        // Don't reschedule if paused — will resume when unpaused
        if (heartbeatStats.lastTickResult !== 'paused') {
            scheduleNext();
        }
    }, currentInterval);
}

export function startHeartbeat() {
    // Run once on startup after a small delay, then adaptively
    setTimeout(async () => {
        await runHeartbeat();
        scheduleNext();
    }, 5000);
}

/** Resume heartbeat after unpause or circuit breaker reset */
export function resumeHeartbeat() {
    heartbeatStats.consecutiveFailures = 0;
    currentInterval = 60_000; // reset to default
    console.log('[heartbeat] Resumed — scheduling next tick in 60s');
    scheduleNext();
}

/** Check if any LLM API key is configured */
function hasApiKey(): boolean {
    return !!(
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.DEEPSEEK_API_KEY
    );
}

export async function runHeartbeat() {
    if (isHeartbeatRunning) return;
    isHeartbeatRunning = true;

    try {
        const agent = db.agents.select().where({ id: 1 }).first();
        if (!agent) {
            console.log("[heartbeat] Global agent not found yet, skipping.");
            return;
        }

        const pausedState = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first();
        if (pausedState && pausedState.value === 'true') {
            heartbeatStats.lastTickAt = Date.now();
            heartbeatStats.lastTickResult = 'paused';
            return;
        }

        // Guard: skip if no API key is configured (prevents error spam)
        if (!hasApiKey()) {
            heartbeatStats.lastTickAt = Date.now();
            heartbeatStats.lastTickResult = 'skipped';
            heartbeatStats.totalSkips++;
            return;
        }

        // Circuit breaker: auto-pause after 5 consecutive failures
        if (heartbeatStats.consecutiveFailures >= 5) {
            console.error(`[heartbeat] Circuit breaker tripped — ${heartbeatStats.consecutiveFailures} consecutive failures. Auto-pausing.`);
            db.agentState.upsert(
                { agentId: 1, key: 'heartbeat_paused' },
                { agentId: 1, key: 'heartbeat_paused', value: 'true' },
            );
            heartbeatStats.lastTickResult = 'paused';
            return;
        }

        // Check if there's actual work to do: pending objectives, active plugins, scheduled tasks, or follow-ups
        const pendingObjectives = db.objectives.select().where({ agentId: agent.id, status: 'pending' }).all();
        let activePlugins: any[] = [];
        let pendingSchedules: any[] = [];
        try { activePlugins = db.plugins?.select().where({ status: 'running' }).all() || []; } catch (e) { console.warn('[heartbeat] plugins query failed:', e); }
        try { pendingSchedules = db.schedules?.select().where({ status: 'active' }).all() || []; } catch (e) { console.warn('[heartbeat] schedules query failed:', e); }

        // Drain ready follow-ups
        const followUps = drainFollowUps(agent.id);

        const hasWork = pendingObjectives.length > 0 || activePlugins.length > 0 || pendingSchedules.length > 0 || followUps.length > 0;

        if (!hasWork) {
            heartbeatStats.lastTickAt = Date.now();
            heartbeatStats.lastTickResult = 'idle';
            heartbeatStats.totalSkips++;
            return;
        }

        const skillPaths: string[] = [];
        try {
            for (const f of readdirSync(skillsDir)) {
                if (f.endsWith(".md")) {
                    skillPaths.push(join(skillsDir, f));
                }
            }
        } catch { }

        const safeModeRow = db.agentState.select().where({ agentId: 1, key: 'safe_mode' }).first();
        const safeMode = safeModeRow?.value === 'true';

        const config = {
            model: agent.model || "gemini-2.5-flash",
            cwd: process.cwd(),
            skills: skillPaths.length > 0 ? skillPaths : undefined,
            maxIterations: 5,
            safeMode,
            tools: [createScheduleTool(agent.id), createAgentMessageTool(agent.id)],
        };

        // Reuse the active session to maintain memory
        let session = agent.sessionId ? sessions.get(agent.sessionId) : undefined;
        if (!session) {
            session = new Session(config);
            sessions.set(session.id, session);
            db.agents.update(agent.id, { sessionId: session.id });
        }

        const messages = db.messages.select().where({ agentId: agent.id }).all();
        if (messages.length > 200) {
            console.log(`[heartbeat] Agent ${agent.id} reached ${messages.length} messages. Triggering auto-pruning...`);
            const prunePrompt = "MEMORY PRUNING TICK: Your conversation history has exceeded 200 messages. You MUST immediately analyze all your previous interactions. Summarize your previous context into a memory artifact (e.g. using the setState tool under the key 'core_memory'), capturing ongoing state, preferences, and pending items. Once you have successfully saved it, reply EXACTLY with 'PRUNED'.";

            let pruneText = "";
            for await (const event of session.send(prunePrompt)) {
                if (event.type === 'thinking_delta') pruneText += (event as any).delta || '';
            }

            console.log(`[heartbeat] Agent ${agent.id} pruned response:`, pruneText.substring(0, 100));

            // Wipe legacy rows using proper ORM delete
            for (const m of messages) {
                try { db.messages.delete(m.id); } catch { }
            }
            for (const o of db.objectives.select().where({ agentId: agent.id }).all()) {
                try { db.objectives.delete(o.id); } catch { }
            }
            for (const f of db.files.select().where({ agentId: agent.id }).all()) {
                try { db.files.delete(f.id); } catch { }
            }

            // Re-initialize session to clear its internal short-term memory
            session = new Session(config);
            sessions.set(session.id, session);
            db.agents.update(agent.id, { sessionId: session.id });

            console.log(`[heartbeat] Agent ${agent.id} legacy memory wiped.`);
            heartbeatStats.lastTickResult = 'pruned';
            return;
        }

        // Build dynamic prompt based on actual state
        const objectiveList = pendingObjectives.map((o: any) => `- ${o.name}: ${o.description || '(no description)'}`).join('\n');
        const pluginList = activePlugins.map((p: any) => p.name || p.packageName).join(', ');
        const scheduleList = pendingSchedules.map((s: any) => `- ${s.name}: ${s.type} (${s.status})`).join('\n');
        const followUpList = followUps.map(fu => `- ${fu.reason} (context: ${fu.context})`).join('\n');

        const prompt = [
            "SYSTEM HEARTBEAT TICK: Check the current state and take action if needed.",
            objectiveList ? `\nPending Objectives:\n${objectiveList}` : '',
            pluginList ? `\nActive Plugins: ${pluginList}` : '',
            scheduleList ? `\nActive Schedules:\n${scheduleList}` : '',
            followUpList ? `\nFollow-Up Tasks (from recent interactions):\n${followUpList}\nFor each follow-up: evaluate the situation, take action if needed, and if the user needs an update, send them a message.` : '',
            "\nCheck for pending objectives and complete them. Check active plugins for new data or events.",
            "If absolutely nothing needs attention, reply EXACTLY with 'IDLE'. DO NOT write conversational filler.",
        ].filter(Boolean).join('\n');

        let fullText = "";
        const toolCalls: ToolCall[] = [];
        heartbeatStats.totalTicks++;
        heartbeatStats.lastTickAt = Date.now();
        console.log(`[heartbeat] Tick #${heartbeatStats.totalTicks} for Agent ${agent.id}...`);

        // 5-minute timeout to prevent stuck heartbeats
        const timeout = setTimeout(() => {
            console.error('[heartbeat] Tick timed out after 5 minutes');
            heartbeatStats.lastTickResult = 'error';
            isHeartbeatRunning = false;
        }, 5 * 60 * 1000);

        try {
            for await (const event of session.send(prompt)) {
                if (event.type === 'thinking_delta') {
                    fullText += (event as any).delta || '';
                }
                if (event.type === 'planning') {
                    const objectives = (event as any).objectives || []
                    for (const obj of objectives) {
                        try {
                            db.objectives.upsert(
                                { agentId: agent.id, name: obj.name },
                                { agentId: agent.id, name: obj.name, description: obj.description || '', type: obj.type || 'task', status: 'pending' },
                            )
                        } catch (e) { console.warn('[heartbeat] objective upsert failed:', obj.name, e); }
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
                if (event.type === 'tool_start') {
                    const name = (event as any).tool || (event as any).name || 'unknown';
                    toolCalls.push({ name, at: Date.now() });
                    console.log(`[heartbeat]   └ tool: ${name}`);
                }
                if (event.type === 'tool_result') {
                    const last = toolCalls[toolCalls.length - 1];
                    if (last) last.result = String((event as any).result || '').substring(0, 80);
                }
            }
        } finally { clearTimeout(timeout); }

        // Store last tool calls (cap at 10)
        heartbeatStats.lastToolCalls = toolCalls.slice(-10);

        const trimmed = fullText.trim();
        const withoutThoughts = trimmed.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

        if (withoutThoughts && withoutThoughts.toUpperCase() !== "IDLE") {
            console.log(`[heartbeat] Agent acted (${withoutThoughts.length} chars):`, withoutThoughts.substring(0, 120));
            db.messages.insert({ agentId: agent.id, role: 'assistant', content: fullText });
            heartbeatStats.lastTickResult = 'acted';
        } else {
            console.log("[heartbeat] Nothing to report (IDLE).");
            heartbeatStats.lastTickResult = 'idle';
        }
        heartbeatStats.consecutiveFailures = 0;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[heartbeat] Error (failure #${heartbeatStats.consecutiveFailures + 1}):`, msg);
        heartbeatStats.consecutiveFailures++;
        heartbeatStats.lastTickResult = 'error';
    } finally {
        isHeartbeatRunning = false;
    }
}
