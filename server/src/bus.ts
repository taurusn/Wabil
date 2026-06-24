import { sendPoke } from './push.js';

// The user-facing event stream. wabil is single-user, so there is ONE global
// stream: every connected client (normally just the phone) receives every
// assistant event. This is what makes iterative messaging possible — the
// orchestrator can emit a bubble now and another one minutes later, and both
// reach the open app live. When NO client is connected, an assistant bubble
// falls back to a web push so a closed app still gets the follow-up.

export type StreamEvent =
  | { type: 'typing' }
  | {
      type: 'bubble';
      message: { id: string; role: 'assistant'; content: string; ts: number; sessionId: string };
    }
  | { type: 'card'; card: ChoiceCard };

export type ChoiceCard = {
  id: string;
  sessionId: string;
  kind: 'choice' | 'approval';
  prompt: string;
  options: { label: string; value: string }[];
};

type Subscriber = (e: StreamEvent) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function liveCount(): number {
  return subscribers.size;
}

function broadcast(e: StreamEvent): void {
  for (const fn of subscribers) {
    try {
      fn(e);
    } catch {
      /* a dead subscriber shouldn't break the others */
    }
  }
}

export function emitTyping(): void {
  broadcast({ type: 'typing' });
}

export function emitCard(card: ChoiceCard): void {
  broadcast({ type: 'card', card });
}

/**
 * Deliver an assistant bubble. Live clients get it over SSE. If none are
 * connected, it falls back to a CHAT push — tagged in its own namespace
 * (`wabil-chat-<id>`) so it can never merge with a watcher inbox poke
 * (`wabil-inbox-<id>`), and routed to the chat (`/?m=<id>`), not the digest.
 */
export function emitBubble(message: {
  id: string;
  content: string;
  ts: number;
  sessionId: string;
}): void {
  broadcast({ type: 'bubble', message: { ...message, role: 'assistant' } });
  if (subscribers.size === 0) {
    const body = message.content.replace(/\s+/g, ' ').trim().slice(0, 140);
    sendPoke({
      title: 'wabil',
      body: body || 'new message',
      url: `/?m=${message.id}`,
      tag: `wabil-chat-${message.id}`,
    }).catch(() => {
      /* push is best-effort; the message is already persisted + on the stream */
    });
  }
}
