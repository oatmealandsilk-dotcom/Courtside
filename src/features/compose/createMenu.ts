/**
 * The Create box's own close, so the + in the tab bar can use it: a second
 * tap on + closes the box with the same animation as its × — only while the
 * box is showing (never mid-post, where it would throw work away).
 */
let closer: (() => void) | null = null;

/** The Create box hands over its close while it is on screen. Returns the hand-back. */
export function registerCreateClose(close: () => void) {
  closer = close;
  return () => { if (closer === close) closer = null; };
}

/** True if the box was open and is now closing. */
export function closeCreateMenu(): boolean {
  if (!closer) return false;
  closer();
  return true;
}
