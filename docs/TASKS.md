# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- (none currently)

## 🟡 Priority: Improve
- [x] ~~**Heartbeat follow-up UI**~~ — ✅ DONE. Tooltip now shows pending follow-ups list with reasons, countdown timers, and context. Purple badge on heartbeat button when follow-ups queued. API returns full follow-up items.
- [ ] **Heartbeat follow-up live test** — Test with a real user interaction to verify the 2-minute auto-scheduled follow-up flows through correctly.

## 🟢 Priority: Features
- [x] ~~**Heartbeat follow-up system**~~ — ✅ DONE. `scheduleFollowUp()` + `drainFollowUps()` in heartbeat.ts. Chat route auto-schedules 2min follow-up after tool-heavy agent responses. API supports manual scheduling via POST.
- [x] ~~**Follow-up queue persistence**~~ — ✅ DONE. Added `followUps` table schema to `db.ts`. Refactored `heartbeat.ts` to use SQLite instead of in-memory queue. Survives server restarts. Tested and covered by `heartbeat.test.ts`.
- [x] ~~**Expose follow-up status via API**~~ — ✅ DONE. Added `GET /api/follow-ups` to fetch all ordered follow-ups and `DELETE /api/follow-ups` to remove by id or clear all. Tested with `route.test.ts`.
- [x] ~~**Heartbeat action history**~~ — ✅ DONE. Plumbed `data.lastToolCalls` up to the `heartbeat-ui.ts` floating tooltip to display exactly what the agent did historically (up to 5 events) in a timeline style.
- [ ] **Heartbeat live scheduling test** — Send a tool-heavy message, verify the framework schedules a 2-minute follow-up tick, and then observe the background bot act on the pending item when the scheduled delay completes.

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 16 passing (heartbeat stats + follow-up system) — `bun test`
