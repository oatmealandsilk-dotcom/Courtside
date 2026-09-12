/**
 * The tab a swipe is heading for, published the moment the gesture commits.
 *
 * The router does not know about the destination until the swipe animation has
 * finished, so anything driven by the route — the bottom bar above all — sat
 * on the old tab for the whole animation and then snapped. This lets the bar
 * move with the gesture while navigation catches up behind it.
 */
type Listener = () => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

export function setPendingTab(pathname: string | null) {
  if (pending === pathname) return;
  pending = pathname;
  listeners.forEach((listener) => listener());
}

export function getPendingTab() {
  return pending;
}

export function subscribePendingTab(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
