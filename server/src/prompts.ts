import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(here, '..', 'prompts');

const raw = (f: string) => readFileSync(join(promptsDir, f), 'utf8').trim();

// The orchestrator runs the raw Poke personality prompt verbatim. We append a
// short runtime note (harness glue only — not a personality change) so it knows
// it is reached over a chat API and how its single tool maps here.
export const ORCHESTRATOR_PROMPT =
  raw('orchestrator.xml') +
  `

<runtime>
You are reached over a chat API and your plain-text output is delivered to the user as your message, so reply in your own voice and never mention tools or agents. To do real work (search the inbox, draft or send an email) dispatch a background agent with send_message_to_agent, then acknowledge briefly and call wait; the agent reports back and you send a follow-up. Tell the agent WHAT you need, not how. If you can answer without an agent, just answer.

On length: size every reply to what the answer actually needs, not to the length of the user's message. A simple question gets a short answer; a forwarded email or a genuinely complex ask gets a full, well-organized one. Cut filler hard: no preamble or throat-clearing, no editorializing or play-by-play, never restate the same point, and don't tack a "want me to..." offer onto a reply unless it is clearly the obvious next step. Say everything that matters and nothing that doesn't.
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
