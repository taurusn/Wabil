import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { geminiTurn } from './gemini.js';

export const anthropic = new Anthropic({ apiKey: config.anthropicKey });

/**
 * Run one model turn. Routes to Gemini (orchestrator AND worker share the
 * provider) when configured; otherwise Claude. Claude streams because the SDK
 * rejects non-streaming at high max_tokens; either path returns one Message.
 */
export async function runTurn(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
}): Promise<Anthropic.Message> {
  if (config.provider === 'gemini') return geminiTurn(params);
  const stream = anthropic.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: params.system,
    messages: params.messages,
    ...(params.tools ? { tools: params.tools } : {}),
  });
  return stream.finalMessage();
}

/** Concatenate the text blocks of a Claude message. */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** The tool_use blocks of a Claude message (empty if none). */
export function toolUses(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
}
