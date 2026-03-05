// app/plugins/page.client.tsx — Client-side interactions for the plugins page

export function mount() {
    // Install form handler
    const form = document.getElementById('plugin-install-form') as HTMLFormElement
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault()
            const input = form.querySelector('input[name="packageName"]') as HTMLInputElement
            const pkg = input.value.trim()
            if (!pkg) return

            const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement
            btn.textContent = 'Installing…'
            btn.disabled = true

            try {
                const res = await fetch('/api/plugins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: pkg.replace(/^geeksy-|-plugin$/g, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        packageName: pkg,
                        description: `Plugin: ${pkg}`,
                    })
                })
                if (res.ok) {
                    window.location.reload()
                } else {
                    const data = await res.json()
                    alert(data.error || 'Failed to install')
                    btn.textContent = 'Install'
                    btn.disabled = false
                }
            } catch (err) {
                alert('Network error')
                btn.textContent = 'Install'
                btn.disabled = false
            }
        })
    }

    // Suggestion install buttons
    document.querySelectorAll('.plugin-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const pkg = (btn as HTMLElement).dataset.pkg!
            const el = btn as HTMLButtonElement
            el.textContent = 'Installing…'
            el.disabled = true

            try {
                const res = await fetch('/api/plugins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: pkg.replace(/^geeksy-|-plugin$/g, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                        packageName: pkg,
                        icon: pkg.includes('telegram') ? '📱' : pkg.includes('discord') ? '💬' : pkg.includes('github') ? '🐙' : '🧩',
                        description: btn.closest('.plugin-suggestion')?.querySelector('.plugin-suggestion-desc')?.textContent || '',
                    })
                })
                if (res.ok) {
                    window.location.reload()
                } else {
                    const data = await res.json()
                    alert(data.error || 'Failed to install')
                    el.textContent = 'Install'
                    el.disabled = false
                }
            } catch {
                el.textContent = 'Install'
                el.disabled = false
            }
        })
    })

    // Plugin action buttons (start, stop, configure, remove)
    document.querySelectorAll('.plugin-action-btn').forEach(btn => {
        const el = btn as HTMLButtonElement
        const id = el.dataset.id

        if (el.classList.contains('start')) {
            el.addEventListener('click', async () => {
                el.textContent = 'Starting…'
                el.disabled = true
                const res = await fetch('/api/plugins', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: Number(id), action: 'start' })
                })
                const data = await res.json()
                if (!data.ok) alert(data.error || 'Failed to start')
                window.location.reload()
            })
        }

        if (el.classList.contains('stop')) {
            el.addEventListener('click', async () => {
                el.textContent = 'Stopping…'
                el.disabled = true
                const res = await fetch('/api/plugins', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: Number(id), action: 'stop' })
                })
                const data = await res.json()
                if (!data.ok) alert(data.error || 'Failed to stop')
                window.location.reload()
            })
        }

        if (el.classList.contains('remove')) {
            el.addEventListener('click', async () => {
                if (!confirm('Uninstall this plugin?')) return
                await fetch(`/api/plugins?id=${id}`, { method: 'DELETE' })
                window.location.reload()
            })
        }

        if (el.classList.contains('configure')) {
            el.addEventListener('click', async () => {
                const pluginId = Number(id)
                // Fetch manifest config schema
                let schema: Record<string, any> = {}
                let currentConfig: Record<string, any> = {}
                let pluginName = ''
                try {
                    const res = await fetch(`/api/plugins/manifest?id=${pluginId}`)
                    const data = await res.json()
                    schema = data.config || {}
                    currentConfig = data.currentConfig || {}
                    pluginName = data.name || 'Plugin'
                } catch { }

                const schemaKeys = Object.keys(schema)

                // Build modal
                const overlay = document.createElement('div')
                overlay.className = 'config-modal-overlay'
                overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })

                const modal = document.createElement('div')
                modal.className = 'config-modal'
                modal.innerHTML = `
                    <div class="config-modal-header">
                        <h2>Configure ${pluginName}</h2>
                        <button class="config-modal-close" title="Close">✕</button>
                    </div>
                    <div class="config-modal-body"></div>
                    <div class="config-modal-footer">
                        <button class="config-modal-cancel">Cancel</button>
                        <button class="config-modal-save">Save Configuration</button>
                    </div>
                `
                overlay.appendChild(modal)

                const body = modal.querySelector('.config-modal-body')!
                const fields: Map<string, HTMLInputElement | HTMLTextAreaElement> = new Map()

                if (schemaKeys.length > 0) {
                    // Render form fields from manifest config schema
                    for (const key of schemaKeys) {
                        const spec = schema[key]
                        const fieldDiv = document.createElement('div')
                        fieldDiv.className = 'config-field'

                        const label = document.createElement('label')
                        label.className = 'config-field-label'
                        label.textContent = spec.label || key
                        if (spec.required) {
                            const req = document.createElement('span')
                            req.className = 'config-field-required'
                            req.textContent = ' *'
                            label.appendChild(req)
                        }
                        fieldDiv.appendChild(label)

                        if (spec.description) {
                            const desc = document.createElement('div')
                            desc.className = 'config-field-desc'
                            desc.textContent = spec.description
                            fieldDiv.appendChild(desc)
                        }

                        let input: HTMLInputElement | HTMLTextAreaElement
                        if (spec.type === 'array') {
                            input = document.createElement('textarea')
                            input.className = 'config-field-input config-field-textarea'
                            input.placeholder = 'One item per line'
                            input.rows = 3
                            const val = currentConfig[key]
                            input.value = Array.isArray(val) ? val.join('\n') : (val || '')
                        } else {
                            input = document.createElement('input')
                            input.className = 'config-field-input'
                            input.type = spec.secret ? 'password' : 'text'
                            input.placeholder = spec.label || key
                            input.value = currentConfig[key] || ''
                        }
                        fieldDiv.appendChild(input)
                        fields.set(key, input)
                        body.appendChild(fieldDiv)
                    }
                } else {
                    // No schema — raw JSON editor fallback
                    const fieldDiv = document.createElement('div')
                    fieldDiv.className = 'config-field'
                    const label = document.createElement('label')
                    label.className = 'config-field-label'
                    label.textContent = 'Configuration (JSON)'
                    fieldDiv.appendChild(label)
                    const input = document.createElement('textarea')
                    input.className = 'config-field-input config-field-textarea'
                    input.rows = 6
                    input.value = JSON.stringify(currentConfig, null, 2)
                    fieldDiv.appendChild(input)
                    fields.set('__raw__', input)
                    body.appendChild(fieldDiv)
                }

                document.body.appendChild(overlay)

                // Close handlers
                modal.querySelector('.config-modal-close')!.addEventListener('click', () => overlay.remove())
                modal.querySelector('.config-modal-cancel')!.addEventListener('click', () => overlay.remove())

                // Save handler
                modal.querySelector('.config-modal-save')!.addEventListener('click', async () => {
                    let config: Record<string, any>

                    if (fields.has('__raw__')) {
                        try { config = JSON.parse(fields.get('__raw__')!.value) }
                        catch { alert('Invalid JSON'); return }
                    } else {
                        config = {}
                        for (const [key, input] of fields) {
                            const spec = schema[key]
                            if (spec?.required && !input.value.trim()) {
                                alert(`${spec.label || key} is required`)
                                input.focus()
                                return
                            }
                            if (spec?.type === 'array') {
                                config[key] = input.value.split('\n').map(s => s.trim()).filter(Boolean)
                            } else {
                                config[key] = input.value
                            }
                        }
                    }

                    const saveBtn = modal.querySelector('.config-modal-save') as HTMLButtonElement
                    saveBtn.textContent = 'Saving…'
                    saveBtn.disabled = true

                    try {
                        await fetch('/api/plugins', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: pluginId, config })
                        })
                        overlay.remove()
                        window.location.reload()
                    } catch {
                        alert('Failed to save')
                        saveBtn.textContent = 'Save Configuration'
                        saveBtn.disabled = false
                    }
                })
            })
        }
    })
}
