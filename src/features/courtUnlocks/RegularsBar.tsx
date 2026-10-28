import { PRESS_DIM } from '@/theme/press';
import React, { useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import type { User } from '@/data/types';
import { NoFace } from '@/features/courtUnlocks/DesignParts';
import { DESIGN_FRIENDS, DESIGN_REGULARS, isDesignRegular, setDesignRegular, subscribeDesignRegular } from '@/features/courtUnlocks/designDemo';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * DESIGN BRANCH ONLY (design/court-unlocks). On a court's card, right under
 * its name: the people who chose to mark this court as one of theirs.
 *
 * Round 3 (owner, Oct 28: "instead of having the pfp and then their name to
 * the right. make the icons a bit bigger and put the name on the bottom like
 * how it is on the map"): big round faces with the first name under each,
 * the map's players tray in shape, sliding sideways. "Add yourself" leads in
 * the same shape; once added it is your face with a tick, "You".
 *
 * Who shows: friends first, then anyone else who marked it, by their own
 * choice; a teen only to their friends. Who is there now: a friend wears a
 * small green dot; a stranger never does. The head's "here now" follows the
 * owner's rule for people at a court ("2 or less ... the icons of them";
 * more, "the icon and then +x", never a person sign with a number), the
 * same as the lit court on the map above it: two faces, then "+x". A
 * friend's face; everyone else a plain face with nothing of who they are.
 */
const FACE = 54;
const ITEM_W = 72;

export function RegularsBar({ court }: { court: { name: string } }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser } = useApp();
  const mine = useSyncExternalStore(subscribeDesignRegular, () => isDesignRegular(court.name), () => false);
  const data = DESIGN_REGULARS[court.name] ?? { ids: [], hereNow: 0, friendsHere: [] };
  const known = data.ids
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u)
    // A teen shows only to their friends; everyone else shown chose to mark the court.
    .filter((u) => DESIGN_FRIENDS.has(u.id) || !notKnownAdult(u));
  const people = [...known.filter((u) => DESIGN_FRIENDS.has(u.id)), ...known.filter((u) => !DESIGN_FRIENDS.has(u.id))];
  const total = data.ids.length + (mine ? 1 : 0);
  const friendsHere = data.friendsHere.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const toggle = () => { haptics.tap(); setDesignRegular(court.name, !mine); };
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Regulars here</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.count}>{total || 'None yet'}</Text>
        {/* One stranger alone is never counted (the server's rule for court counts): only a friend, or two and up. */}
        {data.hereNow >= 2 || (data.hereNow && friendsHere.length) ? <HereNow n={data.hereNow} friends={friendsHere} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {mine && currentUser ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: true }} accessibilityLabel={`You're a regular at ${court.name}. Tap to take yourself off`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={styles.faceBox}>
              <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={FACE} />
              <View style={styles.tick}><Ionicons name="checkmark" size={12} color={colors.brandInk} /></View>
            </View>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameMine]} numberOfLines={1}>You</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: false }} accessibilityLabel={`Add yourself as a regular at ${court.name}`} onPress={toggle} hitSlop={4} style={({ pressed }) => [styles.item, styles.itemAdd, pressed && styles.pressed]}>
            <View style={styles.faceBox}>
              <View style={styles.add}><Ionicons name="add" size={26} color={colors.brand} /></View>
            </View>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.nameMine]} numberOfLines={1}>Add yourself</Text>
          </Pressable>
        )}
        {people.map((u) => {
          const here = data.friendsHere.includes(u.id) && DESIGN_FRIENDS.has(u.id);
          const first = u.name.split(' ')[0];
          return (
            <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${first}${here ? ', here now' : ''}. Open profile`} onPress={() => router.push(`/user/${u.id}`)} hitSlop={4} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
              <View style={styles.faceBox}>
                <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={FACE} />
                {here ? <View style={styles.hereDot} /> : null}
              </View>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{first}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * "Here now" in the head: two or fewer, a face each; more, two faces and
 * "+x", as the lit court on the map shows them. A friend's own face; anyone
 * else a plain face (NoFace).
 */
function HereNow({ n, friends }: { n: number; friends: User[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const shown = Math.min(n, 2);
  const faces = Array.from({ length: shown }, (_, i) => friends[i] ?? null);
  const said = friends.length ? `${friends.map((u) => u.name.split(' ')[0]).join(' and ')}${n > friends.length ? ` and ${n - friends.length} more` : ''} here now` : `${n} here now`;
  return (
    <View style={styles.now} accessible accessibilityLabel={said}>
      <View style={styles.nowFaces}>
        {faces.map((u, i) => (
          <View key={u?.id ?? `p${i}`} style={[styles.nowFace, i > 0 && styles.nowFaceOver]}>
            {u ? <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={22} /> : <NoFace size={22} />}
          </View>
        ))}
        {n > 2 ? <View style={[styles.nowFace, styles.nowFaceOver, styles.nowMore]}><Text maxFontSizeMultiplier={1.1} style={styles.nowMoreText}>+{n - 2}</Text></View> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.nowText}>here now</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 10, paddingTop: 2, paddingBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, minHeight: 26 },
  title: { ...typography.bodyStrong, color: colors.text },
  count: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  now: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  nowFaces: { flexDirection: 'row', alignItems: 'center' },
  nowFace: { borderRadius: 13, borderWidth: 2, borderColor: colors.bg },
  // Overlapping only by about the rim, so a friend's two letters are never cut by the face after.
  nowFaceOver: { marginLeft: -4 },
  nowMore: { height: 26, minWidth: 26, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  nowMoreText: { ...font('700'), fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'] },
  nowText: { ...typography.smallStrong, color: colors.open },
  // The map's players tray in shape: the face first and big, the first name under it.
  row: { gap: 4, paddingHorizontal: spacing.lg - 6, alignItems: 'flex-start' },
  item: { width: ITEM_W, alignItems: 'center', gap: 5 },
  itemAdd: { width: ITEM_W + 18 },
  faceBox: { width: FACE, height: FACE },
  add: { width: FACE, height: FACE, borderRadius: FACE / 2, backgroundColor: colors.brandDim, borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(colors.brand, 0.5), alignItems: 'center', justifyContent: 'center' },
  name: { ...font('600'), fontSize: 13, lineHeight: 16, color: colors.text, maxWidth: ITEM_W + 18, textAlign: 'center' },
  nameMine: { color: colors.brand },
  // There now (a friend only): a small green dot on the face's corner, the page's colour round it.
  hereDot: { position: 'absolute', right: 0, bottom: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.open, borderWidth: 3, borderColor: colors.bg },
  tick: { position: 'absolute', right: -2, bottom: -1, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, borderWidth: 2.5, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: PRESS_DIM },
});
