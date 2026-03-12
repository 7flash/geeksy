import { describe, it, expect, beforeEach } from 'bun:test'
import { GET, DELETE } from './route'
import { db } from '../../lib/db'

describe('follow-ups API', () => {
    beforeEach(() => {
        try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Test Agent 1', 'gemini') } catch { }

        const followUps = db.followUps.select().all()
        for (const fu of followUps) {
            db.followUps.delete(fu.id!)
        }
    })

    it('GET returns empty array initially', async () => {
        const res = await GET(new Request('http://localhost/api/follow-ups'))
        const body = await res.json()
        expect(body.ok).toBe(true)
        expect(body.followUps).toHaveLength(0)
    })

    it('GET returns sorted follow-ups', async () => {
        db.followUps.insert({ agentId: 1, reason: 'r1', context: 'c1', scheduledAt: 100 })
        db.followUps.insert({ agentId: 1, reason: 'r2', context: 'c2', scheduledAt: 300 })
        db.followUps.insert({ agentId: 1, reason: 'r3', context: 'c3', scheduledAt: 200 })

        const res = await GET(new Request('http://localhost/api/follow-ups'))
        const body = await res.json()

        expect(body.followUps).toHaveLength(3)
        // Descending order expected
        expect(body.followUps[0].reason).toBe('r2') // 300
        expect(body.followUps[1].reason).toBe('r3') // 200
        expect(body.followUps[2].reason).toBe('r1') // 100
    })

    it('DELETE clears all follow-ups if no id provided', async () => {
        db.followUps.insert({ agentId: 1, reason: 'r1', context: 'c1', scheduledAt: 100 })
        db.followUps.insert({ agentId: 1, reason: 'r2', context: 'c2', scheduledAt: 200 })

        await DELETE(new Request('http://localhost/api/follow-ups'))

        const stored = db.followUps.select().all()
        expect(stored).toHaveLength(0)
    })

    it('DELETE removes a specific follow-up id', async () => {
        const id1 = db.followUps.insert({ agentId: 1, reason: 'r1', context: 'c1', scheduledAt: 100 }).id!
        const id2 = db.followUps.insert({ agentId: 1, reason: 'r2', context: 'c2', scheduledAt: 200 }).id!

        await DELETE(new Request(`http://localhost/api/follow-ups?id=${id1}`))

        const stored = db.followUps.select().all()
        expect(stored).toHaveLength(1)
        expect(stored[0].id).toBe(id2)
    })
})
