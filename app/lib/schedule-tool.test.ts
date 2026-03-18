import { describe, expect, test } from 'bun:test'
import { createScheduleTool } from './schedule-tool'
import { db } from './db'

describe('schedule tool guardrails', () => {
    test('infers interval type when interval is provided', async () => {
        const scriptPath = 'scripts/test-interval-guard.ts'
        await Bun.write(scriptPath, 'console.log("ok")\n')

        const tool = createScheduleTool(1, 1)
        const result = await tool.execute({
            action: 'create',
            name: 'interval-guard',
            scriptPath,
            interval: '60s',
        })

        expect(result.success).toBe(true)
        expect(result.output).toContain('type="interval"')

        const row = db.schedules.select().all().find((s: any) => s.name === 'interval-guard') as any
        expect(row?.type).toBe('interval')
        try { db.schedules.delete(row.id) } catch { }
        try { await Bun.file(scriptPath).delete() } catch { }
    })

    test('rejects scheduled scripts importing @geeky/core', async () => {
        const scriptPath = 'scripts/test-invalid-schedule.ts'
        await Bun.write(scriptPath, 'import { getState } from "@geeky/core"\nconsole.log("bad")\n')

        const tool = createScheduleTool(1, 1)
        const result = await tool.execute({
            action: 'create',
            name: 'invalid-schedule',
            scriptPath,
            interval: '60s',
            type: 'interval',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('@geeky/core')

        const row = db.schedules.select().all().find((s: any) => s.name === 'invalid-schedule')
        expect(row).toBeUndefined()
        try { await Bun.file(scriptPath).delete() } catch { }
    })

    test('rejects scheduled scripts with declared placeholder state helpers', async () => {
        const scriptPath = 'scripts/test-declare-state-schedule.ts'
        await Bun.write(scriptPath, 'declare function getState(key: string, fallback: any): Promise<any>\ndeclare function setState(key: string, value: any): Promise<void>\nconsole.log(await getState("x", []))\n')

        const tool = createScheduleTool(1, 1)
        const result = await tool.execute({
            action: 'create',
            name: 'declare-state-schedule',
            scriptPath,
            interval: '60s',
            type: 'interval',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('placeholder getState/setState')

        const row = db.schedules.select().all().find((s: any) => s.name === 'declare-state-schedule')
        expect(row).toBeUndefined()
        try { await Bun.file(scriptPath).delete() } catch { }
    })
})
