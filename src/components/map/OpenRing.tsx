import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);

/** The same measurements as a pin's on the map (markers.ts): a gap, then the green ring. */
const GAP = 3;
const RING = 2.5;
/** One full cycle: a short, soft breath out from the face, then a rest before the next. */
const BEAT = 5000;
/** The share of the cycle the breath takes; the rest of it is still. */
const BREATH = 0.44;
/** How far the halo grows past the face, and how strong it starts. Kept small so it reads as alive, not busy. */
const REACH = 0.35;
const GLOW = 0.3;

/**
 * A face wearing the Open to hit look, the same one the map's pins wear:
 * a green ring round it, a gap of the card between, and a soft halo that
 * breathes out from it. Switched on, the ring draws itself round the face
 * and the face gives one small pop; off, the ring unwinds and a quiet
 * hairline takes its place (`hairline`). Reduce Motion: the ring fades in
 * and the halo holds still.
 *
 * On the phone this runs on the animation thread; the browser's twin
 * (OpenRing.web) does the same with the browser's own animations, like the
 * map's pins, so nothing ticks on the page's main thread while a card is up.
 */
export function OpenRing({ open, size, hairline = false, children }: { open: boolean; /** The face's own size. */ size: number; /** Off, a faint ring stays, so the face still reads as a place to look (your own card). */ hairline?: boolean; children: React.ReactNode }) {
  useTheme();
  const reduce = useReducedMotion();
  const box = size + GAP * 2 + RING * 2 + 2;
  const r = size / 2 + GAP + RING / 2;
  const lap = 2 * Math.PI * r;
  // 0 off, 1 on; the pulse's own clock; the face's pop.
  const on = useSharedValue(open ? 1 : 0);
  const beat = useSharedValue(0);
  const pop = useSharedValue(1);
  // What it was last time, so only a real change plays (not its first appearance, nor a second run of the same effect).
  const prev = useRef(open);

  useEffect(() => {
    const changed = prev.current !== open;
    prev.current = open;
    // Already open when it appears (someone else's card): drawn, no show.
    if (!changed) { on.value = open ? 1 : 0; }
    else if (reduce) on.value = withTiming(open ? 1 : 0, { duration: 260 });
    else {
      on.value = open
        ? withTiming(1, { duration: 750, easing: Easing.bezier(0.65, 0, 0.35, 1) })
        : withTiming(0, { duration: 420, easing: Easing.bezier(0.4, 0, 0.2, 1) });
      if (open) pop.value = withSequence(withTiming(1.08, { duration: 170, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 220 }));
    }
    if (open && !reduce) beat.value = withRepeat(withTiming(1, { duration: BEAT, easing: Easing.linear }), -1, false);
    else cancelAnimation(beat);
  }, [open, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = useAnimatedProps(() => (reduce
    // Reduce Motion: the whole ring fades in and out, never drawn round.
    ? { strokeDashoffset: 0, strokeOpacity: on.value }
    : {
      strokeDashoffset: lap * (1 - on.value),
      // Gone the instant it has unwound, so its rounded end never lingers as a dot.
      strokeOpacity: Math.min(1, on.value * 8),
    }), [reduce, lap]);
  const line = useAnimatedStyle(() => ({ opacity: 1 - on.value }));
  const halo = useAnimatedStyle(() => {
    if (reduce) return { opacity: 0.2 * on.value, transform: [{ scale: 1.3 }] };
    // The breath runs over the first part of the cycle, easing out; then the halo rests unseen.
    const p = Math.min(1, beat.value / BREATH);
    const t = 1 - (1 - p) * (1 - p) * (1 - p);
    return { opacity: on.value * GLOW * (1 - p), transform: [{ scale: 1 + REACH * t }] };
  });
  const face = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const inner = size + GAP * 2;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: inner, height: inner, borderRadius: inner / 2, backgroundColor: colors.open }, halo]} />
      {hairline ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: box - 2, height: box - 2, borderRadius: box / 2, borderWidth: 1.5, borderColor: colors.borderStrong }, line]} /> : null}
      <Svg pointerEvents="none" width={box} height={box} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <ACircle cx={box / 2} cy={box / 2} r={r} fill="none" stroke={colors.open} strokeWidth={RING} strokeLinecap="round" strokeDasharray={`${lap} ${lap}`} animatedProps={ring} />
      </Svg>
      <Animated.View style={face}>{children}</Animated.View>
    </View>
  );
}
