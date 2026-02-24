// app/api/agents/route.ts — Agent CRUD backed by SQLite
import { db } from '../../lib/db'

/** GET /api/agents — list all agents */
export async function GET() {
    const agents = db.agents.select().orderBy('id', 'asc').all()
    return Response.json(agents)
}

/** POST /api/agents — create agent */
export async function POST(req: Request) {
    const body = await req.json() as { name?: string; model?: string }
    const agent = db.agents.insert({
        name: body.name || 'New Agent',
        model: body.model || 'gemini-2.5-flash',
    })
    return Response.json(agent)
}

/** PUT /api/agents?id=x — update agent */
export async function PUT(req: Request) {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    const agent = db.agents.select().where({ id }).first()
    if (!agent) return Response.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    db.agents.update(id, body)
    return Response.json({ ...agent, ...body })
}

/** DELETE /api/agents?id=x — delete agent (cascades messages, objectives, files) */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    db.agents.delete(id) // cascade removes messages, objectives, files
    return Response.json({ ok: true })
}
