// app/lib/sessions-ui.ts — Session management UI: CRUD, selection, modals, telegram setup
import { renderMarkdown } from './markdown'
import { dom } from './state'
import { appendUserBubble, appendResponseBubble, scrollDown } from './chat-ui'

let activeSessionId: number | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let lastKnownMsgCount = 0

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
                <button class="session-export-btn" data-id="${s.id}" title="Export conversation">📥</button>
                <button class="session-delete-btn" data-id="${s.id}" title="Delete session">×</button>
            </div>
        `

        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.session-delete-btn')) return
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
