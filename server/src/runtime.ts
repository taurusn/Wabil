import type Anthropic from '@anthropic-ai/sdk';
import { runTurn, textOf, toolUses } from './anthropic.js';
import { ORCHESTRATOR_PROMPT } from './prompts.js';
import { splitBubbles } from './sanitize.js';
import { runExecutionAgent } from './executionAgent.js';
import * as store from './store.js';
import * as bus from './bus.js';

// The iterative conversation runtime. Instead of one blocking request → one
// reply, the orchestrator can: send a bubble now, dispatch a background agent,
// call `wait` to yield, and be re-invoked when the agent reports back to send a
// follow-up. Bubbles stream to the open app over SSE (bus) or fall back to a
// chat push when it's closed. This is what makes wabil text like a human.

const MAX_STEPS = 8;

const sendMessageToAgent: Anthropic.Tool = {
  name: 'send_message_to_agent',
  description:
    'Dispatch a background execution agent to do real work (search the inbox, draft or send an email, etc). It runs in the background and reports back later as a separate <agent> message, so after dispatching you should give the user one short, natural acknowledgement in your own voice (vary it, never a stock phrase) and call wait rather than stalling. Describe WHAT you need in plain language, never how.',
  input_schema: {
    type: 'object',
    properties: {
      agent_name: { type: 'string', description: 'a short name for the task/agent' },
      message: { type: 'string', description: 'the task / what you need done' },
    },
    required: ['message'],
  },
};

const wait: Anthropic.Tool = {
  name: 'wait',
  description:
    'Yield your turn without sending anything else to the user. Use this right after acknowledging the user and dispatching an agent, so the user is not left hanging while the work happens in the background. You will be re-invoked automatically when the agent reports back.',
  input_schema: { type: 'object', properties: {} },
};

const TOOLS = [sendMessageToAgent, wait];

type Session = {
  transcript: Anthropic.MessageParam[];
  pending: number;
  chain: Promise<void>;
};

const sessions = new Map<string, Session>();

function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = { transcript: [], pending: 0, chain: Promise.resolve() };
    sessions.set(id, s);
  }
  return s;
}

// Serialize all work on a session so two events (a user message and an agent
// result landing together) never run the model concurrently on one transcript.
function enqueue(s: Session, job: () => Promise<void>): void {
  s.chain = s.chain.then(job).catch((err) => {
    console.error('[runtime] turn failed:', err?.message || err);
  });
}

// Merge consecutive same-role rows so a re-seeded transcript (assistant bubbles
// are stored as several rows) stays clean for the API.
function coalesce(rows: { role: store.Role; content: string }[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.role === r.role && typeof last.content === 'string') {
      last.content = `${last.content}\n${r.content}`;
    } else {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}

// Persist + stream each bubble of an assistant turn. The client reveals them one
// at a time with a typing beat, so a multi-bubble answer lands like several
// texts. Push only ONCE for the whole reply (not per bubble) when the app's closed.
function emitText(sessionId: string, raw: string): void {
  const bubbles = splitBubbles(raw);
  let firstId: string | null = null;
  for (const bubble of bubbles) {
    const m = store.addMessage({ role: 'assistant', content: bubble, sessionId });
    bus.streamBubble({ id: m.id, content: m.content, ts: m.ts, sessionId: m.sessionId });
    if (!firstId) firstId = m.id;
  }
  if (firstId) bus.pushReplyOnce(firstId, bubbles.join(' '));
}

function onAgentResult(sessionId: string, name: string, result: string): void {
  const s = getSession(sessionId);
  s.pending = Math.max(0, s.pending - 1);
  s.transcript.push({
    role: 'user',
    content: `<agent name="${name}" sentAt="${new Date().toISOString()}">\n${result}\n</agent>`,
  });
  enqueue(s, () => runLoop(sessionId));
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// The "text, then a second text" cadence. After a SHORT reply, ~30% of the time,
// wait a beat and ask the orchestrator if it wants to fire one more short
// follow-up — like a person tapping out a quick afterthought. Long replies are
// never asked. The nudge is not persisted; only a real follow-up joins the
// transcript (a PASS is dropped).
const FOLLOWUP_CHANCE = 0.3;
const FOLLOWUP_MAX_LEN = 140; // only add on to short messages
async function maybeFollowUp(sessionId: string, prevReply: string): Promise<void> {
  if (prevReply.length > FOLLOWUP_MAX_LEN) return;
  if (Math.random() >= FOLLOWUP_CHANCE) return;
  await sleep(1100); // a human beat before the second text
  const s = getSession(sessionId);
  const probe: Anthropic.MessageParam[] = [
    ...s.transcript,
    {
      role: 'user',
      content:
        '<system_reminder>You just sent that message. Like a person texting, you MAY fire off one more short follow-up text if something natural fits: a tiny afterthought, a light add-on, or one short question. Keep it short and do not repeat what you just said. If there is nothing genuine to add, reply with exactly: PASS</system_reminder>',
    },
  ];
  const msg = await runTurn({ system: ORCHESTRATOR_PROMPT, messages: probe });
  const text = textOf(msg);
  if (text && !/^\s*pass[.!]?\s*$/i.test(text)) {
    s.transcript.push({ role: 'assistant', content: text });
    emitText(sessionId, text);
  }
}

async function runLoop(sessionId: string): Promise<void> {
  const s = getSession(sessionId);
  // No "typing" signal here: the dots are a per-bubble reveal animation on the
  // client, not a busy indicator. While the backend iterates, the user sees
  // nothing (the "on it" ack carries the working signal). Dots flash only just
  // before each real bubble lands.
  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await runTurn({ system: ORCHESTRATOR_PROMPT, messages: s.transcript, tools: TOOLS });
    s.transcript.push({ role: 'assistant', content: msg.content });

    const text = textOf(msg);
    if (text) emitText(sessionId, text);

    const calls = toolUses(msg);
    if (calls.length === 0) {
      if (text) await maybeFollowUp(sessionId, text); // sometimes fire a 2nd short text
      return; // a complete answer with no wait
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let yieldTurn = false;
    for (const c of calls) {
      if (c.name === 'send_message_to_agent') {
        const input = c.input as { agent_name?: string; message: string };
        const name = input.agent_name || 'agent';
        s.pending++;
        runExecutionAgent(input.message)
          .then((r) => onAgentResult(sessionId, name, r))
          .catch((e) => onAgentResult(sessionId, name, `error: ${e?.message || e}`));
        results.push({
          type: 'tool_result',
          tool_use_id: c.id,
          content: `dispatched to ${name}. it will report back as a separate <agent> message. acknowledge the user and call wait.`,
        });
      } else if (c.name === 'wait') {
        results.push({ type: 'tool_result', tool_use_id: c.id, content: '(ok, yielding)' });
        yieldTurn = true;
      } else {
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `unknown tool: ${c.name}`, is_error: true });
      }
    }
    s.transcript.push({ role: 'user', content: results });
    if (yieldTurn) return; // stop; resume when an agent reports back
  }
  console.warn(`[runtime] session ${sessionId.slice(0, 8)} hit the step limit`);
}

/**
 * Deliver a PROACTIVE message (a watcher poke) into the conversation — wabil
 * texting the user unprompted. It's persisted as an assistant message and
 * emitted like any reply: streamed to the open app, or pushed when it's closed.
 * So a poke shows up as a normal chat bubble and the notification opens the chat.
 */
export function deliverProactive(text: string): void {
  const m = store.addMessage({ role: 'assistant', content: text });
  bus.emitBubble({ id: m.id, content: m.content, ts: m.ts, sessionId: m.sessionId });
  // Keep the in-memory transcript consistent if that session is active, so a
  // reply to the poke ("yeah handle it") has the poke in context.
  const s = sessions.get(m.sessionId);
  if (s) s.transcript.push({ role: 'assistant', content: text });
}

/**
 * Entry point: a user message has been persisted. Seed/extend the session
 * transcript and run the conversation. Returns immediately; replies arrive on
 * the bus (SSE live, or a chat push when the app is closed).
 */
export function handleUserMessage(userMsg: store.StoredMsg): void {
  const s = getSession(userMsg.sessionId);
  if (s.transcript.length === 0) {
    // Cold session (first message, or after a restart): seed from the persisted
    // conversation, which already includes this message.
    s.transcript = coalesce(store.sessionMessages(userMsg.sessionId).map((m) => ({ role: m.role, content: m.content })));
  } else {
    s.transcript.push({ role: 'user', content: userMsg.content });
  }
  // Fold reply context into the just-added user turn.
  if (userMsg.replyToId) {
    const block = store.replyContextBlock(userMsg.replyToId);
    if (block && s.transcript.length) {
      const i = s.transcript.length - 1;
      s.transcript[i] = { role: 'user', content: `${block}\n\n${userMsg.content}` };
    }
  }
  enqueue(s, () => runLoop(userMsg.sessionId));
}
