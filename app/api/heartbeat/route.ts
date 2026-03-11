import { db } from '../../lib/db'
import { getHeartbeatStats, resumeHeartbeat, scheduleFollowUp } from '../../lib/heartbeat'

export async function GET(req: Request) {
    const row = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first()
    const stats = getHeartbeatStats()
    return Response.json({ paused: row?.value === 'true', ...stats })
}

export async function POST(req: Request) {
    const body = await req.json() as { paused?: boolean; followUp?: { reason: string; context: string; delayMs?: number } }

    // Handle follow-up scheduling
    if (body.followUp) {
        scheduleFollowUp(
            1, // global agent
            body.followUp.reason,
            body.followUp.context,
            body.followUp.delayMs || 0,
        );
        return Response.json({ success: true, scheduled: body.followUp.reason })
    }

    // Handle pause/unpause
    if (body.paused !== undefined) {
        const row = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first()
        if (row) {
            db.agentState.update(row.id, { value: body.paused ? 'true' : 'false' })
        } else {
            db.agentState.insert({ agentId: 1, key: 'heartbeat_paused', value: body.paused ? 'true' : 'false' })
        }

        // Resume scheduling loop when unpausing (critical after circuit breaker trips)
        if (!body.paused) {
            resumeHeartbeat();
        }

        return Response.json({ success: true, paused: body.paused })
    }

    return Response.json({ error: 'Must provide "paused" or "followUp" in body' }, { status: 400 })
}
