import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Dimensions, Platform, type View } from 'react-native';

import { goToStart } from '@/features/navigation/startTab';
import { TOUR_STEPS, type TourStep, type TourTargetId } from './steps';

/**
 * The tour's shared state, the way warmup.ts and pendingTab.ts share theirs:
 * a few plain values and a list of who to tell when they change. The bar,
 * Settings, Help, the swipe hint and the overlay all reach the tour through
 * here, with nothing passed down through the screens.
 */
type StepKey = TourStep['key'];

export interface TourRun {
  open: boolean;
  /** The tips this run shows, in order. A tip whose target is not on screen is left out. */
  keys: StepKey[];
  step: number;
  total: number;
  /** Asked for (Settings, Help, ?tour=N) rather than started on its own. */
  forced: boolean;
  /** Counts up on every open, so a fresh run is never mistaken for the last one. */
  run: number;
  /**
   * How it closed: finished (Got it), skipped, or ended by something else (a
   * page opened over the tabs, signed out). The first two take the pages
   * back to the map; the last leaves the player where they went.
   */
  ended?: 'done' | 'skipped' | 'quiet';
}

let state: TourRun = { open: false, keys: [], step: 0, total: 0, forced: false, run: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useTour(): TourRun {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
/** For code that only needs to ask, not redraw (the shell's keyboard handler). */
export function isTourOpen(): boolean {
  return state.open;
}
export function useTourOpen(): boolean {
  return useSyncExternalStore(subscribe, () => state.open, () => state.open);
}

/**
 * Set while the tour is on its way (the short wait before the dim arrives,
 * on whichever tab the player is), so the feed's own swipe hint keeps out of
 * its way.
 */
let pending = false;
export function setTourPending(on: boolean): void {
  if (pending === on) return;
  pending = on;
  emit();
}
/** The tour is up, or about to be: the swipe hint keeps out of its way. */
export function useTourBusy(): boolean {
  return useSyncExternalStore(subscribe, () => state.open || pending, () => state.open || pending);
}

export function openTour(keys: StepKey[], startAt: number, forced: boolean): void {
  if (!keys.length) return;
  state = { open: true, keys, step: Math.max(0, Math.min(keys.length - 1, startAt)), total: keys.length, forced, run: state.run + 1, ended: undefined };
  // A request is used up only once the tour is really on screen.
  request = null;
  emit();
}

/** On to the next tip; past the last one, the tour is done. */
export function nextStep(): void {
  if (!state.open) return;
  if (state.step + 1 >= state.total) { close('done'); return; }
  state = { ...state, step: state.step + 1 };
  emit();
}

/**
 * Skip, Back on Android, Escape on a keyboard: over at once, no "are you
 * sure?". The pages glide back to the map the app opens on, the same as
 * at the end, so a skip never leaves the player somewhere the tutorial took them.
 */
export function skipTour(): void {
  close('skipped');
}

/** Ended by something else (a page opened over the tabs, signed out): no fuss, and the pages stay put. */
export function endTourQuietly(): void {
  close('quiet');
}

function close(how: NonNullable<TourRun['ended']>) {
  if (!state.open) return;
  // The tips stay as they were, so the overlay can fade out on the one that was showing.
  state = { ...state, open: false, ended: how };
  emit();
}

/** A start someone asked for: the replay rows, ?tour=N, ?tour=new. */
export interface TourRequest {
  /** Skip the "new account" and "already seen" checks, and write nothing. */
  force: boolean;
  /** Which tip to open on, counted from 0 (see TOUR_STEPS). */
  startAt: number;
  /** ?tour=new: the real automatic start, pretending only that the account is new. */
  pretendNew?: boolean;
  /** The replay rows: a tour watched this way counts as seen, so it never comes round again on its own. */
  markSeen?: boolean;
}

/**
 * The demo switch, in a browser only, read once as the page loads, the way
 * ?as= is: ?tour=1 to ?tour=6 (one per tip, as many as TOUR_STEPS holds)
 * open the tour at that tip whoever is signed in, and ?tour=new runs the
 * real first-run check as if the account were new. It does nothing the
 * Settings row doesn't, so it is harmless anywhere.
 */
let request: TourRequest | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('tour');
    if (!asked) return null;
    if (asked === 'new') return { force: false, startAt: 0, pretendNew: true };
    const n = Number(asked);
    if (Number.isInteger(n) && n >= 1 && n <= TOUR_STEPS.length) return { force: true, startAt: n - 1 };
    return null;
  } catch { return null; }
})();

export function peekTourRequest(): TourRequest | null {
  return request;
}
export function useTourRequest(): TourRequest | null {
  return useSyncExternalStore(subscribe, () => request, () => request);
}

/**
 * "Show the tutorial" in Settings and Help: back down to the start page
 * (Community, on Find Players), where the tour starts once the page has
 * settled. The pages on top close and the tabs move across in one step
 * (goToStart). Never by '/', which is also the splash screen's address and
 * opened a second copy of the app with no bar.
 */
export function replayTour(): void {
  request = { force: true, startAt: 0, markSeen: true };
  emit();
  try { goToStart(); } catch { /* The router is not up yet: the tour starts when the start page is. */ }
}

/* ---- Targets: the bar's buttons, and a few things on the pages, put themselves on this list; the overlay measures them. ---- */

export interface TourRect { x: number; y: number; width: number; height: number }

/**
 * Every copy of each target that is mounted, oldest first. Usually there is
 * one; in a browser a page sliding in is a second copy of that page for a
 * moment (the picture beside the one you are leaving), so a page's target
 * can briefly have two. Each copy takes only itself off the list.
 */
const targets = new Map<TourTargetId, View[]>();
/** The last good measurement of each target, so a new tip can glide straight there while it is checked again. */
const lastRects = new Map<TourTargetId, TourRect>();

/** Put on the thing the tour should point at: `ref={useTourTarget('create')}`. */
export function useTourTarget(id: TourTargetId): (node: View | null) => void {
  const mine = useRef<View | null>(null);
  return useCallback((node: View | null) => {
    const list = targets.get(id) ?? [];
    if (mine.current) {
      const at = list.indexOf(mine.current);
      if (at >= 0) list.splice(at, 1);
    }
    mine.current = node;
    if (node) list.push(node);
    if (list.length) targets.set(id, list);
    else targets.delete(id);
  }, [id]);
}

/** Where one copy of a target sits, or null when it has no size, sits off the screen or takes too long to answer. */
function measureNode(node: View): Promise<TourRect | null> {
  if (typeof node.measureInWindow !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (rect: TourRect | null) => { if (done) return; done = true; resolve(rect); };
    const timer = setTimeout(() => finish(null), 300);
    try {
      node.measureInWindow((x, y, width, height) => {
        clearTimeout(timer);
        const { width: W, height: H } = Dimensions.get('window');
        const usable = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < W && y < H;
        finish(usable ? { x, y, width, height } : null);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Where a target sits on the screen, or null when no copy of it is on the
 * screen (a tab laid out to the side, a page not open). The newest copy
 * that is on screen wins. measureInWindow is the same call on a phone and
 * in a browser.
 */
export async function measureTourTarget(id: TourTargetId): Promise<TourRect | null> {
  const list = [...(targets.get(id) ?? [])];
  if (!list.length) return null;
  const found = await Promise.all(list.map(measureNode));
  for (let i = found.length - 1; i >= 0; i -= 1) {
    const rect = found[i];
    if (rect) { lastRects.set(id, rect); return rect; }
  }
  return null;
}

export function lastTourRect(id: TourTargetId): TourRect | null {
  return lastRects.get(id) ?? null;
}
