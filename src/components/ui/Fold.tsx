import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';

/** The app's ease-out for things settling into place (the same curve as Collapse). */
const CURVE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** Far taller than anything a fold holds: "no limit" while it is at rest. */
const NO_LIMIT = 100000;

/**
 * Something that comes and goes inside a page (a reply box, a folded reply,
 * more cards under "Further away"), opening and closing with a real height
 * change and a fade, so everything under it glides instead of jumping
 * (Oct 22 sweep: "nothing pops/frames in or out").
 *
 * Its contents are built only while open (and while closing), in the page's
 * own flow: at rest it is an ordinary box, so a reply box that grows as you
 * type, or a list that changes, simply grows. Only an open or a close moves.
 * Already open when first drawn: simply there, no animation (a page opens
 * exactly as before). `appear` makes even the first showing unfold (a row
 * added after the page was drawn).
 *
 * `gap`: the parent's flex gap, when it has one. A closed fold takes its gap
 * with it as it shuts, so nothing jumps by that gap at the end, and one with
 * nothing in it takes no gap at all.
 *
 * Never put it round anything glass: it fades its contents (Oct 17 rule).
 * With Reduce Motion on, a plain fade.
 */
export function Fold({ open, children, appear = false, gap = 0, duration = 240, style, onClosed }: {
  open: boolean;
  children: React.ReactNode;
  appear?: boolean;
  gap?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  /** Called once it has folded shut and taken its contents down. */
  onClosed?: () => void;
}) {
  const still = useReducedMotion();
  const animateFirst = appear && open;
  const [mounted, setMounted] = useState(open);
  // The first draw of an opening: its contents are built in this very draw (so a parent can reach
  // them straight away), held at no height until the unfold takes over.
  const opening = open && !mounted;
  // Clipped only while it moves: at rest, shadows on cards inside it (a hit card's lift) show whole.
  const [busy, setBusy] = useState(animateFirst);
  // 1 while it opens or closes: its height follows the fold; 0 at rest: its own height.
  const moving = useSharedValue(animateFirst ? 1 : 0);
  const progress = useSharedValue(open && !animateFirst ? 1 : 0);
  // Its contents' own height; -1 until first measured.
  const height = useSharedValue(-1);
  // Opening, built but not yet measured: the unfold starts on the first measure.
  const waiting = useRef(animateFirst);
  const first = useRef(true);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;

  const settle = useCallback((opened: boolean) => {
    setBusy(false);
    if (!opened) { setMounted(false); closedRef.current?.(); }
  }, []);
  const run = useCallback((to: 0 | 1) => {
    setBusy(true);
    moving.value = 1;
    const ms = still ? 160 : to ? duration : Math.max(140, duration - 50);
    progress.value = withTiming(to, { duration: ms, easing: CURVE }, (done) => {
      if (!done) return;
      // Open: back to its own height. Shut: it stays at none until it is taken down.
      if (to === 1) moving.value = 0;
      runOnJS(settle)(to === 1);
    });
  }, [duration, moving, progress, settle, still]);

  // Before the screen is drawn, so the opening's first frame is already at no height.
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    if (open) {
      // Opened again as it folded shut: it unfolds from where it is (or still waits for its height).
      if (mounted) { if (!waiting.current) run(1); return; }
      // Built now, at no height; the unfold starts once its height is known (onLayout).
      progress.value = 0;
      moving.value = 1;
      waiting.current = true;
      setBusy(true);
      setMounted(true);
    } else if (mounted) {
      if (waiting.current) { waiting.current = false; settle(false); return; }
      run(0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastHeight = useRef(-1);
  const onLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    lastHeight.current = e.nativeEvent.layout.height;
    height.value = e.nativeEvent.layout.height;
    if (waiting.current) { waiting.current = false; run(1); }
  }, [height, run]);

  const animated = useAnimatedStyle(() => {
    const p = opening ? 0 : progress.value;
    return {
      opacity: p,
      // With Reduce Motion on, only the fade: the height changes at once.
      maxHeight: (opening || moving.value) && !still ? Math.max(0, height.value) * p : NO_LIMIT,
      // Shutting, it takes its gap with it; empty (nothing to show), it takes none at all.
      marginTop: !gap ? 0 : height.value === 0 ? -gap : -gap * (1 - p),
    };
  }, [opening, still, gap]);

  // What it showed while open, kept as it folds shut (the list that emptied, the box that was cancelled).
  const lastShown = useRef(children);
  if (open) lastShown.current = children;
  if (!mounted && !open) return null;
  // Open and still, on a phone: its open look is said by a plain style as well, so a phone that drops
  // the settled animation values (Reanimated keeps the first frame's: shut and clear) can never fold
  // an open box away on a later re-render.
  const resting = Platform.OS !== 'web' && open && mounted && !busy && !opening;
  return (
    <Animated.View
      style={[(busy || opening) && { overflow: 'hidden' }, style, animated, resting && { opacity: 1, maxHeight: NO_LIMIT, marginTop: gap && lastHeight.current === 0 ? -gap : 0 }]}
      pointerEvents={open ? 'box-none' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View onLayout={onLayout} collapsable={false}>{open ? children : lastShown.current}</View>
    </Animated.View>
  );
}

/**
 * A list whose rows fold in when they are added and fold out when they go
 * (a hit called off, a recent search removed), so the rows under them glide
 * up rather than jumping. The rows there when the list is first drawn are
 * simply there. A row that goes is kept, folding shut, where it was.
 */
export function FoldList<T>({ items, keyOf, render, gap = 0, duration }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  render: (item: T, index: number) => React.ReactNode;
  gap?: number;
  duration?: number;
}) {
  const [leaving, setLeaving] = useState<Map<string, { item: T; at: number }>>(() => new Map());
  // The rows the last drawn list had, in order (kept after each draw, never during one).
  const shown = useRef<{ key: string; item: T }[]>([]);
  const drawn = useRef(false);
  const now = items.map((item) => ({ key: keyOf(item), item }));
  const nowKeys = new Set(now.map((x) => x.key));
  // Rows shown last time and gone now, plus those already folding shut: kept where they were.
  const pending = new Map(leaving);
  shown.current.forEach((x, at) => { if (!nowKeys.has(x.key) && !pending.has(x.key)) pending.set(x.key, { item: x.item, at }); });
  const merged: { key: string; item: T; going: boolean }[] = now.map((x) => ({ ...x, going: false }));
  // (A row that came back while it was folding shut is simply a row again.)
  [...pending.entries()]
    .filter(([key]) => !nowKeys.has(key))
    .sort((a, b) => a[1].at - b[1].at)
    .forEach(([key, { item, at }]) => merged.splice(Math.min(at, merged.length), 0, { key, item, going: true }));
  const goingKey = merged.filter((x) => x.going).map((x) => x.key).join('|');
  useEffect(() => {
    // Only the rows really there: those folding shut are tracked by `leaving` until they are gone.
    shown.current = merged.flatMap(({ key, item, going }) => (going ? [] : [{ key, item }]));
    drawn.current = true;
  });
  useEffect(() => {
    setLeaving((m) => {
      const next = new Map<string, { item: T; at: number }>();
      merged.forEach((x, at) => { if (x.going) next.set(x.key, m.get(x.key) ?? { item: x.item, at }); });
      return next.size === m.size && [...next.keys()].every((k) => m.has(k)) ? m : next;
    });
  }, [goingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const drop = useCallback((key: string) => setLeaving((m) => { if (!m.has(key)) return m; const next = new Map(m); next.delete(key); return next; }), []);
  return (
    <>
      {merged.map(({ key, item, going }, index) => (
        <Fold key={key} open={!going} appear={drawn.current} gap={gap} duration={duration} onClosed={() => drop(key)}>
          {render(item, index)}
        </Fold>
      ))}
    </>
  );
}

/**
 * A small menu that grows out of the button that opened it and shrinks back
 * into it (Discussions' Sort, Oct 22 sweep, item 12): a fade with a slight
 * scale from `origin`, quick both ways, instead of popping in and out. Kept
 * built while it closes. With Reduce Motion on, a plain fade.
 */
export function Pop({ open, children, style, origin = 'top right' }: {
  open: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  origin?: string;
}) {
  const still = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  // Open and still: see `resting` below.
  const [rested, setRested] = useState(false);
  const lastShown = useRef(children);
  if (open) lastShown.current = children;
  const gone = useCallback(() => setMounted(false), []);
  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.value = withTiming(1, { duration: 200, easing: CURVE }, (done) => { if (done) runOnJS(setRested)(true); });
    } else {
      setRested(false);
      progress.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(gone)(); });
    }
  }, [open, progress, gone]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: still ? 1 : 0.92 + 0.08 * progress.value }, { translateY: still ? 0 : -4 * (1 - progress.value) }],
  }));
  if (!mounted && !open) return null;
  // Open and still, on a phone: its open look is said by a plain style as well (as Fold's), so a dropped
  // settled animation value can never leave an open menu invisible on a later re-render.
  const resting = Platform.OS !== 'web' && open && rested;
  return (
    <Animated.View style={[style, { transformOrigin: origin } as ViewStyle, animated, resting && POP_REST]} pointerEvents={open ? 'auto' : 'none'}>
      {open ? children : lastShown.current}
    </Animated.View>
  );
}

const POP_REST = { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] };
