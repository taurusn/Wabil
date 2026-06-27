import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

// Gemini provider, exposed as an Anthropic.Message-shaped result so the rest of
// the app (runtime/orchestrator/executionAgent + textOf/toolUses) is unchanged.
// We translate the Anthropic message + tool-calling format to Gemini's
// generateContent format and back. Called from anthropic.ts runTurn when the
// active provider is gemini. REST (fetch), no extra SDK dependency.

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Gemini's functionDeclaration schema rejects several JSON-Schema keywords the
// Anthropic/MCP tools carry. Strip them; keep type/properties/required/items/
// description/enum.
const DROP_KEYS = new Set(['$schema', 'additionalProperties', 'title', 'default', 'examples', '$ref', 'format']);
function cleanSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (s && typeof s === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (DROP_KEYS.has(k)) continue;
      out[k] = cleanSchema(v);
    }
    return out;
  }
  return s;
}

type GPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GContent = { role: 'user' | 'model'; parts: GPart[] };

// Anthropic messages -> Gemini contents. tool_use lives in the model turn as a
// functionCall; tool_result lives in the user turn as a functionResponse (Gemini
// keys those by NAME, so we resolve each tool_use_id back to its tool name).
export function toGeminiContents(messages: Anthropic.MessageParam[]): GContent[] {
  const idToName = new Map<string, string>();
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) if ((b as any).type === 'tool_use') idToName.set((b as any).id, (b as any).name);
    }
  }
  const contents: GContent[] = [];
  const push = (role: 'user' | 'model', parts: GPart[]): void => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts); // merge consecutive same-role
    else contents.push({ role, parts });
  };
  for (const m of messages) {
    const role: 'user' | 'model' = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') {
      push(role, m.content ? [{ text: m.content }] : []);
      continue;
    }
    const parts: GPart[] = [];
    for (const b of m.content as any[]) {
      if (b.type === 'text') {
        if (b.text) parts.push({ text: b.text });
      } else if (b.type === 'tool_use') {
        // Gemini 3 requires the thoughtSignature it returned with a functionCall
        // to be echoed back, or it 400s on the next turn. We stash it on the
        // tool_use block in fromGeminiResponse and re-attach it here.
        const part: GPart = { functionCall: { name: b.name, args: (b.input as Record<string, unknown>) || {} } };
        if (b.thoughtSignature) (part as any).thoughtSignature = b.thoughtSignature;
        parts.push(part);
      } else if (b.type === 'tool_result') {
        const name = idToName.get(b.tool_use_id) || 'tool';
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content);
        parts.push({ functionResponse: { name, response: { result: text } } });
      }
    }
    push(role, parts);
  }
  return contents;
}

// Gemini response -> Anthropic.Message shape (only the bits textOf/toolUses read).
export function fromGeminiResponse(data: any): Anthropic.Message {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const content: any[] = [];
  for (const p of parts) {
    if (typeof p.text === 'string' && p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall)
      content.push({
        type: 'tool_use',
        id: `gem_${randomUUID()}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
        thoughtSignature: p.thoughtSignature, // Gemini 3: must be echoed back next turn
      });
  }
  return { role: 'assistant', content, stop_reason: null, type: 'message' } as Anthropic.Message;
}

export async function geminiTurn(params: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
}): Promise<Anthropic.Message> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: params.system }] },
    contents: toGeminiContents(params.messages),
    generationConfig: { maxOutputTokens: config.maxTokens },
  };
  if (params.tools?.length) {
    body.tools = [
      {
        functionDeclarations: params.tools.map((t) => {
          const schema = cleanSchema(t.input_schema) as any;
          const decl: Record<string, unknown> = { name: t.name, description: t.description };
          // Gemini rejects an empty parameters object; omit it for no-arg tools.
          if (schema && schema.properties && Object.keys(schema.properties).length > 0) decl.parameters = schema;
          return decl;
        }),
      },
    ];
  }
  const res = await fetch(ENDPOINT(config.model), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return fromGeminiResponse(data);
}
