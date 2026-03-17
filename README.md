# 🧠 Geeksy — Personal OS for Autonomous Agents

Self-hosted gateway for AI sessions with autonomous execution, Telegram relay, and plugin orchestration.

```
┌──────┬──────────────────────────────────────────────────────────┐
│ 🏠   │  Gateway                                   gemini-2.5 ▼ │
│ 💬   ├──────────────┬───────────────────────────────────────────┤
│ 📊   │ Sessions     │  💬 Session: Research                    │
│ ⚙️   │              │                                          │
│      │  Research   ▸│  🤖 Found 3 papers on quantum ML...      │
│      │  DevOps     ▸│  📎 Saved to core_memory                 │
│      │  Trading    ▸│                                          │
│      │              ├──────────────────────────────────────────┤
│      │  + New       │  Type your message...              [➤]  │
│      │              ├──────────────────────────────────────────┤
│      │              │ 💬 42  🎯 3/5  ⏱ 2✓ 0✗  🔌 1/1  ⏰ 6h │
└──────┴──────────────┴──────────────────────────────────────────┘
```

## Quick Start

```bash
bun install
bun run dev
# → http://localhost:3737
```

## CLI

After publishing to npm, Geeksy can be started with:

```bash
npx geeksy
# or
bunx geeksy
```

Optional port override:

```bash
npx geeksy --port 4000
```

By default, the npm CLI stores Geeksy data in an OS-native app-data directory:

- macOS: `~/Library/Application Support/Geeksy`
- Windows: `%APPDATA%/Geeksy`
- Linux: `$XDG_DATA_HOME/geeksy` or `~/.local/share/geeksy`

You can override the home directory with `GEEKSY_HOME` or point SQLite at an exact file with `GEEKSY_DB_PATH`.

Geeksy requires Bun to be installed locally because the server runs on Bun.

Set an API key in Settings or via environment:

```bash
GEMINI_API_KEY=your-key bun run dev
```

## ✨ What You Get

- 🧠 **Session-based memory** → each session maintains its own context, objectives, and memory store
- 💓 **Autonomous heartbeat** → 60s proactive cycles check objectives, run schedules, prune memory
- 📱 **Telegram relay** → connect your own bot token, relay messages to/from any session
- 🔌 **Plugin system** → install plugins via `geeksy-plugin.json`, health-monitored with response times
- 🔍 **Ctrl+K search** → full-text search across all SQLite message history with snippet highlighting
- 📊 **Dashboard metrics** → live stats (messages, objectives, schedules, plugin health, uptime)
- 📱 **Responsive mobile** → bottom tab bar, slide-over drawers, iPhone safe area support
- 🔐 **Zero-knowledge auth** → encrypted backups (AES-256-GCM), safe mode with Telegram approvals

## Architecture

```
app/
├── server.ts              # Entry — Melina.js on port 3737
├── page.tsx               # Main gateway layout (SSR)
├── page.client.tsx        # Client orchestrator (105 lines)
├── css/                   # 10 modular CSS files → globals.css
│   ├── base.css           # Variables, grid shell
│   ├── chat.css           # Messages, markdown, code blocks
│   ├── search.css         # Ctrl+K modal
│   ├── mobile.css         # Responsive breakpoints
│   └── ...
├── lib/                   # Client & server modules
│   ├── sessions-ui.ts     # Session CRUD, selection, Telegram setup
│   ├── heartbeat-ui.ts    # Heartbeat toggle, tooltip, polling
│   ├── metrics-ui.ts      # Dashboard metrics with plugin health
│   ├── search-ui.ts       # Ctrl+K search modal
│   ├── heartbeat.ts       # Autonomous 60s execution loop
│   ├── tg-bot.ts          # Telegram bot with message queue + retry
│   ├── db.ts              # SQLite via sqlite-zod-orm
│   └── session-store.ts   # In-memory session map
└── api/                   # 22 API route directories
    ├── chat/              # SSE streaming chat
    ├── sessions/          # Session CRUD
    ├── search/            # Full-text message search
    ├── metrics/           # Dashboard + plugin health probing
    ├── plugins/           # Plugin install, start, stop
    ├── schedule/          # Task scheduling (cron, interval, once)
    ├── tg-bot/            # Telegram webhook relay
    ├── heartbeat/         # Heartbeat control
    ├── backup/            # Encrypted cloud backup/restore
    ├── p2p/               # WebRTC cross-instance communication
    └── ...
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | SSE streaming chat with session context |
| `/api/sessions` | GET/POST/PUT/DELETE | Session CRUD |
| `/api/search?q=` | GET | Full-text search across message history |
| `/api/metrics` | GET | Dashboard stats + plugin health probes |
| `/api/heartbeat` | GET/POST | Heartbeat status and control |
| `/api/plugins` | GET/POST/DELETE | Plugin lifecycle management |
| `/api/schedule` | GET/POST/DELETE | Task scheduling |
| `/api/tg-bot` | POST | Telegram bot message relay |
| `/api/models` | GET | Available LLM models |
| `/api/backup` | POST | Encrypted backup/restore |

## Sessions

Sessions replace the old "Agents" model. Each session has:
- **Type**: `web` (browser chat) or `telegram_bot` (relay via bot token)
- **Memory**: JSON key-value store persisted per session
- **Model**: Configurable per session (Gemini, Claude, GPT, DeepSeek)
- **Message history**: Full SQLite persistence with search

## Heartbeat

The autonomous heartbeat runs every 60 seconds:

1. **Guard checks** — skips if paused, no API key, or no pending work
2. **Work detection** — pending objectives, active plugins, running schedules
3. **Dynamic prompt** — builds context from current state
4. **Memory pruning** — auto-summarizes at 200+ messages, wipes legacy rows
5. **Telemetry** — tracks ticks, skips, failures, uptime

## Telegram Integration

Connect any Telegram bot to relay messages to Geeksy sessions:

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Add the bot token in session settings
3. Messages from Telegram route through the session's AI pipeline

Features: message queue with 3 retries, exponential backoff, rate limit handling (429), Markdown→plaintext fallback.

## Dependencies

| Package | Role |
|---------|------|
| `smart-agent-ai` | Agentic loop — Session, objectives, tool execution |
| `melina` | Web framework — SSR, file routing, client mount |
| `sqlite-zod-orm` | Database — Zod-validated SQLite schemas |
| `measure-fn` | Performance instrumentation |

## Deploy

```bash
# On server (e.g. 202.155.132.139)
git clone https://github.com/7flash/geeksy.git
cd geeksy && bun install
bgrun --name geeksy --command "bun run dev" --directory .

# Caddy reverse proxy
# geeksy.xyz { reverse_proxy localhost:3737 }
```

## License

MIT
