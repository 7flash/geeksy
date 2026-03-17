// app/src/lib/chat-ui.tsx — Chat bubbles, cards, render helpers
import { render } from 'melina/client'
import { renderMarkdown } from './markdown'
import { dom, toolCards } from './state'

// ── Reaction State ──
const REACTIONS = ['👍', '👎', '⭐'] as const
type ReactionEmoji = typeof REACTIONS[number]
const reactionStore = new Map<number, Set<ReactionEmoji>>()
let reactionCounter = 0

function getReactions(): Record<number, string[]> {
    try { return JSON.parse(localStorage.getItem('geeksy-reactions') || '{}') } catch { return {} }
}

function saveReactions() {
    const data: Record<number, string[]> = {}
    reactionStore.forEach((set, id) => { if (set.size > 0) data[id] = [...set] })
    try { localStorage.setItem('geeksy-reactions', JSON.stringify(data)) } catch { }
}

function restoreReactions(id: number): Set<ReactionEmoji> {
    const stored = getReactions()
    return new Set((stored[id] || []) as ReactionEmoji[])
}

// ── Time Helpers ──

function timeLabel(ts?: number): string {
    const d = ts ? new Date(ts) : new Date()
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Bubble Components ──

function UserBubble({ text, ts }: { text: string; ts?: number }) {
    const isTelegram = text.startsWith('[Telegram Message from ')
    let tgUser = ''
    let displayText = text

    if (isTelegram) {
        const match = text.match(/\[Telegram Message from (.*?)\]:\s+([\s\S]*)/)
        if (match) {
            tgUser = match[1]
            displayText = match[2]
        }
    }

    const handleReply = () => {
        const input = document.getElementById('input') as HTMLTextAreaElement
        if (input) {
            input.value = `Reply via Telegram to ${tgUser}: `
            input.focus()
            // auto resize
            input.style.height = 'auto'
            input.style.height = Math.min(input.scrollHeight, 100) + 'px'
        }
    }

    return (
        <div className={`msg msg-user ${isTelegram ? 'msg-telegram' : ''}`}>
            {isTelegram && (
                <div className="tg-msg-header" style={{ fontSize: '11px', color: 'var(--blue)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📱 Telegram • <strong>{tgUser}</strong></span>
                    <button
                        onClick={handleReply}
                        style={{ background: 'none', border: '1px solid var(--blue)', color: 'var(--blue)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}
                    >↵ Reply</button>
                </div>
            )}
            <div className="bubble" style={isTelegram ? { background: 'var(--bg-elevated)' } : {}}>
                {isTelegram ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }} /> : text}
            </div>
            <span className="msg-time">{timeLabel(ts)}</span>
        </div>
    )
}

function ResponseBubble({ text, ts, msgId }: { text: string; ts?: number; msgId: number }) {
    // Restore existing reactions
    if (!reactionStore.has(msgId)) {
        reactionStore.set(msgId, restoreReactions(msgId))
    }
    const activeReactions = reactionStore.get(msgId)!

    const toggleReaction = (emoji: ReactionEmoji, el: HTMLElement) => {
        if (activeReactions.has(emoji)) {
            activeReactions.delete(emoji)
        } else {
            activeReactions.add(emoji)
        }
        saveReactions()
        // Update button visuals
        updateReactionButtons(el.closest('.msg-agent')!, msgId)
    }

    return (
        <div className="msg msg-agent">
            <div className="bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
            <div className="msg-footer">
                <span className="msg-time">{timeLabel(ts)}</span>
                <div className="msg-active-reactions" data-msg-id={msgId}>
                    {[...activeReactions].map(emoji => (
                        <span className="reaction-badge active">{emoji}</span>
                    ))}
                </div>
            </div>
            <div className="reaction-bar">
                {REACTIONS.map(emoji => (
                    <button
                        className={`reaction-btn ${activeReactions.has(emoji) ? 'active' : ''}`}
                        onClick={(e: any) => toggleReaction(emoji, e.currentTarget)}
                        title={`React with ${emoji}`}
                    >{emoji}</button>
                ))}
            </div>
        </div>
    )
}

function updateReactionButtons(msgEl: Element, msgId: number) {
    const reactions = reactionStore.get(msgId)
    if (!reactions) return

    // Update active badges
    const badgeContainer = msgEl.querySelector('.msg-active-reactions')
    if (badgeContainer) {
        badgeContainer.innerHTML = ''
        reactions.forEach(emoji => {
            const badge = document.createElement('span')
            badge.className = 'reaction-badge active'
            badge.textContent = emoji
            badgeContainer.appendChild(badge)
        })
    }

    // Update button states
    const buttons = msgEl.querySelectorAll('.reaction-btn')
    buttons.forEach((btn) => {
        const emoji = btn.textContent?.trim() as ReactionEmoji
        btn.classList.toggle('active', reactions.has(emoji))
    })
}

function ThinkingCard({ text }: { text: string }) {
    const preview = text.length > 80 ? text.substring(0, 80) + '…' : text
    return (
        <div className="card card-thinking collapsed">
            <div className="card-label thinking-toggle">
                <span className="thinking-arrow">▶</span> Thinking
            </div>
            <div className="card-preview">{preview}</div>
            <div className="card-body">{text}</div>
        </div>
    )
}

function Loading() {
    return (
        <div className="loading">
            <div className="dots"><span /><span /><span /></div>
            <span>Agent is working...</span>
        </div>
    )
}

function Divider({ text }: { text: string }) {
    return <div className="divider">{text}</div>
}

function Card({ type, label, content }: { type: string; label: string; content: string }) {
    return (
        <div className={`card card-${type}`}>
            <div className="card-label">{label}</div>
            <div className="card-body">{content}</div>
        </div>
    )
}

export function ToolCard({ name, params, result, startTime }: {
    name: string
    params: Record<string, any>
    result?: { success: boolean; output: string; error?: string }
    startTime?: number
}) {
    const isRunning = !result
    const badgeClass = isRunning ? 'running' : result.success ? 'success' : 'failure'
    const badgeIcon = isRunning ? '⏳' : result.success ? '✓' : '✗'
    const badgeText = isRunning ? 'running…' : result.success ? 'done' : 'failed'
    const output = result ? (result.output || result.error || '') : ''

    const toolLabels: Record<string, string> = {
        read_file: '📖 Read File',
        write_file: '✏️ Write File',
        edit_file: '✏️ Edit File',
        execute: '🖥️ Shell',
        exec: '🖥️ Shell',
        run_command: '🖥️ Shell',
        search: '🔍 Search',
        list_files: '📂 List Files',
        schedule: '⏰ Schedule',
    }
    const displayName = toolLabels[name] || name

    const primaryField = params.command || params.path || params.file || params.query || ''
    const isShell = ['execute', 'exec', 'run_command'].includes(name)
    const isFileOp = ['read_file', 'write_file', 'edit_file'].includes(name)
    const hasExtraParams = Object.keys(params).filter(k => k !== 'command' && k !== 'path' && k !== 'file' && k !== 'query').length > 0

    const elapsed = startTime && result ? `${((Date.now() - startTime) / 1000).toFixed(1)}s` : ''

    return (
        <div className={`card card-tool ${isRunning ? 'tool-active' : ''}`}>
            <div className="tool-header">
                <span className="tool-name">{displayName}</span>
                <span className={`tool-badge ${badgeClass}`}>{badgeIcon} {badgeText}</span>
                {elapsed && <span className="tool-elapsed">{elapsed}</span>}
            </div>

            {primaryField && (
                <div className={`tool-primary-param ${isShell ? 'tool-command' : ''}`}>
                    {isShell ? '$ ' : ''}{primaryField}
                </div>
            )}

            {isRunning && isShell && (
                <div className="tool-progress">
                    <div className="tool-progress-bar" />
                </div>
            )}

            {hasExtraParams && (
                <details className="tool-params-details">
                    <summary className="tool-params-summary">▸ Parameters</summary>
                    <pre className="tool-params">{JSON.stringify(
                        Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'command' && k !== 'path' && k !== 'file' && k !== 'query')),
                        null, 2
                    )}</pre>
                </details>
            )}

            {output ? (
                <details className="tool-output-details" open={output.length <= 200 && !result.success ? true : undefined}>
                    <summary className="tool-output-summary">
                        {result.success ? '▸' : '▾'} Output{output.length > 500 ? ` (${output.length > 1000 ? `${(output.length / 1024).toFixed(1)}KB` : `${output.length} chars`})` : ''}
                    </summary>
                    <pre className={`tool-output ${!result.success ? 'tool-output-error' : ''}`}>{output.substring(0, 3000)}{output.length > 3000 ? '\n…truncated' : ''}</pre>
                </details>
            ) : null}
        </div>
    )
}

// ── Render Helpers ──

function appendJsx(jsx: any): HTMLElement {
    const el = document.createElement('div')
    dom.chatArea.appendChild(el)
    render(jsx, el)
    scrollDown()
    return el
}

export function appendUserBubble(text: string) { appendJsx(<UserBubble text={text} ts={Date.now()} />) }
export function appendResponseBubble(text: string) {
    const msgId = reactionCounter++
    appendJsx(<ResponseBubble text={text} ts={Date.now()} msgId={msgId} />)
}
export function appendLoading(): HTMLElement { return appendJsx(<Loading />) }
export function appendDivider(text: string) { appendJsx(<Divider text={text} />) }
export function appendCard(type: string, label: string, content: string) { appendJsx(<Card type={type} label={label} content={content} />) }

export function appendThinkingCard(text: string): HTMLElement {
    const el = appendJsx(<ThinkingCard text={text} />)
    const card = el.querySelector('.card-thinking') as HTMLElement
    if (card) {
        const toggle = card.querySelector('.thinking-toggle') as HTMLElement
        if (toggle) {
            toggle.addEventListener('click', () => card.classList.toggle('collapsed'))
        }
    }
    return el
}

export function appendToolCard(name: string, params: Record<string, any>) {
    const startTime = Date.now()
    const entry = { el: null as any, name, params, startTime }
    entry.el = appendJsx(<ToolCard name={name} params={params} startTime={startTime} />)
    toolCards.push(entry)
}

export function updateLastTool(result: { success: boolean; output: string; error?: string }) {
    const entry = toolCards[toolCards.length - 1]
    if (!entry) return
    entry.result = result
    render(<ToolCard name={entry.name} params={entry.params} result={result} startTime={entry.startTime} />, entry.el)
    scrollDown()
}

export function scrollDown() {
    requestAnimationFrame(() => {
        const { chatArea } = dom
        const isNearBottom = chatArea.scrollTop + chatArea.clientHeight >= chatArea.scrollHeight - 300
        if (isNearBottom) {
            chatArea.scrollTop = chatArea.scrollHeight
        }
    })
}

/** Always scroll to bottom — use after user-initiated actions (send, new agent, etc.) */
export function forceScrollDown() {
    requestAnimationFrame(() => {
        dom.chatArea.scrollTop = dom.chatArea.scrollHeight
    })
}
