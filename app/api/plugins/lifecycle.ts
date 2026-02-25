// app/api/plugins/lifecycle.ts — Plugin process management
// Handles starting/stopping plugin processes via BGR

import { db } from '../../lib/db'

/** Plugin process registry — maps packageName → known settings */
const KNOWN_PLUGINS: Record<string, { cmd: string; defaultPort: number }> = {
    'geeksy-telegram-plugin': {
        cmd: 'bun run node_modules/geeksy-telegram-plugin/src/server.ts',
        defaultPort: 3738,
    },
}

/** Start a plugin process */
export async function startPlugin(pluginId: number): Promise<{ ok: boolean; error?: string }> {
    const plugin = db.plugins.select().where({ id: pluginId } as any).first()
    if (!plugin) return { ok: false, error: 'Plugin not found' }

    const known = KNOWN_PLUGINS[plugin.packageName]
    const port = plugin.port || known?.defaultPort || 0

    // For known plugins, spawn via Bun.spawn
    // For unknown plugins, try to find an entrypoint
    const cmd = known?.cmd || `bun run node_modules/${plugin.packageName}/src/server.ts`

    try {
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            PLUGIN_PORT: String(port),
            GEEKSY_URL: `http://localhost:${process.env.PORT || 3737}`,
        }

        // Parse stored config and add as env vars
        try {
            const config = JSON.parse(plugin.config || '{}')
            for (const [k, v] of Object.entries(config)) {
                env[k.toUpperCase()] = String(v)
            }
        } catch { }

        // Spawn the process detached
        const proc = Bun.spawn(['cmd', '/c', cmd], {
            cwd: process.cwd(),
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        // Wait a moment to see if it crashes immediately
        await new Promise(r => setTimeout(r, 1500))

        if (proc.exitCode !== null && proc.exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text()
            db.plugins.update(pluginId, {
                status: 'error',
                error: stderr.substring(0, 200) || `Exit code: ${proc.exitCode}`,
            } as any)
            return { ok: false, error: stderr.substring(0, 200) }
        }

        // Verify the port is reachable
        let reachable = false
        for (let i = 0; i < 5; i++) {
            try {
                const r = await fetch(`http://localhost:${port}/api/status`)
                if (r.ok) { reachable = true; break }
            } catch { }
            await new Promise(r => setTimeout(r, 500))
        }

        if (!reachable) {
            db.plugins.update(pluginId, {
                status: 'error',
                error: `Started but port ${port} not reachable`,
            } as any)
            return { ok: false, error: `Port ${port} not reachable after start` }
        }

        db.plugins.update(pluginId, {
            status: 'running',
            port,
            error: null,
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

/** Stop a plugin process by killing whatever is on its port */
export async function stopPlugin(pluginId: number): Promise<{ ok: boolean; error?: string }> {
    const plugin = db.plugins.select().where({ id: pluginId } as any).first()
    if (!plugin) return { ok: false, error: 'Plugin not found' }

    const port = plugin.port
    if (!port) {
        db.plugins.update(pluginId, { status: 'stopped' })
        return { ok: true }
    }

    try {
        // Tell the plugin to shut down gracefully via its API
        try {
            await fetch(`http://localhost:${port}/api/auth/disconnect`, { method: 'POST' })
        } catch { }

        // Kill the process on the port (Windows)
        const proc = Bun.spawn(['cmd', '/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`], {
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        await proc.exited

        db.plugins.update(pluginId, { status: 'stopped', error: null } as any)
        return { ok: true }
    } catch (err: any) {
        // Even if kill fails, mark as stopped
        db.plugins.update(pluginId, { status: 'stopped' })
        return { ok: true }
    }
}
