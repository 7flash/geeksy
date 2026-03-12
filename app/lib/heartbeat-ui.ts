// app/lib/heartbeat-ui.ts — Heartbeat toggle button, tooltip, status polling, follow-up display

export function initHeartbeatUI() {
    const heartbeatBtn = document.getElementById('heartbeat-toggle-btn')
    if (!heartbeatBtn) return

    const tooltip = document.createElement('div')
    tooltip.className = 'heartbeat-tooltip'
    tooltip.style.cssText = `
        position: absolute; top: 100%; right: 0; margin-top: 8px;
        background: rgba(20,20,30,0.95); border: 1px solid rgba(128,90,255,0.3);
        border-radius: 10px; padding: 12px 16px; min-width: 260px;
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

    // Follow-up count badge (hidden when 0)
    const fuBadge = document.createElement('span')
    fuBadge.style.cssText = `
        position: absolute; top: -4px; left: -4px; min-width: 16px; height: 16px;
        border-radius: 8px; background: linear-gradient(135deg, #a855f7, #6366f1);
        color: #fff; font-size: 10px; font-weight: 700; display: none;
        align-items: center; justify-content: center; padding: 0 4px;
        box-shadow: 0 2px 6px rgba(139,92,246,0.5);
        animation: pulse-dot 2s infinite;
    `
    heartbeatBtn.appendChild(fuBadge)

    const formatAgo = (ts: number) => {
        if (!ts) return 'never'
        const sec = Math.floor((Date.now() - ts) / 1000)
        if (sec < 60) return `${sec}s ago`
        if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
        return `${Math.floor(sec / 3600)}h ago`
    }

    const formatCountdown = (ms: number) => {
        if (ms <= 0) return 'ready'
        const sec = Math.ceil(ms / 1000)
        if (sec < 60) return `${sec}s`
        return `${Math.floor(sec / 60)}m ${sec % 60}s`
    }

    const updateUI = (data: any) => {
        const paused = data.paused
        heartbeatBtn.classList.toggle('paused', paused)
        heartbeatBtn.style.opacity = paused ? '0.6' : '1'
        heartbeatBtn.style.filter = paused ? 'grayscale(0.8)' : 'none'

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

        // Follow-up badge
        const fuCount = data.followUpQueueLength || 0
        if (fuCount > 0) {
            fuBadge.textContent = String(fuCount)
            fuBadge.style.display = 'flex'
        } else {
            fuBadge.style.display = 'none'
        }

        const status = paused ? '⏸ Paused' : data.isRunning ? '🔄 Running' : '✓ Idle'
        const lastResult = data.lastTickResult || 'pending'
        const resultIcons: Record<string, string> = { idle: '😴', acted: '⚡', pruned: '🧹', paused: '⏸', error: '❌', pending: '⏳', skipped: '⏭' }
        const resultIcon = resultIcons[lastResult] || '❓'

        // Follow-ups section
        const followUps: any[] = data.followUps || []
        let fuHtml = ''
        if (followUps.length > 0) {
            fuHtml = `
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(128,90,255,0.2)">
                    <div style="font-weight:600;color:#a855f7;margin-bottom:4px;font-size:11px">📋 Pending Follow-ups</div>
                    ${followUps.map((fu: any, i: number) => `
                        <div style="margin:3px 0;padding:4px 6px;background:rgba(139,92,246,0.1);border-radius:6px;border-left:2px solid #a855f7">
                            <div style="color:#e0d4ff;font-size:11px">${i + 1}. ${fu.reason}</div>
                            <div style="color:#888;font-size:10px;margin-top:1px">
                                ${fu.readyIn > 0 ? `⏱ ${formatCountdown(fu.readyIn)}` : '✓ ready'}
                                ${fu.context ? ` · ${fu.context}` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `
        }

        // History section
        const historyList: any[] = data.lastToolCalls || []
        let historyHtml = ''
        if (historyList.length > 0) {
            historyHtml = `
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(128,90,255,0.2)">
                    <div style="font-weight:600;color:#94a3b8;margin-bottom:4px;font-size:11px">🕒 Recent Actions</div>
                    ${historyList.slice(-5).reverse().map((tool: any) => `
                        <div style="margin:2px 0;font-size:10px;color:#888;display:flex;gap:6px">
                            <span style="color:#aaa;flex-shrink:0">${formatAgo(tool.at)}</span>
                            <span style="color:#cbd5e1" class="truncate">${tool.name}</span>
                            ${tool.result ? `<span style="color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tool.result}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            `
        }

        tooltip.innerHTML = `
            <div style="font-weight:600;color:#fff;margin-bottom:6px">Heartbeat ${status}</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;line-height:1.6">
                <span style="color:#888">Last tick</span><span>${formatAgo(data.lastTickAt)}</span>
                <span style="color:#888">Result</span><span>${resultIcon} ${lastResult}</span>
                <span style="color:#888">Total ticks</span><span>${data.totalTicks || 0}</span>
                <span style="color:#888">Skipped</span><span>${data.totalSkips || 0}</span>
                <span style="color:#888">Failures</span><span style="color:${data.consecutiveFailures > 0 ? '#ef4444' : '#4ade80'}">${data.consecutiveFailures || 0}</span>
                <span style="color:#888">Uptime</span><span>${data.uptimeMs ? Math.floor(data.uptimeMs / 60000) + 'm' : '—'}</span>
                <span style="color:#888">Follow-ups</span><span style="color:${fuCount > 0 ? '#a855f7' : '#4ade80'}">${fuCount}</span>
                <span style="color:#888">Interval</span><span>${data.currentIntervalMs ? Math.floor(data.currentIntervalMs / 1000) + 's' : '—'}</span>
            </div>
            ${fuHtml}
            ${historyHtml}
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

