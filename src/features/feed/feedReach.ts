import { useApp } from '@/store/AppContext';

/**
 * Build ahead of where a swipe is heading (Oct 28, owner: "Also rn scrolling fast on the feed I
 * almost immediatly get hit with loading screen" / "The scrolling needs to be ultra smooth like insta
 * and TikTok").
 *
 * The page on screen (`active`) only changes once a swipe has landed, so a run of quick flicks used
 * to carry the feed past the pages built around it onto pages that were not built yet, and then
 * built several at once when it finally came to rest. The pager now also says, the moment a finger
 * lifts, which page the swipe will rest on (VerticalPager's `onReach`, the same page it already
 * works out for the clip being left). With this on, the Feed builds around that page from then on
 * (the page itself, the one before it and the one after it) once it is two or more pages on, and draws
 * covers from there, while playback still follows the page on screen: nothing starts or stops
 * mid-swipe because of it (the owner turned that down on Oct 19). At most four pages are built while a swipe heads ahead, so
 * no more video players are alive at once than before.
 *
 * It can only be judged by feel on an iPhone, so admins (@oatmealandsilk, @mrdinosaur62) get it
 * first. Turned on for everyone by setting this to true and shipping an over-the-air update: no
 * database change, no new native code. In the web demo, ?admin=1 makes the demo's player an admin.
 * The same pattern as PRELOAD_MORE_FOR_EVERYONE.
 */
export const FEED_REACH_FOR_EVERYONE = true;

/** Whether this person's Feed builds ahead of where a swipe is heading. */
export function useFeedReach(): boolean {
  const { currentUser } = useApp();
  return FEED_REACH_FOR_EVERYONE || !!currentUser?.isAdmin;
}

/** The most pages built at once while a swipe heads past the ones around the page on screen. */
export const REACH_BUILT_MAX = 4;
