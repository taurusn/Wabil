import { config } from './config.js';
import { runTurn, textOf } from './anthropic.js';
import { WATCHER_PROMPT } from './prompts.js';
import { composePoke } from './voice.js';
import { callGmailTool } from './tools/gmailMcp.js';
import { subscriptionCount } from './push.js';
import * as runtime from './runtime.js';
import * as seen from './seen.js';

// The watcher brain: poll Gmail on an interval, classify each new email
// (notify-now / hold-till-morning / ignore) with Claude in wabil's voice, and
// poke through the web-push channel. This is the proactive half of wabil and
// the reason the push channel exists.

const MORNING_WINDOW_HOURS = 3;
const SEEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BODY_LIMIT = 2000;

export type EmailMeta = { id: string; subject: string; from: string; date: string };

export type TickResult = {
  processed: number;
  classified: number;
  poked: number;
  pending: number;
  baseline?: boolean;
  errors: string[];
};

let lastTickAt = 0;
let lastError: string | null = null;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Parse the GongRzhe search_emails text block (ID/Subject/From/Date records). */
export function parseSearch(text: string): EmailMeta[] {
  const out: EmailMeta[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const id = block.match(/^ID:\s*(\S+)/m)?.[1];
    if (!id) continue;
    out.push({
      id,
      subject: block.match(/^Subject:\s*(.*)$/m)?.[1]?.trim() || '(no subject)',
      from: block.match(/^From:\s*(.*)$/m)?.[1]?.trim() || '(unknown sender)',
      date: block.match(/^Date:\s*(.*)$/m)?.[1]?.trim() || '',
    });
  }
  return out;
}

function localHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: config.watchTz }).format(new Date())
  );
}

function localNow(): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: config.watchTz,
  }).format(new Date());
}

function inMorningWindow(): boolean {
  const h = localHour();
  return h >= config.watchMorningHour && h < config.watchMorningHour + MORNING_WINDOW_HOURS;
}

// Same-origin so the poke opens wabil itself (iOS web push won't open an
// out-of-scope link). A tap lands on the morning digest, the catch-up view.
function pokeUrl(): string {
  return '/digest';
}

function extractJson(s: string): unknown {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json in classifier output');
  return JSON.parse(m[0]);
}

async function readBody(id: string): Promise<string> {
  try {
    return (await callGmailTool('read_email', { messageId: id })).slice(0, BODY_LIMIT);
  } catch {
    return '';
  }
}

// The classifier decides AND extracts substance — it does NOT phrase the poke.
// The orchestrator voice (composePoke) writes what the user reads.
type Decision = {
  decision: 'now' | 'morning' | 'ignore';
  reason?: string;
  from?: string;
  summary?: string;
  codes?: string;
};

async function classify(m: EmailMeta, body: string): Promise<Decision> {
  const system = WATCHER_PROMPT.replace('{{NOW}}', localNow()).replace('{{TZ}}', config.watchTz);
  const user = `From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\n\n${body}`;
  const msg = await runTurn({ system, messages: [{ role: 'user', content: user }] });
  const d = extractJson(textOf(msg)) as Decision;
  if (d.decision !== 'now' && d.decision !== 'morning' && d.decision !== 'ignore') {
    throw new Error(`bad decision: ${JSON.stringify(d.decision)}`);
  }
  return d;
}

/** One polling pass: classify new mail, deliver any due pokes. */
export async function tick(): Promise<TickResult> {
  const errors: string[] = [];
  let classified = 0;
  let poked = 0;

  const raw = await callGmailTool('search_emails', { query: config.watchQuery, maxResults: config.watchMax });
  const emails = parseSearch(raw);

  // First ever run: baseline the current inbox so we never poke the backlog.
  if (seen.isEmpty()) {
    for (const m of emails) {
      seen.put(m.id, { status: 'baseline', subject: m.subject, from: m.from, classifiedAt: Date.now() });
    }
    lastTickAt = Date.now();
    lastError = null;
    return { processed: emails.length, classified: 0, poked: 0, pending: 0, baseline: true, errors };
  }

  // Classify anything genuinely new.
  for (const m of emails) {
    if (seen.has(m.id)) continue;
    try {
      const d = await classify(m, await readBody(m.id));
      classified++;
      if (d.decision === 'ignore') {
        seen.put(m.id, { status: 'ignored', decision: 'ignore', subject: m.subject, from: m.from, classifiedAt: Date.now() });
      } else {
        // The orchestrator voice phrases the poke from the classifier's facts.
        // If voicing fails, fall back to a plain poke so we still notify.
        let poke: { title: string; body: string; url: string; tag: string };
        try {
          const voiced = await composePoke({
            from: d.from || m.from,
            subject: m.subject,
            summary: d.summary || m.subject,
            codes: d.codes,
          });
          // Inbox pokes live in their OWN tag namespace so they can never merge
          // with a chat-reply push (wabil-chat-<id>); see bus.ts.
          poke = { ...voiced, url: pokeUrl(), tag: `wabil-inbox-${m.id}` };
        } catch (e: any) {
          errors.push(`voice ${m.id}: ${e?.message || e}`);
          // message-in-title: an empty title gets auto-filled with "wabil" by iOS
          poke = { title: d.summary || m.subject, body: '', url: pokeUrl(), tag: `wabil-inbox-${m.id}` };
        }
        seen.put(m.id, {
          status: 'pending',
          decision: d.decision,
          poke,
          subject: m.subject,
          from: m.from,
          classifiedAt: Date.now(),
        });
      }
    } catch (e: any) {
      // Do NOT mark seen — retry on a later tick (e.g. once API credits return).
      errors.push(`classify ${m.id}: ${e?.message || e}`);
    }
  }

  // Deliver due pokes as CHAT MESSAGES (wabil texting you). deliverProactive
  // persists the bubble and streams it live, or pushes when the app is closed —
  // tapping the notification opens the chat with the poke sitting in it. Claim
  // the key as 'poked' only AFTER delivery.
  let pending = 0;
  for (const [id, rec] of seen.entries()) {
    if (rec.status !== 'pending' || !rec.poke) continue;
    const due = rec.decision === 'now' || (rec.decision === 'morning' && inMorningWindow());
    if (!due) {
      pending++;
      continue;
    }
    try {
      runtime.deliverProactive(rec.poke.body);
      seen.put(id, { ...rec, status: 'poked', pokedAt: Date.now() });
      poked++;
    } catch (e: any) {
      errors.push(`poke ${id}: ${e?.message || e}`);
      pending++;
    }
  }

  seen.prune(SEEN_TTL_MS);
  lastTickAt = Date.now();
  lastError = errors.length ? errors.join('; ') : null;
  return { processed: emails.length, classified, poked, pending, errors };
}

async function loop(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const r = await tick();
    const note = r.baseline ? `baselined ${r.processed}` : `+${r.classified} classified, ${r.poked} poked, ${r.pending} pending`;
    console.log(`[watcher] tick: ${note}${r.errors.length ? ` (${r.errors.length} err)` : ''}`);
  } catch (e: any) {
    lastError = e?.message || String(e);
    console.error('[watcher] tick failed:', lastError);
  } finally {
    running = false;
    timer = setTimeout(loop, config.watchIntervalMs);
  }
}

export function startWatcher(): void {
  if (!config.watchEnabled) {
    console.log('  watcher       disabled (WATCH_ENABLED=false)');
    return;
  }
  if (timer) return;
  timer = setTimeout(loop, 8000); // first pass shortly after boot
  console.log(`  watcher       on · every ${Math.round(config.watchIntervalMs / 1000)}s · ${config.watchTz}`);
}

export function watcherStatus() {
  return {
    enabled: config.watchEnabled,
    intervalMs: config.watchIntervalMs,
    query: config.watchQuery,
    tz: config.watchTz,
    morningHour: config.watchMorningHour,
    localHour: localHour(),
    inMorningWindow: inMorningWindow(),
    lastTickAt,
    lastError,
    subscribers: subscriptionCount(),
    counts: seen.counts(),
  };
}
