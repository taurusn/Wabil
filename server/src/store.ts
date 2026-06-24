import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

// Persistent chat memory. Single SQLite file (single-user app). Three jobs:
//  - persist every message so the conversation survives restarts
//  - chunk into sessions: a >5h gap starts a fresh conversation
//  - reply context: pull a replied-to message + its neighbours, even across sessions

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'wabil.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    reply_to_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_session_ts ON messages (session_id, ts);
  CREATE INDEX IF NOT EXISTS idx_ts ON messages (ts);
`);

export type Role = 'user' | 'assistant';
export type StoredMsg = {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  ts: number;
  replyToId: string | null;
};

const toMsg = (r: any): StoredMsg => ({
  id: r.id,
  sessionId: r.session_id,
  role: r.role,
  content: r.content,
  ts: r.ts,
  replyToId: r.reply_to_id ?? null,
});

const qLast = db.prepare('SELECT * FROM messages ORDER BY ts DESC, rowid DESC LIMIT 1');
const qById = db.prepare('SELECT * FROM messages WHERE id = ?');
const qSession = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY ts, rowid');
const qRecent = db.prepare('SELECT * FROM messages ORDER BY ts DESC, rowid DESC LIMIT ?');
const qInsert = db.prepare(
  'INSERT INTO messages (id, session_id, role, content, ts, reply_to_id) VALUES (?, ?, ?, ?, ?, ?)'
);

export function lastMessage(): StoredMsg | null {
  const r = qLast.get() as any;
  return r ? toMsg(r) : null;
}

/** The session a message arriving `now` belongs to — a new one after a >gap idle. */
function sessionForNow(now: number): string {
  const last = lastMessage();
  if (last && now - last.ts <= config.chatSessionGapMs) return last.sessionId;
  return randomUUID();
}

export function addMessage(m: {
  role: Role;
  content: string;
  replyToId?: string | null;
  sessionId?: string;
}): StoredMsg {
  const msg: StoredMsg = {
    id: randomUUID(),
    // The runtime pins assistant replies to the user turn's session so a
    // follow-up that lands minutes later (after a background agent) still
    // belongs to the same conversation, not a new one.
    sessionId: m.sessionId ?? sessionForNow(Date.now()),
    role: m.role,
    content: m.content,
    ts: Date.now(),
    replyToId: m.replyToId ?? null,
  };
  qInsert.run(msg.id, msg.sessionId, msg.role, msg.content, msg.ts, msg.replyToId);
  return msg;
}

export function sessionMessages(sessionId: string): StoredMsg[] {
  return (qSession.all(sessionId) as any[]).map(toMsg);
}

const qBefore = db.prepare(
  'SELECT * FROM messages WHERE ts < ? ORDER BY ts DESC, rowid DESC LIMIT ?'
);

/**
 * A page of history, oldest-first for rendering. First load passes no cursor and
 * gets the most recent `limit`. Scrolling up passes `before` = the oldest loaded
 * message's ts to get the previous page. The client dedupes by id at the seam.
 */
export function history(limit = 40, before?: number): StoredMsg[] {
  const rows = (before ? qBefore.all(before, limit) : qRecent.all(limit)) as any[];
  return rows.map(toMsg).reverse();
}

/** The anchor message plus up to `span` neighbours each side, within its session. */
export function replyContext(replyToId: string, span = 3): StoredMsg[] {
  const anchor = qById.get(replyToId) as any;
  if (!anchor) return [];
  const sess = sessionMessages(anchor.session_id);
  const i = sess.findIndex((m) => m.id === replyToId);
  if (i < 0) return [];
  return sess.slice(Math.max(0, i - span), i + span + 1);
}

/**
 * A quoted excerpt around the replied-to message (marked »), to prepend to the
 * current user turn so the orchestrator sees exactly what is being pointed at —
 * even if it is from a much older conversation.
 */
export function replyContextBlock(replyToId: string): string {
  const ctx = replyContext(replyToId);
  if (!ctx.length) return '';
  const lines = ctx
    .map((m) => {
      const who = m.role === 'user' ? 'you' : 'wabil';
      const mark = m.id === replyToId ? '»' : ' ';
      return `${mark} ${who}: ${m.content.replace(/\s+/g, ' ').slice(0, 200)}`;
    })
    .join('\n');
  return `[the user is replying to the message marked » in this earlier excerpt]\n${lines}\n[end excerpt]`;
}
