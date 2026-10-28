import { PRESS_DIM } from '@/theme/press';
import React, { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { DESIGN_FRIENDS, DESIGN_REGULARS, andList, designHere, isDesignRegular, setDesignRegular, subscribeDesignRegular } from '@/features/courtUnlocks/designDemo';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks). On a court's card, right under
 * its name: the court's regulars who are there right now.
 *
 * Round 4 (owner, Oct 28: "For regulars here. Can we put just the regulars
 * that are there. Or does that violate any policy." then "Just say number
 * like x here."): only who is at the court now. A friend (you follow each
 * other) there: their face, first name under it, the green "here" dot.
 * Everyone else there: no face, no name, no initials, only one number at
 * the end of the row, "+3 here" after friends' faces or "4 here" on its
 * own; never 1 (a lone stranger is never counted), and a teen only to
 * their friends. Nobody there: "No one here right now", in the same
 * height. "Add yourself" (this court is one of yours) leads, as before;
 * once added, your face with a tick, "You". The head's old "here now"
 * corner is gone: the row says it.
 *
 * Round 3 shape kept (owner: "make the icons a bit bigger and put the name
 * on the bottom like how it is on the map"): big round faces, the first
 * name under each, sliding sideways.
 */
const FACE = 54;
const ITEM_W = 72;

export function RegularsBar({ court }: { court: { name: string } }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser } = useApp();
  const mine = useSyncExternalStore(subscribeDesignRegular, () => isDesignRegular(court.name), () => false);
  // Everyone who marked it, as a number for the head; a teen is counted only for their friends.
  const regulars = (DESIGN_REGULARS[court.name]?.ids ?? [])
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u && (DESIGN_FRIENDS.has(u.id) || !notKnownAdult(u))).length;
  const total = regulars + (mine ? 1 : 0);
  const { friends, others } = designHere(court.name);
  const anyone = friends.length > 0 || others > 0;
  const firsts = friends.map((u) => u.name.split(' ')[0]);
  // For VoiceOver, once, in the head: "Sam and Marcus are here, and 3 others".
  const said = firsts.length
    ? `${andList(firsts)} ${firsts.length === 1 ? 'is' : 'are'} here${others ? `, and ${others} others` : ''}`
    : others ? `${others} people are here` : 'No one here right now';
  const toggle = () => { haptics.tap(); setDesignRegular(court.name, !mine); };
  return (
    <View style={styles.wrap}>
      <View style={styles.head} accessible accessibilityRole="header" accessibilityLabel={`Regulars here, ${total ? `${total} in all` : 'none yet'}. ${said}`}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Regulars here</Text>
        {/* All of the court's regulars, said as "in all" so it never reads as how many are here now. */}
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.count}>{total ? `${total} in all` : 'None yet'}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {mine && currentUser ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: true }} accessibilityLabel={`You're a regular at ${court.name}. Tap to take yourself off`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.faceBox}>
              <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={FACE} />
              <View style={styles.tick}><Ionicons name="checkmark" size={12} color={colors.brandInk} /></View>
            </View>
            <Text {...oneLine(TextScale.CARD, 0.8)} numberOfLines={1} style={[styles.name, styles.nameMine]}>You</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: false }} accessibilityLabel={`Add yourself as a regular at ${court.name}`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.item, styles.itemAdd, pressed && styles.pressed]}>
            <View style={styles.faceBox}>
              <View style={styles.add}><Ionicons name="add" size={26} color={colors.brand} /></View>
            </View>
            <Text {...oneLine(TextScale.CARD, 0.8)} numberOfLines={1} style={[styles.name, styles.nameMine]}>Add yourself</Text>
          </Pressable>
        )}
        {friends.map((u, i) => (
          <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${firsts[i]}, here now. Open profile`} onPress={() => router.push(`/user/${u.id}`)} hitSlop={4} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.faceBox}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={FACE} />
              <View style={styles.hereDot} />
            </View>
            <Text {...oneLine(TextScale.CARD, 0.8)} numberOfLines={1} style={styles.name}>{firsts[i]}</Text>
          </Pressable>
        ))}
        {/* Everyone else there: one number, never who. "+3" after friends' faces (3 more, not 3 in all); on its own, "4 here". */}
        {others ? (
          <View style={styles.side} accessible accessibilityLabel={friends.length ? `${others} others here` : `${others} people here`}>
            <View style={styles.chip}>
              <View style={styles.chipDot} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.chipText} numberOfLines={1}>
                <Text style={styles.chipNumber}>{friends.length ? `+${others}` : others}</Text> here
              </Text>
            </View>
          </View>
        ) : null}
        {anyone ? null : (
          <View style={styles.side}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.empty} numberOfLines={1}>No one here right now</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 2, paddingBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, minHeight: 26 },
  title: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  // The map's players tray in shape: the face first and big, the first name under it.
  row: { gap: 4, paddingHorizontal: spacing.lg - 6, alignItems: 'flex-start' },
  item: { width: ITEM_W, alignItems: 'center', gap: 5 },
  itemAdd: { width: ITEM_W + 18 },
  faceBox: { width: FACE, height: FACE },
  add: { width: FACE, height: FACE, borderRadius: FACE / 2, backgroundColor: colors.brandDim, borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(colors.brand, 0.5), alignItems: 'center', justifyContent: 'center' },
  // At the biggest text sizes a name shrinks a little to stay on its one line (oneLine) rather than being cut.
  name: { ...font('600'), fontSize: 13, lineHeight: 16, color: colors.text, maxWidth: ITEM_W + 18, textAlign: 'center' },
  nameMine: { color: colors.brand },
  // There now (a friend): a small green dot on the face's corner, the page's colour round it.
  hereDot: { position: 'absolute', right: 0, bottom: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.open, borderWidth: 3, borderColor: colors.bg },
  tick: { position: 'absolute', right: -2, bottom: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, borderWidth: 2.5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  // The number and the empty line sit level with the faces (a face's height), the row keeping its height.
  side: { minHeight: FACE, justifyContent: 'center', paddingHorizontal: 6 },
  // A plain pill, not a disc: nothing in it could be taken for a person.
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, backgroundColor: withAlpha(colors.open, 0.12) },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.open },
  chipText: { ...font('600'), fontSize: 15, lineHeight: 20, color: colors.text },
  chipNumber: { ...font('700'), fontVariant: ['tabular-nums'] },
  empty: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  pressed: { opacity: PRESS_DIM },
});
