# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- [ ] **Metrics bar shows 0/0 plugins** — `db.plugins` table is empty on production because auto-discover doesn't find sibling plugin dirs on the server. Skills show plugins fine but metrics doesn't count them. Fix: either seed `db.plugins` from skills on boot, or refactor metrics to count skill-backed plugins.

## 🟡 Priority: Improve
- [x] ~~**Heartbeat follow-up UI**~~ — ✅ DONE. Tooltip with pending follow-ups, countdown timers, purple badge.
- [x] ~~**Heartbeat follow-up live test**~~ — ✅ DONE. 6 integration tests for drain lifecycle. 21 tests total.

## 🟢 Priority: Features (Completed)
- [x] ~~**Heartbeat follow-up system**~~ — ✅ DONE. `scheduleFollowUp()` + `drainFollowUps()` with SQLite persistence.
- [x] ~~**Follow-up queue persistence**~~ — ✅ DONE. `followUps` table in db.ts, survives restarts.
- [x] ~~**Expose follow-up status via API**~~ — ✅ DONE. GET/DELETE `/api/follow-ups`.
- [x] ~~**Heartbeat action history**~~ — ✅ DONE. Last 5 tool calls in floating tooltip timeline.
- [x] ~~**Heartbeat live scheduling test**~~ — ✅ DONE. Integration tests with `_drainFollowUps()`.
- [x] ~~**Conversation search**~~ — ✅ DONE. Ctrl+K modal (`search-ui.ts` + `/api/search`), keyword highlight, arrow key navigation, scroll-to-message.
- [x] ~~**Plugin health monitoring**~~ — ✅ DONE. Metrics bar shows running/total with green/amber/red, per-plugin tooltip with response time and errors.
- [x] ~~**Mobile dashboard**~~ — ✅ DONE. 344-line `mobile.css` with bottom tab bar, sidebar drawer, safe area insets, responsive grids.

## 🟢 Priority: Features (Open)
- [ ] **Stale session cleanup** — Dashboard shows several Telegram sessions with 0 messages. Add a "🗑 Clean empty sessions" button or auto-prune sessions with 0 messages after 24h.
- [ ] **Heartbeat cost tracking** — Track cumulative token usage from heartbeat ticks and show in metrics bar tooltip. Currently heartbeat consumes tokens every 135s but there's no visibility into total cost.
- [ ] **Session search** — Currently Ctrl+K searches messages within a session. Add the ability to search across all sessions by title/content.

## 🟢 Priority: Features (Completed)
- [x] ~~**Calendar view for schedules**~~ — ✅ DONE. 7-day grid with CSS classes (`.cal-*`), today highlight with accent glow, interval/cron task deduplication (shows on every day), status-colored task chips (pending/running/completed/failed/cancelled), Today navigation button, week task count, click-to-list-view. 190 lines CSS in `panels.css`.
- [x] ~~**Agent memory inspector**~~ — ✅ DONE. Full CRUD: search/filter across keys+values, inline edit with save/cancel, "+ Add" form for new entries, JSON export download, byte-size stats, grouped by key prefix. 190 lines CSS (`.memory-toolbar`, `.memory-search`, `.memory-add-form`, `.memory-edit-btn`, `.memory-save-btn`).
- [x] ~~**Webhook triggers**~~ — ✅ DONE. `POST /api/webhooks?token=whk_...` endpoint with auto-detection for GitHub (push/PR/issues/star/release), Stripe (payments/subscriptions/invoices), GitLab events. Token-based auth, event filtering, fire-and-forget chat delivery. Settings UI with create/delete/list. Persisted in agentState. 280 lines route + 130 lines settings UI.
- [x] ~~**Multi-agent conversations**~~ — ✅ DONE. `send_message_to_agent` tool lets agents message each other by name. Messages attributed with sender, delivered via `/api/chat` (fire-and-forget), logged in messages table. Tool wired into chat, heartbeat, and tg-bot sessions. REST API at `/api/agent-message` for programmatic use. 80 lines tool + 110 lines route.
- [x] ~~**Heartbeat prompt optimization**~~ — ✅ DONE. Sections-only prompt builder: skips empty objectives/plugins/schedules/follow-ups. Quiet ticks send 8-token "No pending items" instead of 500-token boilerplate. ~50% token savings on idle ticks.
- [x] ~~**Conversation export**~~ — ✅ DONE. `GET /api/conversations/export?sessionId=X&format=md|json`. Markdown with role headers + timestamps. 📥 button on each session card downloads .md file.
- [x] ~~**Plugin auto-discovery**~~ — ✅ DONE. `discoverPlugins()` in `auto-discover.ts` scans sibling code dirs for `geeksy-plugin.json` on server boot. Auto-registers any unregistered plugins with name, port, icon from manifest. Non-blocking.

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **CSS**: 10 files (base, nav, sidebar, chat, panels, search, sessions, plugins, pages, mobile)
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 21 passing (heartbeat stats + follow-up system + drain lifecycle) — `bun test`
