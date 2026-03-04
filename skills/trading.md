---
name: pumpfun-trading
description: Trade Pump.fun tokens via the market maker dashboard API. Add tokens, configure buy ranges, manage positions.
---

# Pump.fun Trading

You can manage token trading via the dashboard HTTP API at `http://localhost:3457`.

## Add a token to start trading

```bash
curl -X POST http://localhost:3457/api/token \
  -H "Content-Type: application/json" \
  -d '{"action":"add","mint":"TOKEN_MINT_ADDRESS"}'
```

This inserts the token into the database and spawns a per-token worker process that automatically buys and sells based on configured parameters.

## Remove a token (stop trading)

```bash
curl -X POST http://localhost:3457/api/token \
  -H "Content-Type: application/json" \
  -d '{"action":"remove","mint":"TOKEN_MINT_ADDRESS"}'
```

## Configure buy range and interval

Control when the bot buys based on market cap (USD) and time between buys:

```bash
curl -X POST http://localhost:3457/api/token \
  -H "Content-Type: application/json" \
  -d '{"action":"set-buy-range","mint":"TOKEN_MINT_ADDRESS","buyMinMcap":5000,"buyMaxMcap":50000,"buyIntervalS":30}'
```

- `buyMinMcap`: minimum market cap in USD to buy (0 = no floor)
- `buyMaxMcap`: maximum market cap in USD to buy (0 = no ceiling)
- `buyIntervalS`: seconds between buys (default 30)

## Sell all positions for a token

```bash
curl -X POST http://localhost:3457/api/token \
  -H "Content-Type: application/json" \
  -d '{"action":"sell-all","mint":"TOKEN_MINT_ADDRESS"}'
```

## Nuke (sell all + remove token)

```bash
curl -X POST http://localhost:3457/api/token \
  -H "Content-Type: application/json" \
  -d '{"action":"quit","mint":"TOKEN_MINT_ADDRESS"}'
```

## Get current trading status

```bash
curl http://localhost:3457/api
```

Returns JSON with all positions, prices, wallet balances, and active token summaries.

## Mint address format

Pump.fun mint addresses are base58-encoded Solana public keys, typically ending in `pump`.
Example: `CQm5FE2dSAdxCCt159EY7eGVfu425nBTCfxjZYjXpump`

To extract mint addresses from text:
```javascript
const mints = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}pump/g) || []
```

## Writing a token listener script

To automatically trade tokens mentioned in external sources (telegram, twitter, etc), create a script like:

```typescript
// Listen for new tokens and start trading them
const DASHBOARD = 'http://localhost:3457'

async function addToken(mint: string) {
    await fetch(`${DASHBOARD}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', mint }),
    })
    // Optionally configure buy range
    await fetch(`${DASHBOARD}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'set-buy-range',
            mint,
            buyMinMcap: 5000,
            buyMaxMcap: 50000,
            buyIntervalS: 30,
        }),
    })
}

// Your token source goes here — telegram, twitter, webhook, etc.
// Call addToken(mintAddress) for each new token discovered.
```

Schedule this script with bgrun for persistent execution:
```bash
bgrun --name my-listener --command "bun run my_listener.ts" --directory .
```
