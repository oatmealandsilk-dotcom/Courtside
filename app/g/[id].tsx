import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { CourtSpinner } from '@/components/CourtSpinner';
import type { FeedGroupCard } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { publicRoute } from '@/features/share/publicRoute';
import { shareLink } from '@/lib/shareLink';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { GROUPS_AGE_LINE, MAX_GROUPS, groupsOpenTo } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * One group's page, and where its invite link (/g/<id>) lands, in the app or
 * a browser. Someone not in it sees its name and a Join (or Ask to join)
 * button. A member sees who is in it, can open its feed, share the link or
 * leave. Its admin also answers requests, removes people and edits it (in a
 * sheet, group-form, opened from Edit in the header).
 */

function GroupPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { feedGroups, feedGroupsAsked, users, currentUserId, currentUser, actions } = useApp();
  // Groups are adults-only for now: someone not known to be an adult sees
  // one calm line where Join would be (the server says no to them anyway).
  const open = groupsOpenTo(currentUser);
  const group = feedGroups.find((g) => g.id === id);
  const [card, setCard] = useState<FeedGroupCard | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Asked once signed in (a link opened cold signs in first), after your own groups are read.
  const readCard = useCallback(async () => { if (id && currentUserId) setCard(await actions.feedGroupCard(id)); }, [id, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [groupsRead, setGroupsRead] = useState(false);
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups().finally(() => setGroupsRead(true)); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!group && groupsRead) void readCard(); }, [group, groupsRead, readCard]);

  const byId = new Map(users.map((u) => [u.id, u]));
  const admin = !!group?.members.some((m) => m.id === currentUserId && m.admin);
  const asked = feedGroupsAsked.some((a) => a.id === id) || !!card?.requested;

  const act = async (run: () => Promise<unknown>, after?: string) => {
    setBusy(true); setNote(null);
    try { await run(); if (after) setNote(after); } catch (e) { setNote(e instanceof Error ? e.message : 'That didn’t go through.'); } finally { setBusy(false); }
  };
  const join = () => act(async () => {
    const out = await actions.joinFeedGroup(id);
    if (out === 'requested') { setNote('Asked. The admin will say yes or no.'); await readCard(); }
  });
  const invite = async () => {
    const name = group?.name ?? card?.name ?? 'my group';
    try { const said = await shareOutside(`Join ${name} on CourtSide`, shareLink('group', id)); if (said) setNote(said); } catch { setNote(`Share this link: ${shareLink('group', id)}`); }
  };
  const leave = () => confirm({
    title: `Leave ${group?.name ?? 'this group'}?`,
    message: group?.ask ? 'You’ll need the admin’s yes to come back.' : 'You can join again with the link.',
    confirmLabel: 'Leave',
    destructive: true,
    onConfirm: () => { void act(() => actions.leaveFeedGroup(id)).then(() => goBack('/groups')); },
  });

  if (!group && card === undefined) {
    return <Screen title="Group" compactTitle onBack={() => goBack('/groups')}><View style={styles.loading}><CourtSpinner size={28} /></View></Screen>;
  }
  if (!group && !card) {
    return (
      <Screen title="Group" compactTitle onBack={() => goBack('/groups')}>
        <EmptyState icon="people-outline" title="This group isn’t here" body="The link may be wrong, or the group has gone." />
      </Screen>
    );
  }

  const title = group?.name ?? card?.name ?? 'Group';
  const description = group ? group.description : card?.description;
  const count = group ? group.members.length : card?.memberCount ?? 0;
  const ask = group ? group.ask : !!card?.ask;

  const members = `${count} ${count === 1 ? 'member' : 'members'}`;
  const edit = admin ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Edit group" hitSlop={10} onPress={() => router.push({ pathname: '/group-form', params: { id } })} style={({ pressed }) => [styles.edit, pressed && styles.pillPressed]}>
      <Text style={styles.editText}>Edit</Text>
    </Pressable>
  ) : undefined;

  return (
    <Screen title="Group" compactTitle onBack={() => goBack('/groups')} right={edit}>
      <View style={styles.head}>
        <GroupTile name={title} size={88} />
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {description ? <Text style={styles.about}>{description}</Text> : null}
        <Text style={styles.headMeta}>{members} · {ask ? 'Ask to join' : 'Anyone with the link can join'}</Text>
      </View>

      {group ? (
        <View style={styles.actions}>
          {([
            { icon: 'play-circle-outline', label: 'Feed', hint: `Open ${title}’s feed`, onPress: () => openGroupFeed(id) },
            { icon: 'add-circle-outline', label: 'Post', hint: `Post to ${title}`, onPress: () => router.push({ pathname: '/compose', params: { group: id } }) },
            { icon: 'person-add-outline', label: 'Invite', hint: `Invite people to ${title}`, onPress: () => { void invite(); } },
          ] as const).map((a) => (
            <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.hint} onPress={a.onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Ionicons name={a.icon} size={22} color={colors.brand} />
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.joinBox}>
          {!open
            ? <Text style={styles.ageLine}>{GROUPS_AGE_LINE}</Text>
            : asked
            ? <Button label="Asked to join · Cancel" variant="secondary" onPress={() => act(async () => { await actions.leaveFeedGroup(id); await readCard(); })} disabled={busy} full />
            : <Button label={ask ? 'Ask to join' : 'Join group'} onPress={join} loading={busy} disabled={busy} full />}
          {open ? <Text style={styles.joinNote}>Only people in the group see what’s shared to it. You can be in up to {MAX_GROUPS} groups.</Text> : null}
        </View>
      )}
      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}

      {group && admin && group.requests.length ? (
        <>
          <Text style={styles.section}>Asking to join · {group.requests.length}</Text>
          <View style={styles.card}>
            {group.requests.map((who, i) => {
              const u = byId.get(who);
              const first = u?.name.split(' ')[0] ?? 'them';
              return (
                <View key={who} style={[styles.row, i > 0 && styles.line]}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${who}`)} style={styles.person}>
                    <Avatar name={u?.name ?? 'Player'} seed={u?.avatarSeed ?? who} uri={u?.avatarUrl} size={40} />
                    <View style={styles.words}>
                      <Text style={styles.name} numberOfLines={1}>{u?.name ?? 'A player'}</Text>
                      {u ? <Text style={styles.meta} numberOfLines={1}>@{u.handle}</Text> : null}
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Decline ${first}`} hitSlop={6} disabled={busy} onPress={() => act(() => actions.answerFeedGroupRequest(id, who, false))} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, busy && styles.off]}>
                    <Text style={styles.pillText}>Decline</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Approve ${first}`} hitSlop={6} disabled={busy} onPress={() => act(() => actions.answerFeedGroupRequest(id, who, true))} style={({ pressed }) => [styles.pill, styles.pillYes, pressed && styles.pillPressed, busy && styles.off]}>
                    <Text style={[styles.pillText, styles.pillYesText]}>Approve</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {group ? (
        <>
          <Text style={styles.section}>Members · {group.members.length}</Text>
          <View style={styles.card}>
            {[...group.members].sort((a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId) || Number(b.admin) - Number(a.admin)).map((m, i) => {
              const u = byId.get(m.id);
              const you = m.id === currentUserId;
              return (
                <View key={m.id} style={[styles.row, i > 0 && styles.line]}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${m.id}`)} style={styles.person}>
                    <Avatar name={u?.name ?? 'Player'} seed={u?.avatarSeed ?? m.id} uri={u?.avatarUrl} size={40} />
                    <View style={styles.words}>
                      <Text style={styles.name} numberOfLines={1}>{you ? 'You' : u?.name ?? 'A player'}</Text>
                      <Text style={styles.meta} numberOfLines={1}>{u ? `@${u.handle}` : 'Member'}</Text>
                    </View>
                  </Pressable>
                  {m.admin ? <View style={styles.chip}><Text style={styles.chipText}>Admin</Text></View> : null}
                  {admin && !you ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${u?.name ?? 'them'}`}
                      hitSlop={6}
                      disabled={busy}
                      onPress={() => confirm({
                        title: `Remove ${u?.name.split(' ')[0] ?? 'them'}?`,
                        message: 'They stop seeing the group’s posts. They can ask to join again.',
                        confirmLabel: 'Remove',
                        destructive: true,
                        onConfirm: () => { void act(() => actions.removeFeedGroupMember(id, m.id)); },
                      })}
                      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, busy && styles.off]}
                    >
                      <Text style={styles.pillText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
            <Text style={styles.leaveText}>Leave group</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

// An invite link opens here for anyone; signed out, a "Join CourtSide to join
// this group" card that names nothing, and the group opens after sign-up.
export default publicRoute('group', GroupPage);

const styleDefinitions = StyleSheet.create({
  loading: { paddingVertical: 60, alignItems: 'center' },
  // The group's face, name and line, the way a chat group's info page opens.
  head: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.lg, paddingBottom: spacing.xl, paddingHorizontal: spacing.md },
  title: { ...typography.title, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  about: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
  headMeta: { ...typography.small, color: colors.textFaint, textAlign: 'center', marginTop: 2 },
  // Feed, Post, Invite: three small tiles in a row, an icon over a word.
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { ...lift, flex: 1, height: 68, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { ...typography.smallStrong, color: colors.text },
  joinBox: { gap: spacing.sm },
  joinNote: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: spacing.lg },
  ageLine: { ...typography.body, color: colors.text, textAlign: 'center' },
  note: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  // The grouped list of Settings: a shade off the page, rows on hairlines.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.lg, minHeight: 60 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  off: { opacity: 0.5 },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  words: { flex: 1, minWidth: 0, gap: 1 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  chip: { paddingHorizontal: 7, height: 20, borderRadius: radius.pill, backgroundColor: colors.brandDim, justifyContent: 'center' },
  chipText: { ...typography.caption, letterSpacing: 0.2, color: colors.brand },
  // Remove, Decline: plain words in a soft pill. Approve is the one green one.
  pill: { paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pillPressed: { opacity: 0.6 },
  pillText: { ...typography.smallStrong, color: colors.text },
  pillYes: { backgroundColor: colors.brand },
  pillYesText: { color: colors.brandInk },
  // Edit, in the header: plain words in the brand colour.
  edit: { paddingHorizontal: 12, height: 32, borderRadius: radius.pill, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  editText: { ...typography.smallStrong, color: colors.brand },
  // Leave: one plain red row at the end, the way a chat group's info page closes.
  leave: { ...lift, marginTop: spacing.xl, height: 50, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  leaveText: { ...typography.bodyStrong, color: colors.danger },
});
