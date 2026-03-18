// app/src/lib/chat-ui.tsx — Chat bubbles, cards, render helpers
import { render } from 'melina/client'
import { renderMarkdown } from './markdown'
import { dom, toolCards, state } from './state'
import { parseSecretRequestMarker } from './secrets'

function timeLabel(ts?: number): string {
    const d = ts ? new Date(ts) : new Date()
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

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

function SecretRequestCard({ payload, ts }: { payload: { key: string; label: string; description?: string }; ts?: number }) {
    const [value, setValue] = (window as any)._preact.useState('')
    const [status, setStatus] = (window as any)._preact.useState('')
    const [saved, setSaved] = (window as any)._preact.useState(false)

    ;(window as any)._preact.useEffect(() => {
        fetch(`/api/secrets?key=${encodeURIComponent(payload.key)}`)
            .then(res => res.json())
            .then(data => setSaved(!!data?.exists))
            .catch(() => { })
    }, [payload.key])

    const submit = async () => {
        if (!value) {
            setStatus('Enter the secret value')
            return
        }

        const agentId = state.activeAgentId || undefined
        const dbSessionId = Number(localStorage.getItem('geeksy:activeSessionId') || '0') || undefined

        setStatus('Saving...')
        try {
            await fetch('/api/secrets/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: payload.key,
                    value,
                    description: payload.description || undefined,
                    agentId,
                    dbSessionId,
                }),
            })
            setValue('')
            setSaved(true)
            setStatus('Saved. Geeksy is continuing...')
        } catch {
            setStatus('Failed to save secret')
        }
    }

    return (
        <div className="msg msg-agent">
            <div className="bubble secret-request-bubble">
                <div className="secret-request-title">Secret needed: {payload.label}</div>
                {payload.description ? <div className="secret-request-description">{payload.description}</div> : null}
                <div className="secret-request-row">
                    <input
                        type="password"
                        className="secret-request-input"
                        placeholder={saved ? 'A value is already saved for this secret' : `Enter ${payload.label}`}
                        value={value}
                        onChange={e => setValue((e.target as HTMLInputElement).value)}
                    />
                    <button className="secret-request-btn" onClick={submit}>Save & continue</button>
                </div>
                <div className="secret-request-meta">Stored as <code>{payload.key}</code>{saved ? ' • saved' : ''}</div>
                {status ? <div className="secret-request-status">{status}</div> : null}
            </div>
            <div className="msg-footer">
                <span className="msg-time">{timeLabel(ts)}</span>
            </div>
        </div>
    )
}

function ResponseBubble({ text, ts }: { text: string; ts?: number }) {
    const secretRequest = parseSecretRequestMarker(text)
    if (secretRequest) {
        return <SecretRequestCard payload={secretRequest} ts={ts} />
    }

    return (
        <div className="msg msg-agent">
            <div className="bubble" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
            <div className="msg-footer">
                <span className="msg-time">{timeLabel(ts)}</span>
            </div>
        </div>
    )
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
    const safeResult = result || { success: false, output: '', error: '' }
    const badgeClass = isRunning ? 'running' : safeResult.success ? 'success' : 'failure'
    const badgeIcon = isRunning ? '⏳' : safeResult.success ? '✓' : '✗'
    const badgeText = isRunning ? 'running…' : safeResult.success ? 'done' : 'failed'
    const secretTool = name === 'get_secret'
    const output = result ? (secretTool && safeResult.success ? '[hidden secret value]' : (safeResult.output || safeResult.error || '')) : ''

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
        request_secret: '🔐 Request Secret',
        get_secret: '🔐 Get Secret',
    }
    const displayName = toolLabels[name] || name

    const primaryField = params.command || params.path || params.file || params.query || params.key || ''
    const isShell = ['execute', 'exec', 'run_command'].includes(name)
    const hasExtraParams = Object.keys(params).filter(k => !['command', 'path', 'file', 'query', 'key'].includes(k)).length > 0
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
                        Object.fromEntries(Object.entries(params).filter(([k]) => !['command', 'path', 'file', 'query', 'key'].includes(k))),
                        null,
                        2
                    )}</pre>
                </details>
            )}

            {output && result ? (
                <details className="tool-output-details" open={output.length <= 200 && !safeResult.success ? true : undefined}>
                    <summary className="tool-output-summary">
                        {safeResult.success ? '▸' : '▾'} Output{output.length > 500 ? ` (${output.length > 1000 ? `${(output.length / 1024).toFixed(1)}KB` : `${output.length} chars`})` : ''}
                    </summary>
                    <pre className={`tool-output ${!safeResult.success ? 'tool-output-error' : ''}`}>{output.substring(0, 3000)}{output.length > 3000 ? '\n…truncated' : ''}</pre>
                </details>
            ) : null}
        </div>
    )
}

function appendJsx(jsx: any): HTMLElement {
    const el = document.createElement('div')
    dom.chatArea.appendChild(el)
    render(jsx, el)
    scrollDown()
    return el
}

export function appendUserBubble(text: string) { appendJsx(<UserBubble text={text} ts={Date.now()} />) }
export function appendResponseBubble(text: string) { appendJsx(<ResponseBubble text={text} ts={Date.now()} />) }
export function appendLoading(): HTMLElement { return appendJsx(<Loading />) }
export function appendDivider(text: string) { appendJsx(<Divider text={text} />) }
export function appendCard(type: string, label: string, content: string) { appendJsx(<Card type={type} label={label} content={content} />) }

export function appendThinkingCard(text: string): HTMLElement {
    const el = appendJsx(<ThinkingCard text={text} />)
    const card = el.querySelector('.card-thinking') as HTMLElement
    if (card) {
        const toggle = card.querySelector('.thinking-toggle') as HTMLElement
        if (toggle) toggle.addEventListener('click', () => card.classList.toggle('collapsed'))
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
        if (isNearBottom) chatArea.scrollTop = chatArea.scrollHeight
    })
}

export function forceScrollDown() {
    requestAnimationFrame(() => {
        dom.chatArea.scrollTop = dom.chatArea.scrollHeight
    })
}
