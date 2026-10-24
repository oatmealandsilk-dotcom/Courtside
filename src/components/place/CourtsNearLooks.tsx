import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { router } from 'expo-router';

import { SwipePressable } from '@/components/SwipePressable';
import { Avatar } from '@/components/ui/Avatar';
import { labelOf } from '@/features/places/courtName';
import { openCourt } from '@/features/players/courtLink';
import { nowStatus, playingLine } from '@/features/players/courtSummary';
import type { Court, CourtRow } from '@/features/players/courts';
import { formatMiles } from '@/features/players/geo';
import type { FindPlayersLook } from '@/features/players/findPlayersLook';
import type { User } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/** What each court card already knows: the soonest open hit you may see there, and its posts. */
export type CourtBadge = { hit: string | null; posts: string | null };

/** The surface, as the map data names it, in three families; anything else is unknown. */
function surfaceOf(c: Court): 'hard' | 'clay' | 'grass' | null {
  const s = (c.surface ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('clay')) return 'clay';
  if (s.includes('grass') || s.includes('turf')) return 'grass';
  if (/hard|acrylic|asphalt|concrete|tartan|carpet|plexi|decoturf/.test(s)) return 'hard';
  return null;
}

const tintOf = (c: Court) => {
  const s = surfaceOf(c);
  return s === 'hard' ? colors.hard : s === 'clay' ? colors.clay : s === 'grass' ? colors.grass : colors.court;
};

/** "2 hard courts · lights", "Clay court": the court itself, when nothing is on there. */
function courtLine(c: Court): string {
  const s = surfaceOf(c);
  const n = Math.max(1, c.count);
  const what = n > 1 ? `${n} ${s ? `${s} ` : ''}courts` : s ? `${s[0].toUpperCase()}${s.slice(1)} court` : '1 court';
  return [what, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
}

const distance = (c: Court, miles: number) => [formatMiles(miles), c.count > 1 ? `${c.count} courts` : null].filter(Boolean).join(' · ');
const open = (c: Court) => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng });

function Head({ link }: { link: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.head}>
      <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.title}>Courts near you</Text>
      {link ? (
        <SwipePressable accessibilityRole="link" accessibilityLabel="See all courts on the map" hitSlop={10} onPress={() => router.push('/map')} style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headLink}>See all</Text>
        </SwipePressable>
      ) : null}
    </View>
  );
}

/**
 * Courts near you in looks C to F (Oct 24, owner after A and B: "Make more").
 * - C chips: one line of the app's own choice chips, "Bellwood Rec · 1.3 mi".
 * - D court drawing: each court drawn from above in its surface's colour, name and distance under it.
 * - E what's on: each card leads with what is happening there (latest report, players on court, an open hit, who plays there).
 * - F type only: the names in larger type, distance under, thin rules between, no boxes.
 */
export function CourtsNearLook({ look, rows, badges }: { look: Exclude<FindPlayersLook, 'now' | 'A' | 'B'>; rows: CourtRow[]; badges: Map<string, CourtBadge> }) {
  const styles = useThemedStyles(styleDefinitions);
  if (look === 'C') {
    return (
      <View style={styles.wrap}>
        <Head link />
        <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.chipRow}>
          {rows.map(({ c, miles }) => (
            <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={`${labelOf(c)}, ${distance(c, miles)}`} onPress={() => open(c)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={styles.chipName}>{labelOf(c)}</Text>
              <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={styles.chipMiles}>{formatMiles(miles)}</Text>
            </SwipePressable>
          ))}
        </ScrollView>
      </View>
    );
  }
  if (look === 'D') {
    return (
      <View style={styles.wrap}>
        <Head link />
        <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.drawRow}>
          {rows.map(({ c, miles }) => (
            <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={[labelOf(c), distance(c, miles), surfaceOf(c), c.lit ? 'lights' : null].filter(Boolean).join(', ')} onPress={() => open(c)} style={({ pressed }) => [styles.drawCard, pressed && styles.cardPressed]}>
              <CourtDrawing tint={tintOf(c)} />
              <View>
                <Room />
                <View style={styles.wordsOver}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{distance(c, miles)}</Text>
                </View>
              </View>
            </SwipePressable>
          ))}
        </ScrollView>
      </View>
    );
  }
  if (look === 'E') return <WhatsOn rows={rows} badges={badges} />;
  return (
    <View style={styles.wrap}>
      <Head link />
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.typeRow}>
        {rows.map(({ c, miles }, i) => (
          <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={`${labelOf(c)}, ${distance(c, miles)}`} onPress={() => open(c)} style={({ pressed }) => [styles.typeItem, i > 0 && styles.typeRule, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.typeName} numberOfLines={2}>{labelOf(c)}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{distance(c, miles)}</Text>
          </SwipePressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** A court from above, in lines: doubles and singles lines, service boxes, the net. Landscape, 78 by 36 feet. */
function CourtDrawing({ tint }: { tint: string }) {
  const W = 148; const H = 76;
  const L = 112; const D = L * 36 / 78; // the court's length and width on the page
  const x0 = (W - L) / 2; const y0 = (H - D) / 2;
  const ft = L / 78;
  const net = x0 + L / 2;
  const s1 = y0 + 4.5 * ft; const s2 = y0 + D - 4.5 * ft;
  const sv1 = net - 21 * ft; const sv2 = net + 21 * ft;
  const line = { stroke: tint, strokeWidth: 1.1, strokeOpacity: 0.85 };
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Rect x={0} y={0} width={W} height={H} rx={12} fill={tint} fillOpacity={0.1} />
      <Rect x={x0} y={y0} width={L} height={D} fill={tint} fillOpacity={0.16} {...line} />
      <Line x1={x0} y1={s1} x2={x0 + L} y2={s1} {...line} />
      <Line x1={x0} y1={s2} x2={x0 + L} y2={s2} {...line} />
      <Line x1={sv1} y1={s1} x2={sv1} y2={s2} {...line} />
      <Line x1={sv2} y1={s1} x2={sv2} y2={s2} {...line} />
      <Line x1={sv1} y1={y0 + D / 2} x2={sv2} y2={y0 + D / 2} {...line} />
      <Line x1={net} y1={y0 - 3} x2={net} y2={y0 + D + 3} stroke={tint} strokeWidth={1.8} />
    </Svg>
  );
}

type Lead = { text: string; strong: boolean; quiet?: boolean; people?: User[] };

/** Look E: what is on at each court leads the card; the court itself when nothing is. */
function WhatsOn({ rows, badges }: { rows: CourtRow[]; badges: Map<string, CourtBadge> }) {
  const styles = useThemedStyles(styleDefinitions);
  const { courtNow, courtRegulars, users, currentUserId, actions } = useApp();
  const ids = rows.map((r) => r.c.id).join(',');
  // The latest reports and who plays there, for these courts (the court page asks the same).
  useEffect(() => { if (currentUserId && ids) void actions.loadCourtInfo(ids.split(',')).catch(() => undefined); }, [ids, currentUserId, actions]);
  const leads = useMemo(() => new Map<string, Lead>(rows.map(({ c }): [string, Lead] => {
    const now = courtNow[c.id];
    const status = nowStatus(now);
    if (status) return [c.id, { text: status.line, strong: status.status === 'free' }];
    const playing = playingLine(now, users);
    if (playing) return [c.id, { text: playing, strong: false, people: (now?.friendIds ?? []).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u).slice(0, 3) }];
    const hit = badges.get(c.id)?.hit;
    if (hit) return [c.id, { text: `Hit ${hit}`, strong: true }];
    const people = (courtRegulars[c.id] ?? []).map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u).slice(0, 3);
    if (people.length) {
      const first = people[0].name.split(' ')[0];
      const text = people.length === 1 ? `${first} plays here` : people.length === 2 ? `${first} and ${people[1].name.split(' ')[0]} play here` : `${first} +${people.length - 1} play here`;
      return [c.id, { text, strong: false, people }];
    }
    return [c.id, { text: courtLine(c), strong: false, quiet: true }];
  })), [rows, courtNow, courtRegulars, users, badges]);
  return (
    <View style={styles.wrap}>
      <Head link />
      <ScrollView nativeID="courts-near-strip" horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.cardRow}>
        {rows.map(({ c, miles }) => {
          const lead = leads.get(c.id)!;
          const people = lead.people?.length ? lead.people : null;
          return (
            <SwipePressable key={c.id} accessibilityRole="link" accessibilityLabel={[lead.text, labelOf(c), distance(c, miles)].join(', ')} onPress={() => open(c)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <View style={styles.lead}>
                {people ? <View style={styles.faces}>{people.map((u, i) => <Avatar key={u.id} name={u.name} seed={u.avatarSeed ?? u.id} uri={u.avatarUrl} size={20} style={[styles.face, i > 0 && styles.faceOver]} />)}</View> : null}
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.leadText, lead.strong && styles.leadStrong, lead.quiet && styles.leadQuiet]}>{lead.text}</Text>
              </View>
              <View>
                <Room />
                <View style={styles.wordsOver}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.name} numberOfLines={2}>{labelOf(c)}</Text>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.meta} numberOfLines={1}>{formatMiles(miles)}</Text>
                </View>
              </View>
            </SwipePressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Two lines of name and one of distance, unseen, so a strip of short names is the same height as one of long ones. */
function Room() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.room} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.name, styles.unseen]} numberOfLines={2}>{'Courts\nnear you'}</Text>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.meta, styles.unseen]} numberOfLines={1}>1 mi</Text>
    </View>
  );
}

/** The strip holding its place while the courts load, in each look's own shape. */
export function CourtsNearHeld({ look }: { look: Exclude<FindPlayersLook, 'now' | 'A' | 'B'> }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap} accessible accessibilityLabel="Loading courts near you">
      <View style={styles.head}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Courts near you</Text></View>
      <View style={[look === 'C' ? styles.chipRow : look === 'D' ? styles.drawRow : look === 'E' ? styles.cardRow : styles.typeRow, styles.heldRow]}>
        {[0, 1, 2].map((i) => look === 'C' ? <View key={i} style={[styles.chip, styles.heldChip]} />
          : look === 'D' ? <View key={i} style={styles.drawCard}><View style={styles.heldDrawing} /><View><Room /><View style={[styles.heldLine, styles.heldOver, { width: '80%' }]} /></View></View>
          : look === 'E' ? <View key={i} style={styles.card}><View style={styles.lead} /><View><Room /><View style={[styles.heldLine, styles.heldOver, { width: '80%' }]} /></View></View>
          : <View key={i} style={[styles.typeItem, i > 0 && styles.typeRule]}><View style={[styles.heldLine, { width: '86%', height: 19 }]} /><View style={[styles.heldLine, { width: '60%', height: 19 }]} /><View style={[styles.heldLine, { width: '44%', height: 12 }]} /></View>)}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: PRESS_DIM },
  cardPressed: { transform: [{ scale: PRESS_SHRINK }] },
  scroller: { flexGrow: 0 },
  name: { ...typography.bodyStrong, color: colors.text, lineHeight: 20 },
  meta: { ...typography.small, color: colors.textMuted },
  room: { gap: 2 },
  wordsOver: { position: 'absolute', top: 0, left: 0, right: 0, gap: 2 },
  unseen: { opacity: 0 },
  // C: the app's choice chips (Chip's own shape and tones), name in the page's ink, the distance quieter.
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  chipName: { ...typography.smallStrong, color: colors.text },
  chipMiles: { ...typography.small, color: colors.textMuted },
  // D: the drawing is the picture; no box around the words.
  drawRow: { gap: spacing.md, paddingBottom: spacing.xs },
  drawCard: { width: 148, gap: spacing.sm },
  // E: a slim card, what's on first.
  cardRow: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  card: { ...lift, width: 168, paddingHorizontal: spacing.md, paddingVertical: 12, gap: 8, borderRadius: radius.lg, backgroundColor: colors.surface },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  leadText: { ...typography.small, color: colors.text, flexShrink: 1 },
  leadStrong: { ...typography.smallStrong, color: colors.brand },
  leadQuiet: { color: colors.textMuted },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 1.5, borderColor: colors.surface },
  faceOver: { marginLeft: -6 },
  // F: type only, thin rules between.
  typeRow: { paddingVertical: 2 },
  typeItem: { width: 156, paddingRight: spacing.md, gap: 4 },
  typeRule: { paddingLeft: spacing.md, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.borderStrong },
  typeName: { ...typography.title, fontSize: 19, lineHeight: 23, color: colors.text },
  // Held: the looks' own shapes in the page's quiet tone.
  heldRow: { flexDirection: 'row', overflow: 'hidden' },
  heldChip: { width: 150, height: 33, borderColor: 'transparent', backgroundColor: colors.bgElevated },
  heldDrawing: { width: 148, height: 76, borderRadius: 12, backgroundColor: colors.bgElevated },
  heldLine: { height: 14, marginVertical: 3, borderRadius: 7, backgroundColor: colors.bgElevated },
  heldOver: { position: 'absolute', top: 0, left: 0 },
});
