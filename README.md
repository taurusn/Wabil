# wabil

A quiet, personal Poke-spirit assistant. A PWA (the face) backed by an always-on
server (the brain) that runs a personality/execution firewall over Claude,
reads your Gmail, and pokes you only when something truly matters.

Single-user, personal. Not a multi-tenant product.

## Why a PWA

Native iOS remote push (APNs) needs the paid Apple Developer Program. A
home-screen PWA gets **free web push** (iOS 16.4+) with no Apple account — the
server pushes straight to the installed app via VAPID. The chat is the face; the
push channel is how proactive pokes reach the lock screen.

## Layout

```
wabil/
  server/   Node + Hono + Claude. Orchestrator → execution agent → Gmail MCP.
            Also serves the PWA and the web-push endpoints.
  pwa/      The installable web app (nocturnal UI). Chat + settings + push subscribe.
  app/      (on disk, NOT in this repo) the original React Native attempt, superseded.
```

### Server (`server/`)
- `src/index.ts` — Hono app: `/chat`, `/health`, web-push routes, serves `pwa/`.
- `src/orchestrator.ts` — the personality agent; only tool is `send_message_to_agent`.
- `src/executionAgent.ts` — headless worker; talks to Gmail (read-only) over MCP.
- `src/tools/gmailMcp.ts` — GongRzhe Gmail MCP connector (read tools only).
- `src/push.ts` — VAPID web push; subscriptions persist to `data/subscriptions.json`.

### Web push endpoints
| Route | Purpose |
|---|---|
| `GET /vapidPublicKey` | public key for the browser to subscribe |
| `POST /subscribe` | store a device's PushSubscription |
| `POST /unsubscribe` | drop a device by endpoint |
| `POST /push/test` | send a test poke to all devices |

## Run locally

```bash
cd server
cp .env.example .env      # fill ANTHROPIC_API_KEY; VAPID keys are pre-generated for the deployed copy
npm install
npm start                 # serves API + PWA on http://localhost:8787
```

Open `http://localhost:8787`. Chat works over plain HTTP; **web push needs HTTPS**
and the app must be added to the iOS home screen.

## Deploy (SEET)

1. Clone onto the VPS, `npm install` in `server/`.
2. Put `.env` in place (Claude key + VAPID keys + Gmail OAuth at `~/.gmail-mcp/`).
3. Reverse-proxy `wabil.<domain>` → `localhost:8787` over HTTPS (Caddy/Let's Encrypt).
4. On the phone: open the site in Safari → Share → Add to Home Screen → open it →
   Connections → turn on Pokes (grants notifications) → "send a test poke" to verify.

## Status

- Phases 1–3 done: nocturnal UI, backend firewall, real Gmail reads.
- This repo is the PWA pivot: free web-push delivery + one-process serving.
- Next: the watcher brain (poll Gmail → classify → `sendPoke`) for true proactivity.
