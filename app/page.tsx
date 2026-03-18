// app/page.tsx — Main chat interface
import { db } from './lib/db'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function getVersionInfo() {
    try {
        const pkgPath = resolve(process.env.GEEKSY_APP_ROOT || process.cwd(), 'package.json')
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        return { version: pkg.version || '?', commit: pkg.geeksyCommit || '' }
    } catch { return { version: '?', commit: '' } }
}

export default function Page() {
    const v = getVersionInfo()
    let sessions: any[] = []
    try { sessions = db.sessions.select().all() } catch { }
    sessions.sort((a: any, b: any) => (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id))

    return (
        <div className="gateway-page">
            {/* ── Sidebar ── */}
            <div id="session-sidebar" className="session-sidebar">
                <div className="sidebar-header">
                    <span className="sidebar-title">Conversations</span>
                    <button id="new-session-btn" className="btn-new">+ New</button>
                </div>
                <div id="session-list" className="session-list">
                    {sessions.length === 0 ? (
                        <div className="session-empty">
                            <p className="session-empty-title">No conversations yet</p>
                            <button className="session-empty-cta" type="button">Start a conversation</button>
                        </div>
                    ) : (
                        sessions.map((s: any) => (
                            <div className="session-item" key={s.id} data-id={s.id} data-type={s.type}>
                                <div className="session-item-info">
                                    <div className="session-item-name">{s.name}</div>
                                    <div className="session-item-meta">
                                        <span className="session-item-msgs">{s.messageCount || 0} msg{(s.messageCount || 0) === 1 ? '' : 's'}</span>
                                    </div>
                                </div>
                                <div className="session-item-actions">
                                    <button className="session-more-btn" type="button" title="Actions">⋯</button>
                                    <div className="session-action-menu" role="menu">
                                        <button className="session-delete-btn" type="button" data-id={s.id}>Delete</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── Main ── */}
            <div className="main-area">
                <header className="top-bar" id="agent-header">
                    <div className="top-bar-left">
                        <button className="mobile-menu-btn" id="mobile-menu-btn" title="Menu">☰</button>
                        <span className="top-bar-status active" id="agent-status-dot" />
                        <span className="top-bar-title" id="agent-header-name">Geeksy</span>
                    </div>
                    <div className="top-bar-right">
                        <select className="model-select" id="model-select">
                            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                        </select>
                        <button className="icon-btn" id="heartbeat-toggle-btn" title="Heartbeat">♥</button>
                        <button className="icon-btn" id="export-chat-btn" title="Export">↓</button>
                        <button className="icon-btn" id="clear-chat-btn" title="Clear">✕</button>
                    </div>
                </header>

                <div className="metrics-strip" id="agent-metrics-bar">
                    <div className="metric" id="metric-messages" title="Messages">
                        <span className="metric-val" id="metric-val-messages">—</span>
                        <span className="metric-lbl">messages</span>
                    </div>
                    <div className="metric" id="metric-schedules" title="Schedules">
                        <span className="metric-val" id="metric-val-schedules">—</span>
                        <span className="metric-lbl">schedules</span>
                    </div>
                </div>

                <div className="chat-section">
                    <div className="chat-area" id="chat-area">
                        <div className="empty-state">
                            <h2>What can I help with?</h2>
                            <div className="example-chips">
                                <button className="chip" type="button" data-prompt="Tell me a joke every minute">Schedule a joke</button>
                                <button className="chip" type="button" data-prompt="What files are in this project?">Explore files</button>
                                <button className="chip" type="button" data-prompt="Help me plan today">Plan my day</button>
                            </div>
                        </div>
                    </div>

                    <div className="input-area">
                        <div className="input-row">
                            <textarea className="input-field" id="input" rows={1} placeholder="Message Geeksy…" />
                            <button className="send-btn" id="send-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overview" id="overview">
                    <div className="overview-resize" id="overview-resize" />
                    <div className="tab-bar" id="tab-bar">
                        <button className="tab active" data-tab="files">Files</button>
                        <button className="tab" data-tab="schedule">Schedule</button>
                        <button className="tab" data-tab="debug">Debug</button>
                    </div>
                    <div className="tab-content" id="tab-content">
                        <div className="tab-pane active" id="pane-files">
                            <div className="overview-empty">No files touched yet.</div>
                        </div>
                        <div className="tab-pane" id="pane-schedule">
                            <div className="overview-empty">No scheduled tasks yet.</div>
                        </div>
                        <div className="tab-pane" id="pane-debug">
                            <div className="overview-empty">No debug events yet.</div>
                        </div>
                    </div>
                </div>

                <div className="version-badge" id="version-badge">
                    v{v.version}{v.commit ? <span className="version-commit"> · {v.commit}</span> : null}
                </div>
            </div>

            {/* ── Modals ── */}
            <div id="new-session-modal" className="modal-overlay" style={{ display: 'none' }}>
                <div className="modal">
                    <div className="modal-header">
                        <h2>New conversation</h2>
                        <button className="modal-close" id="close-session-modal">✕</button>
                    </div>
                    <div className="modal-body">
                        <div className="type-cards">
                            <button className="type-card" id="create-web-session">
                                <div className="type-card-title">Chat</div>
                                <div className="type-card-desc">A new conversation in Geeksy.</div>
                            </button>
                            <button className="type-card" id="create-telegram-session">
                                <div className="type-card-title">Telegram</div>
                                <div className="type-card-desc">Connect a Telegram bot.</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="telegram-setup-modal" className="modal-overlay" style={{ display: 'none' }}>
                <div className="modal" style={{ maxWidth: '480px' }}>
                    <div className="modal-header">
                        <h2>Connect Telegram</h2>
                        <button className="modal-close" id="close-telegram-modal">✕</button>
                    </div>
                    <div className="modal-body">
                        <div className="tg-steps">
                            <div className="tg-step">
                                <div className="tg-step-num">1</div>
                                <div>Open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> → <code>/newbot</code></div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">2</div>
                                <div>
                                    Paste the token:
                                    <input type="text" id="tg-bot-token-input" className="input-field" placeholder="Bot token" style={{ width: '100%', marginTop: '6px', fontFamily: 'monospace' }} />
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">3</div>
                                <div>
                                    Name this conversation:
                                    <input type="text" id="tg-session-name-input" className="input-field" placeholder="My Telegram Bot" style={{ width: '100%', marginTop: '6px' }} />
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button className="btn-ghost" id="tg-setup-back">Back</button>
                            <button className="btn-primary" id="tg-setup-connect">Connect</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
