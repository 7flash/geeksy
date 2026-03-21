// layout.client.tsx — Single persistent mount script for Geeksy
// Melina loads layout.client but NOT page.client on this setup,
// so all initialization lives here.
import { state, dom, initDom } from './lib/state'
import { openSettings, closeSettings } from './lib/settings'
import { switchTab, renderDebugPane, fetchMemoryEntries, renderMemoryPane } from './lib/panels'
import {
    clearCurrentChat, exportChatAsMarkdown,
    sendMessage, stopAgent, loadSkills, loadModels, restoreState, setupResizeHandle,
} from './lib/agents'
import { initSessionUI, getActiveSessionId, refreshActiveSessionMessages } from './lib/sessions-ui'
import { initHeartbeatUI } from './lib/heartbeat-ui'
import { initMetricsUI } from './lib/metrics-ui'
import { initSearchUI } from './lib/search-ui'

export default function mount() {
    ;(window as any).__geeksy_mount_called = true

    // ── Nav rail ──
    function updateActiveNav() {
        const path = location.pathname
        document.querySelectorAll('.nav-rail-btn[href]').forEach(btn => {
            const href = btn.getAttribute('href')!
            const isActive = href === '/' ? path === '/' : path.startsWith(href)
            btn.classList.toggle('active', isActive)
        })
    }
    updateActiveNav()
    window.addEventListener('melina:navigated', updateActiveNav)

    const settingsBtn = document.getElementById('nav-settings-btn')
    settingsBtn?.addEventListener('click', (e: any) => {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('smart-agent:open-settings'))
    })

    // ── DOM init ──
    try { initDom() } catch (e) { console.error('[geeksy] initDom failed:', e) }

    try {
        loadSkills()
        loadModels()

        dom.modelSelect?.addEventListener('change', () => {
            const sessionId = getActiveSessionId()
            if (sessionId) {
                fetch('/api/sessions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: sessionId, model: dom.modelSelect.value }),
                }).catch(() => { })
            }
        })

        document.getElementById('tab-bar')?.addEventListener('click', (e) => {
            const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null
            if (!tab) return
            const tabName = tab.dataset.tab as any
            if (tabName) switchTab(tabName)
        })

        window.addEventListener('smart-agent:open-settings', openSettings)
        window.addEventListener('geeksy:debug-log', () => {
            if (state.activeTab === 'debug') renderDebugPane()
        })
        window.addEventListener('geeksy:refresh-session-messages', async (e: any) => {
            const targetSessionId = e?.detail?.sessionId
            const activeSessionId = getActiveSessionId()
            if (targetSessionId && activeSessionId && Number(targetSessionId) === Number(activeSessionId)) {
                await refreshActiveSessionMessages()
            }
        })

        document.getElementById('export-chat-btn')?.addEventListener('click', exportChatAsMarkdown)
        document.getElementById('clear-chat-btn')?.addEventListener('click', clearCurrentChat)

        try { initHeartbeatUI() } catch (e) { console.error('[geeksy] initHeartbeatUI:', e) }
        try { initMetricsUI() } catch (e) { console.error('[geeksy] initMetricsUI:', e) }
        try { initSearchUI() } catch (e) { console.error('[geeksy] initSearchUI:', e) }

        dom.inputEl?.addEventListener('input', () => {
            dom.inputEl.style.height = 'auto'
            dom.inputEl.style.height = Math.min(dom.inputEl.scrollHeight, 100) + 'px'
        })

        dom.inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
        })

        dom.sendBtn?.addEventListener('click', () => {
            if (state.isRunning) stopAgent()
            else sendMessage()
        })

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); clearCurrentChat() }
            if (e.key === 'Escape') { if (state.isRunning) stopAgent(); else closeSettings() }
        })

        try { setupResizeHandle() } catch (e) { /* no resize handle */ }
    } catch (mountErr) {
        console.error('[geeksy] mount sync phase failed:', mountErr)
    }

    // Copy button delegation
    dom.chatArea?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.md-copy-btn') as HTMLElement | null
        if (!btn) return
        const code = btn.dataset.code || ''
        const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        navigator.clipboard.writeText(decoded)
        btn.textContent = '✓ Copied'
        btn.classList.add('copied')
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 1500)
    })

    // ── Bootstrap: agent + sessions ──
    ;(window as any).__geeksy_mount = true
    ;(async () => {
        try {
            await restoreState()
            ;(window as any).__geeksy_restored = true
        } catch (e) { console.error('[geeksy] restoreState:', e) }
        try {
            await initSessionUI()
            ;(window as any).__geeksy_sessions = true
        } catch (e) { console.error('[geeksy] initSessionUI:', e) }
    })()

    return () => {
        window.removeEventListener('melina:navigated', updateActiveNav)
    }
}
