// app/src/lib/agents.tsx — Agent CRUD, chat, skills, sidebar rendering
import { render } from 'melina/client'
// measure-fn uses process.* which crashes in browser bundles
const measure = async (name: string, fn: (m: any) => any) => {
    const m = (label: string, inner: () => any) => inner()
    return fn(m)
}
const measureSync = (name: string, fn?: () => any) => fn?.();
import {
    state, dom, agentChatStore, toolCards, getActiveAgent, saveState,
    setActiveLoadingEl, restoreActiveSkills,
} from './state'
import { appendUserBubble, appendLoading, appendCard, appendResponseBubble, forceScrollDown } from './chat-ui'
import { renderFilesPane, renderSchedulePane, resetMessageCount } from './panels'
import { handleEvent, clearLoading } from './events'
import { pushDebugLog } from './state'
import { openPluginConfig } from './plugin-config'
import { getActiveSessionId, selectSession, refreshSessions, bumpKnownMsgCount } from './sessions-ui'
import type { AgentEntry, ToolCardEntry } from './types'

// ══════════════════════════════════════
// RESTORE
// ══════════════════════════════════════

export async function restoreState() {
    try {
        // Ensure the global agent exists (needed for smart-agent backend)
        const res = await fetch('/api/agents')
        const agents = await res.json() as any[]

        let globalAgent: any
        if (agents.length > 0) {
            globalAgent = agents[0]
        } else {
            const r = await fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Gateway' }),
            })
            globalAgent = await r.json()
        }

        state.agents = [{
            id: globalAgent.id,
            name: globalAgent.name,
            sessionId: globalAgent.sessionId || null,
            status: 'idle' as const,
            model: globalAgent.model,
        }]

        state.activeAgentId = globalAgent.id
        // Don't load messages or push URL — sessions handle that now
    } catch { /* first load, DB error */ }
}

/** Extract agent ID from URL path like /agent/123 */
function getAgentIdFromUrl(): number | null {
    const match = window.location.pathname.match(/\/agent\/(\d+)/)
    return match ? Number(match[1]) : null
}

/** Push agent URL without full navigation */
function pushAgentUrl(agentId: number | null) {
    const path = agentId ? `/agent/${agentId}` : '/'
    if (window.location.pathname !== path) {
        window.history.pushState({ agentId }, '', path)
    }
}

// ══════════════════════════════════════
// EMPTY STATE
// ══════════════════════════════════════

/** Show the welcome/empty state with example chips inside chat-area */
function showEmptyState() {
    const existing = document.getElementById('empty-state')
    if (existing) return // already showing
    const el = document.createElement('div')
    el.className = 'empty-state'
    el.id = 'empty-state'
    el.innerHTML = `
        <h2>What can I help with?</h2>
    `
    dom.chatArea.prepend(el)
}

/** Remove the empty state (when messages start appearing) */
export function hideEmptyState() {
    document.getElementById('empty-state')?.remove()
}

// ══════════════════════════════════════
// AGENT MANAGEMENT
// ══════════════════════════════════════

export async function createAgent() {
    // No-op in Global Chat mode
}

export async function deleteAgent(id: number) {
    // No-op in Global Chat mode
}

export async function selectAgent(id: number) {
    const prev = state.activeAgentId

    // Save current agent's state before switching
    if (prev && prev !== id) {
        saveState()
    }

    state.activeAgentId = id
    resetMessageCount()
    pushAgentUrl(id)
    const agent = state.agents.find(a => a.id === id)
    if (!agent) return

    dom.agentHeaderName.textContent = agent.name
    dom.agentStatusDot.className = `agent-status-dot ${agent.status === 'running' ? 'active' : ''}`

    // Restore agent's model in dropdown
    if (agent.model && dom.modelSelect) {
        const opt = dom.modelSelect.querySelector(`option[value="${agent.model}"]`) as HTMLOptionElement
        if (opt && !opt.disabled) dom.modelSelect.value = agent.model
    }

    // Hide SSR empty state immediately — will re-show if agent has no messages
    hideEmptyState()

    // Try in-memory cache first, then server DB
    const saved = agentChatStore.get(id)
    if (saved) {
        restoreChatSnapshot(saved)
    } else {
        // Fetch from server DB
        dom.chatArea.innerHTML = ''
        state.objectives = []
        state.objectiveGroups = []
        state.files = []
        toolCards.length = 0
        try {
            const data = await fetch(`/api/state?agentId=${id}`).then(r => r.json())
            if (data.messages?.length) {
                for (const msg of data.messages) {
                    if (msg.role === 'user') {
                        appendUserBubble(msg.content)
                    } else if (msg.role === 'assistant' && msg.content) {
                        appendResponseBubble(msg.content)
                    }
                }
            }
            if (data.files?.length) {
                state.files = data.files.map((f: any) => ({
                    path: f.path,
                    action: f.action === 'write' ? 'write' as const : 'read' as const,
                }))
            }
        } catch { /* fresh agent, no state yet */ }
    }

    // Show empty state if no messages, hide if there are messages
    const hasMessages = dom.chatArea.querySelector('.msg-user, .msg-agent, .loading')
    if (hasMessages) {
        hideEmptyState()
    } else {
        showEmptyState()
    }

    state.schedules = []
    renderFilesPane()
    renderSchedulePane()
    renderSidebar()
    saveState()
}

/** Restore a chat snapshot into the DOM */
function restoreChatSnapshot(saved: { html: string; objectives: any[]; objectiveGroups?: any[]; files: any[]; toolCards: ToolCardEntry[] }) {
    dom.chatArea.innerHTML = saved.html
    state.objectives = saved.objectives
    state.objectiveGroups = saved.objectiveGroups || []
    state.files = saved.files
    toolCards.length = 0
    toolCards.push(...saved.toolCards)
    rebindThinkingToggles()
    forceScrollDown()
}

/** Re-bind thinking card collapse toggles after restoring HTML */
function rebindThinkingToggles() {
    dom.chatArea.querySelectorAll('.card-thinking .thinking-toggle').forEach(toggle => {
        const card = toggle.closest('.card-thinking') as HTMLElement
        if (card && !card.dataset.bound) {
            card.dataset.bound = '1'
            toggle.addEventListener('click', () => card.classList.toggle('collapsed'))
        }
    })
}


export function clearCurrentChat() {
    if (state.isRunning || !state.activeAgentId) return
    const agent = getActiveAgent()
    if (!agent) return

    dom.chatArea.innerHTML = ''
    state.objectives = []
    state.objectiveGroups = []
    state.files = []
    toolCards.length = 0
    agent.sessionId = null
    agentChatStore.delete(agent.id)

    showEmptyState()

    fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', agentId: agent.id }),
    }).catch(() => { })

    renderObjectivesPane()
    renderFilesPane()
    renderSidebar()
    saveState()
    dom.inputEl.focus()
}

export function exportChatAsMarkdown() {
    if (!state.activeAgentId) return
    const agent = getActiveAgent()
    const agentName = agent?.name || 'agent'
    const lines: string[] = [`# Chat: ${agentName}`, `_Exported ${new Date().toLocaleString()}_`, '']

    for (const child of Array.from(dom.chatArea.children)) {
        const el = child as HTMLElement

        if (el.classList.contains('msg') && el.classList.contains('msg-user')) {
            const text = el.querySelector('.bubble')?.textContent?.trim() || ''
            lines.push(`## 👤 User`, '', text, '')
            continue
        }

        if (el.classList.contains('msg') && el.classList.contains('msg-agent')) {
            const text = el.querySelector('.bubble')?.textContent?.trim() || ''
            lines.push(`## 🤖 Agent`, '', text, '')
            continue
        }

        const card = el.querySelector?.('.card') as HTMLElement | null
        if (card) {
            const label = card.querySelector('.card-label')?.textContent?.trim() || ''
            const content = card.querySelector('.card-content')?.textContent?.trim() || ''
            lines.push(`> **${label}**`, `> ${content}`, '')
            continue
        }

        if (el.classList.contains('divider')) {
            lines.push(`---`, `*${el.textContent?.trim()}*`, '')
            continue
        }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agentName.replace(/[^a-zA-Z0-9]/g, '_')}_chat.md`
    a.click()
    URL.revokeObjectURL(url)
}

// ══════════════════════════════════════
// CHAT SEND
// ══════════════════════════════════════

export async function sendMessage() {
    const text = dom.inputEl.value.trim()
    if (!text || state.isRunning) return
    if (!state.activeAgentId) {
        await createAgent()
    }

    const agent = getActiveAgent()!
    state.isRunning = true
        ; (window as any).__geeksy_isRunning = true
    agent.status = 'running'
    dom.agentStatusDot.className = 'agent-status-dot active'
    setSendButtonMode('stop')
    dom.inputEl.value = ''
    dom.inputEl.style.height = 'auto'
    renderSidebar()

    hideEmptyState()

    // Auto-create a session if none is active
    if (!getActiveSessionId()) {
        try {
            const sessionName = text.length > 30 ? text.substring(0, 30) + '…' : text
            const sRes = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: sessionName, type: 'web' }),
            })
            const sData = await sRes.json()
            if (sData.session?.id) {
                await selectSession(sData.session.id, sData.session)
                refreshSessions()
            }
        } catch { }
    }

    if (!agent.sessionId) {
        agent.name = text.length > 24 ? text.substring(0, 24) + '…' : text
        dom.agentHeaderName.textContent = agent.name
        renderSidebar()
        fetch(`/api/agents?id=${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: agent.name }),
        }).catch(() => { })
    }

    appendUserBubble(text)
    bumpKnownMsgCount(1) // tell poller we already rendered this
    setActiveLoadingEl(appendLoading())
    forceScrollDown()

    await measure(`Chat: "${text.substring(0, 40)}"`, async (m) => {
        try {
            const requestPayload = {
                message: text,
                model: dom.modelSelect.value,
                skills: [...state.activeSkills],
                sessionId: agent.sessionId,
                agentId: agent.id,
                dbSessionId: getActiveSessionId(),
            }
            pushDebugLog('request_trace', requestPayload)

            const res = await m('POST /api/chat', () => fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload),
            }))

            if (!res) throw new Error('No response')

            const reader = res.body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let eventCount = 0

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                let eventType = ''
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.slice(7)
                    } else if (line.startsWith('data: ') && eventType) {
                        try {
                            const data = JSON.parse(line.slice(6))
                            eventCount++
                            pushDebugLog(eventType, data, { traceId })
                            handleEvent(eventType, data)
                        } catch { }
                        eventType = ''
                    }
                }
            }

            measureSync(`Processed ${eventCount} SSE events`)
        } catch (err: any) {
            appendCard('error', 'Connection Error', err.message || 'Failed to connect')
        }
    })

    clearLoading()
    state.isRunning = false
        ; (window as any).__geeksy_isRunning = false
    window.dispatchEvent(new CustomEvent('geeksy:refresh-metrics'))
    agent.status = 'idle'
    dom.agentStatusDot.className = 'agent-status-dot'
    setSendButtonMode('send')
    dom.inputEl.focus()

    // Refresh session list to pick up auto-renamed sessions
    refreshSessions().catch(() => {})

    // Persist model choice to agent
    const currentModel = dom.modelSelect.value
    if (currentModel && agent.model !== currentModel) {
        agent.model = currentModel
        fetch(`/api/agents?id=${agent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: currentModel }),
        }).catch(() => { })
    }

    renderSidebar()
    saveState()
}

// ══════════════════════════════════════
// SEND/STOP BUTTON
// ══════════════════════════════════════

export function setSendButtonMode(mode: 'send' | 'stop') {
    if (mode === 'stop') {
        dom.sendBtn.classList.add('stop-mode')
        dom.sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
        dom.sendBtn.title = 'Stop agent'
    } else {
        dom.sendBtn.classList.remove('stop-mode')
        dom.sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>'
        dom.sendBtn.title = 'Send message'
    }
}

export async function stopAgent() {
    const agent = getActiveAgent()
    if (!agent?.sessionId || !state.isRunning) return
    try {
        await fetch(`/api/chat?sessionId=${agent.sessionId}`, { method: 'DELETE' })
    } catch { /* ignore */ }
}

// ══════════════════════════════════════
// SKILLS
// ══════════════════════════════════════

export async function loadSkills() {
    await measure('Load skills', async () => {
        try {
            const res = await fetch('/api/skills')
            state.availableSkills = await res.json()
            // Restore saved skill toggles, or auto-enable all on first load
            const restored = restoreActiveSkills()
            if (!restored && state.activeSkills.size === 0) {
                for (const s of state.availableSkills) {
                    state.activeSkills.add(s.id)
                }
            }
        } catch {
            state.availableSkills = []
        }
        renderSkillChips()
    })
}

/** Populate model-select from /api/models — only active providers' models */
export async function loadModels() {
    try {
        const providers: any[] = await fetch('/api/models').then(r => r.json())
        const select = dom.modelSelect
        const currentValue = select.value

        // Clear existing options
        select.innerHTML = ''

        // Active providers first, then inactive (disabled)
        const active = providers.filter(p => p.active)
        const inactive = providers.filter(p => !p.active)

        // Provider icons for visual distinction in dropdown
        const providerIcons: Record<string, string> = {
            google: '✦', gemini: '✦',
            openai: '◆', gpt: '◆',
            anthropic: '◈', claude: '◈',
            deepseek: '◇',
        }
        function getProviderIcon(name: string): string {
            const lower = name.toLowerCase()
            for (const [key, icon] of Object.entries(providerIcons)) {
                if (lower.includes(key)) return icon
            }
            return '›'
        }

        for (const p of active) {
            const group = document.createElement('optgroup')
            group.label = `${getProviderIcon(p.name)} ${p.name}`
            for (const m of p.models) {
                const opt = document.createElement('option')
                opt.value = m.id
                opt.textContent = m.name
                group.appendChild(opt)
            }
            select.appendChild(group)
        }

        if (inactive.length > 0) {
            const group = document.createElement('optgroup')
            group.label = '── Not configured ──'
            for (const p of inactive) {
                for (const m of p.models) {
                    const opt = document.createElement('option')
                    opt.value = m.id
                    opt.textContent = `${m.name} (needs ${p.envKey})`
                    opt.disabled = true
                    group.appendChild(opt)
                }
            }
            select.appendChild(group)
        }

        // Restore previous selection if still valid
        if (currentValue) {
            const exists = select.querySelector(`option[value="${currentValue}"]`) as HTMLOptionElement
            if (exists && !exists.disabled) select.value = currentValue
        }
    } catch (e) {
        console.error('Failed to load models:', e)
    }
}

export function renderSkillChips() {
    const container = document.getElementById('skill-toggles')
    if (!container) return

    // Group skills by plugin
    const pluginGroups = new Map<string, typeof state.availableSkills>()
    const standaloneSkills: typeof state.availableSkills = []

    for (const skill of state.availableSkills) {
        if (skill.plugin) {
            const key = skill.plugin.packageName
            if (!pluginGroups.has(key)) pluginGroups.set(key, [])
            pluginGroups.get(key)!.push(skill)
        } else {
            standaloneSkills.push(skill)
        }
    }

    // Detect active plugin count for composition mode
    const activePluginNames = new Set<string>()
    for (const skill of state.availableSkills) {
        if (state.activeSkills.has(skill.id) && skill.plugin) {
            activePluginNames.add(skill.plugin.packageName)
        }
    }
    const isCompositionMode = activePluginNames.size >= 2

    // Composition templates — only shown when 2+ plugins are active
    const compositionTemplates = isCompositionMode ? getCompositionTemplates(activePluginNames) : []

    render(
        <div className="skill-toggles">
            {Array.from(pluginGroups.entries()).map(([pkg, skills]) => {
                const plugin = skills[0].plugin!
                const allActive = skills.every(s => state.activeSkills.has(s.id))
                const someActive = skills.some(s => state.activeSkills.has(s.id))
                return (
                    <div className={`skill-plugin-group ${someActive ? 'active' : ''}`} key={pkg}>
                        <button
                            className={`skill-chip plugin-chip ${allActive ? 'active' : someActive ? 'partial' : ''}`}
                            onClick={() => {
                                if (allActive) {
                                    skills.forEach(s => state.activeSkills.delete(s.id))
                                } else {
                                    skills.forEach(s => state.activeSkills.add(s.id))
                                }
                                renderSkillChips()
                                saveState()
                            }}
                            title={`${plugin.name} — ${skills.map(s => s.name).join(', ')}`}
                        >
                            <span className="skill-chip-icon">{plugin.icon}</span>
                            <span>{plugin.name}</span>
                            <span className="skill-chip-count">{skills.length}</span>
                        </button>
                        <button
                            className="skill-plugin-config-btn"
                            title="Configure Plugin"
                            onClick={(e) => {
                                e.stopPropagation()
                                openPluginConfig(plugin.packageName)
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-dim)',
                                cursor: 'pointer',
                                padding: '4px',
                                marginLeft: '8px',
                                fontSize: '14px',
                                borderRadius: '4px',
                            }}
                        >
                            ⚙
                        </button>
                    </div>
                )
            })}
            {standaloneSkills.map(skill => (
                <button
                    className={`skill-chip ${state.activeSkills.has(skill.id) ? 'active' : ''}`}
                    onClick={() => {
                        if (state.activeSkills.has(skill.id)) state.activeSkills.delete(skill.id)
                        else state.activeSkills.add(skill.id)
                        renderSkillChips()
                        saveState()
                    }}
                    title={skill.description}
                >
                    {skill.name}
                </button>
            ))}
            {isCompositionMode && (
                <span className="composition-badge" title="Cross-plugin composition active">
                    ⚡ {activePluginNames.size} plugins
                </span>
            )}
            {compositionTemplates.length > 0 && (
                <div className="composition-templates">
                    <span className="composition-label">⚡ Templates:</span>
                    {compositionTemplates.map(tpl => (
                        <button
                            className="composition-template"
                            onClick={() => {
                                const input = document.getElementById('chatInput') as HTMLTextAreaElement
                                if (input) {
                                    input.value = tpl.prompt
                                    input.focus()
                                    input.dispatchEvent(new Event('input', { bubbles: true }))
                                }
                            }}
                            title={tpl.prompt}
                        >
                            {tpl.label}
                        </button>
                    ))}
                </div>
            )}
        </div>,
        container
    )
}

function getCompositionTemplates(activePlugins: Set<string>): { label: string; prompt: string }[] {
    const templates: { label: string; prompt: string; requires: string[] }[] = [
        {
            requires: ['geeksy-telegram-plugin', 'geeksy-pumpfun-plugin'],
            label: '📱→📈 Listen & Trade',
            prompt: 'Listen to the Telegram channel @PumpAlpha for new token mentions. When a Solana token mint address is mentioned, automatically add it to the trading bot via the Pumpfun Trading plugin.',
        },
        {
            requires: ['geeksy-telegram-plugin', 'geeksy-pumpfun-plugin'],
            label: '📈→📱 Trade Alerts',
            prompt: 'Monitor my active trading positions via the Pumpfun Trading plugin. When any token reaches 2x profit or drops 50%, send me an alert message via Telegram.',
        },
        {
            requires: ['geeksy-telegram-plugin', 'geeksy-pumpfun-plugin'],
            label: '📱 Channel Scanner',
            prompt: 'Scan all tracked Telegram channels for messages mentioning Solana tokens (look for base58 addresses or $TICKER patterns). List all unique tokens found in the last 24 hours and ask me which ones to add to the trading bot.',
        },
    ]

    return templates.filter(t => t.requires.every(r => activePlugins.has(r)))
}


// ══════════════════════════════════════
// SIDEBAR
// ══════════════════════════════════════

function SidebarAgent({ agent, isActive }: { agent: AgentEntry; isActive: boolean }) {
    const shortModel = (agent.model || '').replace(/^(gemini|gpt|claude|deepseek)-?/, '').replace(/-latest$/, '')
    return (
        <button
            className={`sidebar-agent ${isActive ? 'active' : ''}`}
            onClick={() => selectAgent(agent.id)}
        >
            <span className={`agent-dot ${agent.status === 'running' ? 'running' : 'idle'}`} />
            <div className="sidebar-agent-info">
                <span className="sidebar-agent-name">{agent.name}</span>
                {agent.model && <span className="sidebar-agent-model">{shortModel}</span>}
            </div>
            <span
                className="sidebar-agent-delete"
                onClick={(e: any) => { e.stopPropagation(); deleteAgent(agent.id) }}
                title="Delete agent"
            >✕</span>
        </button>
    )
}

export function renderSidebar() {
    // No-op for global chat mode
}

// ══════════════════════════════════════
// RESIZE HANDLE
// ══════════════════════════════════════

export function setupResizeHandle() {
    const handle = document.getElementById('overview-resize')
    const overview = document.getElementById('overview')
    if (!handle || !overview) return
    let startY = 0
    let startH = 0

    handle.addEventListener('mousedown', (e) => {
        startY = e.clientY
        startH = overview.offsetHeight
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'

        const onMove = (ev: MouseEvent) => {
            const delta = startY - ev.clientY
            const newH = Math.max(120, Math.min(window.innerHeight * 0.6, startH + delta))
            overview.style.height = newH + 'px'
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    })
}
