# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Fix `npx geeksy` SQLite path**~~ — ✅ DONE. The CLI now uses OS-native writable app-data directories, pre-creates the SQLite file, and passes an explicit `GEEKSY_DB_PATH` so npm-cache installs no longer fail with `unable to open database file`.
- [x] ~~**Fix models page key-change action**~~ — ✅ DONE. Switched model key actions to explicit delegated button handlers so `Change key`, save, cancel, remove, and Enter-to-save work reliably.
- [x] ~~**Stop repeated empty-response chat spam**~~ — ✅ DONE. `/api/chat` now stops after the first `LLM returned empty response` error instead of surfacing the same failure across all 10 agent iterations.
- [ ] **Audit remaining writable paths for npm CLI mode** — Some config/plugin paths still rely on `process.cwd()` semantics and should be reviewed against `GEEKSY_HOME` / `GEEKSY_DB_PATH` packaged CLI usage.

## 🟡 Priority: Improve
- [x] ~~**Show CLI version/commit on startup**~~ — ✅ DONE. `npx geeksy` now prints version, commit (when available), and active home/db/skills paths before launching Bun.
- [x] ~~**Heartbeat follow-up UI**~~ — ✅ DONE. Tooltip now shows pending follow-ups list with reasons, countdown timers, and context. Purple badge on heartbeat button when follow-ups queued. API returns full follow-up items.
- [ ] **Heartbeat follow-up live test** — Test with a real user interaction to verify the 2-minute auto-scheduled follow-up flows through correctly.

## 🟢 Priority: Features
- [ ] **Heartbeat-owned objective validation loop** — Objectives should persist as longer-lived items with their own validation scripts/checks; casual conversation should not churn objectives, chat should only propose/update them when needed, new objectives should be shown to the user for review before commit, and heartbeat should execute validations in separate turns and report results back to the user.
- [ ] **Live tool execution cards with progress + spoilers** — Smart-agent tool usage should show what is happening right now (especially bash/file tools), including the active command/path, running/progress state, a clearer in-progress label, and a collapsible spoiler/details view for command output.
- [ ] **Clarify objective review UX before commit** — New objectives already pause for confirmation in the session layer, but the web UI should make that review state obvious instead of feeling like silent objective churn.
- [ ] **Skill-catalog discovery → install → objective-review workflow** — For requests that need a missing capability (e.g. YouTube ingestion/transcripts), Geeksy should first search available skills/plugins, offer the best install option to the user, wait for confirmation, then propose objectives, wait for objective confirmation, and only then begin multi-iteration execution.
- [ ] **Persist artifact contents, not just filenames** — Files/scripts created by the agent should be visible from the Files tab with readable content previews/full views, not just path names or touch history.
- [ ] **Heartbeat validation for scheduled automation outputs** — Long-running automations should attach validation checks (e.g. stderr stays empty, expected markdown/transcript artifacts are produced) that heartbeat evaluates and reports back to the user.
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
- [x] ~~**Tighten session empty/loading states**~~ — ✅ DONE. Added calmer sidebar/chat placeholders for first load, no-conversation onboarding, and empty conversations, including clearer CTA/prompt chips.
- [ ] **Live-check the new session placeholders in browser/mobile** — The calmer empty/loading states should still get a quick visual pass on desktop + narrow layouts.
- [x] ~~**Prepare production deployment runbook**~~ — ✅ DONE. Added `docs/DEPLOY.md` with the fastest reliable bgrun + env + Caddy deployment path.
- [x] ~~**Make Geeksy runnable via npx/bunx**~~ — ✅ DONE. Added a real CLI bin, switched package dependencies off local paths, and verified the package tarball is runnable-friendly.
- [x] ~~**Publish updated Geeksy npm release**~~ — ✅ DONE. Published `geeksy@1.0.0` to npm; `npx geeksy@1.0.0` now resolves the real CLI while `latest` may take a moment to catch up in caches.
- [ ] **Verify `npx geeksy` latest-tag/cache propagation** — Confirm plain `npx geeksy` resolves `1.0.0` after registry/client caches catch up, not just `npx geeksy@1.0.0`.
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
