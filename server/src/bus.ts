import { sendPoke } from './push.js';

// The user-facing event stream. wabil is single-user, so there is ONE global
// stream: every connected client (normally just the phone) receives every
// assistant event. This is what makes iterative messaging possible — the
// orchestrator can emit a bubble now and another one minutes later, and both
// reach the open app live. When NO client is connected, an assistant bubble
// falls back to a web push so a closed app still gets the follow-up.

// The flavor of a reply, one token, chosen by the orchestrator. The face
// performs it (roast = side-eye, laugh = bouncing crescents, warm = smile).
export type Affect = 'neutral' | 'roast' | 'warm' | 'laugh';

export type StreamEvent =
  | { type: 'typing' }
  | { type: 'working'; on: boolean }
  | {
      type: 'bubble';
      message: { id: string; role: 'assistant'; content: string; ts: number; sessionId: string; affect?: Affect };
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

// Presence: the app heartbeats "I'm on-screen" while visible and fires an
// immediate "I'm gone" on background. We push only when the app is NOT present.
// This replaces guessing from the SSE socket, which lingers after the app closes
// (the reason a closed-app reply was delivered silently with no notification).
const PRESENCE_WINDOW_MS = 15000;
let lastActiveAt = 0;
export function setPresence(active: boolean): void {
  lastActiveAt = active ? Date.now() : 0;
}
function appPresent(): boolean {
  return Date.now() - lastActiveAt < PRESENCE_WINDOW_MS;
}

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

/**
 * The worker is digging (or done). Drives the face's thinking state; purely
 * presentational, so it is never persisted and a missed event costs nothing.
 */
export function emitWorking(on: boolean): void {
  broadcast({ type: 'working', on });
}

export function emitCard(card: ChoiceCard): void {
  broadcast({ type: 'card', card });
}

/**
 * Stream one assistant bubble to live clients over SSE. No push here — a reply
 * may be several bubbles, and we push once for the whole reply (pushReplyOnce),
 * not once per bubble.
 */
export function streamBubble(message: {
  id: string;
  content: string;
  ts: number;
  sessionId: string;
  affect?: Affect;
}): void {
  broadcast({ type: 'bubble', message: { ...message, role: 'assistant' } });
}

/**
 * Push ONE chat notification for a reply when the app isn't on-screen. Tagged in
 * its own namespace (`wabil-chat-<id>`) so it can never merge with a watcher
 * inbox poke (`wabil-inbox-<id>`), and routed to the chat (`/?m=<id>`), not the
 * digest. When the app IS present, the live stream delivers the bubbles instead.
 */
export function pushReplyOnce(id: string, text: string): void {
  if (appPresent()) return;
  const body = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  sendPoke({
    title: 'wabil',
    body: body || 'new message',
    url: `/?m=${id}`,
    tag: `wabil-chat-${id}`,
  }).catch(() => {
    /* push is best-effort; the message is already persisted + on the stream */
  });
}

/**
 * Deliver a SINGLE assistant bubble (a proactive poke): stream it, and push once
 * if the app is closed. Multi-bubble chat replies use streamBubble per bubble +
 * a single pushReplyOnce instead.
 */
export function emitBubble(message: {
  id: string;
  content: string;
  ts: number;
  sessionId: string;
}): void {
  streamBubble(message);
  pushReplyOnce(message.id, message.content);
}
