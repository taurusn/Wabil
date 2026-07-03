import { API_BASE } from './config';

export type Role = 'user' | 'assistant';

export type Affect = 'neutral' | 'roast' | 'warm' | 'laugh';

export type ChatMsg = {
  id: string;
  role: Role;
  content: string;
  ts: number;
  sessionId: string;
  replyToId?: string | null;
  /** flavor of an assistant bubble, SSE-only (not persisted); the face performs it */
  affect?: Affect;
};

// The POST only ACKs the user's message now; the reply (or replies, including a
// follow-up after an "on it") arrive over the SSE stream.
export type SendAck = { id: string; ts: number; sessionId: string };

export async function sendChat(text: string, replyToId?: string | null): Promise<SendAck> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, replyToId: replyToId ?? undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `server ${res.status}`);
  return data as SendAck;
}

// Live assistant stream. Single global stream (single-user app).
export type StreamEvent =
  | { type: 'typing' }
  | { type: 'working'; on: boolean }
  | { type: 'bubble'; message: ChatMsg }
  | { type: 'card'; card: unknown };

export const streamUrl = (): string => `${API_BASE}/stream`;

// Presence: tell the server whether the app is on-screen, so it knows when to
// push a reply (when we're gone) vs just stream it (when we're here).
export function pingPresence(active: boolean): void {
  try {
    fetch(`${API_BASE}/presence?active=${active}`, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function beaconInactive(): void {
  try {
    const url = `${API_BASE}/presence?active=false`;
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** A page of history, oldest-first. Pass `before` (oldest loaded ts) to page up. */
export async function getHistory(before?: number, limit = 40): Promise<ChatMsg[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) q.set('before', String(before));
  const res = await fetch(`${API_BASE}/history?${q.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `server ${res.status}`);
  return (data.messages || []) as ChatMsg[];
}

/**
 * Strip raw Poke-prompt artifacts. The server already sanitizes stored replies;
 * this is a harmless second pass for safety and any legacy content.
 */
export function sanitize(raw: string): string {
  return String(raw)
    .replace(/<affect>[\s\S]*?<\/affect>/gi, '')
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
