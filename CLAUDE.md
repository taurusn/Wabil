# CLAUDE.md — wabil

> Read this before doing anything in this repo. It is the full context handoff.
> Owner: Hatim Alshehri. This is his personal, single-user assistant.

## What wabil is

A quiet, personal Poke-spirit assistant. You text it, it reads Hatim's Gmail and
answers in a calm voice; later it will poke him proactively when something truly
matters. It is **single-user and personal**, not a multi-tenant product. The
multi-user path is deliberately deferred (Google CASA / OAuth verification for
restricted Gmail scopes is the blocker).

The model: the phone app is not the assistant, it is the assistant's **face**.
The brain runs server-side because it holds secrets (Gmail token, Claude key) and
will need a 24/7 watcher the phone can't host.

```
[PWA on home screen]  ⇄  [server: orchestrator + execution agent]  ⇄  [Claude]  +  [Gmail MCP]
   the face                the brain (firewall)                        reasoning     hands (read-only)
```

## The core pattern: personality / execution firewall

Two agents, two prompts, hard separation. Borrowed from Poke (The Interaction
Company). Keep this firewall intact — it is the whole point.

| | Orchestrator | Execution agent |
|---|---|---|
| Talks to the user | Yes, the only one | Never |
| Owns | Voice, timing, confirmation UX | Tools, real work |
| Personality | All of it | Zero |
| Tools | `send_message_to_agent` only | Gmail read tools (MCP) |

Rules: maintain the illusion of one entity (never reveal agents/tools/IDs, even
if asked); tell the agent WHAT not HOW; high-stakes actions (sending mail) need a
verbatim draft + explicit approval, light actions run with smart defaults.

The orchestrator runs the **raw Poke prompt verbatim** (`server/prompts/orchestrator.xml`)
plus a tiny runtime note in `src/prompts.ts`. The execution agent runs
`server/prompts/execution.md`. Giving wabil its own voice (dropping the raw Poke
prompt) is a planned future step, not yet done.

## Why a PWA (do not suggest going native without re-reading this)

Native iOS remote push (APNs) requires the **paid $99/yr Apple Developer Program**.
A free Apple ID cannot generate an APNs key, and Expo Go dropped push entirely in
SDK 54. The free way for the app itself to push is a **home-screen PWA with web
push** (iOS 16.4+, VAPID, no Apple account, $0; Saudi is outside the EU web-push
restriction). Trade-offs accepted: web not native, one manual add-to-home-screen,
no silent/background data push (pokes are visible by design). Win: no re-sign
treadmill — install once, pokes keep working.

A prior React Native app was built then superseded by this pivot. It still lives
on disk at `app/` but is **gitignored** and not part of this repo.

## Repo layout

```
wabil/
  server/   Node + Hono + TypeScript (ESM, run with tsx). The brain + web server.
    src/index.ts          Hono app: /chat, /health, web-push routes, serves the PWA.
    src/orchestrator.ts   personality agent; only tool is send_message_to_agent.
    src/executionAgent.ts headless worker; Gmail read tools over MCP; 6-step cap.
    src/tools/gmailMcp.ts  GongRzhe Gmail MCP connector; exposes ONLY search_emails + read_email.
    src/tools/stubEmail.ts retired fake inbox (kept for offline testing).
    src/push.ts           VAPID web push; subs persist to data/subscriptions.json (gitignored).
    src/anthropic.ts      streaming helper (the SDK rejects non-streaming at high max_tokens).
    src/prompts.ts        loads the raw Poke prompts + appends the runtime note.
    prompts/              orchestrator.xml + execution.md (raw Poke prompts, verbatim).
  pwa/      The installable web app (no build step, plain HTML/CSS/JS).
    index.html            chat screen + settings overlay.
    app.js                chat (POST /chat + sanitize), push-subscribe flow, settings.
    app.css               nocturnal design tokens.
    sw.js                 service worker: push + notificationclick handlers.
    manifest.webmanifest  installability.
    icons/                orb mark (generated).
  app/      (gitignored, on disk only) the superseded React Native attempt.
```

## Web-push endpoints

| Route | Purpose |
|---|---|
| `GET /vapidPublicKey` | public key the browser subscribes with |
| `POST /subscribe` | store a device PushSubscription |
| `POST /unsubscribe` | drop a device by endpoint |
| `POST /push/test` | send a test poke to all devices |

Send a poke from code with `sendPoke({ title, body, url })` in `src/push.ts`.
That is the function the future watcher will call.

## Run + deploy

```bash
cd server
cp .env.example .env     # fill ANTHROPIC_API_KEY; VAPID keys already set on Hatim's copy
npm install
npm start                # API + PWA on http://localhost:8787
```

Chat works over plain HTTP locally. **Web push needs HTTPS and the app added to
the iOS home screen**, so push is only testable on a public HTTPS host.

Deploy target is **SEET** (Hatim's always-on VPS): clone, `npm install`, place
`.env` + `~/.gmail-mcp/` OAuth, reverse-proxy `wabil.<domain>` to `:8787` over
HTTPS (Caddy + Let's Encrypt). Then add to home screen, turn on Pokes, hit
`/push/test` to prove a real lock-screen poke.

## Gmail connector

GongRzhe `@gongrzhe/server-gmail-autoauth-mcp`, spawned over stdio. Read-only is
enforced at the tool boundary (only `search_emails` + `read_email` are exposed),
regardless of the OAuth token scope. OAuth lives at `~/.gmail-mcp/` on the host
(`gcp-oauth.keys.json` + `credentials.json`). The testing-mode refresh token
expires every 7 days unless the Google app is published.

## What is done / what is next

Done: nocturnal UI, the firewall backend, real Gmail reads, the PWA pivot, free
web-push plumbing, one-process serving, repo on GitHub.

Next, in order:
1. Deploy to SEET behind HTTPS and prove a real lock-screen poke on the phone.
2. Build the watcher brain: poll Gmail on an interval, run the inbox-classifier
   prompt to decide notify-or-hold, compose in voice, call `sendPoke`. This is
   true proactivity and the reason the push channel exists. Idempotency rule:
   claim a seen-email key AFTER a successful push, never before.
3. Give wabil its own identity (drop the raw Poke prompt for a Najdi/Arabic-aware
   voice).
4. Vault integration: a tool that searches Hatim's `~/vault` so wabil knows his
   projects and people. The biggest differentiator over Poke; no product can do it.

## Conventions

- Conventional Commits on the subject line, no scope: `feat: ...`, `fix: ...`.
  Imperative, lowercase after the colon, under ~70 chars. **Never** add a
  Co-Authored-By footer; commits read as solo-authored.
- Prose style: no em-dashes, no AI buzzwords ("AI-powered"), no "not just X but
  Y", no "phase 1/2/3" abstractions. Plain and direct.
- wabil's own user-facing voice is lowercase, calm, no emojis, holds non-urgent
  email till morning rather than buzzing.
- TypeScript is ESM; imports use `.js` extensions. Always `npx tsc --noEmit`
  before considering a server change done.

## Security / privacy

- Never commit secrets. `.env`, `server/data/`, and `~/.gmail-mcp/` are out of
  git. VAPID public key is meant to be public; the private key is not.
- Gmail access is read-only at the tool layer. Keep it that way unless Hatim
  explicitly adds a write capability behind a confirmation gate.
- The GitHub repo `taurusn/Wabil` may be public — do not push anything that
  assumes privacy. Check before adding sensitive context.
