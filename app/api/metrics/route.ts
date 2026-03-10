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
            lastTickResult: heartbeat.lastTickResult || 'pending',
            consecutiveFailures: heartbeat.consecutiveFailures || 0,
            isRunning: heartbeat.isRunning || false,
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
            total: plugins.length,
            running: runningPlugins.length,
            healthy: pluginHealth.filter(p => p.healthy).length,
            items: pluginHealth,
        },
        agents: agents.length,
        files: files.length,
        uptimeMin: Math.floor(uptimeMs / 60000),
    })
}
