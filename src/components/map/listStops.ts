import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import type Animated from 'react-native-reanimated';
import { cancelAnimation, makeMutable, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { sheetFling } from '@/components/map/sheetFling';

/*
 * The full map's players list at two heights (Oct 8, owner: "This show
 * players pop up covers too much of the screen"). It opens low, at its peek:
 * three and a half rows, so the half row says there is more, with the map
 * and its pins in plain view above. Pulled up by its handle (or on a phone by
 * the list itself, the way Apple Maps' list does) it rises to tall, stopping
 * under the search and the filters, which still work while it is up. Pulled
 * back down it returns to the peek, and from there on down it closes, as the
 * map's cards always have.
 *
 * The list's height is its scroll view's maxHeight, moved on the animation
 * thread, so a short list is only ever as tall as its rows, whatever the
 * stop. Below the peek the whole sheet follows the finger down instead
 * (translateY), and let go far enough it closes, carried on at the finger's
 * speed (sheetFling) like every map card.
 *
 * A browser cannot hand a scroll over to the sheet, so there a scroll at the
 * peek lifts the list to tall, and the handle brings it back down.
 */

/** One player's row: a contacts list's height, a 40-point face beside a name and the line under it. */
export const LIST_ROW_H = 60;
/** The list's title strip, grabber to the foot of its one line (MapChrome's listHead), which each height leaves room for. */
export const LIST_HEAD_H = 52;
/** At first: three and a half rows. */
const PEEK_ROWS = 3.5;
/** ...and never more than this much of the screen, the strip under the home indicator included. */
const PEEK_MAX = 0.4;
/** Pulled up, at most this much, and always clear of the search and the filters above. */
const TALL_MAX = 0.85;
/** Settling on either height: the map cards' own spring (CardStage), quick and never past the stop. */
const SETTLE = { damping: 30, stiffness: 300, mass: 1, overshootClamping: true } as const;
/** Pulled this far below the peek, or flicked down once below it, it closes. */
const CLOSE_PAST = 60;
const FLICK = 600;
/** Past the tall height it gives a little, a fifth of the finger's travel, and springs back. */
const GIVE = 0.2;
const WEB = Platform.OS === 'web';

/**
 * How much map is left between the foot of the filters and the list's top,
 * as it moves. The map's buttons riding on the list (MapChrome's ListCrown)
 * fade out as it runs short and are gone once they would no longer fit, so
 * nothing ever lies over the list or the filters; a short list that rises
 * only a little keeps them.
 */
export const listHeadroom = makeMutable(10000);

/** Where the list may reach: the map's own height, how far down the search and filters run, and the strip under the home indicator. */
export interface ListRoom {
  height: number;
  top: number;
  foot: number;
}

export function useListStops({ rows, room, windowH, openTall, onTall, onClose }: {
  /** How many players are listed; none is an empty state, which has no list to raise. */
  rows: number;
  room?: ListRoom;
  windowH: number;
  /** Opens tall: it was tall when a row opened a player's card, and that card has closed. */
  openTall: boolean;
  /** Which height it is going to, each time that changes: tall, or the peek. */
  onTall?: (tall: boolean) => void;
  onClose: () => void;
}) {
  const H = room?.height || windowH;
  const foot = room?.foot ?? 0;
  const peekList = Math.max(Math.round(LIST_ROW_H * 1.5), Math.min(Math.round(LIST_ROW_H * PEEK_ROWS), Math.round(H * PEEK_MAX) - foot - LIST_HEAD_H));
  // Tall, its top meets the foot of the filters' row (the row's own padding is the gap), so the city chip under them is covered whole.
  const tallTotal = Math.min(Math.round(H * TALL_MAX), room?.top ? H - room.top : H);
  const tallList = Math.max(peekList, tallTotal - foot - LIST_HEAD_H);
  const [contentH, setContentH] = useState(0);
  const listed = rows > 0;
  const canTall = listed && contentH > peekList + 1;
  // Its two heights, as heights of the list: a short list's both are just its rows.
  const floor = listed ? (contentH ? Math.min(peekList, contentH) : peekList) : 0;
  const top = canTall ? Math.min(tallList, contentH) : floor;
  // Which height it is at or going to: the list scrolls only once it is tall (on a phone).
  const [up, setUp] = useState(openTall);
  // With VoiceOver or TalkBack on, the list scrolls at the peek too, so every player can be reached by swiping through it.
  const reader = useScreenReader();

  const max = useSharedValue(openTall ? tallList : peekList);
  const y = useSharedValue(0);
  const floorV = useSharedValue(floor);
  const topV = useSharedValue(top);
  const contentV = useSharedValue(contentH);
  const listedV = useSharedValue(listed);
  const stop = useSharedValue(openTall ? 1 : 0);
  const from = useSharedValue(0);
  const held = useSharedValue(false);
  const listY = useSharedValue(0);
  const touch = useSharedValue({ x: 0, y: 0 });
  const listRef = useAnimatedRef<Animated.ScrollView>();
  // The list's top, as a list height of 0 would put it, measured from the foot of the filters: the headroom, before the list takes its share.
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
    contentV.value = contentH;
    listedV.value = listed;
    baseV.value = base;
    if (held.value) return;
    // Nothing left to rise for (a search or a filter narrowed it, or nobody is listed): back to the peek.
    if (stop.value === 1 && (!listed || (contentH > 0 && !canTall))) {
      stop.value = 0;
      settle(false);
    }
    if (!listed || !contentH) return;
    max.value = withSpring(stop.value === 1 ? top : floor, SETTLE);
  }, [floor, top, contentH, listed, canTall, base]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Where it is going, tall or the peek: there on the spring, picking up the finger's speed.
   * Back at the peek the list starts again from its first player. A phone holds the list
   * still there, so one left halfway down could be neither scrolled nor pulled up by
   * itself, and a browser would take a scroll back up it for a pull up (Oct 9, review).
   */
  const goTo = (toTall: boolean, velocity: number) => {
    'worklet';
    if (stop.value !== (toTall ? 1 : 0)) runOnJS(settle)(toTall);
    stop.value = toTall ? 1 : 0;
    max.value = withSpring(toTall ? topV.value : floorV.value, { ...SETTLE, velocity });
    if (!toTall && listedV.value && listY.value > 0) scrollTo(listRef, 0, 0, true);
  };
  /** A finger takes it, wherever it is right now (mid-spring included). */
  const begin = () => {
    'worklet';
    held.value = true;
    cancelAnimation(max);
    cancelAnimation(y);
    const c = contentV.value;
    const shown = listedV.value ? (c > 0 ? Math.min(max.value, c) : max.value) : 0;
    from.value = shown - y.value;
  };
  /** Follows the finger: up grows the list as far as tall; down shrinks it to the peek, and below that the whole sheet comes down. */
  const follow = (dy: number) => {
    'worklet';
    const want = from.value - dy;
    const f = floorV.value;
    const t = topV.value;
    if (want >= f) {
      y.value = 0;
      if (listedV.value) max.value = want > t ? t + (want - t) * GIVE : want;
    } else {
      if (listedV.value) max.value = f;
      y.value = f - want;
    }
  };
  /** Let go: closed if pulled well below the peek (or flicked down there), else to whichever height the flick carries it nearer. */
  const release = (vy: number) => {
    'worklet';
    held.value = false;
    if (y.value > CLOSE_PAST || (y.value > 0 && vy > FLICK)) {
      sheetFling.value = 1;
      runOnJS(close)();
      return;
    }
    y.value = withSpring(0, SETTLE);
    const f = floorV.value;
    const t = topV.value;
    if (!listedV.value || t <= f + 1) return;
    const c = contentV.value;
    const shown = c > 0 ? Math.min(max.value, c) : max.value;
    goTo(shown - vy * 0.2 > (f + t) / 2, -vy);
  };

  // The handle and the title: a drag up or down, on a phone and in a browser alike. Made once, never under a finger.
  const headGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onStart(() => { 'worklet'; begin(); })
    .onUpdate((e) => { 'worklet'; follow(e.translationY); })
    .onEnd((e) => { 'worklet'; release(e.velocityY); }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The list itself, on a phone: a drag up at the peek raises it (the list held still until it is tall), and
  // a drag down with the list at its top brings the sheet down; anything else is the list's own scroll.
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
        const rises = stop.value === 0 && topV.value > floorV.value + 1;
        if (dx >= 12) manager.fail();
        else if (listY.value <= 0 && (dy > 6 || (dy < -6 && rises))) manager.activate();
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
    onScroll: (e) => {
      const was = listY.value;
      listY.value = e.contentOffset.y;
      // In a browser, scrolling down the list at its peek (a wheel, a finger) raises it to tall;
      // the list going back up to its first player (as it does on the way down to the peek) never does.
      if (WEB && stop.value === 0 && !held.value && topV.value > floorV.value + 1 && e.contentOffset.y > 2 && e.contentOffset.y > was) goTo(true, 0);
    },
  });

  /** A tap on the handle: tall, or back to the peek (on the animation thread, where the list can be scrolled back to its top). */
  const toggle = useCallback(() => {
    if (topV.value <= floorV.value + 1) return;
    runOnUI(goTo)(stop.value !== 1, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The map left above it, for the buttons riding on it (an empty list's few words leave plenty).
  useAnimatedReaction(() => {
    const c = contentV.value;
    const shown = listedV.value ? (c > 0 ? Math.min(max.value, c) : max.value) : 0;
    return baseV.value - shown + y.value;
  }, (room) => { listHeadroom.value = room; });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const listStyle = useAnimatedStyle(() => ({ maxHeight: max.value }));
  const onContentSizeChange = useCallback((_w: number, h: number) => setContentH(Math.round(h)), []);

  return {
    up,
    canTall,
    toggle,
    headGesture,
    listGesture,
    listRef,
    onScroll,
    onContentSizeChange,
    sheetStyle,
    listStyle,
    // On a phone the list holds still at the peek, so a drag on it raises it; a browser scrolls it there to raise it.
    scrollEnabled: WEB || up || !canTall || reader,
  };
}

/** Whether VoiceOver or TalkBack is on (never in a browser, where the list always scrolls). */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (WEB) return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled().then((now) => { if (live) setOn(now); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}
