// app/src/lib/settings.tsx — Settings modal with Cloud Backup
import { render } from 'melina/client'
import { state, dom } from './state'
import { encrypt, decrypt } from './crypto'

// ── Auth State ──
let authUser: { id: number; login: string; avatar: string } | null = null
let backupList: Array<{ id: number; timestamp: number; size: number; counts: Record<string, number> }> = []
let backupStatus: string = ''
let isBackingUp = false
let isRestoring = false

function getToken(): string | null {
    return localStorage.getItem('geeksy:github_token')
}

function setToken(token: string | null) {
    if (token) localStorage.setItem('geeksy:github_token', token)
    else localStorage.removeItem('geeksy:github_token')
}

async function fetchUser() {
    const token = getToken()
    if (!token) { authUser = null; return }
    try {
        const res = await fetch('/api/auth/github?code=validate', {
            headers: { Authorization: `Bearer ${token}` },
        })
        // Use GitHub API directly to validate
        const ghRes = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!ghRes.ok) { authUser = null; setToken(null); return }
        const u = await ghRes.json() as any
        authUser = { id: u.id, login: u.login, avatar: u.avatar_url }
    } catch { authUser = null }
}

async function fetchBackups() {
    const token = getToken()
    if (!token) return
    try {
        const res = await fetch('/api/backup', {
            headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json() as any
        backupList = data.backups ?? []
    } catch { backupList = [] }
}

async function startBackup() {
    const passphrase = (document.getElementById('backup-passphrase') as HTMLInputElement)?.value
    if (!passphrase) { backupStatus = '❌ Enter a passphrase'; rerender(); return }
    if (passphrase.length < 6) { backupStatus = '❌ Passphrase must be 6+ characters'; rerender(); return }

    isBackingUp = true
    backupStatus = '⏳ Exporting database...'
    rerender()

    try {
        // Export DB
        const dbRes = await fetch('/api/backup/db')
        const snapshot = await dbRes.json()

        backupStatus = '🔐 Encrypting...'
        rerender()

        // Encrypt client-side
        const jsonStr = JSON.stringify(snapshot)
        const encrypted = await encrypt(jsonStr, passphrase)

        backupStatus = '⬆ Uploading...'
        rerender()

        // Upload
        const token = getToken()
        const uploadRes = await fetch('/api/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(encrypted),
        })

        if (!uploadRes.ok) {
            const err = await uploadRes.json() as any
            backupStatus = `❌ ${err.error || 'Upload failed'}`
        } else {
            const result = await uploadRes.json() as any
            const sizeMB = (result.size / 1024 / 1024).toFixed(1)
            backupStatus = `✅ Backup created (${sizeMB} MB)`
            await fetchBackups()
        }
    } catch (e) {
        backupStatus = `❌ ${e}`
    } finally {
        isBackingUp = false
        rerender()
    }
}

async function startRestore(backupId: number) {
    const passphrase = (document.getElementById('backup-passphrase') as HTMLInputElement)?.value
    if (!passphrase) { backupStatus = '❌ Enter your passphrase to restore'; rerender(); return }

    if (!confirm('⚠️ This will OVERWRITE all local agent data. Continue?')) return

    isRestoring = true
    backupStatus = '⬇ Downloading backup...'
    rerender()

    try {
        const token = getToken()
        const res = await fetch(`/api/backup?id=${backupId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        const backup = await res.json() as any

        backupStatus = '🔓 Decrypting...'
        rerender()

        const jsonStr = await decrypt(backup.data, backup.salt, backup.iv, passphrase)
        const snapshot = JSON.parse(jsonStr)

        backupStatus = '📥 Importing...'
        rerender()

        const importRes = await fetch('/api/backup/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
        })

        if (!importRes.ok) {
            backupStatus = '❌ Import failed'
        } else {
            const result = await importRes.json() as any
            const total = Object.values(result.imported as Record<string, number>).reduce((a: number, b: number) => a + b, 0)
            backupStatus = `✅ Restored ${total} records. Reload to see changes.`
        }
    } catch (e: any) {
        if (e?.message?.includes('decrypt')) {
            backupStatus = '❌ Wrong passphrase'
        } else {
            backupStatus = `❌ ${e}`
        }
    } finally {
        isRestoring = false
        rerender()
    }
}

async function deleteBackup(backupId: number) {
    if (!confirm('Delete this backup?')) return
    const token = getToken()
    await fetch(`/api/backup?id=${backupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    })
    await fetchBackups()
    rerender()
}

async function startGitHubLogin() {
    try {
        const res = await fetch('/api/auth/github')
        const data = await res.json() as any
        if (data.url) {
            window.open(data.url, '_blank', 'width=600,height=700')
        } else if (!data.configured) {
            backupStatus = '⚠️ GitHub OAuth not configured on server'
            rerender()
        }
    } catch { backupStatus = '❌ Failed to initiate login'; rerender() }
}

function logout() {
    setToken(null)
    authUser = null
    backupList = []
    rerender()
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
}

function rerender() {
    const container = document.getElementById('settings-modal')!
    render(<SettingsModal />, container)
}

// ── Component ──

function CloudBackupSection() {
    if (!authUser) {
        return (
            <div className="settings-group">
                <span className="settings-label">☁️ Cloud Backup</span>
                <div style={{ marginTop: '8px' }}>
                    <button className="backup-btn login" onClick={startGitHubLogin}>
                        🔗 Sign in with GitHub
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #666)', marginTop: '6px' }}>
                        Sign in to back up your agents to the cloud
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="settings-group">
            <span className="settings-label">☁️ Cloud Backup</span>

            {/* User info */}
            <div className="backup-user" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
                <img src={authUser.avatar} alt="" width="24" height="24" style={{ borderRadius: '50%' }} />
                <span style={{ fontWeight: 600 }}>@{authUser.login}</span>
                <button className="backup-btn-sm" onClick={logout} style={{ marginLeft: 'auto' }}>Sign out</button>
            </div>

            {/* Passphrase */}
            <div style={{ margin: '8px 0' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted, #888)' }}>🔑 Backup Passphrase</label>
                <input
                    id="backup-passphrase"
                    type="password"
                    placeholder="Enter passphrase (min 6 chars)"
                    className="backup-input"
                    style={{ width: '100%', marginTop: '4px' }}
                />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', margin: '8px 0' }}>
                <button className="backup-btn primary" onClick={startBackup} disabled={isBackingUp}>
                    {isBackingUp ? '⏳...' : '⬆ Backup Now'}
                </button>
            </div>

            {/* Status */}
            {backupStatus && (
                <div className="backup-status" style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', background: 'var(--bg-elevated, #1a1a2e)', margin: '4px 0' }}>
                    {backupStatus}
                </div>
            )}

            {/* Backup list */}
            {backupList.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #888)', marginBottom: '4px' }}>📋 Previous Backups</div>
                    {backupList.map(b => (
                        <div className="backup-item" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                            <span style={{ flex: 1 }}>{formatDate(b.timestamp)} — {(b.size / 1024).toFixed(0)} KB</span>
                            <button className="backup-btn-sm" onClick={() => startRestore(b.id)} disabled={isRestoring}>
                                {isRestoring ? '...' : '⬇'}
                            </button>
                            <button className="backup-btn-sm danger" onClick={() => deleteBackup(b.id)}>✕</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function SettingsModal() {
    const cwd = location.origin
    const model = dom.modelSelect.value
    const agentCount = state.agents.length

    return (
        <div className="settings-overlay" onClick={(e: any) => {
            if ((e.target as HTMLElement).classList.contains('settings-overlay')) closeSettings()
        }}>
            <div className="settings-panel">
                <div className="settings-header">
                    <span className="settings-title">⚙ Settings</span>
                    <button className="settings-close" onClick={closeSettings}>✕</button>
                </div>
                <div className="settings-body">
                    <div className="settings-group">
                        <span className="settings-label">Working Directory</span>
                        <div className="settings-value">{cwd}</div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-label">Active Model</span>
                        <div className="settings-value">{model}</div>
                    </div>

                    <div className="settings-group">
                        <span className="settings-label">Agents</span>
                        <div className="settings-value">{agentCount} active</div>
                    </div>

                    {/* Cloud Backup */}
                    <CloudBackupSection />

                    <div className="settings-group">
                        <span className="settings-label">Keyboard Shortcuts</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <div className="settings-kbd"><span className="kbd">Ctrl+N</span> New agent</div>
                            <div className="settings-kbd"><span className="kbd">Ctrl+L</span> Clear chat</div>
                            <div className="settings-kbd"><span className="kbd">Enter</span> Send message</div>
                            <div className="settings-kbd"><span className="kbd">Shift+Enter</span> New line</div>
                            <div className="settings-kbd"><span className="kbd">Esc</span> Stop agent / Close modal</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export async function openSettings() {
    // Load auth state
    await fetchUser()
    if (authUser) await fetchBackups()

    const container = document.getElementById('settings-modal')!
    render(<SettingsModal />, container)
}

export function closeSettings() {
    const container = document.getElementById('settings-modal')!
    container.innerHTML = ''
}
