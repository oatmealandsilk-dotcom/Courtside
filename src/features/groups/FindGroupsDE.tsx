import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { FeedGroup, ID, User } from '@/data/types';
import { GroupFace } from '@/features/groups/GroupFace';
import { areaWords, facesFor, factLine, factsFor } from '@/features/groups/previewFacts';
import type { Listed, LookProps, RowAct } from '@/features/groups/FindGroupsLooks';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS } from '@/store/feedGroups';
import { buttonShape, colors, font, readsOn, spacing, typography, withAlpha } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * Design preview (Oct 22, round 4), web only: ?gs=d|e (see sheetLook.web.ts).
 * The owner's word on every round so far was "looks so AI". Round 3's
 * reviews put it down to the pictures and their decoration, not the list:
 * rainbow initials piles on every row, strangers named as if friends,
 * look-alike court photos, a cover photo with the same photo inset on it.
 *   D  Club list: a chat-app list on one plain page colour. Each group shows
 *      its court photo (or its initials in a quiet grey), when · level ·
 *      where, and who is in it: someone you follow by name, else a count.
 *   E  The same list with each group's own words (its description) as the
 *      second line instead of the facts: no photos stacked, no cards.
 * Order: title, (Invites, from feat/group-invites), search, Your groups,
 * near, more, Start a group. Same sheet, same actions as today.
 */

const PAD = spacing.lg;
const FACE = 52;
const MINE_FACE = 48;
const GAP = spacing.md;
const FULL_NOTE = 'That’s the most. Leave one to join another.';
const FULL_START_LINE = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.`;
const SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

const brandOn = (fill: string) => (readsOn(colors.brand, fill) ? colors.brand : colors.text);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const members = (n: number) => plural(n, 'member', 'members');
const firstName = (u?: User) => (u?.name ?? '').split(/\s+/)[0] || 'Someone';
const firstLine = (s?: string) => (s ?? '').split('\n')[0].trim();

/** The sheet's header in D and E: the title on the left, a small grey close disc as on iOS sheets. */
export function DEHeader({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title} accessibilityRole="header">Groups</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={7} onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={17} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function SectionHead({ title, right }: { title: string; right?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.section}>
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

/** Instagram's grey search box: a filled, softly squared field, no outline. */
function SearchBox({ value, onChangeText }: { value: string; onChangeText: (s: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={16} color={colors.textFaint} />
      <TextInput
        maxFontSizeMultiplier={TextScale.TITLE}
        value={value}
        onChangeText={onChangeText}
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

/**
 * Who is in it, the way a real app says it: someone you follow by name
 * ("Sam and 22 others"), else just the count. Strangers are never named,
 * and no faces are drawn. On a real account Find groups returns only a
 * count, so this is the count until it returns the people you follow.
 */
function useWhoLine(id: ID, total: number, me: ID | null) {
  const { users, followingIds } = useApp();
  const known = facesFor(id).filter((x) => x !== me && followingIds.includes(x));
  const u = known.length ? users.find((x) => x.id === known[0]) : undefined;
  if (!u) return members(total);
  const rest = total - 1;
  return rest > 0 ? `${firstName(u)} and ${plural(rest, 'other', 'others')}` : `${firstName(u)} is in it`;
}

/* ------------------------------------------------------------ Your groups */

function MineRow({ g, me, go, last }: { g: FeedGroup; me: ID | null; go: (href: string) => void; last: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const admin = g.members.some((m) => m.id === me && m.admin);
  const asked = admin ? g.requests.length : 0;
  const askLine = asked === 1 ? `${firstName(users.find((u) => u.id === g.requests[0]))} asked to join` : asked > 1 ? `${asked} people asked to join` : '';
  // You know who is in your own group: the second line is what is new, else when you play.
  const line = factLine(g.id, 40) || firstLine(g.description) || members(g.members.length);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${g.name}${askLine ? `, ${askLine}` : ''}`}
      onPress={() => go(`/g/${g.id}`)}
      style={({ pressed }) => [styles.row, styles.rowMine, pressed && styles.pressed]}
    >
      <GroupFace name={g.name} look={g.look} size={MINE_FACE} />
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
        {askLine ? (
          <View style={styles.newLine}>
            <View style={styles.newDot} />
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.askLine} numberOfLines={1}>{askLine}</Text>
          </View>
        ) : (
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{line}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      {!last ? <View style={[styles.hair, { left: PAD + MINE_FACE + GAP }]} /> : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Buttons */

function labelOf(a: RowAct) {
  const shut = a.faded && (a.state === 'join' || a.state === 'request');
  const label = shut ? 'Full'
    : a.state === 'joined' ? 'Joined' : a.state === 'requested' ? 'Requested' : a.state === 'request' ? 'Request' : 'Join';
  return { shut, label, open: !shut && (a.state === 'join' || a.state === 'request') };
}

/**
 * Instagram's grey secondary button, one shape on every row. "Full" is not
 * an action, so it is plain faint words (a tap still says why).
 */
function GreyButton({ a }: { a: RowAct }) {
  const styles = useThemedStyles(styleDefinitions);
  const { shut, label, open } = labelOf(a);
  if (shut) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a.a11y} hitSlop={SLOP} onPress={() => showToast({ title: FULL_NOTE, icon: 'people-outline' })} style={styles.fullWord}>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.fullText}>Full</Text>
      </Pressable>
    );
  }
  const ink = open ? colors.text : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.a11y}
      disabled={a.working}
      hitSlop={SLOP}
      onPress={a.onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: withAlpha(colors.text, 0.1) }, pressed && styles.pressed]}
    >
      {a.working ? <ActivityIndicator size="small" color={ink} /> : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.btnText, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------- A row to join */

function ReportArea({ a, style, children }: { a: RowAct; style: object; children: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityHint="Hold to report"
      accessibilityActions={[{ name: 'longpress', label: 'Report group' }]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') a.report(); }}
      onLongPress={a.report}
      delayLongPress={400}
      onPress={a.state === 'joined' ? a.onPress : undefined}
      style={({ pressed }) => [style, pressed && a.state === 'joined' && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/** D: when · level · where. E: the group's own words. Either way, who is in it under that. */
function JoinRow({ g, a, me, last, about }: { g: Listed; a: RowAct; me: ID | null; last: boolean; about: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const who = useWhoLine(g.id, g.memberCount, me);
  const second = about ? firstLine(g.description) || factLine(g.id) : factLine(g.id) || firstLine(g.description);
  return (
    <View style={[styles.row, styles.rowJoin]}>
      <ReportArea a={a} style={styles.group}>
        <GroupFace name={g.name} look={g.look} size={FACE} />
        <View style={styles.words}>
          {/* A name is never cut off beside a button: it may take two lines. */}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{g.name}</Text>
          {second ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={about ? 2 : 1}>{second}</Text> : null}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{who}</Text>
        </View>
      </ReportArea>
      <GreyButton a={a} />
      {!last ? <View style={[styles.hair, { left: PAD + FACE + GAP }]} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------- Body */

export function DEBody(p: LookProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { look, feedGroups, currentUserId: me, full, rows, near, rest, searching, search } = p;
  const e = look === 'e';
  if (p.off) return <Text style={styles.note}>Groups aren’t switched on yet. Check back soon.</Text>;
  const demo = [...feedGroups, ...near, ...rest].some((g) => !!factsFor(g.id));
  const area = areaWords(demo);
  const parts: { title: string; rows: Listed[] }[] = [];
  if (near.length) parts.push({ title: area.near, rows: near });
  if (rest.length) parts.push({ title: searching ? 'Groups' : area.more, rows: rest });
  const canSearch = searching || !!(rows && rows.length);

  return (
    <>
      {/* Invites (feat/group-invites) go first, above search, and draw nothing while there are none. */}
      {canSearch ? <SearchBox value={search} onChangeText={p.setSearch} /> : null}

      {!searching && feedGroups.length ? (
        <>
          <SectionHead
            title={`Your groups · ${feedGroups.length} of ${MAX_GROUPS}`}
            right={(
              <View style={styles.sectionRight}>
                <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" onPress={() => p.go('/groups')} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
                  <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.manageText, { color: brandOn(colors.bg) }]}>Manage</Text>
                </Pressable>
              </View>
            )}
          />
          {feedGroups.map((g, i) => <MineRow key={g.id} g={g} me={me} go={p.go} last={i === feedGroups.length - 1} />)}
        </>
      ) : null}

      {rows === undefined ? (
        <ActivityIndicator style={styles.loading} color={colors.textFaint} />
      ) : rows === null ? (
        <Text style={styles.note}>Finding groups isn’t switched on yet. You can still start one, or join with an invite link.</Text>
      ) : !parts.length ? (
        <Text style={styles.note}>{searching ? `No group called “${search.trim()}”.` : 'Nobody near you has started a group yet.'}</Text>
      ) : (
        parts.map((part) => (
          <View key={part.title}>
            <SectionHead title={part.title} />
            {part.rows.map((g, i) => <JoinRow key={g.id} g={g} a={p.act(g)} me={me} about={e} last={i === part.rows.length - 1} />)}
          </View>
        ))
      )}

      {!searching ? (
        <View style={styles.startGap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={full ? `Start a group. ${FULL_START_LINE}` : 'Start a group'}
            onPress={p.create}
            style={({ pressed }) => [styles.row, styles.rowJoin, pressed && styles.pressed]}
          >
            <View style={styles.addFace}><Ionicons name="add" size={22} color={colors.textMuted} /></View>
            <View style={styles.words}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>Start a group</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={2}>{full ? FULL_START_LINE : 'Only the people in it see its feed.'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: PAD, paddingTop: spacing.xs },
  title: { ...font('600'), fontSize: 20, letterSpacing: -0.3, color: colors.text, flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: PAD, paddingTop: spacing.xl - 8, paddingBottom: spacing.sm },
  sectionTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text, flexShrink: 1 },
  sectionRight: { flexDirection: 'row', alignItems: 'baseline' },
  manage: { minHeight: 44, marginVertical: -14, justifyContent: 'center', paddingLeft: spacing.md },
  manageText: { ...font('600'), fontSize: 15 },

  // The field is surfaceAlt; the buttons are a step stronger, so the two never read as one set of slabs.
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 36, paddingLeft: 10, paddingRight: spacing.sm,
    marginHorizontal: PAD, marginTop: spacing.sm,
    borderRadius: 10, borderCurve: 'continuous', backgroundColor: colors.surfaceAlt,
  },
  searchInput: {
    flex: 1, ...typography.body, color: colors.text, paddingVertical: 0, height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,

  // A row: full width on the page itself; the hairline starts at the words and runs to the edge, as in Messages.
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingLeft: PAD, paddingRight: PAD },
  rowMine: { minHeight: 64 },
  rowJoin: { minHeight: 72 },
  group: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: GAP, alignSelf: 'stretch' },
  words: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 10, alignSelf: 'stretch', justifyContent: 'center' },
  hair: { position: 'absolute', bottom: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  name: { ...font('600'), fontSize: 15, letterSpacing: -0.1, color: colors.text },
  meta: { ...font('400'), fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  newLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  askLine: { ...font('600'), fontSize: 13, color: colors.text, flexShrink: 1 },
  note: { ...typography.body, color: colors.textMuted, padding: PAD },
  loading: { paddingVertical: spacing.xl },

  addFace: { width: FACE, height: FACE, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  startGap: { marginTop: spacing.sm },

  btn: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', height: 32, minWidth: 72, paddingHorizontal: 14, borderRadius: 8, ...buttonShape.curve },
  btnText: { ...font('600'), fontSize: 14, letterSpacing: -0.1 },
  fullWord: { flexShrink: 0, minWidth: 72, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
  fullText: { ...font('400'), fontSize: 13, color: colors.textFaint },
});
