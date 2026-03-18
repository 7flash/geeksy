import { db } from '../../../lib/db'
import { buildCoreMemorySummary, getCoreMemoryKey, getCoreMemoryUpdatedAtKey } from '../../../lib/heartbeat'

export async function POST(req: Request) {
    const body = await req.json() as { agentId?: number; sessionId?: number }
    const agentId = Number(body.agentId || 0)
    const sessionId = Number(body.sessionId || 0)

    if (!agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })
    if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

    const messages = db.messages.select().where({ agentId, sessionId } as any).orderBy('id', 'asc').all() as any[]
    const pendingObjectives = db.objectives.select().where({ agentId, sessionId, status: 'pending' } as any).orderBy('id', 'asc').all() as any[]
    const pendingSchedules = (db.schedules.select().all() as any[]).filter((s) => s.agentId === agentId && s.sessionId === sessionId && (s.status === 'pending' || s.status === 'running'))

    const summary = buildCoreMemorySummary(messages.map((m) => ({ role: m.role, content: m.content })), {
        pendingObjectives,
        pendingSchedules,
        followUps: [],
    })

    const key = getCoreMemoryKey(sessionId)
    const updatedAtKey = getCoreMemoryUpdatedAtKey(sessionId)

    db.agentState.upsert(
        { agentId, key } as any,
        { agentId, key, value: summary },
    )
    db.agentState.upsert(
        { agentId, key: updatedAtKey } as any,
        { agentId, key: updatedAtKey, value: String(Date.now()) },
    )

    return Response.json({ ok: true, key, updatedAtKey, sessionId })
}
