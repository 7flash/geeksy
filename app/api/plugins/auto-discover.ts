// app/api/plugins/auto-discover.ts — Scan sibling directories for unregistered plugins
import { db } from '../../lib/db'

/**
 * Scans the parent code directory for any folders containing a `geeksy-plugin.json`
 * that aren't already registered. Runs on server startup.
 */
export async function discoverPlugins(): Promise<string[]> {
    const { resolve, join } = await import('path')
    const { readdirSync, readFileSync, existsSync } = await import('fs')
    const codeDir = resolve(process.cwd(), '..')
    const discovered: string[] = []

    const registered = new Set(
        db.plugins.select().all().map((p: any) => p.packageName)
    )

    let dirs: string[]
    try {
        dirs = readdirSync(codeDir)
    } catch {
        return discovered
    }

    for (const dir of dirs) {
        const dirPath = resolve(codeDir, dir)

        // Check for geeksy-plugin.json or plugin.json
        for (const manifestFile of ['geeksy-plugin.json', 'plugin.json']) {
            const manifestPath = join(dirPath, manifestFile)
            if (!existsSync(manifestPath)) continue

            try {
                const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
                const packageName = manifest.packageName || manifest.name || dir

                // Skip if already registered
                if (registered.has(packageName)) break

                // Auto-register
                db.plugins.insert({
                    name: manifest.displayName || manifest.name || dir,
                    packageName,
                    status: 'installed',
                    port: manifest.defaultPort || 0,
                    config: JSON.stringify(manifest.env || {}),
                    description: manifest.description || '',
                    icon: manifest.icon || '🧩',
                    version: manifest.version || '0.0.0',
                })

                discovered.push(packageName)
                registered.add(packageName)
                console.log(`[auto-discover] Registered plugin: ${packageName} from ${dirPath}`)
                break // Don't check other manifest files for this dir
            } catch (e) {
                // Invalid manifest, skip
            }
        }
    }

    if (discovered.length > 0) {
        console.log(`[auto-discover] Found ${discovered.length} new plugin(s): ${discovered.join(', ')}`)
    }

    return discovered
}
