import { describe, expect, test } from 'bun:test'
import { formatDebugPreview, groupDebugLogEntries } from './panels'

describe('groupDebugLogEntries', () => {
    test('groups events by trace id and orders latest trace first', () => {
        const groups = groupDebugLogEntries([
            { id: 1, at: 100, type: 'request_trace', data: { model: 'a', message: 'first' }, traceId: 't1' },
            { id: 2, at: 110, type: 'prompt_trace', data: { model: 'a' }, traceId: 't1' },
            { id: 3, at: 200, type: 'request_trace', data: { model: 'b', message: 'second' }, traceId: 't2' },
            { id: 4, at: 210, type: 'tool_start', data: { tool: 'exec', params: { cmd: 'echo hi' } }, traceId: 't2' },
        ] as any)

        expect(groups).toHaveLength(2)
        expect(groups[0].traceId).toBe('t2')
        expect(groups[0].entries).toHaveLength(2)
        expect(groups[0].title).toContain('second')
        expect(groups[1].traceId).toBe('t1')
    })

    test('falls back to first entry preview when no request trace exists', () => {
        const groups = groupDebugLogEntries([
            { id: 1, at: 100, type: 'tool_start', data: { tool: 'exec', params: { cmd: 'echo hi' } }, traceId: 't1' },
        ] as any)

        expect(groups[0].title).toBe(formatDebugPreview(groups[0].entries[0]))
    })
})
