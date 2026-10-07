import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';
import { Avatar, BrandWash, ShirtWash } from '@/components/ui';
import type { ID, SessionDetail } from '@/data/types';
import { onCourtWord, resultWord, scoreLine, sessionEyebrow, sourceLabel, spokenDuration } from '@/features/activity/format';
import { spokenScore } from '@/features/activity/score';
import { sessionPeople } from '@/features/activity/sessionTags';
import { postZones, zoneColors } from '@/features/activity/zones';
import { distanceFigure } from '@/features/activity/workouts';
import { useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, withAlpha } from '@/theme';
import { Duration, Figure } from './Duration';
import { Pop } from './Pop';
import { ZoneBar } from './ZoneBar';

/** Someone on the session as the card shows them; `pending` only ever on the author's own preview. */
export type CardPerson = { id: ID; handle: string; name: string; role: 'opponent' | 'partner'; pending?: boolean };

/** The colours of a session box (the card, the tile, the photo post's stats panel, the share stamp). */
export type CardLook = {
  dark: boolean;
  /** The fade laid inside the box: the court's shirt's, or the brand's own on the plain green box (Clean). */
  wash: 'brand' | 'shirt';
  /**
   * A full-colour box with light words on it (the city shirts, the green box): small marks on it take
   * the card's ink rather than their own colours, which would fight the fill.
   */
  filled: boolean;
  fill: string;
  border: string;
  /** A hairline just inside the edge, drawn over the box so nothing moves: only the cream box has one. */
  rim: string | null;
  figure: string;
  ink: string;
  muted: string;
  faint: string;
  eyebrow: string;
  pillFill: string;
  pillInk: string;
  lines: string;
  zones: string[];
};

/**
 * Courts whose session box is the plain green box with the brand's own wash
 * rather than a shirt: Clean has no shirt. (Adding 'wimbledon' here puts
 * London back on its green box, as it was before Oct 6.)
 */
const BRAND_BOX: ReadonlySet<ThemeName> = new Set<ThemeName>(['clean']);

/**
 * How a session box is coloured on this court: as the court's shirt (Oct 6,
 * owner: "make those the darker full color card. like how we did with the
 * default"). Its fill, the shirt's two-colour fade (ShirtWash), the shirt's
 * lettering for the big numbers and the mark, and the small and quiet words
 * all come from the palette's card slots (cardFill … cardMuted in the theme),
 * each checked at 4.5:1 or more on the fill and on both fade corners.
 *
 * - CourtSide (Oct 5, "more like our banner and our shirt"): the Classic
 *   shirt's cream, lightened and cleaned Oct 6 (it "looks a bit damp"), with
 *   sage and peach corners, the figures in the brand green, the small words
 *   that green a fifth toward the text, the quiet words in the page's muted
 *   ink, a hairline round it so it holds on the page.
 * - Paris: the shirt's colour deepened so its cream lettering holds, all
 *   the words in that cream.
 * - Melbourne, London (Oct 6): light as the shirt (Melbourne's light blue,
 *   London's purple as a soft lilac), all the words in a deep ink of the
 *   court (navy, aubergine), the pill in that ink with the fill's colour.
 * - Night, New York (dark pages): the shirt's own dark ground with its
 *   lettering colour, and the page's hairline border.
 * - Clean: the green box with the brand's ink (BRAND_BOX).
 */
export function cardLook(theme: ThemeName): CardLook {
  if (BRAND_BOX.has(theme)) {
    return {
      dark: pageIsDark(),
      wash: 'brand',
      filled: true,
      fill: colors.brand,
      border: 'transparent',
      rim: null,
      figure: colors.brandInk,
      ink: colors.brandInk,
      muted: withAlpha(colors.brandInk, 0.7),
      faint: withAlpha(colors.brandInk, 0.62),
      eyebrow: withAlpha(colors.brandInk, 0.78),
      pillFill: colors.brandInk,
      pillInk: colors.brand,
      lines: withAlpha(colors.brandInk, 0.1),
      zones: zoneColors('brand'),
    };
  }
  const shirt = {
    wash: 'shirt' as const,
    fill: colors.cardFill,
    figure: colors.cardFigure,
    ink: colors.cardInk,
    eyebrow: colors.cardInk,
    muted: colors.cardMuted,
    faint: colors.cardMuted,
  };
  if (pageIsDark()) {
    return {
      ...shirt,
      dark: true,
      filled: false,
      border: colors.border,
      rim: null,
      pillFill: colors.brand,
      pillInk: colors.brandInk,
      lines: withAlpha(colors.text, 0.08),
      zones: zoneColors('page'),
    };
  }
  if (theme === 'default') {
    return {
      ...shirt,
      dark: false,
      filled: false,
      border: 'transparent',
      rim: withAlpha(colors.cardFigure, 0.2),
      pillFill: colors.brand,
      pillInk: colors.brandInk,
      lines: withAlpha(colors.cardFigure, 0.14),
      // Faint ink for the easy zones rising to the full green, in even steps on
      // the cream (the page's own set has Light and Moderate almost the same
      // here; the page and the stats sheet keep theirs).
      zones: [withAlpha(colors.text, 0.13), withAlpha(colors.text, 0.24), withAlpha(colors.cardFigure, 0.6), withAlpha(colors.cardFigure, 0.8), colors.cardFigure],
    };
  }
  return {
    ...shirt,
    dark: false,
    filled: true,
    border: 'transparent',
    rim: null,
    pillFill: colors.cardFigure,
    pillInk: colors.cardFill,
    lines: withAlpha(colors.cardFigure, 0.14),
    zones: [0.22, 0.36, 0.52, 0.74, 1].map((a) => withAlpha(colors.cardFigure, a)),
  };
}

/**
 * The session boxes' ground as a plain card's (Your sessions, Oct 6): the
 * cream box's own fresh cream on the CourtSide court, the court's own raised
 * ground on the city courts (never the shirt-filled box), the page's surface
 * on a dark one.
 */
export function creamFill(theme: ThemeName): string {
  if (pageIsDark()) return colors.surface;
  return theme === 'default' ? colors.cardFill : colors.bgElevated;
}

/**
 * The fade inside a session box, laid as its first child: the court's shirt
 * (with the cream box's hairline, unless `edge` is off for a picture drawn
 * edge to edge), or the brand's wash in the plain green box.
 */
export function CardWash({ look, radius, edge = true }: { look: CardLook; radius: number; edge?: boolean }) {
  if (look.wash === 'brand') return <BrandWash radius={radius} />;
  return <ShirtWash radius={radius} rim={edge ? look.rim : null} />;
}


/**
 * A session as a card: the post's picture when there is no photo, and the
 * session at the top of the composer. 4:5, the brand's colour (see cardLook),
 * with what it was and when, the time on court as the headline, heart rate
 * and its zones when shared, who it was against, and where the numbers came
 * from. `width` sets the scale: 358 is the full size, the composer's is
 * about two thirds of it. The feed's post draws it sideways (`height`).
 */
export function SessionCard({ session, width, height, play = false, people, hidden = [], onPress, showSource = true, accessibilityHint, aspect = 4 / 5, radius, eyebrow, place, brand = false, scale = 1, inset, picture = false }: {
  session: SessionDetail;
  width: number;
  /**
   * Drawn sideways at this height, as wide as `width` (the feed's post,
   * Oct 6, owner: "It will be sideways"): the time on top, the other numbers
   * in one even row under it, each the same size with its name under it.
   * Everything scales to fit the box. The picture-only props below are not
   * used then.
   */
  height?: number;
  /**
   * The rest are for the pictures made to share (Share → Instagram): the
   * card's shape (9:16 for a whole story), its rounding (0 edge to edge),
   * the line on top with the date rather than "Today", where it was played
   * (left out for anyone not known to be an adult), the CourtSide lockup and
   * courtsidebase.com along the bottom, everything a little larger, and room
   * kept clear top and bottom for Instagram's own buttons.
   */
  aspect?: number;
  radius?: number;
  eyebrow?: string;
  place?: string;
  brand?: boolean;
  scale?: number;
  inset?: { top: number; bottom: number };
  /**
   * Drawn as a picture, not read on screen: the small words scale with the
   * rest, with no floor (a floor only crowds them), and nothing fades in (a
   * browser's copy for the picture would catch it part way).
   */
  picture?: boolean;
  /** Count the numbers up (once, when the card comes into view). */
  play?: boolean;
  /** The author's own preview: the players picked, waiting ones faded. Otherwise only those who accepted (session.with). */
  people?: CardPerson[];
  /** People the viewer blocked: never shown. */
  hidden?: ID[];
  onPress?: () => void;
  showSource?: boolean;
  accessibilityHint?: string;
}) {
  const { theme } = useTheme();
  const look = cardLook(theme);
  const k = (width / 358) * scale;
  const pad = Math.round(22 * k);
  const round = radius ?? Math.round(20 * k);
  // Taller than the feed's 4:5 (a whole story): the numbers sit in the middle.
  const tall = aspect < 4 / 5 - 0.01;
  const shownTop = eyebrow ?? sessionEyebrow(session);
  // The small words keep a size you can read when the card is drawn small
  // (the composer's is about two thirds); the big figures scale freely.
  const small = (size: number, floor: number) => (picture ? size * k : Math.max(floor, size * k));
  const hr = session.maxHr != null;
  const zones = postZones(session);
  // Strain and calories, when the author shared them (migration 72).
  // Strain is WHOOP's own number: posts show only what every tracker gives (Oct 3, owner).
  const strain = null as number | null;
  const kcal = session.kcal ? session.kcal : null;
  const health = hr || !!zones || strain != null || !!kcal;
  const result = resultWord(session);
  // The score from the author's log (migration 91; a practice's too since Oct 6), under the time, the share picture included.
  const score = scoreLine(session);
  // A workout's distance (a run, a ride: migration 107), under the time. Tennis never has one.
  const far = session.workout ? distanceFigure(session.distanceM) : null;
  const list: CardPerson[] = people ?? (() => { const p = sessionPeople(session, hidden); return [...p.opponents, ...p.partners]; })();
  const lead = list[0];
  const vs = lead ? (lead.role === 'opponent' && session.kind !== 'practice' ? 'vs' : 'with') : '';
  const tracker = !!session.activityId;
  const spoken = [
    shownTop.toLowerCase(),
    `${spokenDuration(session.minutes)} ${onCourtWord(session)}`,
    result,
    score ? spokenScore(session.sets) : null,
    far ? `${far.value} miles` : null,
    hr ? `max heart rate ${session.maxHr}${session.avgHr ? `, average ${session.avgHr}` : ''}` : null,
    strain != null ? `Strain ${strain.toFixed(1)}` : null,
    kcal ? `${kcal} calories` : null,
    lead ? `${vs} @${lead.handle}${lead.pending ? ', waiting to accept' : ''}${list.length > 1 ? ` and ${list.length - 1} more` : ''}` : null,
    tracker && showSource ? sourceLabel(session.source ?? 'apple-health') : null,
  ].filter(Boolean).join('. ');

  // The numbers under the time on the sideways card, in the order the tall card has them.
  const stats: SidewaysStat[] = [
    far ? { key: 'far', value: far.value, part: far.value < 10 ? 'dec1' : 'int', label: far.unit } : null,
    hr ? { key: 'max', value: session.maxHr!, label: 'max bpm' } : null,
    hr && session.avgHr ? { key: 'avg', value: session.avgHr, label: 'avg bpm' } : null,
    strain != null ? { key: 'strain', value: strain, part: 'dec1', label: 'Strain' } : null,
    kcal ? { key: 'kcal', value: kcal, label: 'cal' } : null,
  ].filter((s): s is SidewaysStat => !!s);

  const body = height != null ? (
    <Sideways
      session={session}
      look={look}
      width={width}
      height={height}
      play={play}
      top={shownTop}
      result={result}
      score={score}
      stats={stats}
      zones={zones}
      lead={lead}
      more={list.length - 1}
      vs={vs}
      source={tracker && showSource ? sourceLabel(session.source ?? 'apple-health') : null}
    />
  ) : (
    <View collapsable={false} style={[styles.card, { width, aspectRatio: aspect, borderRadius: round, padding: pad, paddingTop: inset ? inset.top : pad, paddingBottom: inset ? inset.bottom : pad, backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark && round > 0 ? 1 : 0 }]}>
      <CardWash look={look} radius={round} edge={round > 0} />
      {/* The faint court is tennis's: a run or the gym has none. */}
      {session.kind === 'fitness' || session.workout ? null : <CourtLines color={look.lines} />}
      <View style={styles.top}>
        <Reanimated.Text key={shownTop} entering={picture ? undefined : FadeIn.duration(160)} style={{ ...font('600'), fontSize: small(11.5, 9), letterSpacing: Math.max(0.8, 1.1 * k), color: look.eyebrow, flex: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {shownTop}
        </Reanimated.Text>
        {result ? (
          <Pop token={result} style={[styles.pill, { height: small(26, 20), borderRadius: small(13, 10), paddingHorizontal: small(11, 8), backgroundColor: look.pillFill }]}>
            <Text style={{ ...font('700'), fontSize: small(13, 10), color: look.pillInk }} maxFontSizeMultiplier={1.2}>{result}</Text>
          </Pop>
        ) : null}
      </View>
      <Reanimated.View layout={picture ? undefined : LinearTransition.duration(220)} style={[styles.middle, { justifyContent: health && !tall ? 'flex-start' : 'center', paddingTop: health && !tall ? 18 * k : 0 }]}>
        <Duration minutes={session.minutes} size={96 * k} color={look.figure} unitColor={look.muted} play={play} delay={120} duration={700} />
        <Text style={{ ...font('500'), fontSize: small(14, 10), color: look.muted, marginTop: 2 * k }} maxFontSizeMultiplier={1.2}>{onCourtWord(session)}</Text>
        {score ? (
          <Text style={{ ...font('700'), fontSize: 26 * k, letterSpacing: -0.4 * k, color: look.figure, fontVariant: ['tabular-nums'], marginTop: 8 * k }} numberOfLines={1} maxFontSizeMultiplier={1.2}>{score}</Text>
        ) : null}
        {far ? (
          <View style={{ marginTop: 8 * k }}>
            <Figure value={far.value} part={far.value < 10 ? 'dec1' : 'int'} unit={far.unit} baseline size={30 * k} color={look.figure} unitColor={look.muted} unitScale={0.46} play={play} delay={160} />
          </View>
        ) : null}
        {place ? (
          <View style={[styles.place, { gap: 4 * k, marginTop: 8 * k }]}>
            <Ionicons name="location-outline" size={small(13, 10)} color={look.muted} />
            <Text style={{ ...font('500'), fontSize: small(13, 10), color: look.muted, flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>{place}</Text>
          </View>
        ) : null}
        {health ? (
          <Reanimated.View entering={picture ? undefined : FadeIn.duration(220)} exiting={picture ? undefined : FadeOut.duration(160)} style={{ marginTop: 20 * k }}>
            {hr ? (
              <View style={[styles.hrRow, { gap: 26 * k }]}>
                <Figure value={session.maxHr!} unit="max bpm" size={38 * k} color={look.figure} unitColor={look.muted} unitScale={0.33} play={play} delay={200} />
                {session.avgHr ? <Figure value={session.avgHr} unit="avg" size={38 * k} color={look.figure} unitColor={look.muted} unitScale={0.33} play={play} delay={200} /> : null}
              </View>
            ) : null}
            {zones ? <ZoneBar zones={zones} colors={look.zones} height={10 * k} play={play} delay={200} duration={600} style={{ marginTop: hr ? 14 * k : 0 }} /> : null}
            {strain != null || kcal ? (
              <View style={[styles.hrRow, { gap: 22 * k, marginTop: hr || zones ? 12 * k : 0 }]}>
                {strain != null ? <Figure value={strain} part="dec1" baseline unit="Strain" size={24 * k} color={look.figure} unitColor={look.muted} unitScale={0.46} play={play} delay={260} /> : null}
                {kcal ? <Figure value={kcal} baseline unit="cal" size={24 * k} color={look.figure} unitColor={look.muted} unitScale={0.46} play={play} delay={260} /> : null}
              </View>
            ) : null}
          </Reanimated.View>
        ) : null}
      </Reanimated.View>
      <View style={styles.foot}>
        {lead ? (
          <View style={[styles.who, lead.pending && styles.pending]}>
            <Avatar name={lead.name} seed={lead.id} size={Math.round(26 * k)} />
            <Text style={{ ...font('600'), fontSize: small(14, 10), color: look.ink, flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {vs} @{lead.handle}{list.length > 1 ? ` +${list.length - 1}` : ''}
            </Text>
            {/* The clock alone didn't say what it meant: a quiet word after it (Oct 4, owner). */}
            {lead.pending ? (
              <View style={[styles.waiting, { gap: 3 * k }]}>
                <Ionicons name="time-outline" size={13 * k} color={look.muted} />
                <Text style={{ ...font('500'), fontSize: small(12, 9), color: look.muted }} maxFontSizeMultiplier={1.2}>waiting</Text>
              </View>
            ) : null}
          </View>
        ) : <View style={{ flex: 1 }} />}
        {tracker && showSource ? <Text style={{ ...font('600'), fontSize: small(11, 9), color: look.faint }} maxFontSizeMultiplier={1.2}>{sourceLabel(session.source ?? 'apple-health')}</Text> : null}
      </View>
      {brand ? (
        <View style={[styles.brand, { gap: 6 * k, marginTop: 14 * k, paddingTop: 12 * k, borderTopColor: look.lines }]}>
          <BrandMark size={Math.round(small(17, 12))} color={look.figure} />
          <Text style={{ ...font('600'), fontSize: small(14, 10), letterSpacing: -0.35 * k, color: look.ink }} maxFontSizeMultiplier={1}>CourtSide</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ ...font('500'), fontSize: small(11, 9), color: look.faint }} maxFontSizeMultiplier={1}>courtsidebase.com</Text>
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityRole="summary" accessibilityLabel={spoken}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={accessibilityHint ?? 'Opens the stats'} onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}>
      {body}
    </Pressable>
  );
}

/** One number under the time on the sideways card, and its name. */
type SidewaysStat = { key: string; value: number; part?: 'int' | 'dec1'; label: string };

/**
 * The session card sideways (the feed's post, Oct 6): the same box, wash,
 * colours and type as the tall card, laid out for a wide box. What it was
 * and when along the top, the time big under it, then the other numbers in
 * one row of equal columns, every figure the same size with its name under
 * it (the tall card's mix of sizes read as jumbled here, owner Oct 6), the
 * zones under them, and who and where the numbers came from along the
 * bottom. `height` is whatever the page has room for: everything is drawn
 * to the scale that fits both ways (358 wide by about 250 tall is 1).
 */
function Sideways({ session, look, width, height, play, top, result, score, stats, zones, lead, more, vs, source }: {
  session: SessionDetail;
  look: CardLook;
  width: number;
  height: number;
  play: boolean;
  top: string;
  result: string | null;
  score: string | null;
  stats: SidewaysStat[];
  zones: number[] | null;
  lead: CardPerson | undefined;
  more: number;
  vs: string;
  source: string | null;
}) {
  const round = Math.round(20 * (width / 358));
  // The small words keep a size you can read when the card is drawn small; the figures scale freely.
  const smallAt = (k: number, size: number, floor: number) => Math.max(floor, size * k);
  const line = (size: number) => Math.round(size * 1.3);
  const foot = !!lead || !!source;
  // How tall everything is at scale k, so the scale can be the one that fits.
  const needAt = (k: number) =>
    2 * 18 * k
    + (result ? smallAt(k, 26, 20) : line(smallAt(k, 11.5, 9)))
    + 12 * k
    + Math.round(64 * k * 1.08)
    + line(smallAt(k, 14, 10)) + 2 * k
    + (score ? 6 * k + Math.round(22 * k * 1.25) : 0)
    + (stats.length ? 14 * k + 1 + 10 * k + Math.round(26 * k * 1.1) + 2 * k + line(smallAt(k, 12, 10)) : 0)
    + (zones ? 12 * k + 8 * k : 0)
    + (foot ? 14 * k + (lead ? Math.max(Math.round(26 * k), line(smallAt(k, 14, 10))) : line(smallAt(k, 11, 9))) : 0);
  let k = width / 358;
  for (let i = 0; i < 3; i++) k = Math.min(width / 358, (k * height) / needAt(k));
  // Room left over goes mostly to the time, up to about the tall card's size, so a
  // card with few numbers (drills, a practice with none shared) is not mostly empty.
  const hero = Math.max(64 * k, Math.min(64 * k + (Math.max(0, height - needAt(k)) * 0.6) / 1.08, 92 * (width / 358)));
  const small = (size: number, floor: number) => smallAt(k, size, floor);
  const pad = Math.round(18 * k);
  return (
    <View collapsable={false} style={[styles.card, { width, height, borderRadius: round, paddingHorizontal: Math.round(20 * k), paddingVertical: pad, backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark ? 1 : 0 }]}>
      <CardWash look={look} radius={round} />
      {/* The faint court is tennis's: a run or the gym has none. */}
      {session.kind === 'fitness' || session.workout ? null : <CourtLines color={look.lines} />}
      <View style={styles.top}>
        <Text style={{ ...font('600'), fontSize: small(11.5, 9), lineHeight: line(small(11.5, 9)), letterSpacing: Math.max(0.8, 1.1 * k), color: look.eyebrow, flex: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {top}
        </Text>
        {result ? (
          <Pop token={result} style={[styles.pill, { height: small(26, 20), borderRadius: small(13, 10), paddingHorizontal: small(11, 8), backgroundColor: look.pillFill }]}>
            <Text style={{ ...font('700'), fontSize: small(13, 10), color: look.pillInk }} maxFontSizeMultiplier={1.2}>{result}</Text>
          </Pop>
        ) : null}
      </View>
      <View style={[styles.middle, styles.sidewaysMiddle, { paddingTop: 12 * k, paddingBottom: foot ? 14 * k : 0 }]}>
        <Duration minutes={session.minutes} size={hero} color={look.figure} unitColor={look.muted} play={play} delay={120} duration={700} />
        <Text style={{ ...font('500'), fontSize: small(14, 10), lineHeight: line(small(14, 10)), color: look.muted, marginTop: 2 * k }} maxFontSizeMultiplier={1.2}>{onCourtWord(session)}</Text>
        {score ? (
          <Text style={{ ...font('700'), fontSize: 22 * k, lineHeight: Math.round(22 * k * 1.25), letterSpacing: -0.4 * k, color: look.figure, fontVariant: ['tabular-nums'], marginTop: 6 * k }} numberOfLines={1} maxFontSizeMultiplier={1.2}>{score}</Text>
        ) : null}
        {stats.length ? (
          <View style={[styles.statRow, { gap: 10 * k, marginTop: 14 * k, paddingTop: 10 * k, borderTopColor: look.lines }]}>
            {stats.map((s) => (
              <View key={s.key} style={styles.stat}>
                <Figure value={s.value} part={s.part} size={26 * k} color={look.figure} unitColor={look.muted} play={play} delay={200} />
                <Text style={{ ...font('500'), fontSize: small(12, 10), lineHeight: line(small(12, 10)), color: look.muted, marginTop: 2 * k }} numberOfLines={1} maxFontSizeMultiplier={1.2}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {zones ? <ZoneBar zones={zones} colors={look.zones} height={8 * k} play={play} delay={200} duration={600} style={{ marginTop: 12 * k }} /> : null}
      </View>
      {foot ? (
        <View style={styles.foot}>
          {lead ? (
            <View style={[styles.who, lead.pending && styles.pending]}>
              <Avatar name={lead.name} seed={lead.id} size={Math.round(26 * k)} />
              <Text style={{ ...font('600'), fontSize: small(14, 10), color: look.ink, flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {vs} @{lead.handle}{more > 0 ? ` +${more}` : ''}
              </Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          {source ? <Text style={{ ...font('600'), fontSize: small(11, 9), lineHeight: line(small(11, 9)), color: look.faint }} maxFontSizeMultiplier={1.2}>{source}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** A court seen from behind the baseline, faint, across the bottom of the card. */
function CourtLines({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.lines}>
      <Svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none">
        {[
          [-6, 24, 20, 0], [106, 24, 80, 0], [20, 0, 80, 0], [4, 24, 25, 0], [96, 24, 75, 0], [10, 11, 90, 11], [50, 0, 50, 11],
        ].map(([x1, y1, x2, y2], i) => <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1 },
  sidewaysMiddle: { justifyContent: 'center', minHeight: 0 },
  statRow: { flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: 1 },
  stat: { flex: 1, minWidth: 0 },
  hrRow: { flexDirection: 'row', alignItems: 'flex-end' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  pending: { opacity: 0.6 },
  waiting: { flexDirection: 'row', alignItems: 'center' },
  lines: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%' },
  place: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  brand: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1 },
});
