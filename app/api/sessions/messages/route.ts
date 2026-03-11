// app/api/sessions/messages/route.ts — Session message retrieval API
import { db } from '../../../lib/db'

/**
 * GET /api/sessions/messages?sessionId=X          — all messages for session
 * GET /api/sessions/messages?sessionId=X&count=true — just message count
 * GET /api/sessions/messages?sessionId=X&offset=N  — messages after offset
 */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const sessionId = Number(url.searchParams.get('sessionId'))
    if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

    const countOnly = url.searchParams.get('count') === 'true'
    const offset = Number(url.searchParams.get('offset') || '0')

    // Get messages that belong to this session (by sessionId field)
    let allMessages = db.messages.select()
        .where({ sessionId })
        .orderBy('id', 'asc')
        .all()

    // Fallback: if no messages found with this sessionId,
    // check if there are orphan messages (agentId=1, no sessionId)
    // and auto-migrate them to the oldest session
    if (allMessages.length === 0) {
        const orphans = db.messages.select()
            .where({ agentId: 1 })
            .orderBy('id', 'asc')
            .all()
            .filter((m: any) => !m.sessionId)

        if (orphans.length > 0) {
            // Find the oldest session to claim orphans
            const allSessions = db.sessions.select().orderBy('id', 'asc').all()
            const oldestSession = allSessions[0]

            if (oldestSession && oldestSession.id === sessionId) {
                // Auto-migrate: tag these orphan messages with this session ID
                for (const msg of orphans) {
                    try {
                        db.messages.update(msg.id, { sessionId })
                    } catch { }
                }
                // Update session message count
                try {
                    db.sessions.update(sessionId, {
                        messageCount: orphans.length,
                        lastActiveAt: Date.now(),
                    })
                } catch { }
                allMessages = orphans
            }
        }
    }

    if (countOnly) {
        return Response.json({ count: allMessages.length })
    }

    if (offset > 0) {
        return Response.json(allMessages.slice(offset))
    }

    return Response.json(allMessages)
}
