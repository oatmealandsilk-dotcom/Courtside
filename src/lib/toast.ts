import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  /** Ionicons glyph name, or 'hit' for the app's own hit mark (HitGlyph). */
  icon?: string;
  /** Where a tap on the toast goes. */
  href?: string;
  /**
   * A small text button on the right, such as "Undo". Tapping it runs
   * `onPress` and closes the toast. A toast with one stays up longer, so
   * there is time to reach it.
   */
  action?: { label: string; onPress: () => void };
  /**
   * A note that has to be read, not glanced at: why something was refused.
   * It stays up much longer, its words wrap onto more lines instead of being
   * cut off with "…", and a tap puts it away once read.
   */
  long?: boolean;
  /**
   * How long it stays up, for a question that must not slip by unseen ("How
   * was the hit?"). A flick or a tap still puts it away sooner.
   */
  holdMs?: number;
  /**
   * Told once how it went, and how long it was up: it stayed its full time,
   * was tapped, its button was used, it was flicked away, another toast took
   * its place first ('replaced'), or the caller took it back ('withdrawn').
   */
  onClosed?: (how: ToastClosed, upMs: number) => void;
}

export type ToastClosed = 'timeout' | 'tap' | 'action' | 'flick' | 'replaced' | 'withdrawn';

type Listener = (toast: ToastMessage) => void;
const listeners = new Set<Listener>();
const withdrawers = new Set<(id: number) => void>();
let counter = 0;

/**
 * A tiny announcement bus. Anything can `show()` a toast — the shell renders
 * it over whatever screen is up. Kept outside React so a modal that closes
 * in the same breath as it posts (the composer) can still announce itself.
 * Returns the toast's id, for `withdraw`.
 */
export function show(toast: Omit<ToastMessage, 'id'>): number {
  counter += 1;
  const message = { ...toast, id: counter };
  listeners.forEach((fn) => fn(message));
  return message.id;
}

/** Puts a toast away early if it is still up (a question that should not sit over a page where someone is busy). */
export function withdraw(id: number) {
  withdrawers.forEach((fn) => fn(id));
}

/** For the shell's toast: told when one is taken back. */
export function onWithdraw(fn: (id: number) => void): () => void {
  withdrawers.add(fn);
  return () => { withdrawers.delete(fn); };
}

/**
 * "Muted @sam · Undo": the note after a one-tap change that is easy to make
 * by accident (a mute, an unfollow, an unsave). `undo` puts it back; the
 * caller decides whether there is still anything to put back by then.
 */
export function showUndo(title: string, undo: () => void, extra?: { body?: string; icon?: string }) {
  show({ title, ...extra, action: { label: 'Undo', onPress: undo } });
}

export function useToast(): ToastMessage | null {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => { listeners.delete(setCurrent); };
  }, []);
  return current;
}
