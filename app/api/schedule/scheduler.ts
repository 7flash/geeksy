// app/api/schedule/scheduler.ts — Background task scheduler engine
// Supports both script execution (bun run <path>) and chat-based tasks
import { db } from '../../lib/db'

function getBaseUrl() {
    const port = _serverPort || process.env.BUN_PORT || 3737
    return `http://127.0.0.1:${port}`
}

let _serverPort: number | null = null
export function setServerPort(port: number) { _serverPort = port }


class Scheduler {
    private running = false
    private interval: ReturnType<typeof setInterval> | null = null

    start() {
        if (this.interval) return
        console.log('[scheduler] Starting task scheduler')
        this.interval = setInterval(() => this.tick(), 2000)
        this.tick()
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval)
            this.interval = null
        }
    }

    private async tick() {
        if (this.running) return
        this.running = true

        try {
            const now = Date.now()
            const pending = db.schedules.select()
                .where({ status: 'pending' })
                .all()
                .filter((r: any) => !r.nextRun || r.nextRun <= now)

            if (pending.length === 0) {
                this.running = false
                return
            }

            // Process the oldest pending task first that is ready to run
            const task = pending[0]

            if (task.type === 'sequential' && task.tasks) {
                await this.runSequential(task)
            } else if (task.type === 'interval') {
                await this.runInterval(task)
            } else {
                await this.runOnce(task)
            }
        } catch (err) {
            console.error('[scheduler] Tick error:', err)
        } finally {
            this.running = false
        }
    }

    /** Execute a task — either run a script or send a chat message */
    private async executeTask(schedule: any): Promise<{ success: boolean; output: string; error?: string }> {
        // Script-based execution: run the script file via bun
        if (schedule.scriptPath) {
            return this.runScript(schedule)
        }

        // Chat-based execution: send message to chat API
        if (schedule.message) {
            return this.runChat(schedule)
        }

        return { success: false, output: '', error: 'No scriptPath or message configured' }
    }

    /** Run a script file via bun */
    private async runScript(schedule: any): Promise<{ success: boolean; output: string; error?: string }> {
        const scriptPath = schedule.scriptPath
        console.log(`[scheduler] Running script: ${scriptPath}`)

        try {
            const proc = Bun.spawn(['bun', 'run', scriptPath], {
                cwd: process.cwd(),
                stdout: 'pipe',
                stderr: 'pipe',
                env: {
                    ...process.env,
                    AGENT_ID: String(schedule.agentId || ''),
                    STATE_URL: `${getBaseUrl()}/api/agent-state`,
                    BASE_URL: getBaseUrl(),
                },
            })

            const stdout = await new Response(proc.stdout).text()
            const stderr = await new Response(proc.stderr).text()
            const exitCode = await proc.exited

            if (exitCode === 0) {
                return { success: true, output: stdout.trim() || '(no output)' }
            } else {
                return { success: false, output: stdout.trim(), error: stderr.trim() || `Exit code: ${exitCode}` }
            }
        } catch (err: any) {
            return { success: false, output: '', error: err.message || String(err) }
        }
    }

    /** Send a message to the chat API */
    private async runChat(schedule: any): Promise<{ success: boolean; output: string; error?: string }> {
        try {
            const res = await fetch(`${getBaseUrl()}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: schedule.message,
                    model: 'gemini-2.5-flash',
                    agentId: schedule.agentId,
                }),
            })

            if (res.ok && res.body) {
                const reader = res.body.getReader()
                const decoder = new TextDecoder()
                let output = ''
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    output += decoder.decode(value, { stream: true })
                }
                return { success: true, output: output.substring(0, 500) }
            }
            return { success: false, output: '', error: `HTTP ${res.status}` }
        } catch (err: any) {
            return { success: false, output: '', error: err.message || String(err) }
        }
    }

    /** Run a sequential batch of tasks */
    private async runSequential(schedule: any) {
        db.schedules.update(schedule.id, { status: 'running' })

        const tasks = JSON.parse(schedule.tasks)
        let completedCount = schedule.completedCount || 0

        for (let i = completedCount; i < tasks.length; i++) {
            const current = db.schedules.select().where({ id: schedule.id }).first()
            if (!current || current.status === 'cancelled') return

            const subTask = tasks[i]
            subTask.status = 'running'
            db.schedules.update(schedule.id, {
                tasks: JSON.stringify(tasks),
                currentTask: subTask.name,
            })

            try {
                console.log(`[scheduler] Running sub-task ${i + 1}/${tasks.length}: ${subTask.name}`)
                const result = await this.executeTask({ ...schedule, message: subTask.message })
                subTask.status = result.success ? 'completed' : 'failed'
                subTask.result = result.output.substring(0, 500)
            } catch (err: any) {
                subTask.status = 'failed'
                subTask.result = err.message || String(err)
            }

            completedCount = i + 1
            db.schedules.update(schedule.id, {
                tasks: JSON.stringify(tasks),
                completedCount,
                lastRun: Date.now(),
                lastError: subTask.status === 'failed' ? subTask.result : undefined,
            })

            if (subTask.status === 'failed') break
        }

        const allPassed = tasks.every((t: any) => t.status === 'completed')
        db.schedules.update(schedule.id, {
            status: allPassed ? 'completed' : 'failed',
            tasks: JSON.stringify(tasks),
            completedCount,
            currentTask: undefined,
        })

        console.log(`[scheduler] Sequential batch complete: ${completedCount}/${tasks.length} tasks (Status: ${allPassed ? 'Passed' : 'Failed'})`)
    }

    /** Run a single one-off task */
    private async runOnce(schedule: any) {
        db.schedules.update(schedule.id, { status: 'running' })

        const result = await this.executeTask(schedule)

        const current = db.schedules.select().where({ id: schedule.id }).first()
        if (!current || current.status === 'cancelled') return

        db.schedules.update(schedule.id, {
            status: result.success ? 'completed' : 'failed',
            lastRun: Date.now(),
            lastOutput: result.output.substring(0, 2000),
            lastError: result.error,
        })

        if (result.success && result.output.trim()) {
            this.pushOutputToChat(schedule, result.output)
        }
    }

    /** Run an interval task — execute once, reschedule */
    private async runInterval(schedule: any) {
        if (schedule.nextRun && schedule.nextRun > Date.now()) return

        db.schedules.update(schedule.id, { status: 'running' })

        const result = await this.executeTask(schedule)

        // Prevent resurrecting a task that was cancelled while running
        const current = db.schedules.select().where({ id: schedule.id }).first()
        if (!current || current.status === 'cancelled') return

        // Reschedule for next interval regardless of success
        db.schedules.update(schedule.id, {
            status: 'pending',
            lastRun: Date.now(),
            nextRun: Date.now() + (schedule.intervalSec || 60) * 1000,
            completedCount: (schedule.completedCount || 0) + 1,
            lastOutput: result.output.substring(0, 2000),
            lastError: result.error,
        })

        // Push successful output to chat
        if (result.success && result.output.trim()) {
            this.pushOutputToChat(schedule, result.output)
        }

        const status = result.success ? '✓' : '✗'
        console.log(`[scheduler] Interval task "${schedule.name}" ${status}: ${result.output.substring(0, 100)}`)
    }

    /** Insert script output as a chat message so the user sees it */
    private pushOutputToChat(schedule: any, output: string) {
        if (!schedule.agentId) return
        try {
            db.messages.insert({
                agentId: schedule.agentId,
                role: 'assistant',
                content: `📋 **${schedule.name}**\n${output.trim()}`,
            })
        } catch (err) {
            console.error('[scheduler] Failed to persist output to chat:', err)
        }
    }
}

export const scheduler = new Scheduler()

// Auto-start if there are pending tasks
try {
    const pending = db.schedules.select().where({ status: 'pending' }).all()
    const running = db.schedules.select().where({ status: 'running' }).all()
    console.log(`[scheduler] Module loaded: ${pending.length} pending, ${running.length} running`)
    if (pending.length > 0 || running.length > 0) {
        for (const r of running) {
            db.schedules.update(r.id, { status: 'pending' })
        }
        scheduler.start()
    }
} catch (err) {
    console.error('[scheduler] Auto-start error:', err)
}
