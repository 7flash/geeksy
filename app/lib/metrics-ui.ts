// app/lib/metrics-ui.ts — Metrics bar polling and display

export function initMetricsUI() {
    const updateMetricsBar = (data: any) => {
        const set = (id: string, v: string) => { const e = document.getElementById(id); if (e) e.textContent = v }
        set('metric-val-messages', String(data.messages?.total ?? '—'))
        set('metric-val-objectives', `${data.objectives?.completed ?? 0}/${data.objectives?.total ?? 0}`)
        set('metric-val-schedules', `${data.schedules?.totalSuccess ?? 0}✓ ${data.schedules?.totalFail ?? 0}✗`)
        set('metric-val-plugins', `${data.plugins?.running ?? 0}/${data.plugins?.total ?? 0}`)
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
