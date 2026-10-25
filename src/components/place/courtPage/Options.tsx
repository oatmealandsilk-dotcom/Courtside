import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitGlyph } from '@/components/HitGlyph';
import { LiveDot } from '@/components/LiveDot';
import { Tappable } from '@/components/Tappable';
import { CourtHits } from '@/components/place/CourtHits';
import { CourtKing } from '@/components/place/CourtKing';
import { FollowHeart, HereTag, useCourtSaid } from '@/components/place/CourtLife';
import { surfaceTint } from '@/components/place/surfaceTint';
import { Collapse } from '@/components/ui/Collapse';
import { Glass } from '@/components/ui/Glass';
import type { CourtAccess } from '@/data/types';
import { surfaceKind, surfaceLabel } from '@/features/places/courtSurface';
import { openCourtNow, openCourtReview, playHere } from '@/features/players/courtLink';
import { NOW_ICON } from '@/features/players/courtSummary';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, pageIsDark, spacing, typography } from '@/theme';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';

import { ListRow, PrimaryBar, SectionHead, useCourtNow } from './parts';
import type { CourtView } from './view';

/*
 * The pieces only the court page's options use (look.ts: A "Place card",
 * B "Two big, rest quiet", C "Court sheet"; owner, Oct 24: Follow should
 * not weigh as much as Play here, the bottom is not organised, too many
 * words). Shared rules: no icon tiles; every empty section is one line;
 * the surface is one word and a dot in its colour, and nothing when the
 * map does not say; lights are said once, players' answers first; every
 * feature and every gate is as today.
 */

const ACCESS_SHORT: Record<Exclude<CourtAccess, 'unknown'>, string> = { public: 'Public', members: 'Members', pay: 'Pay to play', private: 'Private' };

/** Right now is asked and shown only at a court on the map, on a database with courts' own life, never at someone's home. */
export const canSayNow = (view: CourtView) => !!view.extras && !!view.factsId && view.access !== 'private';

/**
 * The court's facts, by the shared rules: how many courts and what they are
 * played on (the map), whether it is lit (players first, then the map), who
 * may play, and a booking link. Anything unknown is null.
 */
export function useCourtFacts(view: CourtView) {
  const { courtFacts } = useApp();
  const said = view.factsId ? courtFacts[view.factsId] : undefined;
  const kind = surfaceKind(view.map?.surface);
  const lights: boolean | null = said && view.playersOnLights ? said.lights.yes >= said.lights.no : view.map?.lit ? true : null;
  return {
    count: view.map ? view.map.count : null,
    kind,
    lights,
    access: view.access !== 'unknown' ? ACCESS_SHORT[view.access] : null,
    bookUrl: view.bookUrl,
  };
}

/* ------------------------------ Under the name ------------------------------ */

/**
 * A and B: the court's facts in one line under its name, the way Apple Maps
 * shows "Café · $$ · 0.4 mi": "4 courts · ● Hard · Lights · Public · Book".
 * Unknown parts drop out; nothing known, no line.
 */
export function FactsLine({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const f = useCourtFacts(view);
  const parts: React.ReactNode[] = [];
  if (f.count) parts.push(<Text key="n" style={styles.fact}>{f.count === 1 ? '1 court' : `${f.count} courts`}</Text>);
  if (f.kind) {
    parts.push(
      <View key="s" style={styles.factSurface} accessible accessibilityLabel={`${surfaceLabel[f.kind]} courts`}>
        <View style={[styles.dot, { backgroundColor: surfaceTint(f.kind) }]} />
        <Text style={styles.fact}>{surfaceLabel[f.kind]}</Text>
      </View>,
    );
  }
  if (f.lights !== null) parts.push(<Text key="l" style={styles.fact}>{f.lights ? 'Lights' : 'No lights'}</Text>);
  if (f.access) parts.push(<Text key="a" style={styles.fact}>{f.access}</Text>);
  if (f.bookUrl) {
    const url = f.bookUrl;
    parts.push(
      <Pressable key="b" accessibilityRole="link" accessibilityLabel="Book a court (opens the booking site)" hitSlop={8} onPress={() => { void Linking.openURL(url); }} style={({ pressed }) => [styles.factSurface, pressed && styles.dim]}>
        <Text style={[styles.fact, styles.brandWord]}>Book</Text>
        <Ionicons name="open-outline" size={13} color={colors.brand} />
      </Pressable>,
    );
  }
  if (!parts.length) return null;
  return (
    <View style={styles.facts}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Text style={styles.factSep}> · </Text> : null}
          {p}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * B and C: the town line with Directions as a word at its end, in the
 * brand's colour: "Raleigh, NC · 1.6 mi · 12 followers · Directions".
 */
export function MetaLine({ view, meta }: { view: CourtView; meta: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Text style={styles.meta} numberOfLines={2}>
      {meta ? `${meta} · ` : ''}
      <Text accessibilityRole="link" accessibilityLabel={`Directions to ${view.name}`} onPress={view.onDirections} suppressHighlighting style={styles.metaLink}>Directions</Text>
    </Text>
  );
}

/** A and C: the heart beside the name (24pt, a 44pt target), and C's Share beside it. Two bare icons, no discs. */
export function NameIcons({ view, share }: { view: CourtView; share: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { factsId, extras, name, here, access } = view;
  return (
    <View style={styles.nameIcons}>
      {share ? (
        <Tappable dim accessibilityLabel={`Share ${name} in a chat`} hitSlop={2} onPress={view.onShare} style={styles.nameIcon}>
          <Ionicons name="paper-plane-outline" size={23} color={colors.textMuted} />
        </Tappable>
      ) : null}
      {extras && factsId ? <FollowHeart court={{ id: factsId, name, lat: here.lat, lng: here.lng, access }} size={24} style={styles.nameIcon} /> : null}
    </View>
  );
}

/* -------------------------------- Right now -------------------------------- */

/**
 * A: how it is right now as one 44pt row between hairlines, no card and no
 * tile. Nobody has said: "How is it right now?" and a chevron. Someone has:
 * the status's own icon, "Free · 20 min ago", and Update. Only who is on
 * court is known: the live dot and "3 on court now". A tap opens the
 * right-now sheet. Checked in here: "You're here · Check out" under it.
 */
export function NowRow({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const id = view.factsId!;
  const now = useCourtNow(id, view.access);
  return (
    <View style={styles.nowBlock}>
      <Pressable accessibilityRole="button" accessibilityLabel={now.a11y} onPress={() => openCourtNow({ id, name: view.name, access: view.access })} style={({ pressed }) => [styles.nowRow, pressed && styles.rowPressed]}>
        {now.standing ? <Ionicons name={NOW_ICON[now.standing.status]} size={18} color={colors.brand} /> : now.playing ? <LiveDot size={8} /> : null}
        <View style={styles.nowWords}>
          <Text style={now.said || now.playing ? styles.nowSaid : styles.nowAsk} numberOfLines={1}>{now.title}</Text>
          {now.said && now.playing ? <Text style={styles.nowSub} numberOfLines={1}>{now.playing}</Text> : null}
        </View>
        {now.said ? <Text style={styles.update}>Update</Text> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </Pressable>
      <Collapse open={now.youHere}><View style={styles.here}><HereTag onCheckOut={() => { void actions.checkOutOfCourt(); }} /></View></Collapse>
    </View>
  );
}

/**
 * C: how it is right now as one line under the name, the way Apple Maps puts
 * "Open · Closes 9 PM" under a place's: "How is it now? Tell players", or
 * "Free · 20 min ago" (the brand's colour for free, muted for the rest), or
 * "3 on court now". A tap anywhere on it opens the right-now sheet.
 * B shows the same line under its town line, only while an answer stands.
 */
export function StatusLine({ view, onlyFresh = false }: { view: CourtView; onlyFresh?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const id = view.factsId!;
  const now = useCourtNow(id, view.access);
  const free = now.standing?.status === 'free';
  const show = !onlyFresh || !!now.standing;
  return (
    <>
      <Collapse open={show}>
        <Pressable accessibilityRole="button" accessibilityLabel={now.a11y} hitSlop={6} onPress={() => openCourtNow({ id, name: view.name, access: view.access })} style={({ pressed }) => [styles.status, pressed && styles.dim]}>
          {now.standing ? (
            <>
              <Ionicons name={NOW_ICON[now.standing.status]} size={15} color={free ? colors.brand : colors.textMuted} />
              <Text style={styles.statusText} numberOfLines={1}>
                <Text style={free ? styles.statusFree : styles.statusOther}>{now.standing.line}</Text>
                {now.playing ? ` · ${now.playing}` : ''}
              </Text>
            </>
          ) : now.playing ? (
            <>
              <LiveDot size={8} />
              <Text style={styles.statusText} numberOfLines={1}><Text style={styles.statusOther}>{now.playing}</Text> · <Text style={styles.statusFree}>Tell players</Text></Text>
            </>
          ) : (
            <Text style={styles.statusText} numberOfLines={1}>How is it now? <Text style={styles.statusFree}>Tell players</Text></Text>
          )}
          <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
        </Pressable>
      </Collapse>
      <Collapse open={now.youHere}><View style={styles.here}><HereTag onCheckOut={() => { void actions.checkOutOfCourt(); }} /></View></Collapse>
    </>
  );
}

/* --------------------------------- Buttons --------------------------------- */

/** Play here: the brand's dim fill and its words, the hit glyph. Second only to Start a session. */
function PlayHere({ view, height = 44 }: { view: CourtView; height?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Tappable accessibilityLabel={`Play here. Post a hit at ${view.name}`} onPress={() => playHere(view.here)} hoverTo={1.02} style={[styles.play, { height }]}>
      <View style={styles.playInner}>
        <HitGlyph size={19} color={colors.brand} />
        <Text style={styles.playText} numberOfLines={1}>Play here</Text>
      </View>
    </Tappable>
  );
}

/**
 * A: under Start a session here, Play here (tinted, the rest of the width)
 * and two 44pt squares, Directions and Share. A members-only or private
 * court has no Play here: the squares sit on the right alone.
 */
export function PlayAndSquares({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.second}>
      <View style={styles.playGrow}>{!view.closed ? <PlayHere view={view} /> : null}</View>
      <Tappable dim accessibilityLabel={`Directions to ${view.name}`} onPress={view.onDirections} style={styles.square}>
        <Ionicons name="car-outline" size={21} color={colors.brand} />
      </Tappable>
      <Tappable dim accessibilityLabel={`Share ${view.name} in a chat`} onPress={view.onShare} style={styles.square}>
        <Ionicons name="paper-plane-outline" size={20} color={colors.brand} />
      </Tappable>
    </View>
  );
}

/**
 * B: the page's only two buttons, side by side and deliberately unequal:
 * Start a session (filled, about 60%) and Play here (tinted, about 40%).
 * A members-only or private court: Start a session alone, full width.
 */
export function StartAndPlay({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.pair}>
      <View style={styles.pairStart}><PrimaryBar session={view.session} short /></View>
      {!view.closed ? <View style={styles.pairPlay}><PlayHere view={view} height={50} /></View> : null}
    </View>
  );
}

/**
 * B: Follow and Share as two round glass buttons over the map, top right,
 * built like Back; they stay in the bar once it turns solid.
 */
export function GlassActions({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtFollows, actions } = useApp();
  const { factsId, extras, name, here, access } = view;
  const following = !!(factsId && courtFollows[factsId]?.following);
  const dark = pageIsDark();
  const circle = (icon: keyof typeof Ionicons.glyphMap, color: string) => (
    <Glass radius={19} tint={dark ? colors.surfaceAlt : undefined} style={[styles.glass, dark && styles.glassDark]}>
      <Ionicons name={icon} size={19} color={color} />
    </Glass>
  );
  return (
    <View style={styles.glassRow}>
      {extras && factsId ? (
        <Pressable accessibilityRole="button" accessibilityLabel={following ? `Following ${name}. Unfollow` : `Follow ${name}`} accessibilityState={{ selected: following }} onPress={() => actions.toggleCourtFollow({ id: factsId, name, lat: here.lat, lng: here.lng, access })} style={({ pressed }) => [styles.glassHit, pressed && styles.glassPressed]}>
          {circle(following ? 'heart' : 'heart-outline', following ? colors.brand : colors.text)}
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`Share ${name} in a chat`} onPress={view.onShare} style={({ pressed }) => [styles.glassHit, pressed && styles.glassPressed]}>
        {circle('paper-plane-outline', colors.text)}
      </Pressable>
    </View>
  );
}

/* ---------------------------- What players say ---------------------------- */

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * What players said, as label and value rows (no icons): Busy, Condition,
 * Nets. Lights are left out: each option says them once, elsewhere.
 */
function playerRows(facts: { icon: string; label: string }[]): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const busy = facts.find((f) => f.icon === 'people-outline');
  if (busy) {
    const m = /^(?:Usually|Often) busy (.+)$/.exec(busy.label);
    rows.push({ label: 'Busy', value: m ? cap(m[1]) : busy.label === 'Usually free' ? 'Rarely' : busy.label === 'Busy times vary' ? 'Varies' : busy.label });
  }
  const ground = facts.filter((f) => f.icon === 'layers-outline').map((f) => (f.label === 'Cracked surface' ? 'Cracked' : f.label === 'Good surface' ? 'Good' : f.label));
  if (ground.length) rows.push({ label: 'Condition', value: ground.join(' · ') });
  const nets = facts.find((f) => f.icon === 'grid-outline');
  if (nets) rows.push({ label: 'Nets', value: nets.label === 'Good nets' ? 'Good' : 'Need work' });
  return rows;
}

/** Players' rows, then the newest note (muted, three lines at most) with its flag to report it. */
function SaidRows({ courtId, name, firstLine = true }: { courtId: string; name: string; firstLine?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { said, quoted, canReport, reportNote } = useCourtSaid(courtId);
  const rows = playerRows(said.facts);
  return (
    <>
      {rows.map((r, i) => <ListRow key={r.label} label={r.label} value={r.value} tone="text" line={i > 0 || firstLine} a11y={`${r.label}: ${r.value}`} />)}
      {quoted ? (
        <View style={[styles.note, (rows.length > 0 || firstLine) && styles.line]}>
          <Text style={styles.noteText} numberOfLines={3}>“{quoted.text}”</Text>
          {canReport ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Report this note about ${name}`} hitSlop={12} onPress={reportNote} style={({ pressed }) => [styles.noteFlag, pressed && styles.dim]}>
              <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/**
 * A: What players say and "Know this court?" as one section: its head with
 * Add what you know (or Update yours) as the link; "Nobody yet." while
 * nobody has said anything; else who said it and the rows.
 */
export function SaysA({ courtId, name }: { courtId: string; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { said, mine } = useCourtSaid(courtId);
  return (
    <View style={styles.section}>
      <SectionHead
        title="What players say"
        sub={said.players ? `From ${said.players} ${said.players === 1 ? 'player' : 'players'}` : 'Nobody yet.'}
        link={{ label: mine ? 'Update yours' : 'Add what you know', a11y: mine ? `Update what you said about ${name}` : `Add what you know about ${name}`, onPress: () => openCourtReview(courtId, { name }) }}
      />
      {said.players ? <View><SaidRows courtId={courtId} name={name} firstLine={false} /></View> : null}
    </View>
  );
}

/* ---------------------------------- Lists ---------------------------------- */

/** B's Right now row: "Tell players", or the answer and how long ago, or who is on court now. */
function NowListRow({ view, line }: { view: CourtView; line: boolean }) {
  const id = view.factsId!;
  const now = useCourtNow(id, view.access);
  const value = now.standing ? now.standing.line : now.playing ?? 'Tell players';
  return (
    <ListRow
      label="Right now"
      value={value}
      tone={now.standing || now.playing ? 'text' : 'brand'}
      lead={now.standing ? <Ionicons name={NOW_ICON[now.standing.status]} size={16} color={now.standing.status === 'free' ? colors.brand : colors.textMuted} /> : now.playing ? <LiveDot size={8} /> : null}
      onPress={() => openCourtNow({ id, name: view.name, access: view.access })}
      a11y={now.a11y}
      line={line}
      tall
    />
  );
}

/** B's What players say row: "Add yours", or how many said something, with their rows under it. */
function SaysListRow({ courtId, name, line }: { courtId: string; name: string; line: boolean }) {
  const { said, mine } = useCourtSaid(courtId);
  return (
    <>
      <ListRow
        label="What players say"
        value={said.players ? `${said.players} ${said.players === 1 ? 'player' : 'players'}` : 'Add yours'}
        tone={said.players ? 'muted' : 'brand'}
        onPress={() => openCourtReview(courtId, { name })}
        a11y={mine ? `Update what you said about ${name}` : `Add what you know about ${name}`}
        line={line}
        tall
      />
      {said.players ? <SaidRows courtId={courtId} name={name} /> : null}
    </>
  );
}

/**
 * B: everything below the clips as one list, no titles and no cards:
 * Right now, Open hits (the open ones' cards under it), King of the Court,
 * What players say. Each row says its value and opens what it is about.
 */
export function ThisCourtList({ view, count }: { view: CourtView; count: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const now = canSayNow(view);
  const hits = !(view.closed && !count);
  const king = !!view.factsId && !!view.currentUserId && view.access !== 'private';
  const says = view.extras && !!view.factsId;
  if (!now && !hits && !king && !says) return null;
  return (
    <View style={styles.list}>
      {now ? <NowListRow view={view} line={false} /> : null}
      {hits ? (
        <>
          <ListRow
            label="Open hits"
            value={count ? `${count} open` : 'None'}
            onPress={!count && !view.closed ? () => playHere(view.here) : undefined}
            a11y={count ? `${count} open ${count === 1 ? 'hit' : 'hits'}` : `No open hits. Play here: post a hit at ${view.name}`}
            line={now}
            tall
          />
          {count ? <View style={styles.listHits}><CourtHits place={view.here} /></View> : null}
        </>
      ) : null}
      {king ? <CourtKing courtId={view.factsId!} name={view.name} refresh={view.kingTick} look="row" line={now || hits} /> : null}
      {says ? <SaysListRow courtId={view.factsId!} name={view.name} line={now || hits || king} /> : null}
    </View>
  );
}

/**
 * C: every fact in one list at the foot, from the map and from players, a
 * row only when it has a value: Surface, Courts, Lights (players first),
 * Access, Booking, then what players said (Busy, Condition, Nets, the
 * newest note), then Add what you know. Under it, where it came from.
 */
export function AboutList({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const f = useCourtFacts(view);
  const says = view.extras && !!view.factsId;
  const { said, mine } = useCourtSaid(view.factsId ?? '');
  const rows: React.ReactNode[] = [];
  const add = (key: string, node: (line: boolean) => React.ReactNode) => rows.push(<React.Fragment key={key}>{node(rows.length > 0)}</React.Fragment>);
  if (f.kind) {
    const kind = f.kind;
    add('surface', (line) => <ListRow label="Surface" value={surfaceLabel[kind]} tone="text" lead={<View style={[styles.dot, { backgroundColor: surfaceTint(kind) }]} />} line={line} a11y={`Surface: ${surfaceLabel[kind]}`} />);
  }
  if (f.count) add('count', (line) => <ListRow label="Courts" value={String(f.count)} tone="text" line={line} a11y={`${f.count} ${f.count === 1 ? 'court' : 'courts'}`} />);
  if (f.lights !== null) add('lights', (line) => <ListRow label="Lights" value={f.lights ? 'Yes' : 'No'} tone="text" line={line} a11y={f.lights ? 'Has lights' : 'No lights'} />);
  if (f.access) add('access', (line) => <ListRow label="Access" value={f.access!} tone="text" line={line} a11y={`Who can play: ${f.access}`} />);
  if (f.bookUrl) {
    const url = f.bookUrl;
    add('book', (line) => <ListRow label="Booking" value="Book" tone="brand" lead={<Ionicons name="open-outline" size={14} color={colors.brand} />} onPress={() => { void Linking.openURL(url); }} line={line} a11y="Book a court (opens the booking site)" />);
  }
  if (!rows.length && !says) return null;
  const players = says ? said.players : 0;
  const credit = view.map ? (players ? `From OpenStreetMap and ${players} ${players === 1 ? 'player' : 'players'}` : 'From OpenStreetMap') : players ? `From ${players} ${players === 1 ? 'player' : 'players'}` : null;
  return (
    <View style={styles.section}>
      <SectionHead title="About this court" />
      <View>
        {rows}
        {says && players ? <SaidRows courtId={view.factsId!} name={view.name} firstLine={rows.length > 0} /> : null}
        {says ? (
          <Pressable accessibilityRole="button" accessibilityLabel={mine ? `Update what you said about ${view.name}` : `Add what you know about ${view.name}`} onPress={() => openCourtReview(view.factsId!, { name: view.name })} style={({ pressed }) => [styles.addRow, (rows.length > 0 || players > 0) && styles.line, pressed && styles.rowPressed]}>
            <Text style={styles.addText}>{mine ? 'Update yours' : 'Add what you know'}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>
      {credit ? <Text style={styles.credit}>{credit}</Text> : null}
    </View>
  );
}

/** A and B: the map's credit at the foot, left-aligned, while the map's facts are shown. */
export function MapCredit({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  return view.map ? <Text style={styles.credit}>Court details from OpenStreetMap</Text> : null;
}

const styleDefinitions = StyleSheet.create({
  dim: { opacity: PRESS_DIM },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  section: { gap: spacing.md },
  // Under the name: the facts line and the town line.
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  fact: { ...typography.body, color: colors.text, lineHeight: 20 },
  factSep: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  factSurface: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  brandWord: { ...font('600'), color: colors.brand },
  meta: { ...typography.body, color: colors.textMuted, marginTop: 4, lineHeight: 20 },
  metaLink: { ...font('600'), color: colors.brand },
  // The name's icons: 24pt glyphs on 44pt targets, level with the name's first line.
  nameIcons: { flexDirection: 'row', alignItems: 'center', marginTop: -5, marginRight: -10 },
  nameIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // A's right-now row.
  nowBlock: { marginTop: spacing.lg },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  nowWords: { flex: 1, minWidth: 0, gap: 1 },
  nowAsk: { ...typography.body, color: colors.textMuted },
  nowSaid: { ...typography.bodyStrong, color: colors.text },
  nowSub: { ...typography.small, color: colors.textMuted },
  update: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  here: { paddingTop: spacing.sm, alignItems: 'flex-start' },
  // C's status line (and B's, while an answer stands).
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, minHeight: 22, alignSelf: 'flex-start', maxWidth: '100%' },
  statusText: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  statusFree: { ...font('600'), color: colors.brand },
  statusOther: { ...font('600'), color: colors.text },
  // Play here, tinted: the brand's dim fill and its words.
  play: { height: 44, borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  playInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md },
  playText: { ...typography.bodyStrong, fontSize: 16, color: colors.brand },
  // A: Play here and the two squares.
  second: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  playGrow: { flex: 1 },
  square: { width: 44, height: 44, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  // B: the two buttons, unequal.
  pair: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  pairStart: { flex: 3 },
  pairPlay: { flex: 2 },
  // B: the glass buttons over the map.
  glassRow: { flexDirection: 'row', alignItems: 'center' },
  glassHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Over glass, a press only shrinks: nothing fades on a glass button's parent.
  glassPressed: { transform: [{ scale: PRESS_SHRINK }] },
  glass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  glassDark: { borderWidth: 1, borderColor: colors.borderStrong, boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.45)' },
  // The lists.
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  listHits: { paddingBottom: spacing.md },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 11 },
  noteText: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, flex: 1, minWidth: 0 },
  noteFlag: { paddingTop: 3 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingVertical: 8 },
  addText: { ...typography.bodyStrong, color: colors.brand },
  credit: { ...typography.caption, letterSpacing: 0.2, color: colors.textFaint },
});

