#!/usr/bin/env bun
/**
 * build-css.ts — Concatenates modular CSS files into globals.css
 * 
 * Usage: bun run build:css
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CSS_DIR = join(import.meta.dir, 'app', 'css');
const OUTPUT = join(import.meta.dir, 'app', 'globals.css');

// Ordered list of CSS modules (order matters for cascade)
const ORDER = [
    'base.css',
    'pages.css',
    'nav.css',
    'sidebar.css',
    'chat.css',
    'panels.css',
    'plugins.css',
    'sessions.css',
];

const header = `/* Geeksy Personal OS — globals.css
 * AUTO-GENERATED from app/css/*.css — do not edit directly.
 * Run: bun run build:css
 */\n\n`;

const parts: string[] = [header];

for (const file of ORDER) {
    const filePath = join(CSS_DIR, file);
    try {
        const content = readFileSync(filePath, 'utf-8');
        parts.push(`/* ═══ ${file} ═══ */\n`);
        parts.push(content.trim());
        parts.push('\n\n');
    } catch (e) {
        console.error(`Missing CSS module: ${file}`);
        process.exit(1);
    }
}

writeFileSync(OUTPUT, parts.join(''));
const sizeKB = (Buffer.byteLength(parts.join('')) / 1024).toFixed(1);
console.log(`✅ Built globals.css (${sizeKB}KB) from ${ORDER.length} modules`);
