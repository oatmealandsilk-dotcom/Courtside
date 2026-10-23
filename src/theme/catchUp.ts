import { startTransition } from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import type { ThemeName } from './ThemeProvider';
import { FADE_MS } from './fadeTiming';

/*
 * The tabs catching up with a theme change, out of sight (Oct 23, owner:
 * "It should just be super smooth. No lag").
 *
 * The four tabs stay mounted under every page, and together they are most of
 * the app: recolouring them on the tap was the stall. So each tab sits behind
 * a ThemeGate (src/features/navigation/tabFocus.tsx) that keeps its court
 * until it is let go here: after the Theme page's own change has played (no
 * redraw ever lands during it), one tab per redraw, the one you came from
 * first and as an ordinary update, the others as background work
 * (startTransition) that a tap can interrupt. A tab is always let go before
 * it can be seen: going back or home, the bar, Android's Back, the browser's
 * Back, the app leaving the screen, any page change that shows the tabs, and
 * a safety net two seconds after the last pick.
 *
 * The gates know nothing about colours: this file only moves each one's
 * court to `live`, the court picked.
 */

/** One held-back tab, as its ThemeGate registers it. */
export interface GateEntry {
  /** The tab's address: '/discuss', '/', '/coaches' or '/profile'. */
  pane: string;
  /** The court it shows now (kept up to date as it lands). */
  look: ThemeName;
  set: (name: ThemeName) => void;
  /** On a phone, whether the tab row has this tab on screen; undefined where there is no row (a browser). */
  active: boolean | undefined;
}

/** Lets the change land before anything is let go. */
const SETTLE_MS = 40;
/** Whatever happens, everything is let go this long after the last pick. */
const SAFETY_MS = 2000;
const RETRY_MS = 32;
/** The strip, left to right, as TabsPager has it: a tab's neighbours come next after it. */
const TAB_ORDER = ['/discuss', '/', '/coaches', '/profile'];

const gates = new Set<GateEntry>();
let live: ThemeName = 'default';
let fading = 0;
let lastTap = -Infinity;
/** The gate whose catch-up has been asked for and has not landed yet. */
let inFlight: GateEntry | null = null;
/** How many gates this round has let go (the first goes as an ordinary update). */
let released = 0;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let unwatch: (() => void) | null = null;

/** The navigation, handed in by goBack.ts (which owns it), so this file never imports the router. */
interface Nav { currentTab: () => string | null; tabsOnShow: () => boolean; onPageChange: (cb: () => void) => () => void }
let nav: Nav | null = null;
export function setCatchUpNav(next: Nav) { nav = next; }

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const frame = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => fn()) : setTimeout(fn, 16));

/** The court the app starts on (ThemeProvider). */
export function noteLive(name: ThemeName) { live = name; }

export function registerGate(gate: GateEntry) {
  gates.add(gate);
}

export function unregisterGate(gate: GateEntry) {
  gates.delete(gate);
  if (inFlight === gate) { inFlight = null; schedule(0); }
}

/** A gate has drawn in `gate.look` (its layout effect). */
export function landed(gate: GateEntry) {
  if (gate.look === live) {
    if (inFlight === gate) {
      inFlight = null;
      // Each tab in a frame of its own.
      frame(() => schedule(0));
    }
    if (!held()) finish();
  } else if (!inFlight && !stepTimer) {
    // A tab built on an older court (as background work across a pick): it catches up like the rest.
    schedule(Math.max(0, lastTap + FADE_MS + SETTLE_MS - now()));
    watch();
  }
}

/**
 * A court has been picked (ThemeProvider's setTheme), in the same go as the
 * redraw of what is on screen.
 */
export function tapped(name: ThemeName) {
  live = name;
  lastTap = now();
  released = 0;
  // A tab's catch-up still under way (background work, for the court before
  // this one) is called off here, in this same go: an ordinary update back to
  // the court it shows wins over it, so a tab never lands on a court in
  // between and nothing of it lands during the change.
  const was = inFlight;
  inFlight = null;
  if (was && was.look !== live) was.set(was.look);
  schedule(FADE_MS + SETTLE_MS);
  if (safetyTimer) clearTimeout(safetyTimer);
  safetyTimer = setTimeout(() => { safetyTimer = null; catchUpNow('all'); }, SAFETY_MS);
  watch(true);
}

function schedule(ms: number) {
  if (stepTimer) clearTimeout(stepTimer);
  stepTimer = setTimeout(step, ms);
}

function held(): boolean {
  for (const g of gates) if (g.look !== live) return true;
  return false;
}

function isActive(g: GateEntry, current: string | null): boolean {
  return g.active !== undefined ? g.active : g.pane === current;
}

/** The next tab to let go: the one on screen, then its neighbours, then the rest. */
function pick(): GateEntry | null {
  const current = nav?.currentTab() ?? null;
  let anchor = -1;
  for (const g of gates) if (isActive(g, current) && TAB_ORDER.includes(g.pane)) { anchor = TAB_ORDER.indexOf(g.pane); break; }
  let best: GateEntry | null = null;
  let bestRank = Infinity;
  for (const g of gates) {
    if (g.look === live) continue;
    const at = TAB_ORDER.indexOf(g.pane);
    let rank: number;
    if (isActive(g, current)) rank = 0;
    else if (at < 0) rank = 100; // a copy drawn for a swipe's preview
    else if (anchor < 0) rank = 10 + at;
    else rank = Math.abs(at - anchor);
    if (rank < bestRank) { best = g; bestRank = rank; }
  }
  return best;
}

function step() {
  stepTimer = null;
  if (fading > 0) { schedule(RETRY_MS); return; }
  const wait = lastTap + FADE_MS + SETTLE_MS - now();
  if (wait > 0) { schedule(wait); return; }
  if (inFlight) return; // it moves on once that one lands
  const next = pick();
  if (!next) { finish(); return; }
  inFlight = next;
  const first = released === 0;
  released++;
  if (first) next.set(live);
  else startTransition(() => next.set(live));
}

/** Everything is on the court picked: the watchers stand down. */
function finish() {
  if (held()) return;
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
  unwatch?.();
  unwatch = null;
}

/**
 * Lets tabs go at once, as an ordinary update that joins whatever the caller
 * is doing (a page closing in the same go): 'all', the tab on screen
 * ('active'), or the tabs named (addresses, or 'active').
 */
export function catchUpNow(scope: 'all' | 'active' | readonly string[]) {
  const current = nav?.currentTab() ?? null;
  for (const g of gates) {
    if (g.look === live) continue;
    const match = scope === 'all'
      || (scope === 'active' ? isActive(g, current) : scope.some((p) => (p === 'active' ? isActive(g, current) : g.pane === p)));
    if (match) g.set(live);
  }
}

/** Whether nothing is fading and every tab is on the court picked. */
export function catchUpSettled(): boolean {
  return fading === 0 && !held();
}

const enders = new Set<() => void>();
/** A Theme page's fade, so the app leaving the screen can end it. Returns the way to stop. */
export function onEndFades(end: () => void): () => void {
  enders.add(end);
  return () => { enders.delete(end); };
}
export function fadeStarted() { fading++; }
export function fadeEnded() {
  fading = Math.max(0, fading - 1);
  // Two frames on, so the frame the last copy leaves in is a quiet one.
  if (fading === 0 && held()) frame(() => frame(() => schedule(0)));
}

/**
 * While a tab is held: Android's Back (added last, so it is asked first, and
 * it lets the router go on) and any change of page that shows the tabs.
 */
function watch(fresh = false) {
  if (unwatch && !fresh) return;
  unwatch?.();
  const stops: (() => void)[] = [];
  if (Platform.OS === 'android') {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { catchUpNow('active'); return false; });
    stops.push(() => sub.remove());
  }
  if (nav) stops.push(nav.onPageChange(() => { if (nav?.tabsOnShow()) catchUpNow('all'); }));
  unwatch = () => stops.forEach((s) => s());
}

let installed = false;
/** The listeners that never stop (ThemeProvider, once). Returns the way to remove them. */
export function installCatchUp(): () => void {
  if (installed) return () => undefined;
  installed = true;
  const stops: (() => void)[] = [];
  // The app leaving the screen: whatever is fading ends and every tab is let go, so it comes back done.
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') return;
    enders.forEach((end) => end());
    catchUpNow('all');
  });
  stops.push(() => app.remove());
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const back = () => catchUpNow('all');
    window.addEventListener('popstate', back);
    stops.push(() => window.removeEventListener('popstate', back));
    // For the timing harness and the auto-tester: where the change has got to.
    (globalThis as { __courtsideTheme?: unknown }).__courtsideTheme = {
      live: () => live,
      gates: () => [...gates].map((g) => ({ pane: g.pane, look: g.look, active: g.active })),
      fading: () => fading,
      settled: catchUpSettled,
    };
  }
  return () => { installed = false; stops.forEach((s) => s()); };
}
