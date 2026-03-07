// app/src/lib/markdown.ts — Lightweight markdown→HTML renderer

/** Escape HTML entities */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** Inline markdown formatting: bold, italic, code, links */
export function inlineFormat(text: string): string {
    return text
        .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

export function renderChartSVG(code: string): string {
    try {
        const spec = JSON.parse(code);
        const data = Array.isArray(spec.data) ? spec.data : Array.isArray(spec.values) ? spec.values : [];
        if (!data.length) throw new Error('No data array found');

        const type = spec.type || 'line';
        const color = spec.color || '#a855f7';
        const title = spec.title || '';

        const isSpark = type === 'sparkline';
        const W = isSpark ? 120 : 400;
        const H = isSpark ? 30 : 160;
        const padX = isSpark ? 2 : 20;
        const padY = isSpark ? 4 : 20;
        const innerW = W - padX * 2;
        const innerH = H - padY * 2;

        const rawMin = Math.min(...data);
        const rawMax = Math.max(...data);
        const min = spec.min !== undefined ? spec.min : (type === 'bar' ? Math.min(0, rawMin) : rawMin);
        const max = spec.max !== undefined ? spec.max : rawMax;
        const range = max - min || 1;

        let content = '';

        if (type === 'bar') {
            const barW = Math.max(2, (innerW / data.length) * 0.8);
            const step = innerW / data.length;
            data.forEach((val: number, i: number) => {
                const norm = Math.max(0, Math.min(1, (val - min) / range));
                const h = norm * innerH;
                const x = padX + i * step + (step - barW) / 2;
                const y = padY + innerH - h;
                content += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, h)}" fill="${color}" rx="2" class="chart-bar" opacity="0.8"><title>${val}</title></rect>`;
            });
            content = `<line x1="${padX}" y1="${padY + innerH}" x2="${W - padX}" y2="${padY + innerH}" stroke="currentColor" opacity="0.2" stroke-width="1"/>` + content;
        } else {
            let d = '';
            const step = data.length > 1 ? innerW / (data.length - 1) : innerW;
            const points: string[] = [];

            data.forEach((val: number, i: number) => {
                const norm = Math.max(0, Math.min(1, (val - min) / range));
                const x = padX + i * step;
                const y = padY + innerH - norm * innerH;
                if (i === 0) d += `M ${x} ${y} `;
                else d += `L ${x} ${y} `;

                if (!isSpark && data.length <= 30) {
                    points.push(`<circle cx="${x}" cy="${y}" r="3" fill="var(--bg-primary)" stroke="${color}" stroke-width="2"><title>${val}</title></circle>`);
                }
            });

            if (type === 'area' || isSpark) {
                const bgD = d + `L ${padX + innerW} ${padY + innerH} L ${padX} ${padY + innerH} Z`;
                content += `
                    <defs>
                        <linearGradient id="g_${color.replace('#', '')}" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
                            <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
                        </linearGradient>
                    </defs>
                    <path d="${bgD}" fill="url(#g_${color.replace('#', '')})" />
                `;
            }

            content += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${isSpark ? 1.5 : 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
            if (!isSpark) content += points.join('');
        }

        let svg = `<svg viewBox="0 0 ${W} ${H}" width="${isSpark ? W + 'px' : '100%'}" height="${H}px" style="max-width:${W}px; max-height:${H}px; overflow:visible;" class="md-chart">`;
        svg += content;

        if (spec.labels && Array.isArray(spec.labels) && !isSpark) {
            svg += `<g font-size="10" fill="currentColor" opacity="0.6" text-anchor="middle">`;
            const step = spec.labels.length > 1 ? innerW / (spec.labels.length - 1) : innerW;
            spec.labels.forEach((lbl: string, i: number) => {
                const x = type === 'bar' ? padX + i * (innerW / spec.labels.length) + (innerW / spec.labels.length) / 2 : padX + i * step;
                if (spec.labels.length <= 10 || i % Math.ceil(spec.labels.length / 5) === 0 || i === spec.labels.length - 1) {
                    svg += `<text x="${x}" y="${H - 2}">${escapeHtml(String(lbl))}</text>`;
                }
            });
            svg += `</g>`;
        }
        svg += `</svg>`;

        let html = '';
        if (isSpark) {
            html = `<div class="md-data-block spark" style="display:inline-flex; align-items:center; gap:8px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; margin: 4px 6px; vertical-align: middle;">`;
            if (title) html += `<span style="font-size:12px; font-weight:500; color: var(--text-1);">${escapeHtml(title)}</span>`;
            html += svg;
            if (spec.value !== undefined) html += `<span style="font-size:12px; font-weight:600; color: ${color};">${escapeHtml(String(spec.value))}</span>`;
            html += `</div>`;
        } else {
            html = `<div class="md-data-block full" style="margin: 16px 0; background: var(--bg-2); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">`;
            if (title) {
                html += `<div class="md-chart-title" style="font-weight: 600; font-size: 13px; margin-bottom: 16px; color: var(--text-1); display:flex; justify-content:space-between; align-items:center;">`;
                html += `<span>${escapeHtml(title)}</span>`;
                if (spec.value !== undefined) html += `<span style="color: ${color}; font-size: 14px;">${escapeHtml(String(spec.value))}</span>`;
                html += `</div>`;
            }
            html += svg;
            html += `</div>`;
        }

        return html;
    } catch (e: any) {
        return `<div class="md-code-wrapper"><div class="md-chart-error" style="color:#ef4444; padding:8px; font-size: 12px; font-family: monospace;">[Visualization Error: ${e.message}]</div><pre><code>${escapeHtml(code)}</code></pre></div>`;
    }
}

/** Lightweight markdown → HTML for response bubbles */
export function renderMarkdown(text: string): string {
    // First extract code blocks to protect their content
    const codeBlocks: string[] = []
    text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_: string, lang: string, code: string) => {
        const idx = codeBlocks.length
        const langLabel = lang || 'text'

        if (['chart', 'sparkline', 'data'].includes(langLabel.toLowerCase())) {
            codeBlocks.push(renderChartSVG(code.trim()))
            return `\x00CODE${idx}\x00`
        }

        codeBlocks.push(
            `<div class="md-code-wrapper">` +
            `<div class="md-code-header"><span class="md-code-lang">${langLabel}</span><button class="md-copy-btn" data-code="${escapeHtml(code.trim()).replace(/"/g, '&quot;')}">Copy</button></div>` +
            `<pre class="md-code-block"><code class="lang-${langLabel}">${escapeHtml(code.trim())}</code></pre>` +
            `</div>`
        )
        return `\x00CODE${idx}\x00`
    })

    // Process line-by-line for block-level elements
    const lines = text.split('\n')
    const out: string[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Code block placeholder
        const codeMatch = line.match(/^\x00CODE(\d+)\x00$/)
        if (codeMatch) {
            out.push(codeBlocks[parseInt(codeMatch[1])])
            i++
            continue
        }

        // Headers
        const hMatch = line.match(/^(#{1,4})\s+(.+)/)
        if (hMatch) {
            const level = hMatch[1].length
            out.push(`<h${level} class="md-heading">${inlineFormat(hMatch[2])}</h${level}>`)
            i++
            continue
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            out.push('<hr class="md-hr">')
            i++
            continue
        }

        // Bullet lists (- or *)
        if (/^\s*[-*]\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
                i++
            }
            out.push('<ul class="md-list">' + items.map(it => `<li>${inlineFormat(it)}</li>`).join('') + '</ul>')
            continue
        }

        // Numbered lists
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const items: string[] = []
            while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
                i++
            }
            out.push('<ol class="md-list">' + items.map(it => `<li>${inlineFormat(it)}</li>`).join('') + '</ol>')
            continue
        }

        // Normal line with inline formatting
        if (line.trim()) {
            out.push(inlineFormat(line))
        } else {
            out.push('<br>')
        }
        i++
    }

    return out.join('\n')
}
