import { PRESS_DIM } from '@/theme/press';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { DiscoverGroup, FeedGroup, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { MAX_GROUPS } from '@/store/feedGroups';
import { colors, font, lift, radius, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';
import type { SheetLook } from './sheetLook';

/*
 * Design preview (Oct 22): three other looks for the Groups sheet (the Feed's
 * "+"), picked on the web with ?gs=a|b|c (see sheetLook.web.ts). Today's look
 * stays in app/find-groups.tsx and is what a phone always shows. Everything
 * here uses the theme's own colours, so every palette works.
 *   A  Tidy: today's sheet, reordered. Your groups and Create in one card, search above the list it searches.
 *   B  iPhone list: an Apple-style grouped list (Find My, Reminders). No glow, Done, small caps headers.
 *   C  Three courts: the 3-group rule drawn as three court slots; the list as a printed draw sheet.
 */

export type Listed = DiscoverGroup & { member: boolean; requested: boolean };
export type RowAct = {
  state: 'join' | 'request' | 'joined' | 'requested';
  working: boolean;
  faded: boolean;
  onPress: () => void;
  a11y: string;
  report: () => void;
};

export type LookProps = {
  look: Exclude<SheetLook, 'now'>;
  feedGroups: FeedGroup[];
  currentUserId: ID | null;
  full: boolean;
  search: string;
  setSearch: (s: string) => void;
  searching: boolean;
  rows: DiscoverGroup[] | null | undefined;
  near: Listed[];
  rest: Listed[];
  act: (g: Listed) => RowAct;
  go: (href: string) => void;
  create: () => void;
  off: boolean;
};

const isAdmin = (g: FeedGroup, me: ID | null) => g.members.some((m) => m.id === me && m.admin);
const asking = (g: FeedGroup, me: ID | null) => (isAdmin(g, me) ? g.requests.length : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The header line each look puts at the top of the sheet. */
export function LookHeader({ look, joined, onClose }: { look: Exclude<SheetLook, 'now'>; joined: number; onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  if (look === 'a') {
    return (
      <View style={styles.aHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.aTitle}>Groups</Text>
          <Text style={styles.aLine}>{joined ? `${joined} of ${MAX_GROUPS} joined` : `Join up to ${MAX_GROUPS}`}</Text>
        </View>
        <CloseDisc onClose={onClose} />
      </View>
    );
  }
  if (look === 'b') {
    return (
      <View style={styles.bHead}>
        <View style={styles.bSide} />
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.bTitle} accessibilityRole="header">Groups</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.bSide, styles.bDoneHit, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.bDone}>Done</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.cHead}>
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.cTitle} accessibilityRole="header">Groups</Text>
      <CloseDisc onClose={onClose} />
    </View>
  );
}

function CloseDisc({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.closeDisc, pressed && styles.pressed]}>
      <Ionicons name="close" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** A filled search box with no outline (A, B and C each size it their own way). */
function FilledSearch({ value, onChangeText, height, round, autoFocus }: { value: string; onChangeText: (s: string) => void; height: number; round: number; autoFocus?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.search, { height, borderRadius: round }]}>
      <Ionicons name="search" size={16} color={colors.textFaint} />
      <TextInput
        maxFontSizeMultiplier={TextScale.TITLE}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
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
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={17} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function LookBody(p: LookProps) {
  if (p.off) return <OffNote />;
  return p.look === 'a' ? <TidyBody {...p} /> : p.look === 'b' ? <ListBody {...p} /> : <CourtsBody {...p} />;
}

function OffNote() {
  const styles = useThemedStyles(styleDefinitions);
  return <Text style={styles.oneLine}>Groups aren’t switched on yet. Check back soon.</Text>;
}

/* ------------------------------------------------------------------ A: Tidy */

function TidyBody(p: LookProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, currentUserId: me, full, searching } = p;
  const meta = (g: FeedGroup) => `${plural(g.members.length, 'member', 'members')} · ${isAdmin(g, me) ? 'Admin' : g.ask ? 'Ask to join' : 'Open'}`;
  return (
    <>
      {!searching ? (
        <View style={styles.aPart}>
          <View style={styles.card}>
            {feedGroups.map((g, i) => (
              <React.Fragment key={g.id}>
                {i > 0 ? <View style={[styles.hair, { marginLeft: 68 }]} /> : null}
                <Pressable accessibilityRole="link" accessibilityLabel={`${g.name}${asking(g, me) ? `, ${asking(g, me)} asking to join` : ''}`} onPress={() => p.go(`/g/${g.id}`)} style={({ pressed }) => [styles.aRow, pressed && styles.pressed]}>
                  <GroupTile name={g.name} look={g.look} size={40} />
                  <View style={styles.words}>
                    <Text style={styles.aName} numberOfLines={1}>{g.name}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{meta(g)}</Text>
                  </View>
                  {asking(g, me) ? <View style={styles.aAsking}><Text style={styles.aAskingText}>{asking(g, me)} asking</Text></View> : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              </React.Fragment>
            ))}
            {!full ? (
              <>
                {feedGroups.length ? <View style={[styles.hair, { marginLeft: 68 }]} /> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="Create a group" onPress={p.create} style={({ pressed }) => [styles.aRow, pressed && styles.pressed]}>
                  <View style={styles.aAddTile}><Ionicons name="add" size={22} color={colors.brand} /></View>
                  <View style={styles.words}>
                    <Text style={styles.aName}>Create a group</Text>
                    <Text style={styles.meta} numberOfLines={1}>You’ll be its admin</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              </>
            ) : null}
          </View>
          {full || feedGroups.length ? (
            <View style={styles.aUnder}>
              <Text style={[styles.meta, { flex: 1 }]}>{full ? 'That’s the most. Leave one to join another.' : ''}</Text>
              <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={8} onPress={() => p.go('/groups')}>
                <Text style={styles.link}>Manage</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <FilledSearch value={p.search} onChangeText={p.setSearch} height={42} round={radius.md} />

      <DiscoverParts {...p} />
    </>
  );
}

/* ------------------------------------------------------------ B: iPhone list */

function ListBody(p: LookProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, currentUserId: me, full, searching } = p;
  return (
    <>
      <FilledSearch value={p.search} onChangeText={p.setSearch} height={36} round={radius.md} />
      {!searching ? (
        <View style={styles.bPart}>
          <Text style={styles.bCaps}>YOUR GROUPS</Text>
          <View style={styles.bGroup}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={full ? `Create a group. You’re in ${MAX_GROUPS} groups, the most anyone can be in.` : 'Create a group'}
              onPress={p.create}
              style={({ pressed }) => [styles.bRow, pressed && styles.pressed]}
            >
              <View style={styles.bAddFrame}><Ionicons name="add" size={24} color={full ? colors.textFaint : colors.brand} /></View>
              <Text style={[styles.bRowName, { color: full ? colors.textFaint : colors.brand }]}>New group</Text>
            </Pressable>
            {feedGroups.map((g) => {
              const n = asking(g, me);
              return (
                <React.Fragment key={g.id}>
                  <View style={[styles.hair, { marginLeft: 60 }]} />
                  <Pressable accessibilityRole="link" accessibilityLabel={`${g.name}, ${plural(g.members.length, 'member', 'members')}${n ? `, ${n} asking to join` : ''}`} onPress={() => p.go(`/g/${g.id}`)} style={({ pressed }) => [styles.bRow, pressed && styles.pressed]}>
                    <GroupTile name={g.name} look={g.look} size={32} />
                    <Text style={[styles.bRowName, { flex: 1 }]} numberOfLines={1}>{g.name}</Text>
                    {n ? (
                      <View style={styles.bBadge}><Text style={styles.bBadgeText}>{n}</Text></View>
                    ) : (
                      <Text style={styles.bValue}>{g.members.length}</Text>
                    )}
                    <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
          <View style={styles.bFootRow}>
            <Text style={[styles.bFoot, { flex: 1 }]}>
              {full ? `You’re in ${MAX_GROUPS} groups. Leave one to join another.` : `You can be in up to ${MAX_GROUPS} groups.`}
            </Text>
            {feedGroups.length ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={8} onPress={() => p.go('/groups')}>
                <Text style={styles.bFootLink}>Manage groups</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      <DiscoverParts {...p} />
    </>
  );
}

/* ------------------------------------------------------------ C: Three courts */

function CourtsBody(p: LookProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, currentUserId: me, full, searching } = p;
  const [finding, setFinding] = useState(false);
  const slots = Array.from({ length: MAX_GROUPS }, (_, i) => feedGroups[i] ?? null);
  const firstEmpty = slots.findIndex((s) => !s);
  return (
    <>
      {!searching ? (
        <View style={styles.cCourts}>
          <View style={styles.cCourtsHead}>
            <Text style={styles.cLabel}>Your courts</Text>
            {feedGroups.length ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={8} onPress={() => p.go('/groups')}>
                <Text style={styles.cManage}>Manage</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.cSlots}>
            {slots.map((g, i) => {
              if (g) {
                const n = asking(g, me);
                const caption = n ? `${n} ASKING` : isAdmin(g, me) ? `ADMIN · ${g.members.length}` : plural(g.members.length, 'PLAYER', 'PLAYERS');
                return (
                  <Pressable key={g.id} accessibilityRole="link" accessibilityLabel={`${g.name}${n ? `, ${n} asking to join` : ''}`} onPress={() => p.go(`/g/${g.id}`)} style={({ pressed }) => [styles.cSlot, pressed && styles.pressed]}>
                    <View>
                      <GroupTile name={g.name} look={g.look} size={64} />
                      {n ? <View style={styles.cDot} /> : null}
                    </View>
                    <Text style={styles.cSlotName} numberOfLines={1}>{g.name}</Text>
                    <Text style={[styles.cCaption, n ? { color: colors.brand } : null]} numberOfLines={1}>{caption}</Text>
                  </Pressable>
                );
              }
              const starts = i === firstEmpty;
              return starts ? (
                <Pressable key={`empty-${i}`} accessibilityRole="button" accessibilityLabel="Create a group" onPress={p.create} style={({ pressed }) => [styles.cSlot, pressed && styles.pressed]}>
                  <View style={styles.cEmpty}><Ionicons name="add" size={24} color={colors.textMuted} /></View>
                  <Text style={styles.cSlotName} numberOfLines={1}>Start a group</Text>
                  <Text style={styles.cCaption}> </Text>
                </Pressable>
              ) : (
                <View key={`empty-${i}`} style={styles.cSlot} accessible={false}>
                  <View style={styles.cEmpty}><Ionicons name="add" size={20} color={colors.border} /></View>
                  <Text style={[styles.cSlotName, { color: colors.textFaint, fontWeight: '400' }]}>Open</Text>
                  <Text style={styles.cCaption}> </Text>
                </View>
              );
            })}
          </View>
          {full ? <Text style={styles.meta}>All three courts taken. Leave one to join another.</Text> : null}
          <View style={styles.cDivider}>
            <View style={styles.cLine} />
            <View style={styles.cTick} />
          </View>
        </View>
      ) : null}
      {finding || searching ? (
        <View style={styles.cFindRow}>
          <View style={{ flex: 1 }}><FilledSearch value={p.search} onChangeText={p.setSearch} height={36} round={radius.md} autoFocus={Platform.OS !== 'web' || finding} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop searching" hitSlop={8} onPress={() => { p.setSearch(''); setFinding(false); }}>
            <Text style={styles.cManage}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <DiscoverParts {...p} onFind={finding || searching ? undefined : () => setFinding(true)} />
    </>
  );
}

/* ------------------------------------------------- The list to join, per look */

function DiscoverParts(p: LookProps & { onFind?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { look, rows, near, rest, searching, search } = p;
  if (rows === undefined) return <ActivityIndicator style={{ paddingVertical: spacing.xl }} color={colors.textFaint} />;
  if (rows === null) return <Text style={styles.oneLine}>Finding groups isn’t switched on yet. You can still start one, or join with an invite link.</Text>;
  const parts: { title: string; rows: Listed[] }[] = [];
  if (near.length) parts.push({ title: 'Near you', rows: near });
  if (rest.length) parts.push({ title: searching ? 'Groups' : 'Popular', rows: rest });
  const nothing = searching
    ? `No group called “${search.trim()}”.`
    : look === 'c' ? 'Nobody near you has opened a group yet.' : 'No open groups near you yet.';

  if (look === 'c') {
    const head = (title: string, first: boolean) => (
      <View style={styles.cListHead}>
        <Text style={styles.cListTitle} accessibilityRole="header">{title}</Text>
        {first && p.onFind ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Search groups" hitSlop={10} onPress={p.onFind} style={({ pressed }) => [styles.cFind, pressed && styles.pressed]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
    if (!parts.length) return <View>{head(searching ? 'Groups' : 'Near you', true)}<Text style={styles.cNothing}>{nothing}</Text></View>;
    return (
      <>
        {parts.map((part, pi) => (
          <View key={part.title}>
            {head(part.title, pi === 0)}
            {part.rows.map((g, i) => <Row key={g.id} look="c" g={g} a={p.act(g)} first={i === 0} />)}
          </View>
        ))}
      </>
    );
  }

  if (!parts.length) return <Text style={look === 'b' ? styles.bFoot : styles.oneLine}>{nothing}</Text>;
  return (
    <>
      {parts.map((part) => (
        <View key={part.title} style={look === 'b' ? styles.bPart : styles.aPart}>
          <Text style={look === 'b' ? styles.bCaps : styles.aSection}>{look === 'b' ? part.title.toUpperCase() : part.title}</Text>
          <View style={look === 'b' ? styles.bGroup : styles.card}>
            {part.rows.map((g, i) => <Row key={g.id} look={look} g={g} a={p.act(g)} first={i === 0} />)}
          </View>
        </View>
      ))}
    </>
  );
}

function Row({ look, g, a, first }: { look: Exclude<SheetLook, 'now'>; g: Listed; a: RowAct; first: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const people = look === 'c' ? plural(g.memberCount, 'PLAYER', 'PLAYERS') : plural(g.memberCount, 'member', 'members');
  const how = look === 'c' ? (g.ask ? 'ASK TO JOIN' : 'OPEN') : g.ask ? 'Ask to join' : 'Open';
  const tile = look === 'b' ? 40 : 44;
  const inset = look === 'b' ? 16 + 40 + 12 : look === 'a' ? 16 + 44 + 12 : 0;
  return (
    <>
      {!first ? <View style={[styles.hair, { marginLeft: inset }]} /> : null}
      <View style={look === 'a' ? styles.aListRow : look === 'b' ? styles.bListRow : styles.cListRow}>
        <Pressable
          accessibilityHint="Hold to report"
          accessibilityActions={[{ name: 'longpress', label: 'Report group' }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') a.report(); }}
          onLongPress={a.report}
          delayLongPress={400}
          style={({ pressed }) => [styles.group, pressed && styles.pressed]}
        >
          <GroupTile name={g.name} look={g.look} size={tile} />
          <View style={styles.words}>
            <Text style={look === 'c' ? styles.cRowName : styles.aName} numberOfLines={1}>{g.name}</Text>
            {look === 'c' ? (
              <>
                {g.description ? <Text style={styles.cAbout} numberOfLines={1}>{g.description}</Text> : null}
                <Text style={styles.cRowCaption} numberOfLines={1}>{people} · {how}</Text>
              </>
            ) : (
              <>
                <Text style={styles.meta} numberOfLines={1}>{people} · {how}</Text>
                {look === 'a' && g.description ? <Text style={styles.about} numberOfLines={1}>{g.description}</Text> : null}
              </>
            )}
          </View>
        </Pressable>
        <RowButton look={look} g={g} a={a} />
      </View>
    </>
  );
}

function RowButton({ look, g, a }: { look: Exclude<SheetLook, 'now'>; g: Listed; a: RowAct }) {
  const styles = useThemedStyles(styleDefinitions);
  const { state, working, faded } = a;
  const label = working ? (g.ask ? 'Asking…' : 'Joining…')
    : look === 'a'
      ? (state === 'joined' ? 'Joined' : state === 'requested' ? 'Requested' : state === 'request' ? 'Request' : 'Join')
      : look === 'b'
        ? (state === 'joined' ? 'Joined' : state === 'requested' ? 'Requested' : state === 'request' ? 'Ask' : 'Join')
        : (state === 'joined' ? 'In' : state === 'requested' ? 'Requested' : state === 'request' ? 'Ask' : 'Join');
  const active = state === 'join' || state === 'request';
  // A keeps today's buttons; B is iOS tinted; C is outlined, filled once you are in.
  const box = look === 'a'
    ? [styles.aBtn, state === 'join' ? styles.aBtnJoin : state === 'request' ? styles.aBtnRequest : styles.aBtnQuiet]
    : look === 'b'
      ? [styles.bBtn, active ? styles.bBtnTint : null]
      : [styles.cBtn, active ? styles.cBtnLine : state === 'joined' ? styles.cBtnIn : null];
  const ink = look === 'a'
    ? (state === 'join' ? colors.brandInk : state === 'request' ? colors.brand : colors.textMuted)
    : look === 'b' ? (active ? colors.brand : colors.textMuted)
      : (active ? colors.brand : state === 'joined' ? colors.brandInk : colors.textMuted);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.a11y}
      disabled={working}
      hitSlop={6}
      onPress={a.onPress}
      style={({ pressed }) => [...box, faded && styles.faded, pressed && styles.pressed]}
    >
      {working ? <ActivityIndicator size="small" color={ink} />
        : state === 'joined' ? <Ionicons name="checkmark" size={14} color={ink} /> : null}
      {!working ? <Text style={[styles.btnText, { color: ink }]}>{label}</Text> : null}
    </Pressable>
  );
}

const tabular = { fontVariant: ['tabular-nums'] as ('tabular-nums')[] };

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  faded: { opacity: 0.45 },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  words: { flex: 1, minWidth: 0, gap: 2 },
  group: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { ...typography.small, color: colors.textMuted },
  about: { ...typography.small, color: colors.textFaint },
  link: { ...typography.smallStrong, color: colors.brand },
  oneLine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  btnText: { ...typography.smallStrong },
  closeDisc: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceAlt },
  searchInput: {
    flex: 1, ...typography.body, fontSize: 16, color: colors.text, paddingVertical: 0, height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,

  // A
  aHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  aTitle: { ...typography.title, fontSize: 24, letterSpacing: -0.8, color: colors.text },
  aLine: { ...typography.small, color: colors.textMuted },
  aPart: { gap: spacing.sm },
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  aRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 64, paddingVertical: spacing.sm },
  aName: { ...typography.bodyStrong, color: colors.text },
  aAsking: { paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: colors.brandDim, justifyContent: 'center' },
  aAskingText: { ...typography.smallStrong, fontSize: 12, color: colors.brand },
  aAddTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  aUnder: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingHorizontal: spacing.xs },
  aSection: { ...typography.smallStrong, color: colors.textMuted },
  aListRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, minHeight: 72 },
  aBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, minWidth: 84, paddingHorizontal: 14, borderRadius: radius.pill },
  aBtnJoin: { backgroundColor: colors.brand },
  aBtnRequest: { backgroundColor: colors.brandDim },
  aBtnQuiet: { backgroundColor: colors.surfaceAlt },

  // B
  bHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, height: 40 },
  bSide: { width: 64 },
  bDoneHit: { alignItems: 'flex-end', justifyContent: 'center', height: 40 },
  bTitle: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  bDone: { ...typography.body, ...font('600'), color: colors.brand },
  bPart: { gap: 6 },
  bCaps: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.lg },
  bGroup: { borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52 },
  bAddFrame: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bRowName: { ...typography.body, color: colors.text },
  bValue: { ...typography.body, color: colors.textMuted, ...tabular },
  bBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  bBadgeText: { ...typography.caption, letterSpacing: 0, color: colors.brandInk, ...tabular },
  bFootRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingHorizontal: spacing.lg },
  bFoot: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.lg },
  bFootLink: { ...typography.small, color: colors.brand },
  bListRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60, paddingVertical: spacing.sm },
  bBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 28, paddingHorizontal: 12, borderRadius: radius.pill },
  bBtnTint: { backgroundColor: colors.brandDim },

  // C
  cHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  cTitle: { ...typography.display, color: colors.text, flex: 1 },
  cCourts: { gap: spacing.md },
  cCourtsHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cLabel: { ...typography.smallStrong, color: colors.textMuted },
  cManage: { ...typography.smallStrong, color: colors.textMuted },
  cSlots: { flexDirection: 'row', gap: spacing.md },
  cSlot: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  cSlotName: { ...typography.smallStrong, color: colors.text, textAlign: 'center', marginTop: 4 },
  cCaption: { ...typography.caption, color: colors.textMuted, textAlign: 'center', ...tabular },
  cEmpty: { width: 64, height: 64, borderRadius: 19, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cDot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg },
  cDivider: { height: 6, justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.md },
  cLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  cTick: { width: 1, height: 6, backgroundColor: colors.border },
  cFindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, marginBottom: spacing.xs },
  cListTitle: { ...typography.heading, color: colors.text },
  cFind: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cNothing: { ...typography.body, color: colors.textMuted },
  cListRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  cRowName: { ...typography.heading, color: colors.text },
  cAbout: { ...typography.body, color: colors.textMuted },
  cRowCaption: { ...typography.caption, color: colors.textFaint, ...tabular },
  cBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 32, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.pill },
  cBtnLine: { borderWidth: 1, borderColor: colors.brand },
  cBtnIn: { backgroundColor: colors.brand },
});
