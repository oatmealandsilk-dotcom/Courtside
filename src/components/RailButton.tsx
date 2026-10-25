import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Reanimated, { Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { LIKE_RED } from '@/components/Heart';
import { RailCount } from '@/components/RailCount';
import { RailGlyph } from '@/components/RailGlyph';
import { MAX_GROW } from '@/components/ReelCaption';
import { useIsGuest } from '@/features/guest/guestStatus';
import { useSwipePressLook } from '@/features/navigation/swipePress';
import { useOptimisticToggle } from '@/lib/useOptimisticToggle';
import { useReducedMotion } from '@/lib/useReducedMotion';

/*
 * How a clip rail's buttons answer (Oct 24, owner: "Do what Instagram or
 * TikTok would do ... Also make animation satisfying").
 *
 * Instagram's and TikTok's rails answer the thumb physically, and only a
 * reward gets a celebration:
 *   - every button squeezes under the finger (to RAIL_SQUEEZE) and springs
 *     back the moment it lifts, with one small overshoot and no wobble;
 *   - a like pops past full size (POP) and settles on a crisp spring, with a
 *     few red sparks thrown off the heart; taking a like back is a small soft
 *     dip, no sparks;
 *   - a save pops the same way as it fills; unsaving is quiet;
 *   - the haptics are the store's own (a light tap on a like or a save, the
 *     faintest tick on taking one back), fired on the tap.
 * Everything runs on the animation thread, starts from an event (never on a
 * first draw), and always comes to rest at exactly the plain look (scale 1),
 * so an iPhone that drops a settled animation value can never leave a button
 * small or large (restMotion.ts). A squeeze lets go by itself after
 * SQUEEZE_HOLD, so no button is ever held still away from rest long enough for
 * that to matter. With Reduce Motion (useReducedMotion) nothing bounces: the
 * fill and the count simply change.
 */

/** How far a button squeezes under the finger. */
export const RAIL_SQUEEZE = 0.85;
/** How far a like or a save pops past full size. */
const POP = 1.2;
const SQUEEZE = { duration: 80, easing: Easing.out(Easing.quad) };
/** The longest a squeeze is held, finger down or not, before it lets go by itself (see above). */
const SQUEEZE_HOLD = 520;
/** Back from a squeeze: stiff and lightly damped (ζ ≈ 0.57), in about 150 ms with one 2% overshoot. */
const RELEASE = { stiffness: 700, damping: 30, mass: 1 };
/** Up to the pop: quick, slowing into its top. */
const POP_UP = { duration: 120, easing: Easing.out(Easing.cubic) };
/** Down from the pop: one small dip under full size (ζ ≈ 0.53), then still, about 250 ms. */
const POP_SETTLE = { stiffness: 520, damping: 24, mass: 1 };
/** Taking a like back: a small, soft dip and back, no bounce. */
const DIP = 0.9;
const DIP_DOWN = { duration: 90, easing: Easing.out(Easing.quad) };
const DIP_BACK = { duration: 170, easing: Easing.out(Easing.quad) };
/** A computer's pointer over a button: a slight lift (phones never see this). */
const HOVER = 1.06;

export interface RailMotion {
  style: ReturnType<typeof useAnimatedStyle>;
  /** The finger is down (or up): the squeeze, and the spring back. */
  look: (on: boolean) => void;
  /** A whole tap, dip and spring, on the animation thread (so a page opening on the tap cannot hold the dip). */
  tap: () => void;
  /** A like or a save: the pop. */
  celebrate: () => void;
  /** A like taken back: the soft dip. */
  settle: () => void;
  hover: (on: boolean) => void;
}

export function useRailMotion(): RailMotion {
  const still = useReducedMotion();
  const press = useSharedValue(1);
  const pop = useSharedValue(1);
  const lift = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: press.value * pop.value * lift.value }] }));
  return useMemo(() => ({
    style,
    look: (on: boolean) => {
      if (still) return;
      press.value = on
        ? withSequence(withTiming(RAIL_SQUEEZE, SQUEEZE), withDelay(SQUEEZE_HOLD, withSpring(1, RELEASE)))
        : withSpring(1, RELEASE);
    },
    tap: () => {
      if (still) return;
      runOnUI((p: SharedValue<number>) => {
        'worklet';
        // Already squeezed (the finger was held): just the spring back. A quick tap: the whole dip.
        p.value = p.value < 0.93 ? withSpring(1, RELEASE) : withSequence(withTiming(RAIL_SQUEEZE, { duration: 70, easing: SQUEEZE.easing }), withSpring(1, RELEASE));
      })(press);
    },
    celebrate: () => {
      if (still) { press.value = 1; return; }
      // Out of the squeeze and past full size in one move, then the crisp settle.
      press.value = withTiming(1, { duration: 100, easing: SQUEEZE.easing });
      pop.value = withSequence(withTiming(POP, POP_UP), withSpring(1, POP_SETTLE));
    },
    settle: () => {
      if (still) { press.value = 1; return; }
      press.value = withTiming(1, DIP_DOWN);
      pop.value = withSequence(withTiming(DIP, DIP_DOWN), withTiming(1, DIP_BACK));
    },
    hover: (on: boolean) => {
      if (Platform.OS !== 'web' || still) return;
      lift.value = withTiming(on ? HOVER : 1, { duration: 120, easing: SQUEEZE.easing });
    },
  }), [still, style, press, pop, lift]);
}

interface PressProps {
  motion: RailMotion;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
  hitSlop?: number;
  /** The button's slot (the rail's own `action` style). */
  style?: StyleProp<ViewStyle>;
  /** The box the icon is centred in. */
  glyphBox?: StyleProp<ViewStyle>;
  glyph: React.ReactNode;
  /** Drawn round the icon and not squeezed with it (the like's sparks). */
  around?: React.ReactNode;
  /** Under the icon, inside the button and never squeezed: the count. */
  children?: React.ReactNode;
}

/**
 * A rail button: the press (with the swipe-aware wait every press on a
 * sideways-swiping page has, swipePress), the icon that squeezes, and what sits
 * under it. `onPress` decides the motion (motion.tap for a plain button).
 */
export function RailPressable({ motion, accessibilityLabel, onPress, onLongPress, hitSlop, style, glyphBox, glyph, around, children }: PressProps) {
  const press = useSwipePressLook(motion.look);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      {...press.delay}
      onTouchStart={press.touchStart}
      onPressMove={press.pressMove}
      onPressIn={press.pressIn}
      onPressOut={press.pressOut}
      onHoverIn={() => motion.hover(true)}
      onHoverOut={() => motion.hover(false)}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <View style={[styles.glyphBox, glyphBox]}>
        <Reanimated.View style={motion.style}>{glyph}</Reanimated.View>
        {around}
      </View>
      {children}
    </Pressable>
  );
}

/** A button that only opens something (comments, send, the menu): squeeze, spring back, then go. */
export function useRailTap(onPress: () => void) {
  const motion = useRailMotion();
  const press = useCallback(() => { motion.tap(); onPress(); }, [motion, onPress]);
  return { motion, press };
}

/* ------------------------------------------------------------------ */
/* The like's sparks                                                   */
/* ------------------------------------------------------------------ */

/** Five sparks, one every 60 degrees with the gap at the bottom, so none lands on the count (0 is to the right, clockwise). */
const SPARKS = [-90, -30, 30, 150, 210];
const SPARK_MS = 380;
const SPARK = 4.5;

/**
 * A few red sparks thrown off the heart as it pops, gone in SPARK_MS. It
 * exists only while it plays (mounted for the like, removed when done), so
 * nothing of it is left resting anywhere.
 */
export function HeartSparks({ size, onDone }: { size: number; onDone: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: SPARK_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [t, onDone]);
  const from = size * 0.42;
  const to = size * 0.78;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {SPARKS.map((deg) => <Spark key={deg} t={t} angle={(deg * Math.PI) / 180} from={from} to={to} />)}
    </View>
  );
}

function Spark({ t, angle, from, to }: { t: SharedValue<number>; angle: number; from: number; to: number }) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const style = useAnimatedStyle(() => {
    const r = from + (to - from) * t.value;
    // In at once (over the first frames, so the start never shows still), out over the last 60%.
    const opacity = t.value < 0.08 ? t.value / 0.08 : t.value < 0.4 ? 1 : Math.max(0, (1 - t.value) / 0.6);
    return { opacity, transform: [{ translateX: cos * r }, { translateY: sin * r }, { scale: 1 - 0.55 * t.value }] };
  });
  return <Reanimated.View style={[styles.spark, style]} />;
}

/** The sparks' play, keyed so a second like restarts them; `play()` starts one, `node` is what to draw. */
export function useHeartSparks(size: number) {
  const still = useReducedMotion();
  const [run, setRun] = useState(0);
  const done = useCallback(() => setRun(0), []);
  const play = useCallback(() => { if (!still) setRun((n) => n + 1); }, [still]);
  const node = run ? <HeartSparks key={run} size={size} onDone={done} /> : null;
  return { play, node };
}

const styles = StyleSheet.create({
  glyphBox: { justifyContent: 'center', alignItems: 'center' },
  spark: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: SPARK,
    height: SPARK,
    marginLeft: -SPARK / 2,
    marginTop: -SPARK / 2,
    borderRadius: SPARK / 2,
    backgroundColor: LIKE_RED,
  },
});

/* ------------------------------------------------------------------ */
/* The rail's other buttons                                            */
/* ------------------------------------------------------------------ */

interface SlotProps {
  style?: StyleProp<ViewStyle>;
  glyphBox?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

/**
 * A button that opens something: the comments, send, the menu. `count`, when
 * given, is the number under it (blank at 0, the line held); leave it out for
 * the dots.
 */
export function RailTap({ accessibilityLabel, onPress, glyph, count, style, glyphBox, labelStyle }: SlotProps & { accessibilityLabel: string; onPress: () => void; glyph: React.ReactNode; count?: number }) {
  const { motion, press } = useRailTap(onPress);
  return (
    <RailPressable motion={motion} accessibilityLabel={accessibilityLabel} onPress={press} style={style} glyphBox={glyphBox} glyph={glyph}>
      {count === undefined ? null : <RailCount value={count} style={labelStyle} maxFontSizeMultiplier={MAX_GROW} />}
    </RailPressable>
  );
}

/**
 * The bookmark: it fills on the tap itself and pops as it does (the store
 * follows, as with the heart); unsaving is quiet. The count is how many saved it.
 */
export function RailSave({ ledgerKey, saved, count, onToggle, size, style, glyphBox, labelStyle }: SlotProps & { ledgerKey: string; saved: boolean; count: number; onToggle: () => void; size: number }) {
  const save = useOptimisticToggle(ledgerKey, saved, onToggle);
  const motion = useRailMotion();
  const isGuest = useIsGuest();
  const press = () => {
    // Unsaving is quiet, and a guest's tap only asks them to join: the press alone.
    if (save.on || isGuest) motion.tap();
    else motion.celebrate();
    save.toggle();
  };
  return (
    <RailPressable
      motion={motion}
      accessibilityLabel={save.on ? 'Remove from saved' : 'Save this clip'}
      onPress={press}
      style={style}
      glyphBox={glyphBox}
      glyph={<RailGlyph name="bookmark" size={size} filled={save.on} />}
    >
      <RailCount value={count + save.delta} style={labelStyle} maxFontSizeMultiplier={MAX_GROW} />
    </RailPressable>
  );
}
