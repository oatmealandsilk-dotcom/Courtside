import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInUp, ReduceMotion } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';
import { Submit } from '@/components/sheet/SheetForm';
import { useGateSpace } from '@/lib/useGateSpace';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing } from '@/theme';

/** From this width up (a desktop, a tablet) everything is one centred group, rather than the buttons sitting at the foot of a tall window. */
const WIDE = 768;

/**
 * An oval glow. Phones draw an SVG radial gradient's rx/ry as an oval; browsers ignore
 * rx/ry and draw a circle, so on the web the same oval is drawn with a gradientTransform.
 */
const oval = (cx: number, cy: number, rx: number, ry: number) => (Platform.OS === 'web'
  ? { cx: 0, cy: 0, r: 1, gradientTransform: `translate(${cx} ${cy}) scale(${rx} ${ry})` }
  : { cx, cy, rx, ry });

/**
 * The page's ground: the cream (or the dark page), with the same two corner
 * glows as the app's session cards, sage high on the right and peach low on
 * the left, barely there.
 */
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
 * The first thing anyone sees, in Instagram's rhythm: the name, centred a
 * little above the middle with plenty of room round it, one line under it,
 * and the two ways in at the foot of the screen where a thumb is: the green
 * "Create an account" and a quiet "Log in".
 */
export function Welcome({ onCreate, onLogIn }: { onCreate: () => void; onLogIn: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const space = useGateSpace();
  const wide = width >= WIDE;

  const name = (
    <View style={styles.name}>
      {/* One gentle entrance: the name rises into place; still for Reduce Motion. */}
      <Animated.View entering={FadeInUp.duration(700).reduceMotion(ReduceMotion.System)} style={styles.lockup}>
        <BrandMark size={wide ? 52 : 46} />
        <Text allowFontScaling={false} accessibilityRole="header" style={[styles.wordmark, wide && styles.wordmarkWide]}>CourtSide</Text>
      </Animated.View>
      <Animated.Text entering={FadeIn.delay(250).duration(700).reduceMotion(ReduceMotion.System)} maxFontSizeMultiplier={1.8} style={styles.line}>
        Your tennis, all in one place.
      </Animated.Text>
    </View>
  );
  const actions = (
    <Animated.View entering={FadeIn.delay(400).duration(700).reduceMotion(ReduceMotion.System)} style={styles.actions}>
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
        contentContainerStyle={[styles.page, { paddingTop: space.top, paddingBottom: space.footer }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {wide ? (
          // A desktop: one centred column, the name and the buttons together.
          <View style={styles.wideColumn}>
            {name}
            {actions}
          </View>
        ) : (
          <>
            {/* The name sits a little above the middle of the room the buttons leave. */}
            <View style={[styles.middle, { paddingBottom: height * 0.08 }]}>{name}</View>
            {actions}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // Larger text sizes make the page scroll rather than squash the buttons.
  page: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center' },
  middle: { flexGrow: 1, justifyContent: 'center' },
  name: { alignItems: 'center', gap: spacing.md },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wordmark: { ...font('600'), fontSize: 42, lineHeight: 48, letterSpacing: -1.8, color: colors.brand },
  wordmarkWide: { fontSize: 48, lineHeight: 54, letterSpacing: -2.1 },
  line: { ...font('400'), fontSize: 17, lineHeight: 24, letterSpacing: -0.2, color: colors.textMuted, textAlign: 'center' },
  actions: { gap: spacing.xs, width: '100%' },
  // A text link, not a second button: tall enough to tap, quieter than the green one.
  logIn: { minHeight: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  logInText: { ...font('600'), fontSize: 16, lineHeight: 22, color: colors.brand, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  wideColumn: { width: '100%', maxWidth: 360, alignSelf: 'center', alignItems: 'center', gap: 56 },
});
