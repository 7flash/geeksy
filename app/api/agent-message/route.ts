// app/api/agent-message/route.ts — Inter-agent messaging for collaborative task completion
// Allows one agent to send a message to another agent's session.
// The receiving agent processes it as if a user sent it.

import { db } from '../../lib/db'

/**
 * POST /api/agent-message — Send a message from one agent to another
 * 
 * Body:
 *   fromAgentId: number     — The sending agent's ID
 *   toSessionId: number     — The target session to receive the message
 *   message: string         — The message content
 *   context?: string        — Optional context/metadata (JSON)
 * 
 * Flow:
 *   1. Validate both agents exist
 *   2. Format message with sender attribution
 *   3. POST to /api/chat to trigger processing in the target session
 *   4. Log the inter-agent message in the sender's session too
 */
export async function POST(req: Request) {
    const body = await req.json() as {
        fromAgentId: number
        toSessionId: number
        message: string
        context?: string
    }

    if (!body.fromAgentId || !body.toSessionId || !body.message) {
        return Response.json({ error: 'Missing fromAgentId, toSessionId, or message' }, { status: 400 })
    }

    // Validate sender exists
    const sender = db.agents.select().where({ id: body.fromAgentId }).first()
    if (!sender) {
        return Response.json({ error: `Sender agent ${body.fromAgentId} not found` }, { status: 404 })
    }

    // Validate target session exists
    const targetSession = db.sessions.select().where({ id: body.toSessionId }).first()
    if (!targetSession) {
        return Response.json({ error: `Target session ${body.toSessionId} not found` }, { status: 404 })
    }

    // Format the inter-agent message with attribution
    const formattedMessage = [
        `📨 **Inter-Agent Message** from "${sender.name}" (Agent #${sender.id})`,
        '',
        body.message,
        '',
        body.context ? `_Context: ${body.context}_` : '',
    ].filter(Boolean).join('\n')

    // Send to the target session via chat API
    const url = new URL(req.url)
    const chatUrl = `${url.origin}/api/chat`

    try {
        // Fire and forget — don't wait for the streaming response
        fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: formattedMessage,
                dbSessionId: body.toSessionId,
            }),
        }).catch(() => { /* fire and forget */ })
    } catch { /* ignore */ }

    // Log in the messages table for the target session
    db.messages.insert({
        agentId: 0, // system-level inter-agent message
        sessionId: body.toSessionId,
        role: 'user',
        content: formattedMessage,
    })

    return Response.json({
        ok: true,
        from: { id: sender.id, name: sender.name },
        to: { id: targetSession.id, name: (targetSession as any).name },
        messageLength: body.message.length,
    })
}

/**
 * GET /api/agent-message?sessionId=X — List inter-agent messages for a session
 * Returns messages that were sent via inter-agent messaging (identified by the 📨 prefix)
 */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId) {
        return Response.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const messages = db.messages.select()
        .where({ sessionId: Number(sessionId), role: 'user' })
        .all()
        .filter((m: any) => m.content?.startsWith('📨'))

    return Response.json({
        messages: messages.map((m: any) => ({
            id: m.id,
            content: m.content,
            timestamp: m.createdAt || m.id,
        })),
    })
}
