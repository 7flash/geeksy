// app/page.tsx — Gateway: Session-based chat interface
import { db } from './lib/db'

export default function Page() {
    // Pre-load sessions for SSR
    let sessions: any[] = []
    try { sessions = db.sessions.select().all() } catch { }
    sessions.sort((a: any, b: any) => (b.lastActiveAt || b.id) - (a.lastActiveAt || a.id))

    return (
        <div className="gateway-page">

            {/* ── Session Sidebar ── */}
            <div id="session-sidebar" className="session-sidebar">
                <div className="sidebar-header">
                    <span className="sidebar-title">⚡ Sessions</span>
                    <button id="new-session-btn" className="sidebar-new-btn">+ New</button>
                </div>
                <div id="session-list" className="session-list">
                    {sessions.length === 0 ? (
                        <div className="session-empty">
                            <div className="session-empty-icon">🌐</div>
                            <p>No sessions yet</p>
                            <p className="session-empty-hint">Create a session to start chatting</p>
                        </div>
                    ) : (
                        sessions.map((s: any) => (
                            <div
                                className="session-item"
                                key={s.id}
                                data-id={s.id}
                                data-type={s.type}
                            >
                                <div className="session-item-icon">
                                    {s.type === 'telegram_bot' ? '📱' : '🌐'}
                                </div>
                                <div className="session-item-info">
                                    <div className="session-item-name">{s.name}</div>
                                    <div className="session-item-meta">
                                        <span className={`session-type-badge session-type-${s.type}`}>
                                            {s.type === 'telegram_bot' ? 'Telegram' : 'Web'}
                                        </span>
                                        <span className="session-item-msgs">
                                            {s.messageCount || 0} msgs
                                        </span>
                                    </div>
                                </div>
                                <div className="session-item-actions">
                                    <button className="session-delete-btn" data-id={s.id} title="Delete session">×</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── Main Area ── */}
            <div className="main-area">
                {/* Header */}
                <header className="agent-header" id="agent-header">
                    <div className="agent-header-accent" />
                    <div className="agent-header-content">
                        <div className="agent-header-left">
                            <div className="agent-identity">
                                <span className="agent-status-dot active" id="agent-status-dot" />
                                <span className="agent-header-name" id="agent-header-name">Gateway</span>
                            </div>
                        </div>
                        <div className="agent-header-actions">
                            <button className="header-icon-btn" id="heartbeat-toggle-btn" title="Toggle autonomous heartbeat" style={{ color: 'var(--red)', opacity: 1 }}>❤</button>
                            <button className="header-icon-btn" id="export-chat-btn" title="Export chat as Markdown">⬇</button>
                            <button className="header-icon-btn" id="clear-chat-btn" title="Clear chat (Ctrl+L)">🗑</button>
                        </div>
                        <div className="agent-header-right">
                            <div className="model-select-wrapper">
                                <span className="model-select-icon">🧠</span>
                                <select className="model-select" id="model-select">
                                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                                </select>
                            </div>
                            <div id="skill-toggles" className="skill-toggles" />
                        </div>
                    </div>
                </header>

                {/* Agent Metrics Bar */}
                <div className="agent-metrics-bar" id="agent-metrics-bar">
                    <div className="metric-item" id="metric-messages" title="Total messages">
                        <span className="metric-icon">💬</span>
                        <span className="metric-value" id="metric-val-messages">—</span>
                        <span className="metric-label">msgs</span>
                    </div>
                    <div className="metric-item" id="metric-sessions" title="Active sessions">
                        <span className="metric-icon">⚡</span>
                        <span className="metric-value" id="metric-val-sessions">{sessions.length}</span>
                        <span className="metric-label">sessions</span>
                    </div>
                    <div className="metric-item" id="metric-objectives" title="Completed objectives">
                        <span className="metric-icon">✅</span>
                        <span className="metric-value" id="metric-val-objectives">—</span>
                        <span className="metric-label">done</span>
                    </div>
                    <div className="metric-item" id="metric-schedules" title="Schedule runs (success/fail)">
                        <span className="metric-icon">⏱️</span>
                        <span className="metric-value" id="metric-val-schedules">—</span>
                        <span className="metric-label">runs</span>
                    </div>
                    <div className="metric-item" id="metric-plugins" title="Active plugins">
                        <span className="metric-icon">🧩</span>
                        <span className="metric-value" id="metric-val-plugins">—</span>
                        <span className="metric-label">plugins</span>
                    </div>
                    <div className="metric-item" id="metric-uptime" title="System uptime">
                        <span className="metric-icon">⏳</span>
                        <span className="metric-value" id="metric-val-uptime">—</span>
                        <span className="metric-label">uptime</span>
                    </div>
                </div>

                {/* Chat + Input */}
                <div className="chat-section">
                    <div className="chat-area" id="chat-area">
                        {/* Empty state is created dynamically by client JS */}
                    </div>

                    <div className="input-area">
                        <div className="input-row">
                            <textarea className="input-field" id="input" rows={1} placeholder="Message Gateway..." />
                            <button className="send-btn" id="send-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                            </button>
                        </div>
                        <div className="input-footer">
                            <span className="input-hint">Enter to send · Shift+Enter for new line · Ctrl+L to clear</span>
                        </div>
                    </div>
                </div>

                {/* ── Overview Panel (tabs) ── */}
                <div className="overview" id="overview">
                    <div className="overview-resize" id="overview-resize" />
                    <div className="tab-bar" id="tab-bar">
                        <button className="tab active" data-tab="objectives">Objectives</button>
                        <button className="tab" data-tab="memory">Memory</button>
                        <button className="tab" data-tab="files">Files</button>
                        <button className="tab" data-tab="schedule">Schedule</button>
                        <button className="tab" data-tab="processes">Processes</button>
                        <button className="tab" data-tab="skills">Skills</button>
                        <button className="tab" data-tab="timeline">Timeline</button>
                        <button className="tab" data-tab="prompt">Prompt</button>
                    </div>
                    <div className="tab-content" id="tab-content">
                        <div className="tab-pane active" id="pane-objectives">
                            <div className="overview-empty">No objectives yet. Send a message to start planning.</div>
                        </div>
                        <div className="tab-pane" id="pane-memory">
                            <div className="overview-empty">No memory entries yet. Sessions store structured data here.</div>
                        </div>
                        <div className="tab-pane" id="pane-files">
                            <div className="overview-empty">No files touched yet.</div>
                        </div>
                        <div className="tab-pane" id="pane-schedule">
                            <div className="overview-empty">No scheduled tasks yet.</div>
                        </div>
                        <div className="tab-pane" id="pane-processes">
                            <div className="overview-empty">Loading processes…</div>
                        </div>
                        <div className="tab-pane" id="pane-skills">
                            <div className="overview-empty">Loading skills…</div>
                        </div>
                        <div className="tab-pane" id="pane-timeline">
                            <div className="overview-empty">Loading timeline…</div>
                        </div>
                        <div className="tab-pane" id="pane-prompt">
                            <div className="overview-empty">Loading prompt editor…</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* New Session Modal */}
            <div id="new-session-modal" className="session-modal-overlay" style={{ display: 'none' }}>
                <div className="session-modal">
                    <div className="session-modal-header">
                        <h2>Create New Session</h2>
                        <button className="session-modal-close" id="close-session-modal">✕</button>
                    </div>
                    <div className="session-modal-body">
                        <p className="session-modal-desc">Choose how you want to interact with the AI:</p>
                        <div className="session-type-cards">
                            <button className="session-type-card" id="create-web-session">
                                <div className="session-type-card-icon">🌐</div>
                                <div className="session-type-card-title">Web Browser</div>
                                <div className="session-type-card-desc">Chat directly in this interface. Best for quick tasks and development.</div>
                            </button>
                            <button className="session-type-card" id="create-telegram-session">
                                <div className="session-type-card-icon">📱</div>
                                <div className="session-type-card-title">Telegram Bot</div>
                                <div className="session-type-card-desc">Connect via Telegram bot. Chat from your phone anywhere.</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Telegram Setup Modal */}
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
                                        Follow the prompts to name your bot.
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">2</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Copy the Bot Token</div>
                                    <div className="tg-step-desc">
                                        BotFather will give you an API token like <code>123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code>. Copy it.
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">3</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Paste Token Below</div>
                                    <div className="tg-step-desc">
                                        <input
                                            type="text"
                                            id="tg-bot-token-input"
                                            className="input-field"
                                            placeholder="Paste your bot token here..."
                                            style={{ width: '100%', marginTop: '8px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="tg-step">
                                <div className="tg-step-num">4</div>
                                <div className="tg-step-content">
                                    <div className="tg-step-title">Name Your Session</div>
                                    <div className="tg-step-desc">
                                        <input
                                            type="text"
                                            id="tg-session-name-input"
                                            className="input-field"
                                            placeholder="My Telegram Bot"
                                            style={{ width: '100%', marginTop: '8px' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="session-modal-footer">
                            <button className="btn-ghost" id="tg-setup-back">← Back</button>
                            <button className="btn-primary" id="tg-setup-connect">Connect Bot</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Settings modal */}
            <div id="settings-modal" className="settings-modal-container"></div>
        </div>
    )
}
