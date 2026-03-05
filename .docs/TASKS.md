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

## 🟢 Priority: Features
- [x] ~~**Telegram + Trading composition**~~ — ✅ DONE. Skills API enriched with plugin provenance (name, icon, packageName, status, API spec). Skill chips grouped by source plugin with icons. Composition badge (⚡ N plugins) + contextual template prompts (Listen & Trade, Trade Alerts, Channel Scanner) appear when 2+ plugin skills are active. Templates auto-populate chat input.
- [x] ~~**Example: "listen to @PumpAlpha and trade all tokens"**~~ — ✅ DONE. Pre-built composition template populates chat with: "Listen to the Telegram channel @PumpAlpha for new token mentions. When a Solana token mint address is mentioned, automatically add it to the trading bot via the Pumpfun Trading plugin."

## 📝 Architecture Notes
- **Framework**: Melina.js (file-router, SSR + client mount)
- **Port**: 3737 (default)
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Processes**: Proxied from bgr dashboard API (multi-port fallback)
