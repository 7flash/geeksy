// app/src/lib/events.ts — SSE event handler for chat stream
import {
    state, dom, toolCards, getActiveAgent,
    streamingEl, streamingContent, lastThinkingMessage, lastThinkingEl,
    setStreamingEl, setStreamingContent, setLastThinking,
    activeLoadingEl, setActiveLoadingEl,
    isQuickResponse, setQuickResponse,
} from './state'
import {
    appendCard, appendDivider, appendToolCard, updateLastTool,
    appendResponseBubble, appendThinkingCard, scrollDown,
} from './chat-ui'
import { renderObjectivesPane, updateObjectives, renderFilesPane, switchTab, fetchSchedules } from './panels'

export function clearLoading() {
    if (activeLoadingEl) { activeLoadingEl.remove(); setActiveLoadingEl(null) }
}

/** Strip tool‐call JSON blocks from thinking text — tool cards show this already */
function cleanThinkingText(text: string): string {
    return text
        // Remove ```json blocks containing tool calls
        .replace(/```json\s*[\s\S]*?```/g, '')
        // Remove standalone inline tool JSON objects  
        .replace(/\[?\s*\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"params"\s*:[\s\S]*?\}\s*\]?/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export function handleEvent(type: string, data: any) {
    const agent = getActiveAgent()

    switch (type) {
        case 'session':
            if (agent) agent.sessionId = data.sessionId
            break
        case 'replanning':
            clearLoading()
            // Only show replanning card for non-quick (task) responses
            if (!isQuickResponse) {
                appendCard('thinking', 'Replanning', `Adjusting objectives for: "${data.message}"`)
            }
            break
        case 'planning': {
            const objectives = (data.objectives || [])

            // Detect quick response mode — all objectives have _quick flag or are all "respond" type
            const allQuick = objectives.every((o: any) => o._quick || o.type === 'respond')
            setQuickResponse(allQuick)

            // Build objective entries
            const entries = objectives.map((o: any) => ({
                ...o,
                met: o.completed ? true : undefined,
                reason: o.completed ? 'Previously completed' : undefined,
            }))

            // Push as a new group to the timeline (preserve history)
            const isFirst = state.objectiveGroups.length === 0
            const newObjectives = entries.filter((o: any) => !o.completed)
            if (newObjectives.length > 0) {
                state.objectiveGroups.push({
                    id: Date.now(),
                    timestamp: Date.now(),
                    label: isFirst ? 'Plan' : 'Replan',
                    objectives: entries,
                })
            }

            // Keep flat list for backward compat
            state.objectives = entries
            renderObjectivesPane()

            // Only show objectives card for task mode (not quick responses)
            if (!allQuick) {
                switchTab('objectives')
                if (newObjectives.length > 0) {
                    appendCard('planning', 'Planned Objectives', newObjectives.map((o: any) => `• ${o.name} — ${o.description}`).join('\n'))
                }
            }
            break
        }
        case 'awaiting_confirmation': {
            clearLoading()
            // Show confirmation card with Proceed / Cancel buttons
            const card = document.createElement('div')
            card.className = 'confirmation-card'
            card.innerHTML = `
                <div class="confirmation-header">
                    <span class="confirmation-icon">⏸</span>
                    <span>Review objectives before proceeding</span>
                </div>
                <div class="confirmation-actions">
                    <button class="confirm-btn proceed" id="confirm-proceed">▶ Proceed</button>
                    <button class="confirm-btn cancel" id="confirm-cancel">✕ Cancel</button>
                </div>
            `
            dom.chatArea.appendChild(card)
            scrollDown()

            const sessionId = agent?.sessionId
            card.querySelector('#confirm-proceed')!.addEventListener('click', async () => {
                card.remove()
                appendCard('info', 'Confirmed', 'Proceeding with objectives...')
                if (sessionId) {
                    await fetch('/api/chat', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, confirmed: true }),
                    })
                }
            })
            card.querySelector('#confirm-cancel')!.addEventListener('click', async () => {
                card.remove()
                appendCard('cancelled', 'Cancelled', 'Objectives rejected — agent will not execute.')
                if (sessionId) {
                    await fetch('/api/chat', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sessionId, confirmed: false }),
                    })
                }
            })
            break
        }
        case 'iteration_start':
            if (streamingEl) {
                streamingEl.remove()
                setStreamingEl(null)
                setStreamingContent('')
            }
            // Skip iteration dividers for quick responses — it's just noise
            if (!isQuickResponse) {
                appendDivider(`Iteration ${data.iteration} · ${((data.elapsed || 0) / 1000).toFixed(1)}s`)
            }
            break
        case 'thinking_delta': {
            clearLoading()
            setStreamingContent(streamingContent + (data.delta || ''))
            // Clean tool call JSON from display — show only natural language
            const displayText = cleanThinkingText(streamingContent)
            if (!displayText) break // nothing to show yet (just JSON so far)
            if (!streamingEl) {
                const el = document.createElement('div')
                el.className = 'msg msg-agent streaming'
                el.innerHTML = `<div class="bubble streaming-bubble"><span class="stream-text"></span><span class="stream-cursor">▌</span></div>`
                dom.chatArea.appendChild(el)
                setStreamingEl(el)
            }
            const textEl = streamingEl!.querySelector('.stream-text')
            if (textEl) textEl.textContent = displayText
            scrollDown()
            break
        }
        case 'thinking':
            if (streamingEl && streamingContent) {
                // Finalize the streaming bubble — remove cursor, mark as complete
                const cursor = streamingEl.querySelector('.stream-cursor')
                if (cursor) cursor.remove()
                streamingEl.classList.remove('streaming')
                // Track as last thinking so 'complete' handler can convert to response bubble
                // Prefer data.message (server-cleaned, tool JSON stripped) over raw streamingContent
                setLastThinking(data.message || streamingContent, streamingEl)
                setStreamingEl(null)
                setStreamingContent('')
            } else {
                if (streamingEl) {
                    streamingEl.remove()
                    setStreamingEl(null)
                    setStreamingContent('')
                }
                setLastThinking(data.message || '', appendThinkingCard(data.message || ''))
            }
            break
        case 'tool_start':
            if (streamingEl) {
                streamingEl.remove()
                setStreamingEl(null)
                setStreamingContent('')
            }
            appendToolCard(data.tool || '', data.params || {})
            if (data.tool === 'schedule') {
                fetchSchedules()
                switchTab('schedule')
            }
            if (data.params?.path) {
                const action = ['write_file', 'edit_file'].includes(data.tool) ? 'write' as const : 'read' as const
                const existing = state.files.find(f => f.path === data.params.path)
                if (!existing) {
                    state.files.push({ path: data.params.path, action })
                } else if (action === 'write') {
                    existing.action = 'write'
                }
                renderFilesPane()
            }
            break
        case 'tool_result':
            updateLastTool(data.result!)
            break
        case 'objective_check':
            updateObjectives(data.results || [])
            break
        case 'complete': {
            if (streamingEl) {
                streamingEl.remove()
                setStreamingEl(null)
                setStreamingContent('')
            }
            if (lastThinkingMessage) {
                if (lastThinkingEl) lastThinkingEl.remove()
                const cleaned = cleanThinkingText(lastThinkingMessage)
                if (cleaned) appendResponseBubble(cleaned)
            }

            // For quick responses, show minimal completion (no card)
            // For tasks, show full completion card
            if (!isQuickResponse) {
                const iters = (data.iteration || 0) + 1
                const elapsed = ((data.elapsed || 0) / 1000).toFixed(1)
                appendCard('complete', '✓ Complete', `${iters} iteration${iters > 1 ? 's' : ''} · ${elapsed}s`)
            }

            setLastThinking('', null)
            setQuickResponse(false) // reset for next message
            fetchSchedules()
            break
        }
        case 'error':
            appendCard('error', 'Error', data.error || '')
            setQuickResponse(false) // reset
            break
        case 'max_iterations': {
            if (streamingEl) {
                streamingEl.remove()
                setStreamingEl(null)
                setStreamingContent('')
            }
            if (lastThinkingMessage) {
                if (lastThinkingEl) lastThinkingEl.remove()
                const cleaned = cleanThinkingText(lastThinkingMessage)
                if (cleaned) appendResponseBubble(cleaned)
            }
            appendCard('error', 'Reached Limit', `Stopped after ${data.iteration} iterations. Try rephrasing your request or breaking it into smaller steps.`)
            setLastThinking('', null)
            setQuickResponse(false) // reset
            break
        }
        case 'cancelled': {
            if (streamingEl) {
                streamingEl.remove()
                setStreamingEl(null)
                setStreamingContent('')
            }
            if (lastThinkingMessage) {
                if (lastThinkingEl) lastThinkingEl.remove()
                const cleaned = cleanThinkingText(lastThinkingMessage)
                if (cleaned) appendResponseBubble(cleaned)
            }
            const elapsed = ((data.elapsed || 0) / 1000).toFixed(1)
            appendCard('cancelled', '■ Cancelled', `Stopped after ${(data.iteration || 0) + 1} iteration${data.iteration > 0 ? 's' : ''} · ${elapsed}s`)
            setLastThinking('', null)
            setQuickResponse(false) // reset
            break
        }
    }
}
