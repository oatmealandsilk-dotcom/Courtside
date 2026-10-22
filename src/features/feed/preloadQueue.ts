import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { connectionIsQuick } from '@/lib/netSpeed';

/**
 * Which feed clips off screen may fetch right now (Oct 22, owner: "pre loaded,
 * like instagrams. So I can scroll a couple fast without hitting a loading page").
 *
 * The feed builds a player for the clip on screen, one behind and three ahead
 * (and the first clip of each feed tab warmed in the background). Left alone,
 * every one of them would download at once and the clip you are watching would
 * share the connection with four others. So:
 *  - the clip on screen always loads, and while it is still fetching its
 *    opening no new preload starts: it gets the connection (one started
 *    before carries on);
 *  - otherwise at most two preloads fetch at a time, nearest first (`rank`: 1 = next);
 *    on a slow connection (the last clips took over two seconds, lib/netSpeed)
 *    one: there two at once only made the one you land on later;
 *  - nothing new starts while the app is in the background;
 *  - a preload that has its opening in (`ready`) frees its turn for the next;
 *    one that never says so (a browser told to fetch only the metadata, a
 *    stalled fetch) frees it anyway after TURN_MS, so it never blocks the queue.
 * A clip that got a turn keeps its player until its page leaves the window,
 * so a half-fetched clip is never thrown away and started again.
 *
 * The same rules on a phone (ClipPlayback: whether the player is built) and in
 * a browser (ClipPlayback.web: the video's `preload`), so both stay in step.
 */

/** How many clips off screen may fetch at the same moment. */
const AT_ONCE = 2;
/**
 * The clip on screen holds the line this long at most: a slow or stuck one never holds the rest back for good.
 * On a slow connection longer: there a browser's clip on screen holds it until it can play through (not just
 * its first frame), so a preload never takes the bandwidth it needs and it stalls mid-play.
 */
const SCREEN_FIRST_MS = 4000;
const SCREEN_FIRST_SLOW_MS = 10000;
/** And once its first frame is in, this long more, so it starts playing before anything else asks. */
const SCREEN_START_MS = 300;
let screenInAt = 0;
/**
 * A preload that has gone this long without fetching anything more hands its turn on (it keeps its player).
 * A phone's player says when its buffer grows (`moving`), so there this is a stall, not a clock: a heavy clip
 * on a slow link that is still coming in keeps its turn, and the next does not start alongside it.
 */
const TURN_MS = 4000;
/** However much a turn is still fetching, it hands on after this: a far, heavy clip never holds up a nearer one for long (it keeps its player). */
const TURN_MAX_MS = 12000;

type Entry = { rank: number; ready: boolean; since: number };
const waiting = new Map<number, Entry>();
/** Holding a turn and still fetching: these count against AT_ONCE. */
const fetching = new Set<number>();
/** When each clip in `fetching` got its turn. */
const turnAt = new Map<number, number>();
/** When each clip in `fetching` last said more of it had come in. */
const movedAt = new Map<number, number>();
const lastHeard = (id: number, now: number) => Math.max(turnAt.get(id) ?? now, movedAt.get(id) ?? 0);
let turnTimer: ReturnType<typeof setTimeout> | null = null;
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
  const now = Date.now();
  for (const id of [...fetching]) {
    const e = waiting.get(id);
    if (!e || e.ready || now - lastHeard(id, now) >= TURN_MS || now - (turnAt.get(id) ?? now) >= TURN_MAX_MS) { fetching.delete(id); turnAt.delete(id); movedAt.delete(id); }
  }
  const quick = connectionIsQuick();
  const screenCap = quick ? SCREEN_FIRST_MS : SCREEN_FIRST_SLOW_MS;
  const starting = now - screenInAt < SCREEN_START_MS;
  const screenBusy = starting || [...onScreen.values()].some((at) => now - at < screenCap);
  if (screenTimer) { clearTimeout(screenTimer); screenTimer = null; }
  if (screenBusy) {
    // Look again once the on-screen clip's head start is over, in case it never reports in.
    const waits = [...onScreen.values()].map((at) => screenCap - (now - at));
    if (starting) waits.push(SCREEN_START_MS - (now - screenInAt));
    const left = Math.min(...waits.filter((ms) => ms > 0));
    screenTimer = setTimeout(settle, left + 10);
  }
  const before = given.size;
  if (!away) {
    const room = screenBusy ? 0 : quick ? AT_ONCE : 1;
    const queue = [...waiting].filter(([id, e]) => !e.ready && !given.has(id)).sort((a, b) => a[1].rank - b[1].rank || a[1].since - b[1].since);
    for (const [id] of queue) {
      if (fetching.size >= room) break;
      fetching.add(id);
      turnAt.set(id, now);
      given.add(id);
    }
  }
  // Look again when the oldest turn runs out, in case that clip never reports ready.
  if (turnTimer) { clearTimeout(turnTimer); turnTimer = null; }
  if (fetching.size) {
    const left = Math.min(...[...fetching].map((id) => Math.min(TURN_MS - (now - lastHeard(id, now)), TURN_MAX_MS - (now - (turnAt.get(id) ?? now)))));
    turnTimer = setTimeout(settle, Math.max(0, left) + 10);
  }
  // Only a new turn changes what any clip may do (a turn handed back changes nothing on screen).
  if (given.size !== before) for (const fn of [...listeners]) fn();
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
 * - `playing`: it is the clip on screen (always loads, and counts as having had its turn); rank 0 counts the same.
 * - `ready`: its opening is in (first frame / first seconds); for the clip on screen in a
 *   browser, that it can play through (until then it holds back new preloads).
 * - `moving`, if given, is filled with a call the clip makes whenever more of it has come
 *   in: its turn then lasts while it is still fetching, not a fixed TURN_MS.
 * Returns whether its player may exist and fetch.
 */
export function usePreloadTurn(want: boolean, rank: number, playing: boolean, ready: boolean, moving?: { current: (() => void) | null }): boolean {
  // The clip on screen, or the page on screen of the feed on show (rank 0) whose clip
  // is about to start (the feed warming up, the splash lifting): first in line.
  const active = playing || (want && rank <= 0);
  const id = useRef(0);
  if (!id.current) id.current = nextId++;
  if (moving) moving.current = () => { if (fetching.has(id.current)) movedAt.set(id.current, Date.now()); };
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
    if (active && !ready) { if (!onScreen.has(me)) onScreen.set(me, Date.now()); } else if (onScreen.delete(me) && active) screenInAt = Date.now();
    schedule();
  }, [want, rank, active, ready]);
  useEffect(() => () => {
    const me = id.current;
    waiting.delete(me); given.delete(me); fetching.delete(me); turnAt.delete(me); movedAt.delete(me); onScreen.delete(me);
    schedule();
  }, []);
  return active || given.has(id.current);
}
