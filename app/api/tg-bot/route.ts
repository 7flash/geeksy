import { db } from '../../lib/db'

export async function GET(req: Request) {
    const row = db.agentState.select().where({ agentId: 1, key: 'tg_bot_token' }).first()
    return Response.json({ token: row?.value || '' })
}

export async function POST(req: Request) {
    const { token } = await req.json() as { token: string }
    const row = db.agentState.select().where({ agentId: 1, key: 'tg_bot_token' }).first()
    if (row) {
        db.agentState.update(row.id, { value: token })
    } else {
        db.agentState.insert({ agentId: 1, key: 'tg_bot_token', value: token })
    }
    return Response.json({ success: true })
}
