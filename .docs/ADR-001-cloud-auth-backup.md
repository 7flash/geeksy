# ADR-001: Cloud Auth & Encrypted Backup

**Status**: Accepted  
**Date**: 2026-03-07  
**Feature**: Geeksy Cloud Auth Backup

## Context

Geeksy stores all agent state in a local SQLite database (`data/agents.db`). If the machine is lost, wiped, or the user wants to run Geeksy on a second device, all agent conversations, objectives, schedules, and plugin configs are gone. Users need a way to:

1. **Authenticate** — Identify themselves across devices
2. **Backup** — Push encrypted snapshots of their local DB to the cloud
3. **Restore** — Pull and decrypt a snapshot onto a new device

## Decision

### Auth: GitHub OAuth (PKCE)

- GitHub OAuth via PKCE flow (no client secret needed)
- Token stored in `localStorage` as `geeksy:github_token`
- Server validates token on each backup/restore request via GitHub API
- User identity = GitHub user ID (stable, unique)
- **Why GitHub**: Same as WARMAPS auth. Developers already have accounts. No password management.

### Encryption: AES-256-GCM (Client-Side)

- **Passphrase-based**: User provides a backup passphrase (never sent to server)
- **Key derivation**: PBKDF2 with 100k iterations, random salt
- **Encryption**: AES-256-GCM with random IV per backup
- **Flow**: `SQLite DB → export JSON → compress (gzip) → encrypt (AES-256-GCM) → upload`
- **Restore**: `download → decrypt → decompress → import JSON → SQLite`
- **Zero-knowledge**: Server only sees opaque encrypted blobs. Cannot read agent data.

### Storage: Bun S3-Compatible (Cloudflare R2)

- Store encrypted backups in R2 (S3-compatible, free egress)
- Path: `backups/{github_user_id}/{timestamp}.enc`
- Keep last 5 backups per user (auto-prune older)
- Max backup size: 50MB (compressed + encrypted)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Client (Browser)                 │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Settings │→ │ Auth via │→ │ Backup/Restore│  │
│  │   Panel  │  │ GitHub   │  │ with AES-256  │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
│                                      │           │
│                            encrypt/decrypt       │
│                            (Web Crypto API)      │
└──────────────────────────────────────┼───────────┘
                                       │
                              POST /api/backup
                              GET  /api/backup/list
                              GET  /api/backup/:id
                                       │
┌──────────────────────────────────────┼───────────┐
│                 Server (Bun)         │           │
│                                      ▼           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Validate │→ │ Export DB│→ │ Upload to R2  │  │
│  │ GH Token │  │ as JSON  │  │ (encrypted)   │  │
│  └──────────┘  └──────────┘  └───────────────┘  │
└──────────────────────────────────────────────────┘
```

## API Endpoints

### `GET /api/auth/github` — Initiate OAuth
Returns GitHub OAuth URL for PKCE flow.

### `GET /api/auth/github/callback` — Complete OAuth
Exchanges code for access token. Returns token to client.

### `GET /api/auth/me` — Get user info
Validates stored token, returns GitHub profile (id, login, avatar).

### `POST /api/backup` — Create backup
```json
// Request body (from client after encrypting):
{
  "data": "<base64 encrypted blob>",
  "salt": "<base64 salt>",
  "iv": "<base64 iv>",
  "tables": ["agents", "messages", "objectives", "files", "schedules", "agentState", "plugins"]
}
```

### `GET /api/backup/list` — List backups
Returns `[{ id, timestamp, size, tables }]` (last 5).

### `GET /api/backup/:id` — Download backup
Returns encrypted blob + salt + iv for client-side decryption.

### `DELETE /api/backup/:id` — Delete backup
Removes a specific backup.

## UI: Settings Panel Extension

Add "Cloud Backup" section to existing Settings panel:

```
┌─────────────────────────────────────┐
│ ☁️ Cloud Backup                      │
│                                     │
│ [Not signed in]                     │
│ [🔗 Sign in with GitHub]            │
│                                     │
│ ─── After sign-in ───               │
│                                     │
│ 👤 @username   [Sign out]           │
│                                     │
│ 🔑 Backup Passphrase               │
│ [••••••••••••••] [👁]               │
│                                     │
│ [⬆ Backup Now]  [⬇ Restore]        │
│                                     │
│ 📋 Previous Backups:                │
│   • 2026-03-07 13:45 — 2.1 MB      │
│   • 2026-03-06 09:12 — 1.8 MB      │
│   • 2026-03-05 22:30 — 1.7 MB      │
│                                     │
│ ⚙ Auto-backup: [Every 24h ▼]       │
└─────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Auth (2 files)
- `app/api/auth/github/route.ts` — OAuth initiate + callback
- `app/api/auth/me/route.ts` — Token validation
- Client: GitHub login button in Settings panel

### Phase 2: Backup/Restore (3 files)
- `app/lib/crypto.ts` — Client-side AES-256-GCM encrypt/decrypt using Web Crypto API
- `app/api/backup/route.ts` — CRUD for encrypted backups
- Server-side: DB export as JSON + R2 upload

### Phase 3: UI (1 file)
- Extend `app/lib/settings.tsx` with Cloud Backup section
- Backup progress indicator, restore confirmation modal

### Phase 4: Auto-backup (enhancement)
- Optional periodic backup (configurable interval)
- Auto-backup on agent completion
- Conflict detection on restore (newer local vs newer cloud)

## Data Exported

All tables from `db.ts`:
- `agents` — Agent configs (name, model)
- `messages` — Full conversation history
- `objectives` — Task goals and results
- `files` — File access logs
- `schedules` — Scheduled tasks
- `agentState` — Key-value agent memory
- `plugins` — Plugin configs

**Excluded**: Runtime state (streaming, DOM refs, tool cards)

## Security Considerations

1. **Passphrase never leaves client** — PBKDF2 key derivation happens in browser
2. **Server is zero-knowledge** — Only sees encrypted blobs
3. **GitHub token in localStorage** — Same security model as existing skill state
4. **R2 access** — Server-side only, credentials in `.config.toml`
5. **No auto-restore** — User must explicitly trigger restore + confirm overwrite
6. **Salt + IV per backup** — Each backup has unique cryptographic material
