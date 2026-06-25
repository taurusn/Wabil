// The orchestrator runs the raw Poke prompt, which emits <aside> private
// reasoning and <block>/link artifacts. Strip them so only clean voiced text is
// ever stored, returned, or fed back as context. Mirrors the client-side rule.
export function sanitize(raw: string): string {
  return String(raw)
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const cleanPiece = (s: string): string =>
  s
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Split a raw orchestrator reply into chat bubbles — conservatively. A few
 * genuinely SHORT, distinct lines read like someone firing off a couple of
 * texts, so those stay separate. Anything longer is a real answer and stays ONE
 * bubble instead of being chopped into a wall. `<aside>` is dropped; `<block>`
 * tags are unwrapped (their content kept together).
 */
const MAX_BUBBLES = 3;
const SHORT = 160; // roughly a text-message length

export function splitBubbles(raw: string): string[] {
  const text = String(raw)
    .replace(/<aside>[\s\S]*?<\/aside>/gi, '')
    .replace(/<\/?block>/gi, '');
  const pieces = text
    .split(/\n{2,}/)
    .map(cleanPiece)
    .filter(Boolean);
  if (pieces.length <= 1) return pieces;
  if (pieces.length <= MAX_BUBBLES && pieces.every((p) => p.length <= SHORT)) {
    return pieces; // a short burst of distinct texts
  }
  return [pieces.join('\n\n')]; // a real answer: keep it whole
}
