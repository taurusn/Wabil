import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`\n✖ Missing ${name}. Copy .env.example to .env and set it.\n`);
  }
  return v ?? '';
}

export const config = {
  anthropicKey: required('ANTHROPIC_API_KEY'),
  // opus runs the orchestrator AND the worker. A real-Gmail A/B over the prod
  // transcript showed opus fixes what sonnet couldn't: it dispatches proactively,
  // recognizes the inbox owner, and the worker actually finds the payment emails
  // sonnet missed — while carrying the Poke roast voice. Override with CLAUDE_MODEL.
  model: process.env.CLAUDE_MODEL || 'claude-opus-4-8',
  port: Number(process.env.PORT || 8787),
  maxTokens: 2048,
  // Chat memory: a gap longer than this starts a fresh session (default 5h).
  chatSessionGapMs: Number(process.env.CHAT_SESSION_GAP_MS || 5 * 60 * 60 * 1000),

  vapidPublic: process.env.VAPID_PUBLIC || '',
  vapidPrivate: process.env.VAPID_PRIVATE || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  pwaDir: process.env.PWA_DIR || '../app/dist',

  // Watcher (proactive poke loop)
  watchEnabled: process.env.WATCH_ENABLED !== 'false',
  watchIntervalMs: Number(process.env.WATCH_INTERVAL_MS || 300000), // 5 min
  watchQuery: process.env.WATCH_QUERY || 'in:inbox is:unread newer_than:2d',
  watchMax: Number(process.env.WATCH_MAX || 10),
  watchTz: process.env.WATCH_TZ || 'Asia/Riyadh',
  watchMorningHour: Number(process.env.WATCH_MORNING_HOUR || 7),
} as const;
