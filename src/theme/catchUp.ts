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
  /** The tab's address: '/discuss', '/', '/coaches' or '/profile'; '*' for a browser's frame round the tabs. */
  pane: string;
  /** The court it shows now (kept up to date as it lands). */
  look: ThemeName;
  set: (name: ThemeName) => void;
  /** On a phone, whether the tab row has this tab on screen; undefined where there is no row (a browser). */
  active: () => boolean | undefined;
}

/** Lets the change land before anything is let go. */
const SETTLE_MS = 40;
/** Whatever happens, everything is let go this long after the last pick. */
const SAFETY_MS = 2000;
const RETRY_MS = 32;
/** A page sliding in or out (Back, the bar): no tab is redrawn under the slide, which runs this long. */
const NAV_QUIET_MS = 450;
/** The strip, left to right, as TabsPager has it: a tab's neighbours come next after it. */
const TAB_ORDER = ['/discuss', '/', '/coaches', '/profile'];

const gates = new Set<GateEntry>();
let live: ThemeName = 'default';
let fading = 0;
let lastTap = -Infinity;
let lastNav = -Infinity;
/** The gate whose catch-up has been asked for and has not landed yet. */
let inFlight: GateEntry | null = null;
/** How many gates this round has let go (the first goes as an ordinary update). */
let released = 0;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let unwatch: (() => void) | null = null;

/** The navigation, handed in by goBack.ts (which owns it), so this file never imports the router. */
interface Nav { currentTab: () => string | null; tabsOnShow: () => boolean; pageOnShow: (name: string) => boolean; onPageChange: (cb: () => void) => () => void }
let nav: Nav | null = null;
export function setCatchUpNav(next: Nav) { nav = next; }

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const frame = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => fn()) : setTimeout(fn, 16));

let ownBack = -Infinity;
/** The app's own Back has let go of what it uncovers (goBack): the browser's Back event that follows need not. */
export function noteOwnBack() { ownBack = now(); }

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
  callOff();
  schedule(FADE_MS + SETTLE_MS);
  if (safetyTimer) clearTimeout(safetyTimer);
  // The safety net: the tab on show at once, the rest as background work (a tap or a scroll goes first).
  safetyTimer = setTimeout(() => {
    safetyTimer = null;
    catchUpNow('active');
    startTransition(() => catchUpNow('all'));
  }, SAFETY_MS);
  watch(true);
}

/** A tab's catch-up under way is called off (it is picked again later): see tapped. */
function callOff() {
  const was = inFlight;
  inFlight = null;
  if (was && was.look !== live) was.set(was.look);
}

function schedule(ms: number) {
  if (stepTimer) clearTimeout(stepTimer);
  stepTimer = setTimeout(step, ms);
}

function held(): boolean {
  for (const g of gates) if (g.look !== live) return true;
  return false;
}

/** The tab on show, or the tabs' own frame ('*': always let go with the tab on show). */
function isActive(g: GateEntry, current: string | null): boolean {
  if (g.pane === '*') return true;
  const active = g.active();
  return active !== undefined ? active : g.pane === current;
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
    if (g.pane === '*') rank = 0.5; // the tabs' frame: small, straight after the tab on show
    else if (isActive(g, current)) rank = 0;
    else if (at < 0) rank = 100; // a copy drawn for a swipe's preview
    else if (anchor < 0) rank = 10 + at;
    else rank = Math.abs(at - anchor);
    // Community, the most to redraw, goes last of the tabs out of sight (after a tie too).
    if (g.pane === '/discuss' && rank >= 1) rank += 10;
    if (rank < bestRank) { best = g; bestRank = rank; }
  }
  return best;
}

function step() {
  stepTimer = null;
  if (fading > 0) { schedule(RETRY_MS); return; }
  if (inFlight) return; // it moves on once that one lands
  const next = pick();
  if (!next) { finish(); return; }
  // On a phone the tab on show is never kept waiting for a slide: a page sliding in or out there is
  // the phone's own animation, which a redraw cannot hold up, and an iPhone's edge swipe back reports
  // only once it is over, so waiting could let it go under a finger already uncovering it.
  const nativeActive = Platform.OS !== 'web' && isActive(next, nav?.currentTab() ?? null);
  const wait = Math.max(lastTap + FADE_MS + SETTLE_MS, nativeActive ? -Infinity : lastNav + NAV_QUIET_MS) - now();
  if (wait > 0) { schedule(wait); return; }
  inFlight = next;
  const first = released === 0;
  released++;
  if (first) next.set(live);
  else if (next.pane === '/discuss') {
    // Community (the map, the most to redraw) on a quiet moment of its own, so its redraw never
    // lands back to back with a frame that is already busy.
    whenIdle(() => { if (inFlight === next && next.look !== live) startTransition(() => next.set(live)); });
  } else startTransition(() => next.set(live));
}

/**
 * Runs `fn` once the app has a quiet moment (at most a few frames on). The
 * limit is kept here, not left to the platform: a phone's requestIdleCallback
 * ignores its timeout (RN 0.86), so a busy feed could otherwise hold it to the
 * safety net.
 */
function whenIdle(fn: () => void) {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown }).requestIdleCallback;
  if (typeof idle === 'function') idle.call(globalThis, run, { timeout: 120 });
  setTimeout(run, typeof idle === 'function' ? 120 : 0);
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

/**
 * A change the app made by itself (the phone turning dark or light, with Match phone on),
 * away from the Theme page, in the same go as the change: the tab on show turns with the rest of
 * the screen, in one redraw, under the picture of the old look that then fades off it (screenFade),
 * rather than a moment after it. The other tabs carry on catching up out of sight, as background
 * work, once that fade is over. Behind a page (the tabs not on show), nothing is let go here: they
 * catch up out of sight as after a pick.
 */
export function catchUpShown() {
  if (nav && !nav.tabsOnShow()) return;
  released = Math.max(released, 1);
  catchUpNow('active');
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
    // As goBack: the tab Back uncovers is on the picked court as it shows, from the Theme page too
    // (Profile is under it since Oct 24). A tab already caught up costs nothing.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      catchUpNow('active');
      return false;
    });
    stops.push(() => sub.remove());
  }
  // The tab on show is let go as the tabs come back; the others carry on catching up out of sight.
  if (nav) {
    stops.push(nav.onPageChange(() => {
      lastNav = now();
      // Nothing out of sight lands under the slide: a catch-up under way waits until it has run.
      callOff();
      if (nav?.tabsOnShow()) catchUpNow('active');
      // step() works out the wait: the quiet for a slide (not for the tab on show, on a phone).
      schedule(0);
    }));
  }
  unwatch = () => stops.forEach((s) => s());
}

let installed = false;
/** The listeners that never stop (ThemeProvider, once). Returns the way to remove them. */
export function installCatchUp(): () => void {
  if (installed) return () => undefined;
  installed = true;
  const stops: (() => void)[] = [];
  // The app leaving the screen: whatever is fading ends and every tab is let go, so it comes back done.
  // Only 'background': an iPhone's 'inactive' (Control Centre, Notification Centre, the start of the
  // swipe home) leaves the app on screen, where letting everything go at once was the stall itself.
  const app = AppState.addEventListener('change', (state) => {
    if (state !== 'background') return;
    enders.forEach((end) => end());
    catchUpNow('all');
  });
  stops.push(() => app.remove());
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // The browser's own Back: the tab it uncovers (Profile, under the Theme page). The app's Back
    // (goBack) has let go of that already and goes through here too: skipped.
    const back = () => {
      if (now() - ownBack < 1000) return;
      catchUpNow('active');
    };
    window.addEventListener('popstate', back);
    stops.push(() => window.removeEventListener('popstate', back));
    // For the timing harness and the auto-tester: where the change has got to.
    (globalThis as { __courtsideTheme?: unknown }).__courtsideTheme = {
      live: () => live,
      gates: () => [...gates].map((g) => ({ pane: g.pane, look: g.look, active: g.active() })),
      fading: () => fading,
      settled: catchUpSettled,
    };
  }
  return () => { installed = false; stops.forEach((s) => s()); };
}
