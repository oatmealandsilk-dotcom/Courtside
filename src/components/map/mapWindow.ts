import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

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
/** The map's own zoom from the card's view to the city's, and back. */
export const CAMERA_OPEN_MS = 520;
export const CAMERA_CLOSE_MS = 380;
/** A swipe closes when let go faster than this (points a second), or past this share of the screen. */
export const COMMIT_V = 700;
export const COMMIT_FRAC = 0.25;
export const EDGE_COMMIT_FRAC = 0.33;
/** The strip at the left edge an iPhone's back swipe starts in. */
export const EDGE_W = 20;
/** The card's corners (radius.xl) and an iPhone's own screen corners. */
export const CARD_R = 24;
export const DEVICE_R = 44;
/** The open map's easing for the camera, the same curve as the window's spring feels. */
export const OPEN_BEZIER: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
export const CLOSE_BEZIER: [number, number, number, number] = [0.3, 0, 0.2, 1];

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

/** How far open, 0 (the card) to 1 (the whole screen), worked out from the window's height. */
export function openness(): number {
  'worklet';
  const full = box.h.value;
  const from = cardRect.h.value;
  // What of the window is on screen: one sliding away down counts down as it goes.
  const h = Math.min(win.h.value, full - Math.max(0, win.y.value));
  if (full <= 0 || h <= 0) return 0;
  if (full - from < 1) return h >= full - 1 ? 1 : 0;
  return Math.min(1, Math.max(0, (h - from) / (full - from)));
}

export interface Rect { x: number; y: number; w: number; h: number }

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

const cards = new Map<LayerSource, CardInfo>();
const cardListeners = new Set<() => void>();
let cardsVersion = 0;
export function setCard(source: LayerSource, info: CardInfo | null) {
  if (info) cards.set(source, info); else cards.delete(source);
  cardsVersion++;
  cardListeners.forEach((fn) => fn());
}
export function getCard(source: LayerSource): CardInfo | undefined { return cards.get(source); }
export function anyCard(): [LayerSource, CardInfo] | null {
  const community = cards.get('community');
  if (community) return ['community', community];
  const first = cards.entries().next();
  return first.done ? null : first.value;
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
