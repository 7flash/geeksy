// app/lib/sessions-ui.ts — Session management UI: CRUD, selection, modals, telegram setup

let activeSessionId: number | null = null

export function getActiveSessionId() { return activeSessionId }

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
                <button class="session-delete-btn" data-id="${s.id}" title="Delete session">×</button>
            </div>
        `

        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.session-delete-btn')) return
            onSelect(s.id, s)
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
            session = await res.json()
        } catch { }
    }
    updateHeaderForSession(session)
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
    } catch { }
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
export function initSessionUI() {
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

    // Restore last session
    const savedSessionId = localStorage.getItem('geeksy:activeSessionId')
    if (savedSessionId) {
        activeSessionId = Number(savedSessionId)
        selectSession(activeSessionId)
    }

    refreshSessions()
}
