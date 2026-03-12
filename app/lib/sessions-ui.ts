// app/lib/sessions-ui.ts — Session management UI: CRUD, selection, modals, telegram setup
import { renderMarkdown } from './markdown'
import { dom } from './state'
import { appendUserBubble, appendResponseBubble, scrollDown } from './chat-ui'

let activeSessionId: number | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastKnownMsgCount = 0

// ── Pinned sessions (localStorage) ──
const PINNED_KEY = 'geeksy_pinned_sessions'
function getPinnedIds(): Set<number> {
    try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')) }
    catch { return new Set() }
}
function savePinnedIds(ids: Set<number>) {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]))
}
function togglePin(id: number): boolean {
    const pins = getPinnedIds()
    if (pins.has(id)) { pins.delete(id) } else { pins.add(id) }
    savePinnedIds(pins)
    return pins.has(id)
}

// ── Session tags (localStorage) ──
const TAGS_KEY = 'geeksy_session_tags'
const TAG_DEFS = [
    { id: 'debug', label: 'Debug', color: '#ef4444' },
    { id: 'feature', label: 'Feature', color: '#6366f1' },
    { id: 'research', label: 'Research', color: '#3b82f6' },
    { id: 'bug', label: 'Bug', color: '#f59e0b' },
    { id: 'idea', label: 'Idea', color: '#22c55e' },
    { id: 'review', label: 'Review', color: '#a855f7' },
] as const
type TagId = typeof TAG_DEFS[number]['id']
let _tagFilter: TagId | null = null

function getSessionTags(): Record<number, TagId[]> {
    try { return JSON.parse(localStorage.getItem(TAGS_KEY) || '{}') } catch { return {} }
}
function saveSessionTags(tags: Record<number, TagId[]>) {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags))
}
function toggleTag(sessionId: number, tag: TagId) {
    const all = getSessionTags()
    const current = all[sessionId] || []
    const idx = current.indexOf(tag)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(tag)
    if (current.length > 0) all[sessionId] = current
    else delete all[sessionId]
    saveSessionTags(all)
}
function getTagDef(id: TagId) { return TAG_DEFS.find(t => t.id === id) }

function showTagPicker(e: MouseEvent, sessionId: number, onSelect: (id: number, s: any) => void) {
    // Remove existing picker
    document.querySelector('.tag-picker-popup')?.remove()

    const currentTags = getSessionTags()[sessionId] || []
    const popup = document.createElement('div')
    popup.className = 'tag-picker-popup'
    popup.innerHTML = TAG_DEFS.map(t => {
        const isActive = currentTags.includes(t.id)
        return `<button class="tag-picker-opt${isActive ? ' active' : ''}" data-tag="${t.id}" style="--tag-color: ${t.color}">
            <span class="tag-picker-dot" style="background: ${t.color}"></span>${t.label}
        </button>`
    }).join('')

    // Position near the button
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    popup.style.top = `${rect.bottom + 4}px`
    popup.style.left = `${Math.max(4, rect.left - 60)}px`

    popup.addEventListener('click', (ev) => {
        const opt = (ev.target as HTMLElement).closest('.tag-picker-opt') as HTMLElement
        if (!opt) return
        toggleTag(sessionId, opt.dataset.tag as TagId)
        refreshSessions(onSelect)
        popup.remove()
    })

    // Close on outside click
    const closeHandler = (ev: MouseEvent) => {
        if (!popup.contains(ev.target as Node)) {
            popup.remove()
            document.removeEventListener('click', closeHandler)
        }
    }
    setTimeout(() => document.addEventListener('click', closeHandler), 0)

    document.body.appendChild(popup)
}

export function getActiveSessionId() { return activeSessionId }
/** Call after locally rendering a message to prevent polling from re-rendering it */
export function bumpKnownMsgCount(n = 1) { lastKnownMsgCount += n }

export async function loadSessions(): Promise<any[]> {
    try {
        const res = await fetch('/api/sessions')
        return await res.json()
    } catch { return [] }
}

export function renderSessionList(sessions: any[], onSelect: (id: number, session: any) => void) {
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

    // Count empty sessions for cleanup button
    const emptySessions = sessions.filter(s => (s.messageCount || 0) === 0)

    list.innerHTML = ''

    // Add cleanup button if there are empty sessions
    if (emptySessions.length > 0) {
        const cleanupBar = document.createElement('div')
        cleanupBar.className = 'session-cleanup-bar'
        cleanupBar.innerHTML = `
            <button class="session-cleanup-btn" title="Remove ${emptySessions.length} empty session(s)">
                🗑 Clean ${emptySessions.length} empty
            </button>
        `
        cleanupBar.querySelector('.session-cleanup-btn')?.addEventListener('click', async () => {
            const btn = cleanupBar.querySelector('.session-cleanup-btn') as HTMLButtonElement
            btn.textContent = '⏳ Cleaning...'
            btn.disabled = true
            try {
                const res = await fetch('/api/sessions?cleanup=empty', { method: 'DELETE' })
                const data = await res.json()
                if (activeSessionId && emptySessions.some(s => s.id === activeSessionId)) {
                    activeSessionId = null
                    updateHeaderForSession(null)
                }
                refreshSessions(onSelect)
            } catch { btn.textContent = '❌ Failed'; btn.disabled = false }
        })
        list.appendChild(cleanupBar)
    }

    // Tag filter bar
    const tagFilterBar = document.createElement('div')
    tagFilterBar.className = 'session-tag-filter-bar'
    tagFilterBar.innerHTML = `
        <button class="tag-filter-chip${!_tagFilter ? ' active' : ''}" data-tag="">All</button>
        ${TAG_DEFS.map(t => `<button class="tag-filter-chip${_tagFilter === t.id ? ' active' : ''}" data-tag="${t.id}" style="--tag-color: ${t.color}">${t.label}</button>`).join('')}
    `
    tagFilterBar.addEventListener('click', (e) => {
        const chip = (e.target as HTMLElement).closest('.tag-filter-chip') as HTMLElement
        if (!chip) return
        const tag = chip.dataset.tag as TagId | ''
        _tagFilter = tag || null
        refreshSessions(onSelect)
    })
    list.appendChild(tagFilterBar)

    // Sort: pinned first, then by most recent
    const pinnedIds = getPinnedIds()
    const sorted = [...sessions].sort((a, b) => {
        const ap = pinnedIds.has(a.id) ? 1 : 0
        const bp = pinnedIds.has(b.id) ? 1 : 0
        if (ap !== bp) return bp - ap
        return (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id)
    })

    // Apply tag filter
    const allTags = getSessionTags()
    const filtered = _tagFilter
        ? sorted.filter(s => (allTags[s.id] || []).includes(_tagFilter!))
        : sorted

    for (const s of filtered) {
        const isPinned = pinnedIds.has(s.id)
        const sessionTags = allTags[s.id] || []
        const tagBadgesHtml = sessionTags.map(tid => {
            const def = getTagDef(tid)
            return def ? `<span class="session-tag-dot" style="background: ${def.color}" title="${def.label}"></span>` : ''
        }).join('')
        const item = document.createElement('div')
        item.className = `session-item${s.id === activeSessionId ? ' active' : ''}`
        item.dataset.id = String(s.id)
        item.dataset.type = s.type
        item.innerHTML = `
            <div class="session-item-icon">
                ${s.type === 'telegram_bot' ? '📱' : '🌐'}
            </div>
            <div class="session-item-info">
                <div class="session-item-name">${isPinned ? '📌 ' : ''}${s.name} ${tagBadgesHtml}</div>
                <div class="session-item-meta">
                    <span class="session-type-badge session-type-${s.type}">
                        ${s.type === 'telegram_bot' ? 'Telegram' : 'Web'}
                    </span>
                    <span class="session-item-msgs">${s.messageCount || 0} msgs</span>
                </div>
            </div>
            <div class="session-item-actions">
                <button class="session-tag-btn" data-id="${s.id}" title="Tag session">🏷</button>
                <button class="session-pin-btn" data-id="${s.id}" title="${isPinned ? 'Unpin' : 'Pin'} session">${isPinned ? '📌' : '📍'}</button>
                <button class="session-export-btn" data-id="${s.id}" title="Export conversation">📥</button>
                <button class="session-delete-btn" data-id="${s.id}" title="Delete session">×</button>
            </div>
        `

        item.querySelector('.session-tag-btn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            showTagPicker(e as MouseEvent, s.id, onSelect)
        })

        item.querySelector('.session-pin-btn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            togglePin(s.id)
            refreshSessions(onSelect)
        })

        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.session-tag-btn')) return
            if ((e.target as HTMLElement).closest('.session-delete-btn')) return
            if ((e.target as HTMLElement).closest('.session-pin-btn')) return
            if ((e.target as HTMLElement).closest('.session-export-btn')) return
            onSelect(s.id, s)
        })

        item.querySelector('.session-export-btn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            window.open(`/api/conversations/export?sessionId=${s.id}&format=md`, '_blank')
        })

        item.querySelector('.session-delete-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation()
            if (!confirm(`Delete session "${s.name}"?`)) return
            await fetch(`/api/sessions?id=${s.id}`, { method: 'DELETE' })
            if (activeSessionId === s.id) {
                activeSessionId = null
                updateHeaderForSession(null)
            }
            refreshSessions(onSelect)
        })

        list.appendChild(item)
    }
}

export async function selectSession(id: number, session?: any) {
    activeSessionId = id
    localStorage.setItem('geeksy:activeSessionId', String(id))

    document.querySelectorAll('.session-item').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.id === String(id))
    })

    if (!session) {
        try {
            const res = await fetch(`/api/sessions?id=${id}`)
            if (res.ok) {
                session = await res.json()
            } else if (res.status === 404) {
                localStorage.removeItem('geeksy:activeSessionId')
                refreshSessions()
                return
            }
        } catch { }
    }
    updateHeaderForSession(session)
    await loadSessionChat(id)
    startMessagePolling(id)

    // ── Telegram sessions: disable chat input ──
    const input = document.getElementById('input') as HTMLTextAreaElement | null
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null
    const isTelegram = session?.type === 'telegram_bot'

    // Remove any existing banner
    document.getElementById('tg-readonly-banner')?.remove()

    if (input) {
        input.disabled = isTelegram
        input.placeholder = isTelegram ? 'This session is managed via Telegram Bot' : 'Message Gateway...'
        input.style.opacity = isTelegram ? '0.4' : '1'
    }
    if (sendBtn) {
        sendBtn.disabled = isTelegram
        sendBtn.style.opacity = isTelegram ? '0.3' : '1'
    }

    if (isTelegram) {
        const banner = document.createElement('div')
        banner.id = 'tg-readonly-banner'
        banner.style.cssText = 'padding:8px 16px;background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.2);border-radius:8px;margin:0 16px 8px;font-size:12px;color:#60a5fa;text-align:center;'
        banner.textContent = '📱 Messages in this session are routed through Telegram. Reply via the bot.'
        const chatArea = document.getElementById('chat-area')
        chatArea?.parentElement?.insertBefore(banner, chatArea)
    }
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
    const chatArea = document.getElementById('chat-area')
    if (!chatArea) return

    try {
        // Fetch messages for this session from the state API
        const res = await fetch(`/api/sessions/messages?sessionId=${sessionId}`)
        const messages = await res.json()

        if (!Array.isArray(messages) || messages.length === 0) {
            chatArea.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3>Ready to chat</h3>
                    <p>Send a message to start this session</p>
                </div>
            `
            lastKnownMsgCount = 0
            return
        }

        // Clear and render all messages
        chatArea.innerHTML = ''
        for (const msg of messages) {
            if (msg.role === 'user') {
                appendUserBubble(msg.content)
            } else if (msg.role === 'assistant' && msg.content) {
                appendResponseBubble(msg.content)
            }
        }
        lastKnownMsgCount = messages.length
        scrollDown()
    } catch {
        chatArea.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>Ready to chat</h3>
                <p>Send a message to start this session</p>
            </div>
        `
        lastKnownMsgCount = 0
    }
}

/** Poll for new messages from other devices/sessions */
function startMessagePolling(sessionId: number) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
        if (activeSessionId !== sessionId) return
        // Skip polling while actively processing — sendMessage handles rendering
        if ((window as any).__geeksy_isRunning) return
        try {
            const res = await fetch(`/api/sessions/messages?sessionId=${sessionId}&count=true`)
            const data = await res.json()
            const serverCount = data.count ?? 0
            if (serverCount > lastKnownMsgCount) {
                // New messages arrived — fetch only the new ones
                const newRes = await fetch(`/api/sessions/messages?sessionId=${sessionId}&offset=${lastKnownMsgCount}`)
                const newMsgs = await newRes.json()
                if (Array.isArray(newMsgs) && newMsgs.length > 0) {
                    for (const msg of newMsgs) {
                        if (msg.role === 'user') {
                            appendUserBubble(msg.content)
                        } else if (msg.role === 'assistant' && msg.content) {
                            appendResponseBubble(msg.content)
                        }
                    }
                    lastKnownMsgCount = serverCount
                    scrollDown()
                }
            }
        } catch { /* silent — network hiccup */ }
    }, 3000)
}

export function stopMessagePolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export async function refreshSessions(onSelect?: (id: number, session: any) => void) {
    const sessions = await loadSessions()
    renderSessionList(sessions, onSelect || selectSession)
}

// ── Modals ──

export function openNewSessionModal() {
    const modal = document.getElementById('new-session-modal')
    if (modal) modal.style.display = 'flex'
}

export function closeNewSessionModal() {
    const modal = document.getElementById('new-session-modal')
    if (modal) modal.style.display = 'none'
}

export function openTelegramSetupModal() {
    closeNewSessionModal()
    const modal = document.getElementById('telegram-setup-modal')
    if (modal) modal.style.display = 'flex'
}

export function closeTelegramSetupModal() {
    const modal = document.getElementById('telegram-setup-modal')
    if (modal) modal.style.display = 'none'
}

export async function createWebSession() {
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

export async function createTelegramSession() {
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
        const testRes = await fetch(`https://api.telegram.org/bot${token}/getMe`)
        const testData = await testRes.json() as any

        if (!testData.ok) {
            alert('Invalid bot token. Check the token from BotFather.')
            if (connectBtn) { connectBtn.textContent = 'Connect Bot'; connectBtn.disabled = false }
            return
        }

        const botName = testData.result.first_name || 'Bot'

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

        await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: 1, key: 'tg_bot_token', value: token })
        })

        closeTelegramSetupModal()
        await refreshSessions()
        if (data.session?.id) selectSession(data.session.id, data.session)

        if (tokenInput) tokenInput.value = ''
        if (nameInput) nameInput.value = ''
    } catch (err) {
        alert('Failed to connect. Check your internet connection.')
        console.error(err)
    } finally {
        if (connectBtn) { connectBtn.textContent = 'Connect Bot'; connectBtn.disabled = false }
    }
}

/** Wire up all session-related event listeners */
export async function initSessionUI() {
    document.getElementById('new-session-btn')?.addEventListener('click', openNewSessionModal)
    document.getElementById('close-session-modal')?.addEventListener('click', closeNewSessionModal)
    document.getElementById('create-web-session')?.addEventListener('click', createWebSession)
    document.getElementById('create-telegram-session')?.addEventListener('click', openTelegramSetupModal)

    document.getElementById('close-telegram-modal')?.addEventListener('click', closeTelegramSetupModal)
    document.getElementById('tg-setup-back')?.addEventListener('click', () => {
        closeTelegramSetupModal()
        openNewSessionModal()
    })
    document.getElementById('tg-setup-connect')?.addEventListener('click', createTelegramSession)

    document.getElementById('new-session-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('session-modal-overlay')) closeNewSessionModal()
    })
    document.getElementById('telegram-setup-modal')?.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('session-modal-overlay')) closeTelegramSetupModal()
    })

    // ── Mobile sidebar drawer ──
    const menuBtn = document.getElementById('mobile-menu-btn')
    const sidebar = document.querySelector('.session-sidebar') as HTMLElement
    if (menuBtn && sidebar) {
        // Create overlay
        const overlay = document.createElement('div')
        overlay.className = 'mobile-sidebar-overlay'
        document.body.appendChild(overlay)

        const toggleSidebar = (open: boolean) => {
            sidebar.classList.toggle('mobile-open', open)
            overlay.classList.toggle('visible', open)
        }

        menuBtn.addEventListener('click', () => {
            toggleSidebar(!sidebar.classList.contains('mobile-open'))
        })

        overlay.addEventListener('click', () => toggleSidebar(false))

        // Auto-close on session select (mobile)
        const origSelect = selectSession
        const wrappedSelect = async (id: number, session?: any) => {
            await origSelect(id, session)
            if (window.innerWidth <= 768) toggleSidebar(false)
        }
        // Re-render session list with wrapped handler
        refreshSessions(wrappedSelect)
    }

    // Restore last session and load its messages
    // Sessions are the primary concept — this is where messages get loaded
    const savedSessionId = localStorage.getItem('geeksy:activeSessionId')

    const sessions = await loadSessions()
    if (savedSessionId) {
        activeSessionId = Number(savedSessionId)
        const session = sessions.find((s: any) => s.id === activeSessionId)
        await selectSession(activeSessionId, session)
    } else if (sessions.length > 0) {
        // Auto-select the first (most recent) session
        await selectSession(sessions[0].id, sessions[0])
    }

    refreshSessions()
}
