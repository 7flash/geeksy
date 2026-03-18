// app/src/lib/state.ts — Singleton workspace state + DOM refs

import type { WorkspaceState, ToolCardEntry } from './types'

// ── State ──

export interface DebugLogEntry {
    id: number
    at: number
    type: string
    data: any
    traceId?: string
}

let _debugLogId = 0
let _debugTraceId = 0
export const debugLog: DebugLogEntry[] = []
const DEBUG_LOG_MAX = 500

export function createDebugTraceId() {
    _debugTraceId += 1
    return `trace-${Date.now()}-${_debugTraceId}`
}

export function pushDebugLog(type: string, data: any, options?: { traceId?: string }) {
    debugLog.push({ id: ++_debugLogId, at: Date.now(), type, data, traceId: options?.traceId })
    if (debugLog.length > DEBUG_LOG_MAX) debugLog.splice(0, debugLog.length - DEBUG_LOG_MAX)
    try {
        window.dispatchEvent(new CustomEvent('geeksy:debug-log'))
    } catch { }
}

export const state: WorkspaceState = {
    agents: [],
    activeAgentId: null,
    objectives: [],
    objectiveGroups: [],
    files: [],
    schedules: [],
    scheduleStats: null,
    stateEntries: [],
    isRunning: false,
    activeSkills: new Set(),
    availableSkills: [],
    activeTab: 'files',
}

// Per-agent chat + state persistence (in-memory for instant tab switching within session)
export const agentChatStore = new Map<number, {
    html: string
    objectives: WorkspaceState['objectives']
    objectiveGroups: WorkspaceState['objectiveGroups']
    files: WorkspaceState['files']
    toolCards: ToolCardEntry[]
}>()

// Tool cards — track for result updates
export const toolCards: ToolCardEntry[] = []

// Streaming state
export let streamingEl: HTMLElement | null = null
export let streamingContent = ''
export let activeLoadingEl: HTMLElement | null = null
export let lastThinkingMessage = ''
export let lastThinkingEl: HTMLElement | null = null
export let isQuickResponse = false

export function setStreamingEl(el: HTMLElement | null) { streamingEl = el }
export function setStreamingContent(s: string) { streamingContent = s }
export function setActiveLoadingEl(el: HTMLElement | null) { activeLoadingEl = el }
export function setLastThinking(msg: string, el: HTMLElement | null) {
    lastThinkingMessage = msg
    lastThinkingEl = el
}
export function setQuickResponse(v: boolean) { isQuickResponse = v }

// ── DOM refs (set once in mount()) ──

export const dom = {
    chatArea: null as unknown as HTMLElement,
    inputEl: null as unknown as HTMLTextAreaElement,
    sendBtn: null as unknown as HTMLButtonElement,
    modelSelect: null as unknown as HTMLSelectElement,
    agentList: null as unknown as HTMLElement,
    agentHeaderName: null as unknown as HTMLElement,
    agentStatusDot: null as unknown as HTMLElement,
}

export function initDom() {
    dom.chatArea = document.getElementById('chat-area')!
    dom.inputEl = document.getElementById('input') as HTMLTextAreaElement
    dom.sendBtn = document.getElementById('send-btn') as HTMLButtonElement
    dom.modelSelect = document.getElementById('model-select') as HTMLSelectElement
    dom.agentList = document.getElementById('agent-list')!
    dom.agentHeaderName = document.getElementById('agent-header-name')!
    dom.agentStatusDot = document.getElementById('agent-status-dot')!
}

// ── Helpers ──

export function getActiveAgent() {
    return state.agents.find(a => a.id === state.activeAgentId) || null
}

export function saveState() {
    if (state.activeAgentId) {
        agentChatStore.set(state.activeAgentId, {
            html: dom.chatArea.innerHTML,
            objectives: [...state.objectives],
            objectiveGroups: state.objectiveGroups.map(g => ({ ...g, objectives: [...g.objectives] })),
            files: [...state.files],
            toolCards: [...toolCards],
        })
    }
    // Persist active skills to localStorage
    try {
        localStorage.setItem('geeksy:activeSkills', JSON.stringify([...state.activeSkills]))
    } catch { /* quota exceeded, ignore */ }
}

/** Restore skill toggles from localStorage */
export function restoreActiveSkills() {
    try {
        const saved = localStorage.getItem('geeksy:activeSkills')
        if (saved) {
            const ids: string[] = JSON.parse(saved)
            state.activeSkills = new Set(ids)
            return true // had saved state
        }
    } catch { /* corrupt data, ignore */ }
    return false // no saved state
}
