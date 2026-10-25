import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HitGlyph } from '@/components/HitGlyph';
import { LiveDot } from '@/components/LiveDot';
import { Tappable } from '@/components/Tappable';
import { CourtHits } from '@/components/place/CourtHits';
import { FollowHeart, HereTag, useCourtSaid } from '@/components/place/CourtLife';
import { surfaceTint } from '@/components/place/SurfaceTag';
import { Collapse } from '@/components/ui/Collapse';
import type { CourtAccess } from '@/data/types';
import { surfaceKind, surfaceLabel } from '@/features/places/courtSurface';
import { openCourtNow, openCourtReview, playHere } from '@/features/players/courtLink';
import { NOW_ICON } from '@/features/players/courtSummary';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { TextScale, buttonShape, colors, font, oneLine, spacing, typography } from '@/theme';
import { PRESS_DIM } from '@/theme/press';

import { ListRow, SectionHead, useCourtNow } from './parts';
import type { CourtView } from './view';

/*
 * The pieces of the court page (look.ts 'final'; owner, Oct 24: Follow should
 * not weigh as much as Play here, the bottom is not organised, too many
 * words; Oct 25: "Completely optimize court page. Open hits should probaly
 * show up before posts and activities there"). Rules: no icon tiles; every
 * empty section is one line; each action is on the page once (Play here,
 * Post, Directions, Share; the map's credit is the map's own ⓘ); the surface
 * is one word and a dot in its colour, nothing when unknown; lights are said
 * once, players' answers first; every gate is as before.
 */

const ACCESS_SHORT: Record<Exclude<CourtAccess, 'unknown'>, string> = { public: 'Public', members: 'Members', pay: 'Pay to play', private: 'Private' };

/** Right now is asked and shown only at a court on the map, on a database with courts' own life, never at someone's home. */
export const canSayNow = (view: CourtView) => !!view.extras && !!view.factsId && view.access !== 'private';

/**
 * The court's facts: how many courts and what they are played on (the map,
 * or what five players in a row said), whether it is lit (players first,
 * then the map), who may play, and a booking link. Anything unknown is null.
 */
function useCourtFacts(view: CourtView) {
  const { courtFacts } = useApp();
  const said = view.factsId ? courtFacts[view.factsId] : undefined;
  const lights: boolean | null = said && view.playersOnLights ? said.lights.yes >= said.lights.no : view.map?.lit ? true : null;
  return {
    count: view.map ? view.map.count : null,
    kind: surfaceKind(view.map?.surface),
    lights,
    access: view.access !== 'unknown' ? ACCESS_SHORT[view.access] : null,
    bookUrl: view.bookUrl,
  };
}

/* ------------------------------ Under the name ------------------------------ */

/**
 * The court's facts in one line under its name, the way Apple Maps shows
 * "Café · $$ · 0.4 mi": "4 courts · ● Hard · Lights · Public · Book".
 * Unknown parts drop out. While the map is still being asked the line is
 * held (empty), so nothing under it jumps down when it lands; nothing
 * known, it folds shut.
 */
export function FactsLine({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const f = useCourtFacts(view);
  const parts: React.ReactNode[] = [];
  if (f.count) parts.push(<Text key="n" style={styles.fact}>{f.count === 1 ? '1 court' : `${f.count} courts`}</Text>);
  if (f.kind) {
    parts.push(
      <View key="s" style={styles.factSurface} accessible accessibilityLabel={`${surfaceLabel[f.kind]} court${f.count === 1 ? '' : 's'}`}>
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
  return (
    <Collapse open={view.mapPending || parts.length > 0}>
      <View style={styles.facts}>
        {view.mapPending ? <Text style={styles.fact}> </Text> : parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Text style={styles.factSep}> · </Text> : null}
            {p}
          </React.Fragment>
        ))}
      </View>
    </Collapse>
  );
}

/** Follow, as the heart beside the name (24pt on a 44pt target): a bookmark, so it never weighs as much as Play here. */
export function NameHeart({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  const { factsId, extras, name, here, access } = view;
  if (!extras || !factsId) return null;
  return <FollowHeart court={{ id: factsId, name, lat: here.lat, lng: here.lng, access }} size={24} style={styles.heart} />;
}

/* -------------------------------- Right now -------------------------------- */

/**
 * How it is right now as one 44pt row between hairlines, no card and no
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

/* --------------------------------- Buttons --------------------------------- */

/**
 * Under Start a session here: Play here (the brand's dim fill and its words,
 * the hit glyph, the rest of the width), second only to Start; then two
 * 44pt squares, Directions and Share. A members-only or private court has
 * no Play here: the squares sit on the right alone.
 */
export function PlayAndSquares({ view }: { view: CourtView }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.second}>
      <View style={styles.playGrow}>
        {!view.closed ? (
          <Tappable accessibilityLabel={`Play here. Post a hit at ${view.name}`} onPress={() => playHere(view.here)} hoverTo={1.02} style={styles.play}>
            <View style={styles.playInner}>
              <HitGlyph size={19} color={colors.brand} />
              <Text {...oneLine(TextScale.TITLE, 0.85)} style={styles.playText} numberOfLines={1}>Play here</Text>
            </View>
          </Tappable>
        ) : null}
      </View>
      <Tappable dim accessibilityLabel={`Directions to ${view.name}`} onPress={view.onDirections} style={styles.square}>
        <Ionicons name="car-outline" size={21} color={colors.brand} />
      </Tappable>
      <Tappable dim accessibilityLabel={`Share ${view.name} in a chat`} onPress={view.onShare} style={styles.square}>
        <Ionicons name="paper-plane-outline" size={20} color={colors.brand} />
      </Tappable>
    </View>
  );
}

/* -------------------------------- Open hits -------------------------------- */

/**
 * The open hits, first of the sections (owner, Oct 25: "Open hits should
 * probaly show up before posts and activities there"): "Open hits 2" and
 * their cards, each leaving out the court's name (this page is that court).
 * None open: one quiet line, "No open hits · Post one", whose tap is Play
 * here. A members-only or private court is never suggested for a hit: with
 * none open, nothing at all.
 */
export function OpenHits({ view, count }: { view: CourtView; count: number }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!count) {
    if (view.closed) return null;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`No open hits. Post one at ${view.name}`} hitSlop={{ top: 10, bottom: 10 }} onPress={() => playHere(view.here)} style={({ pressed }) => [styles.noHits, pressed && styles.dim]}>
        <Text style={styles.noHitsText} numberOfLines={1}>No open hits · <Text style={styles.noHitsLink}>Post one</Text></Text>
        <Ionicons name="chevron-forward" size={14} color={colors.brand} />
      </Pressable>
    );
  }
  return (
    <View style={styles.section}>
      <SectionHead title="Open hits" count={String(count)} />
      <CourtHits place={view.here} atCourt />
    </View>
  );
}

/* ---------------------------- What players say ---------------------------- */

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * What players said, as label and value rows (no icons): Busy, Condition,
 * Nets. Lights are left out: the facts line under the name says them.
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

/**
 * What players say and "Know this court?" as one section and one list: its
 * head with Add what you know (or Update yours) as the link; "Nobody yet."
 * while nobody has said anything; else who said it, then label and value
 * rows and the newest note (muted, three lines at most) with its flag.
 */
export function PlayersSay({ courtId, name }: { courtId: string; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { said, mine, quoted, canReport, reportNote } = useCourtSaid(courtId);
  const rows = said.players ? playerRows(said.facts) : [];
  return (
    <View style={styles.section}>
      <SectionHead
        title="What players say"
        sub={said.players ? `From ${said.players} ${said.players === 1 ? 'player' : 'players'}` : 'Nobody yet.'}
        link={{ label: mine ? 'Update yours' : 'Add what you know', a11y: mine ? `Update what you said about ${name}` : `Add what you know about ${name}`, onPress: () => openCourtReview(courtId, { name }) }}
      />
      {said.players ? (
        <View>
          {rows.map((r, i) => <ListRow key={r.label} label={r.label} value={r.value} tone="text" line={i > 0} a11y={`${r.label}: ${r.value}`} />)}
          {quoted ? (
            <View style={[styles.note, rows.length > 0 && styles.line]}>
              <Text style={styles.noteText} numberOfLines={3}>“{quoted.text}”</Text>
              {canReport ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Report this note about ${name}`} hitSlop={12} onPress={reportNote} style={({ pressed }) => [styles.noteFlag, pressed && styles.dim]}>
                  <Ionicons name="flag-outline" size={14} color={colors.textFaint} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  dim: { opacity: PRESS_DIM },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  section: { gap: spacing.md },
  // Under the name: the facts line.
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 },
  fact: { ...typography.body, color: colors.text, lineHeight: 20 },
  factSep: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  factSurface: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  brandWord: { ...font('600'), color: colors.brand },
  // The heart: a 24pt glyph on a 44pt target, level with the name's first line.
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -5, marginRight: -10 },
  // Right now.
  nowBlock: { marginTop: spacing.lg },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  nowWords: { flex: 1, minWidth: 0, gap: 1 },
  nowAsk: { ...typography.body, color: colors.textMuted },
  nowSaid: { ...typography.bodyStrong, color: colors.text },
  nowSub: { ...typography.small, color: colors.textMuted },
  update: { ...typography.smallStrong, fontSize: 14, color: colors.brand },
  here: { paddingTop: spacing.sm, alignItems: 'flex-start' },
  // Play here and the two squares.
  second: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  playGrow: { flex: 1 },
  play: { height: 44, borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  playInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, maxWidth: '100%' },
  playText: { ...typography.bodyStrong, fontSize: 16, color: colors.brand, flexShrink: 1 },
  square: { width: 44, height: 44, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  // No open hits: one line, its link in the brand's colour.
  noHits: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 24 },
  noHitsText: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  noHitsLink: { ...font('600'), color: colors.brand },
  // What players say.
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 11 },
  noteText: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, flex: 1, minWidth: 0 },
  noteFlag: { paddingTop: 3 },
});
