import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  /** Ionicons glyph name. */
  icon?: string;
  /** Where a tap on the toast goes. */
  href?: string;
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

export function useToast(): ToastMessage | null {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => { listeners.delete(setCurrent); };
  }, []);
  return current;
}
