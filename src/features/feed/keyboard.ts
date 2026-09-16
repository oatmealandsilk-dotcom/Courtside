import { Platform } from 'react-native';

/**
 * On a computer the space bar plays and pauses whatever video is on screen,
 * the way it does on YouTube. Players listen while they are the active one;
 * typing in a box never triggers it.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let wired = false;

function wire() {
  if (wired || Platform.OS !== 'web' || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
    if (!listeners.size) return;
    e.preventDefault();
    listeners.forEach((fn) => fn());
  });
}

/** Call while the player is the one on screen; returns the unsubscribe. */
export function onSpaceBar(fn: Listener) {
  wire();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
