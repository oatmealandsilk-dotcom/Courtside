import { useSyncExternalStore } from 'react';

import { OPENS_ON_FEED } from '@/features/navigation/startTab';

/**
 * The splash curtain's shared state: the same mark and name as the splash,
 * kept up over the app while the page it opens on gets ready, then faded out
 * once (see WarmCurtain). It lives in the shell, across the route change from
 * the splash screen into the tabs — one curtain, never swapped, so nothing
 * can flicker and there is no blank beat in between.
 */

/**
 * Whether the feed has its first pages ready. When the app opens on the feed
 * (OPENS_ON_FEED in startTab), this is what the curtain waits for.
 */
let warm = false;
/**
 * Whether the start page (Community: see startTab) is built and has drawn
 * once. When the app opens there, this is what the curtain waits for — the
 * page itself, not the feed, which loads behind it in its own time.
 */
let startDrawn = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((fn) => fn());

export function setFeedWarm(value: boolean) {
  if (warm === value) return;
  warm = value;
  tell();
}
export function setStartDrawn(value: boolean) {
  if (startDrawn === value) return;
  startDrawn = value;
  tell();
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useFeedWarm() {
  return useSyncExternalStore(subscribe, () => warm, () => warm);
}
/** Whether the page under the curtain is ready for it to lift: the feed's first pages, or the start page drawn. */
const ready = () => (OPENS_ON_FEED ? warm : startDrawn);
export function useCurtainReady() {
  return useSyncExternalStore(subscribe, ready, ready);
}
/** The curtain's own time limit is up: whatever it was waiting for counts as ready. */
export function curtainReadyAnyway() {
  if (OPENS_ON_FEED) setFeedWarm(true);
  else setStartDrawn(true);
}

/**
 * Whether the curtain has finished fading and is off the screen. Playback,
 * the bar's first rise and the tutorial wait for this.
 *
 * Opening on the feed, the curtain is up from the start. Opening anywhere
 * else it is down until the splash puts it up (raiseCurtain), just as it
 * hands a signed-in open over to the start page; anything that never goes
 * through that (a link opened cold) has nothing to wait for.
 */
let down = !OPENS_ON_FEED;
/** When the curtain must lift by, whatever it is waiting for (see WarmCurtain); 0 until it is first drawn. */
let liftBy = 0;
const downListeners = new Set<() => void>();
export function setCurtainDown() {
  if (down) return;
  down = true;
  downListeners.forEach((fn) => fn());
}
/** The splash, handing over into the start page without a fade of its own: the curtain takes its place. */
export function raiseCurtain() {
  if (OPENS_ON_FEED || !down) return;
  down = false;
  // A fresh time limit for this showing: a second sign-in in the same visit
  // gets its own, rather than one that ran out long ago.
  liftBy = 0;
  downListeners.forEach((fn) => fn());
}
const subscribeDown = (fn: () => void) => { downListeners.add(fn); return () => { downListeners.delete(fn); }; };
export function useCurtainDown() {
  return useSyncExternalStore(subscribeDown, () => down, () => down);
}
/** The moment the curtain lifts anyway, counted from the first time it is drawn after going up. */
export function curtainLiftBy(maxMs: number): number {
  if (!liftBy) liftBy = Date.now() + maxMs;
  return liftBy;
}
