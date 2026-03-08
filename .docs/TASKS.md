# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
- [x] ~~**Schedule interval tasks clogging queue**~~ — ✅ FIXED. `scheduler.ts` `tick()` failed to skip interval tasks that weren't ready, causing the loop to infinitely retry the oldest pending interval task and blocking all other schedules (head-of-line blocking). Added `.filter(!nextRun || nextRun <= now)`.
- [x] ~~**Sequential schedules running despite cancel/failure**~~ — ✅ FIXED. Added `break` to `runSequential` so subsequent tasks abort if a sub-task fails, preventing destructive side-effects. Also prevented interval and single tasks from overriding a `cancelled` state if the user cancels them mid-run.
- [x] ~~**Interval tasks pausing before first execution**~~ — ✅ FIXED. `route.ts` incorrectly added the `intervalSec` to `Date.now()` on creation. Now sets `nextRun: Date.now()` so it explicitly runs the very first interval loop immediately instead of forcing the user to wait out the gap.
- [x] ~~**Skills tab stuck on "Loading skills..."**~~ — ✅ FIXED. `SkillInfo` type had `commands` array but API returns `content` (markdown body). Updated `types.ts`, rewrote `renderSkillsPane` to show name/desc/line count + expandable markdown body.
- [x] ~~**Processes panel unstyled**~~ — ✅ FIXED. Added full CSS for process cards + enriched API to pass through port, memory, uptime, group from bgr dashboard. HTTP-first data source (richer than CLI).
- [x] ~~**Explorer link dead**~~ — ✅ FIXED. Pointed to galaxy-canvas at `:3335` instead of dead `:3800`.
- [x] ~~**Skills sidebar page empty**~~ — ✅ FIXED. Rewrote `page.client.tsx` to use `content` field instead of broken `commands` array. Shows name/desc/line count/file badge.

## 🟡 Priority: Improve
- [x] ~~**Plugin config UI**~~ — ✅ DONE. Configure button opens modal with schema-driven form fields from `geeksy-plugin.json` manifest. Labels, descriptions, required markers, secret masking, array-as-textarea. Falls back to raw JSON editor.
- [x] ~~**Chat streaming improvements**~~ — ✅ DONE. Streaming bubble renders markdown in real-time. Tool cards show human-readable labels with icons, primary param badges, collapsible extra params and long output.
- [x] ~~**Agent model selection**~~ — ✅ DONE. Model dropdown wrapped in pill-style container with 🧠 icon, accent border glow on hover/focus. Provider-specific icons (✦ Google, ◆ OpenAI, ◈ Anthropic, ◇ DeepSeek) in optgroup labels.
- [x] ~~**Chat auto-scroll to latest message**~~ — ✅ DONE. Split `scrollDown()` into smart (near-bottom heuristic, 300px threshold) and `forceScrollDown()` (always scroll). Force-scroll fires on: user sends message, loading indicator appears, chat snapshot restore. Smart scroll used during streaming to avoid interrupting history reading.
- [x] ~~**Agent rename/delete**~~ — ✅ Already existed. Delete via ✕ button on sidebar agents. Rename via double-click on agent header name (inline input with blur/Enter/Escape handling).
- [x] ~~**Agent conversation export**~~ — ✅ Already wired. Export button (⬇) in header calls `exportChatAsMarkdown()` which downloads full conversation as .md file with user/agent/tool/card formatting.

## 🟢 Priority: Features
- [x] ~~**Telegram + Trading composition**~~ — ✅ DONE. Skills API enriched with plugin provenance (name, icon, packageName, status, API spec). Skill chips grouped by source plugin with icons. Composition badge (⚡ N plugins) + contextual template prompts (Listen & Trade, Trade Alerts, Channel Scanner) appear when 2+ plugin skills are active. Templates auto-populate chat input.
- [x] ~~**Example: "listen to @PumpAlpha and trade all tokens"**~~ — ✅ DONE. Pre-built composition template populates chat with: "Listen to the Telegram channel @PumpAlpha for new token mentions. When a Solana token mint address is mentioned, automatically add it to the trading bot via the Pumpfun Trading plugin."
- [x] ~~**Data visualization blocks in Chat**~~ — ✅ DONE. Intercepts `chart`, `sparkline` or `data` markdown codeblocks, parses the internal JSON, and renders native inline SVGs directly inside chat bubbles. Supports Line/Bar/Area charts and inline Sparklines with automatic bounds scaling.
- [x] ~~**Geeksy Cloud Auth Backup**~~ — ✅ DONE. GitHub OAuth login, AES-256-GCM client-side encryption (PBKDF2, 100k iterations), backup/restore API with filesystem storage (upgradeable to R2). Settings panel with login, passphrase input, backup/restore/delete UI, backup list with timestamps. Zero-knowledge server — only sees encrypted blobs. ADR-001 documents architecture. Files: `crypto.ts`, `backup.ts`, `api/auth/route.ts`, `api/backup/route.ts`, `api/backup/db/route.ts`, `settings.tsx`.
- [x] ~~**Cross-instance P2P Communication**~~ — ✅ DONE. WebRTC data channels with WebSocket signaling server. P2PManager class handles ICE negotiation, peer discovery, and JSON-RPC protocol over data channels. Signaling server relays SDP/ICE only — no data passes through. Default RPC handlers: `skills.list`, `agent.list`, `agent.run`, `state.get`, `health`. ADR-002 documents architecture. Files: `p2p.ts`, `p2p-handlers.ts`, `api/p2p/route.ts`.

## 🟡 Priority: Improve (New)
- [x] ~~**Single Global Chat / Gateway**~~ — ✅ DONE. Refactored the UI to remove the agent selection sidebar, transforming the app into a single universal gateway where all conversations flow through Agent "Geeksy Global". Also set up shared memory stores so background processes can resume the active session.
- [x] ~~**Autonomous Heartbeat**~~ — ✅ DONE. Created a `heartbeat.ts` module loaded by `server.ts` that wakes the Global Agent every 60s to check logs/tasks and perform autonomous actions. Uses the shared `sessions` map to preserve conversational context, returning silently if the system evaluates as `IDLE`.
- [x] ~~**Skill search/filter in panel**~~ — ✅ DONE. Search input on both Skills page (`/skills`) and Skills tab in overview panel. Filters by name, description, ID, or plugin name. Shows count (e.g. "1/2"). Clear button. Skills page also groups by plugin source with icons and count badges.
- [x] ~~**Persistent skill toggle state**~~ — ✅ DONE. Active skill IDs saved to `localStorage` on every toggle. Restored on page load via `restoreActiveSkills()`. Falls back to auto-enable-all if no saved state. Works across page reloads.
- [x] ~~**Chat message timestamps**~~ — ✅ DONE. Subtle 9px timestamps appear on hover below each user/agent bubble. Format: "06:04 AM". Hidden by default with smooth opacity transition. Non-intrusive but provides conversation context.
- [x] ~~**Agent task history**~~ — ✅ DONE. Added an aggregated success/failure stats banner (`Task History: X Total | Y Complete | Z Failed | W Pending`) to the top of the Objectives pane that computes stats across all historical tasks including restored groups.
- [x] ~~**Favicon + branding**~~ — ✅ DONE. Added inline SVG favicon (purple gradient + robot emoji). Updated title to "Geeksy — Personal OS" and meta description.

## 🟢 Priority: Next Steps (Backlog Replenishment)
- [x] ~~**Heartbeat Config UI**~~ — ✅ DONE. Added a quick toggle in the Geeksy UI (header) to Pause/Resume the 60s Heartbeat (saves to agentState 'heartbeat_paused' via new `/api/heartbeat` API and filters `grayscale` properly on click) to prevent API token drain.
- [x] ~~**Agent OSINT & Polling Logic**~~ — ✅ DONE. Refined the Global Agent's system prompt in `heartbeat.ts` to routinely hit the Telegram plugin's `/api/messages` to monitor tracked channels for new tokens and subsequently trade them via the Pumpfun Trading plugin without human prompting.
- [x] ~~**External Telegram Bot Gateway**~~ — ✅ DONE. Added `app/lib/tg-bot.ts` which concurrently polls the user's BotFather bot token (configured via Geeksy Settings UI modals). When someone talks to the bot, it relays the user ID/message context to the active AI Session and fires back the Markdown-formatted AI response via Native Telegram JSON API without breaking the unified chat view.

## 🟢 Priority: Future Capabilities (Backlog Replenishment)
- [x] ~~**Expose Safe Mode Approvals via Telegram**~~ — ✅ DONE. When the agent hits a `safeMode` block in `session.send()`, the `tg-bot.ts` loop intercepts the `tool_result` event and sends an Inline Keyboard Button via Telegram. The user can click it to seamlessly approve the command inline, triggering a callback query that forces bypass of the `safeMode` config and executes the instruction securely unblocking the agent loop.
- [x] ~~**Agent Memory Auto-Pruning**~~ — ✅ DONE. Implemented in `heartbeat.ts`. When the SQLite `messages` table hits 200 rows for the global agent, the heartbeat process injects a `MEMORY PRUNING TICK`, instructing the agent to summarize context into `core_memory` using `setState`. Once confirmed (`PRUNED`), it aggressively wipes the legacy `messages`, `objectives`, and `files` tables, replacing the in-memory session to avoid token overflows.
- [x] ~~**Real-time Sequential Sub-task UI**~~ — ✅ DONE. When the scheduler executes a `sequential` batch of tasks, the client UI now maps the `s.tasks` payload in `panels.tsx` to display a real-time list of sub-tasks underneath the main job card. Running tasks emit a pulsing amber indicator, completed tasks show a green check, and failed tasks show a red cross.
- [x] ~~**Telegram Reply/Interaction UI in Geeksy Chat**~~ — ✅ DONE. The `app/lib/chat-ui.tsx` parser now detects incoming global agent Telegram messages (`[Telegram Message from X]`) and renders a Native UI Header with a quick `↵ Reply` button. Clicking it instantly auto-fills the main input bar to reply directly to that specific user/thread from the UI.
- [x] ~~**Dynamic Schedule Visualizer**~~ — ✅ DONE. Implemented `schedule` list front-end inside the Geeksy `overview` panel (`panels.tsx`). Upgraded sorting logic to group actively pending jobs first (prioritized by `nextRun`), running tasks next, and finally a reverse chronological list of completed/failed tasks. Shows progress bars, emojis for tooltypes, and truncates long text logic in clean flex boxes.
- [x] ~~**Agent Safety/Sandboxing Toggles**~~ — ✅ DONE. Add a "Safe Mode" setting in the UI to restrict the agent from using the `run_command` tool autonomously (returns an error explicitly asking the user to perform the action), giving the human peace-of-mind when letting the agent run wild in the background over extended periods.

## 🔴 Priority: Fix (Recent)
- [x] ~~**Telegram bot sending raw JSON & failing on Markdown**~~ — ✅ FIXED. `tg-bot.ts` was accumulating raw `thinking_delta` including tool-call JSON blocks, sending them to users as gibberish. Also Telegram's strict Markdown parser silently dropped messages with unbalanced formatting. Fixed: (1) strip tool-call JSON same way the web UI does, (2) Markdown send now falls back to plain text on parse error, (3) messages over 4096 chars are chunked into multiple sends.

## 🟢 Priority: Next Steps
- [x] ~~**Telegram Bot Typing Indicator**~~ — ✅ DONE. Sends `sendChatAction(typing)` immediately on message receive, repeats every 4s (Telegram expires after 5s). Cleared on success and error. Users see "Geeksy is typing..." during AI processing.
- [x] ~~**Multi-user Telegram Isolation**~~ — ✅ DONE. Sessions now keyed by `tg:<chatId>` instead of the global agent sessionId. Each Telegram user gets their own isolated conversation that persists across messages. Prevents conversation bleed between users.
- [x] ~~**Heartbeat Status Widget**~~ — ✅ DONE. Heartbeat button now has a pulsing status dot (green=healthy, amber=paused, red=errors) and a rich hover tooltip showing: last tick time, tick result, total ticks, consecutive failures, and uptime. Backend tracks telemetry via `getHeartbeatStats()`, exposed through `/api/heartbeat` GET. Polls every 15s.
- [x] ~~**Deploy to genius.geeksy.xyz**~~ — ✅ DONE. Deployed via systemd service on 202.155.132.139 with Caddy reverse proxy. `geeksy.service` auto-restarts on crash. Waiting for DNS A record to be pointed.

## 🟡 Priority: Next Up
- [x] ~~**Chat History Search**~~ — ✅ DONE. Ctrl+K opens a glassmorphism command-palette overlay that filters chat messages in real-time. Matching text is highlighted with purple marks. Clicking a result closes the modal, scrolls to the message, and highlights it with a purple outline for 2 seconds. Escape or backdrop click closes.
- [ ] **Plugin Hot-Reload** — When a plugin's npm package is updated, detect and notify the user instead of requiring a full restart.
- [x] ~~**Agent Export/Import**~~ — ✅ DONE. GET `/api/agent-export?id=X` downloads full agent state (messages, objectives, files, schedules, config) as JSON. POST imports it as a new agent. Header buttons: 📤 Export, 📥 Import with file picker. Import creates agent with "(imported)" suffix and navigates to it.

## 📝 Architecture Notes
- **Framework**: Melina.js (file-router, SSR + client mount)
- **Port**: 3737 (default)
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Processes**: Proxied from bgr dashboard API (multi-port fallback)
- **Chat UI**: `app/lib/chat-ui.tsx` (bubbles, cards, scroll helpers), `app/lib/events.ts` (SSE handler), `app/lib/agents.tsx` (CRUD, send, sidebar)
