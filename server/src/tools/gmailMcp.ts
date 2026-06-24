import type Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Connector: the GongRzhe Gmail MCP server (@gongrzhe/server-gmail-autoauth-mcp),
// spawned over stdio. We expose ONLY read tools to the agent so v1 stays
// read-only in behavior regardless of the OAuth token scope.
const READ_ONLY = new Set(['search_emails', 'read_email']);

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
      });
      const client = new Client({ name: 'wabil', version: '0.1.0' }, { capabilities: {} });
      await client.connect(transport);
      return client;
    })().catch((err) => {
      clientPromise = null; // allow retry on next call
      throw err;
    });
  }
  return clientPromise;
}

let toolsCache: Anthropic.Tool[] | null = null;

/** The read-only Gmail tools, in Anthropic tool shape. */
export async function getGmailTools(): Promise<Anthropic.Tool[]> {
  if (toolsCache) return toolsCache;
  const client = await getClient();
  const { tools } = await client.listTools();
  toolsCache = tools
    .filter((t) => READ_ONLY.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }));
  return toolsCache;
}

/** Call a Gmail tool through the MCP server; return its text result. */
export async function callGmailTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (!READ_ONLY.has(name)) return `error: "${name}" is not permitted (read-only v1)`;
  const client = await getClient();
  const res: any = await client.callTool({ name, arguments: input });
  const text = (res?.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  return text || '(no result)';
}

export function isGmailConnected(): boolean {
  return clientPromise !== null && toolsCache !== null;
}
