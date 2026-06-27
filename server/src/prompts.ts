import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, '..', 'prompts');

const raw = (f: string) => readFileSync(join(promptsDir, f), 'utf8').trim();

// WABIL_NATIVE=1 runs wabil's OWN lean prompt (prompts/wabil.md) instead of the
// raw 107-line Poke corporate prompt. The Poke file spends ~90% of its budget on
// Interaction Co. lore, monetization, integrations and Apple-UX cards wabil
// doesn't have, AND actively instructs yapping (the 80/20 "tack on an offer" line,
// upsells) while only weakly instructing brevity (one adjective). wabil.md
// distills the real voice DNA (lowercase, no em-dash, roast, anti-sycophancy,
// firewall, send-gate, dispatch-by-default), adds an identity stub so it knows
// Hatim, and puts the hard length rule + few-shot in the recency slot where it
// binds. This is the "own identity" lever, not glue on top.
const WABIL_NATIVE = process.env.WABIL_NATIVE === '1';

// Minimal harness note appended to the raw Poke prompt only (wabil.md already
// folds these in). Kept for the A/B baseline.
const POKE_RUNTIME = `

<runtime>
You are reached over a chat API; your plain-text output is delivered to the user as your message. Your tools here are send_message_to_agent (dispatch a background execution agent that holds the real Gmail tools) and wait (yield while it works; you are re-invoked when it reports back as an <agent> message). Never mention tools, agents, or internal mechanics to the user.

Texting voice, keep it SHORT. For casual or emotional conversation, reply in ONE short message: a quick reaction and at most one short question, then stop. No paragraphs, no stacking multiple points ("couple things though..."), no hedging both sides, no restating the user's situation, no advice they didn't ask for. Example, for "my director is ghosting me": "oof, the silent treatment is brutal. how long's it been?" Obey any length the user names. Only write more, or longer, to relay an actual email or triage several inbox items.
</runtime>`;

const WABIL_RUNTIME = `

<runtime>
You are reached over a chat API; your plain-text output is delivered to Hatim as your message. To do real work, dispatch the background worker with send_message_to_agent then call wait; it reports back and you reply. Never mention these tools or the worker.
</runtime>`;

export const ORCHESTRATOR_PROMPT = WABIL_NATIVE
  ? raw('wabil.md') + WABIL_RUNTIME
  : raw('orchestrator.xml') + POKE_RUNTIME;

export const EXECUTION_PROMPT = raw('execution.md');

// Single source of wabil's user-facing VOICE for proactive pokes + the digest,
// so there is exactly one wabil. Follows the same prompt choice as chat.
export const VOICE_PROMPT = WABIL_NATIVE ? raw('wabil.md') : raw('orchestrator.xml');

// The inbox-classifier prompt: the watcher runs it over each new email to DECIDE
// (now / morning / ignore) and EXTRACT the substance. It does NOT write the
// user-facing poke — the orchestrator voice does that (see voice.ts).
export const WATCHER_PROMPT = raw('watcher.md');
