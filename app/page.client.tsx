// app/page.client.tsx — Gateway mount: session management + chat wiring
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

// ── Active session tracking ──
let activeSessionId: number | null = null

async function loadSessions() {
    try {
        const res = await fetch('/api/sessions')
        return await res.json()
    } catch { return [] }
}

function renderSessionList(sessions: any[]) {
    const list = document.getElementById('session-list')
    if (!list) return

    if (sessions.length === 0) {
        list.innerHTML = `
            <div class="session-empty">
                <div class="session-empty-icon">🌐</div>
                <p>No sessions yet</p>
                <p class="session-empty-hint">Create a session to start chatting</p>
            </div>
        `
        return
    }

    list.innerHTML = ''
    for (const s of sessions) {
        const item = document.createElement('div')
        item.className = `session-item${s.id === activeSessionId ? ' active' : ''}`
        item.dataset.id = String(s.id)
        item.dataset.type = s.type
        item.innerHTML = `
            <div class="session-item-icon">
                ${s.type === 'telegram_bot' ? '📱' : '🌐'}
            </div>
            <div class="session-item-info">
                <div class="session-item-name">${s.name}</div>
                <div class="session-item-meta">
                    <span class="session-type-badge session-type-${s.type}">
                        ${s.type === 'telegram_bot' ? 'Telegram' : 'Web'}
                    </span>
                    <span class="session-item-msgs">${s.messageCount || 0} msgs</span>
                </div>
            </div>
            <div class="session-item-actions">
                <button class="session-delete-btn" data-id="${s.id}" title="Delete session">×</button>
            </div>
        `

        // Click to select session
        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.session-delete-btn')) return
            selectSession(s.id, s)
        })

        // Delete button
        item.querySelector('.session-delete-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation()
            if (!confirm(`Delete session "${s.name}"?`)) return
            await fetch(`/api/sessions?id=${s.id}`, { method: 'DELETE' })
            if (activeSessionId === s.id) {
                activeSessionId = null
                updateHeaderForSession(null)
            }
            refreshSessions()
        })

        list.appendChild(item)
    }
}

async function selectSession(id: number, session?: any) {
    activeSessionId = id
    localStorage.setItem('geeksy:activeSessionId', String(id))

    // Highlight in sidebar
    document.querySelectorAll('.session-item').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.id === String(id))
    })

    // Update header
    if (!session) {
        try {
            const res = await fetch(`/api/sessions?id=${id}`)
            session = await res.json()
        } catch { }
    }
    updateHeaderForSession(session)

    // Load chat history for this session
    loadSessionChat(id)
}

function updateHeaderForSession(session: any | null) {
    const nameEl = document.getElementById('agent-header-name')
    const modelEl = document.getElementById('model-select') as HTMLSelectElement
    if (nameEl) {
        nameEl.textContent = session ? session.name : 'Gateway'
    }
    if (modelEl && session?.model) {
        modelEl.value = session.model
    }
}

async function loadSessionChat(sessionId: number) {
    try {
        const res = await fetch(`/api/chat?sessionId=${sessionId}`)
        const messages = await res.json()
        const chatArea = document.getElementById('chat-area')
        if (!chatArea) return

        if (!Array.isArray(messages) || messages.length === 0) {
            chatArea.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3>Ready to chat</h3>
                    <p>Send a message to start this session</p>
                </div>
            `
            return
        }

        // The existing chat rendering in agents.tsx handles this
        // For now just trigger a standard restore
    } catch { }
}

async function refreshSessions() {
    const sessions = await loadSessions()
    renderSessionList(sessions)
}

// ── Modal handlers ──

function openNewSessionModal() {
    const modal = document.getElementById('new-session-modal')
    if (modal) modal.style.display = 'flex'
}

function closeNewSessionModal() {
    const modal = document.getElementById('new-session-modal')
    if (modal) modal.style.display = 'none'
}

function openTelegramSetupModal() {
    closeNewSessionModal()
    const modal = document.getElementById('telegram-setup-modal')
    if (modal) modal.style.display = 'flex'
}

function closeTelegramSetupModal() {
    const modal = document.getElementById('telegram-setup-modal')
    if (modal) modal.style.display = 'none'
}

async function createWebSession() {
    closeNewSessionModal()
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Web Session', type: 'web' })
        })
        const data = await res.json()
        await refreshSessions()
        if (data.session?.id) selectSession(data.session.id, data.session)
    } catch (err) {
        console.error('Failed to create web session:', err)
    }
}

async function createTelegramSession() {
    const tokenInput = document.getElementById('tg-bot-token-input') as HTMLInputElement
    const nameInput = document.getElementById('tg-session-name-input') as HTMLInputElement
    const token = tokenInput?.value.trim()
    const name = nameInput?.value.trim() || 'Telegram Bot'

    if (!token) {
        tokenInput?.focus()
        tokenInput?.style.setProperty('border-color', 'var(--red)')
        setTimeout(() => tokenInput?.style.removeProperty('border-color'), 2000)
        return
    }

    const connectBtn = document.getElementById('tg-setup-connect') as HTMLButtonElement
    if (connectBtn) {
        connectBtn.textContent = 'Connecting...'
        connectBtn.disabled = true
    }

    try {
        // Validate token with Telegram API
        const testRes = await fetch(`https://api.telegram.org/bot${token}/getMe`)
        const testData = await testRes.json() as any

        if (!testData.ok) {
            alert('Invalid bot token. Check the token from BotFather.')
            if (connectBtn) { connectBtn.textContent = 'Connect Bot'; connectBtn.disabled = false }
            return
        }

        const botName = testData.result.first_name || 'Bot'

        // Create session
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name || botName,
                type: 'telegram_bot',
                config: { botToken: token, botUsername: testData.result.username }
            })
        })
        const data = await res.json()

        // Also save the bot token to agentState for the tg-bot polling
        await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 1, key: 'tg_bot_token', value: token })
        })

        closeTelegramSetupModal()
        await refreshSessions()
        if (data.session?.id) selectSession(data.session.id, data.session)

        // Clear inputs
        if (tokenInput) tokenInput.value = ''
        if (nameInput) nameInput.value = ''
    } catch (err) {
        alert('Failed to connect. Check your internet connection.')
        console.error(err)
    } finally {
        if (connectBtn) { connectBtn.textContent = 'Connect Bot'; connectBtn.disabled = false }
    }
}

// ── Main mount ──

export default function mount() {
    initDom()

    // Load skills and models
    loadSkills()
    loadModels()

    // Model change → persist
    dom.modelSelect.addEventListener('change', () => {
        if (activeSessionId) {
            fetch('/api/sessions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: activeSessionId, model: dom.modelSelect.value }),
            }).catch(() => { })
        }
    })

    // Tab switching
    document.getElementById('tab-bar')!.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null
        if (!tab) return
        const tabName = tab.dataset.tab as any
        if (tabName) switchTab(tabName)
    })

    // Settings event
    window.addEventListener('smart-agent:open-settings', openSettings)

    // ── Session Management ──
    document.getElementById('new-session-btn')?.addEventListener('click', openNewSessionModal)
    document.getElementById('close-session-modal')?.addEventListener('click', closeNewSessionModal)
    document.getElementById('create-web-session')?.addEventListener('click', createWebSession)
    document.getElementById('create-telegram-session')?.addEventListener('click', openTelegramSetupModal)

    // Telegram setup modal
    document.getElementById('close-telegram-modal')?.addEventListener('click', closeTelegramSetupModal)
    document.getElementById('tg-setup-back')?.addEventListener('click', () => {
        closeTelegramSetupModal()
        openNewSessionModal()
    })
    document.getElementById('tg-setup-connect')?.addEventListener('click', createTelegramSession)

    // Close modals on overlay click
    document.getElementById('new-session-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('session-modal-overlay')) closeNewSessionModal()
    })
    document.getElementById('telegram-setup-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('session-modal-overlay')) closeTelegramSetupModal()
    })

    // Header action buttons
    document.getElementById('export-chat-btn')?.addEventListener('click', exportChatAsMarkdown)
    document.getElementById('clear-chat-btn')?.addEventListener('click', clearCurrentChat)

    // Heartbeat Toggle + Status Widget
    const heartbeatBtn = document.getElementById('heartbeat-toggle-btn')
    if (heartbeatBtn) {
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

    // ── Metrics Bar ──
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

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault()
            clearCurrentChat()
        }
        if (e.key === 'Escape') {
            closeNewSessionModal()
            closeTelegramSetupModal()
            if (state.isRunning) stopAgent()
            else closeSettings()
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

    // ── Restore last active session ──
    const savedSessionId = localStorage.getItem('geeksy:activeSessionId')
    if (savedSessionId) {
        activeSessionId = Number(savedSessionId)
        selectSession(activeSessionId)
    }

    // Refresh session list
    refreshSessions()

    // Restore agent state (existing logic for chat)
    restoreState()

    return () => { }
}
