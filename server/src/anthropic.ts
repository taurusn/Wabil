import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

export const anthropic = new Anthropic({ apiKey: config.anthropicKey });

/**
 * Run one Claude turn with streaming (the SDK rejects non-streaming calls at
 * high max_tokens, so we always stream and collect the final message).
 */
export async function runTurn(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
}): Promise<Anthropic.Message> {
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
