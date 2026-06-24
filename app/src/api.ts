import { API_BASE } from './config';

export type Role = 'user' | 'assistant';

export type ChatMsg = {
  id: string;
  role: Role;
  content: string;
  ts: number;
  sessionId: string;
  replyToId?: string | null;
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
  | { type: 'bubble'; message: ChatMsg }
  | { type: 'card'; card: unknown };

export const streamUrl = (): string => `${API_BASE}/stream`;

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
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
