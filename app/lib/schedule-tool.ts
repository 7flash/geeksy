// app/lib/schedule-tool.ts — Schedule tool for the agent
// Creates scheduled tasks that execute scripts or chat messages on intervals
import { db } from './db'
import { scheduler } from '../api/schedule/scheduler'
import type { Tool, ToolResult } from 'smart-agent-ai'

function parseIntervalStr(str: string): number {
    const lower = str.toLowerCase().trim()
    const match = lower.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)?$/i)
    if (!match) return 60
    const num = parseInt(match[1])
    const unit = (match[2] || 's').charAt(0).toLowerCase()
    if (unit === 'h') return num * 3600
    if (unit === 'm') return num * 60
    return num
}

export function createScheduleTool(agentId?: number): Tool {
    return {
        name: 'schedule',
        description: `Create, list, or cancel scheduled tasks that run scripts on intervals.
Use action="create" with scriptPath to schedule a script file for execution.
The scheduler runs "bun run <scriptPath>" with env vars AGENT_ID and STATE_URL injected.
Scripts can persist state via STATE_URL (GET/POST to /api/agent-state).
Schedules are scoped to the current agent (agentId=${agentId}).`,
        parameters: {
            action: { type: 'string', description: 'One of: create, list, cancel', required: true },
            name: { type: 'string', description: 'Name of the scheduled task (for create/cancel)', required: false },
            scriptPath: { type: 'string', description: 'Path to the script file to execute (for create). The scheduler runs "bun run <scriptPath>"', required: false },
            interval: { type: 'string', description: 'How often to run, e.g. "60s", "5m", "1h" (for interval tasks)', required: false },
            type: { type: 'string', description: 'Task type: "interval" (repeating), "once" (one-time). Default: interval', required: false },
            id: { type: 'string', description: 'Task ID (for cancel)', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const action = params.action as string

            if (action === 'list') {
                // Show tasks for this agent
                const rows = db.schedules.select().all()
                    .filter((r: any) => !agentId || r.agentId === agentId)
                const tasks = rows.map((r: any) => ({
                    id: String(r.id),
                    name: r.name,
                    type: r.type,
                    status: r.status,
                    scriptPath: r.scriptPath,
                    intervalSec: r.intervalSec,
                    lastRun: r.lastRun ? new Date(r.lastRun).toLocaleTimeString() : null,
                    lastOutput: r.lastOutput?.substring(0, 200),
                    completedCount: r.completedCount || 0,
                }))
                return {
                    success: true,
                    output: tasks.length > 0
                        ? `${tasks.length} scheduled tasks:\n${tasks.map(t => `  - [${t.id}] "${t.name}" (${t.type}, ${t.status}) script=${t.scriptPath}${t.intervalSec ? ` every ${t.intervalSec}s` : ''}${t.completedCount ? ` — ran ${t.completedCount}×` : ''}${t.lastOutput ? `\n    Last output: ${t.lastOutput}` : ''}`).join('\n')}`
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
                const scriptPath = params.scriptPath as string
                const type = (params.type as string) || 'interval'

                if (!name) {
                    return { success: false, output: '', error: 'name is required for create.' }
                }
                if (!scriptPath) {
                    return { success: false, output: '', error: 'scriptPath is required. Create a script file first, then schedule it.' }
                }

                // Verify script exists
                const file = Bun.file(scriptPath)
                if (!await file.exists()) {
                    return { success: false, output: '', error: `Script file not found: ${scriptPath}. Create the file first.` }
                }

                const intervalSec = type === 'interval' ? parseIntervalStr(params.interval || '60s') : undefined

                const inserted = db.schedules.insert({
                    name,
                    type: type as any,
                    status: 'pending',
                    scriptPath,
                    agentId: agentId ?? undefined,
                    intervalSec,
                    nextRun: type === 'interval' ? Date.now() : undefined,
                    completedCount: 0,
                })

                // Ensure scheduler is running
                scheduler.start()

                return {
                    success: true,
                    output: `Task scheduled! ID=${inserted.id}, name="${name}", type="${type}"${intervalSec ? `, every ${intervalSec}s` : ''}\nScript: ${scriptPath}\nAgent: ${agentId || 'global'}\nThe scheduler will run "bun run ${scriptPath}" with AGENT_ID=${agentId} and STATE_URL injected.`,
                }
            }

            return { success: false, output: '', error: `Unknown action: ${action}. Use create, list, or cancel.` }
        },
    }
}
