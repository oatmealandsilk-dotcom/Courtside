import { useEffect, useState } from 'react';

import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { useTabActive } from '@/features/navigation/tabFocus';

/**
 * True once the page has rested a moment (`ms`) after any sideways swipe (a
 * section's or a tab's), and after `key` last changed (Community's section).
 * For something that joins a list and makes room for itself (a hit card's
 * tip): it must never land on the frames right after a swipe.
 *
 * Kept in the one small component that needs it, never in a whole page: a
 * page listening here was redrawn in full on the very frame every swipe in
 * the app began (audit, Oct 22). It listens only while `on` and its tab is
 * the one on show; arriving on the tab counts as a swipe.
 */
export function usePaneRested(on: boolean, key: string | undefined, ms = 1200): boolean {
  const tabActive = useTabActive();
  const [rested, setRested] = useState(false);
  useEffect(() => {
    if (!on || !tabActive) { setRested(false); return undefined; }
    let wait: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(wait);
      // Only a change of value redraws (React skips a setState to the same value).
      setRested(false);
      if (!isPageDragging()) wait = setTimeout(() => setRested(true), ms);
    };
    check();
    const off = subscribePageDragging(check);
    return () => { off(); clearTimeout(wait); };
  }, [on, tabActive, key, ms]);
  return on && rested;
}
