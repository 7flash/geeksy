import { db } from '../../../lib/db'
import { createSecretRequestMarker } from '../../../lib/secrets'

export async function POST(req: Request) {
    const body = await req.json() as {
        key?: string
        label?: string
        description?: string
        agentId?: number
        dbSessionId?: number
    }

    const key = body.key?.trim()
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 })
    if (!body.agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })
    if (!body.dbSessionId) return Response.json({ error: 'Missing dbSessionId' }, { status: 400 })

    const content = createSecretRequestMarker({
        key,
        label: body.label?.trim() || key,
        description: body.description?.trim() || '',
    })

    db.messages.insert({
        agentId: body.agentId,
        sessionId: body.dbSessionId,
        role: 'assistant',
        content,
    })

    try {
        const dbSession = db.sessions.select().where({ id: body.dbSessionId }).first()
        if (dbSession) {
            db.sessions.update(body.dbSessionId, {
                messageCount: (dbSession.messageCount || 0) + 1,
                lastActiveAt: Date.now(),
            })
        }
    } catch { }

    return Response.json({ ok: true, key })
}
