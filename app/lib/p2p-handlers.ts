/**
 * Default P2P RPC Handlers
 * 
 * Registers standard handlers for cross-instance agent communication:
 * - skills.list — List available skills on this instance
 * - agent.list — List agents on this instance
 * - agent.run — Execute prompt on a local agent (with permission)
 * - state.get — Read agent memory key
 * - health — Connection health check
 */

import type { P2PManager } from './p2p'

/** Register all default RPC handlers on a P2P manager */
export function registerDefaultHandlers(p2p: P2PManager, deps: {
    getSkills: () => Array<{ id: string; name: string; description: string }>
    getAgents: () => Array<{ id: number; name: string; model: string }>
    getState: (agentId: number, key: string) => string | null
    runAgent?: (agentId: number, prompt: string) => Promise<string>
}) {
    // Health check
    p2p.registerHandler('health', async () => ({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime?.() ?? 0,
    }))

    // List skills available on this instance
    p2p.registerHandler('skills.list', async () => {
        return deps.getSkills()
    })

    // List agents on this instance
    p2p.registerHandler('agent.list', async () => {
        return deps.getAgents()
    })

    // Read agent memory
    p2p.registerHandler('state.get', async (params: { agentId: number; key: string }) => {
        const value = deps.getState(params.agentId, params.key)
        return { key: params.key, value }
    })

    // Execute prompt on local agent (if allowed)
    p2p.registerHandler('agent.run', async (params: { agentId: number; prompt: string }) => {
        if (!deps.runAgent) {
            throw new Error('Remote agent execution not enabled on this instance')
        }
        const result = await deps.runAgent(params.agentId, params.prompt)
        return { result }
    })
}
