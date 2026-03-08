import { Session } from 'smart-agent-ai'
import { join } from 'path'
import { readdirSync } from 'fs'
import { db } from './db'
import { createScheduleTool } from './schedule-tool'
import { sessions } from './session-store'
import '../models/route'

let isHeartbeatRunning = false;
const skillsDir = join(process.cwd(), "skills");

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

        const skillPaths: string[] = [];
        try {
            for (const f of readdirSync(skillsDir)) {
                if (f.endsWith(".md")) {
                    skillPaths.push(join(skillsDir, f));
                }
            }
        } catch { }

        const config = {
            model: agent.model || "gemini-2.5-flash",
            cwd: process.cwd(),
            skills: skillPaths.length > 0 ? skillPaths : undefined,
            maxIterations: 5,
            tools: [createScheduleTool(agent.id)],
        };

        // Reuse the active session to maintain memory
        let session = agent.sessionId ? sessions.get(agent.sessionId) : undefined;
        if (!session) {
            session = new Session(config);
            sessions.set(session.id, session);
            db.agents.update(agent.id, { sessionId: session.id });
        }

        const prompt = "SYSTEM INSTINCT TICK: Wake up and check any recent events from your tools (like Telegram feeds, Market indicators, active Schedules). If absolutely nothing needs your attention, reply EXACTLY with 'IDLE'. DO NOT write conversational filler. ONLY reply if action or a user notification is required.";

        let fullText = "";
        console.log(`[heartbeat] Tick for Agent ${agent.id}...`);

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
        } else {
            console.log("[heartbeat] Nothing to report (IDLE).");
        }
    } catch (err) {
        console.error("[heartbeat] Error:", err);
    } finally {
        isHeartbeatRunning = false;
    }
}
