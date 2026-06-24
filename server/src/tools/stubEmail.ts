import type Anthropic from '@anthropic-ai/sdk';

// Phase-2 stub: a fake inbox so we can prove the orchestrator → execution
// firewall end-to-end WITHOUT real Gmail. Phase 3 swaps this for the real
// connector (MCP / Gmail API) behind the same tool name + shape.

type FakeEmail = { id: string; from: string; subject: string; date: string; snippet: string };

const INBOX: FakeEmail[] = [
  {
    id: 'm_801',
    from: 'Sara Alotaibi <sara@example.com>',
    subject: 're: friday plans',
    date: '2026-06-24',
    snippet: "still good for 7pm? no rush, whenever works for you.",
  },
  {
    id: 'm_802',
    from: 'JHAH Billing <noreply@jhah.com>',
    subject: 'Invoice #2204 due',
    date: '2026-06-23',
    snippet: 'Your invoice of 1,250 SAR is due on 2026-06-30.',
  },
  {
    id: 'm_803',
    from: 'GitHub <notifications@github.com>',
    subject: '[taurusn/wabil] new sign-in from a new device',
    date: '2026-06-24',
    snippet: 'A new device just signed in to your account.',
  },
];

export const searchEmailTool: Anthropic.Tool = {
  name: 'search_email',
  description:
    "Search the user's inbox and return matching messages (sender, subject, date, snippet, id). Use a few keywords or a sender name as the query.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'keywords, sender, or subject to match' },
    },
    required: ['query'],
  },
};

export function runSearchEmail(input: { query: string }): string {
  const q = (input.query || '').toLowerCase();
  const hits = INBOX.filter((e) =>
    [e.from, e.subject, e.snippet].some((f) => f.toLowerCase().includes(q)),
  );
  const list = hits.length ? hits : INBOX; // empty query → return everything
  return JSON.stringify(
    list.map((e) => ({ id: e.id, from: e.from, subject: e.subject, date: e.date, snippet: e.snippet })),
    null,
    2,
  );
}
