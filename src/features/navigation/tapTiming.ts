import type { GestureResponderEvent } from 'react-native';

import { SIM_DRIVER, simLog } from '@/lib/simDriver';
import { tapFastOn } from '@/features/navigation/pressV2';

/*
 * How long a tap takes to show (Nov 2, owner: "There's also a delay on clicking buttons for them to
 * respond. Clicking should respond much faster"): the simulator's proof only (simDriver: a demo build
 * bundled with EXPO_PUBLIC_SIM_DRIVER=1; nothing at all in a store build, an over-the-air update or the
 * website). Every finger that touches the app files one line in sim-log.txt, a second after it lifts:
 *
 *   [tap-timing] fast=1 held 84 lag 3/2 | look -4 | go push /user/u2 1 | state 38 | page /user/u2 37 | drawn 52 | js 41f max 36@20 first 5
 *
 * Every number after the first `|` is milliseconds from the finger lifting (a minus number came while the
 * finger was still down):
 *   fast     whether "taps answer sooner" (pressV2's TAP_FAST) was on for that tap: the before/after switch;
 *   held     how long the finger was down; lag N/M: how late the app's code heard the finger land / lift
 *            (from the phone's own touch time; left out when the two clocks cannot be compared);
 *   look     the press look asked for (swipePress: a card or button dipping or dimming);
 *   press    a button's action ran (Tappable);
 *   go       the router was asked to open or close a page (push, navigate, back, ...) and where;
 *   state    the app's navigation changed (its redraw for the new page done);
 *   page     a page or sheet put on screen (its first draw committed: the native slide starts from here);
 *   drawn    the app's next frame after that page;
 *   glide    a tab tap's glide set going on the animation thread; first: that thread's first frame of it;
 *   heart / follow   a like's heart or a Follow button changed on screen (its redraw committed);
 *   js       the app's own thread for 800 ms after the lift: frames counted, the longest gap and when it
 *            began (a long gap is the thread busy redrawing: nothing else it draws can move then), and the
 *            first frame after the lift.
 * A finger taken by a swipe or a scroll says `cancel` instead of `held`.
 *
 * Read with scripts/sim-zoom/log.sh after tapping in the Simulator; the Mac's "tapfast on=0" / "tapfast on=1"
 * (scripts/sim-zoom/cmd.sh) times the same build with it off and on.
 */
export const TAP_TIMING = SIM_DRIVER;

type Mark = { name: string; at: number; detail?: string };
interface Tap {
  downAt: number;
  upAt: number;
  downLag: number | null;
  upLag: number | null;
  cancelled: boolean;
  fast: boolean;
  marks: Mark[];
  frames: { n: number; max: number; maxAt: number; first: number };
  filed: boolean;
}

let tap: Tap | null = null;
let fileTimer: ReturnType<typeof setTimeout> | null = null;
/** How long after the finger lifts the line is filed (and the app's frames watched). */
const WATCH_MS = 800;
const FILE_MS = 1000;

/** How late the app's code heard a touch: now, less the phone's own time for it (same clock on iOS), when that is sane. */
function lagOf(e?: GestureResponderEvent): number | null {
  const stamp = (e?.nativeEvent as { timestamp?: number } | undefined)?.timestamp;
  if (typeof stamp !== 'number' || typeof performance === 'undefined' || !performance.now) return null;
  const lag = performance.now() - stamp;
  return lag >= 0 && lag < 2000 ? Math.round(lag) : null;
}

/** One finger only: a second finger while one is down is not a tap of its own. */
const fingers = (e: GestureResponderEvent) => (e.nativeEvent as { touches?: ArrayLike<unknown> }).touches?.length ?? 1;

/** A finger landed anywhere in the app (AppShell's frame hears it first, before any button does). */
export function tapDown(e: GestureResponderEvent) {
  if (!TAP_TIMING) return;
  if (fingers(e) > 1) return;
  if (tap && !tap.filed) file();
  tap = {
    downAt: Date.now(), upAt: 0, downLag: lagOf(e), upLag: null, cancelled: false, fast: tapFastOn(),
    marks: [], frames: { n: 0, max: 0, maxAt: 0, first: -1 }, filed: false,
  };
}

/** The finger lifted (or a swipe or a scroll took it: `cancelled`). */
export function tapUp(e: GestureResponderEvent, cancelled = false) {
  if (!TAP_TIMING || !tap || tap.upAt) return;
  if (fingers(e) > 1) return;
  tap.upAt = Date.now();
  tap.upLag = lagOf(e);
  tap.cancelled = cancelled;
  watchFrames(tap);
  if (fileTimer) clearTimeout(fileTimer);
  const mine = tap;
  fileTimer = setTimeout(() => { if (tap === mine) file(); }, FILE_MS);
}

/** A moment of the current tap, the first time it comes (`at`: a time taken elsewhere, the animation thread's). */
export function tapMark(name: string, detail?: string, at = Date.now()) {
  if (!TAP_TIMING || !tap || tap.filed) return;
  if (tap.marks.some((m) => m.name === name)) return;
  tap.marks.push({ name, at, detail });
}

/** A page or sheet has committed its first draw: `page` now, and `drawn` with the app's next frame. */
export function tapPage(name: string) {
  if (!TAP_TIMING || !tap || tap.filed) return;
  if (tap.marks.some((m) => m.name === 'page')) return;
  tapMark('page', name);
  requestAnimationFrame(() => tapMark('drawn'));
}

/** The app's own frames for a moment after the lift: how many, the longest gap, and the first. */
function watchFrames(t: Tap) {
  let last = t.upAt;
  const step = () => {
    if (tap !== t || t.filed) return;
    const now = Date.now();
    const gap = now - last;
    if (t.frames.first < 0) t.frames.first = now - t.upAt;
    if (gap > t.frames.max) { t.frames.max = gap; t.frames.maxAt = last - t.upAt; }
    t.frames.n += 1;
    last = now;
    if (now - t.upAt < WATCH_MS) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function file() {
  const t = tap;
  if (!t || t.filed) return;
  t.filed = true;
  if (fileTimer) { clearTimeout(fileTimer); fileTimer = null; }
  const from = t.upAt || t.downAt;
  const head = t.upAt
    ? `${t.cancelled ? 'cancel' : 'held'} ${t.upAt - t.downAt}${t.downLag !== null || t.upLag !== null ? ` lag ${t.downLag ?? '-'}/${t.upLag ?? '-'}` : ''}`
    : 'still down';
  const marks = t.marks
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((m) => `${m.name}${m.detail ? ` ${m.detail}` : ''} ${m.at - from}`);
  const js = t.upAt ? `js ${t.frames.n}f max ${t.frames.max}@${t.frames.maxAt} first ${t.frames.first}` : '';
  simLog(`[tap-timing] fast=${t.fast ? 1 : 0} ${head} | ${[...marks, js].filter(Boolean).join(' | ')}`);
}

/** What a router call asked for, in a few words: "push /user/u2", "back". */
function describe(action: unknown): string {
  const a = action as { type?: string; payload?: { href?: unknown; options?: { event?: string } } };
  if (a?.type === 'ROUTER_LINK') {
    const href = a.payload?.href;
    const where = typeof href === 'string' ? href : JSON.stringify(href);
    return `${(a.payload?.options?.event ?? 'NAVIGATE').toLowerCase()} ${where}`;
  }
  return (a?.type ?? 'unknown').toLowerCase();
}

/**
 * The router's calls (push, navigate, back, ...) as `go` marks, and each change of the app's navigation as
 * `state`: from the app's frame (AppShell), once it has the navigation. Every router call goes through
 * expo-router's own queue, which is only listened to here, never changed.
 */
export function listenToRouter(navigation: { addListener?: (type: 'state', cb: () => void) => () => void }): () => void {
  if (!TAP_TIMING) return () => undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { routingQueue } = require('expo-router/build/global-state/routingQueue') as typeof import('expo-router/build/global-state/routingQueue');
  const offQueue = routingQueue.subscribe(() => {
    const last = routingQueue.queue[routingQueue.queue.length - 1];
    if (last) tapMark('go', describe(last));
  });
  const offState = navigation.addListener?.('state', () => tapMark('state')) ?? (() => undefined);
  return () => { offQueue(); offState(); };
}
