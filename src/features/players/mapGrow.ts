import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { Platform, type View } from 'react-native';
import { Easing, cancelAnimation, makeMutable, runOnJS, useAnimatedReaction, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';

import type { LatLng } from '@/features/players/positions';
import type { Court } from '@/features/players/courts';

/*
 * The check-in zoom, v2: the card grows into the full map (Oct 28, owner: "The check in zoom is not what
 * envisioning. It's not bad but right now it wipes to the side. And then zooms in. I want it to zoom in
 * directly from the community tab"; with his screen recording of the move he means: "The animation for
 * zooming into the map should be this motion. A lot better animation, faster and more gratifying but
 * this is the core movement").
 *
 * The move: the whole Community page pushes in toward the map card, every part of it growing alike
 * (a camera moving in, the rest of the page sliding off the screen's edges as it grows) until the card's
 * map fills the screen; the map comes to life there and its own camera carries on down onto you (the
 * swoop, swoop.ts), as one move. The map's buttons come in after, sliding (never fading: they are glass).
 *
 * How, without a second map floating over the app (Oct 22: that broke the iPhone): the full map is the
 * same page it always was (app/map.tsx), opened with no slide, at exactly the place the grown card shows,
 * so the hand-over cannot be seen.
 *
 * v3 (Oct 28, owner, of v2: "The zoom is better but the first bit is weird because the icon in the middle and up to hit
 * in the corner are still there. Like it should be one seamless transition"): nothing that sits on the card grows with
 * the push-in, only its map. The card's words and pins step aside (a quick fade, in the map's own drawing for the pins),
 * and the Up to hit pill, the weather and the credit slip out of the card's edge, keeping their own size (useGrowAway).
 *
 * v4 (Oct 28, owner, of v3: "The zoom is a lot better, but there is still a slight lag pause it can be seamless"): no
 * still moment anywhere. The push-in starts on the very frame you are found, on the live Community page itself (both the
 * phone and the website), with everything else overlapping it rather than waiting its turn: the pill plays a shorter
 * moment (the green and the tick in about 180 ms: UpToHit) as it slips out, and the words and pins fade in the first
 * part of the push. The tab bar slides away from that same frame (AppShell, useGrowUnderWay).
 *  - The website: the full map opens at once over the page, see-through, and shows itself once it has drawn (a browser
 *    keeps both pages drawn).
 *  - iPhone and Android: an opened page covers the one under it, so the full map opens with pictures of the page on top
 *    of it, at exactly the point the live push-in has reached, and carries the push-in on (the hand-over cannot be seen).
 *    The pictures are taken early, while you are being found, right after you said yes (and after the phone's own
 *    question, the first time): the page (taking it holds the phone for a moment, then, with nothing else moving but the
 *    pill's finding light) and the card's map alone, from the map's own drawing (no pins, and the phone is not held for
 *    it). Nothing is photographed once you are found. The full map opens over the live page once the pill and the rest
 *    have slipped out of the card (HANDOFF_MS), so the pictures need nothing that moves.
 * Then, once the card covers the screen and the full map has drawn, the map takes over (a short dissolve) while the
 * push-in is still moving, its camera diving on at that same speed (growHandOver): before, the push-in came all but to
 * rest first, and the camera then waited for its last streets to come in before it moved, two still moments.
 *
 * v5 (Oct 28, owner, of v4: "Check in zoom is good, the only thing is that. The courts lit up and stuff appear after the
 * zoom starts. When it should already appear on the cover screen. Everything should show on cover screen so transition is
 * super smooth"): the card itself shows what the full map shows (NearbyMap's `fullCard`, admins with the zoom): the
 * courts (lit ones with their faces, counts and light), open hits, friends up to hit and your own pin, laid out exactly as
 * the full map lays them out. They stay through the push-in: the page grows round them while each keeps its size on the
 * screen and stands on its spot (the pin engine's lens), gathering and splitting as the full map would at the zoom the
 * card is showing, so when the full map takes over its pins are the same pins in the same places (growCamera puts its
 * camera exactly where the pushed-in card is looking). Only your own pin steps out with the card's words: it lands on you
 * at the end of the dive. The card's words still fade as in v4.
 *  - The website: the card's pins follow the push-in frame by frame (useGrowLens), the full map's pins are made at once,
 *    hidden with it, and come in with it as one (no wave).
 *  - iPhone and Android: the card's map follows the push-in on its own clock (PUSH_JS, the same curve) inside its page. A
 *    phone covers the Community page when the full map opens, so its pictures carry the push-in on from there: the full
 *    map's own page now lies over them, see-through, its streets hidden and its pins showing, its camera following the
 *    push-in on that same clock (growFollow) and its pins clipped to the card, until its streets have drawn and come in.
 *    Its pins can only show once its page has started (a moment after it opens).
 *
 * Only the Community tab's card grows (it is the page that pushes in); the For you copy of the card,
 * Reduce Motion, a phone whose pictures of the map come out blank, and Only me keep the plain way in
 * (the page opening as it always has, the map on you). Admins first, with the rest of the zoom
 * (checkInZoom's CHECKIN_ZOOM_FOR_EVERYONE).
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** Which edge of the card a thing on it slips out of as the push-in starts (the nearer one). */
export type AwayEdge = 'top' | 'bottom';
/** The phone: the card's map alone (no words, pins or buttons on it), laid over the card in the picture of the page. */
export interface GrowBox { rect: Rect; shot: string; radius: number }

/** A grow under way: what the full map needs to open exactly where the grown card is. */
export interface GrowPlan {
  /** The page that pushes in (window coordinates), and the card in it. */
  page: Rect;
  card: Rect;
  /** The screen it grows to fill. */
  screen: { w: number; h: number };
  /** The phone's picture of the page (a file), or null: in a browser (the page itself is seen), or a page that moved. */
  shot: string | null;
  /** The phone: the card's map alone, over the card in the picture, so what sat on the card is not in what grows. */
  box?: GrowBox | null;
  /** Where the full map opens: the card's own centre, as close as the grown card shows it. */
  center: LatLng;
  zoom: number;
  /** How much the page grows. */
  scale: number;
  /** When the push-in started (Date.now()): the full map carries it on from there, never starting it again. */
  started: number;
  at: number;
  /** The courts the card was drawing (v5): the full map starts with them, so its pins at the hand-over are the card's. */
  courts?: Court[];
  /**
   * v7 (the iPhone, zoomV7): the zoom layer flies the whole move; the full map opens under it at the landing view (no
   * pictures, no veil) and takes over once it has drawn and the layer has landed.
   */
  v7?: boolean;
}

/**
 * The push-in: a quick launch, then a long ease. It does not come to rest as the card covers the screen (that let the
 * move all but stop just before the map took over, v4): it carries on past it (OVER, the card's map a little closer
 * still) and the map takes over from it while it is still moving, at the speed it has then (growSwoopEase).
 */
export const GROW_MS = 680;
const GROW_CURVE: [number, number, number, number] = [0.25, 0, 0.15, 1];
const GROW_EASE = Easing.bezier(...GROW_CURVE);
const OVER = 0.2;
/** Not drawn yet when the push-in is done: it keeps creeping in, slowly, so the screen never stands still. */
const CREEP = 0.08;
const CREEP_MS = 2600;
/** However long the map takes, it takes over by this long after the push-in began (its own loading look then shows). */
export const REVEAL_MAX_MS = 3000;
/** The dissolve from the grown card to the live map (the card's pictures keep moving under it: never a still layer). */
export const REVEAL_MS = 220;
/** The swoop after a grow: the push-in has done the first part of the way down, so it is shorter than from the city. */
export const GROW_SWOOP_MS = 1300;
/** The map's buttons slide in this long after the map has taken over, as the camera comes in to land. */
export const CHROME_AFTER_MS = 760;
export const CHROME_MS = 420;
/** A grow handed to the full map is taken by it within this long, or let go. */
const PLAN_KEEP_MS = 6000;
/** The Up to hit pill's moment when it slips out with a grow: the green sweeps in and the tick is drawn in this long (UpToHit). */
export const PILL_QUICK_MS = 180;
/**
 * As the push-in starts, what sits on the card slips out of its edge: slow for its first part (the pill's green is seen
 * coming in), gathering speed, all gone by the end.
 */
const SLIP_MS = 240;
const SLIP_EASE = Easing.bezier(0.4, 0, 1, 1);
/** How far (in the card's own size, before it grows): enough to clear the edge from the 12 points in where they sit. */
const SLIP_PX = 60;
/**
 * The phone: the full map opens over the live page this long into the push-in, once everything on the card has slipped
 * out of it, so the pictures it opens with (taken before you were found) need nothing that moves.
 */
export const HANDOFF_MS = SLIP_MS + 20;

/** 0 → 1 as the page pushes in (1: the card covers the screen; past it as it carries on). Shared by the live page and the phone's picture of it. */
export const growT = makeMutable(0);
/**
 * The card's words (its city's name and counts, PreviewOverlay): they step out of the way as the grow starts, so the
 * push-in is into the map, not into a giant "Los Angeles". Words only (never the glass button beside them).
 */
const labels = makeMutable(1);
export const LABELS_OUT_MS = 140;
/** The card's pins step aside with its words (and come back with them): the growing card's map listens (useGrowClear). */
const clearers = new Set<(clear: boolean) => void>();
export function labelsOut() {
  labels.value = withTiming(0, { duration: LABELS_OUT_MS, easing: Easing.out(Easing.quad) });
  clearers.forEach((l) => l(true));
}
/** The growing card's map: its pins fade out with the card's words (in the map's own drawing), and back when the grow is over. */
export function useGrowClear(on: boolean, clear: (clear: boolean) => void) {
  const latest = useRef(clear);
  latest.current = clear;
  useEffect(() => {
    if (!on) return undefined;
    const l = (c: boolean) => latest.current(c);
    clearers.add(l);
    return () => { clearers.delete(l); };
  }, [on]);
}
/**
 * The full map has taken over (v5, the website): its pins show in this very moment, on the card's, while its streets come
 * in over the card's; the card's pins go in the same moment (useGrowHanded), so no pin is ever seen twice.
 */
const handers = new Set<() => void>();
export function growHanded() { handers.forEach((h) => h()); }
export function useGrowHanded(on: boolean, fn: () => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!on) return undefined;
    const h = () => latest.current();
    handers.add(h);
    return () => { handers.delete(h); };
  }, [on]);
}
/** 0 → 1 as what sits on the card slips out of it (starts with the push-in). */
const slip = makeMutable(0);
export function useGrowLabels() {
  return useAnimatedStyle(() => ({ opacity: labels.value }));
}
/** The push-in's shape, in the page's own coordinates: its middle, the fixed point it grows round, and how far. */
const geo = makeMutable({ cx: 0, cy: 0, px: 0, py: 0, s: 1 });

/**
 * Where the page sits and how big at `t` (a worklet). A pure growth round one fixed point, the way a
 * camera moves in: that point stays put and everything else moves straight away from it, so the card's
 * middle travels to the screen's middle as it grows to fill it. The size grows by equal steps of
 * closeness (S^t), so the move in feels even, not faster at the end.
 */
function placeAt(t: number, g: { cx: number; cy: number; px: number; py: number; s: number }) {
  'worklet';
  const s = Math.pow(g.s, t);
  return [{ translateX: (g.px - g.cx) * (1 - s) }, { translateY: (g.py - g.cy) * (1 - s) }, { scale: s }];
}

/** A CSS cubic-bezier ease (the same curve Reanimated draws), with its slope, for the timings worked out here. */
function curve([x1, y1, x2, y2]: [number, number, number, number]) {
  const at = (t: number, a: number, b: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const rate = (t: number, a: number, b: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  const tFor = (x: number) => { let lo = 0; let hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(m, x1, x2) < x) lo = m; else hi = m; } return (lo + hi) / 2; };
  return {
    y: (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : at(tFor(x), y1, y2)),
    slope: (x: number) => { if (x <= 0 || x >= 1) return 0; const t = tFor(x); const dx = rate(t, x1, x2); return dx > 1e-6 ? rate(t, y1, y2) / dx : 0; },
  };
}
const GROW_C = curve(GROW_CURVE);
/** When the card covers the whole screen (the push-in at 1): the soonest the map may take over. */
export const COVER_MS = (() => { let lo = 0; let hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if ((1 + OVER) * GROW_C.y(m) < 1) lo = m; else hi = m; } return Math.ceil(hi * GROW_MS); })();
/** How fast the push-in is going `ms` after it started (its own units, per ms). */
function pushRate(ms: number): number {
  if (ms < GROW_MS) return ((1 + OVER) * GROW_C.slope(ms / GROW_MS)) / GROW_MS;
  const u = Math.min(1, (ms - GROW_MS) / CREEP_MS);
  return (CREEP * 2 * (1 - u)) / CREEP_MS;
}

/**
 * The map taking over from the grow, now: where its camera starts (as close as the pushed-in card shows it, which may be
 * past the plan) and the swoop's ease, whose start runs at exactly the speed the push-in has then, so the push-in and the
 * dive are one move, never a slow-down and a speed-up (v4). Then the same long soft landing as ever.
 */
export function growHandOver(p: GrowPlan, targetZoom: number): { zoom: number; ease: [number, number, number, number] } {
  const levels = Math.log2(Math.max(1.001, p.scale));
  const zoom = p.zoom + (growT.value - 1) * levels;
  const zoomPerSec = pushRate(Date.now() - p.started) * levels * 1000;
  const left = targetZoom - zoom;
  // The swoop's starting slope (its ease's first point at x 0.3): matched, within a quick enough start and a gentle one.
  const slope = left > 0.25 ? (zoomPerSec * (GROW_SWOOP_MS / 1000)) / left : 0.5;
  return { zoom, ease: [0.3, 0.3 * Math.min(1.6, Math.max(0.3, slope)), 0.16, 1] };
}

/** The push-in's progress `ms` after it started (growT's own curve, worked out rather than read): the phone's clocks. */
export function growTAt(ms: number): number {
  if (ms <= 0) return 0;
  if (ms < GROW_MS) return (1 + OVER) * GROW_C.y(ms / GROW_MS);
  const u = Math.min(1, (ms - GROW_MS) / CREEP_MS);
  return 1 + OVER + CREEP * (1 - (1 - u) * (1 - u));
}

/**
 * The same curve for a map's own page (MapCanvas), as plain old JavaScript: a function of the milliseconds since the push-in
 * started, so the page can follow it frame by frame on its own clock (Date.now() is the phone's one clock, so both agree).
 */
export const PUSH_JS = `(function(){var G=${GROW_MS},X1=${GROW_CURVE[0]},Y1=${GROW_CURVE[1]},X2=${GROW_CURVE[2]},Y2=${GROW_CURVE[3]},O=${OVER},C=${CREEP},CM=${CREEP_MS};
function bz(t,a,b){return ((1-3*b+3*a)*t+(3*b-6*a))*t*t+3*a*t}
function y(x){if(x<=0)return 0;if(x>=1)return 1;var lo=0,hi=1;for(var i=0;i<40;i++){var m=(lo+hi)/2;if(bz(m,X1,X2)<x)lo=m;else hi=m}return bz((lo+hi)/2,Y1,Y2)}
return function(ms){if(ms<=0)return 0;if(ms<G)return (1+O)*y(ms/G);var u=Math.min(1,(ms-G)/CM);return 1+O+C*(1-(1-u)*(1-u))}})()`;

/** The fixed point the page grows round (page coordinates), the card's middle, and the screen's middle in the page: aimGrow's geometry. */
function growGeometry(p: Pick<GrowPlan, 'page' | 'card' | 'screen' | 'scale'>) {
  const kx = p.card.x - p.page.x + p.card.w / 2;
  const ky = p.card.y - p.page.y + p.card.h / 2;
  const sx = p.screen.w / 2 - p.page.x;
  const sy = p.screen.h / 2 - p.page.y;
  const k = p.scale > 1.001 ? p.scale : 1.001;
  return { kx, ky, sx, sy, px: (k * kx - sx) / (k - 1), py: (k * ky - sy) / (k - 1) };
}

/** A spot as world pixels at a zoom (MapLibre's 512-wide world), and back. */
const worldX = (lng: number, z: number) => ((lng + 180) / 360) * 512 * 2 ** z;
const worldY = (lat: number, z: number) => { const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 * 2 ** z; };
const lngOf = (x: number, z: number) => (x / (512 * 2 ** z)) * 360 - 180;
const latOf = (y: number, z: number) => { const n = Math.PI - (2 * Math.PI * y) / (512 * 2 ** z); return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/**
 * What the full map's own page needs to look exactly where the pushed-in card is looking, at any moment (v5), in the card's
 * world pixels at its own zoom `z0`: the screen's middle shows the card's spot `w0 + a + b/s` when the page is drawn `s`
 * times bigger. (The card's middle reaches the screen's middle at s = scale, and the page keeps going past it.)
 */
export interface GrowFollow { z0: number; w0x: number; w0y: number; ax: number; ay: number; bx: number; by: number; S: number; t0: number }
export function growFollow(p: GrowPlan): GrowFollow {
  const g = growGeometry(p);
  const z0 = p.zoom - Math.log2(Math.max(1.001, p.scale));
  return { z0, w0x: worldX(p.center.lng, z0), w0y: worldY(p.center.lat, z0), ax: g.px - g.kx, ay: g.py - g.ky, bx: g.sx - g.px, by: g.sy - g.py, S: p.scale, t0: p.started };
}
/** Where the full map's camera is when the page is drawn `s` times bigger: exactly what the pushed-in card shows then. */
export function growCamera(p: GrowPlan, s: number): { center: LatLng; zoom: number } {
  const f = growFollow(p);
  const k = Math.max(1e-3, s);
  const x = f.w0x + f.ax + f.bx / k;
  const y = f.w0y + f.ay + f.by / k;
  return { center: { lat: latOf(y, f.z0), lng: lngOf(x, f.z0) }, zoom: f.z0 + Math.log2(k) };
}
/** The same, for a map's own page (MapCanvas), as plain old JavaScript: `(f, s) => [lng, lat, zoom]`. */
export const GROW_CAMERA_JS = `(function(f,s){s=Math.max(1e-3,s);var W=512*Math.pow(2,f.z0),x=f.w0x+f.ax+f.bx/s,y=f.w0y+f.ay+f.by/s,n=Math.PI-2*Math.PI*y/W;return [x/W*360-180,180/Math.PI*Math.atan(Math.sinh(n)),f.z0+Math.log(s)/Math.LN2]})`;
/** The card's rectangle on the screen when the page is drawn `s` times bigger, and its corner's radius (for a page to clip to). */
export function growCardAt(p: GrowPlan, s: number, radius: number): { x: number; y: number; w: number; h: number; r: number } {
  const g = growGeometry(p);
  const x0 = p.card.x - p.page.x;
  const y0 = p.card.y - p.page.y;
  return { x: p.page.x + g.px + (x0 - g.px) * s, y: p.page.y + g.py + (y0 - g.py) * s, w: p.card.w * s, h: p.card.h * s, r: radius * s };
}
/** How much bigger the page is drawn now (the website: the live value; 1 when no grow is on). */
export function growScaleNow(): number {
  'worklet';
  return growT.value > 0 ? Math.pow(geo.value.s, growT.value) : 1;
}
/**
 * The website's card (v5): `apply` with how much bigger the page is drawn, on every frame of the push-in, in the same
 * moment the page is moved (so the pins never lag it by a frame), and 1 when it is over.
 */
export function useGrowLens(on: boolean, apply: (s: number) => void) {
  // The shared values read here directly (not through growScaleNow), so the browser's Reanimated knows to run it as they change.
  useAnimatedReaction(() => (on && growT.value > 0 ? Math.pow(geo.value.s, growT.value) : 1), (s, was) => { if (s !== was) runOnJS(apply)(s); }, [on]);
}

/** The plan for a card at `card` in a page at `page`, growing to fill `screen`; `center`/`zoom`: the card's map. */
export function growPlan(o: { page: Rect; card: Rect; screen: { w: number; h: number }; center: LatLng; zoom: number }): GrowPlan {
  // Big enough to cover the screen both ways, and a touch more, so the card's rounded corners and edge go off the screen.
  const scale = Math.max(o.screen.w / o.card.w, o.screen.h / o.card.h) * 1.03;
  return { ...o, shot: null, box: null, scale, zoom: o.zoom + Math.log2(scale), started: 0, at: Date.now() };
}

/* ------------------------------------------------- the push-in, from the card */

/** When a grow was set going (the moment you were found): the pill's moment is the quick one from then (UpToHit). */
let armedAt = 0;
/** The tab bar goes as the push-in starts, before the full map is the page (AppShell). */
let barAway = false;
const barListeners = new Set<() => void>();
const setBarAway = (away: boolean) => { if (barAway === away) return; barAway = away; barListeners.forEach((fn) => fn()); };
const subscribeBar = (fn: () => void) => { barListeners.add(fn); return () => { barListeners.delete(fn); }; };
/** Whether a grow is under way, from the moment you are found until the map has taken over: the tab bar goes (AppShell). */
export function useGrowUnderWay(): boolean {
  return useSyncExternalStore(subscribeBar, () => barAway, () => barAway);
}
/**
 * The Community page stays on the live state for the first moment of a grow (tabFocus), while the pill plays its quick
 * moment as it slips out: under the full map opened over it at once in a browser it would otherwise count as covered, and
 * the pill's green would come a few frames late, as background work. Only that long: after, the page is out of sight
 * under the pushed-in card, and its redraws go back to waiting their turn (one mid-dive held the camera still a moment).
 */
let pageLive = false;
let pageLiveTimer: ReturnType<typeof setTimeout> | null = null;
const pageListeners = new Set<() => void>();
const setPageLive = (live: boolean) => { if (pageLive === live) return; pageLive = live; pageListeners.forEach((fn) => fn()); };
const subscribePage = (fn: () => void) => { pageListeners.add(fn); return () => { pageListeners.delete(fn); }; };
export function useGrowPageLive(): boolean {
  return useSyncExternalStore(subscribePage, () => pageLive, () => pageLive);
}
/** A grow is going ahead (you are found, the card is about to push in): set at once, before anything is measured. */
let barTimer: ReturnType<typeof setTimeout> | null = null;
export function armGrow() {
  armedAt = Date.now();
  setBarAway(true);
  setPageLive(true);
  if (pageLiveTimer) clearTimeout(pageLiveTimer);
  pageLiveTimer = setTimeout(() => { pageLiveTimer = null; setPageLive(false); }, SLIP_MS + 120);
  // Never left without its tab bar: a grow that somehow never ended gives it back (the full map hides it anyway).
  if (barTimer) clearTimeout(barTimer);
  barTimer = setTimeout(() => { barTimer = null; setBarAway(false); }, REVEAL_MAX_MS + PLAN_KEEP_MS);
}
/** Whether a grow was set going just now: the Up to hit pill then plays its quick moment as it slips out. */
export const growArmed = (): boolean => armedAt > 0 && Date.now() - armedAt < 1000;
/**
 * v8 (the iPhone, zoomV7): a move is about to start from the tap itself (the pill turns green at once as it starts to slip
 * out), so its quick moment is the one; nothing else of a grow is set going yet.
 */
export function armQuick() { armedAt = Date.now(); }

/** The push-in's aim: where the page grows round, and how far. Before startGrow; the page is as it was until then. */
export function aimGrow(p: GrowPlan) {
  // In the page's own coordinates: its middle, and the one point that stays put (grown by `scale` round it, the card's
  // middle lands on the screen's middle: growGeometry).
  const g = growGeometry(p);
  geo.value = { cx: p.page.w / 2, cy: p.page.h / 2, px: g.px, py: g.py, s: p.scale };
  cancelAnimation(growT);
  growT.value = 0;
  cancelAnimation(slip);
  slip.value = 0;
}

/**
 * v7: the push-in's aim from a fixed point of the caller's choosing (`P`, window points: round your own spot on the card)
 * and how far (`S`). The push-in itself is then driven from the wall clock by the zoom layer (growT, zoomV7), not here.
 */
export function aimGrowAt(page: Rect, P: { x: number; y: number }, S: number) {
  geo.value = { cx: page.w / 2, cy: page.h / 2, px: P.x - page.x, py: P.y - page.y, s: S };
  cancelAnimation(growT);
  growT.value = 0;
  cancelAnimation(slip);
  slip.value = 0;
}

/** v7: only what sits on the card slips out (the words, the pill, the weather, the credit), as startGrow does it. */
export function startSlip() {
  cancelAnimation(slip);
  slip.value = 0;
  slip.value = withTiming(1, { duration: SLIP_MS, easing: SLIP_EASE });
}

/** The push-in starts, on the live page, this frame; what sits on the card slips out with it. When it started. */
export function startGrow(still: boolean): number {
  cancelAnimation(growT);
  cancelAnimation(slip);
  if (still) { growT.value = 1; slip.value = 1; return Date.now(); }
  slip.value = withTiming(1, { duration: SLIP_MS, easing: SLIP_EASE });
  growT.value = withSequence(
    withTiming(1 + OVER, { duration: GROW_MS, easing: GROW_EASE }),
    withTiming(1 + OVER + CREEP, { duration: CREEP_MS, easing: Easing.out(Easing.quad) }),
  );
  return Date.now();
}

let plan: GrowPlan | null = null;
/** Handed to the full map, the moment before it opens. */
export function setGrowPlan(p: GrowPlan) {
  plan = { ...p, at: Date.now() };
}
/** The full map, opening: the grow handed to it, if it is still fresh (taken once). */
export function takeGrowPlan(): GrowPlan | null {
  const p = plan;
  plan = null;
  return p && Date.now() - p.at <= PLAN_KEEP_MS ? p : null;
}

/** Over (or let go before the full map opened): the page goes back to how it was (out of sight by then), the tab bar to the page. */
export function endGrow() {
  cancelAnimation(growT);
  growT.value = 0;
  cancelAnimation(slip);
  slip.value = 0;
  cancelAnimation(labels);
  labels.value = 1;
  clearers.forEach((l) => l(false));
  armedAt = 0;
  setBarAway(false);
  if (barTimer) { clearTimeout(barTimer); barTimer = null; }
}

/** The push-in, for the picture of the page (the phone's full map, carrying on from the live page). */
export function useGrowPicture() {
  return useAnimatedStyle(() => ({ transform: placeAt(growT.value, geo.value) }));
}

/**
 * A thing on the card as the page pushes in (a worklet), in the card's own coordinates: it rides with its spot (its
 * middle goes where the page takes it) but is drawn at 1/scale, so it keeps its size on the screen and never grows, and
 * it slips out of the card's nearer edge, which clips it away.
 */
function awayAt(edge: AwayEdge, t: number, k: number, g: { s: number }) {
  'worklet';
  const s = Math.pow(g.s, t);
  return [{ translateY: (edge === 'top' ? -SLIP_PX : SLIP_PX) * k }, { scale: 1 / s }];
}

/** Given by the growing card (the Community tab's) round what sits on it; false elsewhere, where nothing moves. */
export const GrowAwayContext = createContext(false);
/**
 * A thing that sits on the card (Up to hit, the weather, the credit): as the page pushes in it slips out of the card at
 * its own size. Only transforms: never a fade (the pill's green and glass stay as they are).
 */
export function useGrowAway(edge: AwayEdge) {
  const live = useContext(GrowAwayContext);
  return useAnimatedStyle(() => (!live ? {} : growT.value > 0 ? { transform: awayAt(edge, growT.value, slip.value, geo.value) } : { transform: [] }));
}

/* ------------------------------------------------- the page that grows */

/**
 * The Community page registers itself as the page that pushes in, while it is up. Only the page itself (`on`), never a
 * copy of it drawn for a moment (a swipe's preview of the tab, or of Community behind a thread as you swipe back): one of
 * those coming and going took the page's place and then left none, and Up to hit slid the map in again from then on
 * (review, Oct 28). Kept as a list, so whichever goes, the one still up stays the page.
 */
const hosts: MutableRefObject<View | null>[] = [];
export function useGrowHost(ref: MutableRefObject<View | null>, on = true) {
  useEffect(() => {
    if (!on) return undefined;
    hosts.push(ref);
    return () => { const i = hosts.lastIndexOf(ref); if (i >= 0) hosts.splice(i, 1); };
  }, [ref, on]);
}
/** The page that pushes in, if one is up. */
export const growHost = (): View | null => hosts[hosts.length - 1]?.current ?? null;

const WEB = Platform.OS === 'web';
/**
 * The push-in on the page itself (a preview copy of the page is never touched). Never anything but a transform: the
 * page's glass stays glass.
 */
export function useGrowHostStyle(on = true) {
  return useAnimatedStyle(() => (!on ? {} : growT.value > 0 ? { transform: placeAt(growT.value, geo.value) } : { transform: [] }));
}

/** A ref that always holds the latest value (for timers set up once). */
export function useLatest<T>(value: T) {
  const r = useRef(value);
  r.current = value;
  return r;
}

/** The full map's options when it opens by growing (app/_layout.tsx): no slide; in a browser, see-through over the page pushing in. */
export function mapScreenOptions(params: unknown) {
  const grow = !!(params && typeof params === 'object' && (params as { grow?: string }).grow);
  if (!grow) return {};
  return WEB
    ? { presentation: 'transparentModal' as const, animation: 'none' as const, contentStyle: { backgroundColor: 'transparent' } }
    : { animation: 'none' as const };
}
