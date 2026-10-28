import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button } from '@/components/ui';
import { RisingSheet } from '@/components/RisingSheet';
import { Wash } from '@/components/Wash';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { inviteLink } from '@/features/invite/referral';
import { shareOutside } from '@/lib/shareOutside';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { PRESS_DIM } from '@/theme/press';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';
import { MUTUAL_BENEFITS, MUTUALS_ONLY_LINE, MUTUAL_LINE, MUTUAL_LINE_SHORT } from './mutualsMock';

/*
 * DESIGN MOCK (Oct 28, owner: "Mock it"). The rare "Add your friends" card in
 * two looks, and the slim line used where following back pays off. Shown only
 * behind the demo build's `?mutuals=` switch (mutualsMock.ts), which also
 * holds the rule for how often the card may come up.
 */

function BenefitIcon({ icon }: { icon: (typeof MUTUAL_BENEFITS)[number]['icon'] }) {
  if (icon === 'court') return <CourtGlyph size={16} color={colors.brand} />;
  const name = icon === 'map' ? 'location-outline' : icon === 'board' ? 'podium-outline' : 'calendar-outline';
  return <Ionicons name={name} size={18} color={colors.brand} />;
}

async function shareLink(handle: string) {
  try {
    const said = await shareOutside('Join me on CourtSide', inviteLink(handle, null));
    if (said) showToast({ title: said, icon: 'link-outline' });
  } catch { /* closed */ }
}

/**
 * Look A: a sheet that rises once in a while as the app opens. Four plain
 * rows of what following each other shows, then Find friends (your contacts)
 * and Share my link; Not now, or a tap on the page, closes it.
 */
export function MutualsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(sheetStyles);
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();
  if (!currentUser) return null;
  return (
    <RisingSheet visible={visible} onClose={onClose} closeLabel="Not now" sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xs }]}>
      <View style={styles.grabber} />
      <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Add your friends</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>When you follow each other, you both see:</Text>
      <View style={styles.rows}>
        {MUTUAL_BENEFITS.map((b) => (
          <View key={b.title} style={styles.row} accessible accessibilityLabel={`${b.title}. ${b.line}`}>
            <View style={styles.tile}><BenefitIcon icon={b.icon} /></View>
            <View style={styles.words}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle}>{b.title}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowLine}>{b.line}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button label="Find friends" onPress={() => { onClose(); router.push('/find-contacts'); }} full />
        <Button label="Share my link" variant="secondary" onPress={() => { void shareLink(currentUser.handle); }} full />
      </View>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.later, pressed && { opacity: PRESS_DIM }]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.laterText}>Not now</Text>
      </Pressable>
    </RisingSheet>
  );
}

const sheetStyles = StyleSheet.create({
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, paddingHorizontal: spacing.xl },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.small, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  rows: { marginTop: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tile: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...typography.smallStrong, fontSize: 15, color: colors.text },
  rowLine: { ...typography.small, color: colors.textMuted },
  buttons: { marginTop: spacing.xl, gap: spacing.sm },
  later: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  laterText: { ...typography.smallStrong, color: colors.textMuted },
});

/**
 * Look B: a small card on Find Players, under the map. The people who follow
 * you that you don't follow back (up to 3), each with Follow back in one tap,
 * and the reason in one line. The x closes it (counts toward the 3 closes).
 */
export function MutualsInline({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(inlineStyles);
  const { users, currentUserId, followingIds, followEdges, blockedIds, actions } = useApp();
  // Who to show is fixed when the card opens, so a row stays (as Following) after its tap.
  const [people] = useState(() => {
    const followsMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    return users.filter((u) => followsMe.has(u.id) && !followingIds.includes(u.id) && !blockedIds.includes(u.id) && u.id !== currentUserId).slice(0, 3);
  });
  const done = useMemo(() => people.filter((p) => followingIds.includes(p.id)).length, [people, followingIds]);
  if (!people.length) return null;
  return (
    <View style={styles.card}>
      <View pointerEvents="none" style={styles.washClip}><Wash height={200} strength={0.5} fade={colors.surface} style={styles.wash} /></View>
      <View style={styles.head}>
        <View style={styles.headWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Follow back to see each other on the map</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>{done ? `${done} of ${people.length} done. Mutuals also see each other at courts and on the leaderboard.` : 'Mutuals also see each other at courts and on the leaderboard.'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.close, pressed && { opacity: PRESS_DIM }]}>
          <Ionicons name="close" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
      <View style={styles.list}>
        {people.map((p) => {
          const on = followingIds.includes(p.id);
          return (
            <View key={p.id} style={styles.person}>
              <Pressable accessibilityRole="link" accessibilityLabel={p.name} onPress={() => router.push(`/user/${p.id}`)} style={styles.who}>
                <Avatar uri={p.avatarUrl} name={p.name} seed={p.avatarSeed} size={40} />
                <View style={styles.whoWords}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{on ? 'You follow each other' : 'Follows you'}</Text>
                </View>
              </Pressable>
              <View style={styles.pill}>
                <Button label={on ? 'Following' : 'Follow back'} variant={on ? 'secondary' : 'primary'} size="sm" onPress={() => actions.toggleFollow(p.id)} full />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  // The prompt card's look, as "You’re early in Raleigh": surface, 20 corners, the soft lift, the wash inside it.
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  washClip: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: corner(20), overflow: 'hidden' },
  wash: { position: 'absolute', left: 0, right: 0, top: 0 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headWords: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.heading, color: colors.text },
  body: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -6 },
  list: { gap: spacing.md },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  whoWords: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.smallStrong, fontSize: 15, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  pill: { width: 116 },
});

/**
 * The slim line where following back is the next step anyway: under a
 * profile's Follow back, in a follow row, on the map with nobody up to hit,
 * and (`only`) under a list that only shows mutuals.
 */
export function MutualsLine({ only = false, short = false, center = false, style }: { only?: boolean; /** Beside a Follow back button already: just the why. */ short?: boolean; center?: boolean; style?: object }) {
  const styles = useThemedStyles(lineStyles);
  return (
    <View style={[styles.row, center && styles.center, style]}>
      <Ionicons name={only ? 'lock-closed-outline' : 'people-outline'} size={13} color={colors.textFaint} />
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.text}>{only ? MUTUALS_ONLY_LINE : short ? MUTUAL_LINE_SHORT : MUTUAL_LINE}</Text>
    </View>
  );
}

const lineStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  center: { justifyContent: 'center' },
  text: { ...typography.small, fontSize: 12, lineHeight: 16, color: colors.textFaint, flexShrink: 1 },
});
