# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
- [x] **joke-sender.ts double-path URL bug** — Fixed: `STATE_URL` used directly instead of appending duplicate path.
- [x] **Scheduler stale test tasks** — Cancelled `random-joke-task` (ID 16) and `fun-fact-task` (ID 17) in DB.
- [ ] **TypeScript compilation errors** — `npx tsc --noEmit` shows duplicate identifier errors from `jsx-ai` JSX runtime conflicting with other React/JSX type declarations. Need to fix tsconfig or type resolution.
- [ ] **CSS file is 87KB monolith** — `globals.css` at 87,672 bytes is massive and unmaintainable. Extract into modular CSS files: `base.css`, `chat.css`, `sidebar.css`, `panels.css`, `overview.css`, etc.

## 🟡 Priority: Improve
- [ ] **Heartbeat reliability** — Heartbeat module consumes API tokens even when paused if not properly guarded. Verify pause/resume state persistence across server restarts.
- [ ] **Telegram bot error handling** — `tg-bot.ts` has basic error recovery but messages can be lost during reconnection. Add message queue with retry.
- [ ] **Client code modularization** — `page.client.tsx` (22KB) and `page.tsx` (10KB) mix concerns. Extract chat rendering, panel management, and event handling into focused modules.
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
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Chat UI**: `app/lib/chat-ui.tsx`, `app/lib/events.ts` (SSE handler), `app/lib/agents.tsx` (CRUD)
- **Telegram**: `app/lib/tg-bot.ts` — BotFather bot gateway, relays to active AI session, shared history with web UI
- **Scheduler**: `app/api/schedule/scheduler.ts` — supports `once`, `interval`, `sequential`, and `cron` task types
- **Deploy**: `scp` to server + `systemctl restart geeksy` (systemd managed)
