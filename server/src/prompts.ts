import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, '..', 'prompts');

const raw = (f: string) => readFileSync(join(promptsDir, f), 'utf8').trim();

// The orchestrator runs the raw Poke personality prompt verbatim, plus a MINIMAL
// runtime note: only the irreducible harness facts (it is reached over a chat API
// and which two tools it has). Deliberately NOT a behavioral note. Brevity, the
// 80/20 answer-to-offer ratio, dispatch-by-default, and the roast voice are all
// already native to the raw Poke prompt; re-stating or contradicting them only
// dilutes it. An earlier note here said "if you can answer without an agent, just
// answer" and re-stated the length rules — that fought the prompt's native
// dispatch instinct and made the model stall instead of searching. Removed after
// a real-Gmail A/B (see scratchpad spirit-experiment): the win came from letting
// the raw prompt govern + a stronger model, not from more glue.
//
// The one behavioral line kept is a BREVITY reinforcement (Hatim's ask): opus
// under-applies the prompt's native "be concise" and pads answers (e.g. a run-on
// when asked for "one sentence"). This AMPLIFIES a native trait rather than
// fighting one, and preserves length only where the content truly needs it.
export const ORCHESTRATOR_PROMPT =
  raw('orchestrator.xml') +
  `

<runtime>
You are reached over a chat API; your plain-text output is delivered to the user as your message. Your tools here are send_message_to_agent (dispatch a background execution agent that holds the real Gmail tools) and wait (yield while it works; you are re-invoked when it reports back as an <agent> message). Never mention tools, agents, or internal mechanics to the user.

Texting voice, keep it SHORT. For casual or emotional conversation, reply in ONE short sentence, occasionally two: a quick reaction plus at most one short question, then stop. Hard bans for chat: no paragraphs, no stacking multiple points ("couple things though..."), no hedging both sides, no analyzing the user's feelings or restating their situation back to them, no advice they didn't ask for. Example of the right length, for "my director is ghosting me": "oof, the silent treatment is brutal. how long's it been?" Obey any length the user names. The ONLY time you write more than ~2 sentences is to relay an actual email or triage several inbox items.
</runtime>`;

export const EXECUTION_PROMPT = raw('execution.md');

// The pure Poke personality (no runtime/tool glue). This is the single source of
// wabil's user-facing VOICE — chat replies come from ORCHESTRATOR_PROMPT, and
// every proactive poke + the morning digest are written with this same voice so
// there is exactly one wabil, not a second hand-authored one.
export const VOICE_PROMPT = raw('orchestrator.xml');

// The inbox-classifier prompt: the watcher runs it over each new email to DECIDE
// (now / morning / ignore) and EXTRACT the substance. It does NOT write the
// user-facing poke — the orchestrator voice does that (see voice.ts).
export const WATCHER_PROMPT = raw('watcher.md');
