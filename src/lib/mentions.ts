/**
 * The @handle being typed at the caret, if any.
 *
 * Looks back from the caret for an "@" that starts a word and has only
 * handle characters between it and the caret. "hey @mi|" gives "mi";
 * "email me@x|" gives nothing because the @ is mid-word.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const upTo = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const match = /(^|[\s(])@([a-z0-9_.]*)$/i.exec(upTo);
  if (!match) return null;
  const start = upTo.length - match[2].length - 1;
  return { start, query: match[2] };
}

/** Replaces the partial @handle at the caret with the chosen one, plus a space. */
export function applyMention(text: string, start: number, caret: number, handle: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const inserted = `@${handle} `;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}
