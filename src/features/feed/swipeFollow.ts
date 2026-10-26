import { makeMutable } from 'react-native-reanimated';

import { useApp } from '@/store/AppContext';

/**
 * The Feed follows the swipe (Oct 26, owner, about the bar going dark on a clip and light on a
 * written post: "Maybe keep the flip, but just make it smoother, right now it only changes+new
 * video starts playing once the tab fully settles in. Is there a solution").
 *
 * The way Reels and TikTok feel, two things move from "once the page has landed" to "while it moves":
 *
 *   - The look follows the page. Between a picture page (a clip, an Instant) and a written one, the
 *     bottom bar's look and the top row's ink blend in step with how far the page has moved, from
 *     the pager's own position on the animation thread: over the middle of the way, eased (a small
 *     nudge changes nothing, and the last fifth is already the next page's look), so the change is
 *     done before the page lands and goes back if the swipe is let go back. Between two pages of
 *     the same kind nothing changes. The bar's glass itself is never faded: a copy of the other look
 *     (never glass) lies over it and follows the page, and the glass turns under it half way
 *     (components/TabBarLooks). The top row has no glass and blends its colours directly
 *     (features/groups/FeedTopRow). The phone's clock turns once, as the swipe is decided, with the
 *     phone's own fade (FollowClock).
 *   - The next clip starts as the swipe is decided (the finger lifted and the page it lands on is
 *     known), not once it has landed: it plays, with its sound, as it slides in, and the clip being
 *     left stops at that same moment, as it already does (features/feed/pageLeaving). A swipe that
 *     springs back changes nothing.
 *
 * Everything else about the page on show still changes on landing (what is fetched ahead, what
 * counts as seen, the tips), so the Feed itself never redraws while the pages glide.
 *
 * None of it can be tried on an iPhone before it ships (no simulator here), so admins
 * (@oatmealandsilk, @mrdinosaur62) get it first. Turned on for everyone by setting this to true and
 * shipping an over-the-air update: no database change, no new native code. In the web demo,
 * ?admin=1 makes the demo's player an admin. The same pattern as PRELOAD_MORE_FOR_EVERYONE.
 * Off, everything is exactly as before.
 */
export const SWIPE_FOLLOW_FOR_EVERYONE = true;

/** Whether this person's Feed follows the swipe. */
export function useSwipeFollow(): boolean {
  const { currentUser } = useApp();
  return SWIPE_FOLLOW_FOR_EVERYONE || !!currentUser?.isAdmin;
}

/**
 * The look under the Feed's pages where they stand right now, on the animation thread: 0 a
 * written page, 1 a picture page, in between while a finger's swipe carries the feed from one
 * kind to the other. Written only by the pager of the feed on show (VerticalPager's `looks`).
 */
export const followLook = makeMutable(0);
/**
 * 1 while that pager stands between a picture page and a written one (followLook strictly between
 * 0 and 1); 0 at rest, between two pages of one kind, or once the pager stops sharing its look
 * (paused under a group's feed, gone). Only while it is 1 does anything follow followLook.
 */
export const followOn = makeMutable(0);
/**
 * 1 from a finger going down on that pager until the feed has come to rest (a finger may hold a
 * page part way, its look already the next page's): nothing hands the look back to the Feed's own
 * meanwhile.
 */
export const followHeld = makeMutable(0);
/**
 * Counts each time that pager lets go of its look at once (endFollow): it stops sharing it (paused
 * under a group's feed, gone), or a move made in code begins (back to the top), which is never
 * followed. Whatever followed the swipe goes back to the Feed's own look then, from where it stands,
 * rather than waiting for the Feed to say a look it may never say (the page it was heading for is
 * never landed on).
 */
export const followDrop = makeMutable(0);

/**
 * The look changes over the middle of the way from one page to the next, eased in and out: the
 * first fifth of a swipe keeps the page's own look (a small nudge changes nothing), the last fifth
 * is already the next page's, and in between it blends in step with the page. The half-way look is
 * half way through the swipe, so the bar's glass turns there (TabBarLooks).
 */
const BLEND_FROM = 0.2;
const BLEND_TO = 0.8;

/**
 * The look at `pos` (pages from the first, a fraction while moving), each page's own look in
 * `looks` (1 picture, 0 written): between two pages of different looks, how far the swipe is from
 * one to the other, eased (BLEND_FROM to BLEND_TO).
 */
export function lookAt(looks: readonly number[], pos: number): number {
  'worklet';
  const n = looks.length;
  if (n === 0) return 0;
  const at = Math.max(0, Math.min(n - 1, pos));
  const i = Math.floor(at);
  const here = looks[i] ? 1 : 0;
  if (i + 1 >= n) return here;
  const next = looks[i + 1] ? 1 : 0;
  if (next === here) return here;
  const t = Math.min(1, Math.max(0, (at - i - BLEND_FROM) / (BLEND_TO - BLEND_FROM)));
  return here + (next - here) * t * t * (3 - 2 * t);
}

/** The pager of the feed on show stands at `pos`: its look is shared with the bar and the top row. */
export function followPage(looks: readonly number[], pos: number) {
  'worklet';
  const look = lookAt(looks, pos);
  const between = look > 0 && look < 1 ? 1 : 0;
  if (followLook.value !== look) followLook.value = look;
  if (followOn.value !== between) followOn.value = between;
}

/**
 * That pager lets go of its look at once (paused, gone, or a move made in code begins): whatever
 * followed it goes back to the Feed's own look (followDrop). Called from the JavaScript side, or on
 * the animation thread inside a runOnUI, so the three change in one step there.
 */
export function endFollow() {
  'worklet';
  followOn.value = 0;
  followHeld.value = 0;
  followDrop.value += 1;
}

/** The glass turns to the other look once the look is this far past half way (and back the same), so a finger resting near the middle never flickers it. */
export const FLIP_PAST = 0.05;

/**
 * The page a decided swipe heads for, by its place in the feed (null when none): told by the pager
 * (`onHead`), read by the Feed's clock (FollowClock) only, so the Feed itself never redraws for it.
 */
export interface HeadStore {
  get: () => number | null;
  set: (index: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function makeHeadStore(): HeadStore {
  let index: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => index,
    set: (next) => {
      if (next === index) return;
      index = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
