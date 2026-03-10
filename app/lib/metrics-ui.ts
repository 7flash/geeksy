// app/lib/metrics-ui.ts — Metrics bar polling and display

export function initMetricsUI() {
    const updateMetricsBar = (data: any) => {
        const set = (id: string, v: string) => { const e = document.getElementById(id); if (e) e.textContent = v }
        set('metric-val-messages', String(data.messages?.total ?? '—'))
        set('metric-val-objectives', `${data.objectives?.completed ?? 0}/${data.objectives?.total ?? 0}`)
        set('metric-val-schedules', `${data.schedules?.totalSuccess ?? 0}✓ ${data.schedules?.totalFail ?? 0}✗`)

        // Plugin metric — show healthy/running with color coding
        const pluginEl = document.getElementById('metric-val-plugins')
        if (pluginEl) {
            const running = data.plugins?.running ?? 0
            const total = data.plugins?.total ?? 0
            const healthy = data.plugins?.healthy ?? 0

            pluginEl.textContent = `${running}/${total}`

            // Color: green if all healthy, amber if some unhealthy, red if errors
            if (running > 0 && healthy === running) {
                pluginEl.style.color = 'var(--green)'
            } else if (running > 0 && healthy < running) {
                pluginEl.style.color = 'var(--amber)'
            } else {
                pluginEl.style.color = ''
            }

            // Tooltip with per-plugin details
            const items = data.plugins?.items || []
            if (items.length > 0) {
                const lines = items.map((p: any) => {
                    const icon = p.status !== 'running' ? '⏹' : p.healthy ? '✅' : '❌'
                    const ms = p.responseMs != null ? ` (${p.responseMs}ms)` : ''
                    const err = p.error ? ` — ${p.error}` : ''
                    return `${icon} ${p.name}${ms}${err}`
                })
                pluginEl.title = lines.join('\n')
            }
        }

        set('metric-val-uptime', (() => {
            const mins = data.uptimeMin ?? 0
            if (mins < 60) return `${mins}m`
            if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`
            return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
        })())

        // Heartbeat metric
        const hbEl = document.getElementById('metric-val-heartbeat')
        if (hbEl) {
            const hb = data.heartbeat || {}
            const ticks = hb.totalTicks || 0
            const intervalSec = Math.round((hb.intervalMs || 60000) / 1000)
            hbEl.textContent = `${ticks}×${intervalSec}s`

            // Color by status
            const colors: Record<string, string> = {
                acted: 'var(--green)', idle: '', error: 'var(--red)',
                paused: 'var(--text-tertiary)', skipped: 'var(--text-tertiary)',
            }
            hbEl.style.color = colors[hb.lastTickResult] || ''

            // Tooltip
            const lines = [
                `Status: ${hb.lastTickResult || 'pending'}`,
                `Interval: ${intervalSec}s (adaptive 30s–300s)`,
                `Ticks: ${ticks}, Skips: ${hb.totalSkips || 0}`,
                hb.consecutiveFailures > 0 ? `⚠️ Failures: ${hb.consecutiveFailures}` : '',
            ]
            const tools = hb.lastToolCalls || []
            if (tools.length > 0) {
                lines.push('', 'Last tools:')
                tools.forEach((t: any) => lines.push(`  └ ${t.name}${t.result ? ': ' + t.result.substring(0, 40) : ''}`))
            }
            hbEl.title = lines.filter(Boolean).join('\n')
        }
    }

    const fetchMetrics = () => fetch('/api/metrics').then(r => r.json()).then(updateMetricsBar).catch(() => { })
    fetchMetrics()
    setInterval(fetchMetrics, 20_000)
}
