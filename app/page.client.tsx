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
import { initSearchUI } from './lib/search-ui'

configure({ timestamps: true })

const SHORTCUTS = [
    {
        section: 'General', items: [
            { keys: '?', desc: 'Show keyboard shortcuts' },
            { keys: 'Ctrl + /', desc: 'Show keyboard shortcuts' },
            { keys: 'Escape', desc: 'Stop agent / close panel' },
            { keys: 'Ctrl + L', desc: 'Clear chat' },
        ]
    },
    {
        section: 'Search & Navigation', items: [
            { keys: 'Ctrl + K', desc: 'Search conversations' },
            { keys: '↑ ↓', desc: 'Navigate search results' },
            { keys: 'Enter', desc: 'Open selected result' },
        ]
    },
    {
        section: 'Chat', items: [
            { keys: 'Enter', desc: 'Send message' },
            { keys: 'Shift + Enter', desc: 'New line in input' },
        ]
    },
    {
        section: 'Sessions', items: [
            { keys: 'Double-click', desc: 'Rename session' },
        ]
    },
]

function toggleShortcutsPanel() {
    const existing = document.querySelector('.shortcuts-overlay')
    if (existing) { existing.remove(); return }

    const overlay = document.createElement('div')
    overlay.className = 'shortcuts-overlay'
    overlay.innerHTML = `
        <div class="shortcuts-panel">
            <div class="shortcuts-header">
                <span class="shortcuts-title">⌨ Keyboard Shortcuts</span>
                <button class="shortcuts-close">✕</button>
            </div>
            <div class="shortcuts-body">
                ${SHORTCUTS.map(s => `
                    <div class="shortcuts-section">
                        <div class="shortcuts-section-title">${s.section}</div>
                        ${s.items.map(i => `
                            <div class="shortcuts-row">
                                <kbd class="shortcuts-key">${i.keys}</kbd>
                                <span class="shortcuts-desc">${i.desc}</span>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || (e.target as HTMLElement).closest('.shortcuts-close')) {
            overlay.remove()
        }
    })
    document.body.appendChild(overlay)
}

export default function mount() {
    initDom()

    // ── Theme toggle ──
    const savedTheme = localStorage.getItem('geeksy_theme') || 'dark'
    if (savedTheme === 'light') document.documentElement.setAttribute('data-theme', 'light')
    const themeBtn = document.getElementById('theme-toggle-btn')
    if (themeBtn) {
        themeBtn.textContent = savedTheme === 'light' ? '☀️' : '🌙'
        themeBtn.addEventListener('click', () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light'
            if (isLight) {
                document.documentElement.removeAttribute('data-theme')
                localStorage.setItem('geeksy_theme', 'dark')
                themeBtn.textContent = '🌙'
            } else {
                document.documentElement.setAttribute('data-theme', 'light')
                localStorage.setItem('geeksy_theme', 'light')
                themeBtn.textContent = '☀️'
            }
        })
    }

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
    initHeartbeatUI()
    initMetricsUI()
    initSearchUI()

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

    // Quick reply templates
    document.getElementById('quick-replies')?.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.quick-reply-btn') as HTMLElement | null
        if (!btn) return
        const msg = btn.dataset.msg
        if (msg) {
            dom.inputEl.value = msg
            sendMessage()
        }
    })

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger shortcuts when typing in inputs
        const tag = (e.target as HTMLElement).tagName
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable

        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault()
            clearCurrentChat()
        }
        if (e.key === 'Escape') {
            // Close shortcuts panel if open
            const panel = document.querySelector('.shortcuts-overlay')
            if (panel) { panel.remove(); return }
            if (state.isRunning) stopAgent()
            else closeSettings()
        }
        // ? or Ctrl+/ → keyboard shortcuts help
        if ((e.key === '?' && !isInput) || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
            e.preventDefault()
            toggleShortcutsPanel()
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

        // Bootstrap: ensure agent exists, then load session + messages
        ; (async () => {
            await restoreState()    // Ensure global agent exists in DB
            await initSessionUI()   // Load sessions, select saved/first, render messages
            // Initialize active tab to load data/start polling (e.g. Processes)
            switchTab(state.activeTab || 'objectives')
        })()

    return () => { }
}
