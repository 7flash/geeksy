// app/plugins/page.tsx — Plugin Manager
import { db } from '../lib/db'

function statusBadge(status: string) {
    const colors: Record<string, string> = {
        running: 'badge-green',
        installed: 'badge-blue',
        stopped: 'badge-gray',
        error: 'badge-red',
    }
    return <span className={`plugin-badge ${colors[status] || 'badge-gray'}`}>{status}</span>
}

function parseConfig(configStr: string): Record<string, any> {
    try { return JSON.parse(configStr) } catch { return {} }
}

export default function PluginsPage() {
    const plugins = db.plugins.select().all()

    return (
        <div className="page-container">
            <div className="page-header">
                <h1>Plugins</h1>
                <p className="page-subtitle">Extend your agents with integrations, messaging, and external APIs.</p>
            </div>

            {/* Install new plugin */}
            <div className="plugin-install-card">
                <div className="plugin-install-header">
                    <span className="plugin-install-icon">📦</span>
                    <span>Install Plugin</span>
                </div>
                <form id="plugin-install-form" className="plugin-install-form">
                    <div className="plugin-install-row">
                        <input
                            type="text"
                            name="packageName"
                            placeholder="npm package name (e.g. geeksy-telegram-plugin)"
                            className="plugin-input"
                            required
                        />
                        <button type="submit" className="plugin-install-btn">Install</button>
                    </div>
                </form>
            </div>

            {/* Installed plugins */}
            {plugins.length === 0 ? (
                <div className="plugin-empty">
                    <div className="plugin-empty-icon">🧩</div>
                    <h2>No plugins installed</h2>
                    <p>Install a plugin package to extend agent capabilities.</p>
                    <div className="plugin-suggestions">
                        <div className="plugin-suggestion" data-pkg="geeksy-telegram-plugin">
                            <span className="plugin-suggestion-icon">📱</span>
                            <div>
                                <div className="plugin-suggestion-name">Telegram</div>
                                <div className="plugin-suggestion-desc">Connect your Telegram account. Agents read &amp; send messages via MTProto.</div>
                            </div>
                            <button className="plugin-suggestion-btn" data-pkg="geeksy-telegram-plugin">Install</button>
                        </div>
                        <div className="plugin-suggestion" data-pkg="geeksy-discord-plugin">
                            <span className="plugin-suggestion-icon">💬</span>
                            <div>
                                <div className="plugin-suggestion-name">Discord</div>
                                <div className="plugin-suggestion-desc">Bot &amp; user account integration for Discord servers.</div>
                            </div>
                            <span className="plugin-suggestion-soon">Coming soon</span>
                        </div>
                        <div className="plugin-suggestion" data-pkg="geeksy-github-plugin">
                            <span className="plugin-suggestion-icon">🐙</span>
                            <div>
                                <div className="plugin-suggestion-name">GitHub</div>
                                <div className="plugin-suggestion-desc">PR reviews, issue management, and CI/CD monitoring.</div>
                            </div>
                            <span className="plugin-suggestion-soon">Coming soon</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="plugin-grid">
                    {plugins.map(p => {
                        const config = parseConfig(p.config)
                        const configKeys = Object.keys(config)
                        return (
                            <div className={`plugin-card plugin-${p.status}`} key={p.id}>
                                <div className="plugin-card-header">
                                    <span className="plugin-card-icon">{p.icon}</span>
                                    <div className="plugin-card-info">
                                        <div className="plugin-card-name">{p.name}</div>
                                        <div className="plugin-card-pkg">{p.packageName}</div>
                                    </div>
                                    {statusBadge(p.status)}
                                </div>
                                {p.description && <div className="plugin-card-desc">{p.description}</div>}
                                {p.port && <div className="plugin-card-port">Port: {p.port}</div>}
                                {p.error && <div className="plugin-card-error">{p.error}</div>}
                                {configKeys.length > 0 && (
                                    <div className="plugin-card-config">
                                        {configKeys.map(k => (
                                            <div className="plugin-config-row" key={k}>
                                                <span className="plugin-config-key">{k}</span>
                                                <span className="plugin-config-value">
                                                    {k.toLowerCase().includes('key') || k.toLowerCase().includes('secret') || k.toLowerCase().includes('hash')
                                                        ? '••••••••'
                                                        : String(config[k]).substring(0, 40)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="plugin-card-actions">
                                    {p.status === 'running' && (
                                        <>
                                            <button className="plugin-action-btn stop" data-id={p.id}>Stop</button>
                                            {p.port && <a className="plugin-action-btn open" href={`http://localhost:${p.port}`} target="_blank">Open UI ↗</a>}
                                        </>
                                    )}
                                    {(p.status === 'installed' || p.status === 'stopped') && (
                                        <button className="plugin-action-btn start" data-id={p.id}>Start</button>
                                    )}
                                    {p.status === 'error' && (
                                        <button className="plugin-action-btn start" data-id={p.id}>Retry</button>
                                    )}
                                    <button className="plugin-action-btn configure" data-id={p.id}>Configure</button>
                                    <button className="plugin-action-btn remove" data-id={p.id}>Uninstall</button>
                                </div>
                                {p.version && <div className="plugin-card-version">v{p.version}</div>}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
