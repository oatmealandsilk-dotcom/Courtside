import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

/**
 * A like or a save that answers on the tap itself.
 *
 * The button flips straight away, on its own state; the store's update —
 * which redraws every page that reads the store — goes through as a
 * background render, so the fill and the count never wait for it. When the
 * store catches up the two agree and the hand-over is invisible.
 *
 * `key` names the thing ("p:<post id>", "h:<hit id>") so a double tap on the
 * picture can ask what the button already intends (see `wantsOn`) instead of
 * reading the store, which may still be a beat behind.
 *
 * `onToken` is that double tap: a fresh token means "on, whatever the button
 * thought", so the heart fills together with the burst.
 */
export function useOptimisticToggle(key: string, value: boolean, commit: () => void, onToken = 0) {
  const [on, setOn] = useState(value);
  useEffect(() => {
    setOn(value);
    if (pending.get(key) === value) pending.delete(key);
  }, [key, value]);
  const seen = useRef(onToken);
  useEffect(() => {
    if (onToken && onToken !== seen.current) setOn(true);
    seen.current = onToken;
  }, [onToken]);
  const toggle = useCallback(() => {
    setOn((v) => { pending.set(key, !v); return !v; });
    startTransition(commit);
  }, [key, commit]);
  return { on, toggle, delta: on === value ? 0 : on ? 1 : -1 };
}

/** What each button has asked for and the store has not yet confirmed. */
const pending = new Map<string, boolean>();

/** Whether a button already intends this thing to be on — undefined when nothing is in flight. */
export const wantsOn = (key: string) => pending.get(key);
