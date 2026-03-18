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

export interface ScheduleExecutionResult {
    success: boolean
    output: string
    error?: string
    stderr?: string
}

export function applyScheduleValidation(schedule: any, result: ScheduleExecutionResult): ScheduleExecutionResult {
    const output = result.output || ''
    const stderr = result.stderr?.trim() || ''
    const expectedOutput = typeof schedule?.expectedOutput === 'string' ? schedule.expectedOutput.trim() : ''
    const failOnStderr = schedule?.failOnStderr === true

    if (!result.success) return { ...result, output }

    if (failOnStderr && stderr) {
        return {
            success: false,
            output,
            error: `Validation failed: stderr was not empty${stderr ? ` (${stderr.slice(0, 160)})` : ''}`,
            stderr,
        }
    }

    if (expectedOutput && !output.includes(expectedOutput)) {
        return {
            success: false,
            output,
            error: `Validation failed: expected output to contain ${JSON.stringify(expectedOutput)}`,
            stderr,
        }
    }

    return { ...result, output, stderr }
}

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
    private async executeTask(schedule: any): Promise<ScheduleExecutionResult> {
        let result: ScheduleExecutionResult

        // Script-based execution: run the script file via bun
        if (schedule.scriptPath) {
            result = await this.runScript(schedule)
        } else if (schedule.message) {
            // Chat-based execution: send message to chat API
            result = await this.runChat(schedule)
        } else {
            result = { success: false, output: '', error: 'No scriptPath or message configured' }
        }

        return applyScheduleValidation(schedule, result)
    }

    /** Execute a task and measure wall-clock duration */
    private async executeTaskTimed(schedule: any): Promise<ScheduleExecutionResult & { durationMs: number }> {
        const start = performance.now()
        const result = await this.executeTask(schedule)
        const durationMs = Math.round(performance.now() - start)
        return { ...result, durationMs }
    }

    /** Run a script file via bun */
    private async runScript(schedule: any): Promise<ScheduleExecutionResult> {
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
            const trimmedStdout = stdout.trim()
            const trimmedStderr = stderr.trim()

            if (exitCode === 0) {
                return {
                    success: true,
                    output: trimmedStdout || (trimmedStderr ? `(stderr only) ${trimmedStderr}` : '(no output)'),
                    stderr: trimmedStderr || undefined,
                }
            } else {
                return {
                    success: false,
                    output: trimmedStdout,
                    error: trimmedStderr || `Exit code: ${exitCode}`,
                    stderr: trimmedStderr || undefined,
                }
            }
        } catch (err: any) {
            return { success: false, output: '', error: err.message || String(err) }
        }
    }

    /** Send a message to the chat API */
    private async runChat(schedule: any): Promise<ScheduleExecutionResult> {
        const timeoutMs = (schedule.timeoutSec || 30) * 1000
        const maxAttempts = 4
        let lastError = ''

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
                        dbSessionId: schedule.sessionId,
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

                lastError = `HTTP ${res.status}`
                if (attempt < maxAttempts && (res.status >= 500 || res.status === 429)) {
                    await Bun.sleep(500 * attempt)
                    continue
                }
                return { success: false, output: '', error: lastError }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    return { success: false, output: '', error: `Chat request timed out after ${timeoutMs / 1000}s` }
                }
                lastError = err.message || String(err)
                if (attempt < maxAttempts) {
                    await Bun.sleep(500 * attempt)
                    continue
                }
            }
        }

        return { success: false, output: '', error: lastError || 'Scheduled chat failed' }
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

        if (allPassed) {
            this.pushResultToChat(schedule, 'success', `Sequential batch complete: ${completedCount}/${tasks.length} tasks passed.`)
        } else {
            const failedTask = tasks.find((t: any) => t.status === 'failed')
            this.pushResultToChat(schedule, 'failed', failedTask?.result || '', `Sequential batch stopped on "${failedTask?.name || 'unknown task'}"`)
        }

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
                this.pushResultToChat(schedule, 'success', result.output)
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
        const finalError = maxRetries > 0
            ? `Failed after ${retryCount - 1} retries: ${result.error}`
            : result.error

        db.schedules.update(schedule.id, {
            status: 'failed',
            lastRun: Date.now(),
            lastOutput: result.output.substring(0, 2000),
            lastError: finalError,
            lastDurationMs: result.durationMs,
            failCount: (schedule.failCount || 0) + 1,
        })

        this.pushResultToChat(schedule, 'failed', result.output, finalError)

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

        if (result.success && result.output.trim()) {
            this.pushResultToChat(schedule, 'success', result.output)
        } else if (!result.success) {
            this.pushResultToChat(schedule, 'failed', result.output, result.error)
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
            this.pushResultToChat(schedule, 'success', result.output)
        } else if (!result.success) {
            this.pushResultToChat(schedule, 'failed', result.output, result.error)
        }

        const status = result.success ? '✓' : '✗'
        const nextDate = new Date(nextRun).toLocaleTimeString()
        console.log(`[scheduler] Cron task "${schedule.name}" ${status} (${result.durationMs}ms, next: ${nextDate}): ${result.output.substring(0, 80)}`)
    }

    private buildChatReport(schedule: any, status: 'success' | 'failed', output: string, error?: string) {
        const header = status === 'success' ? `📋 **${schedule.name}**` : `⚠️ **${schedule.name} failed**`
        const lines = [header]
        if (status === 'failed') {
            if (error) lines.push(error)
            if (output?.trim()) lines.push(output.trim())
        } else if (output?.trim()) {
            lines.push(output.trim())
        }
        return lines.filter(Boolean).join('\n')
    }

    private shouldReportToChat(schedule: any, status: 'success' | 'failed', output: string, error?: string) {
        const normalized = `${status}:${(error || output || '').trim().slice(0, 240)}`
        return schedule.lastReportedStatus !== normalized
    }

    /** Insert schedule result into chat so the user sees background activity */
    private pushResultToChat(schedule: any, status: 'success' | 'failed', output: string, error?: string) {
        if (!schedule.agentId) return
        if (!this.shouldReportToChat(schedule, status, output, error)) return

        const content = this.buildChatReport(schedule, status, output, error)
        const normalized = `${status}:${(error || output || '').trim().slice(0, 240)}`

        try {
            db.messages.insert({
                agentId: schedule.agentId,
                sessionId: schedule.sessionId,
                role: 'assistant',
                content,
            })
            db.schedules.update(schedule.id, {
                lastReportedStatus: normalized,
                lastReportedAt: Date.now(),
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
