import { render } from 'melina/client'

// Fetches plugin manifest and renders the config modal
export async function openPluginConfig(packageName: string) {
    const container = document.getElementById('settings-modal')!

    // Show a loading state immediate
    render(
        <div className="settings-overlay" onClick={handleOverlayClick}>
            <div className="settings-panel">
                <div className="settings-header">
                    <span className="settings-title">⚙ Plugin Configuration</span>
                    <button className="settings-close" onClick={closePluginConfig}>✕</button>
                </div>
                <div className="settings-body" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    Loading schema...
                </div>
            </div>
        </div>,
        container
    )

    try {
        const res = await fetch(`/api/plugins/manifest?packageName=${encodeURIComponent(packageName)}`)
        if (!res.ok) throw new Error('Failed to load plugin manifest')
        const data = await res.json()

        // data has: id, packageName, name, config (schema), currentConfig
        render(<PluginConfigModal {...data} />, container)
    } catch (err) {
        render(
            <div className="settings-overlay" onClick={handleOverlayClick}>
                <div className="settings-panel">
                    <div className="settings-header">
                        <span className="settings-title">⚙ Plugin Configuration</span>
                        <button className="settings-close" onClick={closePluginConfig}>✕</button>
                    </div>
                    <div className="settings-body" style={{ padding: '24px', color: 'var(--red)' }}>
                        Error loading plugin configuration.
                    </div>
                </div>
            </div>,
            container
        )
    }
}

function handleOverlayClick(e: any) {
    if ((e.target as HTMLElement).classList.contains('settings-overlay')) closePluginConfig()
}

export function closePluginConfig() {
    const container = document.getElementById('settings-modal')!
    container.innerHTML = ''
}

// Modal component with editable form fields
function PluginConfigModal({ id, name, config, currentConfig }: { id: number, name: string, config: Record<string, any>, currentConfig: Record<string, any> }) {
    // We don't have React-style state hooks here because Melina rendering is just JSX -> DOM once,
    // so we'll build the DOM and attach event listeners to handle the save directly.

    const renderField = (key: string, fieldDef: any, currentValue: any) => {
        const isArray = fieldDef.type === 'array'
        const isSecret = fieldDef.secret
        const isNumber = fieldDef.type === 'number'
        const isBoolean = fieldDef.type === 'boolean'

        let initialValue = currentValue !== undefined ? currentValue : (fieldDef.default || '')
        if (isArray && Array.isArray(initialValue)) {
            initialValue = initialValue.join('\n')
        }

        let inputEl

        if (isArray) {
            inputEl = (
                <textarea
                    id={`plg-cfg-${key}`}
                    className="input-field plugin-config-input"
                    rows={4}
                    placeholder={fieldDef.description || 'One item per line...'}
                    style={{ fontFamily: 'monospace', width: '100%' }}
                >{initialValue}</textarea>
            )
        } else if (isBoolean) {
            inputEl = (
                <input
                    type="checkbox"
                    id={`plg-cfg-${key}`}
                    className="plugin-config-checkbox"
                    checked={initialValue === true || initialValue === 'true'}
                />
            )
        } else {
            inputEl = (
                <input
                    type={isSecret ? 'password' : (isNumber ? 'number' : 'text')}
                    id={`plg-cfg-${key}`}
                    className="input-field plugin-config-input"
                    value={initialValue}
                    placeholder={fieldDef.description || ''}
                    style={{ width: '100%', fontFamily: isSecret ? 'monospace' : 'inherit' }}
                />
            )
        }

        return (
            <div className="settings-group plugin-config-group" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <label className="settings-label" style={{ width: '100%' }} htmlFor={`plg-cfg-${key}`}>
                    {fieldDef.label || key}
                    {fieldDef.required && <span style={{ color: 'var(--red)', marginLeft: '4px' }}>*</span>}
                </label>
                {inputEl}
                {fieldDef.description && (
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {fieldDef.description}
                    </div>
                )}
            </div>
        )
    }

    const handleSave = async (e: any) => {
        const btn = e.currentTarget as HTMLButtonElement
        btn.textContent = 'Saving...'
        btn.disabled = true

        try {
            const updatedConfig: Record<string, any> = {}
            for (const key of Object.keys(config)) {
                const fieldDef = config[key]
                const inputEl = document.getElementById(`plg-cfg-${key}`) as HTMLInputElement | HTMLTextAreaElement
                if (!inputEl) continue

                let val: any
                if (fieldDef.type === 'boolean') {
                    val = (inputEl as HTMLInputElement).checked
                } else if (fieldDef.type === 'array') {
                    val = inputEl.value.split('\n').map(l => l.trim()).filter(Boolean)
                } else if (fieldDef.type === 'number') {
                    val = Number(inputEl.value)
                } else {
                    val = inputEl.value
                }

                if (val !== '' && val !== undefined) {
                    updatedConfig[key] = val
                }
            }

            const res = await fetch('/api/plugins', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    config: updatedConfig
                })
            })

            if (!res.ok) throw new Error('Save failed')

            btn.textContent = 'Saved!'
            btn.style.background = 'var(--green)'
            btn.style.color = '#fff'
            setTimeout(() => {
                closePluginConfig()
            }, 600)

        } catch (err) {
            btn.textContent = 'Error'
            btn.style.background = 'var(--red)'
            setTimeout(() => {
                btn.textContent = 'Save Configuration'
                btn.style.background = ''
                btn.disabled = false
            }, 2000)
        }
    }

    const hasFields = Object.keys(config).length > 0

    return (
        <div className="settings-overlay" onClick={handleOverlayClick}>
            <div className="settings-panel plugin-config-panel" style={{ width: '450px', maxWidth: '90vw' }}>
                <div className="settings-header">
                    <span className="settings-title">⚙ {name} Config</span>
                    <button className="settings-close" onClick={closePluginConfig}>✕</button>
                </div>
                <div className="settings-body" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {!hasFields ? (
                        <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '20px 0' }}>
                            This plugin does not require any configuration.
                        </div>
                    ) : (
                        Object.keys(config).map(key => renderField(key, config[key], currentConfig[key]))
                    )}
                </div>
                {hasFields && (
                    <div className="settings-footer" style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn-ghost" onClick={closePluginConfig}>Cancel</button>
                        <button className="btn-primary" onClick={handleSave}>Save Configuration</button>
                    </div>
                )}
            </div>
        </div>
    )
}
