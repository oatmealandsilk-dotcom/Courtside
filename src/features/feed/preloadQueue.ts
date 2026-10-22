import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Which feed clips off screen may fetch right now (Oct 22, owner: "pre loaded,
 * like instagrams. So I can scroll a couple fast without hitting a loading page").
 *
 * The feed builds a player for the clip on screen, one behind and three ahead
 * (and the first clip of each feed tab warmed in the background). Left alone,
 * every one of them would download at once and the clip you are watching would
 * share the connection with four others. So:
 *  - the clip on screen always loads, and while it is still fetching its
 *    opening no new preload starts (it gets the whole connection);
 *  - at most two preloads fetch at a time, nearest first (`rank`: 1 = next);
 *  - nothing new starts while the app is in the background;
 *  - a preload that has its opening in (`ready`) frees its turn for the next.
 * A clip that got a turn keeps its player until its page leaves the window,
 * so a half-fetched clip is never thrown away and started again.
 *
 * The same rules on a phone (ClipPlayback: whether the player is built) and in
 * a browser (ClipPlayback.web: the video's `preload`), so both stay in step.
 */

/** How many clips off screen may fetch at the same moment. */
const AT_ONCE = 2;
/** The clip on screen holds the line this long at most: a slow or stuck one never blocks the rest for good. */
const SCREEN_FIRST_MS = 4000;

type Entry = { rank: number; ready: boolean; since: number };
const waiting = new Map<number, Entry>();
/** Holding a turn and still fetching: these count against AT_ONCE. */
const fetching = new Set<number>();
/** Ever given a turn (or played on screen): keeps its player while it stays in the window. */
const given = new Set<number>();
/** Clips on screen still fetching their opening, with when they started. */
const onScreen = new Map<number, number>();
const listeners = new Set<() => void>();
let nextId = 1;
let away = AppState.currentState === 'background';
let screenTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

/** Settled once after every page of a feed build has said where it stands, so the nearest gets the first turn. */
function schedule() {
  if (pending) return;
  pending = true;
  void Promise.resolve().then(() => { pending = false; settle(); });
}

function settle() {
  for (const id of [...fetching]) {
    const e = waiting.get(id);
    if (!e || e.ready) fetching.delete(id);
  }
  const now = Date.now();
  const screenBusy = [...onScreen.values()].some((at) => now - at < SCREEN_FIRST_MS);
  if (screenTimer) { clearTimeout(screenTimer); screenTimer = null; }
  if (screenBusy) {
    // Look again once the on-screen clip's head start is over, in case it never reports in.
    const oldest = Math.min(...onScreen.values());
    screenTimer = setTimeout(settle, Math.max(50, SCREEN_FIRST_MS - (now - oldest) + 10));
  }
  if (!away && !screenBusy) {
    const queue = [...waiting].filter(([id, e]) => !e.ready && !given.has(id)).sort((a, b) => a[1].rank - b[1].rank || a[1].since - b[1].since);
    for (const [id] of queue) {
      if (fetching.size >= AT_ONCE) break;
      fetching.add(id);
      given.add(id);
    }
  }
  for (const fn of [...listeners]) fn();
}

AppState.addEventListener('change', (state) => {
  const was = away;
  away = state === 'background';
  if (was !== away) schedule();
});

/**
 * One clip's place in the queue.
 * - `want`: its page is in the preload window and it is not the clip on screen.
 * - `rank`: how soon you may reach it (1 = the next page); lower goes first.
 * - `active`: it is the clip on screen (always loads, and counts as having had its turn).
 * - `ready`: its opening is in (first frame / first seconds).
 * Returns whether its player may exist and fetch.
 */
export function usePreloadTurn(want: boolean, rank: number, active: boolean, ready: boolean): boolean {
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  useEffect(() => {
    const me = id.current;
    if (active) given.add(me);
    if (want && !active) {
      const had = waiting.get(me);
      waiting.set(me, { rank, ready, since: had?.since ?? Date.now() });
    } else {
      waiting.delete(me);
    }
    // Out of the window altogether: its next visit queues afresh.
    if (!want && !active) given.delete(me);
    if (active && !ready) { if (!onScreen.has(me)) onScreen.set(me, Date.now()); } else onScreen.delete(me);
    schedule();
  }, [want, rank, active, ready]);
  useEffect(() => () => {
    const me = id.current;
    waiting.delete(me); given.delete(me); fetching.delete(me); onScreen.delete(me);
    schedule();
  }, []);
  return active || given.has(id.current);
}
