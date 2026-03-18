import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

let requestSecret: typeof import('./route').POST
let db: typeof import('../../../lib/db').db

beforeAll(async () => {
    ;({ POST: requestSecret } = await import('./route'))
    ;({ db } = await import('../../../lib/db'))
})

beforeEach(() => {
    try { (db as any).db.query('DELETE FROM messages').run() } catch { }
    try { (db as any).db.query('DELETE FROM sessions').run() } catch { }
    try { (db as any).db.query('DELETE FROM agents').run() } catch { }
    try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Secret Request Agent', 'gemini') } catch { }
    try { (db as any).db.query('INSERT OR IGNORE INTO sessions (id, name, type, status, model, config, memory, messageCount, lastActiveAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(999, 'Secret Request Session', 'web', 'active', 'gemini', '{}', '{}', 0, Date.now()) } catch { }
})

describe('/api/secrets/request', () => {
    test('inserts a secret request marker into the active conversation', async () => {
        const res = await requestSecret(new Request('http://localhost/api/secrets/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: 'DEMO_SECRET',
                label: 'Demo Secret',
                description: 'Used to preview the masked secret card.',
                agentId: 1,
                dbSessionId: 999,
            }),
        }))

        expect(res.status).toBe(200)

        const message = (db.messages.select().where({ agentId: 1, sessionId: 999 } as any).orderBy('id', 'desc').first() as any)
        expect(message.content).toContain('[[GEEKSY_SECRET_REQUEST]]')
        expect(message.content).toContain('DEMO_SECRET')
        expect(message.content).toContain('Demo Secret')

        const session = db.sessions.select().where({ id: 999 }).first() as any
        expect(session.messageCount).toBe(1)
    })
})
