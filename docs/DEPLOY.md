# Geeksy Deployment Runbook

## Goal
Deploy Geeksy as a long-running Bun app behind Caddy using `bgrun`.

## Prerequisites
- Bun installed on the server
- Git installed on the server
- Caddy installed on the server
- A domain pointed at the server
- Required model/provider API keys available as environment variables

## Do not deploy with committed secrets
Use environment variables or server-local secret files. Do **not** rely on tracked local config for production secrets.

## Required environment variables
At minimum, set one model provider key:

- `GEMINI_API_KEY`
- or `GOOGLE_API_KEY`
- or `ANTHROPIC_API_KEY`
- or `OPENAI_API_KEY`
- or `DEEPSEEK_API_KEY`

Optional:
- `BUN_PORT` (default: `3737`)
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BGR_PORT`

## Server setup
```bash
cd /srv
git clone https://github.com/7flash/geeksy.git
cd geeksy
bun install
```

## Start Geeksy with bgrun
Run Geeksy on port 3737 by default:

```bash
export GEMINI_API_KEY=your-key
export BUN_PORT=3737

bgrun --name geeksy \
  --directory /srv/geeksy \
  --command "bun run start"
```

## Restart after updates
```bash
cd /srv/geeksy
git pull
bun install
bgrun --restart geeksy
```

## Caddy config
```caddy
geeksy.example.com {
  reverse_proxy 127.0.0.1:3737
}
```

Then reload Caddy:
```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

## Health checks
```bash
curl -I http://127.0.0.1:3737
curl http://127.0.0.1:3737 | head
bgrun status
```

Expected:
- HTTP 200 from local app
- Geeksy HTML from `/`
- `geeksy` process shown as running in `bgrun`

## Upgrade flow
```bash
cd /srv/geeksy
git pull --ff-only
bun install
bgrun --restart geeksy
curl -I http://127.0.0.1:3737
```

## Rollback
```bash
cd /srv/geeksy
git log --oneline -5
git checkout <last-good-commit>
bun install
bgrun --restart geeksy
```

## Immediate deployment checklist
1. Confirm target server hostname / IP
2. Confirm target domain
3. Confirm which API key provider will be used in production
4. SSH into server
5. Clone/update repo
6. Export env vars
7. Start or restart `geeksy` with `bgrun`
8. Add Caddy reverse proxy
9. Verify `HTTP 200`
10. Open the live URL and smoke test chat + sessions
