import type Anthropic from '@anthropic-ai/sdk';
import { runTurn, textOf, toolUses } from './anthropic.js';
import { EXECUTION_PROMPT } from './prompts.js';
import { callGmailTool, getGmailTools } from './tools/gmailMcp.js';

const MAX_STEPS = 6;

/**
 * The headless execution agent. Given a task from the orchestrator, it runs a
 * tool-use loop against the user's real Gmail (read-only) and returns a
 * plain-text summary directed back to the orchestrator. It never talks to the user.
 */
export async function runExecutionAgent(task: string): Promise<string> {
  let tools: Anthropic.Tool[];
  try {
    tools = await getGmailTools();
  } catch (err: any) {
    // Gmail connector couldn't start — almost always means auth isn't done yet.
    return `Gmail is not connected yet (${err?.message || 'connector failed to start'}). Tell the user to finish the one-time Google sign-in: run \`npx @gongrzhe/server-gmail-autoauth-mcp auth\`.`;
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task }];

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await runTurn({ system: EXECUTION_PROMPT, messages, tools });
    const calls = toolUses(msg);

    if (calls.length === 0) {
      return textOf(msg) || '(execution agent returned nothing)';
    }

    messages.push({ role: 'assistant', content: msg.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) {
      try {
        const out = await callGmailTool(c.name, c.input as Record<string, unknown>);
        results.push({ type: 'tool_result', tool_use_id: c.id, content: out });
      } catch (err: any) {
        results.push({
          type: 'tool_result',
          tool_use_id: c.id,
          content: `error calling ${c.name}: ${err?.message || err}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  return '(execution agent hit its step limit without finishing)';
}
