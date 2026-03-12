// app/lib/search-ui.ts — Ctrl+K command palette for global session search
import { selectSession } from './sessions-ui'

let searchOverlay: HTMLElement | null = null
let searchInput: HTMLInputElement | null = null
let resultsList: HTMLElement | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let selectedIndex = 0

export function initSearchUI() {
    // Ctrl+K / Cmd+K to open search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault()
            openSearch()
        }
        if (e.key === 'Escape' && searchOverlay) {
            closeSearch()
        }
    })
}

function createSearchDOM() {
    if (searchOverlay) return

    searchOverlay = document.createElement('div')
    searchOverlay.className = 'search-overlay'
    searchOverlay.innerHTML = `
        <div class="search-modal">
            <div class="search-input-wrap">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input class="search-input" type="text" placeholder="Search sessions and messages…" autocomplete="off" spellcheck="false" />
                <kbd class="search-kbd">ESC</kbd>
            </div>
            <div class="search-results"></div>
            <div class="search-footer">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>esc Close</span>
            </div>
        </div>
    `
    document.body.appendChild(searchOverlay)

    searchInput = searchOverlay.querySelector('.search-input') as HTMLInputElement
    resultsList = searchOverlay.querySelector('.search-results') as HTMLElement

    // Click backdrop to close
    searchOverlay.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('search-overlay')) closeSearch()
    })

    // Input handler with debounce
    searchInput!.addEventListener('input', () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => runSearch(searchInput!.value), 200)
    })

    // Keyboard navigation
    searchInput!.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            navigateResults(1)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            navigateResults(-1)
        } else if (e.key === 'Enter') {
            e.preventDefault()
            selectResult()
        }
    })
}

function openSearch() {
    createSearchDOM()
    searchOverlay!.classList.add('visible')
    searchInput!.value = ''
    resultsList!.innerHTML = '<div class="search-empty">Start typing to search…</div>'
    selectedIndex = 0
    requestAnimationFrame(() => searchInput!.focus())
}

function closeSearch() {
    if (searchOverlay) {
        searchOverlay.classList.remove('visible')
    }
}

async function runSearch(query: string) {
    const q = query.trim()
    if (q.length < 2) {
        resultsList!.innerHTML = '<div class="search-empty">Type at least 2 characters…</div>'
        return
    }

    resultsList!.innerHTML = '<div class="search-loading">Searching…</div>'

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`)
        const data = await res.json()
        renderResults(data.results, q)
    } catch {
        resultsList!.innerHTML = '<div class="search-empty">Search failed</div>'
    }
}

function renderResults(results: any[], query: string) {
    if (results.length === 0) {
        resultsList!.innerHTML = '<div class="search-empty">No results found</div>'
        return
    }

    selectedIndex = 0
    resultsList!.innerHTML = ''

    for (let i = 0; i < results.length; i++) {
        const r = results[i]
        const item = document.createElement('div')
        item.className = `search-result-item${i === 0 ? ' selected' : ''}`
        item.dataset.index = String(i)
        item.dataset.sessionId = String(r.sessionId)

        const icon = r.type === 'session' ? '📂' : (r.role === 'user' ? '👤' : '🤖')
        const typeLabel = r.type === 'session' ? 'Session' : `${r.role || 'message'}`
        const badge = r.sessionType === 'telegram_bot' ? '📱' : '🌐'

        // Highlight match in content
        const highlighted = highlightMatch(r.content, query)

        item.innerHTML = `
            <div class="search-result-icon">${icon}</div>
            <div class="search-result-body">
                <div class="search-result-title">
                    ${badge} ${escapeHtml(r.sessionName)}
                    <span class="search-result-type">${typeLabel}</span>
                </div>
                <div class="search-result-snippet">${highlighted}</div>
            </div>
        `

        item.addEventListener('click', () => {
            selectSession(r.sessionId)
            closeSearch()
        })

        item.addEventListener('mouseenter', () => {
            setSelectedIndex(i)
        })

        resultsList!.appendChild(item)
    }
}

function highlightMatch(text: string, query: string): string {
    const escaped = escapeHtml(text)
    const qEscaped = escapeHtml(query)
    const regex = new RegExp(`(${qEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>')
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function navigateResults(delta: number) {
    const items = resultsList!.querySelectorAll('.search-result-item')
    if (items.length === 0) return
    setSelectedIndex(Math.max(0, Math.min(items.length - 1, selectedIndex + delta)))
}

function setSelectedIndex(idx: number) {
    const items = resultsList!.querySelectorAll('.search-result-item')
    items.forEach((el, i) => el.classList.toggle('selected', i === idx))
    selectedIndex = idx
    // Scroll into view
    items[idx]?.scrollIntoView({ block: 'nearest' })
}

function selectResult() {
    const items = resultsList!.querySelectorAll('.search-result-item')
    const selected = items[selectedIndex] as HTMLElement
    if (selected) {
        const sessionId = Number(selected.dataset.sessionId)
        if (sessionId) {
            selectSession(sessionId)
            closeSearch()
        }
    }
}
