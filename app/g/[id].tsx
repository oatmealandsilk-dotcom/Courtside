import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Button, EmptyState, Field, Screen, SegmentedControl } from '@/components/ui';
import { CourtSpinner } from '@/components/CourtSpinner';
import type { FeedGroupCard } from '@/data/types';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import { confirm } from '@/lib/confirm';
import { goBack } from '@/lib/goBack';
import { publicRoute } from '@/features/share/publicRoute';
import { shareLink } from '@/lib/shareLink';
import { shareOutside } from '@/lib/shareOutside';
import { useApp } from '@/store/AppContext';
import { GROUPS_AGE_LINE, MAX_GROUPS, groupsOpenTo } from '@/store/feedGroups';
import { colors, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * One group's page, and where its invite link (/g/<id>) lands, in the app or
 * a browser. Someone not in it sees its name and a Join (or Ask to join)
 * button. A member sees who is in it, can open its feed, share the link or
 * leave. Its admin also answers requests, removes people and edits it.
 */

type JoinMode = 'open' | 'ask';

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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [mode, setMode] = useState<JoinMode>('open');

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
  const startEdit = () => { if (!group) return; setName(group.name); setAbout(group.description ?? ''); setMode(group.ask ? 'ask' : 'open'); setEditing(true); };
  const save = () => act(async () => { await actions.updateFeedGroup(id, { name, description: about, ask: mode === 'ask' }); setEditing(false); });

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

  return (
    <Screen title={title} compactTitle onBack={() => goBack('/groups')}>
      <View style={styles.head}>
        <View style={styles.headTile}><Ionicons name="people" size={26} color={colors.brand} /></View>
        {description ? <Text style={styles.about}>{description}</Text> : null}
        <Text style={styles.meta}>{count} {count === 1 ? 'member' : 'members'} · {ask ? 'Ask to join' : 'Anyone with the link can join'}</Text>
      </View>

      {group ? (
        <View style={styles.actions}>
          <Button label="See the feed" onPress={() => openGroupFeed(id)} full />
          <View style={styles.pair}>
            <View style={{ flex: 1 }}><Button label="Post to group" variant="secondary" onPress={() => router.push({ pathname: '/compose', params: { group: id } })} full /></View>
            <View style={{ flex: 1 }}><Button label="Invite" variant="secondary" onPress={invite} full /></View>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {!open
            ? <Text style={styles.ageLine}>{GROUPS_AGE_LINE}</Text>
            : asked
            ? <Button label="Asked to join · Cancel" variant="secondary" onPress={() => act(async () => { await actions.leaveFeedGroup(id); await readCard(); })} disabled={busy} full />
            : <Button label={ask ? 'Ask to join' : 'Join group'} onPress={join} loading={busy} disabled={busy} full />}
          {open ? <Text style={styles.meta}>Only people in the group see what’s shared to it. You can be in up to {MAX_GROUPS} groups.</Text> : null}
        </View>
      )}
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {group && admin && group.requests.length ? (
        <>
          <Text style={styles.section}>Asking to join</Text>
          <View style={styles.list}>
            {group.requests.map((who, i) => {
              const u = byId.get(who);
              return (
                <View key={who} style={[styles.request, i > 0 && styles.rowLine]}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${who}`)} style={styles.person}>
                    <Avatar name={u?.name ?? 'Player'} seed={u?.avatarSeed ?? who} uri={u?.avatarUrl} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{u?.name ?? 'A player'}</Text>
                      {u ? <Text style={styles.meta} numberOfLines={1}>@{u.handle}</Text> : null}
                    </View>
                  </Pressable>
                  <View style={styles.pair}>
                    <View style={{ flex: 1 }}><Button label="Decline" variant="secondary" onPress={() => act(() => actions.answerFeedGroupRequest(id, who, false))} disabled={busy} full /></View>
                    <View style={{ flex: 1 }}><Button label="Accept" onPress={() => act(() => actions.answerFeedGroupRequest(id, who, true))} disabled={busy} full /></View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {group ? (
        <>
          <Text style={styles.section}>Members</Text>
          <View style={styles.list}>
            {group.members.map((m, i) => {
              const u = byId.get(m.id);
              const you = m.id === currentUserId;
              return (
                <View key={m.id} style={[styles.row, i > 0 && styles.rowLine]}>
                  <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${m.id}`)} style={styles.person}>
                    <Avatar name={u?.name ?? 'Player'} seed={u?.avatarSeed ?? m.id} uri={u?.avatarUrl} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{you ? 'You' : u?.name ?? 'A player'}</Text>
                      <Text style={styles.meta}>{m.admin ? 'Admin' : u ? `@${u.handle}` : 'Member'}</Text>
                    </View>
                  </Pressable>
                  {admin && !you ? (
                    <Button
                      label="Remove"
                      variant="ghost"
                      disabled={busy}
                      onPress={() => confirm({
                        title: `Remove ${u?.name.split(' ')[0] ?? 'them'}?`,
                        message: 'They stop seeing the group’s posts. They can ask to join again.',
                        confirmLabel: 'Remove',
                        destructive: true,
                        onConfirm: () => { void act(() => actions.removeFeedGroupMember(id, m.id)); },
                      })}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>

          {admin ? (
            editing ? (
              <View style={styles.form}>
                <Text style={styles.section}>Edit group</Text>
                <Field label="Name" value={name} onChangeText={(t) => setName(t.slice(0, 40))} autoCapitalize="words" />
                <Field label="About (optional)" value={about} onChangeText={(t) => setAbout(t.slice(0, 140))} multiline minHeight={64} />
                <SegmentedControl<JoinMode> segments={[{ value: 'open', label: 'Anyone with the link' }, { value: 'ask', label: 'Ask to join' }]} value={mode} onChange={setMode} />
                <View style={styles.pair}>
                  <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} full /></View>
                  <View style={{ flex: 1 }}><Button label="Save" onPress={save} disabled={!name.trim() || busy} full /></View>
                </View>
              </View>
            ) : (
              <View style={styles.footer}><Button label="Edit group" variant="secondary" onPress={startEdit} full /></View>
            )
          ) : null}
          <View style={styles.footer}><Button label="Leave group" variant="danger" onPress={leave} full /></View>
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
  head: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  headTile: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  about: { ...typography.body, color: colors.text, textAlign: 'center', maxWidth: 340 },
  meta: { ...typography.small, color: colors.textMuted, textAlign: 'left' },
  actions: { gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm },
  note: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  ageLine: { ...typography.body, color: colors.text, textAlign: 'center' },
  section: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  list: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  request: { gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  form: { gap: spacing.md },
  footer: { marginTop: spacing.lg },
});
