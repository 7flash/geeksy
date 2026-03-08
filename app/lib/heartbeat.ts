import { Session } from 'smart-agent-ai'
import { join } from 'path'
import { readdirSync } from 'fs'
import { db } from './db'
import { createScheduleTool } from './schedule-tool'
import { sessions } from './session-store'
import '../api/models/route'

let isHeartbeatRunning = false;
const skillsDir = join(process.cwd(), "skills");

// ── Heartbeat telemetry ──
const heartbeatStats = {
    lastTickAt: 0,
    lastTickResult: 'pending' as 'idle' | 'acted' | 'pruned' | 'paused' | 'error' | 'pending',
    consecutiveFailures: 0,
    totalTicks: 0,
    startedAt: Date.now(),
};

export function getHeartbeatStats() {
    return {
        ...heartbeatStats,
        isRunning: isHeartbeatRunning,
        uptimeMs: Date.now() - heartbeatStats.startedAt,
    };
}

export function startHeartbeat() {
    // Run every 60 seconds
    setInterval(runHeartbeat, 60000);
    // Also run once on startup after a small delay
    setTimeout(runHeartbeat, 5000);
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
            tools: [createScheduleTool(agent.id)],
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

            // Wipe legacy rows
            messages.forEach((m: any) => { if (m.delete) m.delete() });
            db.objectives.select().where({ agentId: agent.id }).all().forEach((o: any) => { if (o.delete) o.delete() });
            db.files.select().where({ agentId: agent.id }).all().forEach((f: any) => { if (f.delete) f.delete() });

            // Ensure the tool execution is recorded or just rely on the new state
            // Re-initialize session to clear its internal short-term memory
            session = new Session(config);
            sessions.set(session.id, session);
            db.agents.update(agent.id, { sessionId: session.id });

            console.log(`[heartbeat] Agent ${agent.id} legacy memory wiped.`);
            return; // Skip normal tick this round
        }

        const prompt = "SYSTEM INSTINCT TICK: Wake up and check any recent events. You MUST explicitly fetch recent messages from tracked Telegram channels via the Telegram plugin's API to look for new Solana tokens (Pump.fun mint addresses). If a new token mint is mentioned, you MUST automatically add it to the trading bot via the Pumpfun Trading plugin and notify the user. Check your active Schedules as well. If absolutely no new tokens or events need your attention, reply EXACTLY with 'IDLE'. DO NOT write conversational filler. ONLY reply if action or a user notification is required.";

        let fullText = "";
        heartbeatStats.totalTicks++;
        heartbeatStats.lastTickAt = Date.now();
        console.log(`[heartbeat] Tick #${heartbeatStats.totalTicks} for Agent ${agent.id}...`);

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
        const withoutThoughts = trimmed.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

        if (withoutThoughts && withoutThoughts.toUpperCase() !== "IDLE") {
            console.log("[heartbeat] Agent acted:", withoutThoughts);
            db.messages.insert({ agentId: agent.id, role: 'assistant', content: fullText });
            heartbeatStats.lastTickResult = 'acted';
        } else {
            console.log("[heartbeat] Nothing to report (IDLE).");
            heartbeatStats.lastTickResult = 'idle';
        }
        heartbeatStats.consecutiveFailures = 0;
    } catch (err) {
        console.error("[heartbeat] Error:", err);
        heartbeatStats.consecutiveFailures++;
        heartbeatStats.lastTickResult = 'error';
    } finally {
        isHeartbeatRunning = false;
    }
}
