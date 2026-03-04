// app/api/processes/route.ts — bgrun process list + management
// Proxies to bgrun's HTTP API to list, stop, restart processes

const BGRUN_API = 'http://localhost:3001'

/** GET /api/processes — list all bgrun processes */
export async function GET() {
    try {
        const res = await fetch(`${BGRUN_API}/api/processes`, {
            signal: AbortSignal.timeout(3000),
        })
        if (res.ok) {
            const data = await res.json()
            return Response.json(data)
        }
    } catch { }

    // Fallback: try to parse bgrun CLI output
    try {
        const proc = Bun.spawn(['bgrun', '--json'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited
        const stdout = await new Response(proc.stdout).text()
        try {
            return Response.json(JSON.parse(stdout))
        } catch { }
    } catch { }

    return Response.json([])
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
