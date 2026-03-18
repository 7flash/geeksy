# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Fix `npx geeksy` SQLite path**~~ — ✅ DONE. The CLI now uses OS-native writable app-data directories, pre-creates the SQLite file, and passes an explicit `GEEKSY_DB_PATH` so npm-cache installs no longer fail with `unable to open database file`.
- [x] ~~**Fix models page key-change action**~~ — ✅ DONE. Switched model key actions to explicit delegated button handlers so `Change key`, save, cancel, remove, and Enter-to-save work reliably.
- [x] ~~**Stop repeated empty-response chat spam**~~ — ✅ DONE. `/api/chat` now stops after the first `LLM returned empty response` error instead of surfacing the same failure across all 10 agent iterations.
- [x] ~~**Audit remaining writable paths for npm CLI mode**~~ — ✅ DONE. Added `app/lib/paths.ts` and moved skills, backups, saved model keys, plugin install/update paths, and `.config.toml` lookups onto `GEEKSY_HOME` / `GEEKSY_APP_ROOT` aware locations.
- [x] ~~**Verify plugin install/update flows in packaged CLI mode**~~ — ✅ DONE. Smoke-tested plugin install, manifest/config reads, config save, and update handling under a custom `GEEKSY_HOME`; local/unpublished plugins now degrade gracefully when no npm registry version exists.
- [ ] **Smoke-test published npm plugin upgrades in packaged CLI mode** — The local-workspace path is covered now, but a real registry-backed plugin should still be tested through `bun add` / `bun update` in app-home mode.
- [ ] **Reduce heartbeat schedule-tool chatter** — Heartbeat now binds recurring schedules to the correct conversation, but it still emits noisy `schedule list` JSON messages into chat during idle auditing after the joke flow succeeds.
- [ ] **Fix planner output for recurring script schedules** — Hardened both Geeksy schedule validation and the local `smart-agent` planner prompt to reject `@geeky/core`, placeholder `declare getState/setState`, and non-inline state-helper variants. Remaining work is the final live browser proof that Proceed now writes one valid inline-`STATE_URL` script and creates exactly one clean interval schedule.
- [x] ~~**Add schedule guardrails for recurring scripts**~~ — ✅ DONE. The schedule tool now rejects scripts importing `@geeky/core`, auto-infers `interval` when an interval is provided, and the chat system prompt explicitly requires self-contained/inline-helper scheduled scripts.
- [x] ~~**Harden heartbeat + scheduler null-session reporting**~~ — ✅ DONE. Scheduler/heartbeat chat inserts now normalize nullable `sessionId` instead of crashing background reporting with Zod `Expected number, received null` errors.
- [x] ~~**Stop heartbeat `IDLE` ticks from crashing planner JSON parsing**~~ — ✅ DONE. Heartbeat no longer routes its `IDLE`-style tick prompt through session task planning; it now runs a direct agent response objective, eliminating `JSON Parse error: Unexpected identifier "IDLE"`.
- [x] ~~**Bind scheduled run output to the owning conversation**~~ — ✅ DONE. Heartbeat session picking now prefers the newest pending objective session and scopes its message history to that conversation, so background-created schedule rows and repeated script outputs land in the correct owning session (validated with session `16`).
- [x] ~~**Heartbeat paused state blocks queued follow-ups**~~ — ✅ DONE. Heartbeat now persists pause reasons (`manual`, `circuit_breaker`, `none`) and auto-clears legacy paused state with queued work on startup instead of silently stalling follow-ups.

## 🟡 Priority: Improve
- [x] ~~**Remove objectives timeline tab and show version badge**~~ — ✅ DONE. Removed the Objectives tab and metrics (objectives now live in chat confirmation cards); added a fixed version+commit badge to the bottom-right corner of the page.
- [x] ~~**Show CLI version/commit on startup**~~ — ✅ DONE. `npx geeksy` now prints version, commit (when available), and active home/db/skills paths before launching Bun.
- [x] ~~**Heartbeat follow-up UI**~~ — ✅ DONE. Tooltip now shows pending follow-ups list with reasons, countdown timers, and context. Purple badge on heartbeat button when follow-ups queued. API returns full follow-up items.
- [ ] **Heartbeat follow-up live test** — Test with a real user interaction to verify the 2-minute auto-scheduled follow-up flows through correctly.

## 🟢 Priority: Features
- [x] ~~**Heartbeat-owned objective validation loop**~~ — ✅ DONE. Objectives now persist planner params plus validation/reporting metadata, and heartbeat deterministically validates common objective types (`file_exists`, `file_contains`, `command_succeeds`, `command_output_contains`, `task_scheduled`) in separate turns and reports newly completed objectives back into chat.
- [x] ~~**Secrets Infrastructure & UI**~~ — ✅ DONE. Implemented file-backed secrets storage (`.geeksy-secrets.json`), `/api/secrets` CRUD routes, a Settings → Secrets manager with masked values, and `/api/secrets/submit` for secure in-chat secret submission without rendering plaintext back into the thread.
- [x] ~~**ask_user_for_secret Tool**~~ — ✅ DONE. Added `request_secret` + `get_secret` tools to chat sessions so the agent can request a masked secret input in-thread and later retrieve the stored value without asking the user to paste it in plain chat.
- [ ] **Live browser-proof the masked secret request flow** — Verify end-to-end in the web UI that a `request_secret` tool call renders the masked chat card, `Save & continue` resumes the bound conversation, and no raw secret value leaks into visible chat/tool output.
- [x] ~~**Live tool execution cards with progress + spoilers**~~ — ✅ DONE. Tool cards now show `$ command` for shell ops, animated progress bar while running, elapsed time on completion, collapsible output spoilers, and red-highlighted error output.
- [x] ~~**Clarify objective review UX before commit**~~ — ✅ DONE. The confirmation card now shows each proposed objective with icon/name/description, switches to the Objectives tab, and offers clear Proceed/Reject buttons so the user sees exactly what the agent plans to do before execution starts.
- [x] ~~**Skill-catalog discovery → install → objective-review workflow**~~ — ✅ DONE. Added `search_skills` and `install_skill` agent tools that search installed skills, marketplace, and plugin registry; wired into chat, heartbeat, and Telegram; system prompt instructs agent to discover before executing.
- [x] ~~**Persist artifact contents, not just filenames**~~ — ✅ DONE. Files tab now has clickable items that expand to show full file content via `/api/files`, with language hints, size info, truncation badges, and scrollable preview panes.
- [x] ~~**Heartbeat validation for scheduled automation outputs**~~ — ✅ DONE. Heartbeat now deterministically audits failed schedules, dedupes by failure fingerprint, and posts one concise chat alert per new failure state even without needing the LLM path.
- [x] ~~**Isolate heartbeat/scheduler tests from the live SQLite DB**~~ — ✅ DONE. `app/lib/db.ts` now auto-switches Bun test runs onto a temp SQLite file unless `GEEKSY_DB_PATH` is explicitly set, so local verification no longer pollutes the live app DB.
- [x] ~~**Persist schedule execution policy + output validation**~~ — ✅ DONE. Schedules now persist timeout/retry/output-validation policy, the scheduler enforces expected-output + fail-on-stderr checks centrally, and the API/UI/tooling expose that policy back to the user.
- [x] ~~**Report scheduled failures back into chat**~~ — ✅ DONE. Scheduler now persists last reported state and emits chat alerts for failed one-off, interval, cron, and sequential tasks without endlessly repeating the same failure.
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
- [x] ~~**Live-check the new session placeholders in browser/mobile**~~ — ✅ DONE. Browser pass caught session count grammar issues (`1 message` vs `1 messages`); fixed both SSR and client-rendered session rows while confirming the empty/loading states remain readable.
- [x] ~~**Prepare production deployment runbook**~~ — ✅ DONE. Added `docs/DEPLOY.md` with the fastest reliable bgrun + env + Caddy deployment path.
- [x] ~~**Make Geeksy runnable via npx/bunx**~~ — ✅ DONE. Added a real CLI bin, switched package dependencies off local paths, and verified the package tarball is runnable-friendly.
- [x] ~~**Publish updated Geeksy npm release**~~ — ✅ DONE. Published `geeksy@1.0.0` to npm; `npx geeksy@1.0.0` now resolves the real CLI while `latest` may take a moment to catch up in caches.
- [ ] **Verify `npx geeksy` latest-tag/cache propagation** — Confirm plain `npx geeksy` resolves `1.0.0` after registry/client caches catch up, not just `npx geeksy@1.0.0`.
- [ ] **Trim npm package contents** — The tarball still ships extra files that should probably be excluded before release.
- [ ] **Move production secrets out of tracked local config** — Production secrets should live in env vars or server-local files, not repo-local config.
- [ ] **Deploy Geeksy to the target server** — Needs the actual server/domain access details to run the deployment.

## 📝 Architecture Notes
- **Stack**: Melina.js (Bun), smart-agent-ai, SQLite (sqlite-zod-orm)
- **Secrets**: file-backed JSON store at `.geeksy-secrets.json` via `app/lib/secrets.ts`; chat uses `request_secret` / `get_secret` tools plus `/api/secrets` and `/api/secrets/submit` routes so secret values do not need to appear in plain chat.
- **CLI/app paths**: `app/lib/paths.ts` centralizes `GEEKSY_HOME`, `GEEKSY_APP_ROOT`, skills, backups, config, and saved-key locations for packaged CLI mode.
- **Heartbeat**: Adaptive 30s–5min interval, circuit breaker, follow-up queue
- **Dashboard**: `app/page.client.tsx` → modules: heartbeat-ui, metrics-ui, sessions-ui, agents, search-ui, panels
- **CSS**: modular app/css files compiled into globals.css
- **Plugins**: geeksy-plugin.json manifest, Telegram gateway, Pumpfun Trading
- **Tests**: 21 passing (heartbeat stats + follow-up system + drain lifecycle) — `bun test`
