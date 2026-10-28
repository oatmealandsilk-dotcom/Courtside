import { PRESS_DIM } from '@/theme/press';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { CourtMapSnapshots, CourtMapThumb } from '@/components/map/CourtMapThumb';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { Avatar, Button } from '@/components/ui';
import type { User } from '@/data/types';
import { CourtTile, UnlockStamp } from '@/features/courtUnlocks/DesignParts';
import { HAVE_IT, MY_COURTS, TO_UNLOCK } from '@/features/courtUnlocks/designDemo';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { corner } from '@/theme/look';
import { TextScale } from '@/theme/textScale';

/**
 * DESIGN BRANCH ONLY (design/court-unlocks, round 2): the "Court unlocked"
 * moment, redone louder (owner, Oct 27: "the court unlocked thing looks too
 * ai and basic. make it more fomo feeling").
 *
 * It takes the whole screen, like a stamp in a passport: the court's own
 * block of map edge to edge, its mark in your colour in the middle, and a
 * round stamp ("6th court", the court's name and the day round the ring)
 * that lands once. Under it the court's name, big; who else has this court
 * (friends by name, everyone else a number); the courts near you still to
 * unlock; and Share to story. On a phone the map settles in from a touch
 * closer, two thin rings open out from the mark and the stamp lands with
 * one tap of the haptics, all on the UI thread; Reduce Motion: already
 * there. No confetti, no glow, no bars.
 */
export default function CourtUnlocked() {
  const styles = useThemedStyles(styleDefinitions);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { users } = useApp();
  const still = useReducedMotion();
  const court = MY_COURTS[0];
  const nth = MY_COURTS.length;
  const W = Math.min(width, 560);
  const MAP_H = Math.round(Math.min(Math.max(height * 0.58, 360), 540));
  const have = HAVE_IT[court.name] ?? { friends: [], total: 0 };
  const friends = have.friends.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const others = Math.max(0, have.total - friends.length);

  // One settle, one stamp: nothing loops.
  const settle = useSharedValue(still ? 1 : 0);
  const stamp = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return undefined;
    settle.value = withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) });
    stamp.value = withDelay(520, withSpring(1, { damping: 11, stiffness: 190, mass: 0.7 }));
    const t = setTimeout(() => haptics.reward(), 640);
    return () => clearTimeout(t);
  }, [still, settle, stamp]);
  const mapIn = useAnimatedStyle(() => ({ transform: [{ scale: 1.14 - 0.14 * settle.value }] }));
  const ringIn = useAnimatedStyle(() => ({ transform: [{ scale: 0.35 + 0.65 * settle.value }], opacity: settle.value }));
  const stampIn = useAnimatedStyle(() => ({
    transform: [{ scale: 1.9 - 0.9 * stamp.value }, { rotate: `${-26 + 16 * stamp.value}deg` }],
    opacity: Math.min(1, stamp.value * 2.5),
  }));

  const close = () => router.back();
  const markTop = Math.round(MAP_H * 0.4);
  return (
    <View style={styles.page}>
      <View style={[styles.mapBox, { width: W, height: MAP_H }]}>
        <CourtMapSnapshots />
        <Animated.View style={[StyleSheet.absoluteFill, mapIn]}>
          <CourtMapThumb lat={court.lat} lng={court.lng} width={W} height={MAP_H} zoom={15.6} />
        </Animated.View>
        {/* The map runs into the page: a plain fade to the page's colour, under the words. */}
        <Svg pointerEvents="none" width={W} height={MAP_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="unlockFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity={0.35} />
              <Stop offset="0.16" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={MAP_H} fill="url(#unlockFade)" />
        </Svg>
        {/* The court's mark, in your colour, with two thin rings opening out from it once. */}
        <View pointerEvents="none" style={[styles.markWrap, { top: markTop - 90 }]}>
          <Animated.View style={[styles.rings, ringIn]}>
            <View style={[styles.ring, { width: 180, height: 180, borderRadius: 90, borderColor: withAlpha(colors.brand, 0.28) }]} />
            <View style={[styles.ring, { width: 118, height: 118, borderRadius: 59, borderColor: withAlpha(colors.brand, 0.55) }]} />
          </Animated.View>
          <View style={styles.mark}>
            <CourtGlyph size={28} color={colors.brandInk} />
          </View>
        </View>
        <Animated.View pointerEvents="none" style={[styles.stamp, { top: MAP_H - 200 }, stampIn]}>
          <UnlockStamp nth={nth} top={court.name} bottom="Oct 27 · 2026" size={122} />
        </Animated.View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={({ pressed }) => [styles.close, { top: insets.top + 10 }, pressed && { opacity: PRESS_DIM }]}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.body, { marginTop: -76, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.over}>Court unlocked</Text>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.name} numberOfLines={3}>{court.name}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>Clay · 3 courts · 2.1 mi from home</Text>

        <View style={styles.rows}>
          {/* Who else has it: friends by name, everyone else a number. */}
          <Pressable accessibilityRole="button" accessibilityLabel={`${friends.map((u) => u.name.split(' ')[0]).join(', ')} and ${others} other players have this court`} onPress={() => {}} style={({ pressed }) => [styles.row, pressed && { opacity: PRESS_DIM }]}>
            <View style={styles.faces}>
              {friends.slice(0, 2).map((u, i) => (
                <View key={u.id} style={[styles.face, i > 0 && styles.faceOver]}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={34} />
                </View>
              ))}
              <View style={[styles.face, styles.faceOver, styles.more]}>
                <Text maxFontSizeMultiplier={1.1} style={styles.moreText}>+{others}</Text>
              </View>
            </View>
            <View style={styles.rowWords}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle} numberOfLines={1}>{friends.map((u) => u.name.split(' ')[0]).join(', ')} + {others} players</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub} numberOfLines={1}>have this court too</Text>
            </View>
          </Pressable>
          {/* What's next: the public courts near you still to unlock. */}
          <Pressable accessibilityRole="link" accessibilityLabel={`${TO_UNLOCK.length} more courts to unlock near you`} onPress={() => router.replace('/your-courts')} style={({ pressed }) => [styles.row, styles.rowLine, pressed && { opacity: PRESS_DIM }]}>
            <View style={styles.locks}>
              <View style={styles.lockA}><CourtTile size={30} unlocked={false} /></View>
              <View style={styles.lockB}><CourtTile size={30} unlocked={false} /></View>
            </View>
            <View style={styles.rowWords}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>{TO_UNLOCK.length} more to unlock near you</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub} numberOfLines={1}>{TO_UNLOCK[0].name} · {TO_UNLOCK[0].miles}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Button label="Share to story" onPress={() => {}} full />
          <Pressable accessibilityRole="link" onPress={() => router.replace('/your-courts')} style={({ pressed }) => [styles.second, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.secondText}>See your courts</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center' },
  mapBox: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  markWrap: { position: 'absolute', left: 0, right: 0, height: 180, alignItems: 'center', justifyContent: 'center' },
  rings: { position: 'absolute', width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1.5 },
  mark: { width: 66, height: 66, borderRadius: corner(17), backgroundColor: colors.brand, borderWidth: 4, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.28)' },
  stamp: { position: 'absolute', right: 14 },
  close: { position: 'absolute', right: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.18)' },
  body: { width: '100%', maxWidth: 560, flex: 1, paddingHorizontal: spacing.lg + 4 },
  over: { ...font('700'), fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.brand },
  name: { ...font('700'), fontSize: 40, lineHeight: 42, letterSpacing: -1.5, color: colors.text, marginTop: 6 },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 10 },
  rows: { marginTop: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  faces: { flexDirection: 'row', alignItems: 'center', width: 86 },
  face: { borderRadius: 19, borderWidth: 2, borderColor: colors.bg },
  faceOver: { marginLeft: -10 },
  more: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  moreText: { ...font('700'), fontSize: 12, color: colors.text, fontVariant: ['tabular-nums'] },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowSub: { ...typography.small, color: colors.textMuted },
  locks: { width: 86, flexDirection: 'row', alignItems: 'center' },
  lockA: { transform: [{ rotate: '-6deg' }] },
  lockB: { marginLeft: -6, marginTop: 8, transform: [{ rotate: '5deg' }] },
  actions: { marginTop: 'auto', gap: 2, paddingTop: spacing.lg },
  second: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondText: { ...typography.bodyStrong, color: colors.text },
});
