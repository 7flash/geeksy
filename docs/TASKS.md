# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- (none currently)

## 🟡 Priority: Improve
- [x] ~~**Heartbeat follow-up UI**~~ — ✅ DONE. Tooltip now shows pending follow-ups list with reasons, countdown timers, and context. Purple badge on heartbeat button when follow-ups queued. API returns full follow-up items.
- [ ] **Heartbeat follow-up live test** — Test with a real user interaction to verify the 2-minute auto-scheduled follow-up flows through correctly.

## 🟢 Priority: Features
- [x] ~~**Heartbeat follow-up system**~~ — ✅ DONE. `scheduleFollowUp()` + `drainFollowUps()` in heartbeat.ts. Chat route auto-schedules 2min follow-up after tool-heavy agent responses. API supports manual scheduling via POST.
- [ ] **Follow-up queue persistence** — Follow-ups are in-memory only. Consider persisting to SQLite so they survive server restarts.
- [ ] **Heartbeat action history** — Show last 5 heartbeat actions in the tooltip (what the agent did/checked).

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 16 passing (heartbeat stats + follow-up system) — `bun test`
