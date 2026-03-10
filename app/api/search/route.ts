// app/api/search/route.ts — Full-text search across message history
import { db } from '../../lib/db'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)

    if (!q || q.length < 2) {
        return Response.json({ results: [], query: q || '' })
    }

    try {
        // Search messages using LIKE (SQLite doesn't have FTS by default)
        // Case-insensitive search with wildcard matching
        const allMessages = db.messages.select().all()

        const results = allMessages
            .filter(m => m.content.toLowerCase().includes(q.toLowerCase()))
            .slice(0, limit)
            .map(m => {
                const content = m.content
                const idx = content.toLowerCase().indexOf(q.toLowerCase())
                // Extract context snippet around match (±80 chars)
                const start = Math.max(0, idx - 80)
                const end = Math.min(content.length, idx + q.length + 80)
                const snippet = (start > 0 ? '…' : '') +
                    content.substring(start, end) +
                    (end < content.length ? '…' : '')

                return {
                    id: m.id,
                    role: m.role,
                    agentId: m.agentId,
                    snippet,
                    matchIndex: idx,
                    createdAt: (m as any).createdAt,
                }
            })

        return Response.json({ results, query: q, total: results.length })
    } catch (err: any) {
        return Response.json({ results: [], query: q, error: err.message }, { status: 500 })
    }
}
