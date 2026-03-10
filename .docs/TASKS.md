# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
- [x] **joke-sender.ts double-path URL bug** — Fixed: `STATE_URL` used directly instead of appending duplicate path.
- [x] **Scheduler stale test tasks** — Cancelled `random-joke-task` (ID 16) and `fun-fact-task` (ID 17) in DB.
- [x] ~~**Sidebar overlapping chat header**~~ — ✅ DONE. `.gateway-page > .main-area` now uses `grid-column: 3 / -1` instead of inheriting `2 / -1` from generic `.main-area`. Session sidebar correctly occupies column 2, main area column 3.
- [x] ~~**TypeScript compilation errors**~~ — ✅ DONE. Only 1 error: `el.dataset` on `Element` instead of `HTMLElement` in `page.client.tsx:91`. Cast fix applied. `npx tsc --noEmit` now passes cleanly.
- [x] ~~**CSS file is 87KB monolith**~~ — ✅ DONE. Split into 8 modular files under `app/css/`: base (1.7KB), pages (13.6KB), nav (1.4KB), sidebar (3.2KB), chat (21.6KB), panels (30.1KB), plugins (14.1KB), sessions (7.9KB). `globals.css` auto-generated via `bun run build:css`.
- [x] ~~**API key not persisting across restarts**~~ — ✅ Already implemented. Keys saved to `.geeksy-keys.json` via `loadKeys()`/`saveKeys()`. Applied to `process.env` on module load via `applyKeys()`. File is gitignored, so production keys don't leak. User needs to configure keys via `/models` page after fresh deploy.
- [x] ~~**Plugins page 500 error**~~ — ✅ DONE. `Object.entries(vnode.props)` in Melina SSR `head.ts` crashed when props was null. Fixed with `|| {}` guard. Published `melina@2.5.2`, deployed to server.
- [x] ~~**Server OOM crashes**~~ — ✅ DONE. Added 2GB swap file to prevent Linux OOM killer from terminating bun processes on the 2GB RAM VPS.

## 🟡 Priority: Improve
- [x] ~~**Heartbeat reliability**~~ — ✅ DONE. Added 3 guards: (1) API key check — silently skips if no LLM keys configured, (2) work check — only makes LLM calls when pending objectives/plugins/schedules exist, (3) dynamic prompt instead of hardcoded PumpFun/Telegram instructions. Telemetry now tracks `totalSkips` and `skipped` state.
- [x] ~~**Telegram bot error handling**~~ — ✅ DONE. Added outbound message queue with 3 retries + exponential backoff. Handles 429 rate limits with `retry_after`. Polling has exponential backoff on errors (up to 60s). No-token polling reduced to 30s.
- [x] ~~**Client code modularization**~~ — ✅ DONE. `page.client.tsx` split from 474→105 lines. Extracted `sessions-ui.ts`, `heartbeat-ui.ts`, `metrics-ui.ts`.
- [x] **Remove stale scheduled tasks from DB** — Done: cancelled in DB directly.

## 🟢 Priority: Features
- [ ] **Agent conversation search improvements** — Ctrl+K search only searches visible messages. Extend to search SQLite message history.
- [ ] **Plugin health monitoring** — Show real-time plugin status (response time, error rate) in the dashboard metrics bar.
- [ ] **Responsive mobile layout** — Current UI is desktop-first. Optimize panels and sidebar for mobile breakpoints.

## 📝 Architecture Notes
- **Architecture**: Single Gateway — all communication flows through one chat interface (web + telegram bot). Shared message history, not per-agent.
- **Heartbeat**: Uses `smart-agent-ai` sessions. Runs every 60s, checks that all objectives of running agents are being completed. Auto-prunes at 200 messages. Paused state persists across restarts.
- **Framework**: Melina.js (file-router, SSR + client mount)
- **Port**: 3737 (default)
- **Database**: `geeksy.db` — agents, messages, objectives, files, schedules, agentState, plugins (sqlite-zod-orm)
- **Production**: `root@202.155.132.139:/root/geeksy/` — managed by bgrun (not systemd), git-based deploy
- **Deploy**: `git push` → bgrun dashboard fetch + restart (or `bgrun --restart geeksy --fetch`)
- **DNS**: geeksy.xyz → 202.155.132.139 (A record), HTTPS via Caddy reverse proxy
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Chat UI**: `app/lib/chat-ui.tsx`, `app/lib/events.ts` (SSE handler), `app/lib/agents.tsx` (CRUD)
- **Telegram**: `app/lib/tg-bot.ts` — BotFather bot gateway, relays to active AI session, shared history with web UI
- **Scheduler**: `app/api/schedule/scheduler.ts` — supports `once`, `interval`, `sequential`, and `cron` task types
