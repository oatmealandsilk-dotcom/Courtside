import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, ReduceMotion, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import Svg, { Defs, G, Line, LinearGradient, RadialGradient, Rect, Stop, Circle } from 'react-native-svg';

import { litTilePaint } from '@/components/map/markers';
import { POP_FROM_SCALE, POP_IN, POP_OUT, POP_SETTLE_MS, POP_SPRING } from '@/components/popMotion';
import { Submit } from '@/components/sheet/SheetForm';
import {
  COURT_TIME_MAX, COURT_TIME_MIN, COURT_TIME_STEP, courtTimeSpoken, courtTimeWords, setCourtTimeHost, setCourtTimeUp, tillWords, type CourtTimeRequest,
} from '@/features/places/courtTime';
import { SwipeArea } from '@/features/navigation/swipePress';
import { useHoldTour } from '@/features/tour/tourHold';
import * as haptics from '@/lib/haptics';
import { useModalOpenWhile } from '@/lib/modalOpen';
import { simAction } from '@/lib/simDriver';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, buttonShape, colors, font, radius, spacing, typography } from '@/theme';

const NEVER = ReduceMotion.Never;
const TITLE_ID = 'courtside-court-time-title';
/** How long the lit court stays on the card before it goes: long enough to see it light, short enough not to wait. */
const LIT_HOLD_MS = 1150;
/** The court's drawing on the card: the map's floodlit court (A), a little bigger. */
const TILE_W = 50;
const TILE_H = Math.round(TILE_W * 1.42);
const TILE_R = Math.round(TILE_W * 0.2);
const RIM = 3;
const GLOW = Math.round(TILE_W * 2.3);
/** When the clock moves on a minute, "till 6:30pm" under the number follows. */
const MINUTE = 60_000;
/**
 * The card's living wash (Oct 29, owner: "Give the how long your here a gradient slight tiny. Maybe we can even
 * make it like slightly moving so it's like 'living'. But the design is solid"): two soft glows of the court's
 * own colours (the brand, and the court colour) at a whisper on the card's own ground, drifting slowly the way a
 * lit court's light drifts on the map (LIT_FLOW drift), never a flash. Two slow loops, unequal so it never
 * visibly repeats: the layer wanders across and back, and down and up, with a slight turn.
 */
// Livelier (Oct 30, owner: "The drift can be a bit livelier"): quicker loops, a wider wander, a touch more colour.
const WASH_LOOP_X = 6_200;
const WASH_LOOP_Y = 7_900;
/** How far it wanders, px each way, and how far it turns. The layer is twice the card, so no edge ever shows. */
const WASH_DRIFT_X = 64;
const WASH_DRIFT_Y = 42;
const WASH_TURN = 10;
/**
 * The glows' strength at their middles: a whisper (the card's words and buttons keep their contrast). On a light
 * card the brand's own pale tint (brandDim) and the lit court's light; on a dark one the brand and the court
 * colour, which lift the dark ground where a pale tint would muddy it.
 */
const WASH_ALPHA = { light: [1, 0.11], dark: [0.09, 0.22] } as const;

/**
 * "How long are you here?" (courtTime.ts; Oct 29, owner: "should a card pop up that's satisfying with a like +
 * and - screen that asks like how long you're going to be there"). A small card in the middle of the dimmed
 * screen, in the look of the app's other pop-up cards (AlertsWhyHost, the first "Who can see you"): the court
 * as the map draws it, quiet; the question and the court's name; − [1h 30m] + in 30-minute steps (30 minutes
 * to 4 hours) with "till 6:30pm" under it; one big green "Light it up"; "Not now", quiet, under it.
 *
 * Light it up: the check-in goes (courtTime's `go`); once it has, the court on the card lights the way it does
 * on the map (its colours flow in, its glow opens, one bright sweep across it), one light tap of the phone,
 * "You're here · till 6:30pm", and the card goes on its own a moment later. Refused: why, in a line on the
 * card, which stays. Not now, a tap outside, Escape or Android's back: nothing is said.
 *
 * Behind it all, a whisper of the court's colours drifts slowly across the card while it is up (the living wash,
 * WASH_LOOP_X), transform only, its own layer; the words and buttons over it never move.
 *
 * Motion is only on the card's own parts (never a parent of the glass tab bar or of any blur). The card comes
 * and goes the way every pop-up card here does (popMotion). Reduce Motion: the same, with fades in place of
 * the grow, the bloom and the sweep.
 *
 * Drawn once by the root layout, over everything: straight on the phone's window on an iPhone (over the
 * court's own sheet too), a pop-up layer on Android and in a browser.
 */
export function CourtTimeHost() {
  const styles = useThemedStyles(styleDefinitions);
  const { theme, dark } = useTheme();
  const reduce = useReducedMotion();
  const [request, setRequest] = useState<CourtTimeRequest | null>(null);
  const [minutes, setMinutes] = useState(90);
  const [busy, setBusy] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [, tick] = useState(0);
  useHoldTour(request !== null);
  useModalOpenWhile(request !== null);
  const live = useRef<CourtTimeRequest | null>(null);
  const openedAt = useRef(0);
  const touchAt = useRef(0);
  const titleRef = useRef<Text>(null);
  const shown = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const on = useSharedValue(0);
  const pop = useSharedValue(1);
  const sweep = useSharedValue(0);
  const bump = useSharedValue(0);
  const driftX = useSharedValue(0.5);
  const driftY = useSharedValue(0.5);

  useEffect(() => {
    setCourtTimeHost((next) => {
      // One at a time: a second tap while it is up opens nothing more.
      if (live.current) { next.done(false); return; }
      live.current = next;
      openedAt.current = Date.now();
      touchAt.current = 0;
      glow.value = 0;
      on.value = 0;
      pop.value = 1;
      sweep.value = 0;
      setMinutes(next.minutes);
      setBusy(false);
      setLit(null);
      setProblem('');
      setRequest(next);
      setCourtTimeUp(true);
    });
    return () => setCourtTimeHost(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!request) return undefined;
    scale.value = reduce ? 1 : POP_FROM_SCALE;
    shown.value = withTiming(1, POP_IN);
    if (!reduce) scale.value = withSpring(1, POP_SPRING);
    const t = setTimeout(() => {
      if (Platform.OS !== 'web' && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current as unknown as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0], 'focus');
    }, 100);
    // "till 6:30pm" stays true while the card is up.
    const clock = setInterval(() => tick((n) => n + 1), MINUTE);
    return () => { clearTimeout(t); clearInterval(clock); };
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  // The wash drifts only while the card is up: it starts as the card opens and stops when the card has gone.
  useEffect(() => {
    if (!request || reduce) return undefined;
    const ease = Easing.inOut(Easing.sin);
    driftX.value = 0;
    driftY.value = 0.35;
    driftX.value = withRepeat(withTiming(1, { duration: WASH_LOOP_X, easing: ease, reduceMotion: NEVER }), -1, true);
    driftY.value = withSequence(
      withTiming(1, { duration: WASH_LOOP_Y * 0.65, easing: ease, reduceMotion: NEVER }),
      withRepeat(withTiming(0, { duration: WASH_LOOP_Y, easing: ease, reduceMotion: NEVER }), -1, true),
    );
    return () => {
      cancelAnimation(driftX);
      cancelAnimation(driftY);
      driftX.value = 0.5;
      driftY.value = 0.5;
    };
  }, [request, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const gone = () => {
    setRequest(null);
    setCourtTimeUp(false);
  };
  /** Away it goes, saying whether the court was lit. */
  const leave = (wasLit: boolean) => {
    const asked = live.current;
    if (!asked) return;
    live.current = null;
    shown.value = withTiming(0, POP_OUT, (end) => { if (end) runOnJS(gone)(); });
    asked.done(wasLit);
  };
  // A touch that began while the card was still coming up is the second half of the tap that asked: not an answer.
  const settled = () => {
    const began = touchAt.current || Date.now();
    touchAt.current = 0;
    return began - openedAt.current >= POP_SETTLE_MS;
  };
  const notNow = () => { if (!busy && !lit && settled()) leave(false); };

  const step = (by: number) => {
    if (busy || lit) return;
    const next = Math.min(COURT_TIME_MAX, Math.max(COURT_TIME_MIN, minutes + by));
    if (next === minutes) { haptics.reject(); return; }
    haptics.tick();
    setMinutes(next);
    setProblem('');
    // The number gives a small nudge the way it went: up for more, down for less.
    bump.value = by > 0 ? -1 : 1;
    bump.value = withSpring(0, { damping: 14, stiffness: 420, mass: 0.5, reduceMotion: NEVER });
  };

  const lightUp = async () => {
    const asked = live.current;
    if (!asked || busy || lit || Date.now() - openedAt.current < POP_SETTLE_MS) return;
    setBusy(true);
    setProblem('');
    const got = await asked.go(minutes).catch(() => 'That didn’t go through. Try again.');
    if (live.current !== asked) return;
    setBusy(false);
    if (typeof got === 'string') { setProblem(got); haptics.reject(); return; }
    // Lit: the court lights as it does on the map, one light tap, then the card goes by itself.
    // "till 6:30pm" is when the server said it ends (what the map, the sheet and friends all show), not the
    // minutes chosen here: a server that still gives 2 hours says 2 hours on the card too.
    const ends = Number.isFinite(Date.parse(got.until)) ? got.until : new Date(Date.now() + minutes * 60_000).toISOString();
    setLit(ends);
    haptics.tap();
    const ease = { duration: 520, easing: Easing.out(Easing.cubic), reduceMotion: NEVER };
    on.value = withTiming(1, ease);
    glow.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad), reduceMotion: NEVER });
    if (!reduce) {
      pop.value = withSequence(withTiming(1.1, { duration: 170, easing: Easing.out(Easing.quad), reduceMotion: NEVER }), withSpring(1, { damping: 11, stiffness: 260, mass: 0.7, reduceMotion: NEVER }));
      sweep.value = withDelay(180, withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad), reduceMotion: NEVER }));
    }
    AccessibilityInfo.announceForAccessibility?.(`You’re here, ${tillWords(ends) ?? ''}`);
    setTimeout(() => { if (live.current === asked) leave(true); }, LIT_HOLD_MS);
  };

  // The simulator's proof (simDriver, demo builds only): its "lit" is a tap of this card's Light it up.
  const lightUpNow = useRef(lightUp);
  lightUpNow.current = lightUp;
  useEffect(() => (request ? simAction('lit', () => { void lightUpNow.current(); }) : undefined), [request]);

  // A keyboard on a computer: Escape is Not now; the arrows (and − and +) change the time; nothing beneath the card hears a key.
  useEffect(() => {
    if (Platform.OS !== 'web' || !request) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!busy && !lit) leave(false); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === '-') { e.preventDefault(); e.stopImmediatePropagation(); step(-COURT_TIME_STEP); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === '+' || e.key === '=') { e.preventDefault(); e.stopImmediatePropagation(); step(COURT_TIME_STEP); return; }
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ') return;
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // (every draw: it reads the minutes and busy of this one)

  const dimStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.55 + 0.45 * glow.value }] }));
  const litStyle = useAnimatedStyle(() => ({ opacity: on.value }));
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const sweepStyle = useAnimatedStyle(() => ({ opacity: sweep.value > 0 && sweep.value < 1 ? 1 : 0, transform: [{ translateX: -TILE_W * 1.6 + sweep.value * TILE_W * 3.2 }, { rotate: '24deg' }] }));
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bump.value * 5 }] }));
  // Transform only, on the wash's own layer: nothing over the words moves, and no opacity changes.
  const washStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (driftX.value * 2 - 1) * WASH_DRIFT_X },
      { translateY: (driftY.value * 2 - 1) * WASH_DRIFT_Y },
      { rotate: `${(driftX.value * 2 - 1) * WASH_TURN}deg` },
    ],
  }));

  // The map's own colours for a lit court, in the theme now on.
  const paint = useMemo(() => litTilePaint(2), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;
  const until = lit ?? new Date(Date.now() + minutes * 60_000).toISOString();
  const till = tillWords(until) ?? '';
  const name = request.courtName && request.courtName !== 'Tennis courts' ? request.courtName : 'This court';
  const atMin = minutes <= COURT_TIME_MIN;
  const atMax = minutes >= COURT_TIME_MAX;

  const layer = (
    <View style={styles.layer}>
      <Animated.View pointerEvents="none" style={[styles.dim, dimStyle]} />
      <View
        style={styles.box}
        accessibilityViewIsModal
        onAccessibilityEscape={() => { if (!busy && !lit) leave(false); }}
        {...(Platform.OS === 'web' ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': TITLE_ID } : {})}
      >
        <Animated.View style={[styles.card, cardStyle]}>
          <Animated.View pointerEvents="none" style={[styles.wash, washStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <LivingWash id={`ctw${theme.replace(/[^a-zA-Z0-9]/g, '')}`} dark={dark} light={paint.top} />
          </Animated.View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.words} bounces={false} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
            {/* The court, as the map draws it: quiet, then lit. */}
            <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
                <Svg width={GLOW} height={GLOW}>
                  <Defs>
                    <RadialGradient id="ct-glow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0" stopColor={paint.glow[0]} />
                      <Stop offset="0.48" stopColor={paint.glow[1]} />
                      <Stop offset="0.74" stopColor={paint.glow[2]} />
                      <Stop offset="1" stopColor={paint.glow[3]} />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#ct-glow)" />
                </Svg>
              </Animated.View>
              <Animated.View style={[styles.tile, tileStyle]}>
                <View style={styles.surface}>
                  <CourtSurface fill={colors.surfaceAlt} ink={colors.textFaint} />
                  <Animated.View style={[StyleSheet.absoluteFill, litStyle]}>
                    <CourtSurface gradient={[paint.top, paint.mid, paint.low]} ink={paint.ink} />
                  </Animated.View>
                  <Animated.View pointerEvents="none" style={[styles.sweep, sweepStyle]}>
                    <Svg width={TILE_W * 0.5} height={TILE_H * 2}>
                      <Defs>
                        <LinearGradient id="ct-sweep" x1="0" y1="0" x2="1" y2="0">
                          <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
                          <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.55} />
                          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
                        </LinearGradient>
                      </Defs>
                      <Rect x={0} y={0} width={TILE_W * 0.5} height={TILE_H * 2} fill="url(#ct-sweep)" />
                    </Svg>
                  </Animated.View>
                </View>
              </Animated.View>
            </View>
            <Text ref={titleRef} nativeID={TITLE_ID} accessibilityRole="header" maxFontSizeMultiplier={TextScale.TITLE} style={[styles.title, EVEN_WEB]}>
              {lit ? 'Court’s lit' : 'How long are you here?'}
            </Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.court} numberOfLines={1}>{name}</Text>

            {/* − [1h 30m] +: 30 minutes to 4 hours, in half hours. */}
            <View
              style={styles.stepper}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="How long you’re here"
              accessibilityValue={{ text: `${courtTimeSpoken(minutes)}, ${till}` }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? COURT_TIME_STEP : -COURT_TIME_STEP)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Less time"
                accessibilityState={{ disabled: atMin || !!lit }}
                hitSlop={8}
                onPress={() => step(-COURT_TIME_STEP)}
                style={({ pressed }) => [styles.round, (atMin || !!lit) && styles.roundOff, pressed && !atMin && styles.roundPressed]}
              >
                <Ionicons name="remove" size={24} color={atMin || lit ? colors.textFaint : colors.text} />
              </Pressable>
              <View style={styles.value}>
                <Animated.Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.number, numberStyle]}>{courtTimeWords(minutes)}</Animated.Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.till, lit && styles.tillLit]} numberOfLines={1}>{lit ? `You’re here · ${till}` : till}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More time"
                accessibilityState={{ disabled: atMax || !!lit }}
                hitSlop={8}
                onPress={() => step(COURT_TIME_STEP)}
                style={({ pressed }) => [styles.round, (atMax || !!lit) && styles.roundOff, pressed && !atMax && styles.roundPressed]}
              >
                <Ionicons name="add" size={24} color={atMax || lit ? colors.textFaint : colors.text} />
              </Pressable>
            </View>
            {problem ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.problem}>{problem}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Submit short radius={BUTTON_CORNER} label={lit ? 'Lit up' : 'Light it up'} busy={busy} busyLabel="Lighting it up" onPress={() => { void lightUp(); }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Not now" disabled={busy || !!lit} onPressIn={() => { touchAt.current = Date.now(); }} onPress={notNow} hitSlop={6} style={({ pressed }) => [styles.notNow, pressed && styles.notNowPressed]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.notNowText, (busy || !!lit) && styles.notNowOff]}>Not now</Text>
            </Pressable>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fine}>Friends who follow you back see you here.</Text>
          </View>
        </Animated.View>
      </View>
      {/* A tap outside is Not now. Not a button for a screen reader: Not now on the card says it. */}
      <Pressable accessible={false} focusable={false} importantForAccessibility="no" style={[StyleSheet.absoluteFill, styles.outside]} onPressIn={() => { touchAt.current = Date.now(); }} onPress={notNow} />
    </View>
  );

  if (Platform.OS === 'ios') {
    return <FullWindowOverlay unstable_accessibilityContainerViewIsModal>{layer}</FullWindowOverlay>;
  }
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!busy && !lit) leave(false); }}><SwipeArea on={false}>
      {layer}
    </SwipeArea></Modal>
  );
}

/**
 * The wash's drawing, on a layer twice the card's size: one glow high on the left, one low on the right (see
 * WASH_ALPHA for their colours), each feathered to nothing, in the theme now on. The id carries the theme (iOS keeps a
 * gradient by its id and would not repaint one whose colours changed under the same name).
 */
// Drawn once per theme: the card's ticks and taps never rebuild it (review).
const LivingWash = React.memo(function LivingWash({ id, dark, light }: { id: string; dark: boolean; light: string }) {
  const [a, b] = dark ? WASH_ALPHA.dark : WASH_ALPHA.light;
  const one = dark ? colors.brand : colors.brandDim;
  const two = dark ? colors.court : light;
  const ellipse = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
    ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
    : { cx, cy, rx, ry });
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={`${id}a`} {...ellipse(36, 34, 26, 22)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={one} stopOpacity={a} />
          <Stop offset="0.55" stopColor={one} stopOpacity={a * 0.45} />
          <Stop offset="1" stopColor={one} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} {...ellipse(64, 66, 28, 24)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={two} stopOpacity={b} />
          <Stop offset="0.55" stopColor={two} stopOpacity={b * 0.45} />
          <Stop offset="1" stopColor={two} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}a)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}b)`} />
    </Svg>
  );
});

/**
 * A court from above filling the tile inside its white frame, as the map's floodlit court draws it
 * (markers' courtFromAbove): the doubles and singles sidelines, the service boxes and the net reaching
 * past the sidelines to its posts. A plain fill (quiet), or the lit court's gradient, top to bottom.
 */
function CourtSurface({ fill, gradient, ink }: { fill?: string; gradient?: readonly [string, string, string]; ink: string }) {
  const w = TILE_W - RIM * 2;
  const h = TILE_H - RIM * 2;
  const x0 = w * 0.15;
  const x1 = w - x0;
  const y0 = h * 0.1;
  const y1 = h - y0;
  const alley = (x1 - x0) * 0.125;
  const box = (y1 - y0) * 0.23;
  const net = (y0 + y1) / 2;
  const id = gradient ? 'ct-lit' : undefined;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      {gradient ? (
        <Defs>
          {/* The map's 170°: down and a touch across. */}
          <LinearGradient id={id} x1="0.42" y1="0" x2="0.58" y2="1">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="0.46" stopColor={gradient[1]} />
            <Stop offset="1" stopColor={gradient[2]} />
          </LinearGradient>
        </Defs>
      ) : null}
      <Rect x={0} y={0} width={w} height={h} fill={id ? `url(#${id})` : fill} />
      <G stroke={ink} strokeWidth={1.3} strokeLinecap="square" fill="none">
        <Rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
        <Line x1={x0 + alley} y1={y0} x2={x0 + alley} y2={y1} />
        <Line x1={x1 - alley} y1={y0} x2={x1 - alley} y2={y1} />
        <Line x1={x0 + alley} y1={y0 + box} x2={x1 - alley} y2={y0 + box} />
        <Line x1={x0 + alley} y1={y1 - box} x2={x1 - alley} y2={y1 - box} />
        <Line x1={w / 2} y1={y0 + box} x2={w / 2} y2={y1 - box} />
      </G>
      <Line x1={x0 - 3} y1={net} x2={x1 + 3} y2={net} stroke={ink} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;
/** The card's inner side margin, as the other pop-up cards': the words and the buttons share one left and right edge. */
const CARD_PAD = spacing.lg + spacing.xs;
const BUTTON_CORNER = radius.md;
const ROUND = 48;

const styleDefinitions = StyleSheet.create({
  layer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl },
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay },
  outside: { zIndex: 0 },
  box: { zIndex: 1, width: '100%', maxWidth: 332, maxHeight: '100%' },
  card: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...buttonShape.curve,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)',
  },
  wash: { position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  words: { alignItems: 'center', paddingHorizontal: CARD_PAD, paddingTop: spacing.lg },
  stage: { width: '100%', height: TILE_H + 34, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  glow: { position: 'absolute', width: GLOW, height: GLOW, left: '50%', top: '50%', marginLeft: -GLOW / 2, marginTop: -GLOW / 2 },
  tile: { width: TILE_W, height: TILE_H, borderRadius: TILE_R, backgroundColor: colors.bg, padding: RIM, boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.22)' },
  surface: { flex: 1, borderRadius: TILE_R - RIM, overflow: 'hidden' },
  sweep: { position: 'absolute', top: -TILE_H / 2, left: 0 },
  title: { ...typography.heading, ...font('700'), fontSize: 19, lineHeight: 24, color: colors.text, textAlign: 'center' },
  court: { ...typography.small, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: spacing.lg },
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  roundOff: { backgroundColor: colors.surfaceAlt, opacity: 0.6 },
  roundPressed: { transform: [{ scale: 0.92 }] },
  value: { flex: 1, alignItems: 'center', gap: 2 },
  number: { ...typography.display, ...font('700'), fontSize: 32, lineHeight: 38, color: colors.text, fontVariant: ['tabular-nums'] },
  till: { ...typography.small, fontSize: 14, color: colors.textMuted },
  tillLit: { ...font('600'), color: colors.brand },
  problem: { ...typography.small, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
  actions: { paddingHorizontal: CARD_PAD, paddingTop: spacing.lg + 2, paddingBottom: spacing.md, gap: 2 },
  notNow: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: BUTTON_CORNER },
  notNowPressed: { backgroundColor: colors.surfaceAlt },
  notNowText: { ...typography.bodyStrong, fontSize: buttonShape.label, color: colors.textMuted, textAlign: 'center' },
  notNowOff: { color: colors.textFaint },
  fine: { ...typography.small, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 2 },
});
