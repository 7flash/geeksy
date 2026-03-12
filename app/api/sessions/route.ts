// app/api/sessions/route.ts — Session CRUD API
import { db } from '../../lib/db'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (id) {
        const session = db.sessions.select().where({ id: Number(id) }).first()
        if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })
        const messageCount = db.messages.select().where({ sessionId: Number(id) }).count()
        return Response.json({ ...session, messageCount })
    }

    // List all sessions, most recent first
    const sessions = db.sessions.select().all()
    const enriched = sessions.map((s: any) => ({
        ...s,
        messageCount: db.messages.select().where({ sessionId: s.id }).count(),
    }))
    enriched.sort((a: any, b: any) => (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id))
    return Response.json(enriched)
}

export async function POST(req: Request) {
    const body = await req.json()
    const { name, type, model, systemPrompt, config } = body

    const session = db.sessions.insert({
        name: name || (type === 'telegram_bot' ? 'Telegram Bot' : 'Web Session'),
        type: type || 'web',
        model: model || 'gemini-2.5-flash',
        systemPrompt: systemPrompt || '',
        config: config ? JSON.stringify(config) : '{}',
        lastActiveAt: Date.now(),
    })

    return Response.json({ ok: true, session })
}

export async function PUT(req: Request) {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) return Response.json({ error: 'Missing session id' }, { status: 400 })

    const session = db.sessions.select().where({ id: Number(id) }).first()
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })

    const updateData: Record<string, any> = {}
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.model !== undefined) updateData.model = updates.model
    if (updates.systemPrompt !== undefined) updateData.systemPrompt = updates.systemPrompt
    if (updates.config !== undefined) updateData.config = typeof updates.config === 'string' ? updates.config : JSON.stringify(updates.config)
    if (updates.memory !== undefined) updateData.memory = typeof updates.memory === 'string' ? updates.memory : JSON.stringify(updates.memory)

    db.sessions.update(Number(id), updateData)

    return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const cleanup = url.searchParams.get('cleanup')

    // Bulk cleanup: remove sessions with 0 messages
    if (cleanup === 'empty') {
        const sessions = db.sessions.select().all()
        let deleted = 0
        for (const s of sessions) {
            const msgCount = db.messages.select().where({ sessionId: s.id }).count()
            if (msgCount === 0) {
                db.sessions.delete(s.id)
                deleted++
            }
        }
        return Response.json({ ok: true, deleted })
    }

    if (!id) return Response.json({ error: 'Missing session id' }, { status: 400 })

    // Delete session messages first
    const messages = db.messages.select().where({ sessionId: Number(id) }).all()
    for (const msg of messages) {
        db.messages.delete(msg.id)
    }

    db.sessions.delete(Number(id))
    return Response.json({ ok: true })
}
