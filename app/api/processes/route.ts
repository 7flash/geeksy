// app/api/processes/route.ts — bgrun process list + management
// Proxies to bgrun CLI for process listing, stop, restart

// Fields that are safe to expose to the client
const SAFE_FIELDS = ['name', 'status', 'pid', 'command', 'directory', 'startedAt', 'uptime', 'port', 'memory', 'runtime', 'group', 'running', 'timestamp', 'ports']

function sanitizeProcess(p: any) {
    const safe: any = {}
    for (const key of SAFE_FIELDS) {
        if (p[key] !== undefined) safe[key] = p[key]
    }
    // Normalize status — bgrun uses 'running'/'stopped'/'crashed'
    // bgr API uses 'running: true/false' boolean
    if (p.running === true) {
        safe.status = 'running'
    } else if (p.running === false) {
        safe.status = 'stopped'
    } else if (typeof safe.status === 'string') {
        safe.status = safe.status.toLowerCase()
    }
    // If we have a PID and status is not explicitly set, check if process is alive
    if (safe.pid && !safe.status) {
        safe.status = 'running'
    }
    // Normalize startedAt from timestamp
    if (!safe.startedAt && p.timestamp) {
        safe.startedAt = p.timestamp
    }
    // Normalize port from ports array
    if (!safe.port && Array.isArray(p.ports) && p.ports.length > 0) {
        safe.port = p.ports[0]
    }
    return safe
}

async function getProcessList(): Promise<any[]> {
    // Try bgr HTTP API first — provides richer data (memory, timestamp, port, group)
    const ports = [3001, 3002]
    const bgrPort = process.env.BGR_PORT
    if (bgrPort && !ports.includes(Number(bgrPort))) ports.unshift(Number(bgrPort))

    for (const port of ports) {
        try {
            const res = await fetch(`http://localhost:${port}/api/processes`, {
                signal: AbortSignal.timeout(1500),
            })
            if (res.ok) {
                const data = await res.json()
                return (Array.isArray(data) ? data : data.processes || []).map(sanitizeProcess)
            }
        } catch { }
    }

    // Fallback: bgrun --json CLI (less data but always available)
    try {
        const proc = Bun.spawn(['bgrun', '--json'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited
        const stdout = await new Response(proc.stdout).text()
        const parsed = JSON.parse(stdout)
        return (Array.isArray(parsed) ? parsed : []).map(sanitizeProcess)
    } catch { }

    return []
}

/** GET /api/processes — list all bgrun processes */
export async function GET() {
    const processes = await getProcessList()
    return Response.json(processes)
}

/** DELETE /api/processes — stop a process */
export async function DELETE(req: Request) {
    const { name } = await req.json()
    if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

    try {
        const proc = Bun.spawn(['bgrun', '--stop', name], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited
        return Response.json({ ok: true })
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}

/** PUT /api/processes — restart a process */
export async function PUT(req: Request) {
    const { name } = await req.json()
    if (!name) return Response.json({ error: 'Missing name' }, { status: 400 })

    try {
        const proc = Bun.spawn(['bgrun', '--restart', name], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited
        return Response.json({ ok: true })
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
