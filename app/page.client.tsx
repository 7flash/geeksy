// app/src/page.client.tsx — Workspace mount: event wiring only
import { configure } from 'measure-fn'
import { state, dom, initDom, getActiveAgent, saveState } from './lib/state'
import { openSettings, closeSettings } from './lib/settings'
import { switchTab } from './lib/panels'
import {
    createAgent, deleteAgent, clearCurrentChat, exportChatAsMarkdown,
    sendMessage, stopAgent, loadSkills, loadModels, restoreState, setupResizeHandle,
    renderSidebar, selectAgent,
} from './lib/agents'

configure({ timestamps: true })

export default function mount() {
    initDom()

    // Load skills and models
    loadSkills()
    loadModels()

    // Model change → instantly persist to agent
    dom.modelSelect.addEventListener('change', () => {
        const agent = getActiveAgent()
        if (!agent) return
        const model = dom.modelSelect.value
        agent.model = model
        renderSidebar()
        fetch(`/api/agents?id=${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
        }).catch(() => { })
    })

    // Tab switching
    document.getElementById('tab-bar')!.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null
        if (!tab) return
        const tabName = tab.dataset.tab as any
        if (tabName) switchTab(tabName)
    })

    // Listen for settings event from nav rail (via layout.client.tsx)
    window.addEventListener('smart-agent:open-settings', openSettings)

    // Agent Sidebar
    initAgentSidebar()

    // Header action buttons
    document.getElementById('export-chat-btn')!.addEventListener('click', exportChatAsMarkdown)
    document.getElementById('clear-chat-btn')!.addEventListener('click', clearCurrentChat)

    // Agent Export/Import
    document.getElementById('export-agent-btn')!.addEventListener('click', () => {
        const agentId = window.location.pathname.split('/').pop() || '1'
        window.open(`/api/agent-export?id=${agentId}`, '_blank')
    })
    document.getElementById('import-agent-btn')!.addEventListener('click', () => {
        (document.getElementById('import-agent-input') as HTMLInputElement)?.click()
    })
    document.getElementById('import-agent-input')?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string)
                const res = await fetch('/api/agent-export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                })
                const result = await res.json()
                if (result.success) {
                    alert(`✅ Agent imported! ${result.imported.messages} messages, ${result.imported.objectives} objectives, ${result.imported.files} files`)
                    window.location.href = `/agent/${result.agentId}`
                } else {
                    alert(`❌ Import failed: ${result.error}`)
                }
            } catch (err) {
                alert('❌ Failed to parse JSON file')
            }
        }
        reader.readAsText(file)
    })

    // Heartbeat Toggle + Status Widget
    const heartbeatBtn = document.getElementById('heartbeat-toggle-btn')
    if (heartbeatBtn) {
        // Create tooltip element for stats
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

        // Status dot indicator
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

            // Dot color: green=healthy, amber=paused, red=errors
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

            // Tooltip content
            const status = paused ? '⏸ Paused' : data.isRunning ? '🔄 Running' : '✓ Idle'
            const lastResult = data.lastTickResult || 'pending'
            const resultIcons: Record<string, string> = { idle: '😴', acted: '⚡', pruned: '🧹', paused: '⏸', error: '❌', pending: '⏳' }
            const resultIcon = resultIcons[lastResult] || '❓'
            tooltip.innerHTML = `
                <div style="font-weight:600;color:#fff;margin-bottom:6px">Heartbeat ${status}</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;line-height:1.6">
                    <span style="color:#888">Last tick</span><span>${formatAgo(data.lastTickAt)}</span>
                    <span style="color:#888">Result</span><span>${resultIcon} ${lastResult}</span>
                    <span style="color:#888">Total ticks</span><span>${data.totalTicks || 0}</span>
                    <span style="color:#888">Failures</span><span style="color:${data.consecutiveFailures > 0 ? '#ef4444' : '#4ade80'}">${data.consecutiveFailures || 0}</span>
                    <span style="color:#888">Uptime</span><span>${data.uptimeMs ? Math.floor(data.uptimeMs / 60000) + 'm' : '—'}</span>
                </div>
            `
        }

        // Fetch on load + poll every 15s
        const fetchStats = () => fetch('/api/heartbeat').then(r => r.json()).then(updateUI).catch(() => { })
        fetchStats()
        setInterval(fetchStats, 15000)

        // Show tooltip on hover
        heartbeatBtn.addEventListener('mouseenter', () => { fetchStats(); tooltip.style.opacity = '1' })
        heartbeatBtn.addEventListener('mouseleave', () => { tooltip.style.opacity = '0' })

        heartbeatBtn.addEventListener('click', async () => {
            const isCurrentlyPaused = heartbeatBtn.classList.contains('paused')
            const newState = !isCurrentlyPaused

            try {
                const res = await fetch('/api/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paused: newState })
                })
                const data = await res.json()
                fetchStats()
            } catch { }
        })
    }

    // ── Metrics Bar ──
    const updateMetricsBar = (data: any) => {
        const el = (id: string) => document.getElementById(id)
        const set = (id: string, v: string) => { const e = el(id); if (e) e.textContent = v }

        set('metric-val-messages', String(data.messages?.total ?? '—'))
        set('metric-val-objectives', `${data.objectives?.completed ?? 0}/${data.objectives?.total ?? 0}`)
        set('metric-val-schedules', `${data.schedules?.totalSuccess ?? 0}✓ ${data.schedules?.totalFail ?? 0}✗`)
        set('metric-val-plugins', `${data.plugins?.running ?? 0}/${data.plugins?.total ?? 0}`)
        set('metric-val-files', String(data.files ?? '—'))

        // Format uptime
        const mins = data.uptimeMin ?? 0
        if (mins < 60) set('metric-val-uptime', `${mins}m`)
        else if (mins < 1440) set('metric-val-uptime', `${Math.floor(mins / 60)}h ${mins % 60}m`)
        else set('metric-val-uptime', `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`)

        // Color the objectives metric based on success rate
        const objsEl = el('metric-val-objectives')
        if (objsEl && data.objectives) {
            const rate = data.objectives.total > 0 ? data.objectives.completed / data.objectives.total : 0
            objsEl.style.color = rate >= 0.8 ? 'var(--green)' : rate >= 0.5 ? 'var(--amber)' : 'var(--text-1)'
        }

        // Color schedule failures
        const schedEl = el('metric-val-schedules')
        if (schedEl && data.schedules?.totalFail > 0) {
            schedEl.style.color = 'var(--amber)'
        }
    }

    const fetchMetrics = () => fetch('/api/metrics').then(r => r.json()).then(updateMetricsBar).catch(() => { })
    fetchMetrics()
    setInterval(fetchMetrics, 20_000)

    // Auto-resize textarea
    dom.inputEl.addEventListener('input', () => {
        dom.inputEl.style.height = 'auto'
        dom.inputEl.style.height = Math.min(dom.inputEl.scrollHeight, 100) + 'px'
    })

    // Enter to send
    dom.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    })

    dom.sendBtn.addEventListener('click', () => {
        if (state.isRunning) stopAgent()
        else sendMessage()
    })

    // ── Chat Search (Ctrl+K) ──
    let searchOverlay: HTMLElement | null = null

    function openSearch() {
        if (searchOverlay) return
        searchOverlay = document.createElement('div')
        searchOverlay.id = 'search-overlay'
        searchOverlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
            display: flex; align-items: flex-start; justify-content: center;
            padding-top: 20vh; animation: fadeIn 0.15s ease;
        `
        const modal = document.createElement('div')
        modal.style.cssText = `
            width: 520px; max-width: 90vw; background: rgba(22,22,32,0.98);
            border: 1px solid rgba(128,90,255,0.3); border-radius: 14px;
            box-shadow: 0 16px 48px rgba(0,0,0,0.5); overflow: hidden;
        `
        const input = document.createElement('input')
        input.type = 'text'
        input.placeholder = 'Search messages...'
        input.style.cssText = `
            width: 100%; padding: 16px 20px; background: transparent;
            border: none; border-bottom: 1px solid rgba(128,90,255,0.2);
            color: #fff; font-size: 15px; font-family: 'Inter', sans-serif;
            outline: none;
        `
        const results = document.createElement('div')
        results.style.cssText = `
            max-height: 320px; overflow-y: auto; padding: 8px;
        `
        results.innerHTML = '<div style="padding:16px;color:#666;text-align:center;font-size:13px">Type to search chat history</div>'

        modal.appendChild(input)
        modal.appendChild(results)
        searchOverlay.appendChild(modal)
        document.body.appendChild(searchOverlay)
        input.focus()

        // Close on backdrop click
        searchOverlay.addEventListener('click', (e) => {
            if (e.target === searchOverlay) closeSearch()
        })

        // Search logic
        input.addEventListener('input', () => {
            const query = input.value.trim().toLowerCase()
            if (!query) {
                results.innerHTML = '<div style="padding:16px;color:#666;text-align:center;font-size:13px">Type to search chat history</div>'
                return
            }

            const msgs = dom.chatArea.querySelectorAll('.msg')
            const matches: { el: HTMLElement; text: string }[] = []

            msgs.forEach((msg: Element) => {
                const bubble = msg.querySelector('.bubble, .stream-text')
                if (!bubble) return
                const text = bubble.textContent || ''
                if (text.toLowerCase().includes(query)) {
                    matches.push({ el: msg as HTMLElement, text })
                }
            })

            if (matches.length === 0) {
                results.innerHTML = '<div style="padding:16px;color:#666;text-align:center;font-size:13px">No matches found</div>'
                return
            }

            results.innerHTML = ''
            matches.forEach(({ el, text }, i) => {
                const item = document.createElement('div')
                item.style.cssText = `
                    padding: 10px 14px; border-radius: 8px; cursor: pointer;
                    font-size: 13px; color: #ccc; line-height: 1.5;
                    transition: background 0.1s;
                `
                // Highlight match
                const idx = text.toLowerCase().indexOf(query)
                const start = Math.max(0, idx - 40)
                const end = Math.min(text.length, idx + query.length + 40)
                const snippet = (start > 0 ? '...' : '') +
                    text.substring(start, idx) +
                    `<mark style="background:rgba(128,90,255,0.4);color:#fff;border-radius:2px;padding:0 2px">${text.substring(idx, idx + query.length)}</mark>` +
                    text.substring(idx + query.length, end) +
                    (end < text.length ? '...' : '')

                const isUser = el.classList.contains('msg-user')
                item.innerHTML = `<span style="color:${isUser ? '#a78bfa' : '#888'};font-size:11px;font-weight:500">${isUser ? 'You' : 'Agent'}</span><br>${snippet}`

                item.addEventListener('mouseenter', () => { item.style.background = 'rgba(128,90,255,0.1)' })
                item.addEventListener('mouseleave', () => { item.style.background = 'none' })
                item.addEventListener('click', () => {
                    closeSearch()
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    el.style.outline = '2px solid rgba(128,90,255,0.6)'
                    el.style.borderRadius = '12px'
                    setTimeout(() => { el.style.outline = 'none' }, 2000)
                })
                results.appendChild(item)
            })
        })

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSearch()
        })
    }

    function closeSearch() {
        if (searchOverlay) {
            searchOverlay.remove()
            searchOverlay = null
        }
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault()
            openSearch()
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault()
            clearCurrentChat()
        }
        if (e.key === 'Escape') {
            if (searchOverlay) closeSearch()
            else if (state.isRunning) stopAgent()
            else closeSettings()
        }
    })

    // Example chip delegation
    document.addEventListener('click', (e) => {
        const chip = (e.target as HTMLElement).closest('[data-prompt]') as HTMLElement | null
        if (chip) {
            if (!state.activeAgentId) createAgent()
            dom.inputEl.value = chip.dataset.prompt || ''
            dom.inputEl.dispatchEvent(new Event('input'))
            sendMessage()
        }
    })

    // Overview resize
    setupResizeHandle()

    // Code block copy button delegation
    dom.chatArea.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.md-copy-btn') as HTMLElement | null
        if (!btn) return
        const code = btn.dataset.code || ''
        const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        navigator.clipboard.writeText(decoded)
        btn.textContent = '✓ Copied'
        btn.classList.add('copied')
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 1500)
    })

    // File drag-and-drop on chat area
    dom.chatArea.addEventListener('dragover', (e) => {
        e.preventDefault()
        dom.chatArea.classList.add('drag-over')
    })
    dom.chatArea.addEventListener('dragleave', () => {
        dom.chatArea.classList.remove('drag-over')
    })
    dom.chatArea.addEventListener('drop', async (e) => {
        e.preventDefault()
        dom.chatArea.classList.remove('drag-over')
        const files = e.dataTransfer?.files
        if (!files?.length) return

        if (!state.activeAgentId) createAgent()

        for (const file of Array.from(files)) {
            const text = await file.text()
            const truncated = text.length > 10000 ? text.substring(0, 10000) + '\n...(truncated)' : text
            const contextMsg = `[Attached file: ${file.name} (${(file.size / 1024).toFixed(1)}KB)]\n\n\`\`\`\n${truncated}\n\`\`\``
            dom.inputEl.value = (dom.inputEl.value ? dom.inputEl.value + '\n\n' : '') + contextMsg
            dom.inputEl.style.height = 'auto'
            dom.inputEl.style.height = Math.min(dom.inputEl.scrollHeight, 100) + 'px'
        }
        dom.inputEl.focus()
    })

    // Browser back/forward navigation
    window.addEventListener('popstate', (e) => {
        const agentId = e.state?.agentId
        if (agentId && state.agents.find(a => a.id === agentId)) {
            selectAgent(agentId)
        }
    })

    // Restore persisted state from server
    restoreState()

    return () => { }
}

// ─── Agent Sidebar ──────────────────────────────────────

function initAgentSidebar() {
    const sidebar = document.getElementById('agent-sidebar')
    const backdrop = document.getElementById('sidebar-backdrop')
    const toggleBtn = document.getElementById('sidebar-toggle')
    const closeBtn = document.getElementById('sidebar-close')
    const newBtn = document.getElementById('sidebar-new-agent')
    const list = document.getElementById('sidebar-agents-list')

    if (!sidebar || !backdrop || !toggleBtn || !list) return

    const currentAgentId = parseInt(window.location.pathname.split('/').pop() || '1')

    function openSidebar() {
        sidebar!.classList.add('open')
        backdrop!.classList.add('open')
        loadAgents()
    }

    function closeSidebar() {
        sidebar!.classList.remove('open')
        backdrop!.classList.remove('open')
    }

    toggleBtn.addEventListener('click', openSidebar)
    closeBtn?.addEventListener('click', closeSidebar)
    backdrop.addEventListener('click', closeSidebar)

    async function loadAgents() {
        try {
            const res = await fetch('/api/agents')
            const agents = await res.json() as any[]
            list!.innerHTML = ''

            for (const agent of agents) {
                const card = document.createElement('div')
                card.className = `sidebar-agent-card${agent.id === currentAgentId ? ' active' : ''}`

                const isActive = agent.id === currentAgentId
                card.innerHTML = `
                    <span class="sidebar-agent-dot${isActive ? ' active' : ''}"></span>
                    <div class="sidebar-agent-info">
                        <div class="sidebar-agent-name">${agent.name}</div>
                        <div class="sidebar-agent-model">${agent.model || 'gemini-2.5-flash'}</div>
                    </div>
                    <button class="sidebar-agent-delete" title="Delete agent">🗑</button>
                `

                // Click card to switch agent
                card.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).closest('.sidebar-agent-delete')) return
                    window.location.href = `/agent/${agent.id}`
                })

                // Delete button
                card.querySelector('.sidebar-agent-delete')?.addEventListener('click', async (e) => {
                    e.stopPropagation()
                    if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return
                    await fetch(`/api/agents?id=${agent.id}`, { method: 'DELETE' })
                    if (agent.id === currentAgentId) {
                        window.location.href = '/agent/1'
                    } else {
                        loadAgents()
                    }
                })

                list!.appendChild(card)
            }
        } catch { }
    }

    // New agent
    newBtn?.addEventListener('click', async () => {
        const name = prompt('Agent name:')
        if (!name?.trim()) return
        try {
            const res = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() }),
            })
            const agent = await res.json()
            window.location.href = `/agent/${agent.id}`
        } catch { }
    })
}
