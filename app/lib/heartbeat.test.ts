import { describe, it, expect } from 'bun:test'
import { getHeartbeatStats } from './heartbeat'

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
