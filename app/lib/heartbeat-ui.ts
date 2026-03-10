// app/lib/heartbeat-ui.ts — Heartbeat toggle button, tooltip, status polling

export function initHeartbeatUI() {
    const heartbeatBtn = document.getElementById('heartbeat-toggle-btn')
    if (!heartbeatBtn) return

    const tooltip = document.createElement('div')
    tooltip.className = 'heartbeat-tooltip'
    tooltip.style.cssText = `
        position: absolute; top: 100%; right: 0; margin-top: 8px;
        background: rgba(20,20,30,0.95); border: 1px solid rgba(128,90,255,0.3);
        border-radius: 10px; padding: 12px 16px; min-width: 220px;
        font-size: 12px; color: #ccc; pointer-events: none;
        opacity: 0; transition: opacity 0.2s; z-index: 1000;
        backdrop-filter: blur(12px); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    `
    heartbeatBtn.style.position = 'relative'
    heartbeatBtn.appendChild(tooltip)

    const dot = document.createElement('span')
    dot.style.cssText = `
        position: absolute; top: 2px; right: 2px; width: 7px; height: 7px;
        border-radius: 50%; background: #4ade80;
    `
    heartbeatBtn.appendChild(dot)

    const formatAgo = (ts: number) => {
        if (!ts) return 'never'
        const sec = Math.floor((Date.now() - ts) / 1000)
        if (sec < 60) return `${sec}s ago`
        if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
        return `${Math.floor(sec / 3600)}h ago`
    }

    const updateUI = (data: any) => {
        const paused = data.paused
        heartbeatBtn.classList.toggle('paused', paused)
        heartbeatBtn.style.opacity = paused ? '0.3' : '1'
        heartbeatBtn.style.filter = paused ? 'grayscale(1)' : 'none'

        if (data.consecutiveFailures > 0) {
            dot.style.background = '#ef4444'
            dot.style.animation = 'none'
        } else if (paused) {
            dot.style.background = '#f59e0b'
            dot.style.animation = 'none'
        } else {
            dot.style.background = '#4ade80'
            dot.style.animation = 'pulse-dot 2s infinite'
        }

        const status = paused ? '⏸ Paused' : data.isRunning ? '🔄 Running' : '✓ Idle'
        const lastResult = data.lastTickResult || 'pending'
        const resultIcons: Record<string, string> = { idle: '😴', acted: '⚡', pruned: '🧹', paused: '⏸', error: '❌', pending: '⏳', skipped: '⏭' }
        const resultIcon = resultIcons[lastResult] || '❓'
        tooltip.innerHTML = `
            <div style="font-weight:600;color:#fff;margin-bottom:6px">Heartbeat ${status}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;line-height:1.6">
                <span style="color:#888">Last tick</span><span>${formatAgo(data.lastTickAt)}</span>
                <span style="color:#888">Result</span><span>${resultIcon} ${lastResult}</span>
                <span style="color:#888">Total ticks</span><span>${data.totalTicks || 0}</span>
                <span style="color:#888">Skipped</span><span>${data.totalSkips || 0}</span>
                <span style="color:#888">Failures</span><span style="color:${data.consecutiveFailures > 0 ? '#ef4444' : '#4ade80'}">${data.consecutiveFailures || 0}</span>
                <span style="color:#888">Uptime</span><span>${data.uptimeMs ? Math.floor(data.uptimeMs / 60000) + 'm' : '—'}</span>
            </div>
        `
    }

    const fetchStats = () => fetch('/api/heartbeat').then(r => r.json()).then(updateUI).catch(() => { })
    fetchStats()
    setInterval(fetchStats, 15000)

    heartbeatBtn.addEventListener('mouseenter', () => { fetchStats(); tooltip.style.opacity = '1' })
    heartbeatBtn.addEventListener('mouseleave', () => { tooltip.style.opacity = '0' })

    heartbeatBtn.addEventListener('click', async () => {
        const isCurrentlyPaused = heartbeatBtn.classList.contains('paused')
        try {
            await fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paused: !isCurrentlyPaused })
            })
            fetchStats()
        } catch { }
    })
}
