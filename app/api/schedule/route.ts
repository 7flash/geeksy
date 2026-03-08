// app/api/schedule/route.ts — Schedule API with sequential task runner
import { db } from '../../lib/db'
import { scheduler, setServerPort } from './scheduler'

// Auto-detect server port from first API request
let portDetected = false
function detectPort(req: Request) {
    if (portDetected) return
    try {
        const url = new URL(req.url)
        const port = parseInt(url.port)
        if (port) {
            setServerPort(port)
            portDetected = true
        }
    } catch { }
}

/** GET /api/schedule — list all scheduled tasks */
export async function GET(req: Request) {
    detectPort(req)
    const rows = db.schedules.select().all()
    const tasks = rows.map(r => ({
        id: String(r.id),
        name: r.name,
        type: r.type,
        status: r.status,
        agentId: r.agentId,
        message: r.message,
        scriptPath: r.scriptPath,
        intervalSec: r.intervalSec,
        nextRun: r.nextRun,
        lastRun: r.lastRun,
        lastError: r.lastError,
        lastOutput: r.lastOutput,
        progress: {
            completed: r.completedCount || 0,
            total: r.totalCount || 1,
            currentTask: r.currentTask,
        },
        tasks: r.tasks ? JSON.parse(r.tasks) : undefined,
    }))
    return Response.json(tasks)
}

/** POST /api/schedule — create a scheduled task */
export async function POST(req: Request) {
    detectPort(req)
    const body = await req.json() as {
        name: string
        type: 'sequential' | 'interval' | 'once'
        agentId?: number
        message?: string
        scriptPath?: string
        tasks?: Array<{ name: string; message: string }>
        intervalSec?: number
    }

    if (!body.name) return Response.json({ error: 'Missing name' }, { status: 400 })

    const totalCount = body.tasks?.length || 1
    const tasksJson = body.tasks
        ? JSON.stringify(body.tasks.map((t, i) => ({
            id: `task-${i}`,
            name: t.name,
            message: t.message,
            status: 'pending',
        })))
        : undefined

    const row = db.schedules.insert({
        name: body.name,
        type: body.type || 'once',
        status: 'pending',
        agentId: body.agentId,
        message: body.message,
        scriptPath: body.scriptPath,
        tasks: tasksJson,
        intervalSec: body.intervalSec,
        nextRun: body.type === 'interval' ? Date.now() : undefined,
        totalCount,
        completedCount: 0,
    })

    // Start the scheduler if it's not already running
    scheduler.start()

    return Response.json({ id: String(row.id), status: 'pending' })
}

/** DELETE /api/schedule?id=xxx — cancel a scheduled task */
export async function DELETE(req: Request) {
    detectPort(req)
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

    const row = db.schedules.select().where({ id: Number(id) }).first()
    if (!row) return Response.json({ error: "Not found" }, { status: 404 })

    db.schedules.update(Number(id), { status: 'cancelled' })
    return Response.json({ ok: true })
}
