import { useEffect, useMemo, useRef } from 'react';

/**
 * When the Feed's top row should show, read from the finger on the feed, the
 * way Instagram's Reels row comes and goes (Oct 22, owner: "when you scroll up
 * or hold to slow scroll it pops up"). Shared by both pagers (VerticalPager
 * and its .web sibling), so the phone and the browser behave alike:
 *
 * - a finger held down, or dragging slowly, brings the row back;
 * - a quick flick does not (the row stays put until the swipe lands);
 * - a swipe that lands on the next page tucks the row, one that lands back
 *   on the page before shows it (`landed`);
 * - any move back up shows it straight away (the pager calls `show`).
 */

/** How long a finger must be down before a hold counts, and how often its speed is checked after. */
const HOLD_MS = 200;
const CHECK_MS = 80;
/** Slower than this (points per check) is a hold or a slow drag rather than a flick. */
const SLOW = 18;

export interface TopRowHint {
  down: (y: number) => void;
  move: (y: number) => void;
  up: () => void;
  show: () => void;
  landed: (forward: boolean) => void;
}

export function useTopRowHint(onTopRow?: (show: boolean) => void): TopRowHint {
  const cb = useRef(onTopRow);
  cb.current = onTopRow;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const y = useRef(0);
  const checkedAt = useRef(0);
  const shownThisTouch = useRef(false);
  const hint = useMemo<TopRowHint>(() => {
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
    const check = () => {
      timer.current = null;
      if (Math.abs(y.current - checkedAt.current) < SLOW) { shownThisTouch.current = true; cb.current?.(true); return; }
      checkedAt.current = y.current;
      timer.current = setTimeout(check, CHECK_MS);
    };
    return {
      down: (at) => {
        clear();
        if (!cb.current) return;
        y.current = at;
        shownThisTouch.current = false;
        // Measured from where the finger is a moment before the hold counts, so a swipe still moving fast then does not count.
        timer.current = setTimeout(() => { checkedAt.current = y.current; timer.current = setTimeout(check, CHECK_MS); }, HOLD_MS - CHECK_MS);
      },
      move: (at) => { y.current = at; },
      up: clear,
      show: () => { cb.current?.(true); },
      landed: (forward) => { cb.current?.(!forward); },
    };
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return hint;
}
