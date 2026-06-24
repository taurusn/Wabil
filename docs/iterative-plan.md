# wabil — Iterative Messaging Plan (the "on it" architecture)

> Status: PLAN (not built). Owner: Hatim. Written 2026-06-25.
> Goal: make wabil text like a human — acknowledge instantly ("on it"), work in
> the background, come back with the answer as a *separate* message, send several
> short bubbles, and offer taps instead of forcing you to type.

## Why this is not a spirit change

The authentic Poke prompt (`server/prompts/orchestrator.xml`, byte-identical to
the leak) already *wants* all of this: it has `wait`, `request_user_approval`,
`react_to_message`, and the Apple-Messages UX rules (plain text unless a discrete
choice needs a picker). Our current runtime **muzzles** it by collapsing every
turn into one synchronous string (`runOrchestrator` awaits the agent inline and
returns one reply). This plan builds the **stage** the prompt was written for. No
prompt edits.

## Locked decisions

- **Humanity:** YES. Stagger bubbles with typing delays + thinking dots between,
  so wabil feels like a person firing off texts (not one wall of text).
- **Durability:** PERSIST pending tasks. Driven by the closed-app long-reply case
  (below): a follow-up must still fire even if the server restarts mid-task.
- **Transport:** SSE while the app is open; web push when it's closed.
- **Two push types kept strictly separate** so a chat-reply push and an inbox
  poke can never merge (see §5).

---

## 1. Conversation runtime (the spine)

Replace "return a string" with a per-session runtime (`server/src/runtime.ts`).

- Give the orchestrator its real tools: `send_message_to_agent`, **`wait`**,
  `request_user_approval`, `react_to_message`.
- `send_message_to_agent(name, task)` → start `runExecutionAgent(task)` as a
  **background promise** (NOT awaited); tool_result = `"dispatched"`. The model
  can now emit "on it 🫡" and call `wait`.
- `wait` → tool_result `"(ok)"`, then **stop the loop**: deliver emitted
  messages, persist, end the turn. Nothing is sent to the user beyond what was
  already emitted.
- **Agent-completion handler:** when a background agent resolves, append
  `<agent sentAt=…>result</agent>` to that session's transcript and **re-invoke**
  the loop → the model writes the follow-up message(s).
- Fast path unchanged: no agent + no `wait` + just text → emit → done (today's
  behavior, e.g. "hey" → "hey! what's up?").

Parallelism: multiple `send_message_to_agent` in one turn → multiple background
agents; re-invoke per result (the model decides when it has enough). Track a
pending count per session.

## 2. Transport — multiple messages over time

Split the two directions:

- **User → server:** stays `POST /chat` — one user message (or one option tap) at
  a time.
- **Server → user:** new **SSE** endpoint `GET /stream?session=…` (Hono
  `streamSSE`). The app opens an `EventSource`; every `emit()` pushes a
  `message` / `bubble` / `card` event live. EventSource auto-reconnects; on
  reconnect the app pulls `/history` and dedupes by id (already implemented).
- **Closed-app fallback:** if a session has **no live SSE connection**, `emit()`
  routes the follow-up through `sendPoke` (the web push we already built) as a
  **chat-reply** push (see §5). Tap → opens the chat at that message.

SSE over WebSocket on purpose: server→client is one-way, SSE is simpler, and it
is native in the PWA.

## 3. Multiple bubbles + humanity

- `emit()` parses the model's text: keep each `<block>…</block>` as ONE bubble;
  split the rest on blank lines into separate bubbles. (`<aside>` already
  stripped in `sanitize.ts` — add `<block>` handling there.)
- Each bubble = its own stored message + its own SSE event.
- **Stagger:** the client reveals bubbles with a typing delay (~400–700ms each)
  and the thinking dots between, so a multi-bubble answer *arrives* like someone
  typing several texts. Server may also pace emits slightly; the client owns the
  feel.

## 4. Options / quick-replies / approval cards

The "offer taps, don't make me type" behavior. The prompt already gates this
(Apple UX rules: *plain text unless a discrete choice needs a picker*; *no forms
for a single question*) — we only give it the tools.

- `request_user_approval(...)` → an **approval card**: the verbatim draft (e.g. an
  email) + `[Send] [Edit] [Cancel]`. Wires into the email-send gate we built —
  "Send" tap dispatches `send_email`.
- `offer_options(prompt, options[])` → a **choice card**: prompt bubble + tappable
  chips. Used ONLY for discrete choices; free-text questions stay plain text.
- Both **yield the turn** (like `wait`) until the user taps. The tap POSTs the
  chosen value back through `/chat` as the user's next message → re-invokes the
  orchestrator. Client: render chips under the last bubble; disable after tap;
  ignore stale taps by matching a pending-card id.

## 5. Push separation — inbox pokes vs chat replies (NO mis-merge)

The risk: you text wabil, it says "on it", you close the app, it finishes later
and pushes the answer — that push must NEVER be confused with, or overwrite, a
watcher poke about a new email. Web push collapses notifications that share a
`tag`, so the fix is two **separate tag namespaces** and two **separate
pipelines**:

| | Inbox poke | Chat reply |
|---|---|---|
| source | watcher/classifier ONLY | conversation runtime ONLY |
| `kind` | `inbox` | `chat` |
| `tag` | `wabil-inbox-<emailId>` | `wabil-chat-<msgId>` |
| opens (url) | `/digest` | `/?m=<msgId>` → chat scrolled to the reply |
| body | the composed poke about an email | the actual chat follow-up |

Rules:
- `sendPoke` takes `{ kind, tag, url, title, body }`. The watcher always sets
  `kind:'inbox'`; the runtime fallback always sets `kind:'chat'`. They share only
  this one function.
- `sw.js` routes the tap by `data.url`; the distinct tags guarantee the two kinds
  **stack as separate notifications** and never replace each other.
- The classifier only ever reads Gmail — there is **no code path** for a
  conversation message to enter the watcher, or for an inbox email to become a
  chat-reply push. The separation is structural, not a runtime check.
- If the app is OPEN, the chat follow-up goes over SSE (no push at all); the
  watcher still pushes (it's proactive). So an open app never double-notifies.

## 6. Durability & idempotency

- **`tasks` table** (SQLite): persist each dispatched background task
  `{ id, session_id, agent, task, status, created_at }`. On completion → mark
  done, reconstruct context (session messages + the agent result), emit the
  follow-up. On server boot → re-dispatch any `status='pending'` task so a restart
  mid-work still produces the follow-up (this is what makes the closed-app
  long-reply case reliable).
- **Pending cards** (options/approval) persisted similarly so a tap after a
  restart still resolves.
- Every emitted message has an id; SSE + `/history` + push all key on it →
  no duplicates at reconnect or across the push/in-app surfaces.

## 7. Data shapes (sketch)

- Outbound SSE event: `{ type: 'bubble'|'card'|'reaction', id, sessionId, ... }`.
- Card: `{ type:'card', id, prompt, options:[{label, value}], cardKind:'approval'|'choice' }`.
- `POST /chat` accepts either `{ text, replyToId? }` or `{ optionTap:{ cardId, value } }`.
- `sendPoke({ kind:'inbox'|'chat', tag, url, title, body })`.
- `tasks` table as in §6.

## 8. Build order (each step ships on its own)

1. **Runtime + SSE** (§1+§2 core): `/chat` emits over `/stream`; agents go async;
   implement `wait`. Unlocks "on it → later message" for an open app.
2. **Push fallback + separation** (§2 fallback + §5): closed-app chat-reply pushes,
   with the inbox/chat tag split. Closes your concern.
3. **Multi-bubble + stagger** (§3): the human texting feel.
4. **Options / approval cards** (§4): taps instead of typing; the email-send
   confirmation tap.
5. **Durability** (§6): the `tasks` table + boot re-dispatch (can fold into step 1
   if we want it robust from day one — recommended given the closed-app case).

## 9. Open decisions

- Step 5 timing: build durability into step 1, or ship in-memory first and harden
  later? (Leaning: build it in from step 1, because the closed-app case is the
  whole point.)
- Bubble stagger pacing: client-only delay, or server also paces emits?
