import React, { useContext, useEffect, useState } from 'react';

import type { CountPlay } from '@/components/session/countFormat';
import { PageKeyContext, usePageHeading } from './pageLeaving';
import { useSwipeFollow } from './swipeFollow';

/**
 * When a Feed page's session stats count up: the same for a session's own card (PostCard) and a photo
 * post's stats under its picture (MediaPostPage), in For you, Activities and every group's feed (Oct 27,
 * owner: "It starts too late the numbers counting", then "on posts with pictures theres no animation like
 * how it was before, and on just activity, theres a weird delay to it").
 *
 *   - A page on its way in shows its numbers at their starting point ('wait'), never in full: in full,
 *     they could only fall back to count.
 *   - They count from the moment a decided swipe heads for the page (the finger lifted towards it,
 *     pageLeaving's `heading`), so they are already counting as it slides in; otherwise (the first page,
 *     a move made in code) from the moment it is the page on show (`active`). They start in the very
 *     draw that says so, not a draw later, and with no beat before them (the cards' `beat`).
 *   - Once per post: one that has counted (or that `seen` already holds) shows its numbers, still, when
 *     it comes round again.
 *   - Anywhere but a Feed page (no pager round it) the numbers show in full, still.
 *
 * Only the stats redraw as a swipe heads for the page, never the page round them, so the feed has as
 * little as possible to do while it glides. `seen` is the caller's own record of the posts whose numbers
 * have counted, or been shown in full.
 */
export function PageCount({ seen, postId, active, children }: {
  seen: Set<string>;
  postId: string;
  /** The page is the one on show. */
  active: boolean;
  /** The stats, drawn with when they count. */
  children: (play: CountPlay) => React.ReactNode;
}) {
  const onPage = useContext(PageKeyContext) !== null;
  const [play, setPlay] = useState<CountPlay>(() => (onPage && !seen.has(postId) ? 'wait' : false));
  const waiting = play === 'wait';
  // Only stats still waiting to count listen for a swipe heading their way.
  const heading = usePageHeading(useSwipeFollow() && waiting);
  const go = waiting && (active || heading);
  useEffect(() => {
    if (!go) return;
    seen.add(postId);
    setPlay(true);
  }, [go, seen, postId]);
  return <>{children(go ? true : play)}</>;
}
