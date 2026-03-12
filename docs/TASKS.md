# Geeksy Personal OS — Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Metrics bar shows 0/0 plugins**~~ — ✅ FIXED. `auto-discover.ts` now scans multiple directories: parent of CWD (local dev), home dir (server `/root/`), and `PLUGIN_SCAN_DIR` env var. Previously only checked `../` relative to CWD which missed plugins on the server.

## 🟡 Priority: Improve
- [x] ~~**Inline session renaming**~~ — ✅ DONE. Double-click session name to edit inline. Input with accent border, Enter saves via `PUT /api/sessions`, Escape/blur cancels. CSS: `.session-rename-input` with focus glow.
- [x] ~~**Keyboard shortcuts help**~~ — ✅ DONE. `?` or `Ctrl+/` opens glassmorphism overlay with 4 sections (General, Search, Chat, Sessions). Shows all shortcuts with `<kbd>` styling. Closes on Escape, click-outside, or ✕. CSS: `.shortcuts-overlay`, `.shortcuts-panel`, `.shortcuts-key` with frosted backdrop.
- [x] ~~**Dark/light theme toggle**~~ — ✅ DONE. 🌙/☀️ button in header. `[data-theme="light"]` CSS custom property overrides in `base.css` — every component adapts automatically via vars. Persisted in `localStorage('geeksy_theme')`. Restored on mount. Zero per-component CSS changes needed.
- [ ] **Heartbeat token budget alert** — When cumulative heartbeat tokens exceed a configurable daily limit, show an amber warning in the metrics bar and optionally pause heartbeat. Currently no spending guard.

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
- [x] ~~**Stale session cleanup**~~ — ✅ DONE. Amber "🗑 Clean N empty" button appears at top of session list when there are sessions with 0 messages. `DELETE /api/sessions?cleanup=empty` bulk-removes them. Session list enriched with `messageCount`.
- [x] ~~**Heartbeat cost tracking**~~ — ✅ DONE. Estimates input/output tokens per tick (~4 chars/token). Tracks cumulative totals in `heartbeatStats`. Metrics API includes `totalInputTokens`, `totalOutputTokens`, `lastTickInputTokens`, `lastTickOutputTokens`. Heartbeat tooltip shows full token breakdown.
- [x] ~~**Session search**~~ — ✅ DONE. Ctrl+K opens command palette searching across all sessions by title and message content. API: `GET /api/search?q=X`. CSS: rewrote `search.css` to match `search-ui.ts` DOM (`.search-overlay`, `.search-input-wrap`). Highlights matches, keyboard nav (↑↓↵ESC).
- [x] ~~**Session pinning**~~ — ✅ DONE. 📌 pin toggle per session row. Pinned sessions sort to top. Persisted in `localStorage('geeksy_pinned_sessions')`. CSS: `.session-pin-btn` with accent hover. Pin icon shows in session name.
- [x] ~~**Message reactions**~~ — ✅ DONE. 👍 👎 ⭐ reaction buttons on every assistant bubble. Toggle with localStorage persistence. CSS: `.reaction-btn`, `.reaction-badge.active`, `.reaction-bar`. Already existed in `chat-ui.tsx`.
- [x] ~~**Conversation tagging**~~ — ✅ DONE. 6 colored tags (Debug, Feature, Research, Bug, Idea, Review). 🏷 button per session opens picker popup. Tags show as colored dots next to session name. Filter bar at top of session list filters by tag. localStorage-backed. CSS: `.tag-filter-chip`, `.tag-picker-popup`, `.session-tag-dot`.
- [x] ~~**Quick reply templates**~~ — ✅ DONE. 5 preset buttons above chat input: ▶ Continue, 💡 Explain, 📝 Code, 🗺 Next steps, 📋 Summarize. Click auto-fills and sends. CSS: `.quick-replies`, `.quick-reply-btn` pill buttons with scrollable row.

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
