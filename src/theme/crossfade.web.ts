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
    style.textContent = '::view-transition-old(root),::view-transition-new(root){animation-duration:420ms;animation-timing-function:cubic-bezier(0.4,0,0.2,1)}';
    doc.head.appendChild(style);
  }
  doc.startViewTransition(() => { flushSync(update); });
  return true;
}
