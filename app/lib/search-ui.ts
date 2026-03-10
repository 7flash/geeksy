// app/lib/search-ui.ts — Ctrl+K search modal for message history

let searchModal: HTMLElement | null = null
let searchInput: HTMLInputElement | null = null
let searchResults: HTMLElement | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function createSearchModal() {
    if (searchModal) return

    const modal = document.createElement('div')
    modal.id = 'search-modal'
    modal.className = 'search-modal-overlay'
    modal.innerHTML = `
        <div class="search-modal">
            <div class="search-input-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" class="search-input" placeholder="Search conversations…" autocomplete="off" spellcheck="false" />
                <kbd class="search-kbd">ESC</kbd>
            </div>
            <div class="search-results"></div>
            <div class="search-footer">
                <span class="search-footer-hint">↑↓ navigate · ↵ open · esc close</span>
            </div>
        </div>
    `

    document.body.appendChild(modal)
    searchModal = modal
    searchInput = modal.querySelector('.search-input') as HTMLInputElement
    searchResults = modal.querySelector('.search-results') as HTMLElement

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('search-modal-overlay')) closeSearch()
    })

    // Search on input
    searchInput.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(performSearch, 200)
    })

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeSearch(); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1) }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1) }
        if (e.key === 'Enter') { e.preventDefault(); openSelected() }
    })
}

let selectedIndex = -1

function moveSelection(delta: number) {
    if (!searchResults) return
    const items = searchResults.querySelectorAll('.search-result-item')
    if (items.length === 0) return

    items[selectedIndex]?.classList.remove('selected')
    selectedIndex = Math.max(-1, Math.min(items.length - 1, selectedIndex + delta))
    if (selectedIndex >= 0) {
        items[selectedIndex].classList.add('selected')
        items[selectedIndex].scrollIntoView({ block: 'nearest' })
    }
}

function openSelected() {
    if (!searchResults) return
    const selected = searchResults.querySelector('.search-result-item.selected') as HTMLElement
    if (selected) {
        // Scroll to the message in chat if possible
        const msgId = selected.dataset.msgId
        if (msgId) {
            const msgEl = document.querySelector(`[data-msg-id="${msgId}"]`)
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
                msgEl.classList.add('search-highlight')
                setTimeout(() => msgEl.classList.remove('search-highlight'), 2000)
            }
        }
        closeSearch()
    }
}

async function performSearch() {
    if (!searchInput || !searchResults) return
    const q = searchInput.value.trim()

    if (q.length < 2) {
        searchResults.innerHTML = '<div class="search-empty">Type at least 2 characters to search</div>'
        selectedIndex = -1
        return
    }

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`)
        const data = await res.json()

        if (!data.results || data.results.length === 0) {
            searchResults.innerHTML = `<div class="search-empty">No results for "${escapeHtml(q)}"</div>`
            selectedIndex = -1
            return
        }

        searchResults.innerHTML = data.results.map((r: any, i: number) => {
            const roleIcon = r.role === 'user' ? '👤' : '🤖'
            const roleClass = r.role === 'user' ? 'search-role-user' : 'search-role-assistant'
            const time = r.createdAt ? formatTime(r.createdAt) : ''
            const snippet = highlightMatch(escapeHtml(r.snippet), escapeHtml(q))

            return `
                <div class="search-result-item ${i === 0 ? 'selected' : ''}" data-msg-id="${r.id}">
                    <div class="search-result-header">
                        <span class="${roleClass}">${roleIcon} ${r.role}</span>
                        <span class="search-result-time">${time}</span>
                    </div>
                    <div class="search-result-snippet">${snippet}</div>
                </div>
            `
        }).join('')

        selectedIndex = 0

        // Click to select
        searchResults.querySelectorAll('.search-result-item').forEach((item, idx) => {
            item.addEventListener('click', () => {
                searchResults!.querySelector('.selected')?.classList.remove('selected')
                item.classList.add('selected')
                selectedIndex = idx
                openSelected()
            })
        })
    } catch (err) {
        searchResults.innerHTML = '<div class="search-empty">Search failed</div>'
    }
}

function highlightMatch(text: string, query: string): string {
    if (!query) return text
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.replace(regex, '<mark class="search-mark">$1</mark>')
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatTime(ts: string): string {
    try {
        const d = new Date(ts)
        const now = new Date()
        const diffMs = now.getTime() - d.getTime()
        const diffMin = Math.floor(diffMs / 60000)
        if (diffMin < 60) return `${diffMin}m ago`
        const diffHr = Math.floor(diffMin / 60)
        if (diffHr < 24) return `${diffHr}h ago`
        return d.toLocaleDateString()
    } catch { return '' }
}

export function openSearch() {
    createSearchModal()
    if (!searchModal || !searchInput) return
    searchModal.style.display = 'flex'
    searchInput.value = ''
    if (searchResults) searchResults.innerHTML = '<div class="search-empty">Type at least 2 characters to search</div>'
    selectedIndex = -1
    requestAnimationFrame(() => searchInput!.focus())
}

export function closeSearch() {
    if (searchModal) searchModal.style.display = 'none'
}

export function initSearchUI() {
    // Ctrl+K / Cmd+K to open search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault()
            if (searchModal?.style.display === 'flex') closeSearch()
            else openSearch()
        }
    })
}
