import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The watcher's memory of which emails it has already handled, so a poke is
// never sent twice. Single-user app, so a flat JSON file is plenty (gitignored,
// same data/ dir as the push subscriptions).
//
// Idempotency rule (from CLAUDE.md): an email is only marked 'poked' AFTER the
// push succeeds, never before. A classified-but-undelivered email stays
// 'pending' and is retried, so a crash or a missing subscriber never drops it.

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const file = join(dataDir, 'seen.json');

export type SeenStatus = 'baseline' | 'ignored' | 'pending' | 'poked';

export type SeenRecord = {
  status: SeenStatus;
  decision?: 'now' | 'morning' | 'ignore';
  poke?: { title: string; body: string; url?: string; tag?: string };
  subject?: string;
  from?: string;
  classifiedAt: number;
  pokedAt?: number;
};

type Store = Record<string, SeenRecord>;

function load(): Store {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Store;
  } catch {
    return {};
  }
}

function persist(s: Store): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(s, null, 2));
}

let store: Store = load();

export function has(id: string): boolean {
  return Boolean(store[id]);
}

export function put(id: string, rec: SeenRecord): void {
  store[id] = rec;
  persist(store);
}

export function isEmpty(): boolean {
  return Object.keys(store).length === 0;
}

export function entries(): Array<[string, SeenRecord]> {
  return Object.entries(store);
}

export function counts(): Record<string, number> {
  const c: Record<string, number> = { total: 0, baseline: 0, ignored: 0, pending: 0, poked: 0 };
  for (const r of Object.values(store)) {
    c.total++;
    c[r.status] = (c[r.status] ?? 0) + 1;
  }
  return c;
}

/** Drop old, settled records so the file stays small. Pending is never pruned. */
export function prune(maxAgeMs: number): void {
  const cutoff = Date.now() - maxAgeMs;
  let changed = false;
  for (const [id, r] of Object.entries(store)) {
    if (r.status !== 'pending' && r.classifiedAt < cutoff) {
      delete store[id];
      changed = true;
    }
  }
  if (changed) persist(store);
}
