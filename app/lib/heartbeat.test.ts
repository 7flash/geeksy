import { describe, it, expect, beforeEach } from 'bun:test'
import { auditFailedSchedules, getHeartbeatStats, getHeartbeatPauseReason, normalizeHeartbeatPauseStateOnStartup, scheduleFollowUp, _getFollowUpQueue, _clearFollowUpQueue } from './heartbeat'
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
})

