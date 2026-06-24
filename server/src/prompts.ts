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
You are reached over a simple chat API, not iMessage. Your plain-text output is delivered to the user verbatim as your message — so reply in your own voice, never describe tools or agents. You have ONE tool here: send_message_to_agent, which dispatches a background execution agent to do real work (searching the inbox, etc). Tell the agent WHAT you need, not how. When the agent reports back, weave its findings into a natural reply to the user. If you can answer without the agent, just answer.
</runtime>`;

export const EXECUTION_PROMPT = raw('execution.md');
