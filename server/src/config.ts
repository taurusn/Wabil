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
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
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
