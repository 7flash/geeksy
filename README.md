# geeksy

Chat interface for autonomous AI agents. Built with [Melina.js](https://github.com/7flash/melina), powered by [smart-agent](https://github.com/7flash/smart-agent) and [jsx-ai](https://github.com/7flash/jsx-ai).

```
┌────────────────────────────────────────────────────────────────┐
│  Geeksy                                          gemini-2.5 ▼ │
├──────────┬─────────────────────────────────────────────────────┤
│ Agents   │                                                    │
│          │                  🤖 Geeksy                         │
│ + New    │     Create an agent and describe what you want.     │
│          │                                                    │
│          │   [tell me a joke]  [list files]  [create file]    │
│          │                                                    │
│          ├─────────────────────────────────────────────────────┤
│          │  Type your command or question...            [➤]   │
│          ├─────────────────────────────────────────────────────┤
│ Models   │  Objectives │ Files │ Schedule                     │
│ Skills   │  No objectives yet.                                │
│ Plugins  │                                                    │
├──────────┴─────────────────────────────────────────────────────┤
│ ⚙ Settings                                                    │
└────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
bun install
bun run dev
# → http://localhost:3737
```

Set an API key in the Settings panel or via environment:

```bash
export GEMINI_API_KEY=your-key
bun run dev
```

## How It Works

1. **Create an agent** — click "New Agent", pick a model, add skills
2. **Chat** — type a message, the agent plans objectives and executes them
3. **Watch** — objectives, tool calls, and file changes stream in real-time via SSE

Under the hood:
- **[smart-agent](https://github.com/7flash/smart-agent)** runs the agentic loop — planner generates objectives, worker executes tools, validator checks success
- **[jsx-ai](https://github.com/7flash/jsx-ai)** handles LLM calls — provider routing (Gemini, OpenAI, Anthropic, DeepSeek), streaming, retries
- **[Melina.js](https://github.com/7flash/melina)** serves the frontend — SSR + vanilla client runtime, zero React on the client

## Project Structure

```
app/                    # Melina.js chat frontend
├── server.ts           # Entry point — starts Melina on port 3737
├── page.tsx            # Main chat page (SSR)
├── globals.css         # Dark theme styles
├── lib/                # Client-side modules
│   ├── agents.tsx      # Agent CRUD + chat logic
│   ├── chat.tsx        # SSE streaming + message rendering
│   └── settings.tsx    # API key management
└── api/                # Backend API routes
    ├── chat/route.ts   # SSE streaming chat endpoint (Session pipeline)
    ├── agents/route.ts # Agent management (in-memory)
    ├── models/route.ts # Model listing + API key storage
    ├── skills/route.ts # Skill file discovery
    └── schedule/route.ts
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Start a chat session, returns SSE stream |
| `/api/agents` | GET/POST/PUT/DELETE | Agent CRUD |
| `/api/models` | GET | List available LLM models |
| `/api/models/keys` | GET/POST | API key management |
| `/api/skills` | GET | List available skill files |

## Dependencies

| Package | Role |
|---------|------|
| `smart-agent-ai` | Agentic loop — Agent, Session, objectives, skills |
| `jsx-ai` | LLM primitives — callLLM, callText, streamLLM |
| `melina` | Web framework — SSR, routing, client runtime |
| `measure-fn` | Performance instrumentation |
| `satidb` | SQLite persistence (Zod schemas) |

## License

MIT
