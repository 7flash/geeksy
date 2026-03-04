// app/api/plugins/lifecycle.ts — Plugin process management via bgrun
// Uses bgrun to start/stop plugin processes with proper supervision

import { db } from '../../lib/db'

// Maps packageName → bgrun process name and directory
interface ProcessSpec {
    bgrName: string
    directory: string
    command: string
    port?: number
    autostart: boolean
    description?: string
}

interface PluginSpec {
    directory: string
    processes: ProcessSpec[]
    defaultPort: number
    manifest: any
}

function resolvePlugin(packageName: string): PluginSpec | null {
    const { resolve, join } = require('path')
    const { existsSync, readFileSync, readdirSync } = require('fs')
    const codeDir = resolve(process.cwd(), '..')

    // Check sibling directories and nested workspace dirs
    const candidates = [
        resolve(codeDir, packageName),
        ...(() => {
            try {
                return readdirSync(codeDir)
                    .map((d: string) => resolve(codeDir, d))
                    .filter((d: string) => {
                        try {
                            const pkg = resolve(d, 'package.json')
                            if (!existsSync(pkg)) return false
                            const json = JSON.parse(readFileSync(pkg, 'utf8'))
                            return json.name === packageName
                        } catch { return false }
                    })
            } catch { return [] }
        })(),
    ]

    for (const dir of candidates) {
        // Try geeksy-plugin.json first (v3 manifest with multi-process)
        const geeksyManifest = resolve(dir, 'geeksy-plugin.json')
        if (existsSync(geeksyManifest)) {
            try {
                const manifest = JSON.parse(readFileSync(geeksyManifest, 'utf8'))
                const processes: ProcessSpec[] = []

                if (manifest.processes) {
                    for (const [name, spec] of Object.entries(manifest.processes) as any) {
                        processes.push({
                            bgrName: name,
                            directory: spec.directory ? resolve(dir, spec.directory) : dir,
                            command: spec.command,
                            port: spec.port,
                            autostart: spec.autostart ?? false,
                            description: spec.description,
                        })
                    }
                }

                // Find the main port (first process with a port)
                const mainPort = processes.find(p => p.port)?.port || 0

                return { directory: dir, processes, defaultPort: mainPort, manifest }
            } catch { }
        }

        // Fallback: legacy plugin.json
        const pluginJsonPath = resolve(dir, 'plugin.json')
        if (existsSync(pluginJsonPath)) {
            try {
                const manifest = JSON.parse(readFileSync(pluginJsonPath, 'utf8'))
                return {
                    directory: dir,
                    processes: [{
                        bgrName: packageName,
                        directory: dir,
                        command: `bun run ${manifest.entrypoint || 'src/server.ts'}`,
                        port: manifest.defaultPort || 0,
                        autostart: true,
                    }],
                    defaultPort: manifest.defaultPort || 0,
                    manifest,
                }
            } catch { }
        }

        // Fallback: no manifest but has package.json
        if (existsSync(resolve(dir, 'package.json'))) {
            return {
                directory: dir,
                processes: [{
                    bgrName: packageName,
                    directory: dir,
                    command: 'bun run start',
                    autostart: true,
                }],
                defaultPort: 0,
                manifest: null,
            }
        }
    }

    return null
}

/** Build environment for plugin processes */
function buildPluginEnv(plugin: any, port: number): Record<string, string> {
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
    try {
        const { resolve } = require('path')
        const configPath = resolve(process.cwd(), '.config.toml')
        const configText = require('fs').readFileSync(configPath, 'utf8')
        let currentSection = ''
        for (const line of configText.split('\n')) {
            const trimmed = line.trim()
            const sectionMatch = trimmed.match(/^\[(\w+)\]$/)
            if (sectionMatch) { currentSection = sectionMatch[1]; continue }
            if (!currentSection) continue
            const kvMatch = trimmed.match(/^(\w+)\s*=\s*"(.+)"$/)
            if (kvMatch) {
                env[`${currentSection.toUpperCase()}_${kvMatch[1].toUpperCase()}`] = kvMatch[2]
            }
        }
    } catch { }

    return env
}

/** Start a plugin — spawns ALL declared processes via bgrun */
export async function startPlugin(pluginId: number): Promise<{ ok: boolean; error?: string; started?: string[] }> {
    const plugin = db.plugins.select().where({ id: pluginId } as any).first()
    if (!plugin) return { ok: false, error: 'Plugin not found' }

    const spec = resolvePlugin(plugin.packageName)
    if (!spec) return { ok: false, error: `Could not find plugin package: ${plugin.packageName}` }

    const port = plugin.port || spec.defaultPort || 0
    const env = buildPluginEnv(plugin, port)
    const started: string[] = []

    try {
        // Start each declared process
        for (const proc of spec.processes) {
            const args = [
                'bgrun',
                '--name', proc.bgrName,
                '--command', proc.command,
                '--directory', proc.directory,
                '--force',
            ]

            console.log(`[lifecycle] Starting: ${args.join(' ')}`)

            const child = Bun.spawn(args, {
                env,
                stdio: ['ignore', 'inherit', 'inherit'],
            })
            await child.exited
            console.log(`[lifecycle] bgrun ${proc.bgrName} exited with code ${child.exitCode}`)
            started.push(proc.bgrName)
        }

        // Wait for main port to become reachable (if any process declares a port)
        if (port) {
            let reachable = false
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 1500))
                try {
                    const r = await fetch(`http://localhost:${port}`, {
                        signal: AbortSignal.timeout(2000),
                    })
                    if (r.ok || r.status < 500) { reachable = true; break }
                } catch { }
            }

            if (!reachable) {
                db.plugins.update(pluginId, {
                    status: 'error',
                    error: `Processes started but port ${port} not reachable`,
                } as any)
                return { ok: false, error: `Port ${port} not reachable`, started }
            }
        }

        db.plugins.update(pluginId, {
            status: 'running',
            port,
        } as any)

        return { ok: true, started }
    } catch (err: any) {
        db.plugins.update(pluginId, {
            status: 'error',
            error: err.message,
        } as any)
        return { ok: false, error: err.message }
    }
}

/** Stop a plugin — stops ALL declared processes via bgrun */
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

        // Stop all declared processes
        const processNames = spec?.processes.map(p => p.bgrName) || [plugin.packageName]
        for (const name of processNames) {
            console.log(`[lifecycle] Stopping: bgrun --stop ${name}`)
            const proc = Bun.spawn(['bgrun', '--stop', name], {
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            await proc.exited
        }

        db.plugins.update(pluginId, { status: 'stopped' } as any)
        return { ok: true }
    } catch (err: any) {
        db.plugins.update(pluginId, { status: 'stopped' })
        return { ok: true }
    }
}
