import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { ShadedMark } from '@/components/share/ShadedMark';
import type { SessionDetail } from '@/data/types';
import { postShare } from '@/features/activity/healthShare';
import { postZones, ZONE_NAMES, zoneColors } from '@/features/activity/zones';
import { duration } from '@/lib/format';
import { colors, font } from '@/theme';

/*
 * The "Heart rate" share design (Oct 10, owner: "You know how Strava has
 * multiple formats . Let's do one where there's the bars with heart rate",
 * then "Horizontal bars with maybe total time and calories on top"; of the
 * three takes, "I like the peak moderate hard etc", with the time and
 * calories labelled on top as the Overlay has them).
 *
 * Over your photo, like the Overlay, from the top:
 * - the session's time and calories as the headline pair, a small "Time" and
 *   "Calories" over each big white number ("1,197": a thousands comma);
 * - one row per heart-rate zone, Peak at the top as the session's own zone
 *   rows read: its name, a bar on a faint track as long as its minutes
 *   against the biggest zone, its minutes;
 * - the average and top heart rate in one small line;
 * - the CourtSide lockup, the Overlay's own size, so every format carries one
 *   logo.
 * The zone rows are a third bigger than the first takes', so the names and
 * minutes read on a phone. White words with a soft dark shadow and the zones
 * in the app's own ramp, solid (zoneColors 'story': Easy white, Moderate the
 * logo's bright colour, Peak deeper), so it reads on any photo. Centred a
 * touch below the middle of what Instagram leaves clear (its bars cover
 * about the top 13% and the foot 17%), all of it inside.
 *
 * Only drawn for a post that shares both its zones and its heart rate
 * (heartRateOf): the post carries only the numbers its author chose under
 * "Share health data", off by default for anyone not known to be an adult
 * (healthShare.ts, migration 72), so nothing here can show more than the
 * post does. Calories only when the post shares them too.
 *
 * Every shadow is one the saved picture keeps: text shadows (each word set
 * twice, a wide soft shadow under a tight edge) and, under the bars, drawn
 * rings of fading dark rather than a box shadow, which neither the browser's
 * picture-maker nor Android's snapshot keeps.
 *
 * Sizes are in units of a 360-wide story (`u`), as SessionStoryArt draws.
 */

/** What the design draws: the post's own numbers, only when it shares both its zones and its heart rate. */
export interface HeartNumbers {
  /** Minutes per zone, easiest first. */
  zones: number[];
  avgHr?: number;
  maxHr?: number;
  minutes: number;
  kcal?: number;
}

export function heartRateOf(s: SessionDetail | undefined): HeartNumbers | null {
  const zones = postZones(s);
  if (!s || !zones || (!s.avgHr && !s.maxHr)) return null;
  const shared = postShare(s);
  if (!shared.includes('zones') || !shared.includes('hr')) return null;
  return {
    zones,
    avgHr: s.avgHr || undefined,
    maxHr: s.maxHr || undefined,
    minutes: s.minutes,
    kcal: shared.includes('kcal') && s.kcal ? s.kcal : undefined,
  };
}

/** "1,197": a thousands comma, the same on every phone. */
const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ------------------------------------------------------------------ sizes */

/** The headline: the label over the number, and the space between the time and the calories. */
const HEAD = { label: 16, value: 40, gap: 46 };
/**
 * The zone rows: the whole block's width, the name and minutes columns at
 * either end of the track, the gap either side of it, the bar's thickness,
 * one row's height and the words' size ("Moderate" and "240m" fit their
 * columns at 16). "Moderate" fills its column to within about 2%, so the
 * columns are least widths, not fixed ones: a phone that measures a word a
 * hair wider (Android's small preview) moves the row a hair over rather than
 * breaking the word onto a second line over the next row.
 */
const ROWS = { width: 316, name: 76, minutes: 50, gap: 12, bar: 13, row: 30, text: 16 };
/** Space between the parts: headline to the bars, bars to the heart-rate line, that line to the logo. */
const GAPS = { bars: 20, beat: 14, logo: 24 };
/** The logo, exactly as the Overlay sets it (SessionStoryArt). */
const LOGO = { mark: 33, word: 30 };

/** What Instagram leaves clear on a 360 × 640 story, and how far below its middle the block's middle sits. */
const CLEAR = { top: 83, bottom: 531 };
const LOWER = 14;

/* ------------------------------------------------------------------ shadows */

type Shade = { a: number; dy: number; r: number };
type Shadow = { wide: Shade; tight: Shade };
const textShade = (s: Shade, u: number): TextStyle => ({ textShadowColor: `rgba(0,0,0,${s.a})`, textShadowOffset: { width: 0, height: s.dy * u }, textShadowRadius: s.r * u });
/** The big numbers: a wide soft lift and a tight edge, so they hold on a bright court. */
const BIG: Shadow = { wide: { a: 0.34, dy: 2, r: 12 }, tight: { a: 0.26, dy: 0.6, r: 1.6 } };
/** Small words. */
const SMALL: Shadow = { wide: { a: 0.36, dy: 1, r: 6 }, tight: { a: 0.3, dy: 0.5, r: 1.2 } };
/** Under a bar: rings of fading dark, a touch below, as the words' shadow falls. */
const RINGS = [
  { spread: 0.8, a: 0.14 },
  { spread: 2, a: 0.09 },
  { spread: 3.4, a: 0.06 },
  { spread: 5, a: 0.04 },
];
const DROP = 0.8;
/** The faint track behind a bar: no shadow of its own, so it never reads as a slot or a box. */
const TRACK = 'rgba(255,255,255,0.16)';

/** A line of white words with both shadows: set twice, the tight edge over the wide one. */
function Words({ children, style, shadow, u }: { children: string; style: StyleProp<TextStyle>; shadow: Shadow; u: number }) {
  return (
    <View>
      <Text allowFontScaling={false} style={[style, textShade(shadow.wide, u)]}>{children}</Text>
      <Text allowFontScaling={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[style, textShade(shadow.tight, u), StyleSheet.absoluteFill]}>{children}</Text>
    </View>
  );
}

/** A rounded bar's shadow: drawn rings, `w` long. */
function Rings({ w, h, u }: { w: number; h: number; u: number }) {
  return (
    <>
      {RINGS.map((r) => (
        <View
          key={r.spread}
          style={{
            position: 'absolute',
            left: -r.spread * u,
            top: (DROP - r.spread) * u,
            width: w + 2 * r.spread * u,
            height: h + 2 * r.spread * u,
            borderRadius: h / 2 + r.spread * u,
            backgroundColor: `rgba(0,0,0,${r.a})`,
          }}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ the design */

export function HeartRateOverlay({ hr, width }: { hr: HeartNumbers; width: number }) {
  const u = width / 360;
  const height = (width * 16) / 9;
  const fills = zoneColors('story');
  const top = Math.max(1, ...hr.zones);
  const trackW = (ROWS.width - ROWS.name - ROWS.minutes - 2 * ROWS.gap) * u;
  const bar = ROWS.bar * u;

  const time = duration(hr.minutes);
  const kcal = hr.kcal ? grouped(hr.kcal) : null;
  const beat = [hr.avgHr ? `Avg ${hr.avgHr}` : null, hr.maxHr ? `Max ${hr.maxHr}` : null].filter(Boolean).join('  ·  ') + ' bpm';
  const spoken = `${time}${kcal ? `, ${kcal} calories` : ''}. Heart rate zones: ${ZONE_NAMES.map((z) => { const m = hr.zones[z.n - 1]; return `${z.name} ${m} ${m === 1 ? 'minute' : 'minutes'}`; }).join(', ')}. ${beat.replace('bpm', 'beats a minute')}.`;

  const valueStyle: TextStyle = { ...font('700'), color: '#FFFFFF', fontSize: HEAD.value * u, lineHeight: HEAD.value * 1.16 * u, letterSpacing: -0.012 * HEAD.value * u, textAlign: 'center' };
  const labelStyle: TextStyle = { ...font('600'), color: '#FFFFFF', fontSize: HEAD.label * u, lineHeight: HEAD.label * 1.3 * u, textAlign: 'center' };
  const small: TextStyle = { ...font('600'), color: '#FFFFFF', fontSize: ROWS.text * u, lineHeight: ROWS.text * 1.3 * u };
  // The minutes a step bolder than the zones' names: the numbers are what is read.
  const num: TextStyle = { ...small, ...font('700'), fontVariant: ['tabular-nums'], textAlign: 'right' };

  const stat = (value: string, label: string) => (
    <View key={label} style={styles.centre}>
      <Words style={labelStyle} shadow={SMALL} u={u}>{label}</Words>
      <Words style={valueStyle} shadow={BIG} u={u}>{value}</Words>
    </View>
  );

  return (
    <View collapsable={false} accessible accessibilityRole="image" accessibilityLabel={spoken} style={{ width, height }}>
      <View style={[styles.centre, { position: 'absolute', left: 0, right: 0, top: CLEAR.top * u, bottom: (640 - CLEAR.bottom) * u, paddingTop: LOWER * 2 * u }]}>
        {/* The headline pair: the time and the calories, each labelled above, as the Overlay has them. */}
        <View style={[styles.pair, { gap: HEAD.gap * u }]}>
          {stat(time, 'Time')}
          {kcal ? stat(kcal, 'Calories') : null}
        </View>

        {/* One row per zone, Peak at the top: its name, its bar on a faint track, its minutes. */}
        <View style={{ width: ROWS.width * u, marginTop: GAPS.bars * u }}>
          {ZONE_NAMES.map((z) => {
            const m = hr.zones[z.n - 1];
            const fillW = m > 0 ? Math.max(bar, (m / top) * trackW) : 0;
            return (
              <View key={z.n} style={[styles.row, { height: ROWS.row * u, gap: ROWS.gap * u }]}>
                <View style={[styles.end, { minWidth: ROWS.name * u }]}>
                  <Words style={[small, { textAlign: 'right' }]} shadow={SMALL} u={u}>{z.name}</Words>
                </View>
                <View style={{ width: trackW, height: bar }}>
                  {fillW ? <Rings w={fillW} h={bar} u={u} /> : null}
                  <View style={[styles.bar, { width: trackW, height: bar, borderRadius: bar / 2, backgroundColor: TRACK }]} />
                  {fillW ? <View style={[styles.bar, { width: fillW, height: bar, borderRadius: bar / 2, backgroundColor: fills[z.n - 1] }]} /> : null}
                </View>
                <View style={[styles.end, { minWidth: ROWS.minutes * u }]}>
                  <Words style={num} shadow={SMALL} u={u}>{`${m}m`}</Words>
                </View>
              </View>
            );
          })}
        </View>

        {/* The average and top heart rate, in the rows' size. */}
        <View style={{ marginTop: GAPS.beat * u }}>
          <Words style={[small, { textAlign: 'center' }]} shadow={SMALL} u={u}>{beat}</Words>
        </View>

        {/* The lockup, in the logo's bright colour with today's soft dark shadow, the same size as the
            Overlay's (Oct 9, owner: "lets just make it bigger more prominent"), so every format carries one logo. */}
        <View style={[styles.lockup, { gap: 8 * u, marginTop: GAPS.logo * u }]}>
          <ShadedMark size={LOGO.mark * u} u={u} color={colors.brandBright} halo="dark" weight={1.5} sideWeight={1.05} />
          <Text
            allowFontScaling={false}
            style={[styles.word, { fontSize: LOGO.word * u, lineHeight: LOGO.word * 1.2 * u, letterSpacing: -0.03 * LOGO.word * u, color: colors.brandBright }, textShade({ a: 0.55, dy: 0.8, r: 7 }, u)]}
          >
            CourtSide
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  // A name or minutes column: its words against the track's side, never wrapped (see ROWS).
  end: { alignItems: 'flex-end', flexShrink: 0 },
  bar: { position: 'absolute', left: 0, top: 0 },
  lockup: { flexDirection: 'row', alignItems: 'center' },
  // Inter ExtraBold, as today's Overlay sets the wordmark (Oct 9, owner).
  word: { ...font('900') },
});
