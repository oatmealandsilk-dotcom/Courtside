import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';

import { DragSheet } from '@/components/DragSheet';
import { Avatar } from '@/components/ui';
import type { Invitee, InviteeMissing } from '@/data/types';
import { inviteLink } from '@/features/invite/referral';
import * as haptics from '@/lib/haptics';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Who do you hit with?" — the person's own invite link, offered after
 * their first post and from their profile. A friend who joins through it
 * follows them (and can be followed back). It says only that: whether
 * someone shows on a map depends on their age and their Location switch.
 * Below, the people who joined through them: who has counted, and for the
 * rest the next thing they still have to do (migration 85). No money is shown:
 * only named ambassadors are paid, by hand (Admin → Invites), so nobody else
 * is promised a dollar they will never get (Oct 5).
 */
const NEXT: Record<InviteeMissing, string> = {
  setup: 'Needs to finish signing up',
  verify: 'Needs to confirm their email',
  'come-back': 'Needs to come back another day',
  'do-thing': 'Needs to post, message or follow someone',
  expired: 'Didn’t come back within 2 weeks',
  blocked: 'Can’t count',
};

export default function Invite() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState<number | null>(null);
  const [people, setPeople] = useState<Invitee[] | null>(null);
  useEffect(() => { void actions.countReferrals().then(setJoined).catch(() => setJoined(null)); }, [actions]);
  useEffect(() => { void actions.fetchMyInvitees().then(setPeople).catch(() => setPeople(null)); }, [actions]);
  const counted = people?.filter((p) => p.countedAt) ?? [];
  const waiting = people?.filter((p) => !p.countedAt) ?? [];
  const open = (id: string) => { setCloseSignal((n) => n + 1); router.push(`/user/${id}`); };
  const link = currentUser ? inviteLink(currentUser.handle) : '';
  const share = async () => {
    try { await shareOutside('Hit with me on CourtSide', link); haptics.commit(); } catch { /* the sheet was closed */ }
  };
  const copy = async () => { await Clipboard.setStringAsync(link); haptics.tap(); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={() => router.back()} peekFraction={0.56} header={
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Who do you hit with?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <View style={styles.body}>
        <Text style={styles.lead}>Send them your link. When they join, they follow you, and you can follow them back.</Text>
        <View style={styles.linkBox}>
          <Ionicons name="link-outline" size={16} color={colors.textMuted} />
          <Text style={styles.link} numberOfLines={1}>{link.replace('https://', '')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your invite link" onPress={share} style={styles.primary}>
            <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Share link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy your invite link" onPress={copy} style={styles.secondary}>
            <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        {Platform.OS !== 'web' ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Find friends from your contacts" onPress={() => router.replace('/find-contacts')} style={({ pressed }) => [styles.poster, pressed && { opacity: 0.7 }]}>
            <Ionicons name="people-outline" size={18} color={colors.text} />
            <Text style={styles.posterText}>Find friends from your contacts</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" accessibilityLabel="Print a poster for your club" onPress={() => router.replace('/club-poster')} style={({ pressed }) => [styles.poster, pressed && { opacity: 0.7 }]}>
          <Ionicons name="print-outline" size={18} color={colors.text} />
          <Text style={styles.posterText}>Print a poster for your club</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        {people && people.length > 0 ? (
          <View style={styles.people}>
            {counted.length > 0 ? <Text style={styles.groupLabel}>{`Counted · ${counted.length}`}</Text> : null}
            {counted.map((p) => <Person key={p.id} p={p} note="Counted" good onPress={() => open(p.id)} />)}
            {waiting.length > 0 ? <Text style={styles.groupLabel}>Almost there</Text> : null}
            {waiting.map((p) => <Person key={p.id} p={p} note={p.missing?.[0] ? NEXT[p.missing[0]] : 'Checking…'} onPress={() => open(p.id)} />)}
          </View>
        ) : (
          <Text style={styles.count}>{joined === null ? ' ' : joined === 0 ? 'No one has joined through you yet.' : `${joined} ${joined === 1 ? 'player has' : 'players have'} joined through you.`}</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => setCloseSignal((n) => n + 1)} style={styles.later}>
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
      </View>
    </DragSheet>
  );
}

function Person({ p, note, good, onPress }: { p: Invitee; note: string; good?: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`@${p.handle}, ${note}`} onPress={onPress} style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}>
      <Avatar name={p.name || p.handle} seed={p.id} uri={p.avatarUrl} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={styles.personHandle} numberOfLines={1}>@{p.handle}</Text>
        <Text style={[styles.personNote, good && styles.personGood]} numberOfLines={1}>{note}</Text>
      </View>
      {good ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} /> : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  link: { ...typography.small, color: colors.text, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  poster: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  posterText: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  count: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  people: { gap: 2, paddingTop: spacing.xs },
  groupLabel: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.sm, marginBottom: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  personHandle: { ...typography.bodyStrong, color: colors.text },
  personNote: { ...typography.small, color: colors.textMuted },
  personGood: { color: colors.brand },
  later: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  laterText: { ...typography.smallStrong, color: colors.textMuted },
});
