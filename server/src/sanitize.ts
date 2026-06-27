// The orchestrator runs the raw Poke prompt, which emits <aside> private
// reasoning and <block>/link artifacts. Strip them so only clean voiced text is
// ever stored, returned, or fed back as context. Mirrors the client-side rule.
// Strip Poke link artifacts: the documented `[label](url)` form AND the
// `<label>(url)` mangling Gemini sometimes emits, plus any leftover bare label.
const stripLinks = (s: string): string =>
  s
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>\s]+>\([^)]*\)/g, '')
    .replace(/\(poke\.com\/[^)]*\)/g, '')
    // bare Poke link labels Gemini leaks as plain text, e.g. "28_view-email"
    .replace(/<?\b\d{2}_[a-z][a-z-]*\b>?/g, '')
    // markdown the UI would render raw (it's a plain-text bubble): keep the words
    .replace(/\*\*([^*]+?)\*\*/g, '$1') // **bold**
    .replace(/(?<![*\w])\*([^*\n]+?)\*(?!\w)/g, '$1') // *italic*
    .replace(/(?<![_\w])__([^_]+?)__(?!\w)/g, '$1') // __bold__
    .replace(/`([^`]+?)`/g, '$1') // `code`
    .replace(/^#{1,6}[ \t]+/gm, ''); // # headings

export function sanitize(raw: string): string {
  return stripLinks(
    String(raw)
      .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
      .replace(/<\/?block>/gi, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const cleanPiece = (s: string): string =>
  stripLinks(s)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Split a raw orchestrator reply into chat bubbles, the way Poke actually does
 * it (see orchestrator.xml: "use <block> to keep multi-line content in a single
 * bubble; conversational responses are not blocked"). So:
 *   - <block>…</block> content stays ONE bubble (a list/structured chunk).
 *   - a bulleted/numbered list that wasn't blocked is also kept as one bubble.
 *   - conversational prose is split into separate bubbles per paragraph, and a
 *     long paragraph is further split at sentence boundaries so no single bubble
 *     is a wall of text.
 * The client reveals these one at a time with a typing beat, so a multi-part
 * answer lands like someone firing off several short texts. Capped so we never
 * wall the user with too many bubbles.
 */
const MAX_BUBBLES = 4;
const MAX_BUBBLE_LEN = 240; // ~2-3 sentences; longer prose gets chunked
const SPLIT_THRESHOLD = 300; // a short, unstructured reply stays ONE message

// True if a paragraph reads like a list (>= 2 bullet/numbered lines): keep whole.
const isList = (p: string): boolean => (p.match(/^\s*([-*•]|\d+[.)])\s/gm) || []).length >= 2;

// Split one long prose paragraph into sentence-grouped chunks, each <= max. A
// single sentence longer than max is kept whole (can't split mid-sentence).
// Splits only at a sentence end FOLLOWED BY whitespace, so it never drops text
// and a domain like "chess.com" (dot not followed by a space) stays intact.
function chunkProse(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const sentences = p.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (!cur) cur = s;
    else if ((cur + ' ' + s).length <= max) cur += ' ' + s;
    else {
      out.push(cur);
      cur = s;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function splitBubbles(raw: string): string[] {
  const text = String(raw).replace(/<aside>[\s\S]*?<\/aside>/gi, '');

  // A short, unstructured reply is ONE message. The "second text" cadence comes
  // from the runtime's optional follow-up turn, not from chopping one reply up.
  // Only split when there's structure (a list/block) or the reply is long.
  const hasStructure = /<block>/i.test(text) || text.split(/\n{2,}/).some((p) => isList(cleanPiece(p)));
  const plain = cleanPiece(text.replace(/<\/?block>/gi, ''));
  if (!hasStructure && plain.length <= SPLIT_THRESHOLD) return plain ? [plain] : [];

  const bubbles: string[] = [];

  const addProse = (s: string): void => {
    for (const para of s.split(/\n{2,}/)) {
      const p = cleanPiece(para);
      if (!p) continue;
      if (isList(p)) bubbles.push(p); // an unblocked list still stays one bubble
      else for (const c of chunkProse(p, MAX_BUBBLE_LEN)) bubbles.push(c);
    }
  };

  // Honor <block> as atomic single bubbles; split the prose around them.
  const re = /<block>([\s\S]*?)<\/block>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    addProse(text.slice(last, m.index));
    const block = cleanPiece(m[1]);
    if (block) bubbles.push(block);
    last = re.lastIndex;
  }
  addProse(text.slice(last));

  // Merge a dangling lead-in (a short single line ending with ":") into the
  // bubble it introduces, so we never send a naked "here's the rundown:" with
  // the content stranded in the next text.
  const merged: string[] = [];
  for (const b of bubbles) {
    const prev = merged[merged.length - 1];
    if (prev && /:\s*$/.test(prev) && prev.length <= 60 && !prev.includes('\n')) {
      merged[merged.length - 1] = `${prev}\n${b}`;
    } else {
      merged.push(b);
    }
  }
  bubbles.length = 0;
  bubbles.push(...merged);

  if (!bubbles.length) {
    const whole = cleanPiece(text.replace(/<\/?block>/gi, ''));
    return whole ? [whole] : [];
  }
  // Never wall the user: cap the count, merging any overflow into the last bubble.
  if (bubbles.length > MAX_BUBBLES) {
    const head = bubbles.slice(0, MAX_BUBBLES - 1);
    head.push(bubbles.slice(MAX_BUBBLES - 1).join('\n\n'));
    return head;
  }
  return bubbles;
}
