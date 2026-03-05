# Geeksy Personal OS — Tasks

## 🔴 Priority: Fix
- [x] ~~**Skills tab stuck on "Loading skills..."**~~ — ✅ FIXED. `SkillInfo` type had `commands` array but API returns `content` (markdown body). Updated `types.ts`, rewrote `renderSkillsPane` to show name/desc/line count + expandable markdown body.
- [x] ~~**Processes panel unstyled**~~ — ✅ FIXED. Added full CSS for process cards + enriched API to pass through port, memory, uptime, group from bgr dashboard. HTTP-first data source (richer than CLI).
- [ ] **Explorer link dead** — Sidebar "Explorer" link points to `http://localhost:3800` which has no service running. Either remove, point to galaxy-canvas (:3335), or build an explorer page.
- [ ] **Skills sidebar page empty** — The `/skills` route in the sidebar shows an empty page. Needs wiring to display the same skill listing as the tab pane.

## 🟡 Priority: Improve
- [ ] **Plugin config UI** — Plugin configure modal should render form fields from manifest's `config` schema. Currently just shows raw config.
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
