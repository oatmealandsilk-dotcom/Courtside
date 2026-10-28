import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { DESIGN_FRIENDS, DESIGN_REGULARS, isDesignRegular, setDesignRegular, subscribeDesignRegular } from '@/features/courtUnlocks/designDemo';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks, round 2). On a court's card,
 * right under its name (owner, Oct 27: "make it a bar above played here,
 * below alder park ... it says 'regulars here' and you can add yourself in
 * there too ... scroll side to side, like how the current bar works on our
 * map"): the people who chose to mark this court as one of theirs, as a
 * row of chips that scrolls sideways, the map's chip bar in shape.
 *
 * Who shows: friends first, then anyone else who marked it, by their own
 * choice; a teen only to their friends. "3 here now" is a number only: a
 * friend there now wears the live ring and "here", a stranger never does.
 * "Add yourself" leads the row; once on, it is you, "You're a regular".
 */
export function RegularsBar({ court }: { court: { name: string } }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser } = useApp();
  const mine = useSyncExternalStore(subscribeDesignRegular, () => isDesignRegular(court.name), () => false);
  const data = DESIGN_REGULARS[court.name] ?? { ids: [], hereNow: 0, friendsHere: [] };
  const people = data.ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u)
    // A teen shows only to their friends; everyone else shown chose to mark the court.
    .filter((u) => DESIGN_FRIENDS.has(u.id) || !notKnownAdult(u));
  const total = data.ids.length + (mine ? 1 : 0);
  const toggle = () => { haptics.tap(); setDesignRegular(court.name, !mine); };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Regulars here</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.count}>{total ? `${total} ${total === 1 ? 'regular' : 'regulars'}` : 'None yet'}</Text>
        {data.hereNow ? (
          <View style={styles.now} accessibilityLabel={`${data.hereNow} here now`}>
            <LiveDot />
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nowText}>{data.hereNow} here now</Text>
          </View>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {mine && currentUser ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: true }} accessibilityLabel={`You're a regular at ${court.name}. Tap to take yourself off`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.chip, styles.chipMine, pressed && styles.pressed]}>
            <View>
              <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} />
              <View style={styles.tick}><Ionicons name="checkmark" size={9} color={colors.brandInk} /></View>
            </View>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.chipText, styles.chipTextMine]}>You’re a regular</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: false }} accessibilityLabel={`Add yourself as a regular at ${court.name}`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.chip, styles.chipAdd, pressed && styles.pressed]}>
            <View style={styles.plus}><Ionicons name="add" size={18} color={colors.brandInk} /></View>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.chipText, styles.chipTextAdd]}>Add yourself</Text>
          </Pressable>
        )}
        {people.map((u) => {
          const here = data.friendsHere.includes(u.id);
          const first = u.name.split(' ')[0];
          return (
            <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${first}${here ? ', here now' : ''}. Open profile`} onPress={() => router.push(`/user/${u.id}`)} hitSlop={4} style={({ pressed }) => [styles.chip, here && styles.chipHere, pressed && styles.pressed]}>
              <View style={here ? styles.ringHere : styles.ringNone}>
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={here ? 24 : 28} />
              </View>
              <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.chipText}>{first}</Text>
              {here ? <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.hereWord}>here</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** The live dot beside "3 here now": a steady dot with one ring breathing out of it, on the UI thread. Still with Reduce Motion. */
function LiveDot() {
  const styles = useThemedStyles(styleDefinitions);
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 1.6 }], opacity: 0.55 * (1 - t.value) }));
  return (
    <View style={styles.dotBox}>
      {still ? null : <Animated.View style={[styles.dotRing, ring]} />}
      <View style={styles.dot} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 2, paddingBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: spacing.lg },
  title: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  now: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto', alignSelf: 'center' },
  nowText: { ...typography.smallStrong, color: colors.open, fontVariant: ['tabular-nums'] },
  dotBox: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.open },
  dotRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.open },
  row: { gap: 6, paddingHorizontal: spacing.lg, alignItems: 'center' },
  // The map's chip, a touch taller to hold a face.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingLeft: 4, paddingRight: 13, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipAdd: { paddingLeft: 4, borderColor: withAlpha(colors.brand, 0.45), borderStyle: 'dashed', backgroundColor: colors.brandDim },
  chipMine: { backgroundColor: colors.brandDim, borderColor: withAlpha(colors.brand, 0.45) },
  chipHere: { borderColor: withAlpha(colors.open, 0.55) },
  plus: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  chipText: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  chipTextAdd: { color: colors.brand },
  chipTextMine: { color: colors.brand },
  hereWord: { ...font('600'), fontSize: 12, color: colors.open, marginLeft: -2 },
  ringHere: { borderWidth: 2, borderColor: colors.open, borderRadius: 14, padding: 0 },
  ringNone: {},
  tick: { position: 'absolute', right: -3, bottom: -3, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.brand, borderWidth: 1.5, borderColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: PRESS_DIM },
});
