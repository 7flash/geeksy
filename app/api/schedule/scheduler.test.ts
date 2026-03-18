import { describe, expect, test } from 'bun:test'
import { applyScheduleValidation } from './scheduler'

describe('applyScheduleValidation', () => {
    test('passes through successful result when no validation configured', () => {
        const result = applyScheduleValidation({}, { success: true, output: 'all good' })
        expect(result.success).toBe(true)
        expect(result.output).toBe('all good')
    })

    test('fails when expected output marker is missing', () => {
        const result = applyScheduleValidation(
            { expectedOutput: 'DONE' },
            { success: true, output: 'started\nfinished' },
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('expected output to contain')
    })

    test('passes when expected output marker is present', () => {
        const result = applyScheduleValidation(
            { expectedOutput: 'DONE' },
            { success: true, output: 'step 1\nDONE\nstep 2' },
        )
        expect(result.success).toBe(true)
    })

    test('fails on stderr when configured', () => {
        const result = applyScheduleValidation(
            { failOnStderr: true },
            { success: true, output: 'ok', stderr: 'warning: noisy script' },
        )
        expect(result.success).toBe(false)
        expect(result.error).toContain('stderr was not empty')
    })

    test('does not override an already failed result', () => {
        const result = applyScheduleValidation(
            { expectedOutput: 'DONE', failOnStderr: true },
            { success: false, output: '', error: 'Exit code: 1', stderr: 'boom' },
        )
        expect(result.success).toBe(false)
        expect(result.error).toBe('Exit code: 1')
    })
})
