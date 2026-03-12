// app/api/prompts/route.ts — Prompt trace ingest & retrieval
// Receives PromptEvent from jsx-ai hook system (POST)
// Returns stored prompt traces (GET), clears them (DELETE)

import { db } from '../../lib/db'

/** POST /api/prompts — Ingest a PromptEvent from jsx-ai */
export async function POST(req: Request) {
    try {
        const event = await req.json()

        // Determine source from X-Source header or fallback
        const source = req.headers.get('x-source') || 'jsx-ai'

        db.prompts.insert({
            eventId: event.id || `${Date.now()}-manual`,
            method: event.method || 'callLLM',
            model: event.model || '',
            provider: event.provider || '',
            strategy: event.strategy || undefined,
            messages: JSON.stringify(event.messages || []),
            system: event.system || undefined,
            tools: event.tools ? JSON.stringify(event.tools) : undefined,
            responseText: event.response?.text || undefined,
            toolCalls: event.response?.toolCalls ? JSON.stringify(event.response.toolCalls) : undefined,
            tokensIn: event.usage?.inputTokens || undefined,
            tokensOut: event.usage?.outputTokens || undefined,
            tokensThinking: event.usage?.thinkingTokens || undefined,
            durationMs: event.durationMs || undefined,
            error: event.error || undefined,
            source,
        })

        return Response.json({ ok: true })
    } catch (err: any) {
        return Response.json({ ok: false, error: err.message }, { status: 400 })
    }
}

/** GET /api/prompts — List prompt traces, newest first */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    const model = url.searchParams.get('model')
    const method = url.searchParams.get('method')

    let query = db.prompts.select().orderBy('id', 'desc')

    if (model) query = query.where({ model })
    if (method) query = query.where({ method })

    const prompts = query.all().slice(0, limit)
    return Response.json({ ok: true, prompts })
}

/** DELETE /api/prompts — Clear all or filtered prompt traces */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (id) {
        // Delete single prompt
        db.prompts.delete(parseInt(id, 10))
        return Response.json({ ok: true, deleted: 1 })
    }

    // Delete all
    const all = db.prompts.select().all()
    for (const p of all) db.prompts.delete(p.id)
    return Response.json({ ok: true, deleted: all.length })
}
