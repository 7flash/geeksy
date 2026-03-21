// app/api/chat/route.ts — SSE streaming endpoint with Session pipeline
import { measure, measureSync } from "measure-fn"
import { Session } from "smart-agent-ai"
import type { AgentConfig } from "smart-agent-ai"
import { db } from '../../lib/db'
import { createScheduleTool } from '../../lib/schedule-tool'
import { scheduleFollowUp } from '../../lib/heartbeat'
import { join } from "path"
import { readdirSync } from "fs"

// Ensure saved API keys are loaded into process.env
import '../models/route'

import { searchSemanticMemory, addSemanticMemory } from '../../lib/embeddings'
import { createSkillDiscoveryTools } from '../../lib/skill-discovery-tool'
import { createSecretTools } from '../../lib/secret-tools'
import { createWebTools } from '../../lib/web-search-tool'
import { skillsDir } from '../../lib/paths'

import { sessions, getBoundSmartSessionId, bindDbSessionToSmartSession } from '../../lib/session-store'

/** Derive a short conversation title from the first user message */
function deriveSessionName(message: string): string {
    // Strip code blocks, URLs, file paths
    let text = message
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[A-Z]:\\[\w\\/.]+/g, '')
        .replace(/\/[\w/.-]+/g, '')
        .trim()

    // Take first sentence or line
    const firstLine = text.split(/[.\n!?]/)[0]?.trim() || text
    
    // Truncate to ~40 chars at word boundary
    if (firstLine.length <= 45) return firstLine || 'Conversation'
    const truncated = firstLine.slice(0, 45).replace(/\s+\S*$/, '')
    return (truncated || firstLine.slice(0, 40)) + '…'
}

/** Default system prompt — personality and behavior for Geeksy sessions */
const DEFAULT_SYSTEM_PROMPT = `You are Geeksy, a personal AI assistant. Be concise, friendly, and proactive.

PERSONALITY:
- Answer like a helpful friend, not a formal assistant
- Keep responses SHORT — 1-3 sentences for simple questions, longer only when needed
- Be proactive: if something can be done, just do it instead of asking permission
- Never refuse simple requests or add unnecessary warnings/disclaimers
- Match the user's language (if they write in Russian, respond in Russian)

TECHNICAL RULES:
- ALWAYS use Bun and TypeScript — NEVER Python, Node.js, or npm
- For shell commands, use Bun.shell or exec tool with PowerShell syntax (this is Windows)
- For long-running or background processes, ALWAYS use bgrun (not direct process spawn)
- To get the current time: new Date().toLocaleString() — you always have access to this
- For browser automation tasks, use Browserbase (not Selenium or Playwright)
- Install packages with: bun add <package>
- For non-trivial scheduled automations, first write a Bun/TypeScript script file, then use the schedule tool to run it with explicit timeout/retry/validation settings
- Scheduled scripts must NEVER import app internals like @geeky/core; they must be self-contained
- When a script needs persistent state, use process.env.STATE_URL (injected automatically by scheduler):
  const STATE_URL = process.env.STATE_URL!;
  const AGENT_ID = process.env.AGENT_ID!;
  async function getState(key: string) {
    const res = await fetch(\`\${STATE_URL}?agentId=\${AGENT_ID}&key=\${key}\`);
    return res.ok ? (await res.json()).value : null;
  }
  async function setState(key: string, value: any) {
    await fetch(STATE_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({agentId: Number(AGENT_ID), key, value: String(value)}) });
  }
- Never use placeholder declarations like "declare function getState(...)" — always inline the real helpers above

BEHAVIOR:
- When asked "what time is it" or similar, use the exec tool: Get-Date
- When asked to create files, just create them — don't explain what you'll do first
- When running commands, show what you're doing, don't narrate it
- If a command fails, try a different approach — don't repeat the same failing command
- Never output raw JSON tool calls in your response text — use tools properly

WEB SEARCH:
- You have web_search and fetch_page tools for accessing current information from the internet
- Use web_search when asked about recent events, documentation, APIs, or facts you might not know
- Use fetch_page to read specific pages in detail after finding them via search
- Always cite sources with URLs when using web results

SKILL DISCOVERY:
- When a user asks for something that might need a specialized capability (YouTube, trading, Discord, browser automation, etc.), use search_skills FIRST to check what's available
- If a useful skill or plugin is found but not installed, tell the user what it does and offer to install it
- Only use install_skill AFTER the user confirms they want it installed
- After installing, proceed with objective planning as normal`

/** DELETE /api/chat?sessionId=x — abort a running session */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get("sessionId")
    if (!sessionId) return Response.json({ error: "Missing sessionId" }, { status: 400 })

    const session = sessions.get(sessionId)
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 })

    session.abort()
    return Response.json({ ok: true })
}

/** PUT /api/chat — confirm or reject objectives */
export async function PUT(req: Request) {
    const { sessionId, confirmed } = await req.json() as { sessionId: string; confirmed: boolean }
    if (!sessionId) return Response.json({ error: "Missing sessionId" }, { status: 400 })

    const session = sessions.get(sessionId)
    if (!session) return Response.json({ error: "Session not found" }, { status: 404 })

    if (!session.isAwaitingConfirmation) {
        return Response.json({ error: "Session is not awaiting confirmation" }, { status: 400 })
    }

    if (confirmed) {
        session.confirmObjectives()
    } else {
        session.rejectObjectives()
    }

    return Response.json({ ok: true })
}

export async function POST(req: Request) {
    const body = await measure('Parse request', () => req.json()) as {
        message: string
        model?: string
        skills?: string[]
        cwd?: string
        sessionId?: string
        agentId?: number
        dbSessionId?: number
    }

    const model = body.model || "gemini-2.5-flash"
    const cwd = body.cwd || process.cwd()

    // Validate API key early
    const hasKey = !!(
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.QWEN_API_KEY ||
        process.env.DASHSCOPE_API_KEY ||
        process.env.DEEPSEEK_API_KEY
    )

    if (!hasKey) {
        const stream = new ReadableStream({
            start(controller) {
                const enc = new TextEncoder()
                controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: "error", iteration: -1, error: "No API key found. Set GEMINI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY." })}\n\n`))
                controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`))
                controller.close()
            }
        })
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        })
    }

    // Resolve skill paths
    const skillPaths = measureSync('Resolve skill paths', () =>
        (body.skills || []).map(s => join(skillsDir, `${s}.md`))
    )!

    const safeModeRow = body.agentId ? db.agentState.select().where({ agentId: body.agentId, key: 'safe_mode' }).first() : null;
    const safeMode = safeModeRow?.value === 'true';

    const dbPrompt = body.agentId ? db.agents.select().where({ id: body.agentId }).first()?.systemPrompt : undefined;
    let systemPrompt = dbPrompt || DEFAULT_SYSTEM_PROMPT;

    // RAG: Query local vector memory for context injection
    let augmentedMessage = body.message
    let retrievedMemoryCount = 0
    try {
        const memories = await searchSemanticMemory(body.message, 3, 0.4, {
            agentId: body.agentId,
            sessionId: body.dbSessionId,
        })
        retrievedMemoryCount = memories.length
        if (memories.length > 0) {
            const contextText = memories.map(m => `- ${m.text}`).join('\n')
            systemPrompt = (systemPrompt || '') + `\n\n[System Auto-Context]: Relevant past conversation memories retrieved from Local Vector Database:\n${contextText}\n\nUse this context to answer the user's latest message if applicable.`
        }
    } catch {
        // Fallback gracefully without memory if embeddings fail (e.g. no API key)
    }

    // Provide STATE_URL + AGENT_ID to exec tool so agent-created scripts can use state persistence
    const port = process.env.BUN_PORT || '3737'
    const baseUrl = `http://127.0.0.1:${port}`
    const agentEnv: Record<string, string> = {
        STATE_URL: `${baseUrl}/api/agent-state`,
        BASE_URL: baseUrl,
    }
    if (body.agentId) agentEnv.AGENT_ID = String(body.agentId)
    if (body.dbSessionId) agentEnv.SESSION_ID = String(body.dbSessionId)

    // Context limits per model family (conservative defaults — leave room for response)
    const contextLimits: Record<string, number> = {
        'gemini-2.5-flash': 800_000,
        'gemini-2.5-pro': 800_000,
        'gemini-2.0-flash': 800_000,
        'gemini-3': 800_000,
        'claude': 150_000,
        'gpt-4': 100_000,
        'deepseek': 50_000,
        'qwen': 100_000,
    }
    const maxContextTokens = Object.entries(contextLimits).find(([prefix]) => model.startsWith(prefix))?.[1] ?? 100_000

    const config: AgentConfig = {
        model,
        cwd,
        skills: skillPaths.length > 0 ? skillPaths : undefined,
        maxIterations: 10,
        safeMode,
        systemPrompt,
        tools: [createScheduleTool(body.agentId, body.dbSessionId), ...createSecretTools(body.agentId, body.dbSessionId), ...createSkillDiscoveryTools(), ...createWebTools()],
        env: agentEnv,
        maxContextTokens,
    }

    const promptTrace = {
        model,
        cwd,
        safeMode,
        skillCount: skillPaths.length,
        skills: body.skills || [],
        memoryCount: retrievedMemoryCount,
        userMessage: body.message,
        systemPrompt,
    }

    // Get or create session
    const session = measureSync('Resolve session', () => {
        const boundSessionId = getBoundSmartSessionId(body.dbSessionId)
        if (boundSessionId && sessions.has(boundSessionId)) {
            return sessions.get(boundSessionId)!
        }
        if (body.sessionId && sessions.has(body.sessionId)) {
            return sessions.get(body.sessionId)!
        }
        const s = new Session(config)
        sessions.set(s.id, s)
        return s
    })!

    // Create SSE stream
    const stream = new ReadableStream({
        async start(controller) {
            const enc = new TextEncoder()

            // Persist user message to DB
            if (body.agentId) {
                db.messages.insert({ agentId: body.agentId, sessionId: body.dbSessionId, role: 'user', content: body.message })
            }
            // Update session activity + auto-name on first real message
            if (body.dbSessionId) {
                try {
                    const dbSession = db.sessions.select().where({ id: body.dbSessionId }).first()
                    if (dbSession) {
                        const updates: Record<string, any> = {
                            messageCount: (dbSession.messageCount || 0) + 1,
                            lastActiveAt: Date.now(),
                        }
                        // Auto-name: if session still has a generic name and this is the first/second message
                        const genericNames = ['New Conversation', 'Web Session', 'Conversation']
                        if (genericNames.includes(dbSession.name) && (dbSession.messageCount || 0) <= 1) {
                            updates.name = deriveSessionName(body.message)
                        }
                        db.sessions.update(body.dbSessionId, updates)
                        // Notify client of session rename
                        if (updates.name) {
                            controller.enqueue(enc.encode(`event: session_renamed\ndata: ${JSON.stringify({ sessionId: body.dbSessionId, name: updates.name })}\n\n`))
                        }
                    }
                } catch { }
            }

            // Emit debug trace + session ID
            controller.enqueue(enc.encode(`event: prompt_trace\ndata: ${JSON.stringify(promptTrace)}\n\n`))
            controller.enqueue(enc.encode(`event: session\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`))

            try {
                let eventCount = 0
                let assistantText = ''
                let stoppedOnEmptyResponse = false
                for await (const event of session.send(body.message)) {
                    if (event.type === 'error' && (event as any).error === 'LLM returned empty response') {
                        controller.enqueue(enc.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
                        stoppedOnEmptyResponse = true
                        try { session.abort() } catch { }
                        break
                    }

                    eventCount++
                    controller.enqueue(enc.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))

                    // Accumulate assistant response text
                    if (event.type === 'thinking_delta') assistantText += (event as any).delta || ''

                    // Persist objectives when planned
                    if (event.type === 'planning' && body.agentId) {
                        const objectives = (event as any).objectives || []
                        for (const obj of objectives) {
                            try {
                                db.objectives.upsert(
                                    { agentId: body.agentId, sessionId: body.dbSessionId, name: obj.name } as any,
                                    {
                                        agentId: body.agentId,
                                        sessionId: body.dbSessionId,
                                        name: obj.name,
                                        description: obj.description || '',
                                        type: obj.type || 'task',
                                        params: JSON.stringify(obj.params || {}),
                                        status: 'pending',
                                    },
                                )
                            } catch { }
                        }
                    }

                    // Update objective status
                    if (event.type === 'objective_check' && body.agentId) {
                        const results = (event as any).results || []
                        for (const r of results) {
                            const existing = db.objectives.select().where({ agentId: body.agentId, sessionId: body.dbSessionId, name: r.name } as any).first()
                            if (existing) {
                                db.objectives.update(existing.id, {
                                    status: r.met ? 'complete' : 'failed',
                                    result: r.reason || '',
                                    lastValidatedAt: Date.now(),
                                    lastReportedState: `${r.met ? 'complete' : 'failed'}:${r.reason || ''}`.slice(0, 500),
                                })
                            }
                        }
                    }

                    // Persist file accesses
                    if (event.type === 'tool_start' && body.agentId) {
                        const tool = (event as any).tool
                        const params = (event as any).params || {}
                        if (tool === 'readFile' && params.path) {
                            try { db.files.upsert({ agentId: body.agentId, sessionId: body.dbSessionId, path: params.path } as any, { agentId: body.agentId, sessionId: body.dbSessionId, path: params.path, action: 'read' }) } catch { }
                        } else if (tool === 'writeFile' && params.path) {
                            try { db.files.upsert({ agentId: body.agentId, sessionId: body.dbSessionId, path: params.path } as any, { agentId: body.agentId, sessionId: body.dbSessionId, path: params.path, action: 'write' }) } catch { }
                        }
                    }
                }

                // Persist assistant response and semantic vector memory
                if (body.agentId && assistantText) {
                    db.messages.insert({ agentId: body.agentId, sessionId: body.dbSessionId, role: 'assistant', content: assistantText })
                    // Update session message count for assistant response
                    if (body.dbSessionId) {
                        try {
                            const sess = db.sessions.select().where({ id: body.dbSessionId }).first()
                            if (sess) {
                                db.sessions.update(body.dbSessionId, {
                                    messageCount: (sess.messageCount || 0) + 1,
                                    lastActiveAt: Date.now(),
                                })
                            }
                        } catch { }
                    }
                    try {
                        addSemanticMemory(`User: ${body.message}\nAgent: ${assistantText}`, {
                            agentId: body.agentId,
                            sessionId: body.dbSessionId,
                        })
                    } catch { }
                }

                // Save sessionId to agent record
                if (body.dbSessionId) {
                    bindDbSessionToSmartSession(body.dbSessionId, session.id)
                }

                if (body.agentId) {
                    db.agents.update(body.agentId, { sessionId: session.id })

                    // Schedule a follow-up heartbeat if the agent took real action (used tools)
                    const toolsUsed = assistantText.length > 0;
                    if (toolsUsed && eventCount > 5) {
                        // Agent did substantial work — schedule a follow-up in 2 minutes
                        const briefContext = body.message.substring(0, 120);
                        scheduleFollowUp(
                            body.agentId,
                            'Check if previous task completed successfully and if user needs follow-up',
                            `User asked: "${briefContext}"`,
                            120_000, // 2 minute delay
                        );
                    }
                }

                measureSync(`SSE complete (${eventCount} events)`)
                controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`))
            } catch (err: any) {
                console.error("[chat] Error:", err)
                controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: "error", iteration: -1, error: err.message || String(err) })}\n\n`))
                controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`))
            } finally {
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    })
}

// List available skills
export async function GET() {
    const skills = measureSync('List skills', () => {
        const result: string[] = []
        try {
            for (const f of readdirSync(skillsDir)) {
                if (f.endsWith(".md")) {
                    result.push(f.replace(/\.md$/, ""))
                }
            }
        } catch { }
        return result
    })
    return Response.json(skills)
}
