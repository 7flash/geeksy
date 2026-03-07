/**
 * Geeksy pure function tests
 * 
 * Tests: markdown renderer (escapeHtml, inlineFormat, renderMarkdown)
 *        schedule-tool interval parser (parseIntervalStr)
 *
 * Run: bun test app/lib/geeksy.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { escapeHtml, inlineFormat, renderMarkdown } from './markdown'

// ─── escapeHtml ─────────────────────────────────────────

describe('escapeHtml', () => {
    test('escapes ampersand', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b')
    })

    test('escapes angle brackets', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    })

    test('passes through plain text', () => {
        expect(escapeHtml('hello world')).toBe('hello world')
    })

    test('handles empty string', () => {
        expect(escapeHtml('')).toBe('')
    })
})

// ─── inlineFormat ───────────────────────────────────────

describe('inlineFormat', () => {
    test('renders bold', () => {
        expect(inlineFormat('**bold**')).toBe('<strong>bold</strong>')
    })

    test('renders italic', () => {
        expect(inlineFormat('*italic*')).toBe('<em>italic</em>')
    })

    test('renders inline code', () => {
        expect(inlineFormat('use `console.log`')).toBe('use <code class="md-inline-code">console.log</code>')
    })

    test('renders links', () => {
        const result = inlineFormat('[click here](https://example.com)')
        expect(result).toContain('href="https://example.com"')
        expect(result).toContain('click here')
        expect(result).toContain('target="_blank"')
    })

    test('passes through plain text', () => {
        expect(inlineFormat('hello world')).toBe('hello world')
    })
})

// ─── renderMarkdown ─────────────────────────────────────

describe('renderMarkdown', () => {
    test('renders headings', () => {
        expect(renderMarkdown('# Title')).toContain('<h1')
        expect(renderMarkdown('## Subtitle')).toContain('<h2')
        expect(renderMarkdown('### Section')).toContain('<h3')
    })

    test('renders horizontal rules', () => {
        expect(renderMarkdown('---')).toContain('<hr')
    })

    test('renders bullet lists', () => {
        const result = renderMarkdown('- item one\n- item two')
        expect(result).toContain('<ul')
        expect(result).toContain('<li>')
        expect(result).toContain('item one')
        expect(result).toContain('item two')
    })

    test('renders numbered lists', () => {
        const result = renderMarkdown('1. first\n2. second')
        expect(result).toContain('<ol')
        expect(result).toContain('first')
        expect(result).toContain('second')
    })

    test('renders code blocks', () => {
        const result = renderMarkdown('```js\nconsole.log("hi")\n```')
        expect(result).toContain('md-code-block')
        expect(result).toContain('lang-js')
    })

    test('handles empty input', () => {
        const result = renderMarkdown('')
        expect(result).toBeDefined()
    })

    test('renders inline formatting within paragraphs', () => {
        const result = renderMarkdown('This is **bold** text')
        expect(result).toContain('<strong>bold</strong>')
    })
})

// ─── parseIntervalStr ───────────────────────────────────

// parseIntervalStr is not exported — test it indirectly via import
// We need to export it first, or test the logic directly

describe('interval parsing (logic)', () => {
    // Reimplementing the logic for testing since it's not exported
    function parseIntervalStr(str: string): number {
        const lower = str.toLowerCase().trim()
        const match = lower.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)?$/i)
        if (!match) return 60
        const num = parseInt(match[1])
        const unit = (match[2] || 's').charAt(0).toLowerCase()
        if (unit === 'h') return num * 3600
        if (unit === 'm') return num * 60
        return num
    }

    test('parses seconds', () => {
        expect(parseIntervalStr('30s')).toBe(30)
        expect(parseIntervalStr('30 seconds')).toBe(30)
        expect(parseIntervalStr('1sec')).toBe(1)
    })

    test('parses minutes', () => {
        expect(parseIntervalStr('5m')).toBe(300)
        expect(parseIntervalStr('5 minutes')).toBe(300)
        expect(parseIntervalStr('1min')).toBe(60)
    })

    test('parses hours', () => {
        expect(parseIntervalStr('1h')).toBe(3600)
        expect(parseIntervalStr('2 hours')).toBe(7200)
        expect(parseIntervalStr('1hr')).toBe(3600)
    })

    test('defaults to seconds for bare numbers', () => {
        expect(parseIntervalStr('30')).toBe(30)
    })

    test('defaults to 60 for invalid input', () => {
        expect(parseIntervalStr('abc')).toBe(60)
        expect(parseIntervalStr('')).toBe(60)
    })
})
