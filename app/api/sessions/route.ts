// app/api/sessions/route.ts — Session CRUD API
import { db } from '../../lib/db'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (id) {
        const session = db.sessions.select().where({ id: Number(id) }).first()
        if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })
        return Response.json(session)
    }

    // List all sessions, most recent first
    const sessions = db.sessions.select().all()
    sessions.sort((a: any, b: any) => (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id))
    return Response.json(sessions)
}

export async function POST(req: Request) {
    const url = new URL(req.url)

    // POST /api/sessions?action=auto-rename — bulk rename generic sessions
    if (url.searchParams.get('action') === 'auto-rename') {
        const sessions = db.sessions.select().all()
        const genericNames = ['New Conversation', 'Web Session', 'Conversation']
        let renamed = 0
        for (const s of sessions) {
            if (!genericNames.includes(s.name)) continue
            // Find first user message in this session
            const firstMsg = db.messages.select()
                .where({ sessionId: s.id, role: 'user' } as any)
                .orderBy('id', 'asc')
                .first()
            if (firstMsg?.content) {
                const name = deriveSessionName(firstMsg.content)
                db.sessions.update(s.id, { name })
                renamed++
            }
        }
        return Response.json({ ok: true, renamed })
    }

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

/** Derive a short conversation title from the first user message */
function deriveSessionName(message: string): string {
    let text = message
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[A-Z]:\\[\w\\/.]+/g, '')
        .replace(/\/[\w/.-]+/g, '')
        .trim()

    const firstLine = text.split(/[.\n!?]/)[0]?.trim() || text
    if (firstLine.length <= 45) return firstLine || 'Conversation'
    const truncated = firstLine.slice(0, 45).replace(/\s+\S*$/, '')
    return (truncated || firstLine.slice(0, 40)) + '…'
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
    if (!id) return Response.json({ error: 'Missing session id' }, { status: 400 })

    // Delete session messages first
    const messages = db.messages.select().where({ sessionId: Number(id) }).all()
    for (const msg of messages) {
        db.messages.delete(msg.id)
    }

    db.sessions.delete(Number(id))
    return Response.json({ ok: true })
}
