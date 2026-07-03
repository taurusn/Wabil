import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { config } from './config.js';
import { runOrchestrator, type ChatMessage } from './orchestrator.js';
import * as runtime from './runtime.js';
import * as bus from './bus.js';
import {
  addSubscription,
  removeSubscription,
  sendPoke,
  subscriptionCount,
  pushReady,
  type PushSub,
} from './push.js';
import { startWatcher, watcherStatus, tick } from './watcher.js';
import { buildDigest, DIGEST_PAGE } from './digest.js';
import * as store from './store.js';

const app = new Hono();
app.use('/health', cors());
app.use('/chat', cors());
app.use('/stream', cors());
app.use('/presence', cors());
app.use('/history', cors());
app.use('/vapidPublicKey', cors());
app.use('/subscribe', cors());
app.use('/unsubscribe', cors());
app.use('/push/*', cors());
app.use('/watch/*', cors());
app.use('/api/*', cors());

app.get('/health', (c) =>
  c.json({ ok: true, model: config.model, push: pushReady(), subscribers: subscriptionCount() })
);

const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .min(1),
});

app.post('/chat', async (c) => {
  if (!config.anthropicKey) {
    return c.json({ error: 'server missing ANTHROPIC_API_KEY (set it in server/.env)' }, 500);
  }
  const body = (await c.req.json().catch(() => null)) as any;

  // Stateful, iterative contract: { text, replyToId? }. Persist the turn and
  // hand it to the runtime; the reply (or replies) stream back over GET /stream,
  // and fall back to a chat push if the app is closed. Returns immediately.
  if (body && typeof body.text === 'string') {
    const text = body.text.trim();
    if (!text) return c.json({ error: 'text is empty' }, 400);
    const replyToId = typeof body.replyToId === 'string' ? body.replyToId : null;
    const userMsg = store.addMessage({ role: 'user', content: text, replyToId });
    runtime.handleUserMessage(userMsg);
    return c.json({ id: userMsg.id, ts: userMsg.ts, sessionId: userMsg.sessionId });
  }

  // Legacy stateless contract: { messages:[...] } (kept until clients migrate).
  const parsed = ChatBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'body must be { text, replyToId? } or { messages }' }, 400);
  }
  try {
    const reply = await runOrchestrator(parsed.data.messages as ChatMessage[]);
    return c.json({ reply });
  } catch (err: any) {
    console.error('[chat] error:', err?.message || err);
    return c.json({ error: err?.message || 'orchestrator failed' }, 500);
  }
});

// ---- presence: the app says whether it's on-screen, so we know when to push ----
app.post('/presence', (c) => {
  bus.setPresence(c.req.query('active') !== 'false');
  return c.json({ ok: true });
});

// ---- chat history (pagination: ?limit, ?before=<ts cursor>) ----
app.get('/history', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 40, 1), 200);
  const beforeRaw = Number(c.req.query('before'));
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  return c.json({ messages: store.history(limit, before) });
});

// ---- live assistant stream (SSE). Single-user, so one global stream: every
// emitted bubble/typing/card reaches the open app. Replies for POST /chat arrive
// here, including follow-ups that land minutes after an "on it". ----
app.get('/stream', (c) =>
  streamSSE(c, async (stream) => {
    // Serialize writes per connection so events keep their order.
    let writes = Promise.resolve();
    const unsub = bus.subscribe((e) => {
      writes = writes.then(() => stream.writeSSE({ data: JSON.stringify(e) })).catch(() => {});
    });
    stream.onAbort(unsub);
    try {
      while (!stream.aborted) {
        await stream.sleep(15000);
        await stream.writeSSE({ event: 'ping', data: '' });
      }
    } finally {
      unsub();
    }
  })
);

// ---- web push (the free PWA poke channel) ----
app.get('/vapidPublicKey', (c) => c.json({ key: config.vapidPublic }));

app.post('/subscribe', async (c) => {
  const sub = (await c.req.json().catch(() => null)) as PushSub | null;
  if (!sub?.endpoint) return c.json({ error: 'invalid subscription' }, 400);
  addSubscription(sub);
  return c.json({ ok: true, subscribers: subscriptionCount() });
});

app.post('/unsubscribe', async (c) => {
  const { endpoint } = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) removeSubscription(endpoint);
  return c.json({ ok: true, subscribers: subscriptionCount() });
});

app.post('/push/test', async (c) => {
  try {
    const sent = await sendPoke({
      title: '',
      body: 'this is a test poke. if you can read this, the channel works.',
      url: '/digest',
    });
    return c.json({ ok: true, sent });
  } catch (err: any) {
    return c.json({ error: err?.message || 'push failed' }, 500);
  }
});

// ---- watcher (proactive poke loop) ----
app.get('/watch/status', (c) => c.json(watcherStatus()));

app.post('/watch/tick', async (c) => {
  try {
    return c.json({ ok: true, ...(await tick()) });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || 'watch tick failed' }, 500);
  }
});

// ---- morning digest (what a poke tap opens) ----
app.get('/api/digest', async (c) => {
  if (!config.anthropicKey) return c.json({ error: 'server missing ANTHROPIC_API_KEY' }, 500);
  try {
    return c.json(await buildDigest(c.req.query('force') === '1'));
  } catch (err: any) {
    return c.json({ error: err?.message || 'digest failed' }, 500);
  }
});
app.get('/digest', (c) => c.html(DIGEST_PAGE));

// ---- serve the PWA (everything not matched above) ----
// Keep the app shell and the push assets out of any edge/browser cache, so a
// new service worker or bootstrap reaches the installed PWA immediately instead
// of being pinned for hours behind Cloudflare's default static cache.
const NO_STORE = new Set(['/', '/index.html', '/sw.js', '/wabil-push.js', '/manifest.webmanifest', '/digest']);
app.use('*', async (c, next) => {
  await next();
  if (NO_STORE.has(c.req.path)) c.header('Cache-Control', 'no-store');
});

app.get('/', serveStatic({ path: `${config.pwaDir}/index.html` }));
app.use('/*', serveStatic({ root: config.pwaDir }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`\n  wabil server → http://localhost:${info.port}`);
  console.log(`  PWA           served from ${config.pwaDir}`);
  console.log(`  POST /chat    { messages:[{role,content}] } -> { reply }`);
  console.log(`  push          ${pushReady() ? 'ready' : '⚠ no VAPID keys'} · ${subscriptionCount()} subscriber(s)`);
  console.log(`  model: ${config.model}${config.anthropicKey ? '' : '   ⚠ no API key set'}`);
  startWatcher();
  console.log('');
});
