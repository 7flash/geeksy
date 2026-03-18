import { describe, it, expect, beforeEach } from 'bun:test'
import { auditFailedSchedules, auditPendingObjectives, buildCoreMemorySummary, getCoreMemoryKey, getCoreMemoryUpdatedAtKey, getHeartbeatStats, getHeartbeatPauseReason, isHeartbeatChatNoise, normalizeHeartbeatPauseStateOnStartup, pickHeartbeatSessionId, scheduleFollowUp, _getFollowUpQueue, _clearFollowUpQueue } from './heartbeat'
import { db } from './db'

describe('heartbeat stats', () => {
    it('returns initial stats shape', () => {
        const stats = getHeartbeatStats()
        expect(stats).toHaveProperty('lastTickAt')
        expect(stats).toHaveProperty('lastTickResult')
        expect(stats).toHaveProperty('consecutiveFailures')
        expect(stats).toHaveProperty('totalTicks')
        expect(stats).toHaveProperty('totalSkips')
        expect(stats).toHaveProperty('startedAt')
        expect(stats).toHaveProperty('lastToolCalls')
        expect(stats).toHaveProperty('isRunning')
        expect(stats).toHaveProperty('uptimeMs')
        expect(stats).toHaveProperty('currentIntervalMs')
        expect(stats).toHaveProperty('followUpQueueLength')
    })

    it('starts with pending result', () => {
        const stats = getHeartbeatStats()
        expect(stats.lastTickResult).toBe('pending')
    })

    it('starts with zero ticks', () => {
        const stats = getHeartbeatStats()
        expect(stats.totalTicks).toBe(0)
        expect(stats.totalSkips).toBe(0)
        expect(stats.consecutiveFailures).toBe(0)
    })

    it('is not running initially', () => {
        const stats = getHeartbeatStats()
        expect(stats.isRunning).toBe(false)
    })

    it('has positive uptime', () => {
        const stats = getHeartbeatStats()
        expect(stats.uptimeMs).toBeGreaterThan(0)
    })

    it('starts with default 60s interval', () => {
        const stats = getHeartbeatStats()
        expect(stats.currentIntervalMs).toBe(60_000)
    })

    it('starts with empty tool calls', () => {
        const stats = getHeartbeatStats()
        expect(stats.lastToolCalls).toEqual([])
    })
})

describe('heartbeat core memory keys', () => {
    it('uses session-scoped keys when a session id is present', () => {
        expect(getCoreMemoryKey(16)).toBe('core_memory.session.16')
        expect(getCoreMemoryUpdatedAtKey(16)).toBe('core_memory_updated_at.session.16')
    })

    it('falls back to agent-wide keys when no session id is present', () => {
        expect(getCoreMemoryKey()).toBe('core_memory')
        expect(getCoreMemoryUpdatedAtKey()).toBe('core_memory_updated_at')
    })
})

describe('heartbeat core memory summary', () => {
    it('builds a deterministic summary with recent topics and extras', () => {
        const summary = buildCoreMemorySummary(
            [
                { role: 'user', content: 'tell me a new joke each minute' },
                { role: 'assistant', content: 'I will schedule that for you.' },
                { role: 'user', content: 'also keep failures visible' },
            ],
            {
                pendingObjectives: [{ name: 'schedule_jokes', description: 'Create recurring joke automation' }],
                pendingSchedules: [{ name: 'joke-sender-task', type: 'interval', status: 'pending' }],
                followUps: [{ reason: 'verify automation', context: 'make sure new jokes keep arriving' }],
            },
        )

        expect(summary).toContain('Recent user topics:')
        expect(summary).toContain('tell me a new joke each minute')
        expect(summary).toContain('Pending objectives: schedule_jokes')
        expect(summary).toContain('Active schedules: joke-sender-task (interval, pending)')
        expect(summary).toContain('Queued follow-ups: verify automation')
    })
})

describe('heartbeat follow-up system', () => {
    beforeEach(() => {
        _clearFollowUpQueue()
        try { (db as any).db.query('DELETE FROM agentState').run() } catch { }
        try { (db as any).db.query('DELETE FROM objectives').run() } catch { }
        try { (db as any).db.query('DELETE FROM schedules').run() } catch { }
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Test Agent 1', 'gemini') } catch { }
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(2, 'Test Agent 2', 'gemini') } catch { }
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(42, 'Test Agent 42', 'gemini') } catch { }
    })

    it('scheduleFollowUp adds to queue', () => {
        scheduleFollowUp(1, 'check satisfaction', 'user asked about deploy')
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].reason).toBe('check satisfaction')
        expect(queue[0].context).toBe('user asked about deploy')
        const rawFu = (db as any).db.query('SELECT agentId FROM followUps ORDER BY id DESC LIMIT 1').get()
        expect(rawFu.agentId).toBe(1)
    })

    it('scheduleFollowUp with delay sets future scheduledAt', () => {
        const before = Date.now()
        scheduleFollowUp(1, 'delayed check', 'context', 60_000)
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].scheduledAt).toBeGreaterThanOrEqual(before + 60_000)
    })

    it('scheduleFollowUp with 0 delay is immediate', () => {
        const before = Date.now()
        scheduleFollowUp(1, 'immediate check', 'context', 0)
        const queue = _getFollowUpQueue()
        expect(queue[0].scheduledAt).toBeLessThanOrEqual(before + 100)
    })

    it('multiple follow-ups accumulate', () => {
        scheduleFollowUp(1, 'first', 'ctx1')
        scheduleFollowUp(1, 'second', 'ctx2')
        scheduleFollowUp(2, 'third', 'ctx3')
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(3)
    })

    it('stats reflect queue length', () => {
        scheduleFollowUp(1, 'check', 'ctx')
        scheduleFollowUp(1, 'check2', 'ctx2')
        const stats = getHeartbeatStats()
        expect(stats.followUpQueueLength).toBe(2)
    })

    it('_clearFollowUpQueue empties the queue', () => {
        scheduleFollowUp(1, 'check', 'ctx')
        expect(_getFollowUpQueue()).toHaveLength(1)
        _clearFollowUpQueue()
        expect(_getFollowUpQueue()).toHaveLength(0)
        expect(getHeartbeatStats().followUpQueueLength).toBe(0)
    })

    it('_getFollowUpQueue returns a copy (not a reference)', () => {
        scheduleFollowUp(1, 'check', 'ctx')
        const queue = _getFollowUpQueue()
        queue.pop() // mutate the copy
        expect(_getFollowUpQueue()).toHaveLength(1) // original unchanged
    })

    it('follow-ups have correct structure', () => {
        scheduleFollowUp(42, 'verify task', 'user asked: "deploy to prod"', 120_000)
        const fu = _getFollowUpQueue()[0]
        expect(fu).toHaveProperty('reason')
        expect(fu).toHaveProperty('context')
        expect(fu).toHaveProperty('scheduledAt')
        const rawFu = (db as any).db.query('SELECT agentId FROM followUps ORDER BY id DESC LIMIT 1').get()
        expect(rawFu.agentId).toBe(42)
        expect(fu.reason).toBe('verify task')
        expect(fu.context).toContain('deploy to prod')
    })

    it('default delay is 0 (next tick)', () => {
        const before = Date.now()
        scheduleFollowUp(1, 'default delay', 'ctx')
        const fu = _getFollowUpQueue()[0]
        // scheduledAt should be approximately now (within 50ms)
        expect(fu.scheduledAt).toBeGreaterThanOrEqual(before)
        expect(fu.scheduledAt).toBeLessThanOrEqual(before + 50)
    })

    it('auto-resumes legacy paused heartbeat when queued work exists', () => {
        ;(db as any).db.query('INSERT INTO agentState (agentId, key, value) VALUES (?, ?, ?)').run(1, 'heartbeat_paused', 'true')
        scheduleFollowUp(1, 'queued work', 'ctx')

        const resumed = normalizeHeartbeatPauseStateOnStartup(1)
        const pausedRow = (db as any).db.query('SELECT value FROM agentState WHERE agentId = ? AND key = ?').get(1, 'heartbeat_paused')

        expect(resumed).toBe(true)
        expect(pausedRow.value).toBe('false')
        expect(getHeartbeatPauseReason(1)).toBe('none')
    })

    it('does not auto-resume manual paused heartbeat', () => {
        ;(db as any).db.query('INSERT INTO agentState (agentId, key, value) VALUES (?, ?, ?)').run(1, 'heartbeat_paused', 'true')
        ;(db as any).db.query('INSERT INTO agentState (agentId, key, value) VALUES (?, ?, ?)').run(1, 'heartbeat_pause_reason', 'manual')
        scheduleFollowUp(1, 'queued work', 'ctx')

        const resumed = normalizeHeartbeatPauseStateOnStartup(1)
        const pausedRow = (db as any).db.query('SELECT value FROM agentState WHERE agentId = ? AND key = ?').get(1, 'heartbeat_paused')

        expect(resumed).toBe(false)
        expect(pausedRow.value).toBe('true')
        expect(getHeartbeatPauseReason(1)).toBe('manual')
    })

    it('auditFailedSchedules reports failed schedules once', () => {
        const row = db.schedules.insert({
            name: 'Broken job',
            type: 'once',
            status: 'failed',
            agentId: 1,
            sessionId: 99,
            lastError: 'stderr exploded',
            lastOutput: 'partial output',
            failOnStderr: true,
            expectedOutput: 'DONE',
            lastRun: 123456,
        } as any)

        const first = auditFailedSchedules(1)
        const second = auditFailedSchedules(1)
        const message = (db as any).db.query('SELECT content FROM messages WHERE sessionId = ? ORDER BY id DESC LIMIT 1').get(99)
        const schedule = db.schedules.select().where({ id: row.id }).first() as any

        expect(first).toBe(1)
        expect(second).toBe(0)
        expect(message.content).toContain('Heartbeat noticed schedule failure: Broken job')
        expect(message.content).toContain('stderr exploded')
        expect(schedule.lastHeartbeatAuditStatus).toBeDefined()
        expect(schedule.lastHeartbeatAuditAt).toBeGreaterThan(0)
    })

    it('auditPendingObjectives validates file_exists objectives and reports completion once', async () => {
        await Bun.write('heartbeat-objective.txt', 'OBJECTIVE_OK')
        const row = db.objectives.insert({
            agentId: 1,
            sessionId: 77,
            name: 'check_file',
            description: 'ensure file exists',
            type: 'file_exists',
            params: JSON.stringify({ path: 'heartbeat-objective.txt', contains: 'OBJECTIVE_OK' }),
            status: 'pending',
        } as any)

        const first = await auditPendingObjectives(1)
        const second = await auditPendingObjectives(1)
        const message = (db as any).db.query('SELECT content FROM messages WHERE sessionId = ? ORDER BY id DESC LIMIT 1').get(77)
        const objective = db.objectives.select().where({ id: row.id }).first() as any

        expect(first).toBe(1)
        expect(second).toBe(0)
        expect(objective.status).toBe('complete')
        expect(objective.result).toContain('File exists')
        expect(message.content).toContain('Objective validated: check_file')
        try { await Bun.file('heartbeat-objective.txt').delete() } catch { }
    })

    it('pickHeartbeatSessionId prefers the newest pending objective session over older schedule sessions', () => {
        const sessionId = pickHeartbeatSessionId(
            1,
            [
                { id: 10, sessionId: 9, createdAt: 1000, updatedAt: 1000 },
                { id: 11, sessionId: 16, createdAt: 2000, updatedAt: 2000 },
            ],
            [
                { id: 20, agentId: 1, sessionId: 9, lastRun: 3000 },
            ],
        )

        expect(sessionId).toBe(16)
    })

    it('isHeartbeatChatNoise suppresses schedule list json chatter', () => {
        const noisy = isHeartbeatChatNoise(
            '```json\n[{"tool":"schedule","params":{"action":"list"}}]\n```',
            [{ name: 'schedule', at: Date.now(), result: '[object Object]' }],
        )

        expect(noisy).toBe(true)
    })

    it('isHeartbeatChatNoise suppresses schedule create json chatter too', () => {
        const noisy = isHeartbeatChatNoise(
            '```json\n[{"tool":"schedule","params":{"action":"create","name":"joke-sender-task"}}]\n```',
            [{ name: 'schedule', at: Date.now(), result: 'Task scheduled' }],
        )

        expect(noisy).toBe(true)
    })

    it('isHeartbeatChatNoise suppresses mixed tool-only json chatter', () => {
        const noisy = isHeartbeatChatNoise(
            '```json\n[{"tool":"schedule","params":{"action":"list"}}, {"tool":"exec","params":{"command":"curl http://localhost:3738/api/status"}}]\n```',
            [
                { name: 'schedule', at: Date.now(), result: '[object Object]' },
                { name: 'exec', at: Date.now(), result: '{"plugin":"ok"}' },
            ],
        )

        expect(noisy).toBe(true)
    })

    it('isHeartbeatChatNoise suppresses low-signal schedule boilerplate summaries', () => {
        const noisy = isHeartbeatChatNoise(
            'Checked plugins and schedule health. Nothing needs attention.',
            [{ name: 'schedule', at: Date.now(), result: '[object Object]' }],
        )

        expect(noisy).toBe(true)
    })

    it('isHeartbeatChatNoise suppresses json-plus-boilerplate chatter', () => {
        const noisy = isHeartbeatChatNoise(
            '```json\n[{"tool":"schedule","params":{"action":"list"}}]\n```\nChecked schedules. Nothing needs attention.',
            [{ name: 'schedule', at: Date.now(), result: '[object Object]' }],
        )

        expect(noisy).toBe(true)
    })

    it('isHeartbeatChatNoise keeps meaningful text summaries', () => {
        const noisy = isHeartbeatChatNoise(
            'Schedule audit complete. Joke sender failed twice because the target script printed stderr.',
            [{ name: 'schedule', at: Date.now(), result: '[object Object]' }],
        )

        expect(noisy).toBe(false)
    })
})

