import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeOut, interpolateColor, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { BrandWash } from '@/components/ui';
import { MapGlass } from '@/components/map/MapGlass';
import { useRestKey, useRestLength } from '@/components/ui/restMotion';
import { LIGHT_UP, litLine } from '@/features/places/lightUp';
import type { CheckInControl } from '@/features/players/useLocationToggle';
import { PILL_QUICK_MS, growArmed, useGrowAway } from '@/features/players/mapGrow';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { TextScale, colors, font, typography, withAlpha } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The Up to hit button's moment (Oct 28, owner: "clicking check in should have a slight animation.
 * be more gratifying overall"). Quick and physical, nothing showy:
 *
 *  - A finger down presses it in (to 95%) at once, as the map's other buttons do; let go, it is back.
 *  - On: the Find Players card's pill springs wider to its words, the green sweeps in from the left
 *    (a fill of its own under the words, which turn light as it passes them), and a tick draws itself
 *    before "Up to hit · till 10pm". The full map's round arrow fills from its middle and gives one
 *    small bounce. The phone's own soft tap comes with it (AppContext checkInOnMap).
 *  - Off: the quick reverse, the green going back out the way it came; a light tick (checkOutOfMap).
 *  - Finding you: a soft band of light runs across it, never a spinner jumping in.
 *  - It could not put you up: a small shake, with the toast saying why.
 *
 * Only transforms and its own fill ever move: the full map's button is see-through (MapGlass), and
 * nothing that holds it is ever faded (Oct 17, Oct 22). Reduce Motion: each look at once, the tap
 * on the hand still there.
 */

/** What the button says to a screen reader: what a tap does, and for how long. */
export const checkInLabel = (c: CheckInControl) => (c.on ? `Up to hit, friends see you ${c.span}. Turn off` : `Up to hit. Friends who follow you back see you ${c.span}`);

/** The green coming in: a quick start that settles softly (no bounce of its own: the width and the arrow carry that). */
const SWEEP_IN_MS = 360;
const SWEEP_IN = Easing.bezier(0.22, 1, 0.36, 1);
/** And going back out, a little quicker. */
const SWEEP_OUT_MS = 200;
const SWEEP_OUT = Easing.bezier(0.4, 0, 0.6, 1);
/** The tick, drawn as the green reaches it. */
const TICK_DELAY = 110;
const TICK_MS = 240;
/**
 * The check-in zoom's grow (mapGrow, v4): the pill slips out of the card as the page pushes in from the moment you are
 * found, so its moment is the same one, quicker, played as it goes (the green and the tick within PILL_QUICK_MS).
 */
const QUICK_TICK_DELAY = 40;
const QUICK = { sweep: PILL_QUICK_MS, tickDelay: QUICK_TICK_DELAY, tick: PILL_QUICK_MS - QUICK_TICK_DELAY - 10 };
const PLAIN = { sweep: SWEEP_IN_MS, tickDelay: TICK_DELAY, tick: TICK_MS };
/** The tick's stroke, in its 24-unit box (a little over its real length, so no dot is left at the start). */
const TICK = 'M4.5 12.75l4.75 4.75L19.5 7';
const TICK_LEN = 22;
/** The pill's width: springs open just past its words and back (about 4%), shuts with a plain ease. */
const WIDEN = { damping: 20, stiffness: 230, mass: 0.9 };
const NARROW_MS = 240;
/**
 * A finger down: pressed in at once. Held by React (Pressable's own pressed look), not by an animation, so a
 * press held still for a second can never be handed back to React as an older value on an iPhone (restMotion).
 */
const PRESSED = { transform: [{ scale: 0.95 }] };
/** The round arrow's one bounce once it has filled. */
const BOUNCE_TO = 1.08;
const BOUNCE_SETTLE = { damping: 12, stiffness: 320, mass: 0.7 };
/** The band of light while it finds you: how wide, and one pass across. */
const BAND = 44;
const BAND_MS = 1000;
/**
 * How strong the band's middle is. A light page needs more of the brand to be seen at all (at 0.2 the
 * Clean green was all but lost on the white pill, so a tap looked as if it did nothing while it found you).
 */
const BAND_LIGHT = 0.34;
const BAND_DARK = 0.2;

const APath = Animated.createAnimatedComponent(Path);

/**
 * The motion both buttons share: `p` 0 to 1 as it turns on (the green), `tick` the tick's stroke
 * still to draw, the bounce and the shake (each back at rest within half a second), and `key`, bumped each time it lands on a phone, for the
 * views `p` moves: they are built afresh at rest, so an iPhone that drops a settled animation value
 * never shows the old look on a later re-render (restMotion).
 */
function useUpToHitMotion(control: CheckInControl, bounceOnLand: boolean, quick?: () => boolean) {
  const reduce = useReducedMotion();
  const p = useSharedValue(control.on ? 1 : 0);
  const tick = useSharedValue(0);
  const bounce = useSharedValue(1);
  const shake = useSharedValue(0);
  const [key, bump] = useRestKey();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce) {
      p.value = control.on ? 1 : 0;
      tick.value = 0;
      bump();
      return;
    }
    if (control.on) {
      const pace = quick?.() ? QUICK : PLAIN;
      p.value = withTiming(1, { duration: pace.sweep, easing: SWEEP_IN }, (done) => { 'worklet'; if (done) runOnJS(bump)(); });
      tick.value = TICK_LEN;
      tick.value = withDelay(pace.tickDelay, withTiming(0, { duration: pace.tick, easing: Easing.out(Easing.cubic) }));
      if (bounceOnLand) bounce.value = withDelay(60, withSequence(withTiming(BOUNCE_TO, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(1, BOUNCE_SETTLE)));
    } else {
      p.value = withTiming(0, { duration: SWEEP_OUT_MS, easing: SWEEP_OUT }, (done) => { 'worklet'; if (done) runOnJS(bump)(); });
    }
  }, [control.on]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tap that could not put you up: one small shake (the toast says why).
  const failedWas = useRef(control.failed);
  useEffect(() => {
    if (control.failed === failedWas.current) return;
    failedWas.current = control.failed;
    if (reduce) return;
    const step = (to: number, ms: number) => withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) });
    shake.value = withSequence(step(-6, 45), step(5, 70), step(-3, 65), step(2, 55), step(0, 45));
  }, [control.failed]); // eslint-disable-line react-hooks/exhaustive-deps
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: bounce.value }] }));
  return { reduce, p, tick, key, moved };
}

/** The tick, drawing itself as `left` (its stroke still to draw) runs down to 0. */
function Tick({ left, size, color }: { left: SharedValue<number>; size: number; color: string }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: left.value }));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <APath d={TICK} fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${TICK_LEN} ${TICK_LEN}`} animatedProps={props} />
    </Svg>
  );
}

/**
 * Finding you: a soft band of the brand's light running across, again and again, until it knows
 * (Reduce Motion: the light simply rests over it). Gone with a short fade of its own.
 */
function FindingBand({ width, radius }: { width: number; radius: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { dark } = useTheme();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!reduce) x.value = withRepeat(withTiming(1, { duration: BAND_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = useAnimatedStyle(() => ({ transform: [{ translateX: reduce ? (width - BAND) / 2 : -BAND + x.value * (width + BAND) }] }), [width, reduce]);
  const clear = withAlpha(colors.brand, 0);
  return (
    <Animated.View pointerEvents="none" exiting={FadeOut.duration(140)} style={[styles.bandBox, { borderRadius: radius }]}>
      <Animated.View style={[styles.band, run]}>
        <LinearGradient colors={[clear, withAlpha(colors.brand, dark ? BAND_DARK : BAND_LIGHT), clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The Find Players card's Up to hit pill (top right of the card): "Up to hit", or while it is on,
 * "Up to hit · till 10pm" on green. Its width glides between the two, laid out from unseen copies
 * of both, so the words never squeeze; while it shuts, the green keeps its words until it has gone.
 */
export function UpToHitPill({ control }: { control: CheckInControl }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  // Slipping out with the check-in zoom's grow: its quick moment (mapGrow).
  const m = useUpToHitMotion(control, false, growArmed);
  const onWords = litLine(control.span);
  // While it shuts (and so long as it is off), the green's words are the ones it showed.
  const shown = useRef(onWords);
  if (control.on) shown.current = onWords;
  const greenWords = control.on ? onWords : shown.current;
  const [offW, setOffW] = useState(0);
  const [onW, setOnW] = useState(0);
  const want = control.on ? onW : offW;
  // Its width rests as a plain style held by React (useRestLength): see restMotion.
  const w = useRestLength('width');
  useEffect(() => {
    if (!want) return;
    const to = want + 2;
    if (w.target.current == null || m.reduce) w.jump(to);
    else if (to !== w.target.current) {
      if (control.on) w.glide(to, (t, done) => withSpring(t, WIDEN, done));
      else w.glide(to, (t, done) => withTiming(t, { duration: NARROW_MS, easing: Easing.bezier(0.3, 0, 0.2, 1) }, done));
    }
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = m.p;
  const edgeOff = colors.border;
  const edgeOn = colors.brand;
  const edge = useAnimatedStyle(() => ({ borderColor: interpolateColor(p.value, [0, 1], [edgeOff, edgeOn]) }), [edgeOff, edgeOn]);
  const sweep = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, p.value)) * 100}%` }));
  const k = `${theme}:${m.key}`;
  // Not measured yet and already on (the card drawn while you are up): the plain row says the longer words, so the
  // very first frame is already the right width.
  const baseWords = control.on && !onW ? greenWords : LIGHT_UP;
  // The check-in zoom's grow (mapGrow): it slips up out of the card at its own size as the page pushes in, its quick
  // moment playing as it goes.
  const away = useGrowAway('top');
  return (
    <Animated.View style={[styles.pillSpot, away]}>
      <Animated.View style={m.moved}>
        <Pressable accessibilityRole="button" accessibilityState={{ busy: control.busy }} accessibilityLabel={checkInLabel(control)} hitSlop={6} onPress={control.press} style={({ pressed }) => (pressed ? PRESSED : null)}>
          <Animated.View key={k} style={[styles.pill, edge, w.style]}>
            {control.busy && !control.on ? <FindingBand width={want || offW || 100} radius={15} /> : null}
            <View pointerEvents="none" style={[styles.pillRow, offW ? { width: offW } : null]}>
              <Ionicons name="navigate-outline" size={14} color={colors.text} />
              <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.pillWord}>{baseWords}</Text>
            </View>
            {/* The green, under its own copy of the words in the colour on green: it comes in from the left. */}
            <Animated.View pointerEvents="none" style={[styles.pillGreen, sweep]}>
              <BrandWash radius={15} />
              <View style={[styles.pillRow, styles.pillRowOver, onW ? { width: onW } : null]}>
                <Tick left={m.tick} size={15} color={colors.brandInk} />
                <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.pillWord, styles.pillWordOn]}>{greenWords}</Text>
              </View>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>
      {/* Unseen copies of both, free of the pill, to say how wide each wants to be (a point to spare, so a fraction never trails off). */}
      <View style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <View style={styles.pillRow} onLayout={(e) => setOffW(Math.ceil(e.nativeEvent.layout.width) + 1)}>
          <Ionicons name="navigate-outline" size={14} color={colors.text} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.pillWord}>{LIGHT_UP}</Text>
        </View>
        <View style={styles.pillRow} onLayout={(e) => setOnW(Math.ceil(e.nativeEvent.layout.width) + 1)}>
          <View style={{ width: 15, height: 15 }} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.pillWord, styles.pillWordOn]}>{greenWords}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * The full map's round arrow, beside the search (Oct 27): outlined while you are not up to hit,
 * filled on green while you are. On, the green fills it from the middle out and it gives one small
 * bounce; off, the green draws back in. It is the map's see-through fill (MapGlass): only its own
 * green, its arrows and the button's place and size ever move, never the see-through fill's strength.
 */
export function UpToHitRound({ control }: { control: CheckInControl }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const m = useUpToHitMotion(control, true);
  const p = m.p;
  const edgeOff = `${colors.borderStrong}55`;
  const edgeOn = colors.brand;
  const edge = useAnimatedStyle(() => ({ borderColor: interpolateColor(p.value, [0, 1], [edgeOff, edgeOn]) }), [edgeOff, edgeOn]);
  const fill = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 2.5), transform: [{ scale: 0.3 + 0.7 * p.value }] }));
  // The outlined arrow goes in the first half, so the arrow is never a muddy mix of the two on the green.
  const offIcon = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - p.value * 2) }));
  const litIcon = useAnimatedStyle(() => ({ opacity: Math.min(1, p.value * 1.6), transform: [{ scale: 0.7 + 0.3 * p.value }] }));
  const k = `${theme}:${m.key}`;
  return (
    <Animated.View style={m.moved}>
      <Pressable accessibilityRole="button" accessibilityState={{ busy: control.busy }} accessibilityLabel={checkInLabel(control)} onPress={control.press} style={({ pressed }) => [styles.roundLift, pressed && PRESSED]}>
        <MapGlass key={k} radius={22} style={[styles.round, edge]}>
          {control.busy && !control.on ? <FindingBand width={44} radius={22} /> : null}
          <Animated.View pointerEvents="none" style={[styles.roundGreen, fill]}><BrandWash radius={22} /></Animated.View>
          <View pointerEvents="none">
            <Animated.View style={offIcon}><Ionicons name="navigate-outline" size={18} color={colors.text} /></Animated.View>
            <Animated.View style={[styles.roundIconOver, litIcon]}><Ionicons name="navigate" size={18} color={colors.brandInk} /></Animated.View>
          </View>
        </MapGlass>
      </Pressable>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  // Where the card's pill sits: top right, over the map, as before (the hint's pulse rings the same spot).
  pillSpot: { position: 'absolute', right: 12, top: 12 },
  pill: { height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden', justifyContent: 'center', alignItems: 'flex-start' },
  pillRow: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  pillRowOver: { position: 'absolute', left: 0, top: 0 },
  pillWord: { ...typography.smallStrong, ...font('600'), color: colors.text },
  pillWordOn: { color: colors.brandInk },
  pillGreen: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.brand },
  // The unseen copies: reaching off to the left (which never scrolls the page), taking no taps.
  measure: { position: 'absolute', right: 0, top: 0, width: 2000, alignItems: 'flex-end', opacity: 0, pointerEvents: 'none' },
  bandBox: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, width: BAND },
  // The full map's round arrow: 44 across, a finger's width, one soft lift (as Back beside it).
  roundLift: { width: 44, height: 44, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: `${colors.borderStrong}55` },
  roundGreen: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.brand },
  roundIconOver: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
