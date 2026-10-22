import { useEffect, useMemo, useRef } from 'react';

/**
 * A finger held still on the feed brings the Feed's top row back, the way
 * Reels' row comes back on a hold (Oct 22, owner: "hold to slow scroll it
 * pops up"). Shared by both pagers (VerticalPager and its .web sibling), so
 * the phone and the browser behave alike.
 *
 * Everything else about the row follows the feed's own movement (see
 * features/feed/topRowScroll): forward takes it out with the finger, back
 * brings it in. A hold is only a finger that has all but stopped, so a slow
 * drag forward still takes the row out rather than fighting it.
 */

/** How long a finger must be down before a hold counts, and how often its speed is checked after. */
const HOLD_MS = 200;
const CHECK_MS = 80;
/** Less than this (points per check) is a finger held still rather than a drag. */
const STILL = 5;

export interface TopRowHint {
  down: (y: number) => void;
  move: (y: number) => void;
  up: () => void;
}

export function useTopRowHint(onHold?: () => void): TopRowHint {
  const cb = useRef(onHold);
  cb.current = onHold;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const y = useRef(0);
  const checkedAt = useRef(0);
  const hint = useMemo<TopRowHint>(() => {
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    const check = () => {
      timer.current = null;
      if (Math.abs(y.current - checkedAt.current) < STILL) { cb.current?.(); return; }
      checkedAt.current = y.current;
      timer.current = setTimeout(check, CHECK_MS);
    };
    return {
      down: (at) => {
        clear();
        if (!cb.current) return;
        y.current = at;
        // Measured from where the finger is a moment before the hold counts, so a swipe still moving fast then does not count.
        timer.current = setTimeout(() => { checkedAt.current = y.current; timer.current = setTimeout(check, CHECK_MS); }, HOLD_MS - CHECK_MS);
      },
      move: (at) => { y.current = at; },
      up: clear,
    };
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return hint;
}
