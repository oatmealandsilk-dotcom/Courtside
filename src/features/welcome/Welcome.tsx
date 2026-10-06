import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Submit } from '@/components/sheet/SheetForm';
import { holdLightStatusBar } from '@/lib/statusBarStyle';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing } from '@/theme';
import { COURT_ART, CourtHero, courtGeometry } from './CourtHero';

/** Side by side (the court on the left, the words on the right) from this width up: a desktop, a tablet on its side. */
const WIDE = 900;

/**
 * The first thing anyone sees: one big picture of a court with the name on
 * it, one line, and two ways in. On a phone the court fills the top of the
 * screen, under the status bar, and the words sit on a sheet that overlaps
 * it; on a wide screen the court is a panel on the left.
 */
export function Welcome({ onCreate, onLogIn }: { onCreate: () => void; onLogIn: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = screenWidth >= WIDE;
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || Math.abs(box.width - width) > 0.5 || Math.abs(box.height - height) > 0.5) setBox({ width, height });
  };
  // The court runs under the status bar on a phone, so its clock and battery are drawn light while this shows.
  useEffect(() => (wide ? undefined : holdLightStatusBar()), [wide]);

  // The name sits in the empty backcourt, clear of the lines and of the status bar.
  const court = box ? courtGeometry(box.width, box.height, wide) : null;
  const logoTop = court ? Math.max(wide ? spacing.xxl : insets.top + spacing.sm, court.baselineY + court.line) : 0;
  const logoBottom = court ? court.serviceY - court.line : 0;
  const markSize = wide ? 60 : 46;

  const hero = (
    <View onLayout={measure} style={wide ? styles.wideHero : styles.hero}>
      {box && court ? (
        <>
          <Animated.View entering={FadeIn.duration(700)} style={StyleSheet.absoluteFill}>
            <CourtHero width={box.width} height={box.height} wide={wide} />
          </Animated.View>
          <View pointerEvents="none" style={[styles.logoRoom, { top: logoTop, height: Math.max(0, logoBottom - logoTop) }]}>
            <Animated.View entering={FadeInDown.delay(180).duration(640)} style={[styles.lockup, { gap: markSize * 0.26 }]}>
              <BrandMark size={markSize} color={COURT_ART.line} />
              <Text allowFontScaling={false} accessibilityRole="header" style={[styles.wordmark, wide && styles.wordmarkWide]}>CourtSide</Text>
            </Animated.View>
          </View>
        </>
      ) : null}
    </View>
  );

  const words = (
    <>
      <Animated.View entering={FadeInDown.delay(260).duration(560)} style={styles.copy}>
        <Text maxFontSizeMultiplier={1.6} style={[styles.headline, wide && styles.headlineWide]}>
          Your tennis,{'\n'}<Text style={styles.accent}>all in one place.</Text>
        </Text>
        <Text maxFontSizeMultiplier={1.8} style={[styles.line, wide && styles.lineWide]}>
          Post your clips, find people to hit with, and ask real coaches.
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(360).duration(560)} style={styles.actions}>
        <Submit label="Create an account" onPress={onCreate} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityHint="For an account you already have"
          onPress={onLogIn}
          hitSlop={6}
          style={({ pressed }) => [styles.logIn, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.8} style={styles.logInText}>
            Already have an account? <Text style={styles.logInLink}>Log in</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </>
  );

  if (wide) {
    return (
      // A tablet on its side keeps the panel clear of its status bar and rounded corners.
      <View style={[styles.wideRoot, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg, paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}>
        {hero}
        <ScrollView style={styles.wideSide} contentContainerStyle={styles.wideSideInner} showsVerticalScrollIndicator={false}>
          <View style={styles.wideColumn}>{words}</View>
        </ScrollView>
      </View>
    );
  }
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
      {hero}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>{words}</View>
    </ScrollView>
  );
}

const SHEET_RADIUS = 30;

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1 },
  // Takes whatever height the words leave, never less than enough for the name and the T; larger text sizes scroll.
  hero: { flexGrow: 1, minHeight: 320, overflow: 'hidden', backgroundColor: COURT_ART.deep, marginBottom: -SHEET_RADIUS },
  logoRoom: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  wordmark: {
    ...font('600'), fontSize: 44, lineHeight: 50, letterSpacing: -1.9, color: COURT_ART.line,
    textShadowColor: 'rgba(8, 26, 14, 0.28)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 14,
  },
  wordmarkWide: { fontSize: 60, lineHeight: 66, letterSpacing: -2.6 },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: SHEET_RADIUS, borderTopRightRadius: SHEET_RADIUS,
    paddingTop: spacing.xxl, paddingHorizontal: spacing.xl, gap: spacing.xl,
    boxShadow: '0px -10px 30px rgba(8, 26, 14, 0.14)',
  },
  copy: { gap: spacing.md },
  headline: { ...font('600'), fontSize: 34, lineHeight: 38, letterSpacing: -1.3, color: colors.text },
  headlineWide: { fontSize: 52, lineHeight: 56, letterSpacing: -2.2 },
  accent: { color: colors.brand },
  line: { ...font('400'), fontSize: 17, lineHeight: 24, letterSpacing: -0.2, color: colors.textMuted, maxWidth: 340 },
  lineWide: { fontSize: 19, lineHeight: 28, maxWidth: 380 },
  actions: { gap: spacing.xs },
  // A text link, not a second button: tall enough to tap, quieter than the green one.
  logIn: { minHeight: 48, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  logInText: { ...font('400'), fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  logInLink: { ...font('600'), color: colors.brand },
  pressed: { opacity: 0.6 },
  // Wide: the court is a rounded panel inset from the window, the words a column beside it.
  wideRoot: { flex: 1, flexDirection: 'row', padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.bg },
  wideHero: { flex: 1.1, borderRadius: 28, overflow: 'hidden', backgroundColor: COURT_ART.deep },
  wideSide: { flex: 1 },
  wideSideInner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxxl, paddingVertical: spacing.xxxl },
  wideColumn: { width: '100%', maxWidth: 420, gap: spacing.xxl },
});
