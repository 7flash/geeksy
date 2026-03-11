# Geeksy — Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Session auto-load broken**~~ — ✅ DONE. `initSessionUI()` called without `await` in page.client.tsx. Fixed by sequencing `restoreState()` then `initSessionUI()` in async IIFE.
- [x] ~~**Plugins page rendering "null"**~~ — ✅ DONE. `PluginsPage` was async — the self-fetch to localhost:3737 deadlocked Bun's single-threaded server. Made component sync, removed self-fetch.
- [x] ~~**Duplicate chat message bubbles**~~ — ✅ DONE. Message polling (3s interval) re-rendered messages that `sendMessage()` already appended. Added `__geeksy_isRunning` window flag to pause polling during active processing.
- [ ] **Raw JSON tool calls leak into chat** — AI sometimes outputs `[{"tool":"exec",...}]` as rendered code blocks. `cleanThinkingText()` strips fenced JSON but streaming deltas render before cleanup. Need to suppress code blocks containing tool call JSON during streaming.
- [ ] **Telegram bot conversation flow freezes** — Conversation gets stuck at a long AI warning/disclaimer response. The bot should be more concise and action-oriented.

## 🟡 Priority: Improve
- [x] ~~**Default system prompt**~~ — ✅ DONE. Added `DEFAULT_SYSTEM_PROMPT` in chat/route.ts — teaches AI to be concise, use Bun/TypeScript, `Get-Date` for time, use bgrun for processes.
- [ ] **Telegram session read-only in web** — Sessions created via Telegram bot should display messages but disable the web chat input. Show banner: "This session is managed via Telegram."
- [ ] **Timeline tab: newest objectives on top** — Objectives currently render oldest-first. Should reverse order so newest appear at top.
- [ ] **Plugins page: fetch registry client-side** — Registry currently shows empty. Add client-side fetch to `/api/plugins/registry` in a mount script for the plugins page.

## 🟢 Priority: Features
- [ ] **Browserbase plugin** — Add Browserbase to plugin registry. Plugin should: install CLI, provide config wizard for project ID + API key, install browser skill, and teach agent to use it.
- [ ] **Session types with gateways** — Each session has a `type` (web, telegram, api). The gateway determines where messages flow. Web sessions chat in browser, telegram sessions route through bot.

## 📝 Architecture Notes
- **Framework**: Melina.js (Bun-native, file-based routing)
- **Agent runtime**: smart-agent-ai (Session/Agent with Classifier-Planner-Executor pipeline)
- **Port**: 3737 (configured via BUN_PORT)
- **DB**: SQLite via sqlite-zod-orm (agents, sessions, messages, objectives, plugins, files, skills)
- **Plugins**: geeksy-pumpfun-plugin (port 3457), geeksy-telegram-plugin (port 3738)
- **Client**: jsx-dom rendering with direct DOM manipulation, SSE streaming for chat events
