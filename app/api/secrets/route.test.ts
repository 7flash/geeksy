import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

let GETRoute: typeof import('./route').GET
let POSTRoute: typeof import('./route').POST
let DELETERoute: typeof import('./route').DELETE
let submitSecret: typeof import('./submit/route').POST
let db: typeof import('../../lib/db').db
let getSecret: typeof import('../../lib/secrets').getSecret

const tempHome = `${process.cwd()}/tmp/secrets-test-${Date.now()}`

beforeAll(async () => {
    process.env.GEEKSY_HOME = tempHome
    await Bun.write(`${tempHome}/.init`, 'ok')

    ;({ GET: GETRoute, POST: POSTRoute, DELETE: DELETERoute } = await import('./route'))
    ;({ POST: submitSecret } = await import('./submit/route'))
    ;({ db } = await import('../../lib/db'))
    ;({ getSecret } = await import('../../lib/secrets'))
})

beforeEach(() => {
    try { (db as any).db.query('DELETE FROM messages').run() } catch { }
    try { (db as any).db.query('DELETE FROM agents').run() } catch { }
    try { (db as any).db.query('INSERT OR IGNORE INTO agents (id, name, model) VALUES (?, ?, ?)').run(1, 'Secret Test Agent', 'gemini') } catch { }
})

describe('/api/secrets', () => {
    test('stores secrets but GET by key only returns metadata', async () => {
        const saveReq = new Request('http://localhost/api/secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'OPENAI_API_KEY', value: 'super-secret', description: 'api key' }),
        })
        const saveRes = await POSTRoute(saveReq)
        expect(saveRes.status).toBe(200)

        const getRes = await GETRoute(new Request('http://localhost/api/secrets?key=OPENAI_API_KEY'))
        const data = await getRes.json() as any

        expect(data.key).toBe('OPENAI_API_KEY')
        expect(data.exists).toBe(true)
        expect(data.hasValue).toBe(true)
        expect(data.description).toBe('api key')
        expect(JSON.stringify(data)).not.toContain('super-secret')
    })

    test('delete removes stored secret', async () => {
        await POSTRoute(new Request('http://localhost/api/secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'DELETE_ME', value: 'bye' }),
        }))

        const deleteRes = await DELETERoute(new Request('http://localhost/api/secrets?key=DELETE_ME', { method: 'DELETE' }))
        expect(deleteRes.status).toBe(200)

        const getRes = await GETRoute(new Request('http://localhost/api/secrets?key=DELETE_ME'))
        const data = await getRes.json() as any
        expect(data.exists).toBe(false)
    })
})

describe('/api/secrets/submit', () => {
    test('stores secret and writes only sanitized chat message', async () => {
        const res = await submitSecret(new Request('http://localhost/api/secrets/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'TELEGRAM_TOKEN', value: '123:abc', agentId: 1 }),
        }))
        expect(res.status).toBe(200)

        const stored = await getSecret('TELEGRAM_TOKEN')
        expect(stored?.value).toBe('123:abc')

        const rows = db.messages.select().where({ agentId: 1 }).orderBy('id', 'asc').all() as any[]
        expect(rows.length).toBe(1)
        expect(rows[0].content).toBe('[Secret provided: TELEGRAM_TOKEN]')
        expect(rows[0].content).not.toContain('123:abc')
    })
})
