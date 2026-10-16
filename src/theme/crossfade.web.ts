import { flushSync } from 'react-dom';

let styled = false;

/**
 * A theme change in a browser, as a true cross-fade: the browser photographs
 * the page as it is, the app redraws in the new court's colours, and the
 * browser fades from the photograph to the new page. Nothing blanks. Only
 * browsers with view transitions do this (Chrome, Edge, Safari 18+); the
 * others get the veil. Returns whether it handled the change.
 */
export function crossfade(update: () => void): boolean {
  const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : null;
  if (!doc?.startViewTransition) return false;
  if (!styled) {
    styled = true;
    const style = doc.createElement('style');
    // 180 ms, down from 420 (Oct 16, owner: "lets make it instant"): long enough to hide the repaint,
    // short enough to read as at once. It matters twice over: while it fades the browser shows a
    // picture of the page, and a tap in that moment lands on nothing.
    style.textContent = '::view-transition-old(root),::view-transition-new(root){animation-duration:180ms;animation-timing-function:cubic-bezier(0.2,0,0.2,1)}';
    doc.head.appendChild(style);
  }
  doc.startViewTransition(() => { flushSync(update); });
  return true;
}
