// app/lib/agent-message-tool.ts — Inter-agent messaging tool for collaborative task completion
// Allows agents to send messages to other agents' sessions.

import type { Tool, ToolResult } from 'smart-agent-ai'
import { db } from './db'

/**
 * Creates a tool that lets the current agent send messages to other agents.
 * The message is delivered to the target agent's session and processed
 * as if a user sent it.
 */
export function createAgentMessageTool(fromAgentId?: number): Tool {
    return {
        name: 'send_message_to_agent',
        description: `Send a message to another agent for collaborative task completion. The target agent will receive and process your message asynchronously. Use this to delegate subtasks, ask for help, or share results. Your agent ID is ${fromAgentId || '?'}.`,
        parameters: {
            agentName: { type: 'string', description: 'Name of the target agent to send the message to', required: true },
            message: { type: 'string', description: 'The message to send to the target agent', required: true },
            context: { type: 'string', description: 'Optional additional context or metadata', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const { agentName, message, context } = params

            if (!agentName || !message) {
                return { success: false, output: '', error: 'agentName and message are required' }
            }

            // Find the target agent by name
            const agents = db.agents.select().all()
            const target = agents.find((a: any) =>
                a.name.toLowerCase() === agentName.toLowerCase()
            )

            if (!target) {
                const availableAgents = agents.map((a: any) => a.name).join(', ')
                return { success: false, output: '', error: `Agent "${agentName}" not found. Available agents: ${availableAgents}` }
            }

            // Find the sender name
            const sender = fromAgentId
                ? agents.find((a: any) => a.id === fromAgentId)
                : null
            const senderName = sender?.name || `Agent #${fromAgentId || '?'}`

            // Format the inter-agent message
            const formattedMessage = [
                `📨 **Inter-Agent Message** from "${senderName}"`,
                '',
                message,
                '',
                context ? `_Context: ${context}_` : '',
            ].filter(Boolean).join('\n')

            // Log the message in the target agent's messages
            db.messages.insert({
                agentId: target.id,
                role: 'user',
                content: formattedMessage,
            })

            // Fire chat request to process the message
            try {
                const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3737}`
                fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: formattedMessage,
                        agentId: target.id,
                    }),
                }).catch(() => { /* fire and forget */ })
            } catch { /* ignore */ }

            return {
                success: true,
                output: `Message sent to "${target.name}" (Agent #${target.id}). They will process it asynchronously and may respond via their own send_message_to_agent call.`,
            }
        },
    }
}
