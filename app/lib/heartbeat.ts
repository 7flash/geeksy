import { Agent, Session } from 'smart-agent-ai'
import { join } from 'path'
import { readdirSync } from 'fs'
import { db } from './db'
import { createScheduleTool } from './schedule-tool'
import { sessions } from './session-store'
import '../api/models/route'
import { skillsDir } from './paths'
import { createSkillDiscoveryTools } from './skill-discovery-tool'

let isHeartbeatRunning = false;

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

export function isHeartbeatChatNoise(content: string, toolCalls: ToolCall[]): boolean {
    const trimmed = content.trim()
    if (!trimmed) return false
    if (toolCalls.length === 0) return false

    const isJsonToolBlock = /^```json\s*\[[\s\S]*\]\s*```$/i.test(trimmed)
    if (isJsonToolBlock) return true

    const normalized = trimmed
        .replace(/```json\s*[\s\S]*?```/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()

    const boilerplatePatterns = [
        /nothing needs attention\.?$/,
        /^checked (plugins|plugin) and schedule health\.?$/,
        /^checked schedules?\.?$/,
        /^listed schedules?\.?$/,
        /^reviewed schedules?\.?$/,
        /^checked schedules? and found nothing to do\.?$/,
    ]

    if (boilerplatePatterns.some((pattern) => pattern.test(normalized))) return true

    const scheduleToolWasUsed = toolCalls.some((call) => call.name === 'schedule')
    if (!scheduleToolWasUsed) return false

    const lowSignalScheduleSummary = [
        /^checked .*schedule.* nothing needs attention\.?$/,
        /^reviewed .*schedule.* nothing needs attention\.?$/,
        /^listed .*schedule.* nothing needs attention\.?$/,
    ]

    return lowSignalScheduleSummary.some((pattern) => pattern.test(normalized))
}

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

export function getHeartbeatPauseReason(agentId: number): string | null {
    const row = db.agentState.select().where({ agentId, key: 'heartbeat_pause_reason' }).first();
    return row?.value || null;
}

function setHeartbeatPauseState(agentId: number, paused: boolean, reason: 'manual' | 'circuit_breaker' | 'none' = 'none') {
    db.agentState.upsert(
        { agentId, key: 'heartbeat_paused' },
        { agentId, key: 'heartbeat_paused', value: paused ? 'true' : 'false' },
    );
    db.agentState.upsert(
        { agentId, key: 'heartbeat_pause_reason' },
        { agentId, key: 'heartbeat_pause_reason', value: paused ? reason : 'none' },
    );
}

function hasQueuedHeartbeatWork(agentId: number): boolean {
    const hasFollowUps = db.followUps.select().where({ agentId, status: 'pending' }).all().length > 0;
    const hasObjectives = db.objectives.select().where({ agentId, status: 'pending' }).all().length > 0;
    const hasSchedules = (db.schedules?.select().all() || []).some((s: any) => {
        const isForAgent = !s.agentId || s.agentId === agentId;
        const isActive = s.status === 'pending' || s.status === 'running' || s.status === 'failed';
        return isForAgent && isActive;
    });
    return hasFollowUps || hasObjectives || hasSchedules;
}

function getScheduleAuditFingerprint(schedule: any): string {
    return [
        schedule.status || 'unknown',
        schedule.lastRun || 0,
        schedule.lastError || '',
        schedule.lastOutput || '',
    ].join('|').slice(0, 500)
}

function buildHeartbeatScheduleAlert(schedule: any): string {
    const details = [
        `⚠️ **Heartbeat noticed schedule failure: ${schedule.name}**`,
        schedule.type ? `Type: ${schedule.type}` : null,
        schedule.lastError ? `Error: ${schedule.lastError}` : null,
        schedule.lastOutput ? `Output: ${schedule.lastOutput}` : null,
        schedule.expectedOutput ? `Expected marker: ${schedule.expectedOutput}` : null,
        schedule.failOnStderr ? `Validation: fail on stderr enabled` : null,
        schedule.lastRun ? `Last run: ${new Date(schedule.lastRun).toLocaleString()}` : null,
    ].filter(Boolean)
    return details.join('\n')
}

function parseObjectiveParams(params: string | undefined): Record<string, string> {
    if (!params) return {}
    try {
        return JSON.parse(params)
    } catch {
        return {}
    }
}

function getObjectiveStateFingerprint(status: string, reason: string): string {
    return `${status}:${reason}`.slice(0, 500)
}

export function pickHeartbeatSessionId(agentId: number, pendingObjectives: any[], pendingSchedules: any[]): number | undefined {
    const objectiveSession = [...pendingObjectives]
        .filter((o: any) => typeof o.sessionId === 'number')
        .sort((a: any, b: any) => {
            const aRank = a.updatedAt || a.createdAt || a.id || 0
            const bRank = b.updatedAt || b.createdAt || b.id || 0
            return bRank - aRank
        })[0]?.sessionId
    if (typeof objectiveSession === 'number') return objectiveSession

    const scheduleSession = [...pendingSchedules]
        .filter((s: any) => (!s.agentId || s.agentId === agentId) && typeof s.sessionId === 'number')
        .sort((a: any, b: any) => {
            const aRank = a.lastRun || a.nextRun || a.updatedAt || a.createdAt || a.id || 0
            const bRank = b.lastRun || b.nextRun || b.updatedAt || b.createdAt || b.id || 0
            return bRank - aRank
        })[0]?.sessionId
    if (typeof scheduleSession === 'number') return scheduleSession

    const recentMessageSession = [...db.messages.select().where({ agentId }).orderBy('id', 'asc').all()]
        .reverse()
        .find((m: any) => typeof m.sessionId === 'number')?.sessionId
    return typeof recentMessageSession === 'number' ? recentMessageSession : undefined
}

async function validateObjectiveRow(objective: any): Promise<{ met: boolean; reason: string }> {
    const params = parseObjectiveParams(objective.params)

    switch (objective.type) {
        case 'file_exists': {
            const targetPath = params.path
            if (!targetPath) return { met: false, reason: 'Missing objective param: path' }
            const file = Bun.file(targetPath)
            if (!await file.exists()) return { met: false, reason: `File not found: ${targetPath}` }
            if (params.contains) {
                const content = await file.text()
                if (!content.includes(params.contains)) {
                    return { met: false, reason: `File exists but missing: "${params.contains}"` }
                }
            }
            return { met: true, reason: `File exists: ${targetPath}` }
        }
        case 'file_contains': {
            const targetPath = params.path
            const text = params.text
            if (!targetPath || !text) return { met: false, reason: 'Missing objective params: path/text' }
            const file = Bun.file(targetPath)
            if (!await file.exists()) return { met: false, reason: `File not found: ${targetPath}` }
            const content = await file.text()
            return content.includes(text)
                ? { met: true, reason: `File contains required content` }
                : { met: false, reason: `File missing content: "${text}"` }
        }
        case 'command_succeeds':
        case 'command_output_contains': {
            const command = params.command
            if (!command) return { met: false, reason: 'Missing objective param: command' }
            const proc = Bun.spawnSync(process.platform === 'win32' ? ['cmd', '/c', command] : ['sh', '-c', command], {
                cwd: process.cwd(),
                stdout: 'pipe',
                stderr: 'pipe',
            })
            const stdout = proc.stdout.toString().trim()
            const stderr = proc.stderr.toString().trim()
            if (objective.type === 'command_succeeds') {
                return proc.exitCode === 0
                    ? { met: true, reason: 'Command succeeded' }
                    : { met: false, reason: stderr || `Command failed with exit code ${proc.exitCode}` }
            }
            const text = params.text
            if (proc.exitCode !== 0) return { met: false, reason: stderr || `Command failed with exit code ${proc.exitCode}` }
            if (!text) return { met: false, reason: 'Missing objective param: text' }
            return stdout.includes(text)
                ? { met: true, reason: `Output contains "${text}"` }
                : { met: false, reason: `Output missing: "${text}"` }
        }
        case 'task_scheduled': {
            const name = params.name || objective.name
            const match = (db.schedules?.select().all() || []).find((s: any) => {
                const sameAgent = !s.agentId || s.agentId === objective.agentId
                return sameAgent && s.name === name && s.status !== 'cancelled'
            })
            return match
                ? { met: true, reason: `Task scheduled: ${name}` }
                : { met: false, reason: `Scheduled task not found: ${name}` }
        }
        case 'respond':
            return { met: true, reason: 'Response objective handled by conversation flow' }
        default:
            return { met: false, reason: `No heartbeat validator for objective type: ${objective.type}` }
    }
}

export async function auditPendingObjectives(agentId: number): Promise<number> {
    const objectives = db.objectives.select().where({ agentId, status: 'pending' }).all() as any[]
    let changes = 0

    for (const objective of objectives) {
        const result = await validateObjectiveRow(objective)
        const nextStatus = result.met ? 'complete' : 'pending'
        const nextFingerprint = getObjectiveStateFingerprint(nextStatus, result.reason)

        db.objectives.update(objective.id, {
            status: nextStatus,
            result: result.reason,
            lastValidatedAt: Date.now(),
        })

        if (result.met && objective.lastReportedState !== nextFingerprint) {
            db.messages.insert({
                agentId,
                sessionId: typeof objective.sessionId === 'number' ? objective.sessionId : undefined,
                role: 'assistant',
                content: `✅ **Objective validated: ${objective.name}**\n${result.reason}`,
            })
            db.objectives.update(objective.id, { lastReportedState: nextFingerprint })
            changes++
        }
    }

    return changes
}

export function auditFailedSchedules(agentId: number): number {
    const failedSchedules = (db.schedules?.select().all() || []).filter((s: any) => {
        const isForAgent = !s.agentId || s.agentId === agentId
        return isForAgent && s.status === 'failed'
    })

    let reported = 0
    for (const schedule of failedSchedules) {
        const fingerprint = getScheduleAuditFingerprint(schedule)
        if (schedule.lastHeartbeatAuditStatus === fingerprint) continue

        try {
            db.messages.insert({
                agentId,
                sessionId: schedule.sessionId,
                role: 'assistant',
                content: buildHeartbeatScheduleAlert(schedule),
            })
            db.schedules.update(schedule.id, {
                lastHeartbeatAuditStatus: fingerprint,
                lastHeartbeatAuditAt: Date.now(),
            })
            reported++
        } catch (err) {
            console.error('[heartbeat] failed to persist schedule audit alert:', err)
        }
    }

    return reported
}

export function normalizeHeartbeatPauseStateOnStartup(agentId: number = 1): boolean {
    const pausedRow = db.agentState.select().where({ agentId, key: 'heartbeat_paused' }).first();
    if (!pausedRow || pausedRow.value !== 'true') return false;

    const reason = getHeartbeatPauseReason(agentId);
    if (reason) return false;
    if (!hasQueuedHeartbeatWork(agentId)) return false;

    console.log('[heartbeat] Auto-resuming legacy paused state because queued work is waiting.');
    setHeartbeatPauseState(agentId, false, 'none');
    heartbeatStats.consecutiveFailures = 0;
    heartbeatStats.lastTickResult = 'pending';
    return true;
}

/** @internal — exposed for tests only */
export function _getFollowUpQueue(): FollowUp[] { return db.followUps.select().where({ status: 'pending' }).all() as FollowUp[]; }
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
    normalizeHeartbeatPauseStateOnStartup(1);
    // Run once on startup after a small delay, then adaptively
    setTimeout(async () => {
        await runHeartbeat();
        scheduleNext();
    }, 5000);
}

/** Resume heartbeat after unpause or circuit breaker reset */
export function resumeHeartbeat() {
    heartbeatStats.consecutiveFailures = 0;
    heartbeatStats.lastTickResult = 'pending';
    currentInterval = 60_000; // reset to default
    setHeartbeatPauseState(1, false, 'none');
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

        const auditedFailures = auditFailedSchedules(agent.id);
        const auditedObjectives = await auditPendingObjectives(agent.id);
        if (auditedFailures > 0 || auditedObjectives > 0) {
            heartbeatStats.lastTickAt = Date.now();
            heartbeatStats.lastTickResult = 'acted';
            heartbeatStats.lastToolCalls = [
                ...(auditedFailures > 0 ? [{ name: 'schedule_audit', result: `reported ${auditedFailures} failure(s)`, at: Date.now() }] : []),
                ...(auditedObjectives > 0 ? [{ name: 'objective_audit', result: `validated ${auditedObjectives} objective(s)`, at: Date.now() }] : []),
            ];
        }

        // Guard: skip if no API key is configured (prevents error spam)
        if (!hasApiKey()) {
            heartbeatStats.lastTickAt = Date.now();
            if (auditedFailures > 0 || auditedObjectives > 0) return;
            heartbeatStats.lastTickResult = 'skipped';
            heartbeatStats.totalSkips++;
            return;
        }

        // Circuit breaker: auto-pause after 5 consecutive failures
        if (heartbeatStats.consecutiveFailures >= 5) {
            console.error(`[heartbeat] Circuit breaker tripped — ${heartbeatStats.consecutiveFailures} consecutive failures. Auto-pausing.`);
            setHeartbeatPauseState(1, true, 'circuit_breaker');
            heartbeatStats.lastTickResult = 'paused';
            return;
        }

        // Check if there's actual work to do: pending objectives, active plugins, scheduled tasks, or follow-ups
        const pendingObjectives = db.objectives.select().where({ agentId: agent.id, status: 'pending' }).all();
        let activePlugins: any[] = [];
        let pendingSchedules: any[] = [];
        try { activePlugins = db.plugins?.select().where({ status: 'running' }).all() || []; } catch (e) { console.warn('[heartbeat] plugins query failed:', e); }
        try {
            pendingSchedules = (db.schedules?.select().all() || []).filter((s: any) => {
                const isForAgent = !s.agentId || s.agentId === agent.id;
                const isActiveStatus = s.status === 'pending' || s.status === 'running';
                return isForAgent && isActiveStatus;
            });
        } catch (e) { console.warn('[heartbeat] schedules query failed:', e); }

        // Drain ready follow-ups
        const followUps = drainFollowUps(agent.id);

        const hasWork = pendingObjectives.length > 0 || activePlugins.length > 0 || pendingSchedules.length > 0 || followUps.length > 0;

        if (!hasWork) {
            heartbeatStats.lastTickAt = Date.now();
            if (auditedFailures > 0 || auditedObjectives > 0) {
                heartbeatStats.lastTickResult = 'acted';
                return;
            }
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
        const heartbeatSessionId = pickHeartbeatSessionId(agent.id, pendingObjectives as any[], pendingSchedules as any[])

        const config = {
            model: agent.model || "gemini-2.5-flash",
            cwd: process.cwd(),
            skills: skillPaths.length > 0 ? skillPaths : undefined,
            maxIterations: 5,
            safeMode,
            tools: [createScheduleTool(agent.id, heartbeatSessionId)],
        };

        // Reuse the active session to maintain memory
        let session = agent.sessionId ? sessions.get(agent.sessionId) : undefined;
        if (!session) {
            session = new Session(config);
            sessions.set(session.id, session);
            db.agents.update(agent.id, { sessionId: session.id });
        }

        const messages = heartbeatSessionId
            ? db.messages.select().where({ agentId: agent.id, sessionId: heartbeatSessionId } as any).all()
            : db.messages.select().where({ agentId: agent.id }).all();
        if (messages.length > 200) {
            console.log(`[heartbeat] Agent ${agent.id} reached ${messages.length} messages. Triggering auto-pruning...`);
            const prunePrompt = "MEMORY PRUNING TICK: Your conversation history has exceeded 200 messages. You MUST immediately analyze all your previous interactions. Summarize your previous context into a memory artifact (e.g. using the setState tool under the key 'core_memory'), capturing ongoing state, preferences, and pending items. Once you have successfully saved it, reply EXACTLY with 'PRUNED'.";

            let pruneText = "";
            for await (const event of session.send(prunePrompt)) {
                if (event.type === 'thinking_delta') pruneText += (event as any).delta || '';
            }

            console.log(`[heartbeat] Agent ${agent.id} pruned response:`, pruneText.substring(0, 100));

            for (const m of messages) {
                try { db.messages.delete(m.id); } catch { }
            }
            for (const o of db.objectives.select().where({ agentId: agent.id }).all()) {
                try { db.objectives.delete(o.id); } catch { }
            }
            for (const f of db.files.select().where({ agentId: agent.id }).all()) {
                try { db.files.delete(f.id); } catch { }
            }

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
            const heartbeatAgent = new Agent({
                ...config,
                objectives: [{
                    name: 'heartbeat_tick',
                    description: 'Inspect the current Geeksy state, use tools when needed, and reply EXACTLY with IDLE when nothing needs attention.',
                    validate: (state) => ({ met: state.iteration >= 0, reason: 'Heartbeat response delivered' }),
                }],
            })

            const recentMessages = (heartbeatSessionId
                ? db.messages.select().where({ agentId: agent.id, sessionId: heartbeatSessionId } as any).orderBy('id', 'asc').all()
                : db.messages.select().where({ agentId: agent.id }).orderBy('id', 'asc').all()
            ).slice(-20)
            const input = [
                ...recentMessages.map((m: any) => ({ role: m.role, content: m.content })),
                { role: 'user' as const, content: prompt },
            ]

            for await (const event of heartbeatAgent.run(input)) {
                if (event.type === 'thinking_delta') {
                    fullText += (event as any).delta || '';
                }
                if (event.type === 'objective_check') {
                    const results = (event as any).results || []
                    for (const r of results) {
                        const existing = db.objectives.select().where({ agentId: agent.id, name: r.name }).first()
                        if (existing) {
                            db.objectives.update(existing.id, {
                                status: r.met ? 'complete' : 'failed',
                                result: r.reason || '',
                                lastValidatedAt: Date.now(),
                                lastReportedState: `${r.met ? 'complete' : 'failed'}:${r.reason || ''}`.slice(0, 500),
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
            if (!isHeartbeatChatNoise(withoutThoughts, toolCalls)) {
                db.messages.insert({ agentId: agent.id, sessionId: heartbeatSessionId, role: 'assistant', content: fullText });
            }
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
