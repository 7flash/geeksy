import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

let captureCoreMemory: typeof import('./route').POST
let db: typeof import('../../../lib/db').db

beforeAll(async () => {
    ;({ POST: captureCoreMemory } = await import('./route'))
    ;({ db } = await import('../../../lib/db'))
})

beforeEach(() => {
    try { (db as any).db.query('DELETE FROM agentState').run() } catch { }
    try { (db as any).db.query('DELETE FROM messages').run() } catch { }
    try { (db as any).db.query('DELETE FROM objectives').run() } catch { }
    try { (db as any).db.query('DELETE FROM schedules').run() } catch { }
    try { (db as any).db.query('DELETE FROM sessions').run() } catch { }
    try { (db as any).db.query('DELETE FROM agents').run() } catch { }
    try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Core Memory Agent', 'gemini') } catch { }
    try { (db as any).db.query('INSERT OR IGNORE INTO sessions (id, name, type, status, model, config, memory, messageCount, lastActiveAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(321, 'Core Memory Session', 'web', 'active', 'gemini', '{}', '{}', 0, Date.now()) } catch { }
})

describe('/api/agent-state/core-memory', () => {
    test('captures session-scoped core memory', async () => {
        db.messages.insert({ agentId: 1, sessionId: 321, role: 'user', content: 'tell me a joke every minute' } as any)
        db.messages.insert({ agentId: 1, sessionId: 321, role: 'assistant', content: 'I can schedule that.' } as any)
        db.objectives.insert({ agentId: 1, sessionId: 321, name: 'schedule_jokes', description: 'Create recurring jokes', type: 'task', status: 'pending' } as any)

        const res = await captureCoreMemory(new Request('http://localhost/api/agent-state/core-memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 1, sessionId: 321 }),
        }))

        expect(res.status).toBe(200)

        const summary = db.agentState.select().where({ agentId: 1, key: 'core_memory.session.321' } as any).first() as any
        const updated = db.agentState.select().where({ agentId: 1, key: 'core_memory_updated_at.session.321' } as any).first() as any

        expect(summary.value).toContain('tell me a joke every minute')
        expect(summary.value).toContain('Pending objectives: schedule_jokes')
        expect(updated.value).toBeDefined()
    })
})
