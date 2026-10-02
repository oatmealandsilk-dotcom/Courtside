import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolateColor, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import * as haptics from '@/lib/haptics';
import { KNOB_COLOR, KNOB_SHADOW, TOGGLE, TRAVEL, trackOff, trackOn } from './toggleLook';

const { W, H, KNOB, PAD, STRETCH } = TOGGLE;
/** A gentle spring: the knob glides over and settles, with only a breath of overshoot. */
const GLIDE = { damping: 18, stiffness: 260, mass: 0.75 } as const;

/**
 * The switch, drawn by us so it reads the same in every theme: off is a
 * quiet groove with a white knob, on is the court's colour (or `tint`). The
 * knob glides over on a soft spring and the track's colour fades across
 * with it; a finger on it stretches the knob a little, and it can be dragged
 * across as well as tapped, like a phone's own switch. `haptic`: a light
 * tap as it flips (for a switch whose action does not already give one).
 *
 * A finger moves the knob at once, on the animation thread, without waiting
 * for the screen; the screen's `value` still has the last word. A change it
 * refuses or holds back (a sheet asking "for how long?", a permission sent
 * to Settings, a save that failed) sends the knob back where `value` says,
 * the way the phone's own switch does.
 */
export function Toggle({ value, onChange, disabled = false, accessibilityLabel, haptic = false, tint }: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  haptic?: boolean;
  /** The on colour, when not the court's own. */
  tint?: string;
}) {
  useTheme();
  const reduce = useReducedMotion();
  // Where the knob is, 0 (off) to 1 (on), and how far a finger has pressed it (0 to 1).
  const p = useSharedValue(value ? 1 : 0);
  const press = useSharedValue(0);
  const from = useSharedValue(0);
  // Where the knob is headed (0 or 1), changed the instant a finger flips it, so a
  // second tap before the screen has caught up flips it back rather than repeating the first.
  const aim = useSharedValue(value ? 1 : 0);
  // The same here, and what the screen says right now.
  const shown = useRef(value);
  const valueNow = useRef(value);
  valueNow.current = value;
  const glideTo = (to: number) => {
    'worklet';
    aim.value = to;
    p.value = reduce ? withTiming(to, { duration: 140 }) : withSpring(to, GLIDE);
  };
  // Every time the screen draws: if its value is not where the knob is headed, the knob goes there.
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    glideTo(value ? 1 : 0);
  });

  const flip = (next: boolean, buzz: boolean) => {
    shown.current = next;
    if (haptic && buzz) (next ? haptics.tap : haptics.untap)();
    onChange(next);
    // Refused, or not yet answered: back to what the screen says; it comes over again once accepted.
    requestAnimationFrame(() => {
      if (shown.current !== next || valueNow.current === next) return;
      shown.current = valueNow.current;
      glideTo(valueNow.current ? 1 : 0);
    });
  };
  const tick = () => { if (haptic) haptics.untap(); };

  const pressIn = () => { 'worklet'; press.value = withTiming(1, { duration: 140 }); };
  const pressOut = () => { 'worklet'; press.value = withTiming(0, { duration: 220 }); };
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(4000)
    .hitSlop(8)
    .onBegin(pressIn)
    .onEnd((_e, done) => {
      if (!done) return;
      const next = aim.value > 0.5 ? 0 : 1;
      glideTo(next);
      runOnJS(flip)(next === 1, true);
    })
    .onFinalize(pressOut);
  // Dragged: the knob follows the finger and lands on the nearer side (a flick counts).
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .hitSlop(8)
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onBegin(pressIn)
    .onStart(() => { from.value = p.value; })
    .onUpdate((e) => {
      const next = Math.min(1, Math.max(0, from.value + e.translationX / TRAVEL));
      // A faint tick as it crosses the middle, the moment it would flip.
      if ((next >= 0.5) !== (p.value >= 0.5)) runOnJS(tick)();
      p.value = next;
    })
    .onEnd((e) => {
      const on = p.value + (e.velocityX / TRAVEL) * 0.08 >= 0.5;
      const crossed = (p.value >= 0.5) === on;
      const was = aim.value > 0.5;
      glideTo(on ? 1 : 0);
      if (on !== was) runOnJS(flip)(on, !crossed);
    })
    .onFinalize(pressOut);

  const off = trackOff();
  const on = trackOn(tint);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [off, on]) }), [off, on]);
  const knob = useAnimatedStyle(() => {
    const extra = STRETCH * press.value;
    // Stretched, it grows away from the side it rests on.
    return { width: KNOB + extra, transform: [{ translateX: p.value * (TRAVEL - extra) }] };
  });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        accessible
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName !== 'activate' || disabled) return; const next = !shown.current; glideTo(next ? 1 : 0); flip(next, true); }}
        style={[{ width: W, height: H, borderRadius: H / 2, padding: PAD, opacity: disabled ? 0.45 : 1 }, track]}
      >
        <Animated.View style={[{ height: KNOB, borderRadius: KNOB / 2, backgroundColor: KNOB_COLOR, boxShadow: KNOB_SHADOW }, knob]} />
      </Animated.View>
    </GestureDetector>
  );
}
