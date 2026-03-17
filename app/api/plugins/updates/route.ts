// app/api/plugins/updates/route.ts — Plugin version monitoring
// Checks npm registry for newer versions of installed plugins
import { db } from '../../../lib/db'

interface UpdateInfo {
    pluginId: number
    packageName: string
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
}

const _cache = new Map<string, { version: string; checkedAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/** Check npm registry for latest version of a package */
async function getLatestVersion(packageName: string): Promise<string | null> {
    const cached = _cache.get(packageName)
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
        return cached.version
    }

    try {
        const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const data = await res.json() as { version: string }
        _cache.set(packageName, { version: data.version, checkedAt: Date.now() })
        return data.version
    } catch {
        return null
    }
}

/** Compare semver strings (basic: a > b) */
function isNewer(latest: string, current: string): boolean {
    const parse = (v: string) => v.replace(/^[^0-9]*/, '').split('.').map(Number)
    const l = parse(latest)
    const c = parse(current)
    for (let i = 0; i < 3; i++) {
        if ((l[i] || 0) > (c[i] || 0)) return true
        if ((l[i] || 0) < (c[i] || 0)) return false
    }
    return false
}

/** Check all installed plugins for updates */
export async function checkPluginUpdates(): Promise<UpdateInfo[]> {
    const plugins = db.plugins.select().all() as any[]
    const results: UpdateInfo[] = []

    for (const plugin of plugins) {
        if (!plugin.packageName || !plugin.version) continue

        const latest = await getLatestVersion(plugin.packageName)
        if (!latest) continue

        const hasUpdate = isNewer(latest, plugin.version)
        results.push({
            pluginId: plugin.id,
            packageName: plugin.packageName,
            currentVersion: plugin.version,
            latestVersion: latest,
            hasUpdate,
        })
    }

    return results
}

/** GET /api/plugins/updates — check for plugin updates */
export async function GET() {
    const updates = await checkPluginUpdates()
    return Response.json({
        updates,
        hasUpdates: updates.some(u => u.hasUpdate),
        checkedAt: new Date().toISOString(),
    })
}

/** POST /api/plugins/updates — upgrade a specific plugin */
export async function POST(req: Request) {
    const { pluginId } = await req.json() as { pluginId: number }
    if (!pluginId) return Response.json({ error: 'Missing pluginId' }, { status: 400 })

    const plugin = db.plugins.select().where({ id: pluginId } as any).first() as any
    if (!plugin) return Response.json({ error: 'Plugin not found' }, { status: 404 })

    const latest = await getLatestVersion(plugin.packageName)
    if (!latest) {
        return Response.json({
            success: false,
            message: 'No registry version available for this plugin yet',
            packageName: plugin.packageName,
            version: plugin.version,
        })
    }

    if (!isNewer(latest, plugin.version || '0.0.0')) {
        return Response.json({ message: 'Already up to date', version: plugin.version })
    }

    // Run bun update for the package
    try {
        const { appHome } = await import('../../../lib/paths')
        const proc = Bun.spawn(['bun', 'update', plugin.packageName], {
            cwd: appHome,
            stdout: 'pipe',
            stderr: 'pipe',
        })
        await proc.exited

        // Update version in DB
        db.plugins.update(pluginId, { version: latest } as any)

        // Stop and restart plugin if it was running
        if (plugin.status === 'running') {
            const { stopPlugin, startPlugin } = await import('../lifecycle')
            await stopPlugin(pluginId)
            await startPlugin(pluginId)
        }

        return Response.json({
            success: true,
            previousVersion: plugin.version,
            newVersion: latest,
            restarted: plugin.status === 'running',
        })
    } catch (err: any) {
        return Response.json({ error: `Update failed: ${err.message}` }, { status: 500 })
    }
}
