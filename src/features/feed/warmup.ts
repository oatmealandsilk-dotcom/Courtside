import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

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

/**
 * The map on the start page, still painting. Community opens on Find Players,
 * whose map card is a web view (on the phone) or a lazily fetched engine (in
 * a browser) that draws its streets a beat after the page itself. Lifting the
 * curtain the moment the page drew showed an empty card, then the map popping
 * in: a second cut right after the fade (Oct 2, William: "it's like a frame
 * change"). So each still map on the page holds the curtain until it has
 * drawn (useStartMapHold), and never for longer than MAP_WAIT_MS.
 */
let mapHolds = 0;
/** The map's grace is up: the curtain lifts whether or not it has drawn. */
let mapWaitOver = false;
/** The longest the curtain waits on the map, once the page under it has drawn (1.5 s until Oct 6: opening felt slow). */
export const MAP_WAIT_MS = 1000;
export function setMapWaitOver() {
  if (mapWaitOver) return;
  mapWaitOver = true;
  tell();
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useFeedWarm() {
  return useSyncExternalStore(subscribe, () => warm, () => warm);
}
/** Whether the start page has drawn once (the map on it may still be coming). */
export function useStartDrawn() {
  return useSyncExternalStore(subscribe, () => startDrawn, () => startDrawn);
}
/** Whether no still map on the start page is still painting (its streets are in, or there is none): later work (court pictures) waits for this. */
export function useStartMapsIn() {
  return useSyncExternalStore(subscribe, () => mapHolds === 0, () => mapHolds === 0);
}
/** Whether the page under the curtain is ready for it to lift: the feed's first pages, or the start page drawn with its map in. */
const ready = () => (OPENS_ON_FEED ? warm : startDrawn && (mapHolds === 0 || mapWaitOver));
export function useCurtainReady() {
  return useSyncExternalStore(subscribe, ready, ready);
}
/** The curtain's own time limit is up: whatever it was waiting for counts as ready. */
export function curtainReadyAnyway() {
  if (OPENS_ON_FEED) setFeedWarm(true);
  else { setStartDrawn(true); setMapWaitOver(); }
}

/**
 * For a still map on the start page: holds the curtain while `active` (the
 * card is there and will draw a map), until the returned `painted` is called
 * once its streets are on screen. Going away lets go a frame later, so a
 * stand-in handing over to the real map (the browser's engine arriving) never
 * opens a gap the curtain could slip through.
 */
export function useStartMapHold(active: boolean): () => void {
  const held = useRef(false);
  const letGo = useRef(() => {
    if (!held.current) return;
    held.current = false;
    mapHolds = Math.max(0, mapHolds - 1);
    tell();
  });
  useEffect(() => {
    if (!active) return undefined;
    held.current = true;
    mapHolds += 1;
    tell();
    return () => {
      if (!held.current) return;
      held.current = false;
      requestAnimationFrame(() => { mapHolds = Math.max(0, mapHolds - 1); tell(); });
    };
  }, [active]);
  return letGo.current;
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
/** When the curtain last went down (0: it never went up this launch). */
let downAt = 0;
export function setCurtainDown() {
  if (down) return;
  down = true;
  downAt = Date.now();
  downListeners.forEach((fn) => fn());
}
/** The splash, handing over into the start page without a fade of its own: the curtain takes its place. */
export function raiseCurtain() {
  if (OPENS_ON_FEED || !down) return;
  down = false;
  // The map gets its own grace again too.
  if (mapWaitOver) { mapWaitOver = false; tell(); }
  // A fresh time limit for this showing: a second sign-in in the same visit
  // gets its own, rather than one that ran out long ago.
  liftBy = 0;
  downListeners.forEach((fn) => fn());
}
/**
 * Whether the curtain has come down at least once this launch: from then on
 * the first showing is over, and nothing built later (a section, a tab) holds
 * or staggers in, even under a curtain raised again (FirstReveal).
 */
export const curtainHasLifted = () => downAt > 0;
/** Whether the curtain is off the screen right now (useCurtainDown, read once outside of a draw). */
export const isCurtainDown = () => down;
const subscribeDown = (fn: () => void) => { downListeners.add(fn); return () => { downListeners.delete(fn); }; };
/**
 * Where the opening curtain is right now, for a map card deciding how to
 * reveal itself (NearbyMap): 'up' while it still covers everything (a change
 * under it is never seen, so it is made at once), 'lifting' while it fades
 * (a change then would show through it, so it waits), 'down' once it has gone.
 */
export function curtainState(): 'up' | 'lifting' | 'down' {
  if (down) return 'down';
  return ready() ? 'lifting' : 'up';
}
/** Told once, the next time the curtain is off the screen (at once if it already is). Returns a way to stop waiting. */
export function whenCurtainDown(fn: () => void): () => void {
  if (down) { fn(); return () => undefined; }
  const once = () => { downListeners.delete(once); fn(); };
  downListeners.add(once);
  return () => { downListeners.delete(once); };
}
export function useCurtainDown() {
  return useSyncExternalStore(subscribeDown, () => down, () => down);
}
/** The moment the curtain lifts anyway, counted from the first time it is drawn after going up. */
export function curtainLiftBy(maxMs: number): number {
  if (!liftBy) liftBy = Date.now() + maxMs;
  return liftBy;
}

/**
 * The page under the curtain settling into place as the curtain lifts: 1 is
 * held a touch large and low (while hidden), 0 is at rest. The curtain sets it
 * to 1 while it covers everything and eases it to 0 with its own fade, so the
 * page arrives with the same motion the logo leaves with (AppShell applies it,
 * on the phone). Always 0 when no curtain is up.
 */
export const launchSettle = makeMutable(0);

/**
 * The first moments after the app opens are the page's own (Oct 21): no
 * note ("How was the hit?", "Still playing?") or tip drops in for
 * OPEN_QUIET_MS after the curtain has gone, so the page arrives whole and
 * nothing pops in over it while it is first being looked at.
 */
export const OPEN_QUIET_MS = 1500;
/** Whether the curtain has gone and the quiet moment after it is over (straight away when no curtain went up). */
export function useOpenSettled(): boolean {
  const isDown = useCurtainDown();
  const left = () => (downAt ? OPEN_QUIET_MS - (Date.now() - downAt) : 0);
  const [settled, setSettled] = useState(() => isDown && left() <= 0);
  useEffect(() => {
    if (!isDown) { setSettled(false); return undefined; }
    const wait = left();
    if (wait <= 0) { setSettled(true); return undefined; }
    setSettled(false);
    const t = setTimeout(() => setSettled(true), wait);
    return () => clearTimeout(t);
  }, [isDown]);
  return settled;
}
