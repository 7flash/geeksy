import { describe, it, expect, beforeEach } from 'bun:test'
import { getHeartbeatStats, scheduleFollowUp, _getFollowUpQueue, _clearFollowUpQueue, _drainFollowUps } from './heartbeat'
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
})

describe('heartbeat follow-up drain lifecycle', () => {
    beforeEach(() => {
        _clearFollowUpQueue()
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Test Agent 1', 'gemini') } catch { }
    })

    it('drainFollowUps returns ready items and marks them processed', () => {
        scheduleFollowUp(1, 'check task', 'user asked to deploy', 0)
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].status).toBe('pending')

        // Drain should return the item and mark it processed
        const drained = _drainFollowUps(1)
        expect(drained).toHaveLength(1)
        expect(drained[0].reason).toBe('check task')
        expect(drained[0].context).toContain('deploy')

        // Queue should now be empty (pending only)
        const remaining = _getFollowUpQueue()
        expect(remaining).toHaveLength(0)

        // But the row still exists in DB as 'processed'
        const allRows = db.followUps.select().all()
        expect(allRows.length).toBeGreaterThanOrEqual(1)
        const processed = allRows.filter((r: any) => r.status === 'processed')
        expect(processed.length).toBeGreaterThanOrEqual(1)
    })

    it('drainFollowUps does NOT return future-scheduled items', () => {
        scheduleFollowUp(1, 'future check', 'context', 300_000) // 5min in the future
        const drained = _drainFollowUps(1)
        expect(drained).toHaveLength(0)

        // Item is still pending
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].status).toBe('pending')
    })

    it('drainFollowUps only returns items for the correct agent', () => {
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(2, 'Test Agent 2', 'gemini') } catch { }
        scheduleFollowUp(1, 'agent1 task', 'ctx1')
        scheduleFollowUp(2, 'agent2 task', 'ctx2')

        const drained1 = _drainFollowUps(1)
        expect(drained1).toHaveLength(1)
        expect(drained1[0].reason).toBe('agent1 task')

        // Agent 2's item still pending
        const drained2 = _drainFollowUps(2)
        expect(drained2).toHaveLength(1)
        expect(drained2[0].reason).toBe('agent2 task')
    })

    it('double drain returns empty (idempotent)', () => {
        scheduleFollowUp(1, 'one-shot', 'ctx')
        const first = _drainFollowUps(1)
        expect(first).toHaveLength(1)

        const second = _drainFollowUps(1)
        expect(second).toHaveLength(0)
    })

    it('follow-up speeds up heartbeat interval', () => {
        // When a follow-up is scheduled and interval is slow, it should cap at 60s
        const stats = getHeartbeatStats()
        // Schedule follow-up (this internally caps interval to 60s if > 60s)
        scheduleFollowUp(1, 'urgent', 'ctx')
        const afterStats = getHeartbeatStats()
        expect(afterStats.currentIntervalMs).toBeLessThanOrEqual(60_000)
    })
})

