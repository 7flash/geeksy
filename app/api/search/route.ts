// app/api/search/route.ts — Global search across sessions and messages
import { db } from '../../lib/db'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    if (!q || q.length < 2) return Response.json({ results: [] })

    const limit = Math.min(Number(url.searchParams.get('limit') || 20), 50)

    interface SearchResult {
        type: 'session' | 'message'
        sessionId: number
        sessionName: string
        sessionType: string
        messageId?: number
        role?: string
        content: string  // snippet with match context
        matchedAt: number // timestamp or id for sorting
    }

    const results: SearchResult[] = []

    // 1. Search session names
    const sessions = db.sessions.select().all()
    for (const s of sessions) {
        if ((s.name || '').toLowerCase().includes(q)) {
            results.push({
                type: 'session',
                sessionId: s.id,
                sessionName: s.name,
                sessionType: s.type || 'web',
                content: s.name,
                matchedAt: s.lastActiveAt || s.id,
            })
        }
    }

    // 2. Search message content (scan all messages, cap results)
    if (results.length < limit) {
        const messages = db.messages.select().all()
        const sessionMap = new Map(sessions.map(s => [s.id, s]))

        for (const m of messages) {
            if (results.length >= limit) break
            const content = (m.content || '').toLowerCase()
            if (!content.includes(q)) continue

            const session = m.sessionId ? sessionMap.get(m.sessionId) : null
            const idx = content.indexOf(q)
            const start = Math.max(0, idx - 60)
            const end = Math.min(content.length, idx + q.length + 60)
            const snippet = (start > 0 ? '…' : '') +
                (m.content || '').substring(start, end) +
                (end < content.length ? '…' : '')

            results.push({
                type: 'message',
                sessionId: m.sessionId || 0,
                sessionName: session?.name || 'Unknown',
                sessionType: session?.type || 'web',
                messageId: m.id,
                role: m.role,
                content: snippet,
                matchedAt: m.id,
            })
        }
    }

    // Sort: sessions first, then messages by recency
    results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'session' ? -1 : 1
        return b.matchedAt - a.matchedAt
    })

    return Response.json({ results: results.slice(0, limit), query: q })
}
