// app/lib/metrics-ui.ts — Metrics bar polling and display
import { getActiveSessionId } from './sessions-ui'

function updateMetricsBar(data: any) {
    const set = (id: string, v: string) => {
        const e = document.getElementById(id)
        if (e) e.textContent = v
    }

    set('metric-val-messages', String(data.messages?.total ?? '—'))
    set('metric-val-schedules', `${data.schedules?.totalSuccess ?? 0}✓ ${data.schedules?.totalFail ?? 0}✗`)
}

export function refreshMetricsBar() {
    const sessionId = getActiveSessionId()
    const url = sessionId ? `/api/metrics?sessionId=${sessionId}` : '/api/metrics'
    return fetch(url)
        .then(r => r.json())
        .then(updateMetricsBar)
        .catch(() => { })
}

export function initMetricsUI() {
    refreshMetricsBar()
    setInterval(refreshMetricsBar, 20_000)

    window.addEventListener('geeksy:session-changed', () => { refreshMetricsBar() })
    window.addEventListener('geeksy:refresh-metrics', () => { refreshMetricsBar() })
}
