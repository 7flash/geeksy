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

    // Try to read plugin.json manifest from the package
    let manifest: any = null
    const { join, resolve } = await import('path')
    const { readdirSync, existsSync } = await import('fs')
    const codeDir = resolve(process.cwd(), '..')
    const manifestPaths = [
        join(process.cwd(), 'node_modules', body.packageName, 'plugin.json'),
        join(codeDir, body.packageName, 'plugin.json'),  // sibling dir
    ]
    // Also scan inside sibling workspace dirs (e.g. galaxyclaw/geeksy-telegram-plugin)
    try {
        for (const dir of readdirSync(codeDir)) {
            const nested = join(codeDir, dir, body.packageName, 'plugin.json')
            if (existsSync(nested)) manifestPaths.push(nested)
        }
    } catch { }
    for (const p of manifestPaths) {
        try {
            const f = Bun.file(p)
            if (await f.exists()) {
                manifest = await f.json()
                break
            }
        } catch { }
    }

    const plugin = db.plugins.insert({
        name: manifest?.displayName || body.name,
        packageName: body.packageName,
        status: 'installed',
        port: body.port || manifest?.defaultPort,
        config: JSON.stringify(body.config || manifest?.env || {}),
        description: body.description || manifest?.description,
        icon: manifest?.icon || body.icon || '🧩',
        version: manifest?.version || body.version,
    })

    // Auto-register bundled skills
    const registeredSkills: string[] = []
    if (manifest?.skills) {
        for (const skillPath of manifest.skills) {
            try {
                const { dirname, basename } = await import('path')
                // Find the manifest source dir
                let sourceDir = ''
                for (const p of manifestPaths) {
                    const f = Bun.file(p)
                    if (await f.exists()) { sourceDir = dirname(p); break }
                }
                if (!sourceDir) continue

                const fullPath = join(sourceDir, skillPath)
                const skillFile = Bun.file(fullPath)
                if (await skillFile.exists()) {
                    const content = await skillFile.text()
                    // Extract skill name from YAML
                    const nameMatch = content.match(/^name:\s*(.+)$/m)
                    const skillName = nameMatch?.[1]?.trim() || skillPath.replace(/.*\//, '').replace('.yaml', '')
                    registeredSkills.push(skillName)

                    // Copy skill file to geeksy's skills directory
                    const destPath = join(process.cwd(), 'skills', basename(skillPath))
                    const { mkdirSync } = await import('fs')
                    mkdirSync(join(process.cwd(), 'skills'), { recursive: true })
                    await Bun.write(destPath, content)
                }
            } catch { }
        }
    }

    return Response.json({ ...plugin, registeredSkills }, { status: 201 })
}

/** PUT /api/plugins — update plugin config or status */
export async function PUT(req: Request) {
    const body = await req.json() as {
        id: number
        action?: 'start' | 'stop'
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

    // Lifecycle actions — actually start/stop the process
    if (body.action === 'start') {
        const { startPlugin } = await import('./lifecycle')
        const result = await startPlugin(body.id)
        const updated = db.plugins.select().where({ id: body.id } as any).first()
        return Response.json({ ...result, plugin: updated })
    }

    if (body.action === 'stop') {
        const { stopPlugin } = await import('./lifecycle')
        const result = await stopPlugin(body.id)
        const updated = db.plugins.select().where({ id: body.id } as any).first()
        return Response.json({ ...result, plugin: updated })
    }

    // Regular update (config, port, manual status, etc.)
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
