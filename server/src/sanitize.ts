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
 * Split a raw orchestrator reply into chat bubbles, the way Poke fires off
 * several short texts: `<block>…</block>` stays a single bubble; everything else
 * splits on blank lines. `<aside>` private reasoning is dropped. Returns clean
 * bubble strings in order.
 */
export function splitBubbles(raw: string): string[] {
  const noAside = String(raw).replace(/<aside>[\s\S]*?<\/aside>/gi, '');
  const bubbles: string[] = [];
  const pushPlain = (s: string) => {
    for (const p of s.split(/\n{2,}/)) {
      const t = cleanPiece(p);
      if (t) bubbles.push(t);
    }
  };
  const re = /<block>([\s\S]*?)<\/block>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noAside)) !== null) {
    pushPlain(noAside.slice(last, m.index));
    const block = cleanPiece(m[1]);
    if (block) bubbles.push(block);
    last = re.lastIndex;
  }
  pushPlain(noAside.slice(last));
  return bubbles;
}
