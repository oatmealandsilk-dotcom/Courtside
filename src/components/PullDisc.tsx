import { useTheme } from '@/theme/ThemeProvider';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { PULL_DISC, pullProgress } from '@/lib/pullRefresh';
import { colors } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);
// The same ring as CourtSpinner's at this size: a faint track and a bright arc on it.
const STROKE = 2.5;
const R = (PULL_DISC - STROKE) / 2;
const LAP = 2 * Math.PI * R;
// CourtSpinner's own laps: each starts slow and gathers pace, the softer tail on a longer one.
const LEAD_LAP = { duration: 900, easing: Easing.bezier(0.55, 0.05, 0.45, 0.95) };
const TAIL_LAP = { duration: 1300, easing: Easing.inOut(Easing.quad) };
// While pulling, the arc is never quite a whole ring: it closes only at the line.
const DRAWN = 0.92;

/**
 * The disc's moving parts, kept on the animation thread so it moves in the
 * same frame as the page. The scroll handler calls these as the pull goes:
 * `arm` at the line, `disarm` back above it, `start` on letting go past it,
 * `rest` once the page is home.
 */
export interface PullDiscState {
  armed: SharedValue<number>;
  spin: SharedValue<number>;
  lead: SharedValue<number>;
  tail: SharedValue<number>;
  pop: SharedValue<number>;
  arm: () => void;
  disarm: () => void;
  start: () => void;
  rest: () => void;
}

export function usePullDisc(): PullDiscState {
  // 0 to 1: the ring closing at the line.
  const armed = useSharedValue(0);
  // 0 to 1: the hand-over from the drawn ring to the turning spinner.
  const spin = useSharedValue(0);
  const lead = useSharedValue(0);
  const tail = useSharedValue(0);
  const pop = useSharedValue(1);
  return useMemo(() => ({
    armed, spin, lead, tail, pop,
    // The ring closes and gives one small pop, in the frame the line is crossed.
    arm: () => {
      'worklet';
      armed.value = withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) });
      pop.value = withSequence(withTiming(1.12, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(1, { mass: 1, stiffness: 420, damping: 24 }));
    },
    disarm: () => {
      'worklet';
      armed.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) });
    },
    // From the closed ring the arc opens to CourtSpinner's half and starts
    // turning from where it is; the softer tail fades in behind it.
    start: () => {
      'worklet';
      spin.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
      lead.value = 0;
      lead.value = withRepeat(withTiming(360, LEAD_LAP), -1, false);
      tail.value = 0;
      tail.value = withRepeat(withTiming(360, TAIL_LAP), -1, false);
    },
    rest: () => {
      'worklet';
      cancelAnimation(lead);
      cancelAnimation(tail);
      cancelAnimation(spin);
      cancelAnimation(armed);
      cancelAnimation(pop);
      lead.value = 0;
      tail.value = 0;
      spin.value = 0;
      armed.value = 0;
      pop.value = 1;
    },
  }), [armed, spin, lead, tail, pop]);
}

/**
 * The pull-to-refresh disc. While you pull, its arc draws round in step with
 * the pull, so you can see the line coming; at the line it closes with a
 * small pop (and the tick); let go and it becomes the CourtSide spinner,
 * turning until the page is back. `gap` is how open the gap is, in points.
 */
export function PullDisc({ gap, disc, line }: { gap: SharedValue<number>; disc: PullDiscState; line: number }) {
  // Hears a theme change, so the ring takes the new colour.
  useTheme();
  const size = useAnimatedStyle(() => {
    const p = pullProgress(gap.value, line);
    const grow = disc.spin.value > 0 ? 1 : 0.8 + 0.2 * p;
    return { transform: [{ scale: grow * disc.pop.value }] };
  });
  // While pulling the arc starts at the top and winds a little as it grows;
  // once turning, it carries on from there.
  const leadTurn = useAnimatedStyle(() => {
    const p = pullProgress(gap.value, line);
    const deg = disc.spin.value > 0 ? 30 + disc.lead.value : -90 + p * 120;
    return { transform: [{ rotate: `${deg}deg` }] };
  });
  const leadArc = useAnimatedProps(() => {
    const p = pullProgress(gap.value, line);
    const drawn = p * DRAWN + (1 - p * DRAWN) * disc.armed.value;
    const sweep = drawn + (0.5 - drawn) * disc.spin.value;
    return { strokeDashoffset: LAP * (1 - sweep) };
  });
  const tailTurn = useAnimatedStyle(() => ({
    opacity: 0.38 * disc.spin.value,
    transform: [{ rotate: `${150 + disc.tail.value}deg` }],
  }));
  const ink = colors.brand;
  // Always there, mostly unseen, so a screen reader is told nothing about it:
  // otherwise it reads out a "Refreshing" bar on every page.
  return (
    <Animated.View aria-hidden style={[styles.box, size]}>
      <View style={[StyleSheet.absoluteFill, styles.track, { borderColor: ink }]} />
      <Animated.View style={[StyleSheet.absoluteFill, tailTurn]}>
        <Svg width={PULL_DISC} height={PULL_DISC}>
          <Circle cx={PULL_DISC / 2} cy={PULL_DISC / 2} r={R} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={`${LAP} ${LAP}`} strokeDashoffset={LAP / 2} />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, leadTurn]}>
        <Svg width={PULL_DISC} height={PULL_DISC}>
          <ACircle cx={PULL_DISC / 2} cy={PULL_DISC / 2} r={R} stroke={ink} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={`${LAP} ${LAP}`} animatedProps={leadArc} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: { width: PULL_DISC, height: PULL_DISC },
  track: { borderRadius: PULL_DISC / 2, borderWidth: STROKE, opacity: 0.14 },
});
