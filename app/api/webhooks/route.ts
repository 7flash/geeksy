// app/api/webhooks/route.ts — Inbound webhook endpoint for external integrations
// Receives HTTP POST from GitHub, Stripe, custom services, etc.
// Routes events to the designated session as chat messages.

import { db } from '../../lib/db'

/** 
 * POST /api/webhooks/:token — Receive webhook event
 * 
 * Headers:
 *   X-GitHub-Event, X-Stripe-Event, X-Webhook-Source — auto-detected
 * 
 * Body: JSON payload from the external service
 * 
 * Flow:
 *   1. Validate webhook token against stored webhooks
 *   2. Parse event type from headers or body
 *   3. Format a human-readable message for the agent
 *   4. POST to /api/chat with the target sessionId
 *   5. Return 200 immediately (async processing)
 */

interface WebhookConfig {
    id: number
    name: string
    token: string
    sessionId: number
    source: string        // 'github' | 'stripe' | 'custom'
    eventFilter?: string  // comma-separated event types to accept (empty = all)
    active: boolean
    lastTriggered?: number
    triggerCount: number
}

// In-memory webhook registry (loaded from db on first request)
let webhookCache: WebhookConfig[] | null = null

function getWebhooks(): WebhookConfig[] {
    if (webhookCache) return webhookCache
    try {
        const rows = db.agentState.select()
            .where({ key: '__webhooks' })
            .all()
        if (rows.length > 0) {
            webhookCache = JSON.parse(rows[0].value)
            return webhookCache!
        }
    } catch { }
    webhookCache = []
    return webhookCache
}

function saveWebhooks(webhooks: WebhookConfig[]) {
    webhookCache = webhooks
    // Store in agentState with a special key
    const existing = db.agentState.select()
        .where({ key: '__webhooks' })
        .first()
    const value = JSON.stringify(webhooks)
    if (existing) {
        db.agentState.update(existing.id, { value })
    } else {
        db.agentState.insert({ agentId: 0, key: '__webhooks', value })
    }
}

function generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let token = 'whk_'
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return token
}

// ── Event Parsing ──────────────────────────────────────────────

function detectSource(req: Request): string {
    if (req.headers.get('x-github-event')) return 'github'
    if (req.headers.get('stripe-signature')) return 'stripe'
    if (req.headers.get('x-gitlab-event')) return 'gitlab'
    if (req.headers.get('x-webhook-source')) return req.headers.get('x-webhook-source')!
    return 'custom'
}

function formatGitHubEvent(event: string, payload: any): string {
    switch (event) {
        case 'push':
            const commits = payload.commits?.length || 0
            const branch = payload.ref?.replace('refs/heads/', '') || '?'
            const pusher = payload.pusher?.name || payload.sender?.login || '?'
            return `🔔 **GitHub Push**: ${pusher} pushed ${commits} commit(s) to \`${branch}\` in \`${payload.repository?.full_name}\`\n\nLatest: ${payload.head_commit?.message || '(no message)'}`

        case 'pull_request':
            const pr = payload.pull_request
            return `🔔 **GitHub PR ${payload.action}**: #${pr?.number} "${pr?.title}" by ${pr?.user?.login}\n\n${pr?.body?.substring(0, 200) || ''}`

        case 'issues':
            const issue = payload.issue
            return `🔔 **GitHub Issue ${payload.action}**: #${issue?.number} "${issue?.title}" by ${issue?.user?.login}`

        case 'star':
            return `⭐ **GitHub Star**: ${payload.sender?.login} ${payload.action} \`${payload.repository?.full_name}\` (now ${payload.repository?.stargazers_count} stars)`

        case 'release':
            return `🚀 **GitHub Release ${payload.action}**: ${payload.release?.tag_name} — ${payload.release?.name || '(untitled)'}`

        default:
            return `🔔 **GitHub ${event}**: ${JSON.stringify(payload).substring(0, 300)}`
    }
}

function formatStripeEvent(payload: any): string {
    const type = payload.type || 'unknown'
    const obj = payload.data?.object || {}

    switch (type) {
        case 'payment_intent.succeeded':
            return `💳 **Stripe Payment**: $${(obj.amount / 100).toFixed(2)} ${obj.currency?.toUpperCase()} succeeded from ${obj.receipt_email || 'unknown'}`

        case 'customer.subscription.created':
            return `📦 **Stripe Subscription Created**: ${obj.items?.data?.[0]?.plan?.nickname || obj.id}`

        case 'invoice.payment_failed':
            return `❌ **Stripe Invoice Failed**: $${(obj.amount_due / 100).toFixed(2)} for ${obj.customer_email || obj.customer}`

        default:
            return `💳 **Stripe ${type}**: ${JSON.stringify(obj).substring(0, 300)}`
    }
}

function formatWebhookMessage(source: string, req: Request, payload: any): string {
    if (source === 'github') {
        const event = req.headers.get('x-github-event') || 'unknown'
        return formatGitHubEvent(event, payload)
    }
    if (source === 'stripe') {
        return formatStripeEvent(payload)
    }
    // Custom/generic
    return `🔔 **Webhook (${source})**: ${JSON.stringify(payload).substring(0, 500)}`
}

// ── Route Handlers ─────────────────────────────────────────────

/** POST /api/webhooks — Receive webhook event */
export async function POST(req: Request) {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
        return Response.json({ error: 'Missing ?token= parameter' }, { status: 400 })
    }

    const webhooks = getWebhooks()
    const hook = webhooks.find(w => w.token === token && w.active)

    if (!hook) {
        return Response.json({ error: 'Invalid or inactive webhook token' }, { status: 401 })
    }

    // Parse payload
    let payload: any = {}
    try {
        payload = await req.json()
    } catch {
        try {
            const text = await req.text()
            payload = { raw: text }
        } catch {
            payload = { note: 'Empty payload' }
        }
    }

    // Detect source and check event filter
    const source = hook.source || detectSource(req)
    if (hook.eventFilter) {
        const allowed = hook.eventFilter.split(',').map(s => s.trim().toLowerCase())
        const eventType = (
            req.headers.get('x-github-event') ||
            payload.type || // Stripe event type
            'unknown'
        ).toLowerCase()
        if (!allowed.includes(eventType) && !allowed.includes('*')) {
            return Response.json({ ok: true, skipped: true, reason: `Event '${eventType}' not in filter` })
        }
    }

    // Format message for agent
    const message = formatWebhookMessage(source, req, payload)

    // Update webhook stats
    hook.lastTriggered = Date.now()
    hook.triggerCount = (hook.triggerCount || 0) + 1
    saveWebhooks(webhooks)

    // Fire and forget: send to chat API
    try {
        const chatUrl = `${url.origin}/api/chat`
        fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                dbSessionId: hook.sessionId,
            }),
        }).catch(() => { /* fire and forget */ })
    } catch { /* ignore */ }

    return Response.json({
        ok: true,
        webhook: hook.name,
        source,
        triggerCount: hook.triggerCount,
    })
}

/** GET /api/webhooks — List all configured webhooks */
export async function GET() {
    const webhooks = getWebhooks()
    return Response.json({
        webhooks: webhooks.map(w => ({
            ...w,
            token: w.token.substring(0, 8) + '...',  // Mask token in listing
        })),
    })
}

/** PUT /api/webhooks — Create a new webhook */
export async function PUT(req: Request) {
    const body = await req.json() as {
        name: string
        sessionId: number
        source?: string
        eventFilter?: string
    }

    if (!body.name || !body.sessionId) {
        return Response.json({ error: 'Missing name or sessionId' }, { status: 400 })
    }

    const webhooks = getWebhooks()
    const newHook: WebhookConfig = {
        id: Date.now(),
        name: body.name,
        token: generateToken(),
        sessionId: body.sessionId,
        source: body.source || 'custom',
        eventFilter: body.eventFilter || '',
        active: true,
        triggerCount: 0,
    }

    webhooks.push(newHook)
    saveWebhooks(webhooks)

    return Response.json({
        ok: true,
        webhook: newHook,
        url: `/api/webhooks?token=${newHook.token}`,
    })
}

/** DELETE /api/webhooks?id=X — Delete a webhook */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))

    if (!id) {
        return Response.json({ error: 'Missing ?id= parameter' }, { status: 400 })
    }

    const webhooks = getWebhooks()
    const idx = webhooks.findIndex(w => w.id === id)
    if (idx === -1) {
        return Response.json({ error: 'Webhook not found' }, { status: 404 })
    }

    webhooks.splice(idx, 1)
    saveWebhooks(webhooks)

    return Response.json({ ok: true, deleted: id })
}
