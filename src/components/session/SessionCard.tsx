import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { BrandMark } from '@/components/BrandMark';
import { Avatar, BrandWash, CreamWash } from '@/components/ui';
import type { ID, SessionDetail } from '@/data/types';
import { onCourtWord, resultWord, scoreLine, sessionEyebrow, sourceLabel, spokenDuration } from '@/features/activity/format';
import { spokenScore } from '@/features/activity/score';
import { sessionPeople } from '@/features/activity/sessionTags';
import { mixHex, postZones, zoneColors } from '@/features/activity/zones';
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
  /** The fade laid inside the box: the brand's own on a green box, the shirt's on a cream one, none on a dark page. */
  wash: 'brand' | 'cream' | null;
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
 * How a session box is coloured on this court. On a light page it is the
 * brand colour, with the brand's ink on it. On a dark page (New York, Night)
 * a full brand fill is too loud, so it is the page's raised surface with the
 * figures in the brand colour (owner, Oct 2).
 *
 * On the CourtSide court itself it is cream, not green (Oct 5, owner: "more
 * like our banner and our shirt"): the Classic shirt's cream with its soft
 * sage and clay fade, the figures, the eyebrow and the CourtSide lockup in
 * the brand green as on the banner, the small words in the page's muted ink
 * (the banner's "Growing the game"), and the result pill green with cream
 * words. The cream is the page's raised ground warmed with a touch of gold
 * (about #EAE3D2): as deep as it goes while the green still reads at 4.5:1
 * on it, so it holds as a box on the page with only a hairline round it.
 */
export function cardLook(theme: ThemeName): CardLook {
  if (pageIsDark()) {
    return {
      dark: true,
      wash: null,
      fill: colors.surface,
      border: colors.border,
      rim: null,
      figure: colors.brand,
      ink: colors.text,
      muted: colors.textMuted,
      faint: colors.textFaint,
      eyebrow: colors.textMuted,
      pillFill: colors.brand,
      pillInk: colors.brandInk,
      lines: withAlpha(colors.text, 0.08),
      zones: zoneColors('page'),
    };
  }
  if (theme === 'default') {
    return {
      dark: false,
      wash: 'cream',
      fill: mixHex(colors.bgElevated, colors.sun, 0.1),
      border: 'transparent',
      rim: withAlpha(colors.brand, 0.2),
      figure: colors.brand,
      ink: colors.brand,
      muted: colors.textMuted,
      faint: colors.textFaint,
      eyebrow: colors.brand,
      pillFill: colors.brand,
      pillInk: colors.brandInk,
      lines: withAlpha(colors.brand, 0.14),
      // A light box, so the page's zone colours: faint ink for the easy ones, rising to the full green.
      zones: zoneColors('page'),
    };
  }
  return {
    dark: false,
    wash: 'brand',
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

/**
 * The fade inside a session box, laid as its first child: the brand's wash in
 * a green box, the shirt's in a cream one (with its hairline, unless `edge` is
 * off for a picture drawn edge to edge), nothing on a dark page.
 */
export function CardWash({ look, radius, edge = true }: { look: CardLook; radius: number; edge?: boolean }) {
  if (look.wash === 'brand') return <BrandWash radius={radius} />;
  if (look.wash === 'cream') return <CreamWash radius={radius} rim={edge ? look.rim : null} />;
  return null;
}


/**
 * A session as a card: the post's picture when there is no photo, and the
 * session at the top of the composer. 4:5, the brand's colour (see cardLook),
 * with what it was and when, the time on court as the headline, heart rate
 * and its zones when shared, who it was against, and where the numbers came
 * from. `width` sets the scale: 358 is the feed's size, the composer's is
 * about two thirds of it.
 */
export function SessionCard({ session, width, play = false, people, hidden = [], onPress, showSource = true, accessibilityHint, aspect = 4 / 5, radius, eyebrow, place, brand = false, scale = 1, inset, picture = false, score: typedScore }: {
  session: SessionDetail;
  width: number;
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
  /**
   * The score as typed on the Share page, drawn in place of the log's own
   * (an empty one draws none), so the Card design follows the Score box as
   * the other designs do (Oct 5). Left out everywhere else: the log's score.
   */
  score?: string;
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
  // A match's score from the author's log (migration 91), under the time; on a share picture, the one typed there.
  const score = typedScore !== undefined ? typedScore.trim() || null : scoreLine(session);
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
    score ? (typedScore !== undefined ? score : spokenScore(session.sets)) : null,
    far ? `${far.value} miles` : null,
    hr ? `max heart rate ${session.maxHr}${session.avgHr ? `, average ${session.avgHr}` : ''}` : null,
    strain != null ? `Strain ${strain.toFixed(1)}` : null,
    kcal ? `${kcal} calories` : null,
    lead ? `${vs} @${lead.handle}${lead.pending ? ', waiting to accept' : ''}${list.length > 1 ? ` and ${list.length - 1} more` : ''}` : null,
    tracker && showSource ? sourceLabel(session.source ?? 'apple-health') : null,
  ].filter(Boolean).join('. ');

  const body = (
    <View collapsable={false} style={[styles.card, { width, aspectRatio: aspect, borderRadius: round, padding: pad, paddingTop: inset ? inset.top : pad, paddingBottom: inset ? inset.bottom : pad, backgroundColor: look.fill, borderColor: look.border, borderWidth: look.dark && round > 0 ? 1 : 0 }]}>
      <CardWash look={look} radius={round} edge={round > 0} />
      <CourtLines color={look.lines} />
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
  hrRow: { flexDirection: 'row', alignItems: 'flex-end' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  pending: { opacity: 0.6 },
  waiting: { flexDirection: 'row', alignItems: 'center' },
  lines: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%' },
  place: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  brand: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1 },
});
