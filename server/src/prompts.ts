import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, '..', 'prompts');

const raw = (f: string) => readFileSync(join(promptsDir, f), 'utf8').trim();

// wabil-structured.xml is the CANONICAL prompt: the raw Poke prompt's structural
// scaffolding (XML sections, the four tags the harness actually emits — <agent>,
// <system_reminder>, <block>, <aside> — the two-tier confirmation policy, the
// recency slot) fused with wabil's distilled voice + the hard length/honesty
// rules, with all Interaction Co. cruft (identity lore, monetization,
// product_facts, Apple cards, the link-label whitelist, the 80/20 sell-line)
// excised. Validated against a real inbox and approved as wabil's voice.
//
// Two opt-in overrides remain for A/B only:
//   WABIL_NATIVE=1 → the older lean prose prompt (prompts/wabil.md)
//   PROMPT=raw     → the verbatim 107-line Poke orchestrator.xml
const VARIANT: 'structured' | 'native' | 'raw' =
  process.env.PROMPT === 'raw' ? 'raw' : process.env.WABIL_NATIVE === '1' ? 'native' : 'structured';

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

const PROMPT_FILE = VARIANT === 'raw' ? 'orchestrator.xml' : VARIANT === 'native' ? 'wabil.md' : 'wabil-structured.xml';
const RUNTIME_NOTE = VARIANT === 'raw' ? POKE_RUNTIME : WABIL_RUNTIME;

export const ORCHESTRATOR_PROMPT = raw(PROMPT_FILE) + RUNTIME_NOTE;

export const EXECUTION_PROMPT = raw('execution.md');

// Single source of wabil's user-facing VOICE for proactive pokes + the digest,
// so there is exactly one wabil. Follows the same prompt choice as chat.
export const VOICE_PROMPT = raw(PROMPT_FILE);

// The inbox-classifier prompt: the watcher runs it over each new email to DECIDE
// (now / morning / ignore) and EXTRACT the substance. It does NOT write the
// user-facing poke — the orchestrator voice does that (see voice.ts).
export const WATCHER_PROMPT = raw('watcher.md');
