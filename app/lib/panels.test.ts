import { describe, expect, test } from 'bun:test'
import { resolveCoreMemoryEntries } from './panels'
import type { StateEntry } from './types'

describe('resolveCoreMemoryEntries', () => {
    test('prefers the active session core memory over the agent-wide fallback', () => {
        const entries: StateEntry[] = [
            { id: 1, agentId: 1, key: 'core_memory', value: 'global summary' },
            { id: 2, agentId: 1, key: 'core_memory_updated_at', value: '100' },
            { id: 3, agentId: 1, key: 'core_memory.session.16', value: 'session 16 summary' },
            { id: 4, agentId: 1, key: 'core_memory_updated_at.session.16', value: '200' },
            { id: 5, agentId: 1, key: 'users.alice', value: 'hello' },
        ]

        const resolved = resolveCoreMemoryEntries(entries, 16)
        expect(resolved.coreMemoryEntry?.value).toBe('session 16 summary')
        expect(resolved.coreMemorySessionId).toBe(16)
        expect(resolved.coreMemoryUpdatedAt).toBe(200)
        expect(resolved.otherEntries.map(e => e.key)).toEqual(['users.alice'])
    })

    test('falls back to the agent-wide summary when the active session has none', () => {
        const entries: StateEntry[] = [
            { id: 1, agentId: 1, key: 'core_memory', value: 'global summary' },
            { id: 2, agentId: 1, key: 'core_memory_updated_at', value: '100' },
        ]

        const resolved = resolveCoreMemoryEntries(entries, 99)
        expect(resolved.coreMemoryEntry?.value).toBe('global summary')
        expect(resolved.coreMemorySessionId).toBe(null)
        expect(resolved.coreMemoryUpdatedAt).toBe(100)
        expect(resolved.isAgentWideFallback).toBe(true)
        expect(resolved.hasSessionCoreMemory).toBe(false)
    })

    test('does not mark fallback when a matching session memory exists', () => {
        const entries: StateEntry[] = [
            { id: 1, agentId: 1, key: 'core_memory', value: 'global summary' },
            { id: 2, agentId: 1, key: 'core_memory_updated_at', value: '100' },
            { id: 3, agentId: 1, key: 'core_memory.session.42', value: 'session summary' },
            { id: 4, agentId: 1, key: 'core_memory_updated_at.session.42', value: '200' },
        ]

        const resolved = resolveCoreMemoryEntries(entries, 42)
        expect(resolved.coreMemoryEntry?.value).toBe('session summary')
        expect(resolved.isAgentWideFallback).toBe(false)
        expect(resolved.hasSessionCoreMemory).toBe(true)
    })
})
