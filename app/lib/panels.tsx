// app/src/lib/panels.tsx — Overview panes: Objectives Timeline, Files, Schedule, Data
import { render } from 'melina/client'
import { state, dom } from './state'
import { appendResponseBubble } from './chat-ui'
import type { ObjectiveEntry, ObjectiveGroup, ScheduleEntry, StateEntry } from './types'

// ══════════════════════════════════════
// OBJECTIVES TIMELINE
// ══════════════════════════════════════

function ObjectiveItem({ obj }: { obj: ObjectiveEntry }) {
    const status = obj.met === undefined ? '' : obj.met ? 'met' : 'unmet'
    const icon = obj.met === undefined ? '⏳' : obj.met ? '✅' : '❌'
    return (
        <div className={`obj-item ${status}`} data-obj={obj.name}>
            <span className="obj-icon">{icon}</span>
            <div className="obj-info">
                <span className="obj-name">{obj.name}</span>
                <span className="obj-desc">{obj.description}</span>
                {obj.reason && <span className="obj-reason">{obj.reason}</span>}
            </div>
        </div>
    )
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TimelineGroup({ group, isLatest }: { group: ObjectiveGroup; isLatest: boolean }) {
    const allMet = group.objectives.every(o => o.met === true)
    const hasFailed = group.objectives.some(o => o.met === false)
    const groupStatus = allMet ? 'complete' : hasFailed ? 'partial' : isLatest ? 'active' : 'past'

    return (
        <div className={`tl-group tl-${groupStatus}`}>
            <div className="tl-dot" />
            <div className="tl-content">
                <div className="tl-header">
                    <span className="tl-label">{group.label}</span>
                    <span className="tl-time">{formatTime(group.timestamp)}</span>
                </div>
                <div className="tl-objectives">
                    {group.objectives.map(o => <ObjectiveItem obj={o} />)}
                </div>
            </div>
        </div>
    )
}

export function renderObjectivesPane() {
    const pane = document.getElementById('pane-objectives')!
    if (state.objectiveGroups.length === 0) {
        render(<div className="overview-empty">No objectives yet. Send a message to start planning.</div>, pane)
    } else {
        const reversed = [...state.objectiveGroups].reverse()
        render(
            <div className="tl-timeline">
                {reversed.map((g, i) => (
                    <TimelineGroup
                        group={g}
                        isLatest={i === 0}
                    />
                ))}
            </div>,
            pane
        )
    }
}

export function updateObjectives(results: Array<{ name: string; met: boolean; reason: string }>) {
    for (const r of results) {
        const obj = state.objectives.find(o => o.name === r.name)
        if (obj) {
            obj.met = r.met
            obj.reason = r.reason
        }
    }
    const latest = state.objectiveGroups[state.objectiveGroups.length - 1]
    if (latest) {
        for (const r of results) {
            const obj = latest.objectives.find(o => o.name === r.name)
            if (obj) {
                obj.met = r.met
                obj.reason = r.reason
            }
        }
    }
    renderObjectivesPane()
}

// ══════════════════════════════════════
// FILES
// ══════════════════════════════════════

export function renderFilesPane() {
    const pane = document.getElementById('pane-files')!
    if (state.files.length === 0) {
        render(<div className="overview-empty">No files touched yet.</div>, pane)
    } else {
        render(
            <div className="file-list">
                {state.files.map(f => (
                    <div className="file-item">
                        <span className="file-icon">{f.action === 'write' ? '📝' : '📄'}</span>
                        <span className="file-path">{f.path}</span>
                        <span className={`file-action ${f.action}`}>{f.action}</span>
                    </div>
                ))}
            </div>,
            pane
        )
    }
}

// ══════════════════════════════════════
// SCHEDULE (scoped by active agent)
// ══════════════════════════════════════

let schedulePoller: ReturnType<typeof setInterval> | null = null
let knownMessageCount = 0

export async function fetchSchedules() {
    try {
        const res = await fetch('/api/schedule')
        if (res.ok) {
            const data = await res.json()
            const all: ScheduleEntry[] = Array.isArray(data) ? data : data.tasks || []
            // Scope by active agent
            if (state.activeAgentId) {
                state.schedules = all.filter(s => s.agentId === state.activeAgentId)
            } else {
                state.schedules = all
            }
            renderSchedulePane()
        }
    } catch { /* ignore */ }

    // Also check for new scheduler-pushed messages
    if (state.activeAgentId) {
        try {
            const mr = await fetch(`/api/state?agentId=${state.activeAgentId}`)
            if (mr.ok) {
                const data = await mr.json()
                const msgs = data.messages || []
                if (knownMessageCount > 0 && msgs.length > knownMessageCount) {
                    // New messages appeared — append only the new ones
                    const newMsgs = msgs.slice(knownMessageCount)
                    for (const m of newMsgs) {
                        if (m.role === 'assistant' && m.content) {
                            appendResponseBubble(m.content)
                        }
                    }
                }
                knownMessageCount = msgs.length
            }
        } catch { /* ignore */ }
    }
}

export function startSchedulePolling() {
    if (schedulePoller) return
    // Initialize message count so we don't re-render existing messages
    if (state.activeAgentId) {
        fetch(`/api/state?agentId=${state.activeAgentId}`)
            .then(r => r.json())
            .then(data => { knownMessageCount = (data.messages || []).length })
            .catch(() => { })
    }
    fetchSchedules()
    schedulePoller = setInterval(fetchSchedules, 5000)
}

export function stopSchedulePolling() {
    if (schedulePoller) { clearInterval(schedulePoller); schedulePoller = null }
}

export function resetMessageCount() {
    knownMessageCount = 0
}

function formatTimeUntil(ts: number): string {
    const diff = ts - Date.now()
    if (diff <= 0) return 'now'
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ${sec % 60}s`
    const hrs = Math.floor(min / 60)
    return `${hrs}h ${min % 60}m`
}

function statusBadge(s: ScheduleEntry) {
    if (s.status === 'running') return <span className="schedule-status running">⏳ running</span>
    if (s.status === 'completed') return <span className="schedule-status ok">✓ done</span>
    if (s.status === 'failed') return <span className="schedule-status err">✗ failed</span>
    if (s.status === 'cancelled') return <span className="schedule-status cancelled">■ cancelled</span>
    return <span className="schedule-status pending">queued</span>
}

function progressBar(completed: number, total: number) {
    if (total <= 1) return null
    const pct = Math.round((completed / total) * 100)
    return (
        <div className="schedule-progress">
            <div className="schedule-progress-bar" style={{ width: `${pct}%` }} />
            <span className="schedule-progress-text">{completed}/{total} ({pct}%)</span>
        </div>
    )
}

export function renderSchedulePane() {
    const pane = document.getElementById('pane-schedule')!
    if (state.schedules.length === 0) {
        render(<div className="overview-empty">No scheduled tasks for this agent.</div>, pane)
    } else {
        const sorted = [...state.schedules].reverse()
        render(
            <div className="schedule-list">
                {sorted.map(s => (
                    <div className={`schedule-item schedule-${s.status || 'pending'}`} key={s.id}>
                        <div className="schedule-left">
                            <div className="schedule-info">
                                <div className="schedule-name">{s.name}</div>
                                {s.scriptPath && <div className="schedule-script">📄 {s.scriptPath}</div>}
                                {s.progress && progressBar(s.progress.completed, s.progress.total)}
                                <div className="schedule-meta">
                                    {s.type === 'sequential' && <span className="schedule-type">sequential · </span>}
                                    {s.type === 'interval' && <span className="schedule-type">every {s.intervalSec}s · </span>}
                                    {s.nextRun && s.status === 'pending' && <span>next in {formatTimeUntil(s.nextRun)}</span>}
                                    {s.lastRun && <span>last run {new Date(s.lastRun).toLocaleTimeString()}</span>}
                                    {s.progress && s.progress.completed > 0 && <span> · ran {s.progress.completed}×</span>}
                                </div>
                                {s.lastOutput && <div className="schedule-output">{s.lastOutput.substring(0, 200)}</div>}
                                {s.lastError && <div className="schedule-error">{s.lastError}</div>}
                            </div>
                        </div>
                        <div className="schedule-right">
                            {statusBadge(s)}
                            {(s.status !== 'completed' && s.status !== 'cancelled') && (
                                <button className="schedule-cancel" onClick={() => cancelTask(s.id)} title="Cancel task">{'✕'}</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>,
            pane
        )
    }
}

async function cancelTask(id: string) {
    await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' })
    state.schedules = state.schedules.filter(s => s.id !== id)
    renderSchedulePane()
}

// ══════════════════════════════════════
// DATA (agent state — key/value entries)
// ══════════════════════════════════════

let dataPoller: ReturnType<typeof setInterval> | null = null

export async function fetchStateEntries() {
    if (!state.activeAgentId) return
    try {
        const res = await fetch(`/api/agent-state?agentId=${state.activeAgentId}`)
        if (res.ok) {
            state.stateEntries = await res.json()
            renderDataPane()
        }
    } catch { /* ignore */ }
}

export function startDataPolling() {
    if (dataPoller) return
    fetchStateEntries()
    dataPoller = setInterval(fetchStateEntries, 3000)
}

export function stopDataPolling() {
    if (dataPoller) { clearInterval(dataPoller); dataPoller = null }
}

function truncateValue(v: string, maxLen = 200): string {
    if (v.length <= maxLen) return v
    return v.substring(0, maxLen) + '…'
}

export function renderDataPane() {
    const pane = document.getElementById('pane-data')!
    if (!state.activeAgentId) {
        render(<div className="overview-empty">Select an agent to view its state.</div>, pane)
        return
    }
    if (state.stateEntries.length === 0) {
        render(<div className="overview-empty">No state data for this agent. Scripts can persist state via the STATE_URL API.</div>, pane)
    } else {
        render(
            <div className="data-list">
                {state.stateEntries.map(entry => (
                    <div className="data-item" key={entry.id}>
                        <div className="data-key">{entry.key}</div>
                        <div className="data-value">{truncateValue(entry.value)}</div>
                        <button
                            className="data-delete"
                            onClick={() => deleteStateEntry(entry.agentId, entry.key)}
                            title="Delete entry"
                        >{'✕'}</button>
                    </div>
                ))}
            </div>,
            pane
        )
    }
}

async function deleteStateEntry(agentId: number, key: string) {
    await fetch(`/api/agent-state?agentId=${agentId}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    state.stateEntries = state.stateEntries.filter(e => e.key !== key)
    renderDataPane()
}

// ── Tab Switching ──

export function switchTab(tab: 'objectives' | 'files' | 'schedule' | 'data') {
    state.activeTab = tab

    document.querySelectorAll('#tab-bar .tab').forEach(t => {
        t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab)
    })

    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === `pane-${tab}`)
    })

    // Schedule polling always runs in background (for chat auto-refresh)
    // Only start/stop Data polling based on tab
    startSchedulePolling()
    if (tab === 'data') {
        startDataPolling()
    } else {
        stopDataPolling()
    }
}
