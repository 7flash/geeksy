# Geeksy - Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Fix `npx geeksy` SQLite path**~~ - ✅ DONE. The CLI now uses OS-native writable app-data directories, pre-creates the SQLite file, and passes an explicit `GEEKSY_DB_PATH` so npm-cache installs no longer fail with `unable to open database file`.
- [x] ~~**Fix models page key-change action**~~ - ✅ DONE. Switched model key actions to explicit delegated button handlers so `Change key`, save, cancel, remove, and Enter-to-save work reliably.
- [x] ~~**Stop repeated empty-response chat spam**~~ - ✅ DONE. `/api/chat` now stops after the first `LLM returned empty response` error instead of surfacing the same failure across all 10 agent iterations.
- [x] ~~**Audit remaining writable paths for npm CLI mode**~~ - ✅ DONE. Added `app/lib/paths.ts` and moved skills, backups, saved model keys, plugin install/update paths, and `.config.toml` lookups onto `GEEKSY_HOME` / `GEEKSY_APP_ROOT` aware locations.
- [x] ~~**Verify plugin install/update flows in packaged CLI mode**~~ - ✅ DONE. Smoke-tested plugin install, manifest/config reads, config save, and update handling under a custom `GEEKSY_HOME`; local/unpublished plugins now degrade gracefully when no npm registry version exists.
- [ ] **Smoke-test published npm plugin upgrades in packaged CLI mode** - The local-workspace path is covered now, but a real registry-backed plugin should still be tested through `bun add` / `bun update` in app-home mode.
- [x] ~~**Fix planner STATE_URL template for scheduled scripts**~~ — ✅ DONE. System prompt now includes exact inline STATE_URL helper template. Agent exec tool gets STATE_URL/AGENT_ID/SESSION_ID env vars automatically. Schedule validator gives specific errors for missing function definitions. smart-agent-ai upgraded to v2.5.1 with env passthrough + graceful empty planner fallback.
- [x] ~~**Reduce heartbeat schedule-tool chatter**~~ - ✅ DONE. Tightened `isHeartbeatChatNoise(...)` to suppress raw JSON and low-signal schedule boilerplate, then live-verified that new heartbeat ticks no longer persisted fresh `list_dir` / raw tool-JSON chatter into conversation history.
- [x] ~~**Unstick heartbeat auto-pruning**~~ - ✅ DONE. Replaced the hanging LLM-driven prune path with deterministic message trimming, restoring live heartbeat ticks (`totalTicks` resumed) and preventing `isRunning=true` from getting stuck forever during pruning.
- [x] ~~**Improve heartbeat pruning quality beyond blunt message trimming**~~ - ✅ DONE. Heartbeat pruning now writes a deterministic `core_memory` summary plus `core_memory_updated_at` into `agentState` before trimming old messages, so pruning preserves recent user topics, assistant outputs, pending objectives, schedules, and follow-ups.
- [x] ~~**Surface heartbeat core memory somewhere user-visible**~~ — ✅ DONE. The Memory pane now pins `core_memory` as a dedicated `Heartbeat Core Memory` card with its last-updated timestamp, while leaving the rest of agent state grouped below it.
- [x] ~~**Make heartbeat core memory session-aware**~~ — ✅ DONE. Heartbeat pruning now stores conversation-scoped keys like `core_memory.session.<id>` / `core_memory_updated_at.session.<id>`, and the Memory pane prefers the active session's retained summary while showing its session provenance.
- [x] ~~**Strip planner/objective/timeline leakage from main chat UI**~~ — ✅ DONE. Removed Replanning cards, Planned Objectives cards, ✕ Rejected chatter, and objective-check updates from the main chat thread. Simplified the Proceed card to just "Ready to proceed?" with Proceed/Cancel buttons. Cleaned up internal-tooling copy from empty states and input hints. Stopped restoring objective state into the UI on session load.
- [x] ~~**Clean up interface — strip jargon, simplify layout, add debug pane**~~ — ✅ DONE. Rewrote `page.tsx` and `layout.tsx` to remove "Personal OS" branding, emoji icons, internal-tooling copy, and dead feature references. Added `clean.css` with simplified class mappings, proper debug pane styles, and hidden dead UI elements (session type badges, session icons). Added a working Debug tab that captures all raw SSE events with timestamped, color-coded, expandable entries. Removed "Skills" from the nav rail. Cleaned session list rendering to remove type badges and emoji icons.
- [x] ~~**Capture raw request + prompt traces in Debug**~~ — ✅ DONE. The client now logs each `/api/chat` request payload as `request_trace`, `/api/chat` emits `prompt_trace` with the final assembled system/context prompt metadata, and the Debug tab live-refreshes while open. Added focused preview coverage in `app/lib/debug-preview.test.ts`.
- [x] ~~**Group Debug by turn**~~ — ✅ DONE. Debug log entries now carry a `traceId`, each user send creates a new trace, incoming SSE/planner/tool events are tagged to that trace, and the Debug pane renders grouped expandable trace blocks instead of one flat stream. Added focused grouping coverage in `app/lib/debug-traces.test.ts`.
- [x] ~~**Harden Memory pane session switching**~~ — ✅ DONE. Restored the Memory tab to the main overview, refreshes memory state on `geeksy:session-changed`, distinguishes session-scoped summaries from `Agent-wide fallback`, and updates the empty-state copy so switching conversations no longer looks stale.
- [x] ~~**Soften the UI with a friendlier pastel pass**~~ — ✅ DONE. Added a pastel theme override in `app/css/clean.css` with softer backgrounds, gentler chrome, calmer buttons, and lighter message surfaces while keeping the simplified layout and debug split intact.
- [x] ~~**Live-check session-scoped core memory rendering after a real prune**~~ — ✅ DONE. Browser-verified: "Capture current conversation" captures session-scoped summary (Session 18: "Recent user topics: What time is it?"), switching to Session 17 shows "No retained summary" — correct session isolation.
- [x] ~~**Fix planner output for recurring script schedules**~~ — ✅ DONE. System prompt has exact STATE_URL helper template. Agent exec tool injects STATE_URL/AGENT_ID/SESSION_ID env vars. Schedule validator catches missing function definitions with specific error messages. smart-agent planner gracefully falls back to conversational mode on empty objective lists.
- [x] ~~**Add schedule guardrails for recurring scripts**~~ - ✅ DONE. The schedule tool now rejects scripts importing `@geeky/core`, auto-infers `interval` when an interval is provided, and the chat system prompt explicitly requires self-contained/inline-helper scheduled scripts.
- [x] ~~**Harden heartbeat + scheduler null-session reporting**~~ - ✅ DONE. Scheduler/heartbeat chat inserts now normalize nullable `sessionId` instead of crashing background reporting with Zod `Expected number, received null` errors.
- [x] ~~**Stop heartbeat `IDLE` ticks from crashing planner JSON parsing**~~ - ✅ DONE. Heartbeat no longer routes its `IDLE`-style tick prompt through session task planning; it now runs a direct agent response objective, eliminating `JSON Parse error: Unexpected identifier "IDLE"`.
- [x] ~~**Bind scheduled run output to the owning conversation**~~ - ✅ DONE. Heartbeat session picking now prefers the newest pending objective session and scopes its message history to that conversation, so background-created schedule rows and repeated script outputs land in the correct owning session (validated with session `16`).
- [x] ~~**Heartbeat paused state blocks queued follow-ups**~~ - ✅ DONE. Heartbeat now persists pause reasons (`manual`, `circuit_breaker`, `none`) and auto-clears legacy paused state with queued work on startup instead of silently stalling follow-ups.
- [x] ~~**Session auto-load broken**~~ - ✅ DONE. `initSessionUI()` called without `await` in page.client.tsx. Fixed by sequencing `restoreState()` then `initSessionUI()` in async IIFE.
- [x] ~~**Plugins page rendering "null"**~~ - ✅ DONE. `PluginsPage` was async - the self-fetch to localhost:3737 deadlocked Bun's single-threaded server. Made component sync, removed self-fetch.
- [x] ~~**Duplicate chat message bubbles**~~ - ✅ DONE. Message polling (3s interval) re-rendered messages that `sendMessage()` already appended. Added `__geeksy_isRunning` window flag to pause polling during active processing.
- [x] ~~**Raw JSON tool calls leak into chat**~~ - ✅ DONE. Enhanced `cleanThinkingText()` to also strip partial/unclosed ```json blocks and mid-stream tool JSON during streaming.
- [x] ~~**Telegram bot conversation flow freezes**~~ - ✅ Partially fixed. Simplified prompt from 'Reply via Telegram to user: text' to just raw text, reducing verbose formal reply style.
- [x] ~~**Plugin Architecture Cleanup**~~ - ✅ DONE. Re-architected `#pane-skills` UI, removed hardcoded plugin mappings, skills are now standalone YAML frontmatter files.
- [x] ~~**Secrets Infrastructure & UI**~~ - ✅ DONE. Implemented file-backed secrets storage (`.geeksy-secrets.json`), `/api/secrets` CRUD routes, a Settings → Secrets manager with masked values, and `/api/secrets/submit` for secure in-chat secret submission without rendering plaintext back into the thread.
- [x] ~~**ask_user_for_secret Tool**~~ - ✅ DONE. Added `request_secret` + `get_secret` tools to chat sessions so the agent can request a masked secret input in-thread and later retrieve the stored value without asking the user to paste it in plain chat.
- [x] ~~**Live browser-proof the masked secret request flow**~~ — ✅ DONE. Verified via browser-tools: request injection, secret submission, metadata-only GET all work end-to-end. - Backend coverage now verifies `/api/secrets` metadata-only reads, `/api/secrets/submit` sanitized chat persistence, and `/api/secrets/request` marker injection. Settings now has an `Add masked prompt to chat` trigger and immediately refreshes the active conversation after injection, so the end-to-end web UI proof can be exercised deterministically without waiting for LLM/tool luck.

## 🟡 Priority: Improve
- [x] ~~**Remove objectives timeline tab and show version badge**~~ - ✅ DONE. Removed the Objectives tab and metrics (objectives now live in chat confirmation cards); added a fixed version+commit badge to the bottom-right corner of the page.
- [x] ~~**Show CLI version/commit on startup**~~ - ✅ DONE. `npx geeksy` now prints version, commit (when available), and active home/db/skills paths before launching Bun.
- [x] ~~**Default system prompt**~~ - ✅ DONE. Added `DEFAULT_SYSTEM_PROMPT` in chat/route.ts - teaches AI to be concise, use Bun/TypeScript, `Get-Date` for time, use bgrun for processes.
- [x] ~~**Telegram session read-only in web**~~ - ✅ DONE. `selectSession()` checks `type === 'telegram_bot'`, disables input/send, shows blue banner.
- [x] ~~**Timeline tab: newest objectives on top**~~ - ✅ Already implemented. `renderObjectivesPane()` reverses `objectiveGroups` before rendering.
- [x] ~~**Plugins page: fetch registry client-side**~~ - ✅ DONE. Added `fetchRegistry()` to mount script. Fixed default export (Melina expects `export default`). Shows Discord, GitHub, Browserbase with Install buttons.

## 🟢 Priority: Features
- [x] ~~**Heartbeat-owned objective validation loop**~~ - ✅ DONE. Objectives now persist planner params plus validation/reporting metadata, and heartbeat deterministically validates common objective types (`file_exists`, `file_contains`, `command_succeeds`, `command_output_contains`, `task_scheduled`) in separate turns and reports newly completed objectives back into chat.
- [x] ~~**Live tool execution cards with progress + spoilers**~~ - ✅ DONE. Tool cards now show `$ command` for shell ops, animated progress bar while running, elapsed time on completion, collapsible output spoilers, and red-highlighted error output.
- [x] ~~**Clarify objective review UX before commit**~~ - ✅ DONE. The confirmation card now shows each proposed objective with icon/name/description, switches to the Objectives tab, and offers clear Proceed/Reject buttons so the user sees exactly what the agent plans to do before execution starts.
- [x] ~~**Skill-catalog discovery → install → objective-review workflow**~~ - ✅ DONE. Added `search_skills` and `install_skill` agent tools that search installed skills, marketplace, and plugin registry; wired into chat, heartbeat, and Telegram; system prompt instructs agent to discover before executing.
- [x] ~~**Persist artifact contents, not just filenames**~~ - ✅ DONE. Files tab now has clickable items that expand to show full file content via `/api/files`, with language hints, size info, truncation badges, and scrollable preview panes.
- [x] ~~**Heartbeat validation for scheduled automation outputs**~~ - ✅ DONE. Heartbeat now deterministically audits failed schedules, dedupes by failure fingerprint, and posts one concise chat alert per new failure state even without needing the LLM path.
- [x] ~~**Isolate heartbeat/scheduler tests from the live SQLite DB**~~ - ✅ DONE. `app/lib/db.ts` now auto-switches Bun test runs onto a temp SQLite file unless `GEEKSY_DB_PATH` is explicitly set, so local verification no longer pollutes the live app DB.
- [x] ~~**Persist schedule execution policy + output validation**~~ - ✅ DONE. Schedules now persist `timeoutSec`, `maxRetries`, `retryDelayMs`, `expectedOutput`, and `failOnStderr`; the scheduler enforces output/stderr validation centrally and the API/UI/tooling surface the policy back to the user.
- [x] ~~**Report scheduled failures back into chat**~~ - ✅ DONE. Scheduler now persists last reported state and emits chat alerts for failed one-off, interval, cron, and sequential tasks without endlessly repeating the same failure.
- [x] ~~**Browserbase plugin (registry entry)**~~ - ✅ DONE. Added to curated registry. Shows in Discover Plugins with Install button. Full plugin implementation (CLI, skill, config wizard) still pending.
- [x] ~~**Session types with gateways**~~ - ✅ DONE. Sessions now identify as `web`, `telegram`, or `telegram_bot`. `tg-bot.ts` handles individual user sessions automatically. Output generated during a `telegram` backend session (e.g. from the web interface) is actively routed to the user's Telegram chat via `enqueueMessage`.
- [x] ~~**Cross-Device Sync**~~ - ✅ DONE. Implemented `app/lib/p2p-sync.ts` with BroadcastChannel discovery + WebRTC. Syncs pinned sessions and session tags across local browser instances. Device ID stored in localStorage.
- [x] ~~**API Endpoint Sessions**~~ - ✅ DONE. Introduced an `api` session type that auto-generates a Webhook to interface with external servers seamlessly. Sessions of this type disable frontend chat input and provide a unified read-only banner.
- [x] ~~**Lobe Chat-Style Tool Invocations**~~ - ✅ DONE. Implemented `app/lib/tool-cards.tsx` with beautiful collapsible tool cards. Features: syntax highlighted code, status indicators (⏳🔄✓✗), specialized renderers for shell/file/search tools. Integrated into chat UI via `chat-ui.tsx`.
- [x] ~~**Voice chat**~~ - ✅ DONE. Added 🎤 button using Web Speech API for voice input.
- [x] ~~**Web search integration**~~ - ✅ DONE. Added 🌐 button using DuckDuckGo API (free, no key required).
- [x] ~~**File tree viewer**~~ - ✅ DONE. Files tab already shows session files.

## 🚧 New Tasks
- [x] ~~**Chat-native schedule tool for prompts + cron**~~ - ✅ DONE. `app/lib/schedule-tool.ts` now supports scheduling either `message` prompts or `scriptPath` jobs with `once`, `interval`, and `cron` types. Agents can create recurring cron jobs directly from conversation instead of being forced to write a script first.
- [x] ~~**Session-scoped objectives and files**~~ - ✅ DONE. Added optional `sessionId` to `objectives` and `files`, persisted session-scoped objective/file updates in chat + Telegram flows, and updated session switching to hydrate timeline/files from `/api/state?agentId=...&sessionId=...`.
- [x] ~~**Schedule creation UX in chat**~~ - ✅ DONE. `app/lib/events.ts` now detects successful `schedule` tool results and adds a clean `Schedule Created` chat card with cadence, target, cancel command info, and exact next-run timestamp while also switching to the Schedule tab.
- [x] ~~**Heartbeat awareness of pending schedules**~~ - ✅ DONE. `app/lib/heartbeat.ts` now treats agent-scoped `pending` and `running` schedules as active work instead of looking for nonexistent `status: 'active'` rows.
- [x] ~~**Session-scoped metrics/export cleanup**~~ - ✅ DONE. `/api/metrics` now accepts optional `sessionId` and scopes messages/objectives/files accordingly; `/api/agent-export` also accepts `sessionId` and exports session-scoped messages/objectives/files with scope metadata.
- [x] ~~**Surface session-scoped metrics in UI**~~ - ✅ DONE. `app/lib/metrics-ui.ts` now sends `sessionId` to `/api/metrics` using `getActiveSessionId()`, and `sessions-ui.ts` emits `geeksy:session-changed` so the metrics bar refreshes immediately on session switch.
- [x] ~~**Session-aware schedule persistence**~~ - ✅ DONE. Added optional `sessionId` to `schedules`, threaded it through schedule creation/listing/cancellation, wired chat + Telegram schedule tools to the active session, and persisted scheduler output back into the correct session chat.
- [x] ~~**Session-scoped schedule view/filtering**~~ - ✅ DONE. `fetchSchedules()` now requests `/api/schedule?sessionId=...` for the active session and scheduler-pushed chat polling uses session-scoped `/api/state` reads.
- [x] ~~**Simplify Geeksy UI around one primary workflow**~~ - ✅ DONE. Reduced the main screen to sessions + chat + 3 core tabs (Objectives, Files, Schedule), trimmed metrics to the essentials, removed header skill clutter, and rewrote copy so the app reads like one focused session workflow.
- [x] ~~**Immediate metrics refresh after send completion**~~ - ✅ DONE. Added a `geeksy:refresh-metrics` event; `sendMessage()` dispatches it after completion and `metrics-ui.ts` refreshes immediately. Verified live in the browser: session message count updated from 4 → 6 without waiting for the 20s poll.
- [x] ~~**Scheduled chat execution reliability on restart**~~ - ✅ DONE. `scheduler.ts` now retries chat-based schedule execution on transient server/network failures and sends `dbSessionId` through scheduled chat runs so they land in the correct conversation.
- [x] ~~**Continue UX pruning in header/sidebar**~~ - ✅ DONE. Applied a calmer chrome pass: quieter header, lighter metrics strip, clearer session copy, and cleaner session row presentation so the main workspace reads as one focused product.
- [x] ~~**Prune or hide low-value nav destinations**~~ - ✅ DONE. Demoted side-system destinations in the rail into a calmer `More` group and kept `Main` as the obvious primary destination.
- [x] ~~**Simplify session list actions**~~ - ✅ DONE. Replaced always-visible delete controls with a quieter overflow affordance so rows read as conversations first and destructive actions are revealed only when needed.
- [x] ~~**Unify session creation language**~~ - ✅ DONE. Standardized the main product voice around conversations instead of mixed session/chat/bot wording across the sidebar, composer, empty states, and creation flow.
- [x] ~~**Tighten session empty/loading states**~~ - ✅ DONE. Added calmer sidebar/chat placeholders for first load, no-conversation onboarding, and empty conversations, including clearer CTA/prompt chips.
- [x] ~~**Live-check the new session placeholders in browser/mobile**~~ - ✅ DONE. Browser pass caught session count grammar issues (`1 message` vs `1 messages`); fixed both SSR and client-rendered session rows while confirming the empty/loading states remain readable.
- [x] ~~**Prepare production deployment runbook**~~ - ✅ DONE. Added `docs/DEPLOY.md` with the fastest repeatable `bgrun` + Caddy + env-based deployment flow.
- [x] ~~**Make Geeksy runnable via npx/bunx**~~ - ✅ DONE. Added a real `geeksy` bin, switched local dependency paths to published package versions, and verified the package tarball is CLI-ready.
- [x] ~~**Publish updated Geeksy npm release**~~ - ✅ DONE. Published `geeksy@1.0.0` to npm; `npx geeksy@1.0.0` now resolves the real CLI while `latest` may take a moment to catch up in caches.
- [x] ~~**Fix session selection broken on page load**~~ — ✅ DONE. Root cause: 3 cascading issues — (1) Melina only loads layout.client, not page.client; (2) measure-fn uses process.* crashing browser bundle; (3) secrets→paths chain imports process.cwd(). Moved all init to layout.client, shimmed measure-fn, made paths import lazy.
- [x] ~~**Verify `npx geeksy` latest-tag/cache propagation**~~ — ✅ DONE. Published `geeksy@1.1.0` with session fix, auto-naming, client stability. `npm view geeksy version` returns `1.1.0`.
- [x] ~~**Trim npm package contents**~~ — ✅ DONE. Added .npmignore excluding tests, tmp, backups, .docs, sqlite files. Tarball now 750KB. - The tarball still includes tests/backups and other extra files that should likely be excluded before release.
- [x] ~~**Move production secrets out of tracked local config**~~ — ✅ DONE. Added `.env.example` with all env vars, `.env` gitignored, Bun auto-loads it. `.config.toml` remains for bgrun compat but both are gitignored.
- [x] ~~**Deploy Geeksy to the target server**~~ — ✅ DONE. Deployed to `202.155.132.139` at `https://geeksy.xyz`. Caddy reverse proxy on port 3737. bgrun process `geeksy` with GEMINI_API_KEY. Landing page at `/api/landing`.

## 🟢 Priority: Features (New)
- [ ] **Publish geeksy@1.2.0 to npm** — Bump includes: Gemini embeddings, STATE_URL env, web search/fetch tools, maxContextTokens, schedule fix, landing page. 82 tests.
- [ ] **Make landing page the default root** — Currently app is at `/` and landing at `/api/landing`. Consider making landing the default for unauthenticated visitors.
- [ ] **Web search UI integration** — Show web_search and fetch_page tool results with link previews and source cards in the chat UI (currently renders as plain text).
- [ ] **Image generation tool** — Add an `image_gen` tool using Gemini's image generation API so the agent can create images in conversation.
- [ ] **File upload in chat** — Allow users to drag & drop or paste files/images into the chat input for multimodal conversations.
- [ ] **Conversation export as PDF** — Export chat threads as formatted PDF documents with code highlighting.
- [ ] **Mobile responsive polish** — Test and fix the UI layout on mobile viewports (sidebar, chat input, tool cards).

## 🟡 Priority: Improve (New)
- [ ] **Reduce empty catch blocks** — 121 empty `catch {}` blocks across the codebase. Add at minimum `console.warn` for non-trivial operations.
- [ ] **Heartbeat reliability audit** — Review heartbeat.ts (704 lines) for edge cases, especially around session picking and pruning.
- [ ] **Test coverage for agents.tsx** — Core chat orchestration file has no dedicated tests.

## 📝 Architecture Notes
- **Framework**: Melina.js (Bun-native, file-based routing)
- **CLI/app paths**: `app/lib/paths.ts` centralizes `GEEKSY_HOME`, `GEEKSY_APP_ROOT`, skills, backups, config, and saved-key locations for packaged CLI mode.
- **Agent runtime**: smart-agent-ai@2.5.1 (Session/Agent with Classifier-Planner-Executor pipeline)
- **LLM layer**: jsx-ai (JSX-based LLM interface), gx402@3.0.0 (multi-provider callLLM)
- **Port**: 3737 (configured via BUN_PORT)
- **DB**: SQLite via sqlite-zod-orm (agents, sessions, messages, objectives, plugins, files, skills, schedules)
- **Embeddings**: Gemini text-embedding-004 (free, primary) → OpenAI text-embedding-3-small (fallback) → pseudo-embeddings
- **Secrets**: file-backed JSON store at `.geeksy-secrets.json` via `app/lib/secrets.ts`; chat uses `request_secret` / `get_secret` tools plus `/api/secrets` and `/api/secrets/submit` routes so secret values do not need to appear in plain chat.
- **Scheduling**: `app/lib/schedule-tool.ts` creates schedules with `once`, `interval`, or `cron`; execution by `app/api/schedule/scheduler.ts`. Scheduler injects STATE_URL/AGENT_ID env vars.
- **Agent tools**: schedule, request_secret, get_secret, search_skills, install_skill, web_search, fetch_page (+ smart-agent built-in: read/write/edit/exec/list/search)
- **Plugins**: geeksy-pumpfun-plugin (port 3457), geeksy-telegram-plugin (port 3738)
- **Client**: jsx-dom rendering with direct DOM manipulation, SSE streaming for chat events
- **Tests**: 82 tests, 202 expect() calls

## ✅ Browser-Verified (this session)
- [x] Session selection on page load
- [x] Chat send + receive with tool execution
- [x] Auto-naming conversations from first message
- [x] Session switching loads correct messages
- [x] Memory tab: session-scoped core memory capture + isolation
- [x] Schedule tab: 40 runs, 100% success, joke-sender active
- [x] Files tab: renders correctly
- [x] Debug tab: ready for live capture
- [x] Sidebar refresh after send shows renamed session
- [x] Published geeksy@1.1.0 to npm
