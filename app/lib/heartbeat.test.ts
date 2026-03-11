import { describe, it, expect, beforeEach } from 'bun:test'
import { getHeartbeatStats, scheduleFollowUp, _getFollowUpQueue, _clearFollowUpQueue } from './heartbeat'

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
    })

    it('scheduleFollowUp adds to queue', () => {
        scheduleFollowUp(1, 'check satisfaction', 'user asked about deploy')
        const queue = _getFollowUpQueue()
        expect(queue).toHaveLength(1)
        expect(queue[0].reason).toBe('check satisfaction')
        expect(queue[0].context).toBe('user asked about deploy')
        expect(queue[0].agentId).toBe(1)
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
        expect(fu).toHaveProperty('agentId')
        expect(fu.agentId).toBe(42)
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

