// app/api/schedule/scheduler.ts — Background task scheduler engine
// Supports script execution, chat-based tasks, interval, and cron schedules
import { db } from '../../lib/db'

// ─── Lightweight Cron Parser ───────────────────────────────

function matchesCronField(field: string, value: number, max: number): boolean {
    if (field === '*') return true
    for (const part of field.split(',')) {
        if (part.includes('/')) {
            const [range, step] = part.split('/')
            const s = parseInt(step)
            const start = range === '*' ? 0 : parseInt(range)
            if ((value - start) % s === 0 && value >= start) return true
        } else if (part.includes('-')) {
            const [lo, hi] = part.split('-').map(Number)
            if (value >= lo && value <= hi) return true
        } else {
            if (parseInt(part) === value) return true
        }
    }
    return false
}

/** Check if a cron expression matches the current time */
export function matchesCron(expr: string, date = new Date()): boolean {
    const fields = expr.trim().split(/\s+/)
    if (fields.length < 5) return false
    const [min, hour, dom, mon, dow] = fields
    return (
        matchesCronField(min, date.getMinutes(), 59) &&
        matchesCronField(hour, date.getHours(), 23) &&
        matchesCronField(dom, date.getDate(), 31) &&
        matchesCronField(mon, date.getMonth() + 1, 12) &&
        matchesCronField(dow, date.getDay(), 6)
    )
}

/** Get next run time for a cron expression (brute-force, max 1 year ahead) */
export function getNextCronRun(expr: string, from = new Date()): number {
    const d = new Date(from)
    d.setSeconds(0, 0)
    d.setMinutes(d.getMinutes() + 1) // start from next minute
    const limit = from.getTime() + 365 * 24 * 60 * 60 * 1000
    while (d.getTime() < limit) {
        if (matchesCron(expr, d)) return d.getTime()
        d.setMinutes(d.getMinutes() + 1)
    }
    return from.getTime() + 60_000 // fallback: 1 minute
}

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
            } else if (task.type === 'cron') {
                await this.runCron(task)
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

    /** Execute a task and measure wall-clock duration */
    private async executeTaskTimed(schedule: any): Promise<{ success: boolean; output: string; error?: string; durationMs: number }> {
        const start = performance.now()
        const result = await this.executeTask(schedule)
        const durationMs = Math.round(performance.now() - start)
        return { ...result, durationMs }
    }

    /** Run a script file via bun */
    private async runScript(schedule: any): Promise<{ success: boolean; output: string; error?: string }> {
        const scriptPath = schedule.scriptPath
        const timeoutMs = (schedule.timeoutSec || 60) * 1000
        console.log(`[scheduler] Running script: ${scriptPath} (timeout: ${timeoutMs / 1000}s)`)

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

            // Race between process completion and timeout
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => {
                    proc.kill()
                    reject(new Error(`Script timed out after ${timeoutMs / 1000}s`))
                }, timeoutMs)
            )

            const completion = (async () => {
                const stdout = await new Response(proc.stdout).text()
                const stderr = await new Response(proc.stderr).text()
                const exitCode = await proc.exited
                return { stdout, stderr, exitCode }
            })()

            const { stdout, stderr, exitCode } = await Promise.race([completion, timeout])

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
        const timeoutMs = (schedule.timeoutSec || 30) * 1000
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), timeoutMs)

            const res = await fetch(`${getBaseUrl()}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: schedule.message,
                    model: 'gemini-2.5-flash',
                    agentId: schedule.agentId,
                }),
                signal: controller.signal,
            })

            clearTimeout(timer)

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
            if (err.name === 'AbortError') {
                return { success: false, output: '', error: `Chat request timed out after ${timeoutMs / 1000}s` }
            }
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

    /** Run a single one-off task (with optional retry on failure) */
    private async runOnce(schedule: any) {
        db.schedules.update(schedule.id, { status: 'running' })

        const result = await this.executeTaskTimed(schedule)

        const current = db.schedules.select().where({ id: schedule.id }).first()
        if (!current || current.status === 'cancelled') return

        if (result.success) {
            db.schedules.update(schedule.id, {
                status: 'completed',
                lastRun: Date.now(),
                lastOutput: result.output.substring(0, 2000),
                lastError: undefined,
                retryCount: 0,
                lastDurationMs: result.durationMs,
                successCount: (schedule.successCount || 0) + 1,
            })
            if (result.output.trim()) {
                this.pushOutputToChat(schedule, result.output)
            }
            return
        }

        // Failed — check if retries are available
        const maxRetries = schedule.maxRetries || 0
        const retryCount = (schedule.retryCount || 0) + 1

        if (maxRetries > 0 && retryCount <= maxRetries) {
            const baseDelay = schedule.retryDelayMs || 2000
            const delay = Math.min(Math.pow(2, retryCount - 1) * baseDelay, 5 * 60 * 1000)
            const nextRun = Date.now() + delay

            db.schedules.update(schedule.id, {
                status: 'pending',
                lastRun: Date.now(),
                lastError: result.error,
                lastOutput: result.output.substring(0, 2000),
                retryCount,
                nextRun,
                lastDurationMs: result.durationMs,
                failCount: (schedule.failCount || 0) + 1,
            })

            console.log(`[scheduler] Task "${schedule.name}" failed (attempt ${retryCount}/${maxRetries}), retrying in ${(delay / 1000).toFixed(1)}s: ${result.error}`)
            return
        }

        // All retries exhausted — mark as permanently failed
        db.schedules.update(schedule.id, {
            status: 'failed',
            lastRun: Date.now(),
            lastOutput: result.output.substring(0, 2000),
            lastError: maxRetries > 0
                ? `Failed after ${retryCount - 1} retries: ${result.error}`
                : result.error,
            lastDurationMs: result.durationMs,
            failCount: (schedule.failCount || 0) + 1,
        })

        if (maxRetries > 0) {
            console.log(`[scheduler] Task "${schedule.name}" permanently failed after ${retryCount - 1} retries`)
        }
    }

    /** Run an interval task — execute once, reschedule */
    private async runInterval(schedule: any) {
        if (schedule.nextRun && schedule.nextRun > Date.now()) return

        db.schedules.update(schedule.id, { status: 'running' })

        const result = await this.executeTaskTimed(schedule)

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
            lastDurationMs: result.durationMs,
            successCount: result.success ? (schedule.successCount || 0) + 1 : schedule.successCount || 0,
            failCount: result.success ? schedule.failCount || 0 : (schedule.failCount || 0) + 1,
        })

        // Push successful output to chat
        if (result.success && result.output.trim()) {
            this.pushOutputToChat(schedule, result.output)
        }

        const status = result.success ? '✓' : '✗'
        console.log(`[scheduler] Interval task "${schedule.name}" ${status} (${result.durationMs}ms): ${result.output.substring(0, 100)}`)
    }

    /** Run a cron-scheduled task — execute when cron matches, reschedule for next match */
    private async runCron(schedule: any) {
        if (!schedule.cron) return
        if (schedule.nextRun && schedule.nextRun > Date.now()) return

        db.schedules.update(schedule.id, { status: 'running' })

        const result = await this.executeTaskTimed(schedule)

        const current = db.schedules.select().where({ id: schedule.id }).first()
        if (!current || current.status === 'cancelled') return

        const nextRun = getNextCronRun(schedule.cron)
        db.schedules.update(schedule.id, {
            status: 'pending',
            lastRun: Date.now(),
            nextRun,
            completedCount: (schedule.completedCount || 0) + 1,
            lastOutput: result.output.substring(0, 2000),
            lastError: result.error,
            lastDurationMs: result.durationMs,
            successCount: result.success ? (schedule.successCount || 0) + 1 : schedule.successCount || 0,
            failCount: result.success ? schedule.failCount || 0 : (schedule.failCount || 0) + 1,
        })

        if (result.success && result.output.trim()) {
            this.pushOutputToChat(schedule, result.output)
        }

        const status = result.success ? '✓' : '✗'
        const nextDate = new Date(nextRun).toLocaleTimeString()
        console.log(`[scheduler] Cron task "${schedule.name}" ${status} (${result.durationMs}ms, next: ${nextDate}): ${result.output.substring(0, 80)}`)
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
