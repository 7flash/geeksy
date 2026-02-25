// app/api/plugins/lifecycle.ts — Plugin process management via bgrun
// Uses bgrun to start/stop plugin processes with proper supervision

import { db } from '../../lib/db'

// Maps packageName → bgrun process name and directory
interface PluginSpec {
    bgrName: string      // bgrun process name
    directory: string    // working directory
    command: string      // start command
    defaultPort: number
}

function resolvePlugin(packageName: string): PluginSpec | null {
    const { resolve } = require('path')
    const { existsSync } = require('fs')
    const codeDir = resolve(process.cwd(), '..')

    // Check sibling directories and nested workspace dirs
    const candidates = [
        resolve(codeDir, packageName),
        ...(() => {
            try {
                const { readdirSync } = require('fs')
                return readdirSync(codeDir)
                    .map((d: string) => resolve(codeDir, d))
                    .filter((d: string) => {
                        try {
                            const pkg = resolve(d, 'package.json')
                            if (!existsSync(pkg)) return false
                            const json = JSON.parse(require('fs').readFileSync(pkg, 'utf8'))
                            return json.name === packageName
                        } catch { return false }
                    })
            } catch { return [] }
        })(),
    ]

    for (const dir of candidates) {
        const pluginJsonPath = resolve(dir, 'plugin.json')
        if (existsSync(pluginJsonPath)) {
            try {
                const manifest = JSON.parse(require('fs').readFileSync(pluginJsonPath, 'utf8'))
                return {
                    bgrName: packageName,
                    directory: dir,
                    command: `bun run ${manifest.entrypoint || 'src/server.ts'}`,
                    defaultPort: manifest.defaultPort || 0,
                }
            } catch { }
        }
        // Fallback: no plugin.json but package.json has "start" script
        if (existsSync(resolve(dir, 'package.json'))) {
            return {
                bgrName: packageName,
                directory: dir,
                command: 'bun run start',
                defaultPort: 0,
            }
        }
    }

    return null
}

/** Start a plugin process via bgrun */
export async function startPlugin(pluginId: number): Promise<{ ok: boolean; error?: string }> {
    const plugin = db.plugins.select().where({ id: pluginId } as any).first()
    if (!plugin) return { ok: false, error: 'Plugin not found' }

    const spec = resolvePlugin(plugin.packageName)
    if (!spec) return { ok: false, error: `Could not find plugin package: ${plugin.packageName}` }

    const port = plugin.port || spec.defaultPort || 0

    try {
        // Build env — bgrun forwards all env vars to the spawned process
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            PLUGIN_PORT: String(port),
            GEEKSY_URL: `http://localhost:${process.env.PORT || 3737}`,
        }

        // Add stored config as env vars
        try {
            const config = JSON.parse(plugin.config || '{}')
            for (const [k, v] of Object.entries(config)) {
                env[k.toUpperCase()] = String(v)
            }
        } catch { }

        // Read .config.toml for plugin-specific sections
        // e.g. [telegram] → TELEGRAM_APP_ID, TELEGRAM_API_HASH, TELEGRAM_PHONE_NUMBER
        try {
            const { resolve } = require('path')
            const configPath = resolve(process.cwd(), '.config.toml')
            const configText = require('fs').readFileSync(configPath, 'utf8')
            // Simple TOML parser for flat sections
            let currentSection = ''
            for (const line of configText.split('\n')) {
                const trimmed = line.trim()
                const sectionMatch = trimmed.match(/^\[(\w+)\]$/)
                if (sectionMatch) { currentSection = sectionMatch[1]; continue }
                if (!currentSection) continue
                const kvMatch = trimmed.match(/^(\w+)\s*=\s*"(.+)"$/)
                if (kvMatch) {
                    const envKey = `${currentSection.toUpperCase()}_${kvMatch[1].toUpperCase()}`
                    env[envKey] = kvMatch[2]
                }
            }
        } catch { }

        // Start via bgrun CLI — it spawns the process and exits
        const args = [
            'bgrun',
            '--name', spec.bgrName,
            '--command', spec.command,
            '--directory', spec.directory,
            '--force',
        ]

        console.log(`[lifecycle] Starting: ${args.join(' ')}`)

        const proc = Bun.spawn(args, {
            env,
            stdio: ['ignore', 'inherit', 'inherit'],
        })
        await proc.exited
        console.log(`[lifecycle] bgrun exited with code ${proc.exitCode}`)

        // Wait for port to become reachable (bgrun spawned the process)
        let reachable = false
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 1500))
            try {
                const r = await fetch(`http://localhost:${port}/api/status`, {
                    signal: AbortSignal.timeout(2000),
                })
                if (r.ok) { reachable = true; break }
            } catch { }
        }

        if (!reachable) {
            db.plugins.update(pluginId, {
                status: 'error',
                error: `bgrun started but port ${port} not reachable`,
            } as any)
            return { ok: false, error: `Port ${port} not reachable` }
        }

        db.plugins.update(pluginId, {
            status: 'running',
            port,
        } as any)

        return { ok: true }
    } catch (err: any) {
        db.plugins.update(pluginId, {
            status: 'error',
            error: err.message,
        } as any)
        return { ok: false, error: err.message }
    }
}

/** Stop a plugin process via bgrun */
export async function stopPlugin(pluginId: number): Promise<{ ok: boolean; error?: string }> {
    const plugin = db.plugins.select().where({ id: pluginId } as any).first()
    if (!plugin) return { ok: false, error: 'Plugin not found' }

    const spec = resolvePlugin(plugin.packageName)

    try {
        // Graceful disconnect if plugin has an API
        if (plugin.port) {
            try {
                await fetch(`http://localhost:${plugin.port}/api/auth/disconnect`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(2000),
                })
            } catch { }
        }

        // Stop via bgrun
        const bgrName = spec?.bgrName || plugin.packageName
        console.log(`[lifecycle] Stopping plugin: bgrun --stop ${bgrName}`)

        const proc = Bun.spawn(['bgrun', '--stop', bgrName], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited

        const stdout = await new Response(proc.stdout).text()
        console.log(`[lifecycle] bgrun stop output: ${stdout.substring(0, 200)}`)

        db.plugins.update(pluginId, { status: 'stopped' } as any)
        return { ok: true }
    } catch (err: any) {
        // Even if bgrun stop fails, mark as stopped
        db.plugins.update(pluginId, { status: 'stopped' })
        return { ok: true }
    }
}
