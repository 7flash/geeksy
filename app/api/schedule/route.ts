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
    const url = new URL(req.url)
    const sessionId = Number(url.searchParams.get('sessionId') || '0') || null
    const rows = (sessionId
        ? db.schedules.select().all().filter((r: any) => r.sessionId === sessionId)
        : db.schedules.select().all())
    const tasks = rows.map(r => ({
        id: String(r.id),
        name: r.name,
        type: r.type,
        status: r.status,
        agentId: r.agentId,
        sessionId: (r as any).sessionId,
        message: r.message,
        scriptPath: r.scriptPath,
        intervalSec: r.intervalSec,
        cron: (r as any).cron,
        nextRun: r.nextRun,
        lastRun: r.lastRun,
        lastError: r.lastError,
        lastOutput: r.lastOutput,
        progress: {
            completed: r.completedCount || 0,
            total: r.totalCount || 1,
            currentTask: r.currentTask,
        },
        retry: {
            count: r.retryCount || 0,
            max: r.maxRetries || 0,
        },
        metrics: {
            lastDurationMs: r.lastDurationMs || 0,
            successCount: r.successCount || 0,
            failCount: r.failCount || 0,
        },
        tasks: r.tasks ? JSON.parse(r.tasks) : undefined,
    }))

    // Aggregate stats
    const totalSuccess = rows.reduce((s, r) => s + (r.successCount || 0), 0)
    const totalFail = rows.reduce((s, r) => s + (r.failCount || 0), 0)
    const avgDuration = rows.filter(r => r.lastDurationMs).length > 0
        ? Math.round(rows.reduce((s, r) => s + (r.lastDurationMs || 0), 0) / rows.filter(r => r.lastDurationMs).length)
        : 0

    return Response.json({ tasks, stats: { totalSuccess, totalFail, avgDurationMs: avgDuration } })
}

/** POST /api/schedule — create a scheduled task */
export async function POST(req: Request) {
    detectPort(req)
    const body = await req.json() as {
        name: string
        type: 'sequential' | 'interval' | 'once' | 'cron'
        agentId?: number
        sessionId?: number
        message?: string
        scriptPath?: string
        tasks?: Array<{ name: string; message: string }>
        intervalSec?: number
        cron?: string
        maxRetries?: number
        retryDelayMs?: number
    }

    if (!body.name) return Response.json({ error: 'Missing name' }, { status: 400 })
    if (body.type === 'cron' && !body.cron) return Response.json({ error: 'Missing cron expression' }, { status: 400 })

    const totalCount = body.tasks?.length || 1
    const tasksJson = body.tasks
        ? JSON.stringify(body.tasks.map((t, i) => ({
            id: `task-${i}`,
            name: t.name,
            message: t.message,
            status: 'pending',
        })))
        : undefined

    // Calculate initial nextRun
    let nextRun: number | undefined
    if (body.type === 'interval') nextRun = Date.now()
    else if (body.type === 'cron' && body.cron) {
        const { getNextCronRun } = await import('./scheduler')
        nextRun = getNextCronRun(body.cron)
    }

    const row = db.schedules.insert({
        name: body.name,
        type: body.type || 'once',
        status: 'pending',
        agentId: body.agentId,
        sessionId: body.sessionId,
        message: body.message,
        scriptPath: body.scriptPath,
        tasks: tasksJson,
        intervalSec: body.intervalSec,
        cron: body.cron,
        nextRun,
        totalCount,
        completedCount: 0,
        maxRetries: body.maxRetries || 0,
        retryDelayMs: body.retryDelayMs || 2000,
    })

    // Start the scheduler if it's not already running
    scheduler.start()

    return Response.json({ id: String(row.id), status: 'pending', nextRun })
}

/** DELETE /api/schedule?id=xxx — cancel a scheduled task */
export async function DELETE(req: Request) {
    detectPort(req)
    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const sessionId = Number(url.searchParams.get('sessionId') || '0') || null
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

    const row = db.schedules.select().where({ id: Number(id) }).first()
    if (!row) return Response.json({ error: "Not found" }, { status: 404 })
    if (sessionId && (row as any).sessionId !== sessionId) return Response.json({ error: "Not found" }, { status: 404 })

    db.schedules.update(Number(id), { status: 'cancelled' })
    return Response.json({ ok: true })
}
