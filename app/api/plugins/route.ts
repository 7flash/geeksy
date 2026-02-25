// app/api/plugins/route.ts — Plugin registry CRUD
// Manages installed plugins: list, install, configure, start/stop, uninstall
import { db } from '../../lib/db'

/** GET /api/plugins — list all installed plugins */
export async function GET() {
    const plugins = db.plugins.select().all()
    return Response.json(plugins)
}

/** POST /api/plugins — register a new plugin */
export async function POST(req: Request) {
    const body = await req.json() as {
        name: string
        packageName: string
        port?: number
        config?: Record<string, any>
        description?: string
        icon?: string
        version?: string
    }

    if (!body.name || !body.packageName) {
        return Response.json({ error: 'Missing name or packageName' }, { status: 400 })
    }

    // Check if already installed
    const existing = db.plugins.select()
        .where({ packageName: body.packageName })
        .first()

    if (existing) {
        return Response.json({ error: 'Plugin already installed', plugin: existing }, { status: 409 })
    }

    const plugin = db.plugins.insert({
        name: body.name,
        packageName: body.packageName,
        status: 'installed',
        port: body.port,
        config: JSON.stringify(body.config || {}),
        description: body.description,
        icon: body.icon || '🧩',
        version: body.version,
    })

    return Response.json(plugin, { status: 201 })
}

/** PUT /api/plugins — update plugin config or status */
export async function PUT(req: Request) {
    const body = await req.json() as {
        id: number
        status?: string
        config?: Record<string, any>
        port?: number
        error?: string
        version?: string
    }

    if (!body.id) {
        return Response.json({ error: 'Missing id' }, { status: 400 })
    }

    const existing = db.plugins.select().where({ id: body.id } as any).first()
    if (!existing) {
        return Response.json({ error: 'Plugin not found' }, { status: 404 })
    }

    const updates: Record<string, any> = {}
    if (body.status !== undefined) updates.status = body.status
    if (body.config !== undefined) updates.config = JSON.stringify(body.config)
    if (body.port !== undefined) updates.port = body.port
    if (body.error !== undefined) updates.error = body.error
    if (body.version !== undefined) updates.version = body.version

    db.plugins.update(body.id, updates)

    return Response.json({ ...existing, ...updates, id: body.id })
}

/** DELETE /api/plugins?id=X — uninstall a plugin */
export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    const plugin = db.plugins.select().where({ id: Number(id) } as any).first()
    if (!plugin) return Response.json({ error: 'Plugin not found' }, { status: 404 })

    db.plugins.delete(Number(id))
    return Response.json({ ok: true, removed: plugin.name })
}
