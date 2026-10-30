import { useContext, useEffect, useRef, useState } from 'react';

import type { CountPlay } from '@/components/session/countFormat';
import { PageKeyContext, usePageHeading, usePageLeaving } from './pageLeaving';
import { useSwipeFollow } from './swipeFollow';

/**
 * When a Feed page's session stats count up (Oct 30, owner: "The numbers on activities are fucked up
 * again. The counting starts way too late sometimes it doesn't even count", then "Count numbers to
 * start as you swipe"). The same for a session's own card (PostCard) and a photo post's stats under
 * its picture (MediaPostPage):
 *
 *   - A page not on show holds its numbers at their start ('wait'), never in full, so they never show
 *     in full and then drop to 0 to count.
 *   - They count from the moment a decided swipe heads for the page (the finger has let go towards it,
 *     pageLeaving's `heading`), so they are already counting as it slides in; a finger still dragging
 *     back and forth starts nothing. Otherwise (the first page, back to the top) from the moment it is
 *     the page on show (`active`).
 *   - Every time the page is landed on: once a swipe has left the page and it is off the screen (the
 *     pager lets go of `leaving` only after the Feed has drawn the next page), it goes back to its start,
 *     ready to count again. Anything else that takes `active` away for a while (the comments, another
 *     tab) leaves the numbers as they are.
 *   - Reduce Motion: the numbers simply show (CountUp, ZoneBar).
 *
 * Off a Feed page (no pager round it) it is as before: the numbers count the first time `active` is on
 * (once per post, `counted`), and show in full otherwise.
 */
export function usePageCount(postId: string, active: boolean, on: boolean, counted: Set<string>): CountPlay {
  const onPage = useContext(PageKeyContext) !== null;
  const follow = useSwipeFollow();
  const heading = usePageHeading(onPage && on && follow);
  const leaving = usePageLeaving();
  const go = on && (active || heading);
  const [state, setState] = useState<CountPlay>(() => (onPage ? (go ? true : 'wait') : false));
  // Waiting and now on its way in: it counts from this very draw, not one later.
  let play: CountPlay = state;
  if (onPage && state === 'wait') {
    if (shownWhole(postId)) play = false;
    else if (go) play = true;
  }
  useEffect(() => { if (play !== state) setState(play); }, [play, state]);
  // Back to the start once a swipe has carried the page off the screen.
  const left = useRef(false);
  const headed = useRef(heading);
  useEffect(() => {
    if (!onPage) return;
    const headingEnded = headed.current && !heading;
    headed.current = heading;
    if (leaving) { left.current = true; return; }
    if (active || heading) { left.current = false; return; }
    // Left by a swipe, or headed for by one that came to rest somewhere else.
    if (left.current || headingEnded) { left.current = false; setState('wait'); }
  }, [onPage, leaving, active, heading]);
  // Off a Feed page: once per post, as before.
  useEffect(() => {
    if (onPage || !on || !active || counted.has(postId)) return;
    counted.add(postId);
    setState(true);
  }, [onPage, on, active, postId, counted]);
  return play;
}

const whole = new Map<string, number>();
/**
 * A post whose page is already on show with its numbers before it is the page on screen (the Feed's
 * windows growing its feed back to the whole screen): if its numbers are still waiting, they show in
 * full rather than sitting at 0. Good for a moment only, so it never stops a later visit counting.
 */
export function markShownWhole(postId: string) { whole.set(postId, Date.now()); }
function shownWhole(postId: string): boolean {
  const at = whole.get(postId);
  if (at == null) return false;
  if (Date.now() - at < 1500) return true;
  whole.delete(postId);
  return false;
}
