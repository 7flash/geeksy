// app/api/timeline/route.ts — Agent Activity Timeline
// GET /api/timeline?agentId=N&limit=50 — unified chronological feed
import { db } from '../../lib/db'

interface TimelineEvent {
    type: 'message' | 'objective' | 'file' | 'schedule'
    icon: string
    title: string
    detail?: string
    timestamp: number
}

export async function GET(req: Request) {
    const url = new URL(req.url)
    const agentId = parseInt(url.searchParams.get('agentId') || '0')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    if (!agentId) {
        return Response.json({ error: 'Missing agentId' }, { status: 400 })
    }

    const events: TimelineEvent[] = []

    // Messages
    try {
        const messages = (db as any).db.query(
            `SELECT role, content, created_at FROM messages WHERE agentId = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agentId, limit) as any[]
        for (const m of messages) {
            const icons: Record<string, string> = { user: '👤', assistant: '🤖', system: '⚙️', tool: '🔧' }
            events.push({
                type: 'message',
                icon: icons[m.role] || '💬',
                title: `${m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Agent' : m.role} message`,
                detail: m.content.substring(0, 120) + (m.content.length > 120 ? '...' : ''),
                timestamp: m.created_at,
            })
        }
    } catch { }

    // Objectives
    try {
        const objectives = (db as any).db.query(
            `SELECT name, status, result, created_at FROM objectives WHERE agentId = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agentId, limit) as any[]
        for (const o of objectives) {
            const icons: Record<string, string> = { pending: '⏳', complete: '✅', failed: '❌' }
            events.push({
                type: 'objective',
                icon: icons[o.status] || '🎯',
                title: `Objective: ${o.name}`,
                detail: `${o.status}${o.result ? ' — ' + o.result.substring(0, 80) : ''}`,
                timestamp: o.created_at,
            })
        }
    } catch { }

    // Files
    try {
        const files = (db as any).db.query(
            `SELECT path, action, created_at FROM files WHERE agentId = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agentId, limit) as any[]
        for (const f of files) {
            events.push({
                type: 'file',
                icon: f.action === 'write' ? '📝' : '📖',
                title: `${f.action === 'write' ? 'Wrote' : 'Read'} file`,
                detail: f.path,
                timestamp: f.created_at,
            })
        }
    } catch { }

    // Schedules
    try {
        const schedules = (db as any).db.query(
            `SELECT name, type, status, lastDurationMs, lastRun, created_at FROM schedules WHERE agentId = ? ORDER BY created_at DESC LIMIT ?`
        ).all(agentId, limit) as any[]
        for (const s of schedules) {
            const icons: Record<string, string> = { pending: '⏱️', running: '▶️', completed: '✅', failed: '❌', cancelled: '🚫' }
            events.push({
                type: 'schedule',
                icon: icons[s.status] || '📅',
                title: `Task: ${s.name}`,
                detail: `${s.type} · ${s.status}${s.lastDurationMs ? ` · ${s.lastDurationMs}ms` : ''}`,
                timestamp: s.lastRun || s.created_at,
            })
        }
    } catch { }

    // Sort all by timestamp desc, take top N
    events.sort((a, b) => b.timestamp - a.timestamp)
    const trimmed = events.slice(0, limit)

    return Response.json({ events: trimmed, total: events.length })
}
