import { describe, expect, test } from 'bun:test'
import { formatDebugPreview } from './panels'

describe('formatDebugPreview', () => {
    test('summarizes request traces with model and message preview', () => {
        const preview = formatDebugPreview({
            type: 'request_trace',
            data: { model: 'gemini-2.5-flash', message: 'tell me a joke every minute please' },
        })
        expect(preview).toContain('gemini-2.5-flash')
        expect(preview).toContain('tell me a joke every minute')
    })

    test('summarizes prompt traces with context counts', () => {
        const preview = formatDebugPreview({
            type: 'prompt_trace',
            data: { model: 'gemini-2.5-flash', memoryCount: 3, skillCount: 2 },
        })
        expect(preview).toContain('gemini-2.5-flash')
        expect(preview).toContain('3 memories')
        expect(preview).toContain('2 skills')
    })
})
