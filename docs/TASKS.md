# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- (none currently)

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
- [ ] **Calendar view for schedules** — Visual 7-day grid showing scheduled tasks with time slots.
- [ ] **Agent memory inspector** — UI to view/edit/export the agent's `core_memory` and semantic embeddings.
- [ ] **Webhook triggers** — HTTP POST endpoint that triggers agent actions (for external integrations like GitHub webhooks, Stripe events).
- [ ] **Multi-agent conversations** — Allow agents to message each other for collaborative task completion.

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **CSS**: 10 files (base, nav, sidebar, chat, panels, search, sessions, plugins, pages, mobile)
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 21 passing (heartbeat stats + follow-up system + drain lifecycle) — `bun test`
