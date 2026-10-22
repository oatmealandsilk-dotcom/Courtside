import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { DragSheet } from '@/components/DragSheet';
import type { DiscoverGroup, FeedGroup, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { reportGroup } from '@/features/groups/reportGroup';
import { confirm } from '@/lib/confirm';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS } from '@/store/feedGroups';
import { colors, font, lift, radius, readsOn, spacing, typography } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * The "+" on the Feed's top row: a window over the feed, not a new page.
 * "Three courts" (Oct 22, owner: "c is probably best for now"):
 *   - the title, with "1 of 3 joined" (or "Join up to 3") and Manage under it;
 *   - your groups as three slots across the top, one per group you can be in:
 *     a joined one shows its tile and name (and "1 asking" when you run it and
 *     someone wants in); a free one offers "Start a group", the next "Find one";
 *   - then groups anyone can find (migration 70, discover_groups), near you
 *     first, then the most popular, as open rows: tile, name, "N members ·
 *     Open/Ask to join", and a button outlined in the theme's colour that
 *     fills once you're in. A search icon by the first list's title (or the
 *     "Find one" slot) opens a search box in place of the slots.
 * Nobody is in more than 3 groups: once you are, the buttons say "Full" and
 * explain why when tapped. Groups are for everyone, teens included (migration
 * 149). The Groups page (from Profile, or "Manage" here) stays as it was.
 * Holding a group's row reports it (App Review 1.2), as holding a comment
 * does; a group you reported leaves the list.
 */

const FULL_LINE = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to join another.`;
const FULL_NOTE = 'That’s the most. Leave one to join another.';
const EMPTY_LINE = 'No open groups near you yet. Start one and invite your crew.';
const TILE = 40;
const SLOT_TILE = 56;
// The buttons are 30 high; this makes each at least 44pt to tap.
const BTN_SLOP = { top: 7, bottom: 7, left: 6, right: 6 };

type Listed = DiscoverGroup & { member: boolean; requested: boolean };
type RowState = 'join' | 'request' | 'joined' | 'requested';

const isAdmin = (g: FeedGroup, me: ID | null) => g.members.some((m) => m.id === me && m.admin);
const askingCount = (g: FeedGroup, me: ID | null) => (isAdmin(g, me) ? g.requests.length : 0);
const members = (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`;
/** The theme's brand where it reads on `fill` (4.5:1), else the palette's own text colour. */
const brandOn = (fill: string) => (readsOn(colors.brand, fill) ? colors.brand : colors.text);

export default function FindGroups() {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, feedGroupsAsked, feedGroupsOn, currentUserId, reportedIds, actions } = useApp();
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

  const off = feedGroupsOn === false;
  const full = feedGroups.length >= MAX_GROUPS;
  useEffect(() => { if (currentUserId) void actions.loadFeedGroups(); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The groups you were already in when this opened are in the slots, not the list.
  // One you join from here stays in the list, saying Joined.
  const minedAtOpen = useRef(new Set(feedGroups.map((g) => g.id)));

  const [search, setSearch] = useState('');
  // The search box is open (from "Find one" or the search icon), typed in or not.
  const [finding, setFinding] = useState(false);
  // On a phone the sheet opens only as tall as what is in it (once the list is in), so a short one has no empty half.
  // (No fitContent: the computer's centred box keeps its fixed height, so the search box doesn't jump as results change.)
  const [contentH, setContentH] = useState(0);
  const [rows, setRows] = useState<DiscoverGroup[] | null | undefined>(undefined);
  const asked = useRef(0);
  useEffect(() => {
    if (off) return;
    const ask = ++asked.current;
    const t = setTimeout(() => {
      void actions.discoverFeedGroups(search).then((got) => { if (ask === asked.current) setRows(got); });
    }, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, off]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where you stand with each group: the app's own copy of your groups and requests wins over the list's.
  const listed = useMemo<Listed[]>(() => (rows ?? [])
    .filter((r) => !minedAtOpen.current.has(r.id) && !reportedIds.includes(r.id))
    .map((r) => {
      const mine = feedGroups.find((g) => g.id === r.id);
      return {
        ...r,
        member: feedGroupsOn ? !!mine : r.member,
        requested: feedGroupsOn ? feedGroupsAsked.some((a) => a.id === r.id) : r.requested,
        memberCount: mine ? Math.max(mine.members.length, r.memberCount) : r.memberCount,
      };
    }), [rows, feedGroups, feedGroupsAsked, feedGroupsOn, reportedIds]);
  const searching = !!search.trim();
  // While you search it may grow (more found) but never shrinks under you letter by letter:
  // it keeps the height it had before the first letter (on a phone the keyboard has opened it all the way anyway).
  const restH = useRef(0);
  if (!searching) restH.current = contentH;
  const fitH = searching ? Math.max(restH.current, contentH) : contentH;
  const near = searching ? [] : listed.filter((r) => r.near);
  const rest = searching ? listed : listed.filter((r) => !r.near);
  // Search is offered only when there is something to search (a list came back, or a search is typed).
  const canFind = searching || listed.length > 0;
  const searchOpen = finding || searching;
  const stopFinding = () => { setSearch(''); setFinding(false); };

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

  // The Start a group sheet takes this one's place.
  const create = () => router.replace('/group-form');

  const renderRow = (g: Listed, i: number) => {
    const state: RowState = g.member ? 'joined' : g.requested ? 'requested' : g.ask ? 'request' : 'join';
    // Hold the group (not its button) to report it; a screen reader offers Report on it instead.
    const report = () => reportGroup(actions.reportUser, { id: g.id, name: g.name, description: g.description });
    return (
      <React.Fragment key={g.id}>
        {i > 0 ? <View style={styles.hair} /> : null}
        <View style={styles.row}>
          <Pressable
            accessibilityHint="Hold to report"
            accessibilityActions={[{ name: 'longpress', label: 'Report group' }]}
            onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') report(); }}
            onLongPress={report}
            delayLongPress={400}
            style={({ pressed }) => [styles.group, pressed && styles.pressed]}
          >
            <GroupTile name={g.name} look={g.look} size={TILE} />
            <View style={styles.words}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{members(g.memberCount)} · {g.ask ? 'Ask to join' : 'Open'}</Text>
            </View>
          </Pressable>
          <RowButton
            g={g}
            state={state}
            working={busy === g.id}
            full={full}
            onPress={state === 'joined' ? () => go(`/g/${g.id}`) : state === 'requested' ? () => cancel(g) : () => join(g)}
          />
        </View>
      </React.Fragment>
    );
  };

  const list = () => {
    if (rows === undefined) return <ActivityIndicator style={styles.loading} color={colors.textFaint} />;
    if (rows === null) return <Text style={styles.note}>Finding groups isn’t switched on yet. You can still start one, or join with an invite link.</Text>;
    const parts: { title: string; rows: Listed[] }[] = [];
    if (near.length) parts.push({ title: 'Near you', rows: near });
    if (rest.length) parts.push({ title: searching ? 'Groups' : 'Popular', rows: rest });
    if (!parts.length) return <Text style={styles.note}>{searching ? `No group called “${search.trim()}”.` : EMPTY_LINE}</Text>;
    return parts.map((part, pi) => (
      <View key={part.title}>
        <View style={styles.listHead}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.listTitle} accessibilityRole="header">{part.title}</Text>
          {pi === 0 && canFind && !searchOpen ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Search groups" hitSlop={4} onPress={() => setFinding(true)} style={({ pressed }) => [styles.findIcon, pressed && styles.pressed]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {part.rows.map(renderRow)}
      </View>
    ));
  };

  return (
    <DragSheet
      closeSignal={closeSignal}
      onDismissed={done}
      peekFraction={0.86}
      contentHeight={(rows !== undefined || off) && fitH ? fitH : undefined}
      header={<Header joined={feedGroups.length} off={off} onClose={dismiss} onManage={() => go('/groups')} />}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onContentSizeChange={(_, h) => { const r = Math.ceil(h); if (r !== contentH) setContentH(r); }}
      >
        {off ? (
          <Text style={styles.note}>Groups aren’t switched on yet. Check back soon.</Text>
        ) : (
          <>
            {/* Anything that belongs above your groups (an invite waiting for you) goes here, before the slots. */}
            {!searchOpen ? (
              <Slots
                groups={feedGroups}
                me={currentUserId}
                full={full}
                canFind={canFind}
                onOpen={(g) => go(`/g/${g.id}`)}
                onCreate={create}
                onFind={() => setFinding(true)}
              />
            ) : (
              <View style={styles.findRow}>
                <SearchBox value={search} onChangeText={setSearch} />
                <Pressable accessibilityRole="button" accessibilityLabel="Stop searching" hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }} onPress={stopFinding} style={({ pressed }) => pressed && styles.pressed}>
                  <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.cancel}>Cancel</Text>
                </Pressable>
              </View>
            )}
            {list()}
          </>
        )}
      </ScrollView>
    </DragSheet>
  );
}

/** The title, a fact line ("1 of 3 joined" or "Join up to 3") with Manage, and the close disc. */
function Header({ joined, off, onClose, onManage }: { joined: number; off: boolean; onClose: () => void; onManage: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { dark } = useTheme();
  return (
    <View style={styles.head}>
      <View style={styles.headTop}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title} accessibilityRole="header">Groups</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.closeDisc, dark && styles.closeDiscDark, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {/* With groups switched off there is nothing to count. */}
      {!off ? <View style={styles.factRow}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.fact}>{joined ? `${joined} of ${MAX_GROUPS} joined` : `Join up to ${MAX_GROUPS}`}</Text>
        {joined ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }} onPress={onManage} style={({ pressed }) => pressed && styles.pressed}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.manage}>Manage</Text>
          </Pressable>
        ) : null}
      </View> : null}
    </View>
  );
}

/**
 * Your groups as three slots, one per group you can be in. The first free one
 * starts a group; the next finds one (when there is anything to find); any
 * other free one is just its outline, so the three still read as three.
 */
function Slots({ groups, me, full, canFind, onOpen, onCreate, onFind }: {
  groups: FeedGroup[];
  me: ID | null;
  full: boolean;
  canFind: boolean;
  onOpen: (g: FeedGroup) => void;
  onCreate: () => void;
  onFind: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const slots = Array.from({ length: MAX_GROUPS }, (_, i) => groups[i] ?? null);
  const firstFree = slots.findIndex((s) => !s);
  return (
    <View style={styles.courts}>
      <View style={styles.slots}>
        {slots.map((g, i) => {
          if (g) {
            const n = askingCount(g, me);
            const role = isAdmin(g, me) ? 'Admin' : members(g.members.length);
            return (
              <Pressable key={g.id} accessibilityRole="link" accessibilityLabel={`${g.name}, ${role}${n ? `, ${n} asking to join` : ''}`} onPress={() => onOpen(g)} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
                <View>
                  <GroupTile name={g.name} look={g.look} size={SLOT_TILE} />
                  {n ? <View style={styles.dot} /> : null}
                </View>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.slotName} numberOfLines={2}>{g.name}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, n ? [styles.strong, { color: brandOn(colors.bg) }] : null]} numberOfLines={1}>
                  {n ? `${n} asking` : role}
                </Text>
              </Pressable>
            );
          }
          if (i === firstFree) {
            return (
              <Pressable key={`free-${i}`} accessibilityRole="button" accessibilityLabel="Create a group" onPress={onCreate} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
                <View style={styles.free}><Ionicons name="add" size={24} color={colors.brand} /></View>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.slotName} numberOfLines={2}>Start a group</Text>
              </Pressable>
            );
          }
          if (i === firstFree + 1 && canFind) {
            return (
              <Pressable key={`free-${i}`} accessibilityRole="button" accessibilityLabel="Find a group to join" onPress={onFind} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
                <View style={styles.free}><Ionicons name="search" size={20} color={colors.textMuted} /></View>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.slotName} numberOfLines={2}>Find one</Text>
              </Pressable>
            );
          }
          return (
            <View key={`free-${i}`} style={styles.slot} accessible={false} importantForAccessibility="no-hide-descendants">
              <View style={[styles.free, styles.freeQuiet]} />
            </View>
          );
        })}
      </View>
      {full ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{FULL_NOTE}</Text> : null}
    </View>
  );
}

/** A light search box: the sheet's card fill and a thin outline. It opens with the keyboard up. */
function SearchBox({ value, onChangeText }: { value: string; onChangeText: (s: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={16} color={colors.textFaint} />
      <TextInput
        maxFontSizeMultiplier={TextScale.TITLE}
        value={value}
        onChangeText={onChangeText}
        autoFocus
        placeholder="Search groups"
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.brand}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search groups"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={14} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={17} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/*
 * Join or Ask: a thin ring in the theme's colour. Joined: filled, with a tick.
 * Requested: plain grey words. In 3 groups already, an open one says "Full"
 * in faint grey, and a tap explains why.
 */
function RowButton({ g, state, working, full, onPress }: { g: Listed; state: RowState; working: boolean; full: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const open = state === 'join' || state === 'request';
  const shut = full && open;
  const active = open && !shut;
  const joined = state === 'joined';
  const label = working ? (g.ask ? 'Asking…' : 'Joining…')
    : shut ? 'Full'
    : joined ? 'Joined' : state === 'requested' ? 'Requested' : state === 'request' ? 'Ask' : 'Join';
  const ink = shut ? colors.textFaint : active ? brandOn(colors.bg) : joined ? colors.brandInk : colors.textMuted;
  const a11y = joined ? `You’re in ${g.name}. Open it`
    : state === 'requested' ? `You asked to join ${g.name}. Cancel the request`
    : shut ? `${g.ask ? 'Ask to join' : 'Join'} ${g.name}. ${FULL_LINE}`
    : state === 'request' ? `Ask to join ${g.name}` : `Join ${g.name}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      disabled={working}
      hitSlop={BTN_SLOP}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, active && styles.btnRing, joined && styles.btnIn, pressed && styles.pressed]}
    >
      {working ? <ActivityIndicator size="small" color={ink} />
        : joined ? <Ionicons name="checkmark" size={14} color={ink} /> : null}
      {!working ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.btnText, { color: ink }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.xl },
  note: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  loading: { paddingVertical: spacing.xl },
  pressed: { opacity: PRESS_DIM },
  strong: { ...font('600') },
  words: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },

  // Header: the left title and close disc, with one fact line under it.
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, gap: 2 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.title, ...font('600'), fontSize: 24, letterSpacing: -0.8, color: colors.text, flex: 1 },
  factRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  fact: { ...typography.small, color: colors.textMuted },
  manage: { ...typography.smallStrong, color: colors.brand },
  closeDisc: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  closeDiscDark: { backgroundColor: colors.surfaceAlt },

  // Your three slots.
  courts: { gap: spacing.md },
  slots: { flexDirection: 'row', gap: spacing.md },
  slot: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  slotName: { ...typography.smallStrong, color: colors.text, marginTop: 4 },
  free: { width: SLOT_TILE, height: SLOT_TILE, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  freeQuiet: { borderColor: colors.border },
  dot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg },

  // Search, in place of the slots.
  findRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cancel: { ...typography.smallStrong, color: colors.textMuted },
  search: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, ...typography.body, fontSize: 16, color: colors.text, paddingVertical: 0, height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,

  // The open list: a heading, then rows on hairlines with no card behind them.
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: spacing.xs },
  listTitle: { ...typography.heading, color: colors.text },
  findIcon: { width: 44, height: 44, marginRight: -12, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hair: { height: 1, backgroundColor: colors.border, marginLeft: TILE + spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  // The group itself (its tile and words), which a hold reports.
  group: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  btn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 30, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.pill },
  btnRing: { borderWidth: 1, borderColor: colors.brand },
  btnIn: { backgroundColor: colors.brand },
  btnText: { ...typography.smallStrong },
});
