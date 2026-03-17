// app/src/models/page.client.tsx — Dynamic provider/model cards with API key management
import { render } from 'melina/client'

interface ModelDef {
    id: string; name: string; description: string; tier: string
}
interface ProviderData {
    id: string; name: string; envKey: string; envKeyAlt?: string
    models: ModelDef[]; active: boolean; maskedKey: string; fromEnv: boolean
}

let providers: ProviderData[] = []
let editingProvider: string | null = null
let savingProvider: string | null = null

const TIER_LABELS: Record<string, string> = {
    recommended: '★ RECOMMENDED',
    pro: 'PRO',
    preview: 'PREVIEW',
    stable: 'STABLE',
}

const TIER_COLORS: Record<string, string> = {
    recommended: '#f59e0b',
    pro: '#a78bfa',
    preview: '#34d399',
    stable: '#60a5fa',
}

const PROVIDER_ICONS: Record<string, string> = {
    google: '🔵',
    anthropic: '🟤',
    openai: '🟢',
    deepseek: '🔷',
}

function ProviderCard({ p }: { p: ProviderData }) {
    const isEditing = editingProvider === p.id
    const isSaving = savingProvider === p.id

    return (
        <div className={`provider-card ${p.active ? 'active' : 'inactive'}`}>
            <div className="provider-header">
                <div className="provider-identity">
                    <span className="provider-icon">{PROVIDER_ICONS[p.id] || '⬜'}</span>
                    <div>
                        <h2 className="provider-name">{p.name}</h2>
                        <span className="provider-env-var">{p.envKey}</span>
                    </div>
                </div>
                <div className={`provider-status ${p.active ? 'connected' : ''}`}>
                    <span className="status-dot" />
                    {p.active ? 'Connected' : 'Not configured'}
                </div>
            </div>

            {/* API Key Section */}
            <div className="api-key-section">
                {p.active && !isEditing ? (
                    <div className="key-display">
                        <span className="key-masked">{p.maskedKey}</span>
                        {p.fromEnv && <span className="key-source">from .env</span>}
                        <div className="key-actions">
                            <button className="key-btn key-edit" type="button" data-action="edit-key" data-provider-id={p.id}>
                                Change key
                            </button>
                            {!p.fromEnv && (
                                <button className="key-btn key-remove" type="button" data-action="remove-key" data-provider-id={p.id}>
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="key-input-row">
                        <input
                            type="password"
                            className="key-input"
                            id={`key-input-${p.id}`}
                            placeholder={`Paste your ${p.name} API key…`}
                            disabled={isSaving}
                        />
                        <button
                            className={`key-btn key-save ${isSaving ? 'saving' : ''}`}
                            type="button"
                            data-action="save-key"
                            data-provider-id={p.id}
                            disabled={isSaving}
                        >
                            {isSaving ? '…' : '✓ Save'}
                        </button>
                        {isEditing && (
                            <button className="key-btn key-cancel" type="button" data-action="cancel-edit" data-provider-id={p.id}>
                                Cancel
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Model List */}
            <div className={`model-list ${p.active ? '' : 'dimmed'}`}>
                {p.models.map(m => (
                    <div className="model-row" key={m.id}>
                        <div className="model-info">
                            <span className="model-name">{m.name}</span>
                            <span className="model-desc">{m.description}</span>
                        </div>
                        <div className="model-meta">
                            <span className="model-tier" style={{ '--tier-color': TIER_COLORS[m.tier] || '#888' } as any}>
                                {TIER_LABELS[m.tier] || m.tier.toUpperCase()}
                            </span>
                            <code className="model-id">{m.id}</code>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

async function saveKey(providerId: string) {
    const input = document.getElementById(`key-input-${providerId}`) as HTMLInputElement
    const key = input?.value?.trim()
    if (!key) return

    savingProvider = providerId
    rerender()

    try {
        const res = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, apiKey: key }),
        })
        if (res.ok) {
            editingProvider = null
            await loadProviders()
        }
    } catch (e) {
        console.error('Failed to save key:', e)
    } finally {
        savingProvider = null
        rerender()
    }
}

async function removeKey(providerId: string) {
    try {
        await fetch(`/api/models?providerId=${providerId}`, { method: 'DELETE' })
        await loadProviders()
    } catch (e) {
        console.error('Failed to remove key:', e)
    }
}

async function loadProviders() {
    try {
        providers = await fetch('/api/models').then(r => r.json())
    } catch {
        providers = []
    }
    rerender()
}

function rerender() {
    const grid = document.getElementById('providers-grid')
    if (!grid) return
    render(
        <div className="providers-list">
            {providers.map(p => <ProviderCard p={p} />)}
            {providers.length === 0 && (
                <div className="overview-empty">No providers found.</div>
            )}
        </div>,
        grid
    )
}

export default function mount() {
    const onClick = async (e: Event) => {
        const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
        if (!target) return

        const action = target.dataset.action
        const providerId = target.dataset.providerId
        if (!providerId) return

        if (action === 'edit-key') {
            editingProvider = providerId
            rerender()
            requestAnimationFrame(() => {
                const input = document.getElementById(`key-input-${providerId}`) as HTMLInputElement | null
                input?.focus()
            })
            return
        }

        if (action === 'cancel-edit') {
            editingProvider = null
            rerender()
            return
        }

        if (action === 'save-key') {
            await saveKey(providerId)
            return
        }

        if (action === 'remove-key') {
            await removeKey(providerId)
        }
    }

    const onKeyDown = async (e: KeyboardEvent) => {
        if (e.key !== 'Enter') return
        const input = e.target as HTMLInputElement | null
        if (!input?.classList.contains('key-input')) return
        const providerId = input.id.replace('key-input-', '')
        if (!providerId) return
        e.preventDefault()
        await saveKey(providerId)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    loadProviders()
    return () => {
        document.removeEventListener('click', onClick)
        document.removeEventListener('keydown', onKeyDown)
    }
}
