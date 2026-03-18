// app/src/lib/panels.tsx — Overview panes: Objectives Timeline, Files, Schedule, Memory
import { render } from 'melina/client'
import { state, dom, saveState, debugLog } from './state'
import { appendResponseBubble } from './chat-ui'
import { getActiveSessionId } from './sessions-ui'
import type { ObjectiveEntry, ObjectiveGroup, ScheduleEntry, ScheduleStats, StateEntry, SkillInfo } from './types'

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

/** @deprecated Objectives tab removed — objectives now live in chat confirmation cards and heartbeat validation */
export function renderObjectivesPane() {
    // No-op: objectives tab has been removed from the UI
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
}

// ══════════════════════════════════════
// FILES
// ══════════════════════════════════════

const fileContentCache = new Map<string, { content: string; size: number; truncated: boolean; modifiedAt?: number }>()
let expandedFilePath: string | null = null

function FileItem({ f }: { f: { path: string; action: string } }) {
    const isExpanded = expandedFilePath === f.path
    const cached = fileContentCache.get(f.path)
    const ext = f.path.split('.').pop()?.toLowerCase() || ''
    const langHint = ['ts', 'tsx', 'js', 'jsx'].includes(ext) ? 'typescript'
        : ['py'].includes(ext) ? 'python'
        : ['md'].includes(ext) ? 'markdown'
        : ['json'].includes(ext) ? 'json'
        : ['css'].includes(ext) ? 'css'
        : ['html'].includes(ext) ? 'html'
        : ['sh', 'bash'].includes(ext) ? 'bash'
        : 'text'

    return (
        <div className={`file-item ${isExpanded ? 'file-expanded' : ''}`}>
            <div className="file-item-row" data-file-path={f.path}>
                <span className="file-icon">{f.action === 'write' ? '📝' : '📄'}</span>
                <span className="file-path">{f.path}</span>
                <span className={`file-action ${f.action}`}>{f.action}</span>
                <span className="file-expand-arrow">{isExpanded ? '▾' : '▸'}</span>
            </div>
            {isExpanded && cached && (
                <div className="file-preview">
                    <div className="file-preview-meta">
                        <span className="file-preview-lang">{langHint}</span>
                        <span className="file-preview-size">{cached.size > 1024 ? `${(cached.size / 1024).toFixed(1)}KB` : `${cached.size}B`}</span>
                        {cached.truncated && <span className="file-preview-truncated">truncated</span>}
                    </div>
                    <pre className="file-preview-content">{cached.content}</pre>
                </div>
            )}
            {isExpanded && !cached && (
                <div className="file-preview">
                    <div className="file-preview-loading">Loading…</div>
                </div>
            )}
        </div>
    )
}

async function toggleFilePreview(path: string) {
    if (expandedFilePath === path) {
        expandedFilePath = null
        renderFilesPane()
        return
    }

    expandedFilePath = path

    if (!fileContentCache.has(path)) {
        renderFilesPane() // show loading state
        try {
            const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`)
            if (res.ok) {
                const data = await res.json()
                fileContentCache.set(path, {
                    content: data.content || '',
                    size: data.size || 0,
                    truncated: data.truncated || false,
                    modifiedAt: data.modifiedAt,
                })
            } else {
                const err = await res.json().catch(() => ({ error: 'Failed to load' }))
                fileContentCache.set(path, {
                    content: `Error: ${err.error || 'Could not read file'}`,
                    size: 0,
                    truncated: false,
                })
            }
        } catch {
            fileContentCache.set(path, {
                content: 'Error: Network request failed',
                size: 0,
                truncated: false,
            })
        }
    }

    renderFilesPane()
}

export function renderFilesPane() {
    const pane = document.getElementById('pane-files')!
    if (state.files.length === 0) {
        render(<div className="overview-empty">No files touched yet.</div>, pane)
    } else {
        render(
            <div className="file-list">
                {state.files.map(f => <FileItem f={f} />)}
            </div>,
            pane
        )
        // Wire click handlers via delegation
        pane.querySelectorAll('.file-item-row[data-file-path]').forEach(el => {
            el.addEventListener('click', () => {
                const path = (el as HTMLElement).dataset.filePath
                if (path) toggleFilePreview(path)
            })
        })
    }
}

// ══════════════════════════════════════
// SCHEDULE (scoped by active agent)
// ══════════════════════════════════════

let schedulePoller: ReturnType<typeof setInterval> | null = null
let knownMessageCount = 0

export async function fetchSchedules() {
    const sessionId = getActiveSessionId()
    try {
        const res = await fetch(sessionId ? `/api/schedule?sessionId=${sessionId}` : '/api/schedule')
        if (res.ok) {
            const data = await res.json()
            // Support both new { tasks, stats } and legacy array format
            const all: ScheduleEntry[] = Array.isArray(data) ? data : data.tasks || []
            const stats: ScheduleStats | null = data.stats || null
            // Scope by active agent
            if (state.activeAgentId) {
                state.schedules = all.filter(s => s.agentId === state.activeAgentId)
            } else {
                state.schedules = all
            }
            state.scheduleStats = stats
            renderSchedulePane()
        }
    } catch { /* ignore */ }

    // Also check for new scheduler-pushed messages
    if (state.activeAgentId) {
        try {
            const mr = await fetch(getActiveSessionId() ? `/api/state?agentId=${state.activeAgentId}&sessionId=${getActiveSessionId()}` : `/api/state?agentId=${state.activeAgentId}`)
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
        fetch(getActiveSessionId() ? `/api/state?agentId=${state.activeAgentId}&sessionId=${getActiveSessionId()}` : `/api/state?agentId=${state.activeAgentId}`)
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
    if (s.status === 'pending' && s.retry && s.retry.count > 0 && s.retry.max > 0) {
        return <span className="schedule-status retrying" style={{ color: 'var(--amber, #f59e0b)' }}>↻ retry {s.retry.count}/{s.retry.max}</span>
    }
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

let scheduleViewMode: 'list' | 'calendar' = 'list'
let calendarWeekOffset = 0

function renderCalendarView(pane: HTMLElement) {
    const now = new Date()
    now.setDate(now.getDate() + calendarWeekOffset * 7)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek)
        d.setDate(startOfWeek.getDate() + i)
        days.push(d)
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const statusColors: Record<string, string> = {
        pending: '#4ade80', running: '#60a5fa', completed: '#888', failed: '#ef4444', cancelled: '#666',
    }

    render(
        <div style={{ padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                    style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 14 }}
                    onClick={() => { calendarWeekOffset--; renderCalendarView(pane) }}
                >◀</button>
                <span style={{ color: '#e8e8f0', fontSize: 12, fontWeight: 600, flex: 1, textAlign: 'center' as const }}>
                    {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6]!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <button
                    style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 14 }}
                    onClick={() => { calendarWeekOffset++; renderCalendarView(pane) }}
                >▶</button>
                <button
                    style={{ background: 'rgba(128,90,255,0.15)', border: '1px solid rgba(128,90,255,0.3)', borderRadius: 6, color: '#a78bfa', cursor: 'pointer', fontSize: 10, padding: '2px 8px' }}
                    onClick={() => { scheduleViewMode = 'list'; renderSchedulePane() }}
                >📋 List</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {days.map((day, i) => {
                    const dayStart = day.getTime()
                    const dayEnd = dayStart + 86400000
                    const isToday = new Date().toDateString() === day.toDateString()
                    const tasksToday = state.schedules.filter(s => {
                        const t = s.nextRun || s.lastRun || 0
                        return t >= dayStart && t < dayEnd
                    })
                    return (
                        <div style={{
                            background: isToday ? 'rgba(128,90,255,0.1)' : 'rgba(255,255,255,0.02)',
                            borderRadius: 6,
                            padding: 4,
                            minHeight: 60,
                            border: isToday ? '1px solid rgba(128,90,255,0.3)' : '1px solid rgba(255,255,255,0.05)',
                        }}>
                            <div style={{ fontSize: 9, color: isToday ? '#a78bfa' : '#888', fontWeight: 600, textAlign: 'center' as const }}>{dayNames[i]}</div>
                            <div style={{ fontSize: 11, color: '#e8e8f0', textAlign: 'center' as const, marginBottom: 2 }}>{day.getDate()}</div>
                            {tasksToday.map(t => (
                                <div style={{
                                    fontSize: 9,
                                    padding: '1px 4px',
                                    borderRadius: 4,
                                    background: (statusColors[t.status] || '#666') + '22',
                                    color: statusColors[t.status] || '#888',
                                    marginTop: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' as const,
                                }} title={t.name}>{t.name}</div>
                            ))}
                        </div>
                    )
                })}
            </div>
        </div>,
        pane
    )
}

export function renderSchedulePane() {
    const pane = document.getElementById('pane-schedule')!
    if (scheduleViewMode === 'calendar') {
        renderCalendarView(pane)
        return
    }
    if (state.schedules.length === 0) {
        render(
            <div className="overview-empty">
                <div className="memory-empty-icon">⏰</div>
                <div>No scheduled tasks yet.</div>
                <div className="memory-empty-hint">Agents can schedule future tasks or recurring intervals using the <code>schedule</code> tool.</div>
            </div>,
            pane
        )
    } else {
        const stats = state.scheduleStats
        const sorted = [...state.schedules].sort((a, b) => {
            // Pending tasks first, sorted by nextRun
            if (a.status === 'pending' && b.status === 'pending') {
                return (a.nextRun || 0) - (b.nextRun || 0)
            }
            if (a.status === 'pending') return -1
            if (b.status === 'pending') return 1
            // Running tasks
            if (a.status === 'running') return -1
            if (b.status === 'running') return 1
            // Then sort reverse chronologically by lastRun for completed/failed
            return (b.lastRun || 0) - (a.lastRun || 0)
        })

        render(
            <div className="schedule-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {stats && (stats.totalSuccess > 0 || stats.totalFail > 0) && (
                    <div className="schedule-stats" style={{
                        padding: '10px 12px', borderBottom: '1px solid var(--border)',
                        display: 'flex', gap: '14px', fontSize: '12px', background: 'var(--bg-card)', flexWrap: 'wrap'
                    }}>
                        <span style={{ color: 'var(--text-dim)' }}><strong>Scheduler:</strong></span>
                        <span><span style={{ color: 'var(--text)' }}>{stats.totalSuccess + stats.totalFail}</span> runs</span>
                        {stats.totalSuccess > 0 && <span style={{ color: 'var(--green)' }}>✓ {stats.totalSuccess}</span>}
                        {stats.totalFail > 0 && <span style={{ color: 'var(--red)' }}>✗ {stats.totalFail}</span>}
                        {(stats.totalSuccess + stats.totalFail) > 0 && (
                            <span style={{ color: 'var(--text-dim)' }}>
                                {Math.round(stats.totalSuccess / (stats.totalSuccess + stats.totalFail) * 100)}% success
                            </span>
                        )}
                        {stats.avgDurationMs > 0 && (
                            <span style={{ color: 'var(--text-dim)' }}>
                                ⏱ avg {stats.avgDurationMs < 1000 ? `${stats.avgDurationMs}ms` : `${(stats.avgDurationMs / 1000).toFixed(1)}s`}
                            </span>
                        )}
                        <button
                            style={{ marginLeft: 'auto', background: 'rgba(128,90,255,0.15)', border: '1px solid rgba(128,90,255,0.3)', borderRadius: 6, color: '#a78bfa', cursor: 'pointer', fontSize: 10, padding: '2px 8px' }}
                            onClick={() => { scheduleViewMode = 'calendar'; renderSchedulePane() }}
                        >📅 Calendar</button>
                    </div>
                )}
                {(!stats || (stats.totalSuccess === 0 && stats.totalFail === 0)) && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right' as const }}>
                        <button
                            style={{ background: 'rgba(128,90,255,0.15)', border: '1px solid rgba(128,90,255,0.3)', borderRadius: 6, color: '#a78bfa', cursor: 'pointer', fontSize: 10, padding: '2px 8px' }}
                            onClick={() => { scheduleViewMode = 'calendar'; renderSchedulePane() }}
                        >📅 Calendar</button>
                    </div>
                )}
                <div className="schedule-list" style={{ flex: 1, overflowY: 'auto' }}>
                    {sorted.map(s => (
                        <div className={`schedule-item schedule-${s.status || 'pending'}`} key={s.id}>
                            <div className="schedule-left">
                                <div className="schedule-icon">
                                    {s.status === 'running' ? '⏳' : s.status === 'failed' ? '❌' : s.type === 'interval' ? '🔄' : '⏰'}
                                </div>
                                <div className="schedule-info">
                                    <div className="schedule-name">{s.name}</div>
                                    {s.scriptPath && <div className="schedule-script">📄 {s.scriptPath.replace(/.*[/\\]/, '')}</div>}
                                    {s.message && <div className="schedule-script">💬 {s.message.substring(0, 40)}{s.message.length > 40 ? '...' : ''}</div>}
                                    {s.progress && progressBar(s.progress.completed, s.progress.total)}
                                    {s.tasks && s.tasks.length > 0 && (
                                        <div className="schedule-subtasks" style={{ marginTop: '8px', marginBottom: '6px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                            {s.tasks.map((t: any) => (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: t.status === 'pending' ? 0.6 : 1 }}>
                                                    <span style={{ minWidth: '16px', textAlign: 'center' }}>
                                                        {t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'running' ? '🔹' : '·'}
                                                    </span>
                                                    <span style={{ color: t.status === 'completed' ? 'var(--green)' : t.status === 'failed' ? 'var(--red)' : t.status === 'running' ? 'var(--text)' : 'inherit' }}>
                                                        {t.name}
                                                    </span>
                                                    {t.status === 'running' && <span className="running-dot-pulse" style={{ width: '6px', height: '6px', background: 'var(--amber)', borderRadius: '50%', marginLeft: 'auto', animation: 'blink 1s infinite' }}></span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="schedule-meta">
                                        {s.type === 'sequential' && <span className="schedule-type">sequential · </span>}
                                        {s.type === 'interval' && <span className="schedule-type">every {s.intervalSec}s · </span>}
                                        {s.type === 'cron' && s.cron && <span className="schedule-type" title={s.cron}>⏲ cron · </span>}
                                        {s.timeoutSec && <span className="schedule-type">timeout {s.timeoutSec}s · </span>}
                                        {s.failOnStderr && <span className="schedule-type" style={{ color: 'var(--amber, #f59e0b)' }}>stderr=fail · </span>}
                                        {s.expectedOutput && <span className="schedule-type" title={s.expectedOutput}>expects marker · </span>}
                                        {s.retry && s.retry.max > 0 && <span className="schedule-type" style={{ color: 'var(--amber, #f59e0b)' }}>↻ {s.retry.count}/{s.retry.max} retries · </span>}
                                        {s.nextRun && s.status === 'pending' && s.nextRun > Date.now() && <span>next in {formatTimeUntil(s.nextRun)}</span>}
                                        {s.nextRun && s.status === 'pending' && s.nextRun <= Date.now() && <span style={{ color: 'var(--amber)' }}>starting now</span>}
                                        {s.lastRun && <span>last run {new Date(s.lastRun).toLocaleTimeString()}</span>}
                                        {s.progress && s.progress.completed > 0 && <span> · ran {s.progress.completed}×</span>}
                                    </div>
                                    {s.lastOutput && <div className="schedule-output">{s.lastOutput.substring(0, 100)}{s.lastOutput.length > 100 ? '...' : ''}</div>}
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
                </div>
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

export function resolveCoreMemoryEntries(entries: StateEntry[], activeSessionId?: number | null) {
    const activeCoreMemoryKey = typeof activeSessionId === 'number' ? `core_memory.session.${activeSessionId}` : 'core_memory'
    const activeCoreMemoryUpdatedAtKey = typeof activeSessionId === 'number' ? `core_memory_updated_at.session.${activeSessionId}` : 'core_memory_updated_at'

    const coreMemoryEntry = entries.find((entry) => entry.key === activeCoreMemoryKey)
        || entries.find((entry) => entry.key === 'core_memory')
    const coreMemoryUpdatedAtEntry = entries.find((entry) => entry.key === activeCoreMemoryUpdatedAtKey)
        || entries.find((entry) => entry.key === 'core_memory_updated_at')
    const otherEntries = entries.filter((entry) => !entry.key.startsWith('core_memory'))
    const coreMemoryUpdatedAt = coreMemoryUpdatedAtEntry?.value ? Number(coreMemoryUpdatedAtEntry.value) : null
    const coreMemorySessionMatch = coreMemoryEntry?.key.match(/^core_memory\.session\.(\d+)$/)
    const coreMemorySessionId = coreMemorySessionMatch ? Number(coreMemorySessionMatch[1]) : null

    return { coreMemoryEntry, coreMemoryUpdatedAtEntry, otherEntries, coreMemoryUpdatedAt, coreMemorySessionId }
}

export function renderMemoryPane() {
    const pane = document.getElementById('pane-memory')!
    if (!pane) return
    if (!state.activeAgentId) {
        render(<div className="overview-empty">Select an agent to view its memory.</div>, pane)
        return
    }

    const activeSessionId = getActiveSessionId()
    const { coreMemoryEntry, otherEntries, coreMemoryUpdatedAt, coreMemorySessionId } = resolveCoreMemoryEntries(state.stateEntries, activeSessionId)

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
        const groups = new Map<string, typeof otherEntries>()
        for (const entry of otherEntries) {
            const prefix = entry.key.includes('.') ? entry.key.split('.')[0] : '_ungrouped'
            if (!groups.has(prefix)) groups.set(prefix, [])
            groups.get(prefix)!.push(entry)
        }

        const coreMemoryUpdatedAt = coreMemoryUpdatedAtEntry?.value ? Number(coreMemoryUpdatedAtEntry.value) : null
        const coreMemorySessionMatch = coreMemoryEntry?.key.match(/^core_memory\.session\.(\d+)$/)
        const coreMemorySessionId = coreMemorySessionMatch ? Number(coreMemorySessionMatch[1]) : null

        render(
            <div className="memory-list">
                {coreMemoryEntry ? (
                    <div className="memory-core-card">
                        <div className="memory-core-header">
                            <div>
                                <div className="memory-core-title">Heartbeat Core Memory</div>
                                <div className="memory-core-subtitle">
                                    {[
                                        coreMemorySessionId ? `Session ${coreMemorySessionId}` : 'Agent-wide',
                                        coreMemoryUpdatedAt && Number.isFinite(coreMemoryUpdatedAt)
                                            ? `Updated ${new Date(coreMemoryUpdatedAt).toLocaleString()}`
                                            : 'Persisted during heartbeat pruning',
                                    ].join(' • ')}
                                </div>
                            </div>
                            <button
                                className="memory-delete"
                                onClick={() => deleteMemoryEntry(coreMemoryEntry.agentId, coreMemoryEntry.key)}
                                title="Delete core memory"
                            >✕</button>
                        </div>
                        <pre className="memory-core-value">{coreMemoryEntry.value}</pre>
                    </div>
                ) : (
                    <div className="memory-core-card">
                        <div className="memory-core-header">
                            <div>
                                <div className="memory-core-title">Heartbeat Core Memory</div>
                                <div className="memory-core-subtitle">No retained summary for this conversation yet.</div>
                            </div>
                            <button
                                className="memory-capture-btn"
                                onClick={() => captureCoreMemorySnapshot()}
                                title="Capture current conversation into core memory"
                            >Capture current conversation</button>
                        </div>
                    </div>
                )}

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

async function captureCoreMemorySnapshot() {
    const agentId = state.activeAgentId
    const sessionId = getActiveSessionId()
    if (!agentId || !sessionId) return
    await fetch('/api/agent-state/core-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, sessionId }),
    })
    await fetchMemoryEntries()
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
    measure: '📊',
    melina: '🦊',
    bgrun: '🔄',
    sqlite: '🗄️',
    telegram: '📱',
    trading: '📈',
}

let expandedSkillId: string | null = null
let skillsFilter = ''

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

    const q = skillsFilter.toLowerCase()
    const filtered = q
        ? skills.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q)
        )
        : skills

    render(
        <div className="skills-panel-list">
            <div className="skills-search-bar" style={{ marginBottom: '8px' }}>
                <input
                    type="text"
                    className="skills-search-input"
                    placeholder="🔍 Filter skills..."
                    value={skillsFilter}
                    onInput={(e: any) => {
                        skillsFilter = (e.target as HTMLInputElement).value
                        renderSkillsPane()
                    }}
                    style={{ padding: '6px 10px', fontSize: '11px' }}
                />
                {skillsFilter && (
                    <button className="skills-search-clear" onClick={() => { skillsFilter = ''; renderSkillsPane() }} style={{ right: '40px' }}>✕</button>
                )}
                <span className="skills-count">{filtered.length}/{skills.length}</span>
            </div>
            {filtered.length === 0 ? (
                <div className="overview-empty" style={{ padding: '12px' }}>No skills matching "{skillsFilter}"</div>
            ) : filtered.map(skill => {
                const icon = (skill as any).plugin?.icon || SKILL_ICONS[skill.id] || '🔧'
                const isActive = state.activeSkills.has(skill.id)
                const isExpanded = expandedSkillId === skill.id
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
                                        saveState()
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
            {/* Marketplace section */}
            <div className="skills-marketplace-section" style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <div
                    className="skill-panel-header"
                    style={{ cursor: 'pointer', padding: '8px 0' }}
                    onClick={() => { marketplaceOpen = !marketplaceOpen; renderSkillsPane(); if (marketplaceOpen && !marketplaceData) loadMarketplace() }}
                >
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>🏪 Marketplace</span>
                    <span style={{ fontSize: '11px', color: '#666', marginLeft: '8px' }}>{marketplaceOpen ? '▾' : '▸'} Community Skills</span>
                </div>
                {marketplaceOpen && (
                    <div className="skills-marketplace-items">
                        {!marketplaceData ? (
                            <div className="overview-empty" style={{ padding: '12px', fontSize: '11px' }}>Loading marketplace...</div>
                        ) : marketplaceData.skills.length === 0 ? (
                            <div className="overview-empty" style={{ padding: '12px' }}>No marketplace skills available</div>
                        ) : marketplaceData.skills.map((ms: any) => (
                            <div className={`skill-panel-card ${ms.installed ? 'active' : ''}`} key={ms.id} style={{ opacity: ms.installed ? 0.7 : 1 }}>
                                <div className="skill-panel-header">
                                    <div className="skill-panel-identity">
                                        <span className="skill-panel-icon">{ms.icon}</span>
                                        <div>
                                            <div className="skill-panel-name">{ms.name}</div>
                                            <div className="skill-panel-desc">{ms.description}</div>
                                            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
                                                by {ms.author} · v{ms.version}
                                                {ms.tags?.map((t: string) => (
                                                    <span key={t} style={{ background: 'rgba(128,90,255,0.15)', color: '#a78bfa', padding: '1px 6px', borderRadius: '8px', marginLeft: '4px', fontSize: '9px' }}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="skill-panel-actions">
                                        {ms.installed ? (
                                            <span style={{ fontSize: '10px', color: '#4ade80' }}>✓ Installed</span>
                                        ) : (
                                            <button
                                                className="skill-toggle-btn on"
                                                style={{ fontSize: '10px', padding: '3px 10px' }}
                                                onClick={async () => {
                                                    try {
                                                        const res = await fetch('/api/skills/marketplace', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ id: ms.id }),
                                                        })
                                                        if (res.ok) {
                                                            ms.installed = true
                                                            // Refresh skills list
                                                            const skillsRes = await fetch('/api/skills')
                                                            if (skillsRes.ok) {
                                                                state.availableSkills = await skillsRes.json()
                                                            }
                                                            renderSkillsPane()
                                                        }
                                                    } catch { }
                                                }}
                                            >
                                                Install
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dependency Graph Section */}
            <div style={{ borderTop: '1px solid rgba(128,90,255,0.15)', marginTop: 8 }}>
                <div
                    className="marketplace-header"
                    style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#a78bfa', fontWeight: 600 }}
                    onClick={() => {
                        skillGraphOpen = !skillGraphOpen
                        renderSkillsPane()
                        if (skillGraphOpen) {
                            setTimeout(() => {
                                const graphContainer = document.getElementById('skill-graph-container')
                                if (graphContainer) renderSkillGraph(graphContainer)
                            }, 50)
                        }
                    }}
                >
                    <span style={{ transition: 'transform 0.2s', transform: skillGraphOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                    🔗 Dependency Graph
                </div>
                {skillGraphOpen && (
                    <div id="skill-graph-container" style={{ padding: '0 8px 8px' }} />
                )}
            </div>
        </div>,
        pane
    )
}

// ── Marketplace State ──

let marketplaceOpen = false
let marketplaceData: any = null

async function loadMarketplace() {
    try {
        const res = await fetch('/api/skills/marketplace')
        if (res.ok) {
            marketplaceData = await res.json()
            renderSkillsPane()
        }
    } catch { }
}

// ── Skill Dependency Graph ──

let skillGraphOpen = false

async function renderSkillGraph(container: HTMLElement) {
    container.innerHTML = '<div style="color:#888;font-size:11px;padding:8px">Loading graph…</div>'

    try {
        const res = await fetch('/api/skills/graph')
        const data = await res.json()
        const { nodes, edges }: { nodes: Array<{ id: string; name: string }>; edges: Array<{ source: string; target: string }> } = data

        if (nodes.length === 0) {
            container.innerHTML = '<div style="color:#888;font-size:11px;padding:8px">No skills found.</div>'
            return
        }

        const canvas = document.createElement('canvas')
        const W = container.clientWidth || 400
        const H = Math.max(200, nodes.length * 30)
        canvas.width = W
        canvas.height = H
        canvas.style.cssText = 'width:100%;border-radius:8px;background:rgba(0,0,0,0.2)'
        container.innerHTML = ''
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')!

        // Initialize positions randomly
        const positions = new Map<string, { x: number; y: number }>()
        for (const node of nodes) {
            positions.set(node.id, {
                x: 40 + Math.random() * (W - 80),
                y: 40 + Math.random() * (H - 80),
            })
        }

        // Simple force-directed layout (100 iterations)
        for (let iter = 0; iter < 100; iter++) {
            const forces = new Map<string, { fx: number; fy: number }>()
            for (const n of nodes) forces.set(n.id, { fx: 0, fy: 0 })

            // Repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = positions.get(nodes[i]!.id)!
                    const b = positions.get(nodes[j]!.id)!
                    const dx = a.x - b.x
                    const dy = a.y - b.y
                    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                    const force = 2000 / (dist * dist)
                    const fx = (dx / dist) * force
                    const fy = (dy / dist) * force
                    forces.get(nodes[i]!.id)!.fx += fx
                    forces.get(nodes[i]!.id)!.fy += fy
                    forces.get(nodes[j]!.id)!.fx -= fx
                    forces.get(nodes[j]!.id)!.fy -= fy
                }
            }

            // Attraction along edges
            for (const edge of edges) {
                const a = positions.get(edge.source)
                const b = positions.get(edge.target)
                if (!a || !b) continue
                const dx = b.x - a.x
                const dy = b.y - a.y
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                const force = dist * 0.01
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                forces.get(edge.source)!.fx += fx
                forces.get(edge.source)!.fy += fy
                forces.get(edge.target)!.fx -= fx
                forces.get(edge.target)!.fy -= fy
            }

            // Apply forces
            for (const node of nodes) {
                const pos = positions.get(node.id)!
                const f = forces.get(node.id)!
                pos.x = Math.max(30, Math.min(W - 30, pos.x + f.fx * 0.5))
                pos.y = Math.max(20, Math.min(H - 20, pos.y + f.fy * 0.5))
            }
        }

        // Draw edges
        ctx.strokeStyle = 'rgba(128,90,255,0.3)'
        ctx.lineWidth = 1.5
        for (const edge of edges) {
            const a = positions.get(edge.source)
            const b = positions.get(edge.target)
            if (!a || !b) continue
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
        }

        // Draw nodes
        for (const node of nodes) {
            const pos = positions.get(node.id)!
            // Circle
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2)
            ctx.fillStyle = '#a78bfa'
            ctx.fill()
            ctx.strokeStyle = '#7c3aed'
            ctx.lineWidth = 1.5
            ctx.stroke()
            // Label
            ctx.fillStyle = '#e8e8f0'
            ctx.font = '10px Inter, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(node.name.substring(0, 16), pos.x, pos.y + 18)
        }

        // Stats
        const statsEl = document.createElement('div')
        statsEl.style.cssText = 'color:#888;font-size:10px;padding:4px 8px'
        statsEl.textContent = `${nodes.length} skills · ${edges.length} dependencies`
        container.appendChild(statsEl)
    } catch {
        container.innerHTML = '<div style="color:#888;font-size:11px;padding:8px">Failed to load graph.</div>'
    }
}

export { renderSkillGraph, skillGraphOpen }

// ══════════════════════════════════════
// TIMELINE (agent activity feed)
// ══════════════════════════════════════

function relativeTime(ts: number): string {
    const diff = Date.now() - ts
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
}

async function renderTimelinePane() {
    const pane = document.getElementById('pane-timeline')
    if (!pane) return

    const agentId = state.activeAgentId
    if (!agentId) {
        pane.innerHTML = '<div class="overview-empty">No agent selected.</div>'
        return
    }

    pane.innerHTML = '<div class="overview-empty" style="opacity:0.5">Loading timeline…</div>'

    try {
        const res = await fetch(`/api/timeline?agentId=${agentId}&limit=60`)
        const data = await res.json()
        const events = data.events || []

        if (events.length === 0) {
            pane.innerHTML = '<div class="overview-empty">No activity yet. Send a message to start!</div>'
            return
        }

        const borderColors: Record<string, string> = {
            message: '#a78bfa',
            objective: '#4ade80',
            file: '#60a5fa',
            schedule: '#fbbf24',
        }

        pane.innerHTML = ''
        const list = document.createElement('div')
        list.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;overflow-y:auto;max-height:100%'

        for (const ev of events) {
            const item = document.createElement('div')
            item.style.cssText = `
                display:flex;align-items:flex-start;gap:8px;padding:6px 8px;
                border-left:3px solid ${borderColors[ev.type] || '#666'};
                background:rgba(255,255,255,0.02);border-radius:0 6px 6px 0;
                font-size:12px;font-family:'Inter',sans-serif;transition:background 0.1s;
            `
            item.addEventListener('mouseenter', () => { item.style.background = 'rgba(255,255,255,0.05)' })
            item.addEventListener('mouseleave', () => { item.style.background = 'rgba(255,255,255,0.02)' })

            item.innerHTML = `
                <span style="font-size:14px;line-height:1.4;flex-shrink:0">${ev.icon}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:500;color:#e8e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev.title}</div>
                    ${ev.detail ? `<div style="color:#888;font-size:11px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev.detail.replace(/</g, '&lt;')}</div>` : ''}
                </div>
                <span style="color:#666;font-size:10px;white-space:nowrap;flex-shrink:0">${relativeTime(ev.timestamp)}</span>
            `
            list.appendChild(item)
        }

        pane.appendChild(list)
    } catch {
        pane.innerHTML = '<div class="overview-empty">Failed to load timeline.</div>'
    }
}

// ── Tab Switching ──

export function switchTab(tab: 'objectives' | 'files' | 'schedule' | 'processes' | 'memory' | 'skills' | 'timeline' | 'prompt') {
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
    if (tab === 'timeline') {
        renderTimelinePane()
    }
    if (tab === 'prompt') {
        renderPromptPane()
    }
    if (tab === 'debug') {
        renderDebugPane()
    }
}

// ══════════════════════════════════════
// PROMPT EDITOR
// ══════════════════════════════════════

export function renderPromptPane() {
    const pane = document.getElementById('pane-prompt')!
    if (!pane) return
    if (!state.activeAgentId) {
        render(<div className="overview-empty">Select an agent to edit its system prompt.</div>, pane)
        return
    }

    const agent = state.agents.find(a => a.id === state.activeAgentId)
    if (!agent) return
    const currentPrompt = agent.systemPrompt || ''

    render(
        <div className="prompt-editor-container" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8e8f0' }}>System Prompt</span>
                <button
                    className="save-prompt-btn"
                    style={{ background: 'rgba(128,90,255,0.2)', color: '#fff', border: '1px solid rgba(128,90,255,0.5)', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}
                    onClick={async (e) => {
                        const btn = e.currentTarget as HTMLButtonElement
                        const area = document.getElementById('prompt-editor-area') as HTMLTextAreaElement
                        if (!area) return
                        btn.textContent = 'Saving...'
                        try {
                            await fetch(`/api/agents?id=${agent.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ systemPrompt: area.value })
                            })
                            agent.systemPrompt = area.value
                            btn.textContent = '✓ Saved'
                            btn.style.background = 'rgba(74,222,128,0.2)'
                            btn.style.borderColor = 'rgba(74,222,128,0.5)'
                            setTimeout(() => {
                                btn.textContent = 'Save'
                                btn.style.background = 'rgba(128,90,255,0.2)'
                                btn.style.borderColor = 'rgba(128,90,255,0.5)'
                            }, 2000)
                        } catch {
                            btn.textContent = 'Error'
                        }
                    }}
                >
                    Save
                </button>
            </div>
            <textarea
                id="prompt-editor-area"
                className="input-field"
                style={{ flex: 1, resize: 'none', height: '100%', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5', padding: '12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: '#ccc' }}
                placeholder="You are a helpful assistant. Define custom behaviors, constraints, and personality here..."
                defaultValue={currentPrompt}
            />
            <div style={{ fontSize: '11px', color: '#888' }}>
                This prompt will be prepended to all new conversations for this agent.
            </div>
        </div>,
        pane
    )
}

// ══════════════════════════════════════
// DEBUG LOG (raw SSE events, planner output, tool traffic)
// ══════════════════════════════════════

const DEBUG_TYPE_COLORS: Record<string, string> = {
    planning: '#4ade80',
    replanning: '#facc15',
    awaiting_confirmation: '#f59e0b',
    tool_start: '#60a5fa',
    tool_result: '#818cf8',
    thinking: '#94a3b8',
    streaming: '#64748b',
    iteration_start: '#a78bfa',
    objective_check: '#34d399',
    complete: '#22d3ee',
    error: '#f87171',
    session: '#c084fc',
}

function renderDebugPane() {
    const pane = document.getElementById('pane-debug')
    if (!pane) return

    if (debugLog.length === 0) {
        pane.innerHTML = '<div class="overview-empty">No debug events yet. Send a message to start capturing.</div>'
        return
    }

    const entries = [...debugLog].reverse()

    render(
        <div className="debug-log">
            <div className="debug-log-header">
                <span className="debug-log-count">{debugLog.length} events</span>
                <button className="debug-log-clear" onClick={() => { debugLog.length = 0; renderDebugPane() }}>Clear</button>
            </div>
            <div className="debug-log-entries">
                {entries.map((entry) => {
                    const time = new Date(entry.at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    const color = DEBUG_TYPE_COLORS[entry.type] || '#888'
                    const preview = formatDebugPreview(entry)
                    return (
                        <details className="debug-entry" key={entry.id}>
                            <summary className="debug-entry-summary">
                                <span className="debug-entry-time">{time}</span>
                                <span className="debug-entry-type" style={{ color }}>{entry.type}</span>
                                <span className="debug-entry-preview">{preview}</span>
                            </summary>
                            <pre className="debug-entry-data">{JSON.stringify(entry.data, null, 2)}</pre>
                        </details>
                    )
                })}
            </div>
        </div>,
        pane,
    )
}

function formatDebugPreview(entry: { type: string; data: any }): string {
    const d = entry.data
    switch (entry.type) {
        case 'planning':
        case 'replanning': {
            const objs = d.objectives || []
            return objs.length > 0
                ? objs.map((o: any) => o.name || o.description || '?').join(', ')
                : '(empty)'
        }
        case 'tool_start':
            return `${d.tool || '?'}(${Object.keys(d.params || {}).join(', ')})`
        case 'tool_result':
            return `${d.tool || '?'} → ${typeof d.result === 'string' ? d.result.slice(0, 80) : JSON.stringify(d.result || '').slice(0, 80)}`
        case 'thinking':
        case 'streaming':
            return (d.message || d.content || '').slice(0, 100)
        case 'error':
            return d.error || d.message || '(unknown error)'
        case 'session':
            return `sessionId=${d.sessionId}`
        case 'objective_check':
            return (d.results || []).map((r: any) => `${r.name}: ${r.met ? '✓' : '✕'}`).join(', ')
        case 'complete':
            return ''
        default:
            return JSON.stringify(d).slice(0, 80)
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

