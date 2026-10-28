import { useEffect, useRef, type MutableRefObject } from 'react';
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
 * Only the Community tab's card grows (it is the page that pushes in); the For you copy of the card,
 * Reduce Motion, a phone whose pictures of the map come out blank, and Only me keep the plain way in
 * (the page opening as it always has, the map on you). Admins first, with the rest of the zoom
 * (checkInZoom's CHECKIN_ZOOM_FOR_EVERYONE).
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** A grow asked for: what the full map needs to open exactly where the grown card is. */
export interface GrowPlan {
  /** The page that pushes in (window coordinates), and the card in it. */
  page: Rect;
  card: Rect;
  /** The screen it grows to fill. */
  screen: { w: number; h: number };
  /** The phone's picture of the page (a file), or null in a browser (the page itself pushes in). */
  shot: string | null;
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
/** The map's buttons slide in this long after the map has taken over, as the camera comes in to land. */
export const CHROME_AFTER_MS = 760;
export const CHROME_MS = 420;
/** A grow asked for is taken by the full map it opens within this long, or let go. */
const PLAN_KEEP_MS = 6000;

/** 0 → 1 as the page pushes in (past 1 while it creeps on). Shared by the page (website) and the picture (phone). */
export const growT = makeMutable(0);
/**
 * The card's words (its city's name and counts, PreviewOverlay): they step out of the way as the grow starts, so the
 * push-in is into the map, not into a giant "Los Angeles". Words only (never the glass button beside them).
 */
const labels = makeMutable(1);
export const LABELS_OUT_MS = 140;
export function labelsOut() { labels.value = withTiming(0, { duration: LABELS_OUT_MS, easing: Easing.out(Easing.quad) }); }
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
export function growPlan(o: { page: Rect; card: Rect; screen: { w: number; h: number }; shot: string | null; center: LatLng; zoom: number }): GrowPlan {
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
  if (still) { growT.value = 1; return; }
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
  cancelAnimation(labels);
  labels.value = 1;
}
/** How much closer the grown card was than its plan, `crept` past the end (zoom levels, for the map's camera). */
export const creptZoom = (p: GrowPlan, crept: number) => crept * Math.log2(p.scale);

/** The push-in, for the picture of the page (the phone). */
export function useGrowPicture() {
  return useAnimatedStyle(() => ({ transform: placeAt(growT.value, geo.value) }));
}

/* ------------------------------------------------- the page that grows */

let host: MutableRefObject<View | null> | null = null;
/** The Community page registers itself as the page that pushes in, while it is up. */
export function useGrowHost(ref: MutableRefObject<View | null>) {
  useEffect(() => {
    host = ref;
    return () => { if (host === ref) host = null; };
  }, [ref]);
}
/** The page that pushes in, if one is up. */
export const growHost = (): View | null => host?.current ?? null;

const WEB = Platform.OS === 'web';
/**
 * The push-in on the page itself (the website only; the phone pushes its picture in). Never anything
 * but a transform: the page's glass stays glass.
 */
export function useGrowHostStyle() {
  // On the phone the worklet never reads the push-in, so the page is not touched at all there.
  return useAnimatedStyle(() => (!WEB ? {} : growT.value > 0 ? { transform: placeAt(growT.value, geo.value) } : { transform: [] }));
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
