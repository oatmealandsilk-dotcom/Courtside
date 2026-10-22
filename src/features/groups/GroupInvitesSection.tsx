import { PRESS_DIM } from '@/theme/press';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { FeedGroupInvite, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Invites to groups waiting for your answer (migration 181), as one
 * self-contained block: the Groups sheet (the Feed's "+") puts it first, the
 * Groups page above "Your groups". Each row is the group's face, who invited
 * you, and Join / Not now. Join gets you in ("You're in Silver Lake
 * sunrise"), Ask to join or not (migration 182: whoever invited you let you
 * in); only someone an admin took out, invited by a member who isn't an
 * admin, is asked about to the admins instead; Not now clears it and tells nobody. Already in 3
 * groups, Join is dimmed from the start (as Create a group is) and the cap
 * is said under each row, with a way to your groups; Not now still works. Tapping the
 * group opens its page, where the same Join waits. Nothing at all when there
 * are no invites.
 */

export function inviterName(inv: FeedGroupInvite, users: { id: ID; name: string }[]): string {
  const u = users.find((x) => x.id === inv.inviterId);
  return (u?.name ?? inv.inviterName ?? 'Someone').split(' ')[0] || 'Someone';
}

/** Under an invite when you're already in the most groups anyone can be in. */
export const INVITE_FULL = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to join another.`;

/** What a finished Join says, as a toast. */
export function toastForJoin(outcome: string, name: string) {
  if (outcome === 'requested') showToast({ title: 'Sent to the admins', body: `You were taken out of ${name}, so an admin lets you back in.`, icon: 'hourglass-outline' });
  else if (outcome === 'joined' || outcome === 'already') showToast({ title: `You’re in ${name}`, body: 'Its feed is on your Feed’s top row.', icon: 'checkmark-circle-outline' });
}

export function GroupInvitesSection({ onOpen }: {
  /** Opens a page: the group's, or Groups (Manage). A sheet passes its own, so it closes first. */
  onOpen?: (href: string) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroupInvites, feedGroups, users, actions } = useApp();
  // Which invite is being answered, and which way, so only that button spins.
  const [answering, setAnswering] = useState<{ id: ID; accept: boolean } | null>(null);
  // A Join that could not go through, under its row (the 3-group cap, say).
  const [problem, setProblem] = useState<{ id: ID; text: string; full: boolean } | null>(null);
  if (!feedGroupInvites.length) return null;
  const open = (href: string) => (onOpen ? onOpen(href) : router.push(href as never));
  // In 3 groups already: said up front, not only after a Join.
  const full = feedGroups.length >= MAX_GROUPS;

  const answer = async (inv: FeedGroupInvite, accept: boolean) => {
    if (answering) return;
    setAnswering({ id: inv.groupId, accept });
    setProblem(null);
    const out = await actions.answerFeedGroupInvite(inv.groupId, accept);
    setAnswering(null);
    if (out.ok) { toastForJoin(out.outcome, inv.name); return; }
    if (out.word === 'not_found') { showToast({ title: out.error, icon: 'alert-circle-outline' }); return; }
    setProblem({ id: inv.groupId, text: out.error, full: out.word === 'group_limit' });
  };

  return (
    <View style={styles.part}>
      <Text style={styles.section} accessibilityRole="header">Invites</Text>
      <View style={styles.card}>
        {feedGroupInvites.map((inv, i) => {
          const who = inviterName(inv, users);
          const members = `${inv.memberCount} ${inv.memberCount === 1 ? 'member' : 'members'}`;
          const busyHere = answering?.id === inv.groupId;
          const p = problem?.id === inv.groupId ? problem : full ? { id: inv.groupId, text: INVITE_FULL, full: true } : null;
          return (
            <View key={inv.groupId} style={[styles.row, i > 0 && styles.line]}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${who} invited you to ${inv.name}, ${inv.ask ? 'Ask to join' : 'Open'}, ${members}. Open it`}
                onPress={() => open(`/g/${inv.groupId}`)}
                style={({ pressed }) => [styles.group, pressed && styles.pressed]}
              >
                <GroupTile name={inv.name} look={inv.look} size={44} />
                <View style={styles.words}>
                  <Text style={styles.who} numberOfLines={1}>{who} invited you</Text>
                  <Text style={styles.name} numberOfLines={1}>{inv.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{inv.ask ? 'Ask to join' : 'Open'} · {members}</Text>
                </View>
              </Pressable>
              <View style={styles.buttons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Join ${inv.name}`}
                  accessibilityHint={full ? INVITE_FULL : undefined}
                  accessibilityState={{ busy: busyHere && answering?.accept, disabled: !!answering || full }}
                  disabled={!!answering || full}
                  hitSlop={4}
                  onPress={() => { void answer(inv, true); }}
                  style={({ pressed }) => [styles.btn, styles.btnJoin, full && styles.btnOff, (pressed || (!!answering && !(busyHere && answering?.accept))) && styles.btnDim]}
                >
                  {busyHere && answering?.accept ? <ActivityIndicator size="small" color={colors.brandInk} /> : <Text style={[styles.btnText, styles.btnTextJoin]}>Join</Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Not now, ${inv.name}`}
                  accessibilityState={{ busy: busyHere && !answering?.accept, disabled: !!answering }}
                  disabled={!!answering}
                  hitSlop={4}
                  onPress={() => { void answer(inv, false); }}
                  style={({ pressed }) => [styles.btn, styles.btnQuiet, (pressed || (!!answering && !(busyHere && !answering?.accept))) && styles.btnDim]}
                >
                  {busyHere && !answering?.accept ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Text style={[styles.btnText, styles.btnTextQuiet]}>Not now</Text>}
                </Pressable>
              </View>
              {p ? (
                <View style={styles.problem} accessibilityLiveRegion="polite">
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.problemText}>{p.text}</Text>
                  {p.full ? (
                    <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={8} onPress={() => open('/groups')}>
                      <Text style={styles.link}>Manage</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  part: { gap: spacing.sm },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  group: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: PRESS_DIM },
  words: { flex: 1, minWidth: 0, gap: 1 },
  who: { ...typography.small, color: colors.textMuted },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  // Join is the one green thing to press; Not now is quiet. They sit under the words, lined up with them.
  buttons: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 44 + spacing.md },
  btn: { flex: 1, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnJoin: { backgroundColor: colors.brand },
  btnQuiet: { backgroundColor: colors.surfaceAlt },
  btnDim: { opacity: PRESS_DIM },
  // In 3 groups: Join dimmed as Create a group is.
  btnOff: { opacity: 0.45 },
  btnText: { ...typography.smallStrong },
  btnTextJoin: { color: colors.brandInk },
  btnTextQuiet: { color: colors.textMuted },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginLeft: 44 + spacing.md },
  problemText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
  link: { ...typography.smallStrong, color: colors.brand },
});
