# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
- [x] ~~**Skills tab stuck on "Loading skills..."**~~ — ✅ FIXED. `SkillInfo` type had `commands` array but API returns `content` (markdown body). Updated `types.ts`, rewrote `renderSkillsPane` to show name/desc/line count + expandable markdown body.
- [x] ~~**Processes panel unstyled**~~ — ✅ FIXED. Added full CSS for process cards + enriched API to pass through port, memory, uptime, group from bgr dashboard. HTTP-first data source (richer than CLI).
- [x] ~~**Explorer link dead**~~ — ✅ FIXED. Pointed to galaxy-canvas at `:3335` instead of dead `:3800`.
- [x] ~~**Skills sidebar page empty**~~ — ✅ FIXED. Rewrote `page.client.tsx` to use `content` field instead of broken `commands` array. Shows name/desc/line count/file badge.

## 🟡 Priority: Improve
- [x] ~~**Plugin config UI**~~ — ✅ DONE. Configure button opens modal with schema-driven form fields from `geeksy-plugin.json` manifest. Labels, descriptions, required markers, secret masking, array-as-textarea. Falls back to raw JSON editor.
- [ ] **Chat streaming improvements** — Chat could show tool calls more clearly (code blocks, results formatting).
- [ ] **Agent model selection** — Model dropdown dropdown is present but could be more prominent with model descriptions.

## 🟢 Priority: Features
- [ ] **Telegram + Trading composition** — Agent combines skills from multiple plugins in a single script (e.g., listen to Telegram channel → auto-trade tokens).
- [ ] **Example: "listen to @PumpAlpha and trade all tokens"** — Pre-built listener script template.

## 📝 Architecture Notes
- **Framework**: Melina.js (file-router, SSR + client mount)
- **Port**: 3737 (default)
- **Tabs**: Objectives, Files, Schedule, Processes, Memory, Skills
- **Skills**: Parsed from `skills/*.md` via YAML frontmatter
- **Plugins**: Loaded from sibling directories with `geeksy-plugin.json`
- **Processes**: Proxied from bgr dashboard API (multi-port fallback)
