import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';

import { DragSheet } from '@/components/DragSheet';
import { Avatar } from '@/components/ui';
import type { Invitee } from '@/data/types';
import { inviteLink } from '@/features/invite/referral';
import { FRIENDS_LINE } from '@/features/invite/friendsWords';
import { notKnownAdult } from '@/features/players/age';
import * as haptics from '@/lib/haptics';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const joinedOn = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'Joined' : `Joined ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};
const time = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };

/**
 * Your invite link, and who joined through it. A friend who joins through it
 * follows you (and can be followed back). It says only that: whether someone
 * shows on a map depends on their age and their Location switch.
 *
 * Two ways in. After a first post (`?first=1`, the toast) it asks "Who do you
 * hit with?" and offers Later; from Settings → Invites and anywhere else it
 * is simply "Invite friends".
 *
 * Below, the people who joined through you, in one list: who has counted
 * (migration 85) first, with a quiet check, then the rest, newest first
 * within each. The invite partners are paid for each one that counts (by
 * hand, Admin → Invites) and look for this here (Oct 4–5), so "Counted · N"
 * sits over the list. The rest say only "Not counted yet": what step someone
 * else still has to take (confirm their email, come back) is theirs, not
 * shown. No money is shown either, so nobody is promised a dollar.
 *
 * The sheet fits its contents once both the count and the list are in, so
 * it never first fits a short page and then has to grow (Oct 6).
 *
 * Tapping someone closes the sheet first and then opens their profile, in
 * its place: opening it while the sheet was still closing left the sheet's
 * invisible backdrop over the page underneath (Oct 6).
 */
export default function Invite() {
  const styles = useThemedStyles(styleDefinitions);
  const { first } = useLocalSearchParams<{ first?: string }>();
  const onboarding = first === '1';
  const { currentUser, actions } = useApp();
  // A teen, or anyone not known to be an adult: their friends, no poster.
  const friendsOnly = !currentUser || notKnownAdult(currentUser);
  const [closeSignal, setCloseSignal] = useState(0);
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState<number | null>(null);
  const [people, setPeople] = useState<Invitee[] | null>(null);
  // Both asked for and answered (or failed): only then is the sheet sized to what is in it.
  const [loaded, setLoaded] = useState(false);
  const [contentH, setContentH] = useState(0);
  useEffect(() => {
    let on = true;
    void Promise.allSettled([
      actions.countReferrals().then((n) => { if (on) setJoined(n); }),
      actions.fetchMyInvitees().then((list) => { if (on) setPeople(list); }),
    ]).then(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, [actions]);
  // Who to open once the sheet has gone (their profile takes its place), or nobody: back to where it was opened.
  const goingTo = useRef<string | null>(null);
  const open = (id: string) => { goingTo.current = id; setCloseSignal((n) => n + 1); };
  const dismissed = () => {
    const id = goingTo.current;
    if (id) router.replace(`/user/${id}`);
    else router.back();
  };
  const link = currentUser ? inviteLink(currentUser.handle) : '';
  const share = async () => {
    try { if ((await shareOutside('Hit with me on CourtSide', link)) !== null) haptics.commit(); } catch { /* the sheet was closed */ }
  };
  const copy = async () => { await Clipboard.setStringAsync(link); haptics.tap(); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  // Counted first, then the rest; newest first within each.
  const list = useMemo(() => [...(people ?? [])].sort((a, b) => Number(!!b.countedAt) - Number(!!a.countedAt) || time(b.joinedAt) - time(a.joinedAt)), [people]);
  const counted = list.filter((p) => p.countedAt).length;
  const count = list.length || joined || 0;
  return (
    <DragSheet fitContent closeSignal={closeSignal} onDismissed={dismissed} peekFraction={0.9} contentHeight={loaded && contentH ? contentH : undefined} header={
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{onboarding ? 'Who do you hit with?' : 'Invite friends'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setCloseSignal((n) => n + 1)}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </Pressable>
      </View>
    }>
      <ScrollView contentContainerStyle={styles.body} onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}>
        <Text style={styles.lead}>{friendsOnly ? FRIENDS_LINE : 'Send them your link. When they join, they follow you, and you can follow them back.'}</Text>
        <View style={styles.linkBox}>
          <Ionicons name="link-outline" size={16} color={colors.textMuted} />
          <Text style={styles.link} numberOfLines={1}>{link.replace('https://', '')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share your invite link" onPress={share} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
            <Ionicons name="paper-plane-outline" size={16} color={colors.brandInk} />
            <Text style={styles.primaryText}>Share link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy your invite link" onPress={copy} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
            <Text style={styles.secondaryText}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        {Platform.OS !== 'web' || !friendsOnly ? (
          <View style={styles.more}>
            {Platform.OS !== 'web' ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Find friends from your contacts" onPress={() => router.replace('/find-contacts')} style={({ pressed }) => [styles.poster, pressed && { opacity: 0.7 }]}>
                <Ionicons name="people-outline" size={18} color={colors.text} />
                <Text style={styles.posterText}>Find friends from your contacts</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}
            {/* Never for a teen (or anyone not known to be an adult): a poster naming where they
                play would put them in front of strangers (the same rule as EarlyInvite's card). */}
            {friendsOnly ? null : (
              <Pressable accessibilityRole="link" accessibilityLabel="Print a poster for your club" onPress={() => router.replace('/club-poster')} style={({ pressed }) => [styles.poster, pressed && { opacity: 0.7 }]}>
                <Ionicons name="print-outline" size={18} color={colors.text} />
                <Text style={styles.posterText}>Print a poster for your club</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
        ) : null}
        {list.length > 0 ? (
          <View style={styles.people}>
            <View style={styles.groupRow}>
              <Text style={styles.groupLabel}>{`Joined · ${list.length}`}</Text>
              <View style={styles.groupCounted} accessible accessibilityLabel={`${counted} counted`}>
                {counted ? <Ionicons name="checkmark-circle" size={15} color={colors.brand} /> : null}
                <Text style={[styles.groupLabel, counted ? styles.countedText : null]}>{`Counted · ${counted}`}</Text>
              </View>
            </View>
            {list.map((p) => {
              const name = p.name || `@${p.handle}`;
              return (
                <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`${name}, ${p.countedAt ? 'counted' : 'not counted yet'}. Open profile`} onPress={() => open(p.id)} style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}>
                  <Avatar name={p.name || p.handle} seed={p.id} uri={p.avatarUrl} size={36} />
                  <View style={styles.personText}>
                    <Text style={styles.personName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.personNote} numberOfLines={1}>{p.name ? `@${p.handle} · ` : ''}{joinedOn(p.joinedAt)}</Text>
                  </View>
                  {p.countedAt ? (
                    <View style={styles.status}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                      <Text style={styles.countedText}>Counted</Text>
                    </View>
                  ) : (
                    <Text style={styles.waitingText}>Not counted yet</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.count}>{!loaded ? ' ' : count === 0 ? 'No one has joined through you yet.' : `${count} ${count === 1 ? 'player has' : 'players have'} joined through you.`}</Text>
        )}
        {onboarding ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Later" onPress={() => setCloseSignal((n) => n + 1)} style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}>
            <Text style={styles.laterText}>Later</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heading: { ...typography.title, color: colors.text },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xl },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  link: { ...typography.small, color: colors.text, flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  primary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: radius.pill, backgroundColor: colors.brand },
  primaryText: { ...typography.bodyStrong, color: colors.brandInk },
  secondary: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.bodyStrong, color: colors.text },
  more: { gap: 0 },
  poster: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  posterText: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  count: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.sm },
  people: { paddingTop: spacing.xs },
  // "Joined · 4" and, at the far end, "Counted · 2": the number the invite partners look for.
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xs },
  groupLabel: { ...typography.smallStrong, color: colors.textMuted },
  groupCounted: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 },
  personText: { flex: 1, minWidth: 0 },
  personName: { ...typography.bodyStrong, color: colors.text },
  personNote: { ...typography.small, color: colors.textMuted },
  // At the row's far end, lined up down the list: a quiet check for each one that counted.
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countedText: { ...typography.smallStrong, color: colors.brand },
  waitingText: { ...typography.small, color: colors.textFaint },
  later: { alignSelf: 'center', minHeight: 44, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  laterText: { ...typography.smallStrong, color: colors.textMuted },
});
