// app/lib/schedule-tool.ts — Schedule tool for the agent
// Creates scheduled tasks that execute scripts or chat messages on intervals
import { db } from './db'
import { scheduler, getNextCronRun } from '../api/schedule/scheduler'
import type { Tool, ToolResult } from 'smart-agent-ai'

export function parseIntervalStr(str: string): number {
    const lower = str.toLowerCase().trim()
    const match = lower.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)?$/i)
    if (!match) return 60
    const num = parseInt(match[1])
    const unit = (match[2] || 's').charAt(0).toLowerCase()
    if (unit === 'h') return num * 3600
    if (unit === 'm') return num * 60
    return num
}

export function createScheduleTool(agentId?: number, sessionId?: number): Tool {
    return {
        name: 'schedule',
        description: `Create, list, or cancel scheduled tasks.
You can schedule either:
- scriptPath: run a Bun script file
- message: send a prompt back into Geeksy later
Supported types: once, interval, cron.
Use interval for repeating tasks like every 5m.
Use cron for calendar schedules like "0 9 * * *".
Schedules are scoped to the current agent (agentId=${agentId})${sessionId ? ` and session (sessionId=${sessionId})` : ''}.`,
        parameters: {
            action: { type: 'string', description: 'One of: create, list, cancel', required: true },
            name: { type: 'string', description: 'Name of the scheduled task (for create/cancel)', required: false },
            scriptPath: { type: 'string', description: 'Path to the Bun script file to execute later', required: false },
            message: { type: 'string', description: 'A prompt/message for Geeksy to run later as a scheduled chat task', required: false },
            interval: { type: 'string', description: 'How often to run interval tasks, e.g. "60s", "5m", "1h"', required: false },
            cron: { type: 'string', description: 'Cron expression for cron tasks, e.g. "0 9 * * *"', required: false },
            timeoutSec: { type: 'number', description: 'Max seconds each run may take before timing out. Default: 60 for scripts, 30-60 for chat.', required: false },
            maxRetries: { type: 'number', description: 'How many retries to allow after a failed run. Default: 0.', required: false },
            retryDelaySec: { type: 'number', description: 'Base retry delay in seconds before exponential backoff. Default: 2.', required: false },
            expectedOutput: { type: 'string', description: 'Optional text that must appear in stdout/output or the run is marked failed.', required: false },
            failOnStderr: { type: 'boolean', description: 'If true, any stderr output from a script marks the run failed.', required: false },
            type: { type: 'string', description: 'Task type: "once", "interval", or "cron". Default: once', required: false },
            id: { type: 'string', description: 'Task ID (for cancel)', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const action = params.action as string

            if (action === 'list') {
                const rows = db.schedules.select().all()
                    .filter((r: any) => !agentId || r.agentId === agentId)
                const tasks = rows.map((r: any) => ({
                    id: String(r.id),
                    name: r.name,
                    type: r.type,
                    status: r.status,
                    scriptPath: r.scriptPath,
                    message: r.message,
                    intervalSec: r.intervalSec,
                    cron: r.cron,
                    nextRun: r.nextRun,
                    timeoutSec: r.timeoutSec,
                    expectedOutput: r.expectedOutput,
                    failOnStderr: r.failOnStderr,
                    lastRun: r.lastRun ? new Date(r.lastRun).toLocaleTimeString() : null,
                    lastOutput: r.lastOutput?.substring(0, 200),
                    completedCount: r.completedCount || 0,
                }))
                return {
                    success: true,
                    output: tasks.length > 0
                        ? `${tasks.length} scheduled tasks:\n${tasks.map(t => `  - [${t.id}] "${t.name}" (${t.type}, ${t.status})${t.scriptPath ? ` script=${t.scriptPath}` : ''}${t.message ? ` message=${JSON.stringify(t.message).slice(0, 120)}` : ''}${t.intervalSec ? ` every ${t.intervalSec}s` : ''}${t.cron ? ` cron=${t.cron}` : ''}${t.timeoutSec ? ` timeout=${t.timeoutSec}s` : ''}${t.expectedOutput ? ` expect=${JSON.stringify(t.expectedOutput)}` : ''}${t.failOnStderr ? ` failOnStderr=true` : ''}${t.nextRun ? ` next=${new Date(t.nextRun).toLocaleString()}` : ''}${t.completedCount ? ` — ran ${t.completedCount}×` : ''}${t.lastOutput ? `\n    Last output: ${t.lastOutput}` : ''}`).join('\n')}`
                        : 'No scheduled tasks for this agent.',
                }
            }

            if (action === 'cancel') {
                const id = params.id ? parseInt(params.id) : null
                const name = params.name as string | undefined
                if (!id && !name) return { success: false, output: '', error: 'Provide id or name to cancel.' }

                const rows = db.schedules.select().all()
                const match = rows.find((r: any) =>
                    (id && r.id === id) || (name && r.name?.toLowerCase() === name?.toLowerCase())
                )
                if (!match) return { success: false, output: '', error: `Task not found: ${id || name}` }

                db.schedules.update(match.id, { status: 'cancelled' })
                return { success: true, output: `Cancelled task "${match.name}" (id=${match.id})` }
            }

            if (action === 'create') {
                const name = params.name as string
                const scriptPath = params.scriptPath as string | undefined
                const message = params.message as string | undefined
                const type = ((params.type as string) || 'once').toLowerCase()

                if (!name) {
                    return { success: false, output: '', error: 'name is required for create.' }
                }
                if (!scriptPath && !message) {
                    return { success: false, output: '', error: 'Provide either scriptPath or message for create.' }
                }
                if (scriptPath && message) {
                    return { success: false, output: '', error: 'Use either scriptPath or message, not both.' }
                }
                if (!['once', 'interval', 'cron'].includes(type)) {
                    return { success: false, output: '', error: `Unsupported type: ${type}. Use once, interval, or cron.` }
                }

                if (scriptPath) {
                    const file = Bun.file(scriptPath)
                    if (!await file.exists()) {
                        return { success: false, output: '', error: `Script file not found: ${scriptPath}. Create the file first.` }
                    }
                }

                const intervalSec = type === 'interval'
                    ? parseIntervalStr(String(params.interval || '60s'))
                    : undefined

                const timeoutSecRaw = Number(params.timeoutSec)
                const timeoutSec = Number.isFinite(timeoutSecRaw) && timeoutSecRaw > 0 ? Math.round(timeoutSecRaw) : 60
                const maxRetriesRaw = Number(params.maxRetries)
                const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? Math.round(maxRetriesRaw) : 0
                const retryDelaySecRaw = Number(params.retryDelaySec)
                const retryDelayMs = Number.isFinite(retryDelaySecRaw) && retryDelaySecRaw > 0 ? Math.round(retryDelaySecRaw * 1000) : 2000
                const expectedOutput = typeof params.expectedOutput === 'string' && params.expectedOutput.trim()
                    ? params.expectedOutput.trim()
                    : undefined
                const failOnStderr = params.failOnStderr === true || params.failOnStderr === 'true'

                const cron = type === 'cron' ? String(params.cron || '').trim() : undefined
                if (type === 'cron' && !cron) {
                    return { success: false, output: '', error: 'cron is required when type="cron".' }
                }

                let nextRun: number | undefined
                if (type === 'interval') nextRun = Date.now()
                else if (type === 'cron' && cron) nextRun = getNextCronRun(cron)

                const inserted = db.schedules.insert({
                    name,
                    type: type as any,
                    status: 'pending',
                    scriptPath,
                    message,
                    agentId: agentId ?? undefined,
                    sessionId: sessionId ?? undefined,
                    intervalSec,
                    cron,
                    timeoutSec,
                    expectedOutput,
                    failOnStderr,
                    nextRun,
                    completedCount: 0,
                    maxRetries,
                    retryDelayMs,
                })

                scheduler.start()

                const target = scriptPath
                    ? `Script: ${scriptPath}\nThe scheduler will run "bun run ${scriptPath}" with AGENT_ID=${agentId} and STATE_URL injected.`
                    : `Message: ${message}`

                const policy = [
                    `Timeout: ${timeoutSec}s`,
                    maxRetries > 0 ? `Retries: ${maxRetries} (base delay ${Math.round(retryDelayMs / 1000)}s)` : 'Retries: none',
                    expectedOutput ? `Expected output: ${JSON.stringify(expectedOutput)}` : null,
                    failOnStderr ? 'Fail on stderr: yes' : null,
                ].filter(Boolean).join('\n')

                return {
                    success: true,
                    output: `Task scheduled! ID=${inserted.id}, name="${name}", type="${type}"${intervalSec ? `, every ${intervalSec}s` : ''}${cron ? `, cron="${cron}"` : ''}\n${target}\n${policy}\nAgent: ${agentId || 'global'}${sessionId != null ? `\nSession: ${sessionId}` : ''}`,
                }
            }

            return { success: false, output: '', error: `Unknown action: ${action}. Use create, list, or cancel.` }
        },
    }
}
