import React, { useCallback, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/lib/useReducedMotion';
import { SHEET_SPRING } from '@/theme/motion';

/*
 * A box that glides to its new height instead of jumping (Oct 22 sweep: the
 * map's search list, the players tray's "No players" box, a card growing as
 * its facts load). The box holds a fixed height; what is inside lays out at
 * its own height (`onLayout` on the inner view), and the box then moves to
 * it, so nothing ever jumps for a frame first.
 *
 * - `shrink`: also glide down. Off for a card flush with the bottom edge,
 *   where a shrinking box would lift it off the edge for the length of the
 *   glide (it settles at once instead).
 * - `seed`: the height it starts at, when it takes over from something else
 *   that was showing (the tray's faces): it glides from there to its own.
 * - `pad`: added to the content's height (the box's own borders).
 * - `spring`: the sheets' spring (a card) rather than the quick ease (a list).
 *
 * Reduce Motion: it settles at once.
 */
const EASE = { duration: 220, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
const SPRING = { ...SHEET_SPRING, overshootClamping: true } as const;

export function useGlideHeight({ shrink = true, seed = 0, spring = false, pad = 0 }: { shrink?: boolean; seed?: number; spring?: boolean; pad?: number } = {}) {
  const reduce = useReducedMotion();
  // -1: not measured yet, so the box takes its content's own height.
  const h = useSharedValue(seed > 0 ? seed : -1);
  const target = useRef(seed > 0 ? seed : 0);
  const style = useAnimatedStyle(() => (h.value < 0 ? {} : { height: h.value }));
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const inner = e.nativeEvent.layout.height;
    if (inner <= 0) return;
    const next = Math.round((inner + pad) * 2) / 2;
    if (next === target.current) return;
    const first = target.current === 0;
    target.current = next;
    if (first && h.value < 0) { h.value = next; return; }
    if (reduce || (!shrink && next < h.value)) { cancelAnimation(h); h.value = next; return; }
    h.value = spring ? withSpring(next, SPRING) : withTiming(next, EASE);
  }, [reduce, shrink, spring, pad]); // eslint-disable-line react-hooks/exhaustive-deps
  return { style, onLayout, height: h };
}

/**
 * A map card growing as what it shows comes in ("Played here", the hits, the
 * court's facts: Oct 22 sweep, item 14): it rises the rest of the way on the
 * sheets' spring rather than in jumps, the map's buttons on top riding with
 * it. Its new part waits just under the bottom edge (the card keeps its old
 * height until it moves), so nothing shows a gap. Shrinking, it settles at
 * once: a card flush with the edge never lifts off it.
 */
export function CardGlide({ on, children }: { on: boolean; children: React.ReactNode }) {
  const glide = useGlideHeight({ shrink: false, spring: true });
  if (!on) return <>{children}</>;
  return (
    <Animated.View style={[glideStyles.through, glide.style]}>
      <View style={glideStyles.through} onLayout={glide.onLayout}>{children}</View>
    </Animated.View>
  );
}

/** Which of the map's bottom layers glide as they grow: every card, but not the players list (its height follows the finger: listStops). */
export const glides = (layer: { kind: string; key: string }) => layer.kind === 'card' && layer.key !== 'list';

// Taps pass through to the map wherever the card is not (a compiled style: the browser ignores an inline pointerEvents).
const glideStyles = StyleSheet.create({ through: { pointerEvents: 'box-none' } });
