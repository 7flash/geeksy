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

## 🚧 New Tasks
- [x] ~~**Chat-native schedule tool for prompts + cron**~~ — ✅ DONE. `app/lib/schedule-tool.ts` now supports both `message`-based schedules and `scriptPath` schedules with `once`, `interval`, and `cron` task types.
- [x] ~~**Session-scoped objectives/files timeline**~~ — ✅ DONE. Added optional `sessionId` persistence for objectives/files, scoped `/api/state` by session, and rehydrate objectives/files when switching sessions so each conversation has isolated state.
- [x] ~~**Fix heartbeat schedule visibility**~~ — ✅ DONE. `heartbeat.ts` now treats agent-scoped `pending` and `running` schedule rows as active work, so scheduled jobs are visible to heartbeat reasoning.
- [x] ~~**Show next-run details after schedule creation**~~ — ✅ DONE. Created schedules now get a clean `Schedule Created` chat card with cadence, target, cancel info, and exact next-run timestamp from scheduler state.
- [x] ~~**Decide global vs session metrics/export behavior**~~ — ✅ DONE. `/api/metrics` and `/api/agent-export` now support optional `sessionId`, keeping global behavior by default while allowing session-scoped messages/objectives/files when requested.
- [x] ~~**Surface session-scoped metrics in UI**~~ — ✅ DONE. `metrics-ui.ts` now sends `sessionId` to `/api/metrics` using `getActiveSessionId()`, and `sessions-ui.ts` emits `geeksy:session-changed` so counters refresh immediately when you switch conversations.
- [x] ~~**Session-aware schedule persistence**~~ — ✅ DONE. Added optional `sessionId` to `schedules`, threaded it through creation/listing/cancellation, and wired chat + Telegram schedule creation to the active session.
- [x] ~~**Session-scoped schedule filtering in UI**~~ — ✅ DONE. `fetchSchedules()` now requests `/api/schedule?sessionId=...` for the active conversation and schedule-related chat polling uses session-scoped `/api/state` reads.
- [x] ~~**Simplify Geeksy UI around one primary workflow**~~ — ✅ DONE. The main screen is now centered on sessions + chat with only 3 core tabs (Objectives, Files, Schedule), a reduced metrics bar, and clearer session-first copy.
- [x] ~~**Immediate metrics refresh after send completion**~~ — ✅ DONE. Added a `geeksy:refresh-metrics` event; `sendMessage()` dispatches it after completion and `metrics-ui.ts` refreshes the top bar immediately. Verified live in the browser.
- [x] ~~**Scheduled chat execution reliability on restart**~~ — ✅ DONE. `scheduler.ts` now retries chat-based schedule execution on transient server/network failures and includes `dbSessionId` when scheduled chats run.
- [x] ~~**Continue visual cleanup of nav + sessions list**~~ — ✅ DONE. Applied a calmer header/sidebar pass with lighter chrome, clearer session-first copy, and a quieter metrics strip so the main workspace feels less noisy.
- [x] ~~**Prune or hide low-value nav destinations**~~ — ✅ DONE. Demoted side-system destinations in the rail into a calmer `More` group and kept `Main` as the obvious primary destination.
- [x] ~~**Simplify session list actions**~~ — ✅ DONE. Replaced always-visible delete controls with a calmer overflow menu so session rows feel selectable first and destructive actions are no longer shouting.
- [x] ~~**Unify session creation language**~~ — ✅ DONE. Standardized the UI around conversations instead of mixed session/chat/bot wording across the main workflow and creation flow.
- [ ] **Tighten session empty/loading states** — The empty and first-load states still need to match the calmer product direction.
- [x] ~~**Prepare production deployment runbook**~~ — ✅ DONE. Added `docs/DEPLOY.md` with the fastest reliable bgrun + env + Caddy deployment path.
- [x] ~~**Make Geeksy runnable via npx/bunx**~~ — ✅ DONE. Added a real CLI bin, switched package dependencies off local paths, and verified the package tarball is runnable-friendly.
- [ ] **Publish updated Geeksy npm release** — The new CLI won’t reach `npx geeksy` users until the package is published to npm.
- [ ] **Trim npm package contents** — The tarball still ships extra files that should probably be excluded before release.
- [ ] **Move production secrets out of tracked local config** — Production secrets should live in env vars or server-local files, not repo-local config.
- [ ] **Deploy Geeksy to the target server** — Needs the actual server/domain access details to run the deployment.

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **CSS**: modular app/css files compiled into globals.css
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 21 passing (heartbeat stats + follow-up system + drain lifecycle) — `bun test`
