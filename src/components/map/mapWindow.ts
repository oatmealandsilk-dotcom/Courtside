import { useSyncExternalStore } from 'react';
import { cancelAnimation, makeMutable } from 'react-native-reanimated';

import type { CanvasMarker } from '@/components/map/pinEngine';
import type { LatLng } from '@/features/players/positions';

/**
 * The full map as one window over the page (Oct 22, owner: "Opening the map
 * should BE FUCKING GOOD ANIMATION. It's our core of the app").
 *
 * One full map is made once, in the background, and kept above the tabs
 * (MapLayer). Shut, it is looking at exactly what the still card shows and
 * nobody sees it: its window is nothing wide. A tap on the card opens the
 * window from the card's own spot and size out to the whole screen while the
 * map inside zooms from the card's view to the city: no new page, no blank
 * frame, no slide in from the side. Closing runs it all back into the card.
 *
 * This file is the shared part: where the window is (on the UI thread), the
 * cards that can open it, and the motion's numbers.
 */

/** Opening: settles in about 0.44 s with a breath of give at the end. */
export const OPEN = { duration: 420, dampingRatio: 0.9 } as const;
/** Closing (a button, Back, or a swipe let go): no bounce. */
export const CLOSE = { duration: 380, dampingRatio: 1 } as const;
/** A swipe let go too early: back to full. */
export const SNAPBACK = { duration: 300, dampingRatio: 0.9 } as const;
/** The card under the finger, pressed. */
export const PRESS_SCALE = 0.97;
export const PRESS_MS = 90;
/**
 * The map's own zoom from the card's view to the city's, and back.
 * A MATCHED PAIR with OPEN / CLOSE above: each bezier and duration was fitted
 * to its window spring (open within 2.8%, close within 1.3% at every frame),
 * so the streets grow and shrink exactly with the window. Change one, refit
 * the other.
 */
export const CAMERA_OPEN_MS = 380;
export const CAMERA_CLOSE_MS = 320;
/** A swipe closes when let go faster than this (points a second), or past this share of the screen. */
export const COMMIT_V = 700;
export const COMMIT_FRAC = 0.25;
export const EDGE_COMMIT_FRAC = 0.33;
/** The strip at the left edge an iPhone's back swipe starts in. */
export const EDGE_W = 20;
/** The card's corners (radius.xl) and an iPhone's own screen corners. */
export const CARD_R = 24;
export const DEVICE_R = 44;
/** The camera's curves: the window springs' own progress as cubic-beziers (matched with CAMERA_*_MS above). */
export const OPEN_BEZIER: [number, number, number, number] = [0.35, 0.6, 0.05, 1];
export const CLOSE_BEZIER: [number, number, number, number] = [0.2, 0.1, 0.15, 1];
/** Into the open, the pins change from the card's quiet ones to the full map's, and it takes touches: this far open (about 0.14 s in, the zoom well under way). */
export const FULL_AT = 0.85;
/** Into a close, the pins go back to the card's (the window most of the way down), their fades done before the hand-over. */
export const PINS_CARD_AT_MS = 150;
/** A swipe's speed handed on to the close, at most this much of the way a second (more would overshoot a no-bounce spring). */
export const MAX_FLING = 8;

export type LayerSource = 'community' | 'feed';
export type LayerState = 'cold' | 'ready' | 'opening' | 'open' | 'closing';

/** The window, in the layer's own points (its top-left is the (tabs) area's top-left). */
export const win = { x: makeMutable(0), y: makeMutable(0), w: makeMutable(0), h: makeMutable(0) };
/** The card the window opened from (and closes into), in the same points. */
export const cardRect = { x: makeMutable(0), y: makeMutable(0), w: makeMutable(0), h: makeMutable(0) };
/** How far the card was sunk under the finger when it opened (its words in the window are drawn at that size). */
export const cardScale = makeMutable(1);
/** The layer's own size: the whole (tabs) area. */
export const box = { w: makeMutable(0), h: makeMutable(0) };
/** 1 while a finger is dragging the window (its corners and the scrim follow the finger, not the springs). */
export const dragging = makeMutable(0);
/**
 * The window's motion (open, close, a swipe's snap back): ONE progress `q`
 * from 0 to 1 on one spring, the window drawn between the rect it started
 * from (f*) and where it is going (t*, or the whole layer when `full`). Every
 * edge, and the map's scale inside it (sf to st), move on that same q, so
 * the window keeps its shape and a swipe's speed is handed on as progress,
 * always toward where it is going. `on` 0: the window is `win` itself (a
 * finger dragging it, or shut).
 */
export const motion = {
  on: makeMutable(0), q: makeMutable(0),
  fx: makeMutable(0), fy: makeMutable(0), fw: makeMutable(0), fh: makeMutable(0),
  tx: makeMutable(0), ty: makeMutable(0), tw: makeMutable(0), th: makeMutable(0),
  full: makeMutable(0), sf: makeMutable(1), st: makeMutable(1),
};
/** 1 while the window is closing into the card (the hand-over comes the frame it lands). */
export const closingSV = makeMutable(0);

/**
 * All of the above in one object. An animated style that reads the window
 * names this in its own body (openness(LAYER)): in a browser, an animated
 * style only hears the shared values it can see directly, not those inside
 * a helper it calls.
 */
export const LAYER = { win, cardRect, cardScale, box, dragging, motion };
export type LayerValues = typeof LAYER;

/** Where the window is right now (before it is kept inside the screen). */
export function rectOf(l: LayerValues): { x: number; y: number; w: number; h: number } {
  'worklet';
  const m = l.motion;
  if (!m.on.value) return { x: l.win.x.value, y: l.win.y.value, w: l.win.w.value, h: l.win.h.value };
  const q = m.q.value;
  const full = m.full.value === 1;
  const tx = full ? 0 : m.tx.value, ty = full ? 0 : m.ty.value;
  const tw = full ? l.box.w.value : m.tw.value, th = full ? l.box.h.value : m.th.value;
  return { x: m.fx.value + (tx - m.fx.value) * q, y: m.fy.value + (ty - m.fy.value) * q, w: m.fw.value + (tw - m.fw.value) * q, h: m.fh.value + (th - m.fh.value) * q };
}

/** The scale the map is drawn at inside the window: the sunk card's on the way open, a swipe's shrunken map on the way back, else 1. */
export function contentScaleOf(l: LayerValues): number {
  'worklet';
  if (l.dragging.value) { const W = l.box.w.value; return W > 0 ? Math.max(0.5, Math.min(1, l.win.w.value / W)) : 1; }
  const m = l.motion;
  if (!m.on.value) return 1;
  const q = Math.min(1, Math.max(0, m.q.value));
  return m.sf.value + (m.st.value - m.sf.value) * q;
}

/** How far open, 0 (the card) to 1 (the whole screen), worked out from the window's height. */
export function openness(l: LayerValues): number {
  'worklet';
  const full = l.box.h.value;
  const from = l.cardRect.h.value;
  const r = rectOf(l);
  // What of the window is on screen: one sliding away down counts down as it goes.
  const h = Math.min(r.h, full - Math.max(0, r.y));
  if (full <= 0 || h <= 0) return 0;
  if (full - from < 1) return h >= full - 1 ? 1 : 0;
  return Math.min(1, Math.max(0, (h - from) / (full - from)));
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Every shared value back to shut (the layer gone, or about to be made): a window left full size would cover the tabs, dead. */
export function resetWindow() {
  cancelAnimation(motion.q);
  motion.on.value = 0; motion.q.value = 0; motion.full.value = 0; motion.sf.value = 1; motion.st.value = 1;
  win.x.value = 0; win.y.value = 0; win.w.value = 0; win.h.value = 0;
  cardRect.x.value = 0; cardRect.y.value = 0; cardRect.w.value = 0; cardRect.h.value = 0;
  cardScale.value = 1; dragging.value = 0; closingSV.value = 0;
}

/** What the still card shows, so the window opens on exactly the same picture. */
export interface CardInfo {
  /** The card's map centre (it is always at CARD_ZOOM). */
  center: LatLng;
  /** The card's own pins. */
  markers: CanvasMarker[];
  /** The card's words over the map (PreviewOverlay), copied into the window as it opens. */
  overlay: Record<string, unknown> | null;
  /** Where the card is on the screen right now (window points), or null when it is not on screen. */
  measure: () => Promise<Rect | null>;
  /** The card is drawn (its map has painted). */
  painted: boolean;
  /** The card's press scale, put back as the window opens over it. */
  release: () => void;
}

// Each card on screen, by where it is; a second copy of a page (a browser's swipe preview) adds one that goes again with it.
const cards = new Map<LayerSource, { owner: object; info: CardInfo }[]>();
const cardListeners = new Set<() => void>();
let cardsVersion = 0;
const told = () => { cardsVersion++; cardListeners.forEach((fn) => fn()); };
/** A card says what it shows (again whenever that changes); `info` null when it goes. */
export function setCard(source: LayerSource, owner: object, info: CardInfo | null) {
  const list = (cards.get(source) ?? []).filter((c) => c.owner !== owner);
  if (info) list.unshift({ owner, info });
  if (list.length) cards.set(source, list); else cards.delete(source);
  told();
}
export function getCard(source: LayerSource): CardInfo | undefined { return cards.get(source)?.[0]?.info; }
export function anyCard(): [LayerSource, CardInfo] | null {
  const community = getCard('community');
  if (community) return ['community', community];
  const feed = getCard('feed');
  return feed ? ['feed', feed] : null;
}
const subscribeCards = (fn: () => void) => { cardListeners.add(fn); return () => { cardListeners.delete(fn); }; };
/** Changes whenever a card says something new about itself. */
export function useCardsVersion(): number {
  return useSyncExternalStore(subscribeCards, () => cardsVersion, () => cardsVersion);
}

let state: LayerState = 'cold';
const stateListeners = new Set<() => void>();
export function setLayerState(next: LayerState) {
  if (next === state) return;
  state = next;
  stateListeners.forEach((fn) => fn());
}
export const layerState = () => state;
const subscribeState = (fn: () => void) => { stateListeners.add(fn); return () => { stateListeners.delete(fn); }; };
export function useLayerState(): LayerState {
  return useSyncExternalStore(subscribeState, () => state, () => state);
}
/** Whether the map is over the page (opening, open or closing). */
export const layerUp = (s: LayerState) => s === 'opening' || s === 'open' || s === 'closing';

/** The layer itself, once it is made. */
export interface LayerHandle {
  open: (source: LayerSource, rect: Rect, scale: number) => void;
  close: () => void;
}
let handle: LayerHandle | null = null;
export function setLayerHandle(h: LayerHandle | null) { handle = h; }

/**
 * A card tapped: the window opens from it. False when the layer is not ready
 * (still being made, or gone to free memory): the caller opens the map page
 * as before.
 */
export function openLayer(source: LayerSource, rect: Rect | null, scale = 1): boolean {
  if (!handle || (state !== 'ready' && state !== 'closing') || !rect || rect.w < 10 || rect.h < 10) return false;
  handle.open(source, rect, scale);
  return true;
}
export function closeLayer() { handle?.close(); }
