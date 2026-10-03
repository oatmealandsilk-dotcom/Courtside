import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import { SearchField } from '@/components/SearchField';
import { SheetTitle } from '@/components/sheet/SheetForm';
import type { DiscoverGroup, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { confirm } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { GROUPS_AGE_LINE, MAX_GROUPS, groupsOpenTo } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The "+" on the Feed's top row: a window over the feed, not a new page.
 * At the top, "Create a group" (it opens the short Start a group sheet). Under
 * it, the groups you are in, as small chips, and then groups anyone can find
 * (migration 70, discover_groups): near you first, then the most popular.
 * Each says how many are in it and what it is about, never who; an open one
 * has Join, an ask-first one has Request, and the button turns into Joined
 * or Requested once tapped. Nobody is in more than 3 groups: once you are,
 * the buttons fade and say why when tapped. Someone not known to be an adult
 * sees one calm line instead (groups are adults-only, as on the server).
 * The Groups page (from Profile, or "Manage" here) stays as it was.
 */

const FULL_LINE = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to join another.`;
const FULL_START_LINE = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.`;

export default function FindGroups() {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, feedGroupsAsked, feedGroupsOn, currentUserId, currentUser, actions } = useApp();
  const [closeSignal, setCloseSignal] = useState(0);
  const dismiss = () => setCloseSignal((n) => n + 1);
  // Where to go once the sheet has gone (a group's page, or the Groups page).
  const next = useRef<string | null>(null);
  const go = (href: string) => { next.current = href; dismiss(); };
  const done = () => {
    router.back();
    const href = next.current;
    if (href) router.push(href as never);
  };

  const open = groupsOpenTo(currentUser);
  const off = feedGroupsOn === false;
  const full = feedGroups.length >= MAX_GROUPS;
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The groups you were already in when this opened are in "Your groups", not the list.
  // One you join from here stays in the list, saying Joined.
  const minedAtOpen = useRef(new Set(feedGroups.map((g) => g.id)));

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DiscoverGroup[] | null | undefined>(undefined);
  const asked = useRef(0);
  useEffect(() => {
    if (!open || off) return;
    const ask = ++asked.current;
    const t = setTimeout(() => {
      void actions.discoverFeedGroups(search).then((got) => { if (ask === asked.current) setRows(got); });
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, open, off]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where you stand with each group: the app's own copy of your groups and requests wins over the list's.
  const listed = useMemo(() => (rows ?? [])
    .filter((r) => !minedAtOpen.current.has(r.id))
    .map((r) => {
      const mine = feedGroups.find((g) => g.id === r.id);
      return {
        ...r,
        member: feedGroupsOn ? !!mine : r.member,
        requested: feedGroupsOn ? feedGroupsAsked.some((a) => a.id === r.id) : r.requested,
        memberCount: mine ? Math.max(mine.members.length, r.memberCount) : r.memberCount,
      };
    }), [rows, feedGroups, feedGroupsAsked, feedGroupsOn]);
  const searching = !!search.trim();
  const near = searching ? [] : listed.filter((r) => r.near);
  const rest = searching ? listed : listed.filter((r) => !r.near);

  const [busy, setBusy] = useState<ID | null>(null);
  const join = (g: DiscoverGroup) => {
    if (busy) return;
    if (full) { showToast({ title: FULL_LINE, icon: 'people-outline' }); return; }
    setBusy(g.id);
    void actions.joinFeedGroup(g.id)
      .then((how) => {
        if (how === 'requested') showToast({ title: `Asked to join ${g.name}`, body: 'You’ll be in once an admin says yes.', icon: 'hourglass-outline' });
      })
      .catch((e) => showToast({ title: e instanceof Error ? e.message : 'That didn’t go through.', icon: 'alert-circle-outline' }))
      .finally(() => setBusy(null));
  };
  const cancel = (g: DiscoverGroup) => confirm({
    title: `Cancel your request to join ${g.name}?`,
    confirmLabel: 'Cancel request',
    onConfirm: () => { void actions.leaveFeedGroup(g.id).catch(() => undefined); },
  });

  // The Start a group sheet takes this one's place. Already in 3, it says so there,
  // with a way to your groups, before anything is filled in.
  const create = () => router.replace('/group-form');

  const renderRow = (g: DiscoverGroup & { member: boolean; requested: boolean }, i: number) => {
    const members = `${g.memberCount} ${g.memberCount === 1 ? 'member' : 'members'}`;
    const working = busy === g.id;
    const state = g.member ? 'joined' : g.requested ? 'requested' : g.ask ? 'request' : 'join';
    const label = working ? (g.ask ? 'Asking…' : 'Joining…')
      : state === 'joined' ? 'Joined' : state === 'requested' ? 'Requested' : state === 'request' ? 'Request' : 'Join';
    const faded = full && (state === 'join' || state === 'request');
    const onPress = state === 'joined' ? () => go(`/g/${g.id}`) : state === 'requested' ? () => cancel(g) : () => join(g);
    const a11y = state === 'joined' ? `You’re in ${g.name}. Open it`
      : state === 'requested' ? `You asked to join ${g.name}. Cancel the request`
      : faded ? `${label}. ${FULL_LINE}`
      : state === 'request' ? `Ask to join ${g.name}` : `Join ${g.name}`;
    return (
      <View key={g.id} style={[styles.row, i > 0 && styles.line]}>
        <GroupTile name={g.name} look={g.look} size={44} />
        <View style={styles.words}>
          <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{members}{g.ask ? ' · Ask to join' : ' · Open'}</Text>
          {g.description ? <Text style={styles.about} numberOfLines={2}>{g.description}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11y}
          disabled={working}
          hitSlop={6}
          onPress={onPress}
          style={({ pressed }) => [
            styles.btn,
            state === 'join' ? styles.btnJoin : state === 'request' ? styles.btnRequest : styles.btnQuiet,
            faded && styles.btnFaded,
            pressed && styles.btnPressed,
          ]}
        >
          {working ? <ActivityIndicator size="small" color={state === 'join' ? colors.brandInk : colors.brand} />
            : state === 'joined' ? <Ionicons name="checkmark" size={14} color={colors.textMuted} />
            : null}
          {!working ? (
            <Text style={[styles.btnText, state === 'join' ? styles.btnTextJoin : state === 'request' ? styles.btnTextRequest : styles.btnTextQuiet]}>{label}</Text>
          ) : null}
        </Pressable>
      </View>
    );
  };

  const asking = (id: ID) => {
    const g = feedGroups.find((x) => x.id === id);
    return !!g && g.requests.length > 0 && g.members.some((m) => m.id === currentUserId && m.admin);
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={done}
      peekFraction={0.86}
      header={<SheetTitle title="Groups" line="A feed only the group sees" onClose={dismiss} />}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!open ? (
          <View style={[styles.card, styles.ageCard]}>
            <View style={styles.ageIcon}><Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} /></View>
            <Text style={styles.ageLine}>{GROUPS_AGE_LINE}</Text>
          </View>
        ) : off ? (
          <Text style={styles.note}>Groups aren’t switched on yet. Check back soon.</Text>
        ) : (
          <>
            <SearchField value={search} onChangeText={setSearch} placeholder="Search groups" accessibilityLabel="Search groups" />

            {!searching ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={full ? `Create a group. ${FULL_START_LINE}` : 'Create a group'}
                onPress={create}
                style={({ pressed }) => [styles.card, styles.create, pressed && styles.pressed]}
              >
                <View style={[styles.createIcon, full && styles.btnFaded]}><Ionicons name="add" size={24} color={colors.brandInk} /></View>
                <View style={styles.words}>
                  <Text style={[styles.createTitle, full && styles.dim]}>Create a group</Text>
                  <Text style={styles.meta} numberOfLines={2}>{full ? FULL_START_LINE : 'Your crew, your club, your team. You’re the admin.'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            ) : null}

            {!searching && feedGroups.length ? (
              <View style={styles.part}>
                <View style={styles.partHead}>
                  <Text style={styles.section}>Your groups · {feedGroups.length} of {MAX_GROUPS}</Text>
                  <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={8} onPress={() => go('/groups')}>
                    <Text style={styles.link}>Manage</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mine}>
                  {feedGroups.map((g) => (
                    <Pressable
                      key={g.id}
                      accessibilityRole="link"
                      accessibilityLabel={`${g.name}${asking(g.id) ? ', someone is asking to join' : ''}`}
                      onPress={() => go(`/g/${g.id}`)}
                      style={({ pressed }) => [styles.mineChip, pressed && styles.pressed]}
                    >
                      <GroupTile name={g.name} look={g.look} size={28} />
                      <Text style={styles.mineName} numberOfLines={1}>{g.name}</Text>
                      {asking(g.id) ? <View style={styles.dot} /> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {rows === undefined ? (
              <ActivityIndicator style={styles.loading} color={colors.textFaint} />
            ) : rows === null ? (
              <Text style={styles.note}>Finding groups isn’t switched on yet. You can still start one, or join with an invite link.</Text>
            ) : (
              <>
                {near.length ? (
                  <View style={styles.part}>
                    <Text style={styles.section}>Groups near you</Text>
                    <View style={styles.card}>{near.map(renderRow)}</View>
                  </View>
                ) : null}
                {rest.length ? (
                  <View style={styles.part}>
                    <Text style={styles.section}>{searching ? 'Groups' : 'Popular'}</Text>
                    <View style={styles.card}>{rest.map(renderRow)}</View>
                  </View>
                ) : null}
                {!near.length && !rest.length ? (
                  <Text style={styles.note}>
                    {searching ? `No group matches “${search.trim()}”.` : 'No groups to find yet. Start the first one.'}
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
  note: { ...typography.small, color: colors.textMuted, lineHeight: 19, paddingVertical: spacing.md, paddingHorizontal: spacing.xs },
  loading: { paddingVertical: spacing.xl },
  // The grouped list of Settings and the Groups page: a shade off the sheet, rows on hairlines.
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.55 },
  create: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  createIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  createTitle: { ...typography.bodyStrong, color: colors.brand },
  part: { gap: spacing.sm },
  partHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  section: { ...typography.smallStrong, color: colors.textMuted, paddingHorizontal: spacing.xs },
  link: { ...typography.smallStrong, color: colors.brand },
  mine: { gap: spacing.sm, paddingHorizontal: 2, paddingVertical: 2 },
  mineChip: {
    ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40, paddingLeft: 6, paddingRight: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.surface, maxWidth: 220,
  },
  mineName: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, ...font('600'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  about: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  // Join is the one green thing to press; Request is the same in a softer green (it waits for a yes); Joined and Requested are quiet.
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, minWidth: 84, paddingHorizontal: 14, borderRadius: radius.pill },
  btnJoin: { backgroundColor: colors.brand },
  btnRequest: { backgroundColor: colors.brandDim },
  btnQuiet: { backgroundColor: colors.surfaceAlt },
  btnFaded: { opacity: 0.45 },
  btnPressed: { opacity: 0.7 },
  btnText: { ...typography.smallStrong },
  btnTextJoin: { color: colors.brandInk },
  btnTextRequest: { color: colors.brand },
  btnTextQuiet: { color: colors.textMuted },
  ageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  ageIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  ageLine: { ...typography.body, color: colors.text, flex: 1 },
});
