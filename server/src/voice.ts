import { runTurn, textOf } from './anthropic.js';
import { VOICE_PROMPT } from './prompts.js';
import type { EmailMeta } from './watcher.js';

// wabil's user-facing voice. The watcher CLASSIFIES and EXTRACTS; everything the
// user actually reads (proactive pokes, the morning digest) is written here with
// the pure Poke personality, so the proactive voice and the chat voice are the
// same wabil. No second hand-authored voice.

export type PokeFacts = {
  from: string;
  subject: string;
  summary: string;
  codes?: string;
};

// The orchestrator runs the raw Poke prompt, which emits <aside> private
// reasoning and <block>/link artifacts. Strip them so only the clean voiced
// text reaches the user (same rule the chat applies client-side).
function sanitize(raw: string): string {
  return String(raw)
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractJson(s: string): any {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json in voice output');
  return JSON.parse(m[0]);
}

/**
 * Phrase a lock-screen poke in wabil's voice from the classifier's extracted
 * facts. Returns { title, body }. Any OTP/code/link in `codes` must survive
 * character-for-character.
 */
export async function composePoke(f: PokeFacts): Promise<{ title: string; body: string }> {
  const task =
    `An email just arrived that's worth flagging to the user. Write the lock-screen notification ` +
    `they'll see — your voice, readable at a glance.\n\n` +
    `from: ${f.from}\n` +
    `subject: ${f.subject}\n` +
    `what it's about: ${f.summary}\n` +
    (f.codes ? `codes/links to preserve EXACTLY: ${f.codes}\n` : '') +
    `\nOutput ONLY this JSON and nothing else:\n` +
    `{"title": "<a few words>", "body": "<one short sentence naming who and what; preserve any code or link character-for-character>"}`;

  const msg = await runTurn({ system: VOICE_PROMPT, messages: [{ role: 'user', content: task }] });
  const j = extractJson(sanitize(textOf(msg)));
  const title = String(j.title || 'wabil').slice(0, 80);
  const body = String(j.body || f.summary || f.subject).slice(0, 220);
  return { title, body };
}

/** Write the morning digest in wabil's voice from the recent inbox. */
export async function composeDigest(emails: EmailMeta[]): Promise<string> {
  if (emails.length === 0) return 'your inbox is quiet. nothing new worth a look.';
  const list = emails.map((e) => `- ${e.from} — ${e.subject} (${e.date})`).join('\n');
  const task =
    `Here's the user's recent inbox. Write them a short morning catch-up in your voice: ` +
    `lead with anything that actually needs them, then a line for what's worth knowing, then ` +
    `sum up the rest as noise in a phrase. Name senders and subjects. Don't invent anything ` +
    `that isn't in the list. Write only the digest, no preamble or sign-off.\n\n${list}`;
  const msg = await runTurn({ system: VOICE_PROMPT, messages: [{ role: 'user', content: task }] });
  return sanitize(textOf(msg)) || 'could not put together a digest right now.';
}
