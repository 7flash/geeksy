// app/lib/web-search-tool.ts — Web search tool for the agent
// Uses DuckDuckGo Instant Answer API (free, no key required)
import type { Tool, ToolResult } from 'smart-agent-ai'

/** Search the web using DuckDuckGo and return relevant results */
async function searchWeb(query: string, maxResults: number = 5): Promise<{ title: string; url: string; snippet: string }[]> {
    // DuckDuckGo HTML search (more reliable than the JSON API for real results)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Geeksy/1.0)',
        },
    })

    if (!res.ok) throw new Error(`Search failed: ${res.status}`)

    const html = await res.text()
    const results: { title: string; url: string; snippet: string }[] = []

    // Parse DuckDuckGo HTML results
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
        const rawUrl = match[1]
        const title = match[2].replace(/<[^>]+>/g, '').trim()
        const snippet = match[3].replace(/<[^>]+>/g, '').trim()

        // DDG wraps URLs in redirects — extract the actual URL
        let actualUrl = rawUrl
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
        if (uddgMatch) actualUrl = decodeURIComponent(uddgMatch[1])

        if (title && actualUrl) {
            results.push({ title, url: actualUrl, snippet })
        }
    }

    return results
}

/** Fetch and extract text content from a URL */
async function fetchPage(url: string, maxChars: number = 8000): Promise<string> {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Geeksy/1.0)' },
        signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return `[Non-text content: ${contentType}]`
    }

    const html = await res.text()

    // Extract main text content — strip HTML tags, scripts, styles
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()

    if (text.length > maxChars) {
        text = text.slice(0, maxChars) + '... [truncated]'
    }

    return text
}

export function createWebSearchTool(): Tool {
    return {
        name: 'web_search',
        description: `Search the web for current information. Use this when the user asks about recent events, facts you're unsure about, documentation, or anything that needs up-to-date information. Returns search results with titles, URLs, and snippets.`,
        parameters: {
            query: { type: 'string', description: 'Search query', required: true },
            maxResults: { type: 'number', description: 'Max results to return (default: 5)', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const query = params.query as string
            if (!query) return { success: false, output: '', error: 'Missing query parameter' }

            try {
                const maxResults = (params.maxResults as number) || 5
                const results = await searchWeb(query, maxResults)

                if (results.length === 0) {
                    return { success: true, output: `No results found for: "${query}"` }
                }

                const formatted = results.map((r, i) =>
                    `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
                ).join('\n\n')

                return {
                    success: true,
                    output: `Search results for "${query}":\n\n${formatted}`,
                }
            } catch (e: any) {
                return { success: false, output: '', error: `Web search failed: ${e.message}` }
            }
        },
    }
}

export function createFetchPageTool(): Tool {
    return {
        name: 'fetch_page',
        description: `Fetch and read the text content of a web page. Use this after web_search to read a specific result in detail. Returns the main text content of the page (HTML stripped).`,
        parameters: {
            url: { type: 'string', description: 'URL to fetch', required: true },
            maxChars: { type: 'number', description: 'Max characters to return (default: 8000)', required: false },
        },
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
            const url = params.url as string
            if (!url) return { success: false, output: '', error: 'Missing url parameter' }

            try {
                const maxChars = (params.maxChars as number) || 8000
                const text = await fetchPage(url, maxChars)

                return {
                    success: true,
                    output: `Content from ${url}:\n\n${text}`,
                }
            } catch (e: any) {
                return { success: false, output: '', error: `Fetch failed: ${e.message}` }
            }
        },
    }
}

export function createWebTools(): Tool[] {
    return [createWebSearchTool(), createFetchPageTool()]
}
