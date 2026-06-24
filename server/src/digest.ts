import { config } from './config.js';
import { composeDigest } from './voice.js';
import { callGmailTool } from './tools/gmailMcp.js';
import { parseSearch } from './watcher.js';

// The morning digest: a calm, in-voice catch-up on what is worth knowing in the
// inbox. This is what a poke tap opens. Cached briefly so rapid reloads don't
// re-spend tokens.

const TTL_MS = 2 * 60 * 1000;
let cache: { at: number; text: string; count: number } | null = null;

export type Digest = { generatedAt: number; text: string; count: number; cached: boolean };

export async function buildDigest(force = false): Promise<Digest> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return { generatedAt: cache.at, text: cache.text, count: cache.count, cached: true };
  }

  const raw = await callGmailTool('search_emails', { query: config.watchQuery, maxResults: config.watchMax });
  const emails = parseSearch(raw);

  // Written in the orchestrator's voice (see voice.ts), not a separate prompt.
  const text = await composeDigest(emails);

  cache = { at: Date.now(), text, count: emails.length };
  return { generatedAt: cache.at, text, count: emails.length, cached: false };
}

// The poke-tap landing page. Plain same-origin HTML (no build step) so it opens
// reliably from the installed PWA on iOS and matches the nocturnal aesthetic.
export const DIGEST_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#07080c" />
<title>wabil — this morning</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #07080c; color: #c4cde0;
    font: 16px/1.6 -apple-system, system-ui, sans-serif; }
  .wrap { max-width: 560px; margin: 0 auto;
    padding: calc(env(safe-area-inset-top, 0px) + 30px) 22px 40px; min-height: 100vh; }
  .kicker { font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
    color: #6b7689; margin: 0 0 6px; }
  h1 { font: 600 22px/1.2 -apple-system, system-ui; margin: 0 0 22px; color: #e7edf7; }
  .digest { white-space: pre-wrap; }
  .digest.loading { color: #6b7689; }
  .row { display: flex; align-items: center; gap: 16px; margin-top: 28px; }
  a, button.link { color: #8fa6cf; text-decoration: none; background: none; border: 0;
    padding: 0; font: inherit; cursor: pointer; }
  .muted { color: #6b7689; font-size: 13px; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="kicker">this morning</p>
    <h1>here's your inbox</h1>
    <div id="d" class="digest loading">reading your inbox…</div>
    <div class="row">
      <a href="/">open wabil →</a>
      <button class="link" id="refresh">refresh</button>
      <span class="muted" id="meta"></span>
    </div>
  </div>
  <script>
    async function load(force) {
      var d = document.getElementById('d');
      var meta = document.getElementById('meta');
      d.className = 'digest loading';
      d.textContent = 'reading your inbox…';
      try {
        var r = await fetch('/api/digest' + (force ? '?force=1' : ''));
        var j = await r.json();
        d.className = 'digest';
        d.textContent = j.text || 'nothing to show.';
        meta.textContent = typeof j.count === 'number' && j.count >= 0 ? j.count + ' recent' : '';
      } catch (e) {
        d.className = 'digest';
        d.textContent = 'could not load the digest. is the server up?';
      }
    }
    document.getElementById('refresh').addEventListener('click', function () { load(true); });
    load(false);
  </script>
</body>
</html>`;
