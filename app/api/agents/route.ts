// app/api/agents/route.ts — Agent management API stub
// (database was removed — returns in-memory stubs)

interface AgentRecord {
    id: number
    name: string
    model?: string
}

const agents = new Map<number, AgentRecord>()
let nextId = 1

/** GET /api/agents — list all agents */
export async function GET() {
    return Response.json([...agents.values()])
}

/** POST /api/agents — create agent */
export async function POST(req: Request) {
    const body = await req.json() as { name?: string; model?: string }
    const agent: AgentRecord = { id: nextId++, name: body.name || 'New Agent', model: body.model }
    agents.set(agent.id, agent)
    return Response.json(agent)
}

/** PUT /api/agents?id=x — update agent */
export async function PUT(req: Request) {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    const agent = agents.get(id)
    if (!agent) return Response.json({ error: 'Not found' }, { status: 404 })

    const body = await req.json()
    Object.assign(agent, body)
    return Response.json(agent)
}

/** DELETE /api/agents?id=x — delete agent */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    agents.delete(id)
    return Response.json({ ok: true })
}
