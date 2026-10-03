import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';

import { Avatar } from '@/components/ui';
import { SearchField } from '@/components/SearchField';
import type { ID, User } from '@/data/types';
import { chatLockNote, named } from '@/features/messages/groups';
import * as haptics from '@/lib/haptics';
import { shareLink } from '@/lib/shareLink';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * Start a group's last step: bring your people in. At the top, the group's
 * invite link (/g/<id>, carrying your handle, so whoever joins through it
 * counts as yours) with Copy and Share. Under it, the people you follow, to
 * tick: each one picked gets the invite in your chat with them, a card with
 * the group's face that opens its page (a plain message the app already
 * sends, nothing new on the server). The picked show as chips above the
 * list, a tap takes one out.
 *
 * The same people New message offers, under the same rules: nobody you are
 * blocked with; someone the chat rules lock (a teen who doesn't follow you,
 * say) shows a lock, is asked about again on tap, and says why in a note if
 * still locked; someone known to be under 18 can't join a group, so they
 * show that instead; anyone already in the group says so.
 */

export const INVITE_MAX = 20;

export function InvitePeople({ groupId, groupName, picked, onPicked }: {
  groupId: ID; groupName: string; picked: ID[]; onPicked: (next: ID[]) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, followingIds, blockedIds, conversations, currentUserId, currentUser, feedGroups, actions } = useApp();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = shareLink('group', groupId, currentUser?.handle);
  const inGroup = new Set(feedGroups.find((g) => g.id === groupId)?.members.map((m) => m.id) ?? []);

  // Who you follow, the people you talk to most first, then by name.
  const people = useMemo(() => {
    const recent = [...conversations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).flatMap((c) => c.participantIds.filter((p) => p !== currentUserId));
    const rank = (u: User) => { const i = recent.indexOf(u.id); return i < 0 ? 9999 : i; };
    return followingIds
      .map((fid) => users.find((u) => u.id === fid))
      .filter((u): u is User => !!u && u.id !== currentUserId && !blockedIds.includes(u.id))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [users, followingIds, blockedIds, conversations, currentUserId]);
  // The chat locks the app already knows about are asked about again as the step opens.
  useEffect(() => {
    const locked = actions.lockedNow(people.map((u) => u.id));
    if (locked.length) void actions.recheckFollows(locked);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const term = query.trim().replace(/^@/, '').toLowerCase();
  const shown = term ? people.filter((u) => `${u.name} ${u.handle}`.toLowerCase().includes(term)) : people;
  const pickedUsers = picked.map((pid) => users.find((u) => u.id === pid)).filter((u): u is User => !!u);

  const why = (u: User): 'member' | 'teen' | 'locked' | null => (inGroup.has(u.id) ? 'member' : u.ageGroup === 'teen' ? 'teen' : !actions.canMessage(u.id) ? 'locked' : null);

  const toggle = async (u: User) => {
    if (picked.includes(u.id)) { haptics.untap(); onPicked(picked.filter((x) => x !== u.id)); setNote(null); return; }
    const w = why(u);
    if (w === 'member') return;
    if (w === 'teen') { setNote(`${u.name.split(' ')[0]} can’t join groups yet. They open at 18.`); return; }
    // Locked, unless they have followed you since the app opened: ask before saying no.
    if (w === 'locked' && !(await actions.reachNow(u.id))) { setNote(chatLockNote(named(u, users))); return; }
    if (picked.length >= INVITE_MAX) { setNote(`You can invite up to ${INVITE_MAX} people at once. Share the link for more.`); return; }
    haptics.tap();
    setNote(null);
    onPicked([...picked, u.id]);
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

      <View style={styles.headRow}>
        <Text style={styles.section}>People you follow</Text>
        {picked.length ? <Text style={styles.count}>{picked.length} picked</Text> : null}
      </View>
      {people.length > 6 || term ? <SearchField value={query} onChangeText={setQuery} placeholder="Search people you follow" accessibilityLabel="Search people you follow" /> : null}

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
        <Text style={styles.none}>{`Nobody you follow matches “${query.trim()}”.`}</Text>
      ) : (
        <View style={styles.card}>
          {shown.map((u, i) => {
            const on = picked.includes(u.id);
            const w = on ? null : why(u);
            const status = w === 'member' ? 'In the group' : w === 'teen' ? 'Groups open at 18' : `@${u.handle}`;
            return (
              <Pressable
                key={u.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: w === 'member' }}
                accessibilityLabel={`${u.name}, ${w === 'member' ? 'already in the group' : w === 'teen' ? 'can’t join groups until 18' : w === 'locked' ? 'can’t be messaged yet' : `@${u.handle}`}`}
                disabled={w === 'member'}
                onPress={() => { void toggle(u); }}
                style={({ pressed }) => [styles.row, i > 0 && styles.line, pressed && styles.rowPressed]}
              >
                <View style={(w === 'member' || w === 'teen') && styles.dim}>
                  <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={42} />
                </View>
                <View style={[styles.words, (w === 'member' || w === 'teen') && styles.dim]}>
                  <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                  <Text style={styles.handle} numberOfLines={1}>{status}</Text>
                </View>
                {w === 'locked' || w === 'teen' ? <Ionicons name="lock-closed" size={14} color={colors.textFaint} /> : null}
                {w === 'member' ? <Ionicons name="checkmark-circle" size={24} color={colors.textFaint} /> : (
                  <View style={[styles.tick, on && styles.tickOn]}>{on ? <Ionicons name="checkmark" size={15} color={colors.brandInk} /> : null}</View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  pressed: { opacity: 0.7 },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  linkCard: { ...lift, borderRadius: 20, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  linkTitle: { ...typography.body, ...font('600'), color: colors.text },
  linkText: { ...typography.small, color: colors.textMuted },
  linkActions: { flexDirection: 'row', gap: spacing.sm },
  linkBtn: { flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  linkBtnText: { ...typography.smallStrong, color: colors.text },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs, marginTop: spacing.xs },
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
  none: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.xs },
});
