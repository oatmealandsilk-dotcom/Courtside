import { PRESS_DIM } from '@/theme/press';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { DiscoverGroup, FeedGroup, ID } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { MAX_GROUPS } from '@/store/feedGroups';
import { colors, font, lift, radius, readsOn, spacing, typography } from '@/theme';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';
import type { SheetLook } from './sheetLook';

/*
 * Design preview (Oct 22, round 2): three other looks for the Groups sheet
 * (the Feed's "+"), picked on the web with ?gs=a|b|c (see sheetLook.web.ts).
 * Today's look stays in app/find-groups.tsx and is what a phone always shows.
 * All three keep today's frame: the warm glow, the left-aligned "Groups", the
 * close disc, and a "1 of 3 joined · Manage" line under the title. Only type,
 * order and buttons change, and every colour comes from the theme.
 *   A  Tidy: today's order (search on top), two-line rows, quiet outlined buttons.
 *   B  Clean list: your groups first with Create last, then search, then the list; soft tinted buttons.
 *   C  Three courts: your 3 groups as 3 slots across the top; the list as an open draw sheet.
 */

export type Listed = DiscoverGroup & { member: boolean; requested: boolean };
export type RowAct = {
  state: 'join' | 'request' | 'joined' | 'requested';
  working: boolean;
  /** You are in the most groups already, so this one cannot be joined: shown as "Full". */
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

type Look = Exclude<SheetLook, 'now'>;

const TILE = 40;
const ROW_PAD = spacing.lg;
const BTN_SLOP = { top: 7, bottom: 7, left: 6, right: 6 };
const EMPTY_LINE = 'No open groups near you yet. Start one and invite your crew.';
const FULL_NOTE = 'That’s the most. Leave one to join another.';

const isAdmin = (g: FeedGroup, me: ID | null) => g.members.some((m) => m.id === me && m.admin);
const asking = (g: FeedGroup, me: ID | null) => (isAdmin(g, me) ? g.requests.length : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const members = (n: number) => plural(n, 'member', 'members');
/** What a group you are in says under its name: your role, never how others join. */
const roleLine = (g: FeedGroup, me: ID | null) => (isAdmin(g, me) ? `Admin · ${members(g.members.length)}` : members(g.members.length));
/** The theme's brand where it reads on `fill` (4.5:1), else the palette's own text colour. */
const brandOn = (fill: string) => (readsOn(colors.brand, fill) ? colors.brand : colors.text);

/** Every look shares today's header: title, a fact line with Manage, and the close disc. */
export function LookHeader({ joined, onClose, onManage }: { look: Look; joined: number; onClose: () => void; onManage: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <View style={styles.headTop}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title} accessibilityRole="header">Groups</Text>
        <CloseDisc onClose={onClose} />
      </View>
      <View style={styles.factRow}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.fact}>{joined ? `${joined} of ${MAX_GROUPS} joined` : `Join up to ${MAX_GROUPS}`}</Text>
        {joined ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" hitSlop={12} onPress={onManage} style={({ pressed }) => pressed && styles.pressed}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.manage}>Manage</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function CloseDisc({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { dark } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.closeDisc, dark && styles.closeDiscDark, pressed && styles.pressed]}>
      <Ionicons name="close" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** A light search box: the card's own fill and a thin outline, never a solid slab. */
function SearchBox({ value, onChangeText, autoFocus }: { value: string; onChangeText: (s: string) => void; autoFocus?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.search}>
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
  return <Text style={styles.emptyLine}>Groups aren’t switched on yet. Check back soon.</Text>;
}

/** Whether there is anything to search: a list came back, or a search is already typed. */
const hasList = (p: LookProps) => p.searching || !!(p.rows && p.rows.length);

/* ------------------------------------------- Your groups (A and B), one card */

function YourGroupsCard(p: LookProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { feedGroups, currentUserId: me, full } = p;
  return (
    <View style={styles.card}>
      {feedGroups.map((g, i) => {
        const n = asking(g, me);
        return (
          <React.Fragment key={g.id}>
            {i > 0 ? <View style={styles.hairInset} /> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${g.name}, ${roleLine(g, me)}${n ? `, ${n} asking to join` : ''}`}
              onPress={() => p.go(`/g/${g.id}`)}
              style={({ pressed }) => [styles.mineRow, pressed && styles.pressed]}
            >
              <GroupTile name={g.name} look={g.look} size={TILE} />
              <View style={styles.words}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{roleLine(g, me)}</Text>
              </View>
              {n ? (
                <View style={styles.askingPill}>
                  <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.askingText, { color: brandOn(colors.brandDim) }]}>{n} asking</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          </React.Fragment>
        );
      })}
      {feedGroups.length ? <View style={styles.hairInset} /> : null}
      {full ? (
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fullNote}>{FULL_NOTE}</Text>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Create a group" onPress={p.create} style={({ pressed }) => [styles.mineRow, pressed && styles.pressed]}>
          <View style={styles.addTile}><Ionicons name="add" size={22} color={colors.brand} /></View>
          <View style={styles.words}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>Create a group</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ A: Tidy */

function TidyBody(p: LookProps) {
  return (
    <>
      {hasList(p) ? <SearchBox value={p.search} onChangeText={p.setSearch} /> : null}
      {!p.searching ? <YourGroupsCard {...p} /> : null}
      <DiscoverParts {...p} />
    </>
  );
}

/* ------------------------------------------------------------ B: Clean list */

function ListBody(p: LookProps) {
  return (
    <>
      {!p.searching ? <YourGroupsCard {...p} /> : null}
      {hasList(p) ? <SearchBox value={p.search} onChangeText={p.setSearch} /> : null}
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
  const canFind = hasList(p);
  return (
    <>
      {!searching ? (
        <View style={styles.cCourts}>
          <View style={styles.cSlots}>
            {slots.map((g, i) => {
              if (g) {
                const n = asking(g, me);
                return (
                  <Pressable key={g.id} accessibilityRole="link" accessibilityLabel={`${g.name}, ${roleLine(g, me)}${n ? `, ${n} asking to join` : ''}`} onPress={() => p.go(`/g/${g.id}`)} style={({ pressed }) => [styles.cSlot, pressed && styles.pressed]}>
                    <View>
                      <GroupTile name={g.name} look={g.look} size={56} />
                      {n ? <View style={styles.cDot} /> : null}
                    </View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cSlotName} numberOfLines={2}>{g.name}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, n ? [{ color: brandOn(colors.bg) }, styles.strong] : null]} numberOfLines={1}>
                      {n ? `${n} asking` : isAdmin(g, me) ? 'Admin' : members(g.members.length)}
                    </Text>
                  </Pressable>
                );
              }
              if (i === firstEmpty) {
                return (
                  <Pressable key={`empty-${i}`} accessibilityRole="button" accessibilityLabel="Create a group" onPress={p.create} style={({ pressed }) => [styles.cSlot, pressed && styles.pressed]}>
                    <View style={styles.cEmpty}><Ionicons name="add" size={24} color={colors.brand} /></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cSlotName} numberOfLines={2}>Start a group</Text>
                  </Pressable>
                );
              }
              if (i === firstEmpty + 1 && canFind) {
                return (
                  <Pressable key={`empty-${i}`} accessibilityRole="button" accessibilityLabel="Find a group to join" onPress={() => setFinding(true)} style={({ pressed }) => [styles.cSlot, pressed && styles.pressed]}>
                    <View style={styles.cEmpty}><Ionicons name="search" size={20} color={colors.textMuted} /></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cSlotName} numberOfLines={2}>Find one</Text>
                  </Pressable>
                );
              }
              // A free slot with nothing to press: just its outline, so the three still read as three.
              return (
                <View key={`empty-${i}`} style={styles.cSlot} accessible={false} importantForAccessibility="no-hide-descendants">
                  <View style={[styles.cEmpty, styles.cEmptyQuiet]} />
                </View>
              );
            })}
          </View>
          {full ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{FULL_NOTE}</Text> : null}
        </View>
      ) : null}
      {finding || searching ? (
        <View style={styles.cFindRow}>
          <View style={{ flex: 1 }}><SearchBox value={p.search} onChangeText={p.setSearch} autoFocus={Platform.OS !== 'web' || finding} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Stop searching" hitSlop={10} onPress={() => { p.setSearch(''); setFinding(false); }}>
            <Text style={styles.cCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <DiscoverParts {...p} onFind={finding || searching || !canFind ? undefined : () => setFinding(true)} />
    </>
  );
}

/* ------------------------------------------------- The list to join, per look */

function DiscoverParts(p: LookProps & { onFind?: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { look, rows, near, rest, searching, search } = p;
  if (rows === undefined) return <ActivityIndicator style={{ paddingVertical: spacing.xl }} color={colors.textFaint} />;
  if (rows === null) return <Text style={styles.emptyLine}>Finding groups isn’t switched on yet. You can still start one, or join with an invite link.</Text>;
  const parts: { title: string; rows: Listed[] }[] = [];
  if (near.length) parts.push({ title: 'Near you', rows: near });
  if (rest.length) parts.push({ title: searching ? 'Groups' : 'Popular', rows: rest });
  const nothing = searching ? `No group called “${search.trim()}”.` : EMPTY_LINE;

  if (look === 'c') {
    const head = (title: string, first: boolean) => (
      <View style={styles.cListHead}>
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.cListTitle} accessibilityRole="header">{title}</Text>
        {first && p.onFind ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Search groups" hitSlop={4} onPress={p.onFind} style={({ pressed }) => [styles.cFind, pressed && styles.pressed]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    );
    if (!parts.length) return <Text style={styles.emptyLine}>{nothing}</Text>;
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

  if (!parts.length) return <Text style={styles.emptyLine}>{nothing}</Text>;
  return (
    <>
      {parts.map((part) => (
        <View key={part.title} style={styles.part}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.section} accessibilityRole="header">{part.title}</Text>
          <View style={styles.card}>
            {part.rows.map((g, i) => <Row key={g.id} look={look} g={g} a={p.act(g)} first={i === 0} />)}
          </View>
        </View>
      ))}
    </>
  );
}

function Row({ look, g, a, first }: { look: Look; g: Listed; a: RowAct; first: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <>
      {!first ? <View style={look === 'c' ? styles.hairC : styles.hairInset} /> : null}
      <View style={look === 'c' ? styles.cListRow : styles.listRow}>
        <Pressable
          accessibilityHint="Hold to report"
          accessibilityActions={[{ name: 'longpress', label: 'Report group' }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') a.report(); }}
          onLongPress={a.report}
          delayLongPress={400}
          style={({ pressed }) => [styles.group, pressed && styles.pressed]}
        >
          <GroupTile name={g.name} look={g.look} size={TILE} />
          <View style={styles.words}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{members(g.memberCount)} · {g.ask ? 'Ask to join' : 'Open'}</Text>
          </View>
        </Pressable>
        <RowButton look={look} g={g} a={a} />
      </View>
    </>
  );
}

/*
 * The buttons, one style per look:
 *   A  quiet outline: a thin strong-border ring, brand words.
 *   B  soft tint: the brand's pale fill, brand words.
 *   C  brand outline: a thin brand ring; once you're in, filled.
 * In all three, Joined and Requested lose the fill or ring and go grey, and
 * when you're in 3 groups an open one says "Full" in faint grey (a state, not a faded ghost).
 */
function RowButton({ look, g, a }: { look: Look; g: Listed; a: RowAct }) {
  const styles = useThemedStyles(styleDefinitions);
  const { state, working, faded } = a;
  const shut = faded && (state === 'join' || state === 'request');
  const active = !shut && (state === 'join' || state === 'request');
  const label = working ? (g.ask ? 'Asking…' : 'Joining…')
    : shut ? 'Full'
    : state === 'joined' ? 'Joined' : state === 'requested' ? 'Requested' : state === 'request' ? 'Ask' : 'Join';
  const inC = look === 'c' && state === 'joined';
  const fill = look === 'b' && active ? colors.brandDim : inC ? colors.brand : look === 'c' ? colors.bg : colors.surface;
  const ink = shut ? colors.textFaint
    : active ? brandOn(fill)
    : inC ? colors.brandInk
    : colors.textMuted;
  const box = [
    styles.btn,
    active && look === 'a' ? styles.btnRing : null,
    active && look === 'b' ? styles.btnTint : null,
    active && look === 'c' ? styles.btnBrandRing : null,
    inC ? styles.btnIn : null,
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.a11y}
      disabled={working}
      hitSlop={BTN_SLOP}
      onPress={a.onPress}
      style={({ pressed }) => [...box, pressed && styles.pressed]}
    >
      {working ? <ActivityIndicator size="small" color={ink} />
        : state === 'joined' ? <Ionicons name="checkmark" size={14} color={ink} /> : null}
      {!working ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.btnText, { color: ink }]}>{label}</Text> : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  words: { flex: 1, minWidth: 0, gap: 2 },
  group: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  strong: { ...font('600') },
  emptyLine: { ...typography.body, color: colors.textMuted, lineHeight: 21 },

  // Header (all looks): today's left title and close disc, with one fact line under it.
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, gap: 2 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.title, ...font('600'), fontSize: 24, letterSpacing: -0.8, color: colors.text, flex: 1 },
  factRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  fact: { ...typography.small, color: colors.textMuted },
  manage: { ...typography.smallStrong, color: colors.brand },
  closeDisc: { ...lift, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  closeDiscDark: { backgroundColor: colors.surfaceAlt },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40, paddingHorizontal: spacing.md,
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, ...typography.body, fontSize: 16, color: colors.text, paddingVertical: 0, height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,

  // A and B: inset cards, one row height and one tile size, so every name starts at one x.
  card: { ...lift, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden' },
  hairInset: { height: 1, backgroundColor: colors.border, marginLeft: ROW_PAD + TILE + spacing.md },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: ROW_PAD, minHeight: 56, paddingVertical: spacing.sm },
  addTile: { width: TILE, height: TILE, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  askingPill: { flexShrink: 0, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: colors.brandDim, justifyContent: 'center' },
  askingText: { ...typography.smallStrong, fontSize: 12 },
  fullNote: { ...typography.small, color: colors.textMuted, paddingHorizontal: ROW_PAD, paddingVertical: spacing.md },
  part: { gap: spacing.sm },
  section: { ...typography.smallStrong, color: colors.textMuted },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: ROW_PAD, minHeight: 60, paddingVertical: spacing.sm },

  // Buttons (30 high; hitSlop makes each at least 44pt).
  btn: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, height: 30, minWidth: 64, paddingHorizontal: 14, borderRadius: radius.pill },
  btnRing: { borderWidth: 1, borderColor: colors.borderStrong },
  btnTint: { backgroundColor: colors.brandDim },
  btnBrandRing: { borderWidth: 1, borderColor: colors.brand },
  btnIn: { backgroundColor: colors.brand },
  btnText: { ...typography.smallStrong },

  // C
  cCourts: { gap: spacing.md },
  cSlots: { flexDirection: 'row', gap: spacing.md },
  cSlot: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  cSlotName: { ...typography.smallStrong, color: colors.text, marginTop: 4 },
  cEmpty: { width: 56, height: 56, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  cEmptyQuiet: { borderColor: colors.border },
  cDot: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg },
  cFindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cCancel: { ...typography.smallStrong, color: colors.textMuted },
  cListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginBottom: spacing.xs },
  cListTitle: { ...typography.heading, color: colors.text },
  cFind: { width: 44, height: 44, marginRight: -12, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hairC: { height: 1, backgroundColor: colors.border, marginLeft: TILE + spacing.md },
  cListRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
});
