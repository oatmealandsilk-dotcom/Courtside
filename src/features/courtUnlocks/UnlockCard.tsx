import React, { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';
import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { BrandWash } from '@/components/ui/BrandWash';
import { NEW_COURT_FACTS } from '@/features/courtUnlocks/designDemo';
import { pxPerMetre } from '@/features/courtUnlocks/mapMath';
import { CloseButton, CourtsFromAbove, UnlockActions, UnlockRows, footprintSize, useUnlock } from '@/features/courtUnlocks/UnlockParts';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, wordmarkFont, withAlpha } from '@/theme';
import { corner } from '@/theme/look';
import { TextScale } from '@/theme/textScale';

const CARD_ZOOM = 17;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * DESIGN BRANCH ONLY. Court unlocked, option B, "Card" (round 3). The
 * court arrives as a card to keep, the same card it becomes in Your
 * courts: it rises face down (your colour, the CourtSide mark) over the
 * court's own map, turns over once, and a single light runs across it.
 * On it: No. 6, the day, the courts drawn from above on their block of map,
 * the name, and three facts. The map behind fills the screen, faded into
 * the page. One turn, one light, nothing loops; on the UI thread; Reduce
 * Motion: face up already.
 */
export function UnlockCard() {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const { court, nth } = useUnlock();
  const W = Math.min(width, 560);
  // Smaller on a short phone, so the card, the two lines and the buttons always fit on one screen.
  const CW = Math.min(W - 2 * 42, 310, Math.round((height - 450) / 1.2));
  const CH = Math.round(CW * 1.2);
  const MW = CW - 24;
  // The map window takes whatever the card has left under its name (one line or two), so the card never
  // has an empty band in it; the picture is drawn this tall and the window shows its middle.
  const MH = Math.round(CH * 0.62);
  const k = pxPerMetre(CARD_ZOOM, court.lat);
  const foot = footprintSize(NEW_COURT_FACTS.courts, k);

  // 0: face down, 1: face up.
  const turn = useSharedValue(still ? 1 : 0);
  const rise = useSharedValue(still ? 1 : 0);
  const light = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return undefined;
    rise.value = withTiming(1, { duration: 700, easing: EASE });
    turn.value = withDelay(380, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    light.value = withDelay(1200, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }));
    const t = setTimeout(() => haptics.reward(), 1180);
    return () => clearTimeout(t);
  }, [still, turn, rise, light]);
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: 46 * (1 - rise.value) }, { scale: 0.9 + 0.1 * rise.value }] }));
  const front = useAnimatedStyle(() => ({
    opacity: turn.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateY: `${180 * (1 - turn.value) }deg` }],
  }));
  const back = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateY: `${-180 * turn.value}deg` }],
  }));
  const sweep = useAnimatedStyle(() => ({
    opacity: light.value > 0 && light.value < 1 ? 1 : 0,
    transform: [{ translateX: -CW * 0.7 + CW * 1.9 * light.value }, { rotate: '18deg' }],
  }));

  return (
    <View style={styles.page}>
      <CourtMapSnapshots />
      {/* The court's own map, the whole screen, fading into the page where the words are. */}
      <View pointerEvents="none" style={[styles.ground, { width: W, height }]}>
        <CourtMapThumb lat={court.lat} lng={court.lng} width={W} height={height} zoom={15.4} />
        <Svg width={W} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="cardFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.5} />
              <Stop offset="0.4" stopColor={colors.bg} stopOpacity={0.62} />
              <Stop offset="0.58" stopColor={colors.bg} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={height} fill="url(#cardFade)" />
        </Svg>
      </View>
      <CloseButton top={insets.top + 10} />

      <View style={[styles.body, { paddingTop: insets.top + 58, paddingBottom: insets.bottom + spacing.lg }]}>
        {/* The card, centred in the room above the words; the words and buttons sit at the bottom as in A and C. */}
        <View style={styles.hero}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.over}>Court unlocked</Text>
          <Animated.View style={[styles.cardSlot, { width: CW, height: CH }, lifted]}>
            {/* Face down: your colour and the CourtSide mark. */}
            <Animated.View style={[styles.face, styles.back, { width: CW, height: CH }, back]}>
              <BrandWash glow radius={corner(20)} />
              <View style={styles.backRim} />
              <BrandMark size={Math.round(CW * 0.3)} color={colors.brandInk} />
            </Animated.View>
            {/* Face up. */}
            <Animated.View style={[styles.face, styles.front, { width: CW, height: CH }, front]}>
              <View style={styles.top}>
                <Text maxFontSizeMultiplier={1.1} style={styles.no}>No. {nth}</Text>
                <Text maxFontSizeMultiplier={1.1} style={styles.day}>{NEW_COURT_FACTS.day}</Text>
              </View>
              <View style={[styles.window, { width: MW }]}>
                <View style={{ width: MW, height: MH }}>
                  <CourtMapThumb lat={court.lat} lng={court.lng} width={MW} height={MH} zoom={CARD_ZOOM} />
                  <View pointerEvents="none" style={[styles.foot, { left: MW / 2 - foot.width / 2 - 2, top: MH / 2 - foot.height / 2 - 2 }]}>
                    <CourtsFromAbove courts={NEW_COURT_FACTS.courts} pxPerM={k} weight={2} />
                  </View>
                </View>
              </View>
              <Text maxFontSizeMultiplier={1.15} style={styles.name} numberOfLines={2}>{court.name}</Text>
              <View style={styles.facts}>
                <Fact value={NEW_COURT_FACTS.surface} label="Surface" />
                <View style={styles.factLine} />
                <Fact value={String(NEW_COURT_FACTS.courts)} label="Courts" />
                <View style={styles.factLine} />
                <Fact value={NEW_COURT_FACTS.fromHome} label="From home" />
              </View>
              {/* One light across the card as it lands. */}
              <Animated.View pointerEvents="none" style={[styles.sweep, { height: CH * 1.6, top: -CH * 0.3 }, sweep]}>
                <Svg width={70} height={CH * 1.6}>
                  <Defs>
                    <LinearGradient id="cardLight" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={colors.surface} stopOpacity={0} />
                      <Stop offset="0.5" stopColor={colors.surface} stopOpacity={0.55} />
                      <Stop offset="1" stopColor={colors.surface} stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect x={0} y={0} width={70} height={CH * 1.6} fill="url(#cardLight)" />
                </Svg>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>

        <View style={styles.rows}><UnlockRows /></View>
        <UnlockActions />
      </View>
    </View>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.fact}>
      <Text maxFontSizeMultiplier={1.1} style={styles.factValue} numberOfLines={1}>{value}</Text>
      <Text maxFontSizeMultiplier={1.1} style={styles.factLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center' },
  ground: { position: 'absolute', top: 0, overflow: 'hidden' },
  body: { width: '100%', maxWidth: 560, flex: 1, paddingHorizontal: spacing.lg + 4 },
  over: { ...font('600'), fontSize: 16, color: colors.brand, textAlign: 'center' },
  hero: { flex: 1, justifyContent: 'center', paddingBottom: spacing.sm },
  cardSlot: { alignSelf: 'center', marginTop: 14 },
  face: { position: 'absolute', left: 0, top: 0, borderRadius: corner(20), backfaceVisibility: 'hidden', overflow: 'hidden' },
  back: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  backRim: { position: 'absolute', left: 10, right: 10, top: 10, bottom: 10, borderRadius: corner(13), borderWidth: 1.5, borderColor: withAlpha(colors.brandInk, 0.35) },
  front: { ...lift, backgroundColor: colors.cardFill, borderWidth: StyleSheet.hairlineWidth, borderColor: withAlpha(colors.text, 0.14), padding: 12 },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 10 },
  no: { ...wordmarkFont('900'), fontSize: 22, letterSpacing: -0.8, color: colors.cardFigure, fontVariant: ['tabular-nums'] },
  day: { ...font('600'), fontSize: 12, color: colors.cardMuted },
  window: { flex: 1, borderRadius: corner(12), overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  foot: { position: 'absolute', transform: [{ rotate: '-20deg' }] },
  name: { ...font('700'), fontSize: 22, lineHeight: 25, letterSpacing: -0.6, color: colors.cardInk, marginTop: 12, paddingHorizontal: 2 },
  facts: { flexDirection: 'row', alignItems: 'stretch', marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(colors.cardInk, 0.2) },
  fact: { flex: 1, alignItems: 'center', gap: 1 },
  factLine: { width: StyleSheet.hairlineWidth, backgroundColor: withAlpha(colors.cardInk, 0.2) },
  factValue: { ...font('700'), fontSize: 15, color: colors.cardInk, fontVariant: ['tabular-nums'] },
  factLabel: { ...font('500'), fontSize: 11, color: colors.cardMuted },
  sweep: { position: 'absolute', left: 0, width: 70 },
  rows: { marginTop: spacing.md },
});
