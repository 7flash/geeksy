import { db } from '../../../lib/db'
import { upsertSecret } from '../../../lib/secrets'
import { sessions, getBoundSmartSessionId } from '../../../lib/session-store'

export async function POST(req: Request) {
    const body = await req.json() as {
        key?: string
        value?: string
        description?: string
        agentId?: number
        dbSessionId?: number
    }

    const key = body.key?.trim()
    const value = body.value || ''
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 })
    if (!value) return Response.json({ error: 'Missing value' }, { status: 400 })

    const saved = await upsertSecret(key, value, body.description)

    if (body.agentId) {
        db.messages.insert({
            agentId: body.agentId,
            sessionId: body.dbSessionId,
            role: 'user',
            content: `[Secret provided: ${saved.key}]`,
        })

        if (body.dbSessionId) {
            try {
                const dbSession = db.sessions.select().where({ id: body.dbSessionId }).first()
                if (dbSession) {
                    db.sessions.update(body.dbSessionId, {
                        messageCount: (dbSession.messageCount || 0) + 1,
                        lastActiveAt: Date.now(),
                    })
                }
            } catch { }
        }
    }

    const smartSessionId = getBoundSmartSessionId(body.dbSessionId)
    const session = smartSessionId ? sessions.get(smartSessionId) : null

    if (session && body.agentId) {
        queueMicrotask(async () => {
            let assistantText = ''
            try {
                for await (const event of session.send(`The user securely provided the secret ${saved.key}. Use the get_secret tool if you need its value. Continue from where you left off without asking for that secret again. Never print the secret value.`)) {
                    if (event.type === 'thinking_delta') assistantText += (event as any).delta || ''
                }
                const text = assistantText.trim()
                if (text) {
                    db.messages.insert({
                        agentId: body.agentId!,
                        sessionId: body.dbSessionId,
                        role: 'assistant',
                        content: text,
                    })
                    if (body.dbSessionId) {
                        try {
                            const dbSession = db.sessions.select().where({ id: body.dbSessionId }).first()
                            if (dbSession) {
                                db.sessions.update(body.dbSessionId, {
                                    messageCount: (dbSession.messageCount || 0) + 1,
                                    lastActiveAt: Date.now(),
                                })
                            }
                        } catch { }
                    }
                }
            } catch (error: any) {
                db.messages.insert({
                    agentId: body.agentId!,
                    sessionId: body.dbSessionId,
                    role: 'assistant',
                    content: `I saved ${saved.key}, but I hit an error continuing automatically: ${error?.message || 'unknown error'}`,
                })
            }
        })
    }

    return Response.json({ ok: true, key: saved.key, updatedAt: saved.updatedAt })
}
