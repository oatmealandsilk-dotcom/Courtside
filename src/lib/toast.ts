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
   * A mark drawn in a brand-coloured disc instead of the plain icon:
   * 'session' (the zone bars, "Tennis detected"), 'logged' (a tick that
   * draws itself, "Logged"), 'flyby' (two people, "3 others were at Alder
   * Park today"), or 'record' (a record's rosette in a gold disc, "New record!").
   */
  glyph?: 'session' | 'logged' | 'flyby' | 'record';
  /**
   * A number on the right, under a thin rule: "10 day streak". It rolls up
   * from `from` as the toast lands, only when it grew (without `from`, from
   * the one before); otherwise it holds still.
   */
  stat?: { value: number; label: string; from?: number };
  /**
   * A small text button on the right, such as "Undo". Tapping it runs
   * `onPress` and closes the toast. A toast with one stays up longer, so
   * there is time to reach it.
   */
  action?: { label: string; onPress: () => void };
  /**
   * A quieter second button just before `action`, for a question with two
   * answers ("Still playing? · Keep going · Finish"). Tapping it runs
   * `onPress` and closes the toast, as `action` does.
   */
  secondary?: { label: string; onPress: () => void };
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
/** The toast up now, until the shell says it has gone (`closed`). */
let upId: number | null = null;

/**
 * A tiny announcement bus. Anything can `show()` a toast — the shell renders
 * it over whatever screen is up. Kept outside React so a modal that closes
 * in the same breath as it posts (the composer) can still announce itself.
 * Returns the toast's id, for `withdraw`.
 */
export function show(toast: Omit<ToastMessage, 'id'>): number {
  counter += 1;
  const message = { ...toast, id: counter };
  if (listeners.size) upId = message.id;
  listeners.forEach((fn) => fn(message));
  return message.id;
}

/**
 * Whether a toast is up right now. A note that can wait (How was the hit?)
 * checks first, so it never pushes away one that has to be read, such as
 * "You're open to hit · Off the map until Location is on".
 */
export function isShowing(): boolean {
  return upId !== null;
}

/** For the shell's toast: told when one has gone, however it went. */
export function closed(id: number) {
  if (upId === id) upId = null;
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
