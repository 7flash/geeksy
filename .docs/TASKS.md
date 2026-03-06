# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
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

## 🟡 Priority: Improve (New)
- [x] ~~**Skill search/filter in panel**~~ — ✅ DONE. Search input on both Skills page (`/skills`) and Skills tab in overview panel. Filters by name, description, ID, or plugin name. Shows count (e.g. "1/2"). Clear button. Skills page also groups by plugin source with icons and count badges.
- [x] ~~**Persistent skill toggle state**~~ — ✅ DONE. Active skill IDs saved to `localStorage` on every toggle. Restored on page load via `restoreActiveSkills()`. Falls back to auto-enable-all if no saved state. Works across page reloads.
- [x] ~~**Chat message timestamps**~~ — ✅ DONE. Subtle 9px timestamps appear on hover below each user/agent bubble. Format: "06:04 AM". Hidden by default with smooth opacity transition. Non-intrusive but provides conversation context.
- [x] ~~**Agent task history**~~ — ✅ DONE. Added an aggregated success/failure stats banner (`Task History: X Total | Y Complete | Z Failed | W Pending`) to the top of the Objectives pane that computes stats across all historical tasks including restored groups.
- [x] ~~**Favicon + branding**~~ — ✅ DONE. Added inline SVG favicon (purple gradient + robot emoji). Updated title to "Geeksy — Personal OS" and meta description.

## 📝 Architecture Notes
- **Framework**: Melina.js (file-router, SSR + client mount)
- **Port**: 3737 (default)
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Processes**: Proxied from bgr dashboard API (multi-port fallback)
- **Chat UI**: `app/lib/chat-ui.tsx` (bubbles, cards, scroll helpers), `app/lib/events.ts` (SSE handler), `app/lib/agents.tsx` (CRUD, send, sidebar)
