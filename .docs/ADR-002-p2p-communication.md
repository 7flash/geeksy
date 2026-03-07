# ADR-002: Cross-Instance P2P Communication

**Status**: Draft  
**Date**: 2026-03-07  
**Feature**: Cross-instance P2P Communication via WebRTC

## Context

Geeksy runs as a local server on each user's machine. Users may want to:

1. **Remote assistance** — Ask an agent on another machine to help with a task
2. **Shared agent memory** — Let agents on different instances share knowledge
3. **Multi-device orchestration** — Run coordinated tasks across machines without port-forwarding

Currently, each Geeksy instance is isolated. No way to communicate between instances without exposing ports or using a central server.

## Decision

### WebRTC Data Channels with Signaling Server

- **Transport**: WebRTC data channels (peer-to-peer, NAT-traversal built-in)
- **Signaling**: Lightweight WebSocket signaling via a free STUN/TURN relay
- **Discovery**: GitHub user ID as peer identity (reuse Cloud Auth)
- **Protocol**: JSON-RPC over data channels for agent commands

### Architecture

```
┌──────────────────┐    WebRTC Data Channel    ┌──────────────────┐
│  Geeksy (Home)   │◄────────────────────────►│  Geeksy (Work)   │
│                  │   NAT-traversal via ICE   │                  │
│  Agent A         │                           │  Agent B         │
│  Skills: trading │                           │  Skills: OSINT   │
└──────────────────┘                           └──────────────────┘
         │                                              │
         └──────────┐                    ┌──────────────┘
                    ▼                    ▼
              ┌─────────────────────────────┐
              │   Signaling Server (WS)     │
              │   For SDP/ICE exchange only │
              │   No data passes through    │
              └─────────────────────────────┘
```

### JSON-RPC Protocol

```typescript
// Request: ask remote agent to execute
{ method: "agent.run", params: { prompt: "...", skills: ["trading"] } }

// Response: stream results back
{ method: "agent.stream", params: { chunk: "...", done: false } }

// Request: query remote agent memory
{ method: "state.get", params: { key: "market_analysis" } }

// Request: list remote skills
{ method: "skills.list", params: {} }
```

## Implementation Phases

### Phase 1: Signaling + Connection (MVP)
- WebSocket signaling endpoint on existing Geeksy server
- Peer discovery via GitHub user ID
- WebRTC data channel establishment
- Connection status UI in Settings panel

### Phase 2: Remote Agent Commands
- JSON-RPC protocol over data channels
- `agent.run` — send prompt to remote agent
- `agent.stream` — receive streaming response
- Chat UI integration (select remote agent target)

### Phase 3: Shared Knowledge
- `state.get/set` — read/write remote agent memory
- Skill sharing — list and invoke remote skills
- Conflict resolution for shared state

## Security

1. **GitHub auth required** — Both peers must be authenticated
2. **Peer approval** — Incoming connections require user confirmation
3. **E2E encryption** — WebRTC DTLS provides transport encryption
4. **Scoped access** — Remote agents can only access explicitly shared skills/state
