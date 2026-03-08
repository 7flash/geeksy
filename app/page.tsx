export default function Page() {
    return (
        <div className="agents-page">

            {/* ── Agent Sidebar ── */}
            <div id="agent-sidebar" className="agent-sidebar">
                <div className="sidebar-header">
                    <span className="sidebar-title">🤖 Agents</span>
                    <button id="sidebar-close" className="sidebar-close">×</button>
                </div>
                <div id="sidebar-agents-list" className="sidebar-agents-list"></div>
                <button id="sidebar-new-agent" className="sidebar-new-btn">+ New Agent</button>
            </div>
            <div id="sidebar-backdrop" className="sidebar-backdrop"></div>

            {/* ── Main Area ── */}
            <div className="main-area">
                {/* Agent Header — redesigned with accent bar */}
                <header className="agent-header" id="agent-header">
                    <div className="agent-header-accent" />
                    <div className="agent-header-content">
                        <div className="agent-header-left">
                            <button className="header-icon-btn sidebar-toggle" id="sidebar-toggle" title="Switch agents">☰</button>
                            <div className="agent-identity">
                                <span className="agent-status-dot active" id="agent-status-dot" />
                                <span className="agent-header-name" id="agent-header-name" style={{ pointerEvents: 'none' }}>Geeksy Global Gateway</span>
                            </div>
                        </div>
                        <div className="agent-header-actions">
                            <button className="header-icon-btn" id="heartbeat-toggle-btn" title="Toggle autonomous heartbeat" style={{ color: 'var(--red)', opacity: 1 }}>❤</button>
                            <button className="header-icon-btn" id="export-agent-btn" title="Export agent as JSON">📤</button>
                            <button className="header-icon-btn" id="import-agent-btn" title="Import agent from JSON">📥</button>
                            <button className="header-icon-btn" id="export-chat-btn" title="Export chat as Markdown">⬇</button>
                            <button className="header-icon-btn" id="clear-chat-btn" title="Clear chat (Ctrl+L)">🗑</button>
                        </div>
                        <div className="agent-header-right">
                            <div className="model-select-wrapper">
                                <span className="model-select-icon">🧠</span>
                                <select className="model-select" id="model-select">
                                    {/* Populated dynamically from /api/models — only active providers */}
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
                    <div className="metric-item" id="metric-files" title="Files touched">
                        <span className="metric-icon">📂</span>
                        <span className="metric-value" id="metric-val-files">—</span>
                        <span className="metric-label">files</span>
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
                        {/* Empty state is created dynamically by client JS via showEmptyState() */}
                    </div>

                    <div className="input-area">
                        <div className="input-row">
                            <textarea className="input-field" id="input" rows={1} placeholder="Message Geeksy..." />
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
                        <button className="tab" data-tab="files">Files</button>
                        <button className="tab" data-tab="schedule">Schedule</button>
                        <button className="tab" data-tab="processes">Processes</button>
                        <button className="tab" data-tab="memory">Memory</button>
                        <button className="tab" data-tab="skills">Skills</button>
                        <button className="tab" data-tab="timeline">Timeline</button>
                        <button className="tab" data-tab="prompt">Prompt</button>
                    </div>
                    <div className="tab-content" id="tab-content">
                        <div className="tab-pane active" id="pane-objectives">
                            <div className="overview-empty">No objectives yet. Send a message to start planning.</div>
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
                        <div className="tab-pane" id="pane-memory">
                            <div className="overview-empty">No memory entries yet. Agents can store structured data here.</div>
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

            {/* Hidden file input for agent import */}
            <input type="file" id="import-agent-input" accept=".json" style={{ display: 'none' }} />

            {/* Settings modal */}
            <div id="settings-modal" className="settings-modal-container"></div>
        </div>
    )
}
