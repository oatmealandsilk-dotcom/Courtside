import { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react';
import { Platform, type View } from 'react-native';
import { Easing, cancelAnimation, makeMutable, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';

import type { LatLng } from '@/features/players/positions';

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
 *  - iPhone and Android: a picture of the Community page (the card's map in it) is taken the moment you
 *    are up. The full map opens with it on top, so its first frame is the page you were looking at; the
 *    picture is what pushes in, while the full map loads under it. When the map has drawn, the picture
 *    goes (a short dissolve, the map's camera already moving) and the map is all there is.
 *  - The website: the Community page itself pushes in, under a full map that opens see-through and
 *    shows itself once it has drawn (a browser keeps both pages drawn, so no picture is needed).
 * Either way the tab bar slides away by itself (AppShell, as for every full map).
 *
 * v3 (Oct 28, owner, of v2: "The zoom is better but the first bit is weird because the icon in the middle and up to hit
 * in the corner are still there. Like it should be one seamless transition"): nothing that sits on the card grows with
 * the push-in, only its map. As you are found the card's words and pins step aside (a quick fade, in the map's own
 * drawing for the pins) while the Up to hit pill plays its moment (the green sweeping in, the tick: UpToHit); then, as the
 * push-in starts, the pill, the weather and the credit slip out of the card's edge, keeping their own size (useGrowAway).
 * On the phone the picture is taken only once the pill's moment has played (taking it holds the phone for a moment, which
 * would stop the pill part way), and it carries the card's map alone over the card (GrowBox) with each of those as its
 * own small picture (GrowAwayShot), so the same slip happens on the picture as on the website's live page.
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
/** The phone: one thing that sits on the card (Up to hit, the weather, the credit), as its own picture, and where it was. */
export interface GrowAwayShot { rect: Rect; shot: string; edge: AwayEdge }

/** A grow asked for: what the full map needs to open exactly where the grown card is. */
export interface GrowPlan {
  /** The page that pushes in (window coordinates), and the card in it. */
  page: Rect;
  card: Rect;
  /** The screen it grows to fill. */
  screen: { w: number; h: number };
  /** The phone's picture of the page (a file), or null in a browser (the page itself pushes in). */
  shot: string | null;
  /** The phone: the card's map alone, over the card in the picture, so what sits on the card is not in what grows. */
  box?: GrowBox | null;
  /** The phone: what sat on the card, each its own picture, slipping out of the card's edge at its own size. */
  away?: GrowAwayShot[];
  /** Where the full map opens: the card's own centre, as close as the grown card shows it. */
  center: LatLng;
  zoom: number;
  /** How much the page grows. */
  scale: number;
  at: number;
}

/** The push-in: fast to start, a long strong ease to rest. */
export const GROW_MS = 560;
const GROW_EASE = Easing.bezier(0.33, 0, 0.1, 1);
/** Not drawn yet when the push-in is done: it keeps creeping in, slowly, so the screen never stands still. */
const CREEP = 0.08;
const CREEP_MS = 2600;
/** The map takes over this far into the push-in (if it has drawn), so the push-in and the camera's dive overlap: one move. */
export const REVEAL_AT = 0.8;
/** However long the map takes, it takes over by this long after the push-in began (its own loading look then shows). */
export const REVEAL_MAX_MS = 3000;
/** The dissolve from the grown card to the live map. */
export const REVEAL_MS = 220;
/** The swoop after a grow: the push-in has done the first part of the way down, so it is shorter than from the city. */
export const GROW_SWOOP_MS = 1300;
/**
 * Its ease after a grow: already moving as the grown card dissolves (the push-in was its slow start), then the same long
 * soft landing. With the swoop's own slow start (0.5, 0, …) the camera all but stood still for a third of a second
 * after the push-in had come to rest: two moves, not one (review, Oct 28).
 */
export const GROW_SWOOP_EASE: [number, number, number, number] = [0.3, 0.15, 0.16, 1];
/** The map's buttons slide in this long after the map has taken over, as the camera comes in to land. */
export const CHROME_AFTER_MS = 760;
export const CHROME_MS = 420;
/** A grow asked for is taken by the full map it opens within this long, or let go. */
const PLAN_KEEP_MS = 6000;
/**
 * The Up to hit pill's moment, from the moment you are found: the green sweeps in and the tick is drawn (both all but done
 * by 320 ms: their eases settle long before their 360 / 350 ms ends) as the pill springs to its new width (UpToHit).
 * Nothing moves (and on the phone nothing is photographed) before it has played, so it is never cut; a frame to spare for
 * the pill turning green a moment after you are found. The card's words and pins step aside meanwhile.
 */
export const PILL_MOMENT_MS = 340;
/** As the push-in starts, what sits on the card slips out of its edge: this quick, gathering speed as it goes. */
export const SLIP_MS = 170;
const SLIP_EASE = Easing.bezier(0.4, 0, 1, 1);
/** How far (in the card's own size, before it grows): enough to clear the edge from the 12 points in where they sit. */
const SLIP_PX = 60;

/** 0 → 1 as the page pushes in (past 1 while it creeps on). Shared by the page (website) and the picture (phone). */
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

/** The plan for a card at `card` in a page at `page`, growing to fill `screen`; `center`/`zoom`: the card's map. */
export function growPlan(o: { page: Rect; card: Rect; screen: { w: number; h: number }; shot: string | null; box?: GrowBox | null; away?: GrowAwayShot[]; center: LatLng; zoom: number }): GrowPlan {
  // Big enough to cover the screen both ways, and a touch more, so the card's rounded corners and edge go off the screen.
  const scale = Math.max(o.screen.w / o.card.w, o.screen.h / o.card.h) * 1.03;
  return { ...o, scale, zoom: o.zoom + Math.log2(scale), at: Date.now() };
}

let plan: GrowPlan | null = null;
/** Asked for by the card, the moment before the full map opens. */
export function setGrowPlan(p: GrowPlan) {
  plan = p;
  // In the page's own coordinates: its middle, the card's middle, the screen's middle.
  const cx = p.page.w / 2;
  const cy = p.page.h / 2;
  const kx = p.card.x - p.page.x + p.card.w / 2;
  const ky = p.card.y - p.page.y + p.card.h / 2;
  const sx = p.screen.w / 2 - p.page.x;
  const sy = p.screen.h / 2 - p.page.y;
  // The one point that stays put: grown by `scale` round it, the card's middle lands on the screen's middle.
  const k = p.scale > 1.001 ? p.scale : 1.001;
  geo.value = { cx, cy, px: (k * kx - sx) / (k - 1), py: (k * ky - sy) / (k - 1), s: p.scale };
  cancelAnimation(growT);
  growT.value = 0;
  cancelAnimation(slip);
  slip.value = 0;
}
/** The full map, opening: the grow asked for, if it is still fresh (taken once). */
export function takeGrowPlan(): GrowPlan | null {
  const p = plan;
  plan = null;
  return p && Date.now() - p.at <= PLAN_KEEP_MS ? p : null;
}

/** The push-in starts (once its first frame is surely on screen). */
export function startGrow(still: boolean) {
  cancelAnimation(growT);
  cancelAnimation(slip);
  if (still) { growT.value = 1; slip.value = 1; return; }
  slip.value = withTiming(1, { duration: SLIP_MS, easing: SLIP_EASE });
  growT.value = withSequence(
    withTiming(1, { duration: GROW_MS, easing: GROW_EASE }),
    withTiming(1 + CREEP, { duration: CREEP_MS, easing: Easing.out(Easing.quad) }),
  );
}
/** The map takes over: the push-in stops where it is; how far past its end it had crept (for the map's camera to match). */
export function holdGrow(): number {
  cancelAnimation(growT);
  return Math.max(0, growT.value - 1);
}
/** Over: the page goes back to how it was (under the full map by now, so nobody sees it). */
export function endGrow() {
  cancelAnimation(growT);
  growT.value = 0;
  cancelAnimation(slip);
  slip.value = 0;
  cancelAnimation(labels);
  labels.value = 1;
  clearers.forEach((l) => l(false));
}
/** How much closer the grown card was than its plan, `crept` past the end (zoom levels, for the map's camera). */
export const creptZoom = (p: GrowPlan, crept: number) => crept * Math.log2(p.scale);

/** The push-in, for the picture of the page (the phone). */
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

/** The things on the growing card (Up to hit, the weather, the credit): each one's view, for the phone's pictures of them. */
export interface AwayItem { ref: MutableRefObject<View | null>; edge: AwayEdge }
export type AwayRegistry = Set<AwayItem>;
/** Given by the growing card (the Community tab's) round what sits on it; none elsewhere, where nothing moves. */
export const GrowAwayContext = createContext<AwayRegistry | null>(null);
export const newAwayRegistry = (): AwayRegistry => new Set();
/**
 * A thing that sits on the card: its view (the phone takes its picture) and, in a browser, where the page itself pushes
 * in, its slip out of the card at its own size. Only transforms: never a fade (the pill's green and glass stay as they are).
 */
export function useGrowAway(edge: AwayEdge) {
  const reg = useContext(GrowAwayContext);
  const ref = useRef<View | null>(null);
  useEffect(() => {
    if (!reg) return undefined;
    const item: AwayItem = { ref, edge };
    reg.add(item);
    return () => { reg.delete(item); };
  }, [reg, edge]);
  const live = WEB && !!reg;
  const style = useAnimatedStyle(() => (!live ? {} : growT.value > 0 ? { transform: awayAt(edge, growT.value, slip.value, geo.value) } : { transform: [] }));
  return { ref, style };
}
/** The same slip for a thing's own picture, inside the phone's picture of the card (the picture of the page around it grows). */
export function useAwayPicture(edge: AwayEdge) {
  return useAnimatedStyle(() => ({ transform: awayAt(edge, growT.value, slip.value, geo.value) }));
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
 * The push-in on the page itself (the website only; the phone pushes its picture in). Never anything
 * but a transform: the page's glass stays glass.
 */
export function useGrowHostStyle(on = true) {
  // On the phone (and on a preview copy of the page) the worklet never reads the push-in, so the page is not touched at all there.
  const live = WEB && on;
  return useAnimatedStyle(() => (!live ? {} : growT.value > 0 ? { transform: placeAt(growT.value, geo.value) } : { transform: [] }));
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
