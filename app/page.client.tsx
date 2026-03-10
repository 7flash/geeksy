// app/page.client.tsx — Gateway mount: orchestrates session, heartbeat, metrics, and chat modules
import { configure } from 'measure-fn'
import { state, dom, initDom } from './lib/state'
import { openSettings, closeSettings } from './lib/settings'
import { switchTab } from './lib/panels'
import {
    clearCurrentChat, exportChatAsMarkdown,
    sendMessage, stopAgent, loadSkills, loadModels, restoreState, setupResizeHandle,
} from './lib/agents'
import { initSessionUI, getActiveSessionId } from './lib/sessions-ui'
import { initHeartbeatUI } from './lib/heartbeat-ui'
import { initMetricsUI } from './lib/metrics-ui'

configure({ timestamps: true })

export default function mount() {
    initDom()

    // Load skills and models
    loadSkills()
    loadModels()

    // Model change → persist to active session
    dom.modelSelect.addEventListener('change', () => {
        const sessionId = getActiveSessionId()
        if (sessionId) {
            fetch('/api/sessions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: sessionId, model: dom.modelSelect.value }),
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

    // Settings
    window.addEventListener('smart-agent:open-settings', openSettings)

    // Header action buttons
    document.getElementById('export-chat-btn')?.addEventListener('click', exportChatAsMarkdown)
    document.getElementById('clear-chat-btn')?.addEventListener('click', clearCurrentChat)

    // ── Initialize UI modules ──
    initSessionUI()
    initHeartbeatUI()
    initMetricsUI()

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

    // Restore agent state (existing logic for chat)
    restoreState()

    return () => { }
}
