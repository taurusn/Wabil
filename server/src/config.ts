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
  vapidPublic: process.env.VAPID_PUBLIC || '',
  vapidPrivate: process.env.VAPID_PRIVATE || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  pwaDir: process.env.PWA_DIR || '../app/dist',
} as const;
