# Geeksy — Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Session auto-load broken**~~ — ✅ DONE. `initSessionUI()` called without `await` in page.client.tsx. Fixed by sequencing `restoreState()` then `initSessionUI()` in async IIFE.
- [x] ~~**Plugins page rendering "null"**~~ — ✅ DONE. `PluginsPage` was async — the self-fetch to localhost:3737 deadlocked Bun's single-threaded server. Made component sync, removed self-fetch.
- [x] ~~**Duplicate chat message bubbles**~~ — ✅ DONE. Message polling (3s interval) re-rendered messages that `sendMessage()` already appended. Added `__geeksy_isRunning` window flag to pause polling during active processing.
- [x] ~~**Raw JSON tool calls leak into chat**~~ — ✅ DONE. Enhanced `cleanThinkingText()` to also strip partial/unclosed ```json blocks and mid-stream tool JSON during streaming.
- [x] ~~**Telegram bot conversation flow freezes**~~ — ✅ Partially fixed. Simplified prompt from 'Reply via Telegram to user: text' to just raw text, reducing verbose formal reply style.
- [x] ~~**Plugin Architecture Cleanup**~~ — ✅ DONE. Re-architected `#pane-skills` UI, removed hardcoded plugin mappings, skills are now standalone YAML frontmatter files.
- [x] ~~**Secrets Infrastructure & UI**~~ — ✅ DONE. Created `secrets` DB table, CRUD endpoints, and robust Secrets UI Dashboard with masked passwords.
- [x] ~~**ask_user_for_secret Tool**~~ — ✅ DONE. Delivered `createSecretRequestTool` to LLM context to safely stall and securely request missing env variables from the active user.

## 🟡 Priority: Improve
- [x] ~~**Default system prompt**~~ — ✅ DONE. Added `DEFAULT_SYSTEM_PROMPT` in chat/route.ts — teaches AI to be concise, use Bun/TypeScript, `Get-Date` for time, use bgrun for processes.
- [x] ~~**Telegram session read-only in web**~~ — ✅ DONE. `selectSession()` checks `type === 'telegram_bot'`, disables input/send, shows blue banner.
- [x] ~~**Timeline tab: newest objectives on top**~~ — ✅ Already implemented. `renderObjectivesPane()` reverses `objectiveGroups` before rendering.
- [x] ~~**Plugins page: fetch registry client-side**~~ — ✅ DONE. Added `fetchRegistry()` to mount script. Fixed default export (Melina expects `export default`). Shows Discord, GitHub, Browserbase with Install buttons.

## 🟢 Priority: Features
- [x] ~~**Browserbase plugin (registry entry)**~~ — ✅ DONE. Added to curated registry. Shows in Discover Plugins with Install button. Full plugin implementation (CLI, skill, config wizard) still pending.
- [x] ~~**Session types with gateways**~~ — ✅ DONE. Sessions now identify as `web`, `telegram`, or `telegram_bot`. `tg-bot.ts` handles individual user sessions automatically. Output generated during a `telegram` backend session (e.g. from the web interface) is actively routed to the user's Telegram chat via `enqueueMessage`.
- [x] ~~**Cross-Device Sync**~~ — ✅ DONE. Implemented `app/lib/p2p-sync.ts` with BroadcastChannel discovery + WebRTC. Syncs pinned sessions and session tags across local browser instances. Device ID stored in localStorage.
- [x] ~~**API Endpoint Sessions**~~ — ✅ DONE. Introduced an `api` session type that auto-generates a Webhook to interface with external servers seamlessly. Sessions of this type disable frontend chat input and provide a unified read-only banner.
- [x] ~~**Lobe Chat-Style Tool Invocations**~~ — ✅ DONE. Implemented `app/lib/tool-cards.tsx` with beautiful collapsible tool cards. Features: syntax highlighted code, status indicators (⏳🔄✓✗), specialized renderers for shell/file/search tools. Integrated into chat UI via `chat-ui.tsx`.
- [x] ~~**Voice chat**~~ — ✅ DONE. Added 🎤 button using Web Speech API for voice input.
- [x] ~~**Web search integration**~~ — ✅ DONE. Added 🌐 button using DuckDuckGo API (free, no key required).
- [x] ~~**File tree viewer**~~ — ✅ DONE. Files tab already shows session files.

## 🚧 New Tasks
- [x] ~~**Chat-native schedule tool for prompts + cron**~~ — ✅ DONE. `app/lib/schedule-tool.ts` now supports scheduling either `message` prompts or `scriptPath` jobs with `once`, `interval`, and `cron` types. Agents can create recurring cron jobs directly from conversation instead of being forced to write a script first.
- [x] ~~**Session-scoped objectives and files**~~ — ✅ DONE. Added optional `sessionId` to `objectives` and `files`, persisted session-scoped objective/file updates in chat + Telegram flows, and updated session switching to hydrate timeline/files from `/api/state?agentId=...&sessionId=...`.
- [x] ~~**Schedule creation UX in chat**~~ — ✅ DONE. `app/lib/events.ts` now detects successful `schedule` tool results and adds a clean `Schedule Created` chat card with cadence, target, cancel command info, and exact next-run timestamp while also switching to the Schedule tab.
- [x] ~~**Heartbeat awareness of pending schedules**~~ — ✅ DONE. `app/lib/heartbeat.ts` now treats agent-scoped `pending` and `running` schedules as active work instead of looking for nonexistent `status: 'active'` rows.
- [x] ~~**Session-scoped metrics/export cleanup**~~ — ✅ DONE. `/api/metrics` now accepts optional `sessionId` and scopes messages/objectives/files accordingly; `/api/agent-export` also accepts `sessionId` and exports session-scoped messages/objectives/files with scope metadata.
- [x] ~~**Surface session-scoped metrics in UI**~~ — ✅ DONE. `app/lib/metrics-ui.ts` now sends `sessionId` to `/api/metrics` using `getActiveSessionId()`, and `sessions-ui.ts` emits `geeksy:session-changed` so the metrics bar refreshes immediately on session switch.
- [x] ~~**Session-aware schedule persistence**~~ — ✅ DONE. Added optional `sessionId` to `schedules`, threaded it through schedule creation/listing/cancellation, wired chat + Telegram schedule tools to the active session, and persisted scheduler output back into the correct session chat.
- [x] ~~**Session-scoped schedule view/filtering**~~ — ✅ DONE. `fetchSchedules()` now requests `/api/schedule?sessionId=...` for the active session and scheduler-pushed chat polling uses session-scoped `/api/state` reads.
- [x] ~~**Simplify Geeksy UI around one primary workflow**~~ — ✅ DONE. Reduced the main screen to sessions + chat + 3 core tabs (Objectives, Files, Schedule), trimmed metrics to the essentials, removed header skill clutter, and rewrote copy so the app reads like one focused session workflow.
- [x] ~~**Immediate metrics refresh after send completion**~~ — ✅ DONE. Added a `geeksy:refresh-metrics` event; `sendMessage()` dispatches it after completion and `metrics-ui.ts` refreshes immediately. Verified live in the browser: session message count updated from 4 → 6 without waiting for the 20s poll.
- [x] ~~**Scheduled chat execution reliability on restart**~~ — ✅ DONE. `scheduler.ts` now retries chat-based schedule execution on transient server/network failures and sends `dbSessionId` through scheduled chat runs so they land in the correct conversation.
- [x] ~~**Continue UX pruning in header/sidebar**~~ — ✅ DONE. Applied a calmer chrome pass: quieter header, lighter metrics strip, clearer session copy, and cleaner session row presentation so the main workspace reads as one focused product.
- [x] ~~**Prune or hide low-value nav destinations**~~ — ✅ DONE. Demoted side-system destinations in the rail into a calmer `More` group and kept `Main` as the obvious primary destination.
- [x] ~~**Simplify session list actions**~~ — ✅ DONE. Replaced always-visible delete controls with a quieter overflow affordance so rows read as conversations first and destructive actions are revealed only when needed.
- [ ] **Unify session creation language** — The product is calmer now, but labels like “Chat Session”, “Telegram Bot”, and sidebar/session wording still need one consistent product voice.
- [ ] **Tighten session empty/loading states** — Session rows are calmer now, but the empty state and first-load experience still need the same polished product voice.

## 📝 Architecture Notes
- **Framework**: Melina.js (Bun-native, file-based routing)
- **Agent runtime**: smart-agent-ai (Session/Agent with Classifier-Planner-Executor pipeline)
- **Port**: 3737 (configured via BUN_PORT)
- **DB**: SQLite via sqlite-zod-orm (agents, sessions, messages, objectives, plugins, files, skills, schedules, secrets)
- **Scheduling**: `app/lib/schedule-tool.ts` can now create chat-prompt schedules and Bun script schedules with `once`, `interval`, or `cron`; execution is handled by `app/api/schedule/scheduler.ts`
- **Plugins**: geeksy-pumpfun-plugin (port 3457), geeksy-telegram-plugin (port 3738)
- **Client**: jsx-dom rendering with direct DOM manipulation, SSE streaming for chat events
