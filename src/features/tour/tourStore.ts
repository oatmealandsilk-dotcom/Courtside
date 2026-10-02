import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Dimensions, Platform, type View } from 'react-native';

import { goHome } from '@/lib/goBack';
import type { TourStep, TourTargetId } from './steps';

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
 * Set while the tour is on its way (the short wait on Home before the dim
 * arrives), so the feed's own swipe hint doesn't flash up a second before the
 * tour teaches the same thing.
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
  state = { open: true, keys, step: Math.max(0, Math.min(keys.length - 1, startAt)), total: keys.length, forced, run: state.run + 1 };
  // A request is used up only once the tour is really on screen.
  request = null;
  emit();
}

/** On to the next tip; past the last one, the tour is done. */
export function nextStep(): void {
  if (!state.open) return;
  if (state.step + 1 >= state.total) { close(); return; }
  state = { ...state, step: state.step + 1 };
  emit();
}

/** Skip, Back on Android, Escape on a keyboard: over at once, no "are you sure?". */
export function skipTour(): void {
  close();
}

/** Ended by something else (the player left Home, signed out): no fuss. */
export function endTourQuietly(): void {
  close();
}

function close() {
  if (!state.open) return;
  // The tips stay as they were, so the overlay can fade out on the one that was showing.
  state = { ...state, open: false };
  emit();
}

/** A start someone asked for: the replay rows, ?tour=N, ?tour=new. */
export interface TourRequest {
  /** Skip the "new account" and "already seen" checks, and write nothing. */
  force: boolean;
  /** Which of the five tips to open on, counted from 0. */
  startAt: number;
  /** ?tour=new: the real automatic start, pretending only that the account is new. */
  pretendNew?: boolean;
  /** The replay rows: a tour watched this way counts as seen, so it never comes round again on its own. */
  markSeen?: boolean;
}

/**
 * The demo switch, in a browser only, read once as the page loads, the way
 * ?as= is: ?tour=1 to ?tour=5 open the tour at that tip whoever is signed in,
 * and ?tour=new runs the real first-run check as if the account were new.
 * It does nothing the Settings row doesn't, so it is harmless anywhere.
 */
let request: TourRequest | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('tour');
    if (!asked) return null;
    if (asked === 'new') return { force: false, startAt: 0, pretendNew: true };
    const n = Number(asked);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return { force: true, startAt: n - 1 };
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
 * "Show the tutorial" in Settings and Help: back down to Home, where the tour
 * starts once the page has settled. The pages on top close and the tabs move
 * across to Home in one step (goHome). Never by '/', which is also the splash
 * screen's address and opened a second copy of the app with no bar.
 */
export function replayTour(): void {
  request = { force: true, startAt: 0, markSeen: true };
  emit();
  try { goHome(); } catch { /* The router is not up yet: the tour starts when Home is. */ }
}

/* ---- Targets: the bar's buttons put themselves on this list; the overlay measures them. ---- */

export interface TourRect { x: number; y: number; width: number; height: number }

const targets = new Map<TourTargetId, View>();
/** The last good measurement of each target, so a new tip can glide straight there while it is checked again. */
const lastRects = new Map<TourTargetId, TourRect>();

/** Put on the thing the tour should point at: `ref={useTourTarget('create')}`. */
export function useTourTarget(id: TourTargetId): (node: View | null) => void {
  const mine = useRef<View | null>(null);
  return useCallback((node: View | null) => {
    if (node) {
      mine.current = node;
      targets.set(id, node);
      return;
    }
    // Only take our own entry off the list: a newer copy of the same button may have put itself there since.
    if (mine.current && targets.get(id) === mine.current) targets.delete(id);
    mine.current = null;
  }, [id]);
}

/**
 * Where a target sits on the screen, or null when it has no size, sits off
 * the screen (a tab laid out to the side) or takes too long to answer.
 * measureInWindow is the same call on a phone and in a browser.
 */
export function measureTourTarget(id: TourTargetId): Promise<TourRect | null> {
  const node = targets.get(id);
  if (!node || typeof node.measureInWindow !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (rect: TourRect | null) => { if (done) return; done = true; resolve(rect); };
    const timer = setTimeout(() => finish(null), 300);
    try {
      node.measureInWindow((x, y, width, height) => {
        clearTimeout(timer);
        const { width: W, height: H } = Dimensions.get('window');
        const usable = width > 0 && height > 0 && x + width > 0 && y + height > 0 && x < W && y < H;
        const rect = usable ? { x, y, width, height } : null;
        if (rect) lastRects.set(id, rect);
        finish(rect);
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

export function lastTourRect(id: TourTargetId): TourRect | null {
  return lastRects.get(id) ?? null;
}
