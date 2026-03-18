import type { Tool, ToolResult } from 'smart-agent-ai'
import { db } from './db'
import { createSecretRequestMarker, getSecret } from './secrets'

export function createSecretTools(agentId?: number, sessionId?: number): Tool[] {
    return [createRequestSecretTool(agentId, sessionId), createGetSecretTool()]
}

function createRequestSecretTool(agentId?: number, sessionId?: number): Tool {
    return {
        name: 'request_secret',
        description: `Ask the user for a secret using a masked input in chat.
Use this when you need an API key, token, password, or webhook secret.
Do NOT ask the user to paste secrets in plain text.
This creates a secure prompt card in the current conversation${sessionId != null ? ` (session ${sessionId})` : ''}.`,
        parameters: {
            key: { type: 'string', description: 'Stable secret key name, e.g. OPENAI_API_KEY', required: true },
            label: { type: 'string', description: 'Friendly label shown to the user', required: false },
            description: { type: 'string', description: 'Why this secret is needed', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const key = String(params.key || '').trim()
            if (!key) return { success: false, output: '', error: 'Missing key' }

            const marker = createSecretRequestMarker({
                key,
                label: String(params.label || key),
                description: String(params.description || ''),
            })

            if (agentId) {
                db.messages.insert({
                    agentId,
                    sessionId,
                    role: 'assistant',
                    content: marker,
                })
                if (sessionId) {
                    try {
                        const dbSession = db.sessions.select().where({ id: sessionId }).first()
                        if (dbSession) {
                            db.sessions.update(sessionId, {
                                messageCount: (dbSession.messageCount || 0) + 1,
                                lastActiveAt: Date.now(),
                            })
                        }
                    } catch { }
                }
            }

            return {
                success: true,
                output: `Secret request posted for ${key}. Wait for the user to provide it via the masked chat input, then use get_secret to retrieve it if needed.`,
            }
        },
    }
}

function createGetSecretTool(): Tool {
    return {
        name: 'get_secret',
        description: 'Retrieve a previously saved secret by key. Use this only when you actually need the secret value. Never print the value back to the user.',
        parameters: {
            key: { type: 'string', description: 'Secret key name, e.g. OPENAI_API_KEY', required: true },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const key = String(params.key || '').trim()
            if (!key) return { success: false, output: '', error: 'Missing key' }
            const secret = await getSecret(key)
            if (!secret?.value) {
                return { success: false, output: '', error: `Secret not found: ${key}. Ask the user with request_secret.` }
            }
            return { success: true, output: secret.value }
        },
    }
}
