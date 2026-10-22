import { PRESS_DIM } from '@/theme/press';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';

import { Avatar } from '@/components/ui';
import { SearchField } from '@/components/SearchField';
import type { ID, User } from '@/data/types';
import { chatLockNote, named } from '@/features/messages/groups';
import * as haptics from '@/lib/haptics';
import { shareLink } from '@/lib/shareLink';
import { show as showToast } from '@/lib/toast';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { colors, font, lift, radius, spacing, typography, buttonShape } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group's last step: bring your people in. At the top, the group's
 * invite link (/g/<id>, carrying your handle, so whoever joins through it
 * counts as yours) with Copy and Share. Under it, people to tick: Suggested
 * (people you follow who follow you back, then people who follow you), then
 * the rest you follow. Never anyone "near you": where people are is never
 * shown. Each one picked gets an invite (migration 181): a notification
 * "Mira invited you to Silver Lake sunrise" with Join / Not now, and a
 * phone alert if they allow them. On a database before 181, each gets the
 * invite in your chat with them instead, a card with the group's face that
 * opens its page. The picked show as chips above the list, a tap takes one
 * out; anyone invited and not answered yet says "Invited".
 *
 * The same people New message offers, under the same rules: nobody you are
 * blocked with; someone the chat rules lock (a teen who doesn't follow you,
 * say) shows a lock and "Can't message yet", is asked about again on tap,
 * and says why in a note if still locked; anyone already in the group says
 * so. Anyone can join a group (migration 149), so nobody is left out for
 * their age: the chat rules above are what keep a teen from getting an
 * invite from someone they don't follow.
 */

export const INVITE_MAX = 20;

/**
 * Sends the invites for a group: real ones once the server has them
 * (migration 181), otherwise the group's card in a chat with each, as
 * before (never both, so nobody is told twice). Waits for the server, so
 * the caller says "Invited" only once it really went: `ok` false comes
 * with the server's sentence (too many today, say) and nobody was invited.
 * Shows no toast itself; the haptic is the action's own.
 */
export type SentInvites = { ok: boolean; count: number; error?: string };
export function useSendGroupInvites() {
  const { feedGroupInvitesLive, actions } = useApp();
  return useCallback(async (group: { id: ID; name: string }, people: ID[]): Promise<SentInvites> => {
    if (!people.length) return { ok: true, count: 0 };
    if (!feedGroupInvitesLive) {
      actions.shareToChats({ userIds: people }, { kind: 'group', id: group.id, name: group.name });
      haptics.reward();
      return { ok: true, count: people.length };
    }
    const out = await actions.inviteToFeedGroup(group.id, people);
    return out.ok ? { ok: true, count: people.length } : { ok: false, count: 0, error: out.error ?? 'That didn’t go through. Check your connection and try again.' };
  }, [feedGroupInvitesLive, actions]);
}

/** "Only people Dev follows can invite Dev to a group." The rule only, never why. */
const inviteLockNote = (who: { first: string; label: string }) => `Only people ${who.label} follows can invite ${who.first} to a group.`;

type Why = 'member' | 'asking' | 'invited' | 'locked' | null;

export function InvitePeople({ groupId, groupName, picked, onPicked }: {
  groupId: ID; groupName: string; picked: ID[]; onPicked: React.Dispatch<React.SetStateAction<ID[]>>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, followingIds, followEdges, blockedIds, conversations, currentUserId, currentUser, feedGroups, feedGroupInvitesLive, feedGroupSentInvites, actions } = useApp();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = shareLink('group', groupId, currentUser?.handle);
  const here = feedGroups.find((g) => g.id === groupId);
  const inGroup = new Set(here?.members.map((m) => m.id) ?? []);
  // Already asking to join (an admin sees the requests): Approve on the group's page lets them in, so not invited too.
  const asking = new Set(here?.requests ?? []);
  const sentHere = new Set(feedGroupInvitesLive ? feedGroupSentInvites[groupId] ?? [] : []);

  // Suggested: people you follow who follow you back, then people who follow you; then the rest
  // you follow. In each, the people you talk to most first, then by name.
  const { suggested, following } = useMemo(() => {
    const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds.filter((p) => p !== currentUserId));
    const rank = (u: User) => { const i = recent.indexOf(u.id); return i < 0 ? 9999 : i; };
    const byId = new Map(users.map((u) => [u.id, u]));
    const ok = (u: User | undefined): u is User => !!u && u.id !== currentUserId && !blockedIds.includes(u.id);
    const order = (a: User, b: User) => rank(a) - rank(b) || a.name.localeCompare(b.name);
    const iFollow = new Set(followingIds);
    const followMe = new Set(followEdges.filter((e) => e.followingId === currentUserId).map((e) => e.followerId));
    const mutual = followingIds.filter((id) => followMe.has(id)).map((id) => byId.get(id)).filter(ok).sort(order);
    const fans = [...followMe].filter((id) => !iFollow.has(id)).map((id) => byId.get(id)).filter(ok).sort(order);
    const rest = followingIds.filter((id) => !followMe.has(id)).map((id) => byId.get(id)).filter(ok).sort(order);
    return { suggested: [...mutual, ...fans], following: rest };
  }, [users, followingIds, followEdges, blockedIds, conversations, currentUserId]);
  const people = useMemo(() => [...suggested, ...following], [suggested, following]);
  // The chat locks the app already knows about are asked about again as the step opens.
  useEffect(() => {
    const locked = actions.lockedNow(people.map((u) => u.id));
    if (locked.length) void actions.recheckFollows(locked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The latest picks, for a tap that finishes after waiting on the server.
  const pickedNow = useRef(picked);
  pickedNow.current = picked;

  const term = query.trim().replace(/^@/, '').toLowerCase();
  const matches = (u: User) => !term || `${u.name} ${u.handle}`.toLowerCase().includes(term);
  const shownSuggested = suggested.filter(matches);
  const shownFollowing = following.filter(matches);
  const shown = [...shownSuggested, ...shownFollowing];
  const pickedUsers = picked.map((pid) => users.find((u) => u.id === pid)).filter((u): u is User => !!u);

  // With real invites the group rule decides (a teen must follow you), as for adding to a chat group;
  // before them, the chat rule (the invite was a chat message).
  const why = (u: User): Why => (inGroup.has(u.id) ? 'member'
    : asking.has(u.id) ? 'asking'
    : sentHere.has(u.id) ? 'invited'
    : !(feedGroupInvitesLive ? actions.canAddToGroup(u.id) : actions.canMessage(u.id)) ? 'locked' : null);

  const toggle = async (u: User) => {
    if (pickedNow.current.includes(u.id)) { haptics.untap(); onPicked((now) => now.filter((x) => x !== u.id)); setNote(null); return; }
    const w = why(u);
    if (w === 'member' || w === 'asking' || w === 'invited') return;
    // Locked, unless they have followed you since the app opened: ask before saying no.
    if (w === 'locked' && !(await actions.reachNow(u.id))) { setNote(feedGroupInvitesLive ? inviteLockNote(named(u, users)) : chatLockNote(named(u, users))); return; }
    // The picks as they are now, not as they were before the wait: two quick taps both count.
    if (pickedNow.current.includes(u.id)) return;
    if (pickedNow.current.length >= INVITE_MAX) { setNote(`You can invite up to ${INVITE_MAX} people at once. Share the link for more.`); return; }
    haptics.tap();
    setNote(null);
    pickedNow.current = [...pickedNow.current, u.id];
    onPicked((now) => (now.includes(u.id) ? now : [...now, u.id]));
  };

  const copy = async () => {
    try { await Clipboard.setStringAsync(link); haptics.tap(); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setNote(`Copy this link: ${link}`); }
  };
  const share = async () => {
    try { const said = await shareOutside(`Join ${groupName} on CourtSide`, link); if (said) setNote(said); } catch { /* the share sheet was closed */ }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.linkCard}>
        <View style={styles.linkRow}>
          <View style={styles.linkIcon}><Ionicons name="link-outline" size={18} color={colors.brand} /></View>
          <View style={styles.words}>
            <Text style={styles.linkTitle}>Invite link</Text>
            <Text style={styles.linkText} numberOfLines={1}>{link.replace(/^https:\/\//, '')}</Text>
          </View>
        </View>
        <View style={styles.linkActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Link copied' : 'Copy invite link'} onPress={() => { void copy(); }} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.text} />
            <Text style={styles.linkBtnText}>{copied ? 'Copied' : 'Copy link'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share invite link" onPress={() => { void share(); }} style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}>
            <Ionicons name="share-outline" size={16} color={colors.text} />
            <Text style={styles.linkBtnText}>Share link</Text>
          </Pressable>
        </View>
      </View>

      {people.length > 6 || term ? <SearchField value={query} onChangeText={setQuery} placeholder="Search people" accessibilityLabel="Search people to invite" /> : null}

      {pickedUsers.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
          {pickedUsers.map((u) => (
            <Pressable key={u.id} accessibilityRole="button" accessibilityLabel={`Take ${u.name} out`} onPress={() => { void toggle(u); }} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={22} />
              <Text style={styles.chipText} numberOfLines={1}>{u.name.split(' ')[0]}</Text>
              <Ionicons name="close" size={13} color={colors.brand} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {note ? (
        <View style={styles.note} accessibilityLiveRegion="polite">
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>{note}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={() => setNote(null)}>
            <Ionicons name="close" size={15} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}

      {!people.length ? (
        <View style={[styles.card, styles.empty]}>
          <Ionicons name="people-outline" size={22} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Nobody to pick yet</Text>
          <Text style={styles.emptyBody}>Follow people to invite them here, or send the link above to anyone.</Text>
        </View>
      ) : !shown.length ? (
        <Text style={styles.none}>{`Nobody matches “${query.trim()}”.`}</Text>
      ) : (
        ([['Suggested', shownSuggested], ['Following', shownFollowing]] as const).map(([title, list], part) => (list.length ? (
          <View key={title} style={styles.part}>
            <View style={styles.headRow}>
              <Text style={styles.section}>{title}</Text>
              {part === 0 || !shownSuggested.length ? (picked.length ? <Text style={styles.count}>{picked.length} picked</Text> : null) : null}
            </View>
            <View style={styles.card}>
              {list.map((u, i) => {
                const on = picked.includes(u.id);
                const w = on ? null : why(u);
                const done = w === 'member' || w === 'asking' || w === 'invited';
                const status = w === 'member' ? 'In the group' : w === 'asking' ? 'Asking to join' : w === 'invited' ? 'Invited' : w === 'locked' ? (feedGroupInvitesLive ? 'Can’t invite yet' : 'Can’t message yet') : `@${u.handle}`;
                const said = w === 'member' ? 'already in the group' : w === 'asking' ? 'asking to join, approve them on the group’s page' : w === 'invited' ? 'invited' : w === 'locked' ? (feedGroupInvitesLive ? 'can’t be invited yet' : 'can’t be messaged yet') : `@${u.handle}`;
                return (
                  <Pressable
                    key={u.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: done }}
                    accessibilityLabel={`${u.name}, ${said}`}
                    disabled={done}
                    onPress={() => { void toggle(u); }}
                    style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.rowPressed]}
                  >
                    <View style={done && styles.dim}>
                      <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={42} />
                    </View>
                    <View style={[styles.words, done && styles.dim]}>
                      <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                      <Text style={[styles.handle, w === 'invited' && styles.invited]} numberOfLines={1}>{status}</Text>
                    </View>
                    {w === 'locked' ? <Ionicons name="lock-closed" size={14} color={colors.textFaint} /> : null}
                    {w === 'member' ? <Ionicons name="checkmark-circle" size={24} color={colors.textFaint} />
                      : w === 'invited' ? <Ionicons name="paper-plane" size={18} color={colors.brand} />
                      : <View style={[styles.tick, on && styles.tickOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null))
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  part: { gap: spacing.sm },
  invited: { color: colors.brand },
  pressed: { opacity: PRESS_DIM },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  linkCard: { ...lift, borderRadius: 20, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  linkTitle: { ...typography.body, ...font('600'), color: colors.text },
  linkText: { ...typography.small, color: colors.textMuted },
  linkActions: { flexDirection: 'row', gap: spacing.sm },
  linkBtn: { flex: 1, height: buttonShape.height, borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  linkBtnText: { ...typography.smallStrong, color: colors.text },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xs },
  section: { ...typography.smallStrong, color: colors.textMuted },
  count: { ...typography.smallStrong, color: colors.brand },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 5, paddingRight: 10, borderRadius: radius.pill, backgroundColor: colors.brandDim, maxWidth: 160 },
  chipText: { ...typography.smallStrong, color: colors.brand, flexShrink: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  noteText: { ...typography.small, color: colors.text, flex: 1, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, paddingHorizontal: spacing.lg, minHeight: 62 },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dim: { opacity: 0.5 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  handle: { ...typography.small, color: colors.textMuted },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xs },
  emptyBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  none: { ...typography.small, color: colors.textMuted },
});
