import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { config } from './config.js';
import { runOrchestrator, type ChatMessage } from './orchestrator.js';
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
import { sanitize } from './sanitize.js';

const app = new Hono();
app.use('/health', cors());
app.use('/chat', cors());
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

  // Stateful contract: { text, replyToId? }. The server persists the turn,
  // assembles the session (+ reply excerpt), and persists the reply.
  if (body && typeof body.text === 'string') {
    const text = body.text.trim();
    if (!text) return c.json({ error: 'text is empty' }, 400);
    const replyToId = typeof body.replyToId === 'string' ? body.replyToId : null;
    try {
      const userMsg = store.addMessage({ role: 'user', content: text, replyToId });
      const session = store.sessionMessages(userMsg.sessionId);
      const messages = session.map((m) => ({ role: m.role, content: m.content }));
      if (replyToId) {
        const block = store.replyContextBlock(replyToId);
        if (block) messages[messages.length - 1] = { role: 'user', content: `${block}\n\n${text}` };
      }
      const reply = sanitize(await runOrchestrator(messages as ChatMessage[]));
      const asst = store.addMessage({ role: 'assistant', content: reply });
      return c.json({
        id: userMsg.id,
        ts: userMsg.ts,
        sessionId: userMsg.sessionId,
        reply,
        replyId: asst.id,
        replyTs: asst.ts,
      });
    } catch (err: any) {
      console.error('[chat] error:', err?.message || err);
      return c.json({ error: err?.message || 'orchestrator failed' }, 500);
    }
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

// ---- chat history (pagination: ?limit, ?before=<ts cursor>) ----
app.get('/history', (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 40, 1), 200);
  const beforeRaw = Number(c.req.query('before'));
  const before = Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : undefined;
  return c.json({ messages: store.history(limit, before) });
});

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
      title: 'wabil',
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
