// app/api/follow-ups/route.ts
import { db } from '../../lib/db'

export async function GET() {
    const followUps = db.followUps.select().all()

    // Sort by scheduledAt descending
    followUps.sort((a: any, b: any) => b.scheduledAt - a.scheduledAt)

    return Response.json({
        ok: true,
        followUps: followUps.map((fu: any) => ({
            id: fu.id,
            reason: fu.reason,
            context: fu.context,
            scheduledAt: fu.scheduledAt,
            status: fu.status,
            agentId: fu.agentId,
        }))
    });
}

export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (id) {
        db.followUps.delete(parseInt(id, 10))
    } else {
        const followUps = db.followUps.select().all()
        for (const fu of followUps) {
            db.followUps.delete(fu.id!)
        }
    }

    return Response.json({ ok: true })
}

