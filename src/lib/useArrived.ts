import { startTransition, useEffect, useRef, useState } from 'react';
import { useNavigation } from 'expo-router';

/**
 * Whether this page has finished sliding in (or, for a page opened without a
 * slide, a moment has passed). A long page draws its first screenful with the
 * page and the rest once this turns true: on a phone a page cannot start to
 * slide in until all of it is drawn, so drawing every row of a long list
 * first held the tap up (Oct 10, owner: "the buttons like the settings. msg
 * notifications, etc respond too slow"). The rest comes in as background
 * work, so a tap meanwhile still goes first, and it is below the first
 * screen, out of sight, before anyone can scroll to it.
 *
 * `wait` false: true at once, nothing listened to and no redraw later (a page that only waits for
 * some people, pressV2). Once it has said true it keeps saying so, even if `wait` turns on after.
 */
export function useArrived(wait = true): boolean {
  const navigation = useNavigation();
  const [arrived, setArrived] = useState(false);
  const never = useRef(!wait);
  if (!wait) never.current = true;
  const now = arrived || never.current;
  useEffect(() => {
    if (now) return undefined;
    let done = false;
    const arrive = () => {
      if (done) return;
      done = true;
      startTransition(() => setArrived(true));
    };
    const events = navigation as unknown as { addListener?: (name: string, fn: (e?: { data?: { closing?: boolean } }) => void) => () => void };
    const stop = events.addListener?.('transitionEnd', (e) => { if (!e?.data?.closing) arrive(); });
    // In case the page never says it has arrived (opened without a slide, or in a browser).
    const fallback = setTimeout(arrive, 700);
    return () => { done = true; clearTimeout(fallback); stop?.(); };
  }, [navigation, now]);
  return now;
}
