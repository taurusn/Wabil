import { API_BASE } from './config';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** POST the conversation to the orchestrator, return its raw reply text. */
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `server ${res.status}`);
  return String(data.reply ?? '');
}

/**
 * Strip the raw Poke-prompt artifacts so the chat reads clean:
 * remove <aside> private reasoning, unwrap <block>, drop markdown/poke links.
 */
export function sanitize(raw: string): string {
  return raw
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '') // [28_view-email](poke.com/…) → gone
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
