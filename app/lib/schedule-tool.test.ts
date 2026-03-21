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

    test('accepts scripts with inline STATE_URL helpers', async () => {
        const scriptPath = 'scripts/test-valid-state-schedule.ts'
        const validScript = `const STATE_URL = process.env.STATE_URL!;
const AGENT_ID = process.env.AGENT_ID!;
async function getState(key: string) {
  const res = await fetch(\`\${STATE_URL}?agentId=\${AGENT_ID}&key=\${key}\`);
  return res.ok ? (await res.json()).value : null;
}
async function setState(key: string, value: any) {
  await fetch(STATE_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({agentId: Number(AGENT_ID), key, value: String(value)}) });
}
const idx = await getState('idx') ?? 0;
console.log('joke', idx);
await setState('idx', idx + 1);
`
        await Bun.write(scriptPath, validScript)

        const tool = createScheduleTool(1, 1)
        const result = await tool.execute({
            action: 'create',
            name: 'valid-state-schedule',
            scriptPath,
            interval: '60s',
        })

        expect(result.success).toBe(true)
        expect(result.output).toContain('valid-state-schedule')

        const row = db.schedules.select().all().find((s: any) => s.name === 'valid-state-schedule') as any
        expect(row).toBeTruthy()
        try { db.schedules.delete(row.id) } catch { }
        try { await Bun.file(scriptPath).delete() } catch { }
    })

    test('rejects scripts calling getState without defining it', async () => {
        const scriptPath = 'scripts/test-missing-def-schedule.ts'
        await Bun.write(scriptPath, `const STATE_URL = process.env.STATE_URL!;\nconst x = await getState('key');\nconsole.log(x);\n`)

        const tool = createScheduleTool(1, 1)
        const result = await tool.execute({
            action: 'create',
            name: 'missing-def-schedule',
            scriptPath,
            interval: '60s',
        })

        expect(result.success).toBe(false)
        expect(result.error).toContain('getState')
        expect(result.error).toContain('define')

        try { await Bun.file(scriptPath).delete() } catch { }
    })
})
