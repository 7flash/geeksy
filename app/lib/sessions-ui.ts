// app/lib/sessions-ui.ts — Session management UI: CRUD, selection, modals, telegram setup
import { state, getActiveAgent } from './state'
import { appendUserBubble, appendResponseBubble, scrollDown } from './chat-ui'
import { renderFilesPane } from './panels'

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

function renderSessionIcon(type: string) {
    return type === 'telegram_bot' ? '📱' : type === 'api' ? '⚡' : '💬'
}

function renderSessionType(type: string) {
    return type === 'telegram_bot' ? 'Telegram' : type === 'api' ? 'API' : 'Conversation'
}

function renderChatPlaceholder(kind: 'loading' | 'no-session' | 'empty-conversation') {
    const chatArea = document.getElementById('chat-area')
    if (!chatArea) return

    if (kind === 'loading') {
        chatArea.innerHTML = `
            <div class="empty-state">
                <h2>Loading…</h2>
            </div>
        `
        return
    }

    if (kind === 'no-session') {
        chatArea.innerHTML = `
            <div class="empty-state">
                <h2>Start a conversation</h2>
                <div class="example-chips">
                    <button class="chip" type="button" data-session-action="new">New conversation</button>
                    <button class="chip" type="button" data-prompt="Help me plan today">Plan today</button>
                    <button class="chip" type="button" data-prompt="Review my project status">Review status</button>
                </div>
            </div>
        `
        wireChatPlaceholderActions(chatArea)
        return
    }

    chatArea.innerHTML = `
        <div class="empty-state">
            <h2>What can I help with?</h2>
        </div>
    `
    wireChatPlaceholderActions(chatArea)
}

function wireChatPlaceholderActions(root: HTMLElement) {
    root.querySelectorAll('[data-session-action="new"]').forEach((el) => {
        el.addEventListener('click', () => openNewSessionModal())
    })

    root.querySelectorAll('[data-prompt]').forEach((el) => {
        el.addEventListener('click', () => {
            const prompt = (el as HTMLElement).dataset.prompt || ''
            const input = document.getElementById('input') as HTMLTextAreaElement | null
            if (!input) return
            input.value = prompt
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.focus()
        })
    })
}

function applyNoSessionComposerState() {
    const input = document.getElementById('input') as HTMLTextAreaElement | null
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null
    document.getElementById('tg-readonly-banner')?.remove()

    if (input) {
        input.disabled = false
        input.placeholder = 'Ask Geeksy to start your first conversation...'
        input.style.opacity = '1'
    }

    if (sendBtn) {
        sendBtn.disabled = false
        sendBtn.style.opacity = '1'
    }
}

function wireSessionItem(item: HTMLElement, s: any, onSelect: (id: number, session: any) => void) {
    item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.session-item-actions')) return
        onSelect(s.id, s)
    })

    const actions = item.querySelector('.session-item-actions') as HTMLElement | null
    const moreBtn = item.querySelector('.session-more-btn') as HTMLButtonElement | null
    moreBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        document.querySelectorAll('.session-item-actions.menu-open').forEach((el) => {
            if (el !== actions) el.classList.remove('menu-open')
        })
        actions?.classList.toggle('menu-open')
    })

    item.querySelector('.session-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation()
        actions?.classList.remove('menu-open')
        if (!confirm(`Delete conversation "${s.name}"?`)) return
        await fetch(`/api/sessions?id=${s.id}`, { method: 'DELETE' })
        if (activeSessionId === s.id) {
            activeSessionId = null
            stopMessagePolling()
            updateHeaderForSession(null)
            applyNoSessionComposerState()
            renderChatPlaceholder('no-session')
        }
        await refreshSessions(onSelect)
    })
}

function wireExistingSessionList(onSelect: (id: number, session: any) => void) {
    document.querySelectorAll('.session-item').forEach((el) => {
        const item = el as HTMLElement
        const s = {
            id: Number(item.dataset.id),
            type: item.dataset.type || 'web',
            name: item.querySelector('.session-item-name')?.textContent?.trim() || 'Conversation',
            messageCount: Number(item.querySelector('.session-item-msgs')?.textContent?.match(/\d+/)?.[0] || 0),
        }

        const actions = item.querySelector('.session-item-actions') as HTMLElement | null
        if (actions && !actions.querySelector('.session-more-btn')) {
            actions.innerHTML = `
                <button class="session-more-btn" type="button" aria-label="Conversation actions for ${s.name}" title="Conversation actions">⋯</button>
                <div class="session-action-menu" role="menu" aria-label="Actions for ${s.name}">
                    <button class="session-delete-btn" type="button" data-id="${s.id}" title="Delete conversation">Delete conversation</button>
                </div>
            `
        }

        wireSessionItem(item, s, onSelect)
    })
}

export function renderSessionList(sessions: any[], onSelect: (id: number, session: any) => void) {
    const list = document.getElementById('session-list')
    if (!list) return

    if (sessions.length === 0) {
        list.innerHTML = `
            <div class="session-empty">
                <p class="session-empty-title">No conversations yet</p>
                <button class="session-empty-cta" type="button">Start a conversation</button>
            </div>
        `
        list.querySelector('.session-empty-cta')?.addEventListener('click', openNewSessionModal)
        return
    }

    list.innerHTML = ''
    for (const s of sessions) {
        const item = document.createElement('div')
        item.className = `session-item${s.id === activeSessionId ? ' active' : ''}`
        item.dataset.id = String(s.id)
        item.dataset.type = s.type
        item.innerHTML = `
            <div class="session-item-info">
                <div class="session-item-name">${s.name}</div>
                <div class="session-item-meta">
                    <span class="session-item-msgs">${s.messageCount || 0} msg${(s.messageCount || 0) === 1 ? '' : 's'}</span>
                </div>
            </div>
            <div class="session-item-actions">
                <button class="session-more-btn" type="button" title="Actions">⋯</button>
                <div class="session-action-menu" role="menu">
                    <button class="session-delete-btn" type="button" data-id="${s.id}">Delete</button>
                </div>
            </div>
        `

        wireSessionItem(item, s, onSelect)
        list.appendChild(item)
    }
}

export async function selectSession(id: number, session?: any) {
    activeSessionId = id
    const agent = getActiveAgent()
    if (agent) agent.sessionId = null
    localStorage.setItem('geeksy:activeSessionId', String(id))
    window.dispatchEvent(new CustomEvent('geeksy:session-changed', { detail: { sessionId: id } }))

    document.querySelectorAll('.session-item').forEach(el => {
        (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.id === String(id))
    })

    if (!session) {
        try {
            const res = await fetch(`/api/sessions?id=${id}`)
            session = await res.json()
        } catch { }
    }

    updateHeaderForSession(session)
    await loadSessionChat(id)
    await loadSessionState(id)
    startMessagePolling(id)

    const input = document.getElementById('input') as HTMLTextAreaElement | null
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement | null
    const isTelegram = session?.type === 'telegram_bot'

    document.getElementById('tg-readonly-banner')?.remove()

    if (input) {
        input.disabled = isTelegram
        input.placeholder = isTelegram ? 'This conversation continues in Telegram' : 'Ask Geeksy to work in this conversation...'
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
        banner.textContent = '📱 This conversation continues in Telegram. Reply there to keep it going.'
        const chatArea = document.getElementById('chat-area')
        chatArea?.parentElement?.insertBefore(banner, chatArea)
    }
}

function updateHeaderForSession(session: any | null) {
    const nameEl = document.getElementById('agent-header-name')
    const modelEl = document.getElementById('model-select') as HTMLSelectElement
    if (nameEl) nameEl.textContent = session ? session.name : 'Geeksy'
    if (modelEl && session?.model) modelEl.value = session.model
}

async function loadSessionChat(sessionId: number) {
    const chatArea = document.getElementById('chat-area')
    if (!chatArea) return

    renderChatPlaceholder('loading')

    try {
        const res = await fetch(`/api/sessions/messages?sessionId=${sessionId}`)
        const messages = await res.json()

        if (!Array.isArray(messages) || messages.length === 0) {
            renderChatPlaceholder('empty-conversation')
            lastKnownMsgCount = 0
            return
        }

        chatArea.innerHTML = ''
        for (const msg of messages) {
            if (msg.role === 'user') appendUserBubble(msg.content)
            else if (msg.role === 'assistant' && msg.content) appendResponseBubble(msg.content)
        }
        lastKnownMsgCount = messages.length
        scrollDown()
    } catch {
        renderChatPlaceholder('empty-conversation')
        lastKnownMsgCount = 0
    }
}

async function loadSessionState(sessionId: number) {
    const agent = getActiveAgent()
    if (!agent?.id) return

    try {
        const res = await fetch(`/api/state?agentId=${agent.id}&sessionId=${sessionId}`)
        const data = await res.json()

        const restored = (data.objectives || []).map((o: any) => ({
            name: o.name,
            description: o.description,
            type: o.type,
            met: o.status === 'complete' ? true : o.status === 'failed' ? false : undefined,
            reason: o.result,
        }))

        state.objectives = restored
        state.objectiveGroups = restored.length > 0 ? [{
            id: Date.now(),
            timestamp: Date.now(),
            label: 'Session State',
            objectives: restored,
        }] : []
        state.files = (data.files || []).map((f: any) => ({
            path: f.path,
            action: f.action === 'write' ? 'write' as const : 'read' as const,
        }))

        renderFilesPane()
    } catch {
        state.objectives = []
        state.objectiveGroups = []
        state.files = []
        renderFilesPane()
    }
}

function startMessagePolling(sessionId: number) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
        if (activeSessionId !== sessionId) return
        if ((window as any).__geeksy_isRunning) return
        try {
            const res = await fetch(`/api/sessions/messages?sessionId=${sessionId}&count=true`)
            const data = await res.json()
            const serverCount = data.count ?? 0
            if (serverCount > lastKnownMsgCount) {
                const newRes = await fetch(`/api/sessions/messages?sessionId=${sessionId}&offset=${lastKnownMsgCount}`)
                const newMsgs = await newRes.json()
                if (Array.isArray(newMsgs) && newMsgs.length > 0) {
                    for (const msg of newMsgs) {
                        if (msg.role === 'user') appendUserBubble(msg.content)
                        else if (msg.role === 'assistant' && msg.content) appendResponseBubble(msg.content)
                    }
                    lastKnownMsgCount = serverCount
                    scrollDown()
                }
            }
        } catch { }
    }, 3000)
}

export function stopMessagePolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

export async function refreshSessions(onSelect?: (id: number, session: any) => void) {
    const sessions = await loadSessions()
    renderSessionList(sessions, onSelect || selectSession)
}

export async function refreshActiveSessionMessages() {
    if (!activeSessionId) return
    await loadSessionChat(activeSessionId)
}

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
            body: JSON.stringify({ name: 'New Conversation', type: 'web' }),
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
    const name = nameInput?.value.trim() || 'Telegram Conversation'

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
            if (connectBtn) { connectBtn.textContent = 'Connect conversation'; connectBtn.disabled = false }
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
        if (connectBtn) { connectBtn.textContent = 'Connect conversation'; connectBtn.disabled = false }
    }
}

export async function initSessionUI() {
    renderChatPlaceholder('loading')

    document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.session-item-actions')) {
            document.querySelectorAll('.session-item-actions.menu-open').forEach((el) => el.classList.remove('menu-open'))
        }
    })

    wireExistingSessionList(selectSession)

    document.getElementById('new-session-btn')?.addEventListener('click', openNewSessionModal)
    document.querySelector('.session-empty-cta')?.addEventListener('click', openNewSessionModal)
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

    const menuBtn = document.getElementById('mobile-menu-btn')
    const sidebar = document.querySelector('.session-sidebar') as HTMLElement | null
    let mobileSelectHandler = selectSession

    if (menuBtn && sidebar) {
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

        mobileSelectHandler = async (id: number, session?: any) => {
            await selectSession(id, session)
            if (window.innerWidth <= 768) toggleSidebar(false)
        }
    }

    const savedSessionId = localStorage.getItem('geeksy:activeSessionId')
    const sessions = await loadSessions()
    if (savedSessionId) {
        activeSessionId = Number(savedSessionId)
        const session = sessions.find((s: any) => s.id === activeSessionId)
        if (session) await selectSession(activeSessionId, session)
        else if (sessions.length > 0) await selectSession(sessions[0].id, sessions[0])
    } else if (sessions.length > 0) {
        await selectSession(sessions[0].id, sessions[0])
    } else {
        activeSessionId = null
        localStorage.removeItem('geeksy:activeSessionId')
        stopMessagePolling()
        updateHeaderForSession(null)
        applyNoSessionComposerState()
        renderChatPlaceholder('no-session')
    }

    await refreshSessions(mobileSelectHandler)
}
