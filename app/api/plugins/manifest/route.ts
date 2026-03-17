// app/api/plugins/manifest/route.ts — Fetch plugin manifest (config schema)
import { db } from '../../../lib/db'
import { workspaceRoot } from '../../../lib/paths'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const packageName = url.searchParams.get('packageName')
    if (!id && !packageName) return Response.json({ error: 'Missing id or packageName' }, { status: 400 })

    let plugin
    if (id) {
        plugin = db.plugins.select().where({ id: Number(id) } as any).first()
    } else {
        plugin = db.plugins.select().where({ packageName } as any).first()
    }

    if (!plugin) return Response.json({ error: 'Plugin not found' }, { status: 404 })

    // Find and read the manifest
    const { resolve, join } = require('path')
    const { existsSync, readFileSync, readdirSync } = require('fs')
    const codeDir = resolve(process.cwd(), '..')

    const candidates = [
        resolve(codeDir, plugin.packageName),
        ...(() => {
            try {
                return readdirSync(codeDir)
                    .map((d: string) => resolve(codeDir, d))
                    .filter((d: string) => {
                        try {
                            for (const mf of ['geeksy-plugin.json', 'plugin.json']) {
                                const p = resolve(d, mf)
                                if (existsSync(p)) {
                                    const m = JSON.parse(readFileSync(p, 'utf8'))
                                    if (m.packageName === plugin.packageName || m.name === plugin.packageName) return true
                                }
                            }
                            return false
                        } catch { return false }
                    })
            } catch { return [] }
        })(),
    ]

    for (const dir of candidates) {
        for (const mf of ['geeksy-plugin.json', 'plugin.json']) {
            const p = resolve(dir, mf)
            if (existsSync(p)) {
                try {
                    const manifest = JSON.parse(readFileSync(p, 'utf8'))
                    return Response.json({
                        id: plugin.id,
                        packageName: plugin.packageName,
                        config: manifest.config || {},
                        name: manifest.name || manifest.displayName || plugin.name,
                        currentConfig: (() => { try { return JSON.parse(plugin.config || '{}') } catch { return {} } })(),
                    })
                } catch { }
            }
        }
    }

    // No manifest found — return current config only
    return Response.json({
        id: plugin.id,
        packageName: plugin.packageName,
        config: {},
        name: plugin.name,
        currentConfig: (() => { try { return JSON.parse(plugin.config || '{}') } catch { return {} } })(),
    })
}
