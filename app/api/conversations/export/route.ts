// app/api/conversations/export/route.ts — Export a session as readable markdown or JSON
import { db } from '../../../lib/db'

/**
 * GET /api/conversations/export?sessionId=1&format=md
 * Formats: md (default), json
 */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const sessionId = Number(url.searchParams.get('sessionId'))
    const format = url.searchParams.get('format') || 'md'

    if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

    const session = db.sessions.select().where({ id: sessionId }).first()
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })

    const messages = db.messages.select()
        .where({ sessionId })
        .orderBy('id', 'asc')
        .all()

    if (format === 'json') {
        return new Response(JSON.stringify({ session, messages, exportedAt: new Date().toISOString() }, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="conversation-${sessionId}-${new Date().toISOString().slice(0, 10)}.json"`,
            }
        })
    }

    // Markdown format
    const title = (session as any).title || `Session #${sessionId}`
    const lines: string[] = [
        `# ${title}`,
        `> Exported ${new Date().toLocaleString()} · ${messages.length} messages`,
        '',
    ]

    for (const msg of messages) {
        const role = (msg as any).role === 'user' ? '👤 You' : '🤖 Assistant'
        const time = (msg as any).createdAt
            ? new Date((msg as any).createdAt).toLocaleTimeString()
            : ''
        lines.push(`## ${role}${time ? ` (${time})` : ''}`)
        lines.push('')
        lines.push((msg as any).content || '_[empty]_')
        lines.push('')
        lines.push('---')
        lines.push('')
    }

    const md = lines.join('\n')
    return new Response(md, {
        headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="conversation-${sessionId}-${new Date().toISOString().slice(0, 10)}.md"`,
        }
    })
}
