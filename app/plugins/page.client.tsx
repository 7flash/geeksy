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
            el.addEventListener('click', () => {
                // Find the plugin card to get current config
                const card = el.closest('.plugin-card')
                const pkg = card?.querySelector('.plugin-card-pkg')?.textContent || ''
                const configJson = prompt(`Enter config JSON for ${pkg}:`, '{}')
                if (configJson === null) return

                try {
                    const config = JSON.parse(configJson)
                    fetch('/api/plugins', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: Number(id), config })
                    }).then(() => window.location.reload())
                } catch {
                    alert('Invalid JSON')
                }
            })
        }
    })
}
