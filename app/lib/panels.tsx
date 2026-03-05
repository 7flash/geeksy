// app/src/lib/panels.tsx — Overview panes: Objectives Timeline, Files, Schedule, Memory
import { render } from 'melina/client'
import { state, dom } from './state'
import { appendResponseBubble } from './chat-ui'
import type { ObjectiveEntry, ObjectiveGroup, ScheduleEntry, StateEntry, SkillInfo } from './types'

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
// MEMORY (agent state — key/value entries)
// ══════════════════════════════════════

let memoryPoller: ReturnType<typeof setInterval> | null = null

export async function fetchMemoryEntries() {
    if (!state.activeAgentId) return
    try {
        const res = await fetch(`/api/agent-state?agentId=${state.activeAgentId}`)
        if (res.ok) {
            state.stateEntries = await res.json()
            renderMemoryPane()
        }
    } catch { /* ignore */ }
}

export function startMemoryPolling() {
    if (memoryPoller) return
    fetchMemoryEntries()
    memoryPoller = setInterval(fetchMemoryEntries, 3000)
}

export function stopMemoryPolling() {
    if (memoryPoller) { clearInterval(memoryPoller); memoryPoller = null }
}

function truncateValue(v: string, maxLen = 200): string {
    if (v.length <= maxLen) return v
    return v.substring(0, maxLen) + '…'
}

export function renderMemoryPane() {
    const pane = document.getElementById('pane-memory')!
    if (!pane) return
    if (!state.activeAgentId) {
        render(<div className="overview-empty">Select an agent to view its memory.</div>, pane)
        return
    }
    if (state.stateEntries.length === 0) {
        render(
            <div className="overview-empty">
                <div className="memory-empty-icon">🧠</div>
                <div>No memory entries yet.</div>
                <div className="memory-empty-hint">Agents store structured data here via <code>getState</code> / <code>setState</code> in scripts, or through the agent-state API.</div>
            </div>,
            pane
        )
    } else {
        // Group entries by key prefix (e.g. "users." → Users collection)
        const groups = new Map<string, typeof state.stateEntries>()
        for (const entry of state.stateEntries) {
            const prefix = entry.key.includes('.') ? entry.key.split('.')[0] : '_ungrouped'
            if (!groups.has(prefix)) groups.set(prefix, [])
            groups.get(prefix)!.push(entry)
        }

        render(
            <div className="memory-list">
                {Array.from(groups.entries()).map(([group, entries]) => (
                    <div className="memory-group" key={group}>
                        {group !== '_ungrouped' && (
                            <div className="memory-group-header">
                                <span className="memory-group-icon">📁</span>
                                <span className="memory-group-name">{group}</span>
                                <span className="memory-group-count">{entries.length}</span>
                            </div>
                        )}
                        {entries.map(entry => {
                            const isJson = entry.value.startsWith('{') || entry.value.startsWith('[')
                            const shortKey = entry.key.includes('.') ? entry.key.split('.').slice(1).join('.') : entry.key
                            return (
                                <div className="memory-item" key={entry.id}>
                                    <div className="memory-item-header">
                                        <span className="memory-key">{shortKey}</span>
                                        <button
                                            className="memory-delete"
                                            onClick={() => deleteMemoryEntry(entry.agentId, entry.key)}
                                            title="Delete entry"
                                        >✕</button>
                                    </div>
                                    <div className={`memory-value ${isJson ? 'json' : ''}`}>
                                        {isJson ? formatJsonPreview(entry.value) : truncateValue(entry.value)}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>,
            pane
        )
    }
}

function formatJsonPreview(value: string): string {
    try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return `[${parsed.length} items] ${JSON.stringify(parsed.slice(0, 3)).slice(0, 150)}…`
        const keys = Object.keys(parsed)
        return `{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}}`
    } catch {
        return truncateValue(value)
    }
}

async function deleteMemoryEntry(agentId: number, key: string) {
    await fetch(`/api/agent-state?agentId=${agentId}&key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    state.stateEntries = state.stateEntries.filter(e => e.key !== key)
    renderMemoryPane()
}

// ══════════════════════════════════════
// SKILLS (YAML skill files from skills/ directory)
// ══════════════════════════════════════

const SKILL_ICONS: Record<string, string> = {
    bun: '⚡',
    docker: '🐳',
    git: '📦',
    npm: '📋',
    project: '🏗️',
}

let expandedSkillId: string | null = null

export function renderSkillsPane() {
    const pane = document.getElementById('pane-skills')!
    if (!pane) return

    const skills = state.availableSkills

    if (skills.length === 0) {
        render(
            <div className="overview-empty">No skill files found in <code>skills/</code> directory.<br />Create <code>.md</code> files with YAML frontmatter to define new skills.</div>,
            pane
        )
        return
    }

    render(
        <div className="skills-panel-list">
            {skills.map(skill => {
                const icon = SKILL_ICONS[skill.id] || '🔧'
                const isActive = state.activeSkills.has(skill.id)
                const isExpanded = expandedSkillId === skill.id
                // Count content lines for a rough size indicator
                const lineCount = skill.content ? skill.content.split('\n').length : 0
                const preview = skill.content
                    ? skill.content.split('\n').slice(0, 3).join('\n')
                    : ''

                return (
                    <div className={`skill-panel-card ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`} key={skill.id}>
                        <div className="skill-panel-header">
                            <div className="skill-panel-identity" onClick={() => { expandedSkillId = isExpanded ? null : skill.id; renderSkillsPane() }}>
                                <span className="skill-panel-icon">{icon}</span>
                                <div>
                                    <div className="skill-panel-name">{skill.name}</div>
                                    <div className="skill-panel-desc">{skill.description}</div>
                                </div>
                            </div>
                            <div className="skill-panel-actions">
                                <span className="skill-panel-count">{lineCount} lines</span>
                                <button
                                    className={`skill-toggle-btn ${isActive ? 'on' : 'off'}`}
                                    onClick={() => {
                                        if (isActive) state.activeSkills.delete(skill.id)
                                        else state.activeSkills.add(skill.id)
                                        renderSkillsPane()
                                    }}
                                >
                                    {isActive ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                        {isExpanded && (
                            <div className="skill-panel-content">
                                <pre className="skill-content-preview">{skill.content}</pre>
                            </div>
                        )}
                        {!isExpanded && preview && (
                            <div className="skill-panel-preview">
                                <code>{preview.substring(0, 120)}{preview.length > 120 ? '…' : ''}</code>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>,
        pane
    )
}

// ── Tab Switching ──

export function switchTab(tab: 'objectives' | 'files' | 'schedule' | 'processes' | 'memory' | 'skills') {
    state.activeTab = tab

    document.querySelectorAll('#tab-bar .tab').forEach(t => {
        t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab)
    })

    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === `pane-${tab}`)
    })

    // Schedule polling always runs in background (for chat auto-refresh)
    // Only start/stop Memory polling based on tab
    startSchedulePolling()
    if (tab === 'memory') {
        startMemoryPolling()
    } else {
        stopMemoryPolling()
    }

    if (tab === 'skills') {
        renderSkillsPane()
    }
    if (tab === 'processes') {
        fetchProcesses()
        startProcessPolling()
    } else {
        stopProcessPolling()
    }
}

// ══════════════════════════════════════
// PROCESSES (bgrun process list)
// ══════════════════════════════════════

interface BgrunProcess {
    name: string
    status: 'running' | 'stopped' | 'crashed'
    pid?: number
    uptime?: string
    command?: string
    directory?: string
    startedAt?: string
    port?: number
    ports?: number[]
    memory?: number
    runtime?: number
    group?: string
}

let processPoller: ReturnType<typeof setInterval> | null = null

export async function fetchProcesses() {
    try {
        const res = await fetch('/api/processes')
        if (res.ok) {
            const data = await res.json()
            renderProcessesPane(Array.isArray(data) ? data : data.processes || [])
        }
    } catch {
        renderProcessesPane([])
    }
}

export function startProcessPolling() {
    if (processPoller) return
    fetchProcesses()
    processPoller = setInterval(fetchProcesses, 5000)
}

export function stopProcessPolling() {
    if (processPoller) { clearInterval(processPoller); processPoller = null }
}

function formatUptime(startedAt: string | undefined): string {
    if (!startedAt) return ''
    const diff = Date.now() - new Date(startedAt).getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m`
    const hrs = Math.floor(min / 60)
    if (hrs < 24) return `${hrs}h ${min % 60}m`
    const days = Math.floor(hrs / 24)
    return `${days}d ${hrs % 24}h`
}

function formatMemory(bytes: number | undefined): string {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function processStatusDot(status: string) {
    if (status === 'running') return <span className="proc-dot proc-running" title="Running">●</span>
    if (status === 'stopped') return <span className="proc-dot proc-stopped" title="Stopped">●</span>
    return <span className="proc-dot proc-crashed" title="Crashed">●</span>
}

function renderProcessesPane(processes: BgrunProcess[]) {
    const pane = document.getElementById('pane-processes')
    if (!pane) return

    if (processes.length === 0) {
        render(
            <div className="overview-empty">
                <div>No processes running.</div>
                <div className="memory-empty-hint">Processes are spawned by plugins and agent scripts via bgrun.</div>
            </div>,
            pane
        )
        return
    }

    const running = processes.filter(p => p.status === 'running')
    const stopped = processes.filter(p => p.status !== 'running')

    render(
        <div className="process-list">
            <div className="process-summary">
                <span className="process-count">{running.length} running</span>
                {stopped.length > 0 && <span className="process-count-dim"> · {stopped.length} stopped</span>}
            </div>
            {processes.map(p => (
                <div className={`process-item process-${p.status}`} key={p.name}>
                    <div className="process-left">
                        {processStatusDot(p.status)}
                        <div className="process-info">
                            <div className="process-name-row">
                                <span className="process-name">{p.name}</span>
                                {p.group && <span className="process-group-badge">{p.group}</span>}
                                {p.port && p.status === 'running' && (
                                    <a className="process-port-link" href={`http://localhost:${p.port}`} target="_blank" rel="noopener">:{p.port}</a>
                                )}
                            </div>
                            <div className="process-meta">
                                {p.pid && <span>PID {p.pid}</span>}
                                {p.startedAt && p.status === 'running' && <span> · ↑ {formatUptime(p.startedAt)}</span>}
                                {p.memory && p.memory > 0 && <span> · {formatMemory(p.memory)}</span>}
                                {p.directory && <span> · {p.directory.replace(/.*[/\\]/, '')}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="process-actions">
                        {p.status === 'running' && (
                            <button className="process-btn stop" onClick={() => stopProcess(p.name)} title="Stop">■</button>
                        )}
                        {p.status !== 'running' && (
                            <button className="process-btn start" onClick={() => restartProcess(p.name)} title="Restart">▶</button>
                        )}
                    </div>
                </div>
            ))}
        </div>,
        pane
    )
}

async function stopProcess(name: string) {
    await fetch('/api/processes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    })
    fetchProcesses()
}

async function restartProcess(name: string) {
    await fetch('/api/processes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action: 'restart' }),
    })
    fetchProcesses()
}

