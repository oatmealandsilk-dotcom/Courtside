import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type LayoutChangeEvent, type View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import type Animated from 'react-native-reanimated';
import { cancelAnimation, makeMutable, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { sheetFling } from '@/components/map/sheetFling';

/*
 * The full map's players at two heights. Since Oct 9 (owner: "maybe make it
 * more like the snapchat map with profiles horizontal?") it opens as a short
 * tray, Snap Map's friends tray in CourtSide's look: one line on top, and
 * under it the players side by side, a big round face each, scrolled
 * sideways, with the map and its pins in plain view above. Pulled up by its
 * title (or on a phone by the faces themselves), or with See all, it becomes
 * the full list of Oct 8, one player a row, stopping under the search and the
 * filters, which still work while it is up. Pulled back down it returns to
 * the tray, and from the tray on down it closes, as the map's cards always
 * have.
 *
 * Both are drawn in one body whose height moves on the animation thread:
 * the faces at its top, the list filling it behind them. As it grows the
 * faces fade out and the rows fade in, so the tray opens into the list
 * rather than swapping for it. Below the tray the whole sheet follows the
 * finger down instead (translateY), and let go far enough it closes,
 * carried on at the finger's speed (sheetFling) like every map card.
 *
 * A browser cannot hand a scroll over to the sheet, so there the tray
 * listens for itself: a finger moving up or down on the faces drags it, and
 * a wheel or trackpad scroll down over them opens the list. The title and
 * See all work everywhere.
 */

/** One player's row in the full list: a contacts list's height, a 40-point face beside a name and the line under it. */
export const LIST_ROW_H = 60;
/** The room under the list's last row (MapChrome's `list` padding). */
export const LIST_PAD_BOTTOM = 8;
/** The title strip, grabber to the foot of its one line (MapChrome's listHead), which both heights leave room for. */
export const LIST_HEAD_H = 46;
/** A face in the tray: Snap Map's size, big enough to know someone by. */
export const TRAY_FACE = 64;
/** Each player's column in the tray, the face's ring (64 + 13) and a point to spare. */
export const TRAY_ITEM_W = 78;
/** Between two columns. */
export const TRAY_GAP = 6;
/** Either end of the row, the sheet's own margin. */
export const TRAY_PAD = 16;
/** The row of faces, padding included, until it is measured (larger text makes it taller). */
export const TRAY_BODY_H = 145;
/** Pulled up, at most this much, and always clear of the search and the filters above. */
const TALL_MAX = 0.85;
/** Settling on either height: the map cards' own spring (CardStage), quick and never past the stop. */
const SETTLE = { damping: 30, stiffness: 300, mass: 1, overshootClamping: true } as const;
/** Pulled this far below the tray, or flicked down once below it, it closes. */
const CLOSE_PAST = 60;
const FLICK = 600;
/** Past the tall height (or above the tray, with nothing more to show) it gives a little, a fifth of the finger's travel, and springs back. */
const GIVE = 0.2;
/** A drag on the faces in a browser just ended: the tap that ends it opens nobody. */
const DRAG_HUSH_MS = 350;
const WEB = Platform.OS === 'web';

/**
 * How much map is left between the foot of the filters and the sheet's top,
 * as it moves. The map's buttons riding on it (MapChrome's ListCrown) fade
 * out as it runs short and are gone once they would no longer fit, so
 * nothing ever lies over the list or the filters; on the tray, or a short
 * list that rises only a little, they stay.
 */
export const listHeadroom = makeMutable(10000);

/** How far from the tray to the full list the body is (0 to 1), for the faces fading out and the rows in. */
function along(h: number, floor: number, top: number, tall: boolean): number {
  'worklet';
  if (top <= floor + 1) return tall ? 1 : 0;
  return Math.min(1, Math.max(0, (h - floor) / (top - floor)));
}

/** Where the list may reach: the map's own height, how far down the search and filters run, and the strip under the home indicator. */
export interface ListRoom {
  height: number;
  top: number;
  foot: number;
}

export function useListStops({ rows, room, windowH, windowW, openTall, onTall, onClose }: {
  /** How many players are listed; none is an empty state, which has no tray or list to raise. */
  rows: number;
  room?: ListRoom;
  windowH: number;
  /** The screen's width, for whether every face fits across before the sheet is measured. */
  windowW: number;
  /** Opens tall: it was the full list when a row opened a player's card, and that card has closed. */
  openTall: boolean;
  /** Which height it is going to, each time that changes: the full list, or the tray. */
  onTall?: (tall: boolean) => void;
  onClose: () => void;
}) {
  const H = room?.height || windowH;
  const foot = room?.foot ?? 0;
  const listed = rows > 0;
  // The row of faces, as tall as it measures (a larger text size makes it taller).
  const [trayH, setTrayH] = useState(TRAY_BODY_H);
  const [width, setWidth] = useState(0);
  const [contentH, setContentH] = useState(0);
  const floor = listed ? trayH : 0;
  // Tall, its top meets the foot of the filters' row (the row's own padding is the gap), so the city chip under them is covered whole.
  const tallTotal = Math.min(Math.round(H * TALL_MAX), room?.top ? H - room.top : H);
  const tallList = Math.max(floor, tallTotal - foot - LIST_HEAD_H);
  // The list's rows, as measured; until then, as a row is drawn.
  const listH = contentH || rows * LIST_ROW_H + LIST_PAD_BOTTOM;
  // Everyone already in view across the tray: there is no more to see, so nothing to pull up to.
  const fits = rows * (TRAY_ITEM_W + TRAY_GAP) - TRAY_GAP + 2 * TRAY_PAD <= (width || windowW);
  const canTall = listed && !fits && listH > floor + 1;
  // Its two heights: a short list's tall one is just its rows.
  const top = canTall ? Math.min(tallList, listH) : floor;
  const startTall = openTall && canTall;
  // Which height it is at or going to: the faces take touches on the tray, the rows once it is the list.
  const [up, setUp] = useState(startTall);

  const h = useSharedValue(startTall ? top : floor);
  const y = useSharedValue(0);
  const floorV = useSharedValue(floor);
  const topV = useSharedValue(top);
  const listedV = useSharedValue(listed);
  const stop = useSharedValue(startTall ? 1 : 0);
  const from = useSharedValue(0);
  const held = useSharedValue(false);
  const listY = useSharedValue(0);
  const touch = useSharedValue({ x: 0, y: 0 });
  const listRef = useAnimatedRef<Animated.ScrollView>();
  // The sheet's top, as a body of 0 would put it, measured from the foot of the filters: the headroom, before the body takes its share.
  const base = H - foot - LIST_HEAD_H - (room?.top ?? 0);
  const baseV = useSharedValue(base);

  // The page's callbacks, fresh on every draw, behind stable functions the animation thread can call.
  const said = useRef({ onTall, onClose });
  said.current = { onTall, onClose };
  const close = useCallback(() => said.current.onClose(), []);
  const settle = useCallback((toTall: boolean) => {
    setUp(toTall);
    said.current.onTall?.(toTall);
  }, []);

  // Its heights as they change (its rows measured, a search narrowing them, the window resized): it moves to the new one.
  useEffect(() => {
    floorV.value = floor;
    topV.value = top;
    listedV.value = listed;
    baseV.value = base;
    if (held.value) return;
    // Nothing left to rise for (a search or a filter narrowed it, or nobody is listed): back to the tray.
    if (stop.value === 1 && !canTall) {
      stop.value = 0;
      settle(false);
    }
    if (!listed) return;
    h.value = withSpring(stop.value === 1 ? top : floor, SETTLE);
  }, [floor, top, listed, canTall, base]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Where it is going, the full list or the tray: there on the spring, picking up the finger's speed.
   * Back on the tray the list starts again from its first player, so the next time it opens it
   * opens at the top, as the tray's faces do.
   */
  const goTo = (toTall: boolean, velocity: number) => {
    'worklet';
    if (stop.value !== (toTall ? 1 : 0)) runOnJS(settle)(toTall);
    stop.value = toTall ? 1 : 0;
    h.value = withSpring(toTall ? topV.value : floorV.value, { ...SETTLE, velocity });
    if (!toTall && listedV.value && listY.value > 0) scrollTo(listRef, 0, 0, true);
  };
  /** A finger takes it, wherever it is right now (mid-spring included). */
  const begin = () => {
    'worklet';
    held.value = true;
    cancelAnimation(h);
    cancelAnimation(y);
    from.value = (listedV.value ? h.value : 0) - y.value;
  };
  /** Follows the finger: up grows it as far as the full list; down shrinks it to the tray, and below that the whole sheet comes down. */
  const follow = (dy: number) => {
    'worklet';
    const want = from.value - dy;
    const f = floorV.value;
    const t = topV.value;
    if (want >= f) {
      y.value = 0;
      if (listedV.value) h.value = want > t ? t + (want - t) * GIVE : want;
    } else {
      if (listedV.value) h.value = f;
      y.value = f - want;
    }
  };
  /** Let go: closed if pulled well below the tray (or flicked down there), else to whichever height the flick carries it nearer. */
  const release = (vy: number) => {
    'worklet';
    held.value = false;
    if (y.value > CLOSE_PAST || (y.value > 0 && vy > FLICK)) {
      sheetFling.value = 1;
      runOnJS(close)();
      return;
    }
    y.value = withSpring(0, SETTLE);
    if (!listedV.value) return;
    const f = floorV.value;
    const t = topV.value;
    // Nothing more to show: the little it gave springs back.
    if (t <= f + 1) { h.value = withSpring(f, SETTLE); return; }
    goTo(h.value - vy * 0.2 > (f + t) / 2, -vy);
  };
  // The title: a drag up or down, on a phone and in a browser alike. Made once, never under a finger.
  const headGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => { 'worklet'; begin(); })
    .onUpdate((e) => { 'worklet'; follow(e.translationY); })
    .onEnd((e) => { 'worklet'; release(e.velocityY); }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The faces, on a phone: sideways is the row's own scroll; up or down drags the tray (up to the list, down to close).
  const stripGesture = useMemo(() => {
    if (WEB) return null;
    const native = Gesture.Native();
    const pull = Gesture.Pan()
      .manualActivation(true)
      .simultaneousWithExternalGesture(native)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (t) touch.value = { x: t.absoluteX, y: t.absoluteY };
      })
      .onTouchesMove((e, manager) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dy = Math.abs(t.absoluteY - touch.value.y);
        const dx = Math.abs(t.absoluteX - touch.value.x);
        if (dx >= 10 && dx > dy) manager.fail();
        else if (dy > 8 && dy > dx) manager.activate();
      })
      .onStart(() => { 'worklet'; begin(); })
      .onUpdate((e) => { 'worklet'; follow(e.translationY); })
      .onEnd((e) => { 'worklet'; release(e.velocityY); });
    return Gesture.Simultaneous(native, pull);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The full list itself, on a phone: a drag down with the list at its first player brings it back to the tray
  // (and on down, closes it); anything else is the list's own scroll.
  const listGesture = useMemo(() => {
    if (WEB) return null;
    const native = Gesture.Native();
    const pull = Gesture.Pan()
      .manualActivation(true)
      .simultaneousWithExternalGesture(native)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (t) touch.value = { x: t.absoluteX, y: t.absoluteY };
      })
      .onTouchesMove((e, manager) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dy = t.absoluteY - touch.value.y;
        const dx = Math.abs(t.absoluteX - touch.value.x);
        if (dx >= 12) manager.fail();
        else if (listY.value <= 0 && dy > 6) manager.activate();
        else if (Math.abs(dy) > 6) manager.fail();
      })
      .onStart(() => { 'worklet'; begin(); })
      .onUpdate((e) => {
        'worklet';
        follow(e.translationY);
        scrollTo(listRef, 0, 0, false);
      })
      .onEnd((e) => { 'worklet'; release(e.velocityY); });
    return Gesture.Simultaneous(native, pull);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { listY.value = e.contentOffset.y; },
  });

  /** A tap on the handle: the full list, or back to the tray (on the animation thread, where the list can be scrolled back to its top). */
  const toggle = useCallback(() => {
    if (topV.value <= floorV.value + 1) return;
    runOnUI(goTo)(stop.value !== 1, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** See all: up to the full list. */
  const expand = useCallback(() => {
    if (topV.value <= floorV.value + 1 || stop.value === 1) return;
    runOnUI(goTo)(true, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // In a browser: a finger up or down on the faces drags the tray as the title does (sideways stays
  // the row's own scroll), and a wheel or a trackpad scrolled down over them opens the full list.
  const body = useRef<View>(null);
  const live = useRef({ up, canTall });
  live.current = { up, canTall };
  const draggedAt = useRef(0);
  useEffect(() => {
    if (!WEB || !listed) return undefined;
    const el = body.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return undefined;
    let sx = 0;
    let sy = 0;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;
    // Undecided, the row's own (sideways), or the tray's (up and down).
    let mode: 'new' | 'row' | 'tray' = 'new';
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1 || live.current.up) { mode = 'row'; return; }
      sx = t.clientX; sy = t.clientY; lastY = sy; lastT = e.timeStamp; vy = 0;
      mode = 'new';
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || mode === 'row') return;
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (mode === 'new') {
        if (Math.abs(dx) >= 10 && Math.abs(dx) > Math.abs(dy)) { mode = 'row'; return; }
        if (Math.abs(dy) <= 8 || Math.abs(dy) <= Math.abs(dx)) return;
        mode = 'tray';
        begin();
      }
      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - lastT);
      vy = ((t.clientY - lastY) / dt) * 1000;
      lastY = t.clientY;
      lastT = e.timeStamp;
      follow(dy);
      draggedAt.current = Date.now();
    };
    const onEnd = () => {
      if (mode === 'tray') { release(vy); draggedAt.current = Date.now(); }
      mode = 'new';
    };
    const onWheel = (e: WheelEvent) => {
      if (live.current.up || !live.current.canTall) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || e.deltaY < 4) return;
      e.preventDefault();
      goTo(true, 0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [listed]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The tap that ends a drag on the faces (a browser only) opens nobody's card. */
  const justDragged = useCallback(() => Date.now() - draggedAt.current < DRAG_HUSH_MS, []);

  // The map left above it, for the buttons riding on it (an empty tray's few words leave plenty).
  useAnimatedReaction(() => baseV.value - (listedV.value ? h.value : 0) + y.value, (room) => { listHeadroom.value = room; });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const bodyStyle = useAnimatedStyle(() => ({ height: h.value }));
  // The faces fade over the first part of the way up; the rows come in over the rest. (Each reads the
  // shared values itself: a style only follows the ones its own function names.)
  const stripStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, along(h.value, floorV.value, topV.value, stop.value === 1) / 0.45) }));
  const listStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, (along(h.value, floorV.value, topV.value, stop.value === 1) - 0.3) / 0.5)) }));
  const onContentSizeChange = useCallback((_w: number, ch: number) => setContentH(Math.round(ch)), []);
  const onStripSize = useCallback((_w: number, sh: number) => { if (sh > 0) setTrayH(Math.round(sh)); }, []);
  const onSheetLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)), []);

  return {
    up,
    canTall,
    toggle,
    expand,
    headGesture,
    stripGesture,
    listGesture,
    listRef,
    onScroll,
    onContentSizeChange,
    onStripSize,
    onSheetLayout,
    body,
    justDragged,
    sheetStyle,
    bodyStyle,
    stripStyle,
    listStyle,
  };
}
