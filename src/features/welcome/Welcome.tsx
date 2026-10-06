import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, ReduceMotion } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';
import { Submit } from '@/components/sheet/SheetForm';
import { useGateSpace } from '@/lib/useGateSpace';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, withAlpha } from '@/theme';
import { MOMENTS, MOMENT_H, MOMENT_W, Moment } from './Moments';

/** From this width up (a desktop, a tablet) everything is one centred column, rather than the buttons sitting at the foot of a tall window. */
const WIDE = 768;
/** How long each moment stays before the next. */
const HOLD_MS = 3400;

/**
 * An oval glow. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore
 * rx/ry and draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const oval = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

/** The cream (or the dark page) with the session cards' two corner glows, sage and peach, barely there. */
function Glow() {
  const { theme } = useTheme();
  // The court's name is in the ids: iOS keeps a gradient by id and would not repaint one whose colours changed.
  const id = theme.replace(/[^a-zA-Z0-9]/g, '');
  // On a dark page the same glows read stronger, so they are drawn at about half.
  const a = pageIsDark() ? 0.5 : 1;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={`welcome-top-${id}`} {...oval(100, 0, 95, 60)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.cardGlowTop} stopOpacity={0.6 * a} />
            <Stop offset="1" stopColor={colors.cardGlowTop} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`welcome-bottom-${id}`} {...oval(0, 100, 95, 60)} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.cardGlowBottom} stopOpacity={0.5 * a} />
            <Stop offset="1" stopColor={colors.cardGlowBottom} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#welcome-top-${id})`} />
        <Rect x="0" y="0" width="100" height="100" fill={`url(#welcome-bottom-${id})`} />
      </Svg>
    </View>
  );
}

/**
 * The first thing anyone sees shows the app rather than describing it: the
 * name small at the top, then three moments of CourtSide that play in turn
 * (the map of who's playing, a session card, your tennis people), each with
 * its one line, dots to show where you are, and the two ways in at the foot.
 * A swipe moves between them and a touch holds one; with Reduce Motion the
 * first stays still and nothing moves on its own.
 */
export function Welcome({ onCreate, onLogIn }: { onCreate: () => void; onLogIn: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  useTheme();
  const { width } = useWindowDimensions();
  const space = useGateSpace();
  const wide = width >= WIDE;
  const reduced = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [back, setBack] = useState(false);
  const [held, setHeld] = useState(false);
  // Bumped by a swipe or a dot, so the wait for the next moment starts again from there.
  const [nudge, setNudge] = useState(0);
  const go = (next: number, backwards = false) => {
    setBack(backwards);
    setIndex(((next % MOMENTS.length) + MOMENTS.length) % MOMENTS.length);
    setNudge((n) => n + 1);
  };
  useEffect(() => {
    if (reduced || held) return;
    const t = setTimeout(() => { setBack(false); setIndex((i) => (i + 1) % MOMENTS.length); }, HOLD_MS);
    return () => clearTimeout(t);
  }, [index, reduced, held, nudge]);

  // A swipe left or right moves a moment; any touch on the stage holds it until the finger lifts.
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;
  const swipe = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => setHeld(true),
    onPanResponderRelease: (_, g) => {
      setHeld(false);
      if (g.dx < -40) goRef.current(indexRef.current + 1);
      else if (g.dx > 40) goRef.current(indexRef.current - 1, true);
      else setNudge((n) => n + 1);
    },
    onPanResponderTerminate: () => { setHeld(false); setNudge((n) => n + 1); },
  }), []);

  // The moments are drawn in one 320 × 400 box, scaled to the room the stage has.
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const measure = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!room || Math.abs(room.width - w) > 0.5 || Math.abs(room.height - h) > 0.5) setRoom({ width: w, height: h });
  };
  const scale = room ? Math.max(0.5, Math.min(room.width / MOMENT_W, room.height / MOMENT_H, 1.15)) : 1;
  const entering = (back ? FadeInLeft : FadeInRight).duration(460).reduceMotion(ReduceMotion.System);
  const leaving = FadeOut.duration(220).reduceMotion(ReduceMotion.System);
  const moment = MOMENTS[index];

  const lockup = (
    <Animated.View entering={FadeIn.duration(500).reduceMotion(ReduceMotion.System)} style={styles.lockup}>
      <BrandMark size={26} />
      <Text allowFontScaling={false} accessibilityRole="header" style={styles.wordmark}>CourtSide</Text>
    </Animated.View>
  );
  const stage = (
    <View
      {...swipe.panHandlers}
      onLayout={measure}
      style={wide ? styles.stageWide : styles.stage}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${moment.headline} ${moment.spoken}`}
      accessibilityValue={{ text: `${index + 1} of ${MOMENTS.length}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? go(index + 1) : go(index - 1, true))}
    >
      {room ? (
        // Laid over the stage rather than in it, so the box's own size never pushes the stage taller than its room.
        <View pointerEvents="none" style={{ position: 'absolute', left: (room.width - MOMENT_W) / 2, top: (room.height - MOMENT_H) / 2, width: MOMENT_W, height: MOMENT_H, transform: [{ scale }] }}>
          <Animated.View key={index} entering={entering} exiting={leaving} style={StyleSheet.absoluteFill}>
            <Moment index={index} />
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
  const words = (
    <View style={styles.words}>
      {/* The longest line, unseen, holds the room so the buttons never jump as the lines change. */}
      <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" maxFontSizeMultiplier={1.5} style={[styles.headline, wide && styles.headlineWide, styles.sizer]}>
        {MOMENTS.reduce((a, m) => (m.headline.split('\n').length > a.split('\n').length ? m.headline : a), MOMENTS[0].headline as string)}
      </Text>
      <Animated.Text key={index} entering={FadeIn.duration(420).reduceMotion(ReduceMotion.System)} exiting={leaving} maxFontSizeMultiplier={1.5} style={[styles.headline, wide && styles.headlineWide, styles.headlineShown]} importantForAccessibility="no" accessibilityElementsHidden>
        {moment.headline}
      </Animated.Text>
    </View>
  );
  const dots = (
    <View style={styles.dots}>
      {MOMENTS.map((m, i) => (
        <Pressable key={m.headline} onPress={() => go(i, i < index)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Show ${i + 1} of ${MOMENTS.length}`} accessibilityState={{ selected: i === index }}>
          <View style={[styles.dot, { width: i === index ? 20 : 6, backgroundColor: i === index ? colors.brand : withAlpha(colors.text, 0.18) }]} />
        </Pressable>
      ))}
    </View>
  );
  const actions = (
    <Animated.View entering={FadeIn.delay(250).duration(500).reduceMotion(ReduceMotion.System)} style={styles.actions}>
      <Submit label="Create an account" onPress={onCreate} />
      <Pressable accessibilityRole="button" accessibilityLabel="Log in" onPress={onLogIn} hitSlop={6} style={({ pressed }) => [styles.logIn, pressed && styles.pressed]}>
        <Text maxFontSizeMultiplier={1.8} style={styles.logInText}>Log in</Text>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.root}>
      <Glow />
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: wide ? spacing.xxxl : space.header, paddingBottom: wide ? spacing.xxxl : space.footer }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={wide ? styles.wideColumn : styles.column}>
          {lockup}
          {stage}
          {words}
          {dots}
          {actions}
        </View>
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // Larger text sizes make the page scroll rather than squash the buttons.
  page: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  column: { flexGrow: 1 },
  wideColumn: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wordmark: { ...font('600'), fontSize: 24, lineHeight: 28, letterSpacing: -0.9, color: colors.brand },
  // The stage takes the height the rest leaves (never under 260, so a small phone scrolls instead).
  stage: { flexGrow: 1, minHeight: 260, marginTop: spacing.xl },
  stageWide: { height: 470, marginTop: spacing.xxl },
  words: { marginTop: spacing.xl, paddingHorizontal: spacing.sm },
  headline: { ...font('600'), fontSize: 28, lineHeight: 33, letterSpacing: -0.9, color: colors.text, textAlign: 'center' },
  headlineWide: { fontSize: 32, lineHeight: 38, letterSpacing: -1.1 },
  sizer: { opacity: 0 },
  headlineShown: { position: 'absolute', left: spacing.sm, right: spacing.sm, top: 0 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.lg, height: 12 },
  dot: { height: 6, borderRadius: 3 },
  actions: { gap: spacing.xs, marginTop: spacing.xl },
  // A text link, not a second button: tall enough to tap, quieter than the green one.
  logIn: { minHeight: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  logInText: { ...font('600'), fontSize: 16, lineHeight: 22, color: colors.brand, textAlign: 'center' },
  pressed: { opacity: 0.6 },
});
