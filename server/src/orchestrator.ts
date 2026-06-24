import type Anthropic from '@anthropic-ai/sdk';
import { runTurn, textOf, toolUses } from './anthropic.js';
import { ORCHESTRATOR_PROMPT } from './prompts.js';
import { runExecutionAgent } from './executionAgent.js';

// The orchestrator's only tool: delegate a task to the background execution
// agent. This is the personality/execution firewall — the orchestrator never
// touches real tools, it dispatches and speaks.
const sendMessageToAgent: Anthropic.Tool = {
  name: 'send_message_to_agent',
  description:
    'Dispatch a background execution agent to do real work (search the inbox, etc). Describe WHAT you need in plain language; do not specify how. Returns the agent’s findings.',
  input_schema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'the task / what you need done' },
      agent_name: { type: 'string', description: 'optional: an existing agent to continue' },
    },
    required: ['message'],
  },
};

const MAX_STEPS = 6;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Run the orchestrator over the conversation. It may delegate to the execution
 * agent one or more times; its final plain-text output is the user-facing reply.
 */
export async function runOrchestrator(history: ChatMessage[]): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await runTurn({ system: ORCHESTRATOR_PROMPT, messages, tools: [sendMessageToAgent] });
    const calls = toolUses(msg);

    if (calls.length === 0) {
      return textOf(msg) || '…';
    }

    messages.push({ role: 'assistant', content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) {
      if (c.name === 'send_message_to_agent') {
        const task = (c.input as { message: string }).message;
        const out = await runExecutionAgent(task);
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `<agent>\n${out}\n</agent>` });
      } else {
        results.push({ type: 'tool_result', tool_use_id: c.id, content: `error: unknown tool "${c.name}"`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return 'sorry, that got tangled. mind saying it again?';
}
