// app/api/agent-state/route.ts — Key-value state persistence for agent scripts
// Scripts call these endpoints to store/retrieve state (e.g., used jokes list)
import { db } from '../../lib/db'

/** GET /api/agent-state?agentId=X — list all state entries for an agent */
/** GET /api/agent-state?agentId=X&key=Y — get a single state entry */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const agentId = url.searchParams.get('agentId')
    if (!agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })

    const key = url.searchParams.get('key')
    if (key) {
        const row = db.agentState.select()
            .where({ agentId: Number(agentId), key })
            .first()
        if (!row) return Response.json({ agentId: Number(agentId), key, value: null })
        return Response.json({ agentId: row.agentId, key: row.key, value: row.value })
    }

    const rows = db.agentState.select()
        .where({ agentId: Number(agentId) })
        .all()
    return Response.json(rows.map(r => ({
        id: r.id,
        agentId: r.agentId,
        key: r.key,
        value: r.value,
    })))
}

/** POST /api/agent-state — upsert a state entry { agentId, key, value } */
export async function POST(req: Request) {
    const body = await req.json() as { agentId: number; key: string; value: string }
    if (!body.agentId || !body.key) {
        return Response.json({ error: 'Missing agentId or key' }, { status: 400 })
    }

    const existing = db.agentState.select()
        .where({ agentId: body.agentId, key: body.key })
        .first()

    if (existing) {
        db.agentState.update(existing.id, { value: body.value })
        return Response.json({ id: existing.id, agentId: body.agentId, key: body.key, value: body.value, updated: true })
    }

    const row = db.agentState.insert({
        agentId: body.agentId,
        key: body.key,
        value: body.value,
    })
    return Response.json({ id: row.id, agentId: body.agentId, key: body.key, value: body.value, created: true })
}

/** DELETE /api/agent-state?agentId=X&key=Y — delete a specific key */
/** DELETE /api/agent-state?agentId=X — delete all state for an agent */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const agentId = url.searchParams.get('agentId')
    const key = url.searchParams.get('key')
    if (!agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })

    if (key) {
        const row = db.agentState.select()
            .where({ agentId: Number(agentId), key })
            .first()
        if (row) db.agentState.delete(row.id)
        return Response.json({ ok: true })
    }

    // Delete all state for agent
    const rows = db.agentState.select()
        .where({ agentId: Number(agentId) })
        .all()
    for (const r of rows) db.agentState.delete(r.id)
    return Response.json({ ok: true, deleted: rows.length })
}
