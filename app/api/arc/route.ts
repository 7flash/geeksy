// app/api/arc/route.ts — ARC batch runner API, uses bgrun for background process management
import { handleRun, getProcess, getAllProcesses, isProcessRunning, terminateProcess, readFileTail } from 'bgrun'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

const SMART_AGENT_DIR = join(process.cwd(), '..', 'smart-agent')
const RESULTS_DIR = join(SMART_AGENT_DIR, 'arc-results')

/** GET /api/arc — get batch run status and results */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'status'

    if (action === 'status') {
        // Check if batch runner is active
        const processes = getAllProcesses()
        const arcProcess = processes.find((p: any) => p.name?.startsWith('arc-batch'))

        let state = null
        const statePath = join(RESULTS_DIR, 'state.json')
        if (existsSync(statePath)) {
            try { state = JSON.parse(readFileSync(statePath, 'utf-8')) } catch { }
        }

        return Response.json({
            running: arcProcess ? await isProcessRunning(arcProcess.pid) : false,
            process: arcProcess || null,
            state,
        })
    }

    if (action === 'results') {
        const statePath = join(RESULTS_DIR, 'state.json')
        if (!existsSync(statePath)) {
            return Response.json({ results: [], stats: null })
        }
        const state = JSON.parse(readFileSync(statePath, 'utf-8'))
        return Response.json({
            results: state.results || [],
            stats: state.stats || null,
        })
    }

    if (action === 'logs') {
        const processes = getAllProcesses()
        const arcProcess = processes.find((p: any) => p.name?.startsWith('arc-batch'))
        if (!arcProcess?.stdout_path) {
            return Response.json({ logs: '(no logs available)' })
        }
        const logs = readFileTail(arcProcess.stdout_path, 100)
        return Response.json({ logs })
    }

    if (action === 'puzzle') {
        const id = url.searchParams.get('id')
        if (!id) return Response.json({ error: 'Missing puzzle id' }, { status: 400 })
        const puzzlePath = join(RESULTS_DIR, `${id}.json`)
        if (!existsSync(puzzlePath)) {
            return Response.json({ error: 'Puzzle result not found' }, { status: 404 })
        }
        return Response.json(JSON.parse(readFileSync(puzzlePath, 'utf-8')))
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
}

/** POST /api/arc — start a batch run */
export async function POST(req: Request) {
    const body = await req.json() as {
        split?: string
        ids?: string[]
        concurrency?: number
        model?: string
        maxTurns?: number
        resume?: boolean
    }

    const split = body.split || 'training'
    const concurrency = body.concurrency || 1
    const model = body.model || 'gemini-2.5-flash'
    const maxTurns = body.maxTurns || 10
    const resume = body.resume || false
    const ids = body.ids?.join(',') || ''

    // Build command
    const parts = [
        'bun', 'run', 'src/arc-batch.ts',
        `--split`, split,
        `--concurrency`, String(concurrency),
        `--model`, model,
        `--max-turns`, String(maxTurns),
    ]

    if (ids) parts.push('--ids', ids)
    if (resume) parts.push('--resume')

    const name = `arc-batch-${Date.now()}`

    try {
        // Use bgrun programmatic API to spawn background process
        await handleRun({
            name,
            command: parts.join(' '),
            directory: SMART_AGENT_DIR,
            force: true,
        })

        return Response.json({
            ok: true,
            name,
            message: `ARC batch run started: ${ids ? ids.split(',').length + ' puzzles' : `all ${split}`}`,
        })
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 })
    }
}

/** DELETE /api/arc — stop a running batch */
export async function DELETE() {
    const processes = getAllProcesses()
    const arcProcesses = processes.filter((p: any) => p.name?.startsWith('arc-batch'))

    for (const proc of arcProcesses) {
        try {
            if (await isProcessRunning(proc.pid)) {
                await terminateProcess(proc.pid)
            }
        } catch { }
    }

    return Response.json({ ok: true, stopped: arcProcesses.length })
}
