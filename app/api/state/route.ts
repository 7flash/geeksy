// app/api/state/route.ts — Per-agent state API backed by SQLite
import { db } from '../../lib/db'

/** GET /api/state?agentId=x — full state for an agent */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const agentId = Number(url.searchParams.get('agentId'))
    if (!agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })

    const messages = db.messages.select().where({ agentId }).orderBy('id', 'asc').all()
    const objectives = db.objectives.select().where({ agentId }).orderBy('id', 'asc').all()
    const files = db.files.select().where({ agentId }).orderBy('id', 'asc').all()

    return Response.json({ messages, objectives, files })
}

/** POST /api/state — save message, objective, or file */
export async function POST(req: Request) {
    const body = await req.json() as {
        agentId: number
        type: 'message' | 'objective' | 'file'
        data: any
    }

    if (!body.agentId || !body.type) {
        return Response.json({ error: 'Missing agentId or type' }, { status: 400 })
    }

    switch (body.type) {
        case 'message':
            db.messages.insert({ agentId: body.agentId, ...body.data })
            break
        case 'objective':
            db.objectives.insert({ agentId: body.agentId, ...body.data })
            break
        case 'file':
            // Upsert — don't duplicate file entries
            db.files.upsert(
                { agentId: body.agentId, path: body.data.path },
                { agentId: body.agentId, path: body.data.path, action: body.data.action || 'read' },
            )
            break
    }

    return Response.json({ ok: true })
}

/** PUT /api/state — update objectives (bulk) */
export async function PUT(req: Request) {
    const body = await req.json() as {
        agentId: number
        objectives?: Array<{ name: string; status: string; result?: string }>
    }

    if (!body.agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 })

    if (body.objectives) {
        for (const o of body.objectives) {
            const existing = db.objectives.select().where({ agentId: body.agentId, name: o.name }).first()
            if (existing) {
                db.objectives.update(existing.id, { status: o.status, result: o.result })
            }
        }
    }

    return Response.json({ ok: true })
}
