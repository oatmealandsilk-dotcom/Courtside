import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  /** Ionicons glyph name. */
  icon?: string;
  /** Where a tap on the toast goes. */
  href?: string;
  /**
   * A small text button on the right, such as "Undo". Tapping it runs
   * `onPress` and closes the toast. A toast with one stays up longer, so
   * there is time to reach it.
   */
  action?: { label: string; onPress: () => void };
}

type Listener = (toast: ToastMessage) => void;
const listeners = new Set<Listener>();
let counter = 0;

/**
 * A tiny announcement bus. Anything can `show()` a toast — the shell renders
 * it over whatever screen is up. Kept outside React so a modal that closes
 * in the same breath as it posts (the composer) can still announce itself.
 */
export function show(toast: Omit<ToastMessage, 'id'>) {
  counter += 1;
  const message = { ...toast, id: counter };
  listeners.forEach((fn) => fn(message));
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
