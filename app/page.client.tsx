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

    // Header action buttons
    document.getElementById('export-chat-btn')!.addEventListener('click', exportChatAsMarkdown)
    document.getElementById('clear-chat-btn')!.addEventListener('click', clearCurrentChat)

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
