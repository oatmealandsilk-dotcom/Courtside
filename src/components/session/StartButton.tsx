import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { BrandWash } from '@/components/ui';
import { clockText, useLiveNow } from '@/features/activity/liveSession';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, withAlpha } from '@/theme';

const ACircle = Animated.createAnimatedComponent(Circle);

/** The round Start, and the ring around it that closes as it starts (a record button's). */
export const START_SIZE = 88;
export const RING_SIZE = 116;
const STROKE = 3;
const MID = RING_SIZE / 2;
const R = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;
/** How long the ring takes to close: one smooth sweep, quick off the mark. */
const SWEEP_MS = 520;
/** From the ring closing (and the start confirmed) to handing over to the live page. */
const LEAVE_MS = 220;
/** Longest the closed ring waits on a slow check-in before handing over anyway (the clock is already running). */
const HOLD_MAX_MS = 4000;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
const SWEEP_EASE = Easing.bezier(0.4, 0, 0.15, 1);

export type StartPhase = 'idle' | 'starting' | 'held' | 'started';

/**
 * Start, pressed like a record button (Oct 7, owner: "The start button should
 * have a better animation. Instead of loading circle"): it gives under the
 * thumb, the faint ring around it sweeps closed in the court's colour, and
 * the word Start rolls up into the clock, already running from the tap. Once
 * the ring has closed and the start is confirmed, a soft beat on the phone,
 * a wave leaves the closed ring, and `onStarted` hands over to the live
 * page, whose clock carries on from the same moment. Should the start still
 * be on its way when the ring closes (a slow check-in), it holds there,
 * breathing like the live dot, never a spinner. Should it fail, the ring
 * unwinds and Start comes back. No countdown: players are already on court.
 * Reduce Motion: no squeeze, sweep or wave; the ring and the clock
 * fade in, and it hands over a moment later.
 */
export function StartButton({ onStart, onStarted, onPhase, label = 'Start' }: {
  /** Starts the session the moment Start is tapped: true once it is going, false if it could not start. */
  onStart: () => Promise<boolean>;
  /** The ring has closed and the session is going: time for the live page. */
  onStarted: () => void;
  /** Each change of phase, for the page around it (it stops taking taps once Start is pressed). */
  onPhase?: (phase: StartPhase) => void;
  label?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<StartPhase>('idle');
  // When Start was tapped: the clock in the button runs from here, as the live page's does from the session's start.
  const [t0, setT0] = useState(0);
  const now = useLiveNow(phase !== 'idle');
  const press = useSharedValue(1);
  const sweep = useSharedValue(0);
  const swap = useSharedValue(0);
  const pulse = useSharedValue(0);
  // `pressed`: Start has been taken, from the tap until it starts or unwinds (a second tap before the page draws again is ignored).
  const run = useRef({ pressed: false, swept: false, result: undefined as boolean | undefined, done: false, timers: [] as ReturnType<typeof setTimeout>[] });
  useEffect(() => () => { run.current.timers.forEach(clearTimeout); }, []);
  const later = (fn: () => void, ms: number) => { run.current.timers.push(setTimeout(fn, ms)); };
  const moveTo = (next: StartPhase) => { setPhase(next); onPhase?.(next); };

  /** The ring is closed and the session going: the beat, the wave, then the live page. */
  const go = () => {
    const r = run.current;
    if (r.done) return;
    r.done = true;
    moveTo('started');
    haptics.reward();
    AccessibilityInfo.announceForAccessibility?.('Session started');
    cancelAnimation(pulse);
    if (!reduced) {
      pulse.value = 0;
      pulse.value = withTiming(1, { duration: 560, easing: EASE_OUT });
      press.value = withSequence(withTiming(1.05, { duration: 120, easing: EASE_OUT }), withSpring(1, { damping: 14, stiffness: 220 }));
    }
    later(onStarted, reduced ? 220 : LEAVE_MS);
  };

  /** It could not start: the ring unwinds and Start comes back. */
  const unwind = () => {
    const r = run.current;
    r.done = true;
    r.pressed = false;
    cancelAnimation(pulse);
    pulse.value = 0;
    sweep.value = withTiming(0, { duration: reduced ? 120 : 320, easing: EASE_OUT });
    swap.value = withTiming(0, { duration: reduced ? 120 : 220, easing: EASE_OUT });
    press.value = withSpring(1, { damping: 15, stiffness: 260 });
    haptics.reject();
    moveTo('idle');
  };

  /** Called when the ring has closed, and again when the start answers: whichever comes second decides. */
  const settle = () => {
    const r = run.current;
    if (r.done || !r.swept) return;
    if (r.result === false) { unwind(); return; }
    if (r.result === true) { go(); return; }
    // Still on its way: hold on the closed ring, breathing like the live dot, and never longer than HOLD_MAX_MS.
    moveTo('held');
    if (!reduced) pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }), -1, false);
    later(() => { if (!run.current.done && run.current.result !== false) go(); }, HOLD_MAX_MS);
  };

  const swept = () => { run.current.swept = true; settle(); };

  const begin = () => {
    const r = run.current;
    if (phase !== 'idle' || r.pressed) return;
    r.pressed = true;
    r.swept = false;
    r.result = undefined;
    r.done = false;
    setT0(Date.now());
    moveTo('starting');
    haptics.commit();
    onStart().then((ok) => { r.result = ok; settle(); }, () => { r.result = false; settle(); });
    if (reduced) {
      swap.value = withTiming(1, { duration: 160 });
      sweep.value = withTiming(1, { duration: 160 }, (finished) => { if (finished) runOnJS(swept)(); });
      return;
    }
    press.value = withSpring(1, { damping: 12, stiffness: 260 });
    swap.value = withTiming(1, { duration: 300, easing: EASE_OUT });
    sweep.value = withTiming(1, { duration: SWEEP_MS, easing: SWEEP_EASE }, (finished) => { if (finished) runOnJS(swept)(); });
  };

  // The thumb going down: the button gives a little, and the ring with it.
  const pressIn = () => { if (phase === 'idle' && !reduced) press.value = withTiming(0.92, { duration: 110, easing: Easing.out(Easing.quad) }); };
  const pressOut = () => { if (phase === 'idle' && !reduced) press.value = withSpring(1, { damping: 15, stiffness: 300 }); };

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - press.value) * 0.35 }] }));
  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: CIRCUMFERENCE * (1 - sweep.value), strokeOpacity: sweep.value > 0.003 ? 1 : 0 }));
  // Start rolls up and out of its window as the clock rolls up into it.
  const startWord = useAnimatedStyle(() => ({ opacity: interpolate(swap.value, [0, 0.4], [1, 0], 'clamp'), transform: [{ translateY: -16 * swap.value }] }));
  const clockWord = useAnimatedStyle(() => ({ opacity: interpolate(swap.value, [0.35, 1], [0, 1], 'clamp'), transform: [{ translateY: 16 * (1 - swap.value) }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value > 0 ? 0.9 * (1 - pulse.value) : 0, transform: [{ scale: 1 + pulse.value * 0.42 }] }));

  const dark = pageIsDark();
  const busy = phase === 'starting' || phase === 'held';
  return (
    <View style={styles.wrap}>
      {/* The wave that leaves the closed ring as the session starts (and, while a slow start is held, breathes from it). */}
      <Animated.View pointerEvents="none" style={[styles.pulse, { borderColor: colors.brand, backgroundColor: withAlpha(colors.brand, dark ? 0.2 : 0.14) }, pulseStyle]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ringStyle]}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle cx={MID} cy={MID} r={R} stroke={withAlpha(colors.brand, dark ? 0.34 : 0.24)} strokeWidth={STROKE} fill="none" />
          <G transform={`rotate(-90 ${MID} ${MID})`}>
            <ACircle
              cx={MID} cy={MID} r={R} fill="none" stroke={colors.brand} strokeWidth={STROKE} strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`} animatedProps={arcProps}
            />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={buttonStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={phase === 'idle' ? 'Start the session' : phase === 'started' ? 'Session started' : 'Starting the session'}
          accessibilityState={{ disabled: phase !== 'idle', busy }}
          disabled={phase !== 'idle'}
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={begin}
          style={[styles.start, { boxShadow: dark ? '0px 10px 24px rgba(0, 0, 0, 0.45)' : `0px 10px 24px ${withAlpha(colors.brand, 0.34)}` }]}
        >
          <BrandWash />
          <View style={styles.window}>
            <Animated.Text style={[styles.word, startWord]} numberOfLines={1}>{label}</Animated.Text>
            <Animated.Text style={[styles.word, styles.clock, clockWord]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
              {clockText(Math.max(0, now - (t0 || now)))}
            </Animated.Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', top: 0, left: 0, width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2, borderWidth: 2 },
  start: { width: START_SIZE, height: START_SIZE, borderRadius: START_SIZE / 2, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  // The words' window: Start and the clock share it, each rolling through it, clipped at its edges like a stopwatch's digits.
  window: { width: START_SIZE - 10, height: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  word: { ...font('600'), fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: colors.brandInk, textAlign: 'center' },
  clock: { position: 'absolute', left: 0, right: 0, top: 1, fontSize: 16, lineHeight: 24, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
});
