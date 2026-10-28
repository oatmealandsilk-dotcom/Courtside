import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { type SharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { Avatar, Button } from '@/components/ui';
import type { User } from '@/data/types';
import { CourtTile, ordinal } from '@/features/courtUnlocks/DesignParts';
import { HAVE_IT, MY_COURTS, TO_UNLOCK } from '@/features/courtUnlocks/designDemo';
import { useApp } from '@/store/AppContext';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks, round 3): what the three Court
 * unlocked options share. The words that make it sting a little (who got
 * there first, which friend has the next one), Share to story, See your
 * courts, the close button, and the courts drawn from above at their real
 * size, so they sit on the map picture like the real thing.
 */

/** The new court and who else has it (made-up sample data). */
export function useUnlock() {
  const { users } = useApp();
  const court = MY_COURTS[0];
  const nth = MY_COURTS.length;
  const have = HAVE_IT[court.name] ?? { friends: [], total: 0 };
  const friends = have.friends.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const others = Math.max(0, have.total - friends.length);
  const firstNames = friends.map((u) => u.name.split(' ')[0]);
  const beatYou = firstNames.length > 1 ? `${firstNames.slice(0, -1).join(', ')} and ${firstNames[firstNames.length - 1]}` : firstNames[0];
  const next = TO_UNLOCK[0];
  const nextFriendId = HAVE_IT[next.name]?.friends[0];
  const nextFriend = nextFriendId ? users.find((u) => u.id === nextFriendId)?.name.split(' ')[0] : undefined;
  return { court, nth, have, friends, others, beatYou, next, nextFriend };
}

/** The two lines under the name: you against who got here first, and what's next near you. */
export function UnlockRows() {
  const styles = useThemedStyles(styleDefinitions);
  const { have, friends, others, beatYou, next, nextFriend } = useUnlock();
  return (
    <View style={styles.rows}>
      <Pressable accessibilityRole="button" accessibilityLabel={`You're the ${ordinal(have.total + 1)} player here.${beatYou ? ` ${beatYou} got here first.` : ''}`} onPress={() => {}} style={({ pressed }) => [styles.row, pressed && { opacity: PRESS_DIM }]}>
        <View style={styles.faces}>
          {friends.slice(0, 2).map((u, i) => (
            <View key={u.id} style={[styles.face, i > 0 && styles.faceOver]}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={34} />
            </View>
          ))}
          {others ? (
            <View style={[styles.face, friends.length ? styles.faceOver : null, styles.more]}>
              <Text maxFontSizeMultiplier={1.1} style={styles.moreText}>+{others}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rowWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle} numberOfLines={1}>You’re the {ordinal(have.total + 1)} player here</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub} numberOfLines={1}>{beatYou ? `${beatYou} got here first` : `${have.total} players got here first`}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel={`${TO_UNLOCK.length} more courts to unlock near you`} onPress={() => router.replace('/your-courts')} style={({ pressed }) => [styles.row, styles.rowLine, pressed && { opacity: PRESS_DIM }]}>
        <View style={styles.locks}>
          <View style={styles.lockA}><CourtTile size={30} unlocked={false} /></View>
          <View style={styles.lockB}><CourtTile size={30} unlocked={false} /></View>
        </View>
        <View style={styles.rowWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>{TO_UNLOCK.length} more to unlock near you</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowSub} numberOfLines={1}>{nextFriend ? `${nextFriend} has ${next.name.split(' ')[0]} · ${next.miles}` : `${next.name} · ${next.miles}`}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

export function UnlockActions() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.actions}>
      <Button label="Share to story" onPress={() => {}} full />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/your-courts')} style={({ pressed }) => [styles.second, pressed && { opacity: PRESS_DIM }]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.secondText}>See your courts</Text>
      </Pressable>
    </View>
  );
}

export function CloseButton({ top }: { top: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => router.back()} style={({ pressed }) => [styles.close, { top }, pressed && { opacity: PRESS_DIM }]}>
      <Ionicons name="close" size={20} color={colors.text} />
    </Pressable>
  );
}

const ARect = Animated.createAnimatedComponent(Rect);

/** A court's ground with its run-off, and the lines on it, in metres (ITF). */
const BAY_W = 18;
const BAY_L = 36;
const DOUBLES_W = 10.97;
const SINGLES_W = 8.23;
const LENGTH = 23.77;
const SERVICE = 6.4;

/** How big CourtsFromAbove draws, in points, before it is turned. */
export const footprintSize = (courts: number, pxPerM: number) => ({ width: courts * BAY_W * pxPerM, height: BAY_L * pxPerM });

/**
 * The courts as they look from above, side by side at their real size for
 * the map picture under them (`pxPerM`): the fence round them in your
 * colour, the lines inside. `draw` (0 to 1) traces the fence round and
 * `lines` brings the lines in, both on the UI thread; without them it is
 * simply drawn.
 */
export function CourtsFromAbove({ courts, pxPerM, draw, lines, weight = 2.4 }: { courts: number; pxPerM: number; draw?: SharedValue<number>; lines?: SharedValue<number>; weight?: number }) {
  useTheme();
  const k = pxPerM;
  const pad = weight;
  const { width: w, height: h } = footprintSize(courts, k);
  const W = w + pad * 2;
  const H = h + pad * 2;
  const round = 2 * (w + h);
  const ink = colors.brand;
  const fence = useAnimatedProps(() => {
    const d = draw ? draw.value : 1;
    return { strokeDashoffset: round * (1 - d), fillOpacity: 0.16 * d };
  });
  const linesIn = useAnimatedStyle(() => ({ opacity: lines ? lines.value : 1 }));
  const thin = Math.max(0.8, Math.min(1.3, k * 0.42));
  return (
    <View style={{ width: W, height: H }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, linesIn]}>
        <Svg width={W} height={H}>
          <G stroke={withAlpha(ink, 0.9)} strokeWidth={thin} fill="none">
            {Array.from({ length: courts }, (_, i) => {
              const cx = pad + (i + 0.5) * BAY_W * k;
              const top = pad + ((BAY_L - LENGTH) / 2) * k;
              const net = top + (LENGTH / 2) * k;
              const dl = cx - (DOUBLES_W / 2) * k;
              const sl = cx - (SINGLES_W / 2) * k;
              const sr = cx + (SINGLES_W / 2) * k;
              return (
                <G key={i}>
                  <Rect x={dl} y={top} width={DOUBLES_W * k} height={LENGTH * k} fill={withAlpha(ink, 0.12)} />
                  <Line x1={sl} y1={top} x2={sl} y2={top + LENGTH * k} />
                  <Line x1={sr} y1={top} x2={sr} y2={top + LENGTH * k} />
                  <Line x1={sl} y1={net - SERVICE * k} x2={sr} y2={net - SERVICE * k} />
                  <Line x1={sl} y1={net + SERVICE * k} x2={sr} y2={net + SERVICE * k} />
                  <Line x1={cx} y1={net - SERVICE * k} x2={cx} y2={net + SERVICE * k} />
                  <Line x1={dl - 0.9 * k} y1={net} x2={dl + DOUBLES_W * k + 0.9 * k} y2={net} strokeWidth={thin * 1.5} />
                  {i > 0 ? <Line x1={pad + i * BAY_W * k} y1={pad} x2={pad + i * BAY_W * k} y2={pad + h} stroke={withAlpha(ink, 0.45)} /> : null}
                </G>
              );
            })}
          </G>
        </Svg>
      </Animated.View>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <ARect x={pad} y={pad} width={w} height={h} rx={2} stroke={ink} strokeWidth={weight} fill={ink} strokeDasharray={`${round} ${round}`} animatedProps={fence} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  rows: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  faces: { flexDirection: 'row', alignItems: 'center', width: 102 },
  face: { borderRadius: 19, borderWidth: 2, borderColor: colors.bg },
  // Overlapping only by about the rim, so "SO" and "ML" are never cut by the face after.
  faceOver: { marginLeft: -6 },
  more: { minWidth: 38, height: 38, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  moreText: { ...font('700'), fontSize: 12, color: colors.text, fontVariant: ['tabular-nums'] },
  rowWords: { flex: 1, gap: 2 },
  rowTitle: { ...typography.bodyStrong, color: colors.text },
  rowSub: { ...typography.small, color: colors.textMuted },
  locks: { width: 102, flexDirection: 'row', alignItems: 'center' },
  lockA: { transform: [{ rotate: '-6deg' }] },
  lockB: { marginLeft: -6, marginTop: 8, transform: [{ rotate: '5deg' }] },
  actions: { gap: 2, paddingTop: spacing.lg },
  second: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondText: { ...typography.bodyStrong, color: colors.text },
  close: { position: 'absolute', right: 14, zIndex: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.18)' },
});
