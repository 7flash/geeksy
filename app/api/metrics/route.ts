// app/api/metrics/route.ts — Agent Dashboard Metrics endpoint
import { db } from '../../lib/db'
import { getHeartbeatStats } from '../../lib/heartbeat'

export async function GET(req: Request) {
    const heartbeat = getHeartbeatStats()
    const heartbeatPaused = db.agentState.select().where({ agentId: 1, key: 'heartbeat_paused' }).first()

    // Message count for global agent
    const messages = db.messages.select().where({ agentId: 1 }).all()
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    // Objectives
    const objectives = db.objectives.select().where({ agentId: 1 }).all()
    const completedObj = objectives.filter(o => o.status === 'completed' || o.status === 'complete')
    const pendingObj = objectives.filter(o => o.status === 'pending')
    const failedObj = objectives.filter(o => o.status === 'failed')

    // Schedules
    const schedules = db.schedules.select().all()
    const runningSchedules = schedules.filter(s => s.status === 'running')
    const pendingSchedules = schedules.filter(s => s.status === 'pending')
    const totalSuccess = schedules.reduce((sum, s) => sum + (s.successCount || 0), 0)
    const totalFail = schedules.reduce((sum, s) => sum + (s.failCount || 0), 0)

    // Plugins — with health probing
    const plugins = db.plugins.select().all()
    const runningPlugins = plugins.filter(p => p.status === 'running')

    // Probe running plugins for health
    const pluginHealth: Array<{
        id: number; name: string; status: string; port?: number;
        healthy?: boolean; responseMs?: number; error?: string;
    }> = []

    for (const p of plugins) {
        const entry: typeof pluginHealth[0] = {
            id: p.id, name: p.name, status: p.status, port: p.port || undefined,
        }

        if (p.status === 'running' && p.port) {
            const start = performance.now()
            try {
                const healthRes = await fetch(`http://localhost:${p.port}/health`, {
                    signal: AbortSignal.timeout(3000),
                })
                entry.responseMs = Math.round(performance.now() - start)
                entry.healthy = healthRes.ok
                if (!healthRes.ok) entry.error = `HTTP ${healthRes.status}`
            } catch (err: any) {
                entry.responseMs = Math.round(performance.now() - start)
                entry.healthy = false
                entry.error = err.message?.includes('timeout') ? 'timeout (3s)' : (err.message || 'unreachable')

                // Auto-update plugin status if unreachable
                try {
                    db.plugins.update(p.id, { status: 'error', error: entry.error })
                } catch { }
            }
        }

        pluginHealth.push(entry)
    }

    // Fallback: if db.plugins is empty, count skill .md files that came from plugin directories
    let pluginTotal = plugins.length
    let pluginRunning = runningPlugins.length
    let pluginHealthy = pluginHealth.filter(p => p.healthy).length

    if (plugins.length === 0) {
        try {
            const { resolve, join } = await import('path')
            const { readdirSync, readFileSync, existsSync } = await import('fs')
            const codeDir = resolve(process.cwd(), '..')
            const dirs = readdirSync(codeDir).filter(d => {
                for (const mf of ['geeksy-plugin.json', 'plugin.json']) {
                    if (existsSync(join(codeDir, d, mf))) return true
                }
                return false
            })
            pluginTotal = dirs.length
            pluginRunning = dirs.length
            pluginHealthy = dirs.length
            for (const d of dirs) {
                try {
                    const mPath = existsSync(join(codeDir, d, 'geeksy-plugin.json'))
                        ? join(codeDir, d, 'geeksy-plugin.json')
                        : join(codeDir, d, 'plugin.json')
                    const manifest = JSON.parse(readFileSync(mPath, 'utf-8'))
                    pluginHealth.push({
                        id: 0,
                        name: manifest.displayName || manifest.name || d,
                        status: 'running',
                        healthy: true,
                    })
                } catch { }
            }
        } catch { }
    }



    // Agent count
    const agents = db.agents.select().all()

    // Files touched
    const files = db.files.select().where({ agentId: 1 }).all()

    // Uptime
    const uptimeMs = heartbeat.uptimeMs || 0

    return Response.json({
        heartbeat: {
            paused: heartbeatPaused?.value === 'true',
            totalTicks: heartbeat.totalTicks || 0,
            totalSkips: heartbeat.totalSkips || 0,
            lastTickResult: heartbeat.lastTickResult || 'pending',
            consecutiveFailures: heartbeat.consecutiveFailures || 0,
            isRunning: heartbeat.isRunning || false,
            intervalMs: heartbeat.currentIntervalMs || 60000,
            lastToolCalls: heartbeat.lastToolCalls || [],
        },
        messages: {
            total: messages.length,
            user: userMessages.length,
            assistant: assistantMessages.length,
        },
        objectives: {
            total: objectives.length,
            completed: completedObj.length,
            pending: pendingObj.length,
            failed: failedObj.length,
        },
        schedules: {
            total: schedules.length,
            running: runningSchedules.length,
            pending: pendingSchedules.length,
            totalSuccess,
            totalFail,
        },
        plugins: {
            total: pluginTotal,
            running: pluginRunning,
            healthy: pluginHealthy,
            items: pluginHealth,
        },
        agents: agents.length,
        files: files.length,
        uptimeMin: Math.floor(uptimeMs / 60000),
    })
}
