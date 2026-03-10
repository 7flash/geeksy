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
    }

    const fetchMetrics = () => fetch('/api/metrics').then(r => r.json()).then(updateMetricsBar).catch(() => { })
    fetchMetrics()
    setInterval(fetchMetrics, 20_000)
}
