import { PRESS_DIM } from '@/theme/press';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { FeedGroup, ID, User } from '@/data/types';
import { Avatar } from '@/components/ui/Avatar';
import { BrandWash } from '@/components/ui/BrandWash';
import { GroupFace } from '@/features/groups/GroupFace';
import { areaWords, coverFor, facesFor, factLine, factsFor } from '@/features/groups/previewFacts';
import type { Listed, LookProps, RowAct } from '@/features/groups/FindGroupsLooks';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { MAX_GROUPS } from '@/store/feedGroups';
import { buttonShape, colors, readsOn, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale } from '@/theme/textScale';

/*
 * Design preview (Oct 22, round 3), web only: ?gs=d|e (see sheetLook.web.ts).
 * The owner's word on rounds 1 and 2 was "looks so AI": emoji on pastel
 * washes, glow, cards in cards and a stack of pills. These two read like the
 * apps people already trust with their friends.
 *   D  Club list: a chat-app list on one plain page colour. Each group shows
 *      its court photo (or its initials on its own colour), the facts a player
 *      would say (where · when · level) and the faces of who is in it.
 *   E  Club cards: the same, but each group to join is a flat card that opens
 *      with a wide strip of its court (Strava / Meetup), and one Join.
 * Groups you are in are D's rows in both, so they look like your chats.
 * Same sheet, same actions as today; only the drawing changes.
 */

const PAD = spacing.lg;
const FACE = 52;
const MINE_FACE = 48;
const FULL_NOTE = 'That’s the most. Leave one to join another.';
const FULL_START_LINE = `You’re in ${MAX_GROUPS} groups, the most anyone can be in. Leave one to start another.`;
const SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

const brandOn = (fill: string) => (readsOn(colors.brand, fill) ? colors.brand : colors.text);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const members = (n: number) => plural(n, 'member', 'members');
const firstName = (u?: User) => (u?.name ?? '').split(/\s+/)[0] || 'Someone';
const firstLine = (s?: string) => (s ?? '').split('\n')[0].trim();

/** The sheet's header in D and E: the title on the left, a plain close on the right. */
export function DEHeader({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title} accessibilityRole="header">Groups</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Ionicons name="close" size={24} color={colors.textMuted} />
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

/** Up to `max` faces of who is in it, then "Mira, Dev and 9 others", then this week's hits. */
function People({ ids, total, me, size, max, ringOn, hits }: { ids: ID[]; total: number; me: ID | null; size: number; max: number; ringOn: string; hits?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const others = ids.filter((id) => id !== me);
  const meIn = !!me && ids.includes(me);
  const shown = others.slice(0, max).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const named = shown.slice(0, 2);
  const rest = total - (meIn ? 1 : 0) - named.length;
  const words = !named.length ? members(total)
    : rest > 0 ? `${named.map(firstName).join(', ')} and ${plural(rest, 'other', 'others')}`
    : named.map(firstName).join(' and ');
  const line = hits ? `${words} · ${hits} ${hits === 1 ? 'hit' : 'hits'} this week` : words;
  return (
    <View style={styles.people}>
      {shown.length ? (
        <View style={styles.pile}>
          {shown.map((u, i) => (
            <View key={u.id} style={[styles.pileFace, { marginLeft: i ? -Math.round(size * 0.32) : 0, borderRadius: size, borderColor: ringOn }]}>
              <Avatar uri={u.avatarUrl} name={u.name} seed={u.avatarSeed} size={size} />
            </View>
          ))}
        </View>
      ) : null}
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{line}</Text>
    </View>
  );
}

/** A group's second line: its facts, else the first line of what it is about, else its size. */
const factsOr = (id: ID, description: string | undefined, count: number) => factLine(id) || firstLine(description) || members(count);

/* ------------------------------------------------------------ Your groups */

function MineRow({ g, me, go, last }: { g: FeedGroup; me: ID | null; go: (href: string) => void; last: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const admin = g.members.some((m) => m.id === me && m.admin);
  const asked = admin ? g.requests.length : 0;
  const askLine = asked === 1 ? `${firstName(users.find((u) => u.id === g.requests[0]))} asked to join` : asked > 1 ? `${asked} people asked to join` : '';
  const ids = [...new Set(g.members.map((m) => m.id))];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${g.name}${askLine ? `, ${askLine}` : ''}`}
      onPress={() => go(`/g/${g.id}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <GroupFace name={g.name} look={g.look} size={MINE_FACE} />
      <View style={styles.words}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
        {askLine ? (
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.askLine} numberOfLines={1}>{askLine}</Text>
        ) : (
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{factsOr(g.id, g.description, g.members.length)}</Text>
        )}
        <People ids={ids} total={g.members.length} me={me} size={20} max={3} ringOn={colors.bg} hits={factsFor(g.id)?.hitsThisWeek} />
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      {!last ? <View style={[styles.hair, { left: PAD + MINE_FACE + spacing.md }]} /> : null}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- Buttons */

function labelOf(g: Listed, a: RowAct) {
  const shut = a.faded && (a.state === 'join' || a.state === 'request');
  const label = a.working ? (g.ask ? 'Asking…' : 'Joining…')
    : shut ? 'Full'
    : a.state === 'joined' ? 'Joined' : a.state === 'requested' ? 'Requested' : a.state === 'request' ? 'Ask' : 'Join';
  return { shut, label, open: !shut && (a.state === 'join' || a.state === 'request') };
}

/** D: Instagram's grey secondary button on every row, so a column of them stays quiet. */
function GreyButton({ g, a }: { g: Listed; a: RowAct }) {
  const styles = useThemedStyles(styleDefinitions);
  const { shut, label, open } = labelOf(g, a);
  const ink = open ? colors.text : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.a11y}
      disabled={a.working}
      hitSlop={SLOP}
      onPress={shut ? () => showToast({ title: FULL_NOTE, icon: 'people-outline' }) : a.onPress}
      style={({ pressed }) => [styles.btn, styles.btnGrey, pressed && styles.pressed]}
    >
      {a.working ? <ActivityIndicator size="small" color={ink} /> : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.btnText, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

/** E: one button per card. Join is the brand's fill; Ask and the settled states are grey. */
function CardButton({ g, a }: { g: Listed; a: RowAct }) {
  const styles = useThemedStyles(styleDefinitions);
  const { shut, label, open } = labelOf(g, a);
  const filled = open && a.state === 'join';
  const ink = filled ? colors.brandInk : open ? colors.text : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a.a11y}
      disabled={a.working}
      hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
      onPress={shut ? () => showToast({ title: FULL_NOTE, icon: 'people-outline' }) : a.onPress}
      style={({ pressed }) => [styles.btn, styles.btnCard, filled ? styles.btnBrand : styles.btnGrey, pressed && styles.pressed]}
    >
      {filled ? <BrandWash radius={buttonShape.smallRadius} curve /> : null}
      {a.working ? <ActivityIndicator size="small" color={ink} /> : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.btnText, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

/* ------------------------------------------------------- D: a row to join */

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

function DRow({ g, a, me, last }: { g: Listed; a: RowAct; me: ID | null; last: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.row}>
      <ReportArea a={a} style={styles.group}>
        <GroupFace name={g.name} look={g.look} size={FACE} />
        <View style={styles.words}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{factsOr(g.id, g.description, g.memberCount)}</Text>
          <People ids={facesFor(g.id)} total={g.memberCount} me={me} size={20} max={3} ringOn={colors.bg} hits={factsFor(g.id)?.hitsThisWeek} />
        </View>
      </ReportArea>
      <GreyButton g={g} a={a} />
      {!last ? <View style={[styles.hair, { left: PAD + FACE + spacing.md }]} /> : null}
    </View>
  );
}

/* ------------------------------------------------------ E: a card to join */

function ECard({ g, a, me }: { g: Listed; a: RowAct; me: ID | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const photo = g.look?.photoUrl;
  const cover = photo ? coverFor(photo) ?? photo : undefined;
  return (
    <ReportArea a={a} style={styles.card}>
      {cover ? <ExpoImage source={{ uri: cover }} contentFit="cover" recyclingKey={cover} transition={120} style={styles.cover} accessible={false} /> : null}
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={cover ? styles.faceOver : null}>
            <GroupFace name={g.name} look={g.look} size={44} ring={cover ? colors.surface : undefined} />
          </View>
          <View style={styles.cardWords}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={1}>{g.name}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{factLine(g.id) || members(g.memberCount)}</Text>
          </View>
          <CardButton g={g} a={a} />
        </View>
        {g.description ? <Text maxFontSizeMultiplier={TextScale.BODY} style={styles.about} numberOfLines={2}>{g.description}</Text> : null}
        <View style={styles.cardPeople}>
          <People ids={facesFor(g.id)} total={g.memberCount} me={me} size={22} max={4} ringOn={colors.surface} hits={factsFor(g.id)?.hitsThisWeek} />
        </View>
      </View>
    </ReportArea>
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
      {/* Invites (feat/group-invites) go first, and draw nothing while there are none. */}
      {!searching && feedGroups.length ? (
        <>
          <SectionHead
            title="Your groups"
            right={(
              <View style={styles.sectionRight}>
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.meta}>{feedGroups.length} of {MAX_GROUPS}</Text>
                <Pressable accessibilityRole="link" accessibilityLabel="Manage your groups" onPress={() => p.go('/groups')} style={({ pressed }) => [styles.manage, pressed && styles.pressed]}>
                  <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.manageText, { color: brandOn(colors.bg) }]}>Manage</Text>
                </Pressable>
              </View>
            )}
          />
          {feedGroups.map((g, i) => <MineRow key={g.id} g={g} me={me} go={p.go} last={i === feedGroups.length - 1} />)}
        </>
      ) : null}

      {canSearch ? <SearchBox value={search} onChangeText={p.setSearch} /> : null}

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
            {e ? (
              <View style={styles.cards}>{part.rows.map((g) => <ECard key={g.id} g={g} a={p.act(g)} me={me} />)}</View>
            ) : (
              part.rows.map((g, i) => <DRow key={g.id} g={g} a={p.act(g)} me={me} last={i === part.rows.length - 1} />)
            )}
          </View>
        ))
      )}

      {!searching ? (
        <View style={e && parts.length ? styles.startAfterCards : null}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={full ? `Start a group. ${FULL_START_LINE}` : 'Start a group'}
            onPress={p.create}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.addFace}><Ionicons name="add" size={24} color={colors.textMuted} /></View>
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
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: PAD, paddingRight: PAD - 10, paddingTop: spacing.md - 4, paddingBottom: spacing.xs },
  title: { ...typography.title, color: colors.text, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  section: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: PAD, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionRight: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  manage: { minHeight: 44, marginVertical: -14, justifyContent: 'center', paddingLeft: spacing.xs },
  manageText: { ...typography.smallStrong },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 36, paddingLeft: 10, paddingRight: spacing.sm,
    marginHorizontal: PAD, marginTop: spacing.lg, marginBottom: spacing.sm,
    borderRadius: 10, borderCurve: 'continuous', backgroundColor: colors.surfaceAlt,
  },
  searchInput: {
    flex: 1, ...typography.body, color: colors.text, paddingVertical: 0, height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  } as object,

  // A row: full width on the page itself; the hairline starts at the words, as in Messages.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: PAD, paddingRight: PAD, minHeight: 72 },
  group: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  words: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.md, alignSelf: 'stretch', justifyContent: 'center' },
  hair: { position: 'absolute', bottom: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  name: { ...typography.heading, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  askLine: { ...typography.smallStrong, color: colors.text },
  note: { ...typography.body, color: colors.textMuted, padding: PAD },
  loading: { paddingVertical: spacing.xl },

  people: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  pile: { flexDirection: 'row' },
  pileFace: { borderWidth: 1.5, overflow: 'hidden' },

  addFace: { width: FACE, height: FACE, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  btn: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', height: 32, minWidth: 76, paddingHorizontal: 14, borderRadius: buttonShape.smallRadius, ...buttonShape.curve },
  btnCard: { height: buttonShape.smallHeight, minWidth: 0, paddingHorizontal: spacing.lg },
  btnGrey: { backgroundColor: colors.surfaceAlt },
  btnBrand: { backgroundColor: colors.brand },
  btnText: { ...typography.smallStrong, fontSize: buttonShape.smallLabel, letterSpacing: -0.1 },

  // E
  cards: { gap: spacing.md, paddingHorizontal: PAD },
  card: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 2.4, backgroundColor: colors.surfaceAlt },
  cardBody: { padding: spacing.md, paddingTop: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faceOver: { marginTop: -22, alignSelf: 'flex-start' },
  cardWords: { flex: 1, minWidth: 0, gap: 2 },
  about: { ...typography.body, color: colors.text, marginTop: 10, lineHeight: 20 },
  cardPeople: { marginTop: 6 },
  startAfterCards: { marginTop: spacing.lg },
});
