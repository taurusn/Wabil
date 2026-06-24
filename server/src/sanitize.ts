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
