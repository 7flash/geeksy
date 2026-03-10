import { db } from '../../lib/db'
import { getHeartbeatStats, resumeHeartbeat } from '../../lib/heartbeat'

export async function GET(req: Request) {
    const row = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first()
    const stats = getHeartbeatStats()
    return Response.json({ paused: row?.value === 'true', ...stats })
}

export async function POST(req: Request) {
    const { paused } = await req.json() as { paused: boolean }
    const row = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first()
    if (row) {
        db.agentState.update(row.id, { value: paused ? 'true' : 'false' })
    } else {
        db.agentState.insert({ agentId: 1, key: 'heartbeat_paused', value: paused ? 'true' : 'false' })
    }

    // Resume scheduling loop when unpausing (critical after circuit breaker trips)
    if (!paused) {
        resumeHeartbeat();
    }

    return Response.json({ success: true, paused })
}
