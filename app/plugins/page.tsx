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
    let plugins: any[] = []
    try {
        plugins = db.plugins.select().all()
    } catch { }
    const installedPkgs = new Set(plugins.map((p: any) => p.packageName))

    // Registry data will be empty on initial render — client script fetches it
    const availablePkgs: any[] = []

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
            {plugins.length === 0 && (
                <div className="plugin-empty" style={{ marginBottom: '24px' }}>
                    <div className="plugin-empty-icon">🧩</div>
                    <h2>No plugins installed</h2>
                    <p>Install a plugin package to extend agent capabilities.</p>
                </div>
            )}

            {plugins.length > 0 && (
                <div className="plugin-grid" style={{ marginBottom: '32px' }}>
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
                                        <div className="plugin-action-group">
                                            <button className="plugin-action-btn stop" data-id={p.id}>Stop</button>
                                            {p.port && <a className="plugin-action-btn open" href={`http://localhost:${p.port}`} target="_blank">Open UI ↗</a>}
                                        </div>
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

            {/* Plugin Registry / Discover */}
            <div className="plugin-registry-section" style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text)' }}>Discover Plugins</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '20px' }}>
                    Browse and install community plugins from the Geeksy registry.
                </p>
                <div className="plugin-grid">
                    {availablePkgs.length === 0 ? (
                        <div className="overview-empty" style={{ gridColumn: '1 / -1' }}>No new plugins available or registry unreachable.</div>
                    ) : (
                        availablePkgs.map((pkg, idx) => (
                            <div className="plugin-card registry-card" key={idx} style={{ borderColor: 'transparent', background: 'var(--bg-card)' }}>
                                <div className="plugin-card-header">
                                    <span className="plugin-card-icon">{pkg.icon || '🧩'}</span>
                                    <div className="plugin-card-info">
                                        <div className="plugin-card-name" style={{ color: '#fff' }}>{pkg.name}</div>
                                        <div className="plugin-card-pkg" style={{ opacity: 0.7 }}>{pkg.packageName} • {pkg.version || '1.0.0'}</div>
                                    </div>
                                    <button className="plugin-suggestion-btn" data-pkg={pkg.packageName} style={{
                                        background: 'var(--green-bg)', color: 'var(--green)', border: 'none',
                                        padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                                    }}>
                                        Install
                                    </button>
                                </div>
                                {pkg.description && <div className="plugin-card-desc">{pkg.description}</div>}
                                {pkg.author && <div className="plugin-card-port" style={{ marginTop: '8px', opacity: 0.5 }}>By {pkg.author}</div>}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
