// app/page.tsx — Gateway: Session-first chat interface
import { db } from './lib/db'

export default function Page() {
    let sessions: any[] = []
    try { sessions = db.sessions.select().all() } catch { }
    sessions.sort((a: any, b: any) => (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id))

    return (
        <div className="gateway-page">
            <div id="session-sidebar" className="session-sidebar">
                <div className="sidebar-header sidebar-header-minimal">
                    <div>
                        <span className="sidebar-title">Sessions</span>
                        <div className="sidebar-subtitle">Focused conversations with memory, files, and schedules.</div>
                    </div>
                    <button id="new-session-btn" className="sidebar-new-btn">New</button>
                </div>
                <div id="session-list" className="session-list">
                    {sessions.length === 0 ? (
                        <div className="session-empty">
                            <div className="session-empty-icon">💬</div>
                            <p>No sessions yet</p>
                            <p className="session-empty-hint">Create a session and start talking to Geeksy.</p>
                        </div>
                    ) : (
                        sessions.map((s: any) => (
                            <div className="session-item" key={s.id} data-id={s.id} data-type={s.type}>
                                <div className="session-item-icon session-item-icon-minimal">
                                    {s.type === 'telegram_bot' ? '📱' : s.type === 'api' ? '⚡' : '💬'}
                                </div>
                                <div className="session-item-info">
                                    <div className="session-item-name">{s.name}</div>
                                    <div className="session-item-meta session-item-meta-minimal">
                                        <span className={`session-type-badge session-type-${s.type}`}>
                                            {s.type === 'telegram_bot' ? 'Telegram' : s.type === 'api' ? 'API' : 'Chat'}
                                        </span>
                                        <span className="session-item-msgs">{s.messageCount || 0} messages</span>
                                    </div>
                                </div>
                                <div className="session-item-actions">
                                    <button className="session-more-btn" type="button" aria-label={`Session actions for ${s.name}`} title="Session actions">⋯</button>
                                    <div className="session-action-menu" role="menu" aria-label={`Actions for ${s.name}`}>
                                        <button className="session-delete-btn" type="button" data-id={s.id} title="Delete session">Delete session</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="main-area">
                <header className="agent-header agent-header-minimal" id="agent-header">
                    <div className="agent-header-content">
                        <div className="agent-header-left">
                            <button className="mobile-menu-btn" id="mobile-menu-btn" title="Open sidebar">☰</button>
                            <div className="agent-identity">
                                <span className="agent-status-dot active" id="agent-status-dot" />
                                <div className="agent-identity-copy">
                                    <span className="agent-header-name" id="agent-header-name">Geeksy</span>
                                    <span className="agent-header-subtitle">Stay in one session and let the work accumulate there.</span>
                                </div>
                            </div>
                        </div>
                        <div className="agent-header-right compact-actions">
                            <div className="model-select-wrapper">
                                <span className="model-select-icon">🧠</span>
                                <select className="model-select" id="model-select">
                                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                </select>
                            </div>
                            <button className="header-icon-btn subtle" id="heartbeat-toggle-btn" title="Toggle heartbeat">❤</button>
                            <button className="header-icon-btn subtle" id="export-chat-btn" title="Export chat as Markdown">⬇</button>
                            <button className="header-icon-btn subtle" id="clear-chat-btn" title="Clear chat (Ctrl+L)">🗑</button>
                        </div>
                    </div>
                </header>

                <div className="agent-metrics-bar agent-metrics-bar-minimal" id="agent-metrics-bar">
                    <div className="metric-item" id="metric-messages" title="Messages in this session">
                        <span className="metric-value" id="metric-val-messages">—</span>
                        <span className="metric-label">messages</span>
                    </div>
                    <div className="metric-item" id="metric-objectives" title="Objective progress">
                        <span className="metric-value" id="metric-val-objectives">—</span>
                        <span className="metric-label">progress</span>
                    </div>
                    <div className="metric-item" id="metric-schedules" title="Scheduled runs for this session">
                        <span className="metric-value" id="metric-val-schedules">—</span>
                        <span className="metric-label">schedules</span>
                    </div>
                </div>

                <div className="chat-section">
                    <div className="chat-area" id="chat-area"></div>

                    <div className="input-area">
                        <div className="input-row">
                            <textarea className="input-field" id="input" rows={1} placeholder="Ask Geeksy to think, create files, or schedule follow-ups..." />
                            <button className="send-btn" id="send-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                            </button>
                        </div>
                        <div className="input-footer">
                            <span className="input-hint">Ask naturally — Geeksy can chat, update objectives, create files, and schedule work.</span>
                        </div>
                    </div>
                </div>

                <div className="overview" id="overview">
                    <div className="overview-resize" id="overview-resize" />
                    <div className="tab-bar" id="tab-bar">
                        <button className="tab active" data-tab="objectives">Objectives</button>
                        <button className="tab" data-tab="files">Files</button>
                        <button className="tab" data-tab="schedule">Schedule</button>
                    </div>
                    <div className="tab-content" id="tab-content">
                        <div className="tab-pane active" id="pane-objectives">
                            <div className="overview-empty">No objectives yet. Send a task and Geeksy will turn it into a clear plan.</div>
                        </div>
                        <div className="tab-pane" id="pane-files">
                            <div className="overview-empty">No files touched yet.</div>
                        </div>
                        <div className="tab-pane" id="pane-schedule">
                            <div className="overview-empty">No scheduled tasks yet.</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="new-session-modal" className="session-modal-overlay" style={{ display: 'none' }}>
                <div className="session-modal">
                    <div className="session-modal-header">
                        <h2>Create New Session</h2>
                        <button className="session-modal-close" id="close-session-modal">✕</button>
                    </div>
                    <div className="session-modal-body">
                        <p className="session-modal-desc">Choose how you want to interact with Geeksy:</p>
                        <div className="session-type-cards">
                            <button className="session-type-card" id="create-web-session">
                                <div className="session-type-card-icon">💬</div>
                                <div className="session-type-card-title">Chat Session</div>
                                <div className="session-type-card-desc">A focused conversation for planning, files, and follow-up work.</div>
                            </button>
                            <button className="session-type-card" id="create-telegram-session">
                                <div className="session-type-card-icon">📱</div>
                                <div className="session-type-card-title">Telegram Bot</div>
                                <div className="session-type-card-desc">Talk to the same workflow from Telegram.</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="telegram-setup-modal" className="session-modal-overlay" style={{ display: 'none' }}>
                <div className="session-modal" style={{ maxWidth: '520px' }}>
                    <div className="session-modal-header">
                        <h2>📱 Setup Telegram Bot</h2>
                        <button className="session-modal-close" id="close-telegram-modal">✕</button>
                    </div>
                    <div className="session-modal-body">
                        <div className="telegram-setup-steps">
                            <div className="tg-step">
                                <div className="tg-step-num">1</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Create a Bot</div>
                                    <div className="tg-step-desc">
                                        Open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> in Telegram and send <code>/newbot</code>.
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">2</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Copy the Bot Token</div>
                                    <div className="tg-step-desc">
                                        BotFather will give you an API token. Copy it here.
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">3</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Paste Token Below</div>
                                    <div className="tg-step-desc">
                                        <input type="text" id="tg-bot-token-input" className="input-field" placeholder="Paste your bot token here..." style={{ width: '100%', marginTop: '8px', fontFamily: 'monospace' }} />
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">4</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Name Your Session</div>
                                    <div className="tg-step-desc">
                                        <input type="text" id="tg-session-name-input" className="input-field" placeholder="My Telegram Session" style={{ width: '100%', marginTop: '8px' }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="session-modal-actions" style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button className="btn-ghost" id="tg-setup-back">← Back</button>
                            <button className="btn-primary" id="tg-setup-connect">Connect Bot</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
