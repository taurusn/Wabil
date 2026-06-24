import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import webpush from 'web-push';
import { config } from './config.js';

// Web Push (VAPID) — the free, no-Apple-Developer-account way to push into the
// installed PWA. Subscriptions persist to a JSON file (single-user app, so a
// flat file is plenty; gitignored).

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const subsFile = join(dataDir, 'subscriptions.json');

export type PushSub = webpush.PushSubscription;

let configured = false;
export function pushReady(): boolean {
  if (!configured && config.vapidPublic && config.vapidPrivate) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);
    configured = true;
  }
  return configured;
}

function load(): PushSub[] {
  try {
    return JSON.parse(readFileSync(subsFile, 'utf8'));
  } catch {
    return [];
  }
}

function save(subs: PushSub[]): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(subsFile, JSON.stringify(subs, null, 2));
}

export function addSubscription(sub: PushSub): void {
  const subs = load();
  if (!subs.some((s) => s.endpoint === sub.endpoint)) {
    subs.push(sub);
    save(subs);
  }
}

export function removeSubscription(endpoint: string): void {
  save(load().filter((s) => s.endpoint !== endpoint));
}

export function subscriptionCount(): number {
  return load().length;
}

/**
 * Send a poke to every subscribed device. Dead subscriptions (410/404) are
 * pruned automatically. Returns how many were delivered.
 */
export async function sendPoke(payload: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  if (!pushReady()) throw new Error('web push not configured (set VAPID_PUBLIC / VAPID_PRIVATE)');
  const subs = load();
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body);
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) dead.push(sub.endpoint);
      }
    })
  );
  if (dead.length) save(load().filter((s) => !dead.includes(s.endpoint)));
  return sent;
}
