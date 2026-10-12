import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { durationParts, spokenDuration } from '@/features/activity/format';
import { font, numFont, numberFace } from '@/theme';
import { CountUp } from './CountUp';

const INTER_CENTRE = 0.3633;
/** The headline's small units sit just off the figures' baseline: 0.1 of the size up from the floor in Inter, 0.028 over the baseline. */
const HEADLINE_RAISE = 0.028;

/**
 * How far to lift a small unit so it sits on its figure's baseline, both
 * bottom-aligned (the glyphs centred in each line box): Inter's ascent 0.969
 * and descent 0.242 of the size put its baseline 0.3633 of the size below
 * the box's middle, the number face's 0.4 (theme numberFace.centre), each
 * given for the figure's face and the unit's. `raise` lifts the unit that
 * much more, as a share of the figure's size.
 */
const lift = (size: number, lineHeight: number, unit: number, unitLine: number, centre = INTER_CENTRE, raise = 0, unitCentre = centre) =>
  Math.max(0, Math.round((lineHeight / 2 - centre * size) + raise * size - (unitLine / 2 - unitCentre * unit)));

/**
 * Inter (the words' face), or the number face for scores and stats in the
 * app (Oct 12, owner: "ship 8 as well"). Inter stays the default: the share
 * pictures draw these too, and they stay exactly as they are.
 */
export type NumberFace = 'text' | 'num';

/**
 * A session's time as the headline: big figures, small units ("1h 24m"),
 * the figures counting up when `play` turns on. Figures at weight 600 and
 * pulled tight; units 0.4 of their size, weight 500, in a quieter ink.
 * One sentence for a screen reader ("1 hour 24 minutes").
 */
export function Duration({ minutes, size, color, unitColor, play = false, delay = 0, duration = 700, style, maxGrow = 1.2, unitScale, face = 'text' }: {
  minutes: number;
  size: number;
  color: string;
  unitColor: string;
  play?: boolean;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  maxGrow?: number;
  /** Units as a share of the figures' size, set on their baseline ("2h 08m" read as one line); leave it off for the headline's small units. */
  unitScale?: number;
  /** 'num': the figures and their units in the number face. */
  face?: NumberFace;
}) {
  const parts = durationParts(minutes);
  const num = face === 'num';
  const unit = Math.round(size * (unitScale ?? 0.4));
  const unitLine = Math.round(unit * 1.25);
  const line = Math.round(size * 1.08);
  const figure = num
    ? { ...numFont('600'), fontSize: size, lineHeight: line, letterSpacing: numberFace.tracking * size, color }
    : { ...font('600'), fontSize: size, lineHeight: line, letterSpacing: -0.055 * size, color, ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums' as const] } : {}) };
  // The headline's units just off the baseline, where they always sat; given a unitScale, on it.
  const unitFloor = num
    ? lift(size, line, unit, unitLine, numberFace.centre, unitScale == null ? HEADLINE_RAISE : 0)
    : unitScale == null ? Math.round(size * 0.1) : lift(size, line, unit, unitLine);
  const unitStyle = { ...(num ? numFont('500') : font('500')), fontSize: unit, lineHeight: unitLine, color: unitColor, marginBottom: unitFloor, marginLeft: Math.max(1, Math.round(size * (num ? 0.02 : 0.03))) };
  return (
    <View style={[styles.row, style]} accessible accessibilityRole="text" accessibilityLabel={spokenDuration(minutes)}>
      {parts.map((p, i) => (
        <React.Fragment key={p.u}>
          <CountUp
            // Hours and minutes count as one clock rolling forward from the
            // first hour (Oct 6, owner): "2h 04m" runs 1h 00m → 1h 59m → 2h 00m
            // → 2h 04m, so there is something to watch. Under an hour it is
            // just the minutes counting up.
            value={Math.round(minutes)}
            from={parts.length === 1 ? 0 : 60}
            part={parts.length === 1 ? 'int' : p.u === 'h' ? 'clockHours' : 'clockMinutes2'}
            play={play}
            delay={delay}
            duration={parts.length === 1 ? duration : Math.max(duration, 1100)}
            style={[figure, i > 0 ? { marginLeft: Math.round(size * 0.12) } : null]}
            maxFontSizeMultiplier={maxGrow}
          />
          <Text style={unitStyle} maxFontSizeMultiplier={maxGrow}>{p.u}</Text>
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * About how wide the headline Duration is in the number face at `size`
 * ("1h 30m" is 2.2 of it), so a card can keep room beside it: Barlow Semi
 * Condensed's figures 0.507 of the size, "h" 0.491 and "m" 0.747 at the
 * units' 0.4, the space between the parts 0.12.
 */
export function durationWidth(minutes: number, size: number): number {
  const parts = durationParts(minutes);
  const em = parts.reduce((sum, p, i) => sum + p.n.length * 0.507 + (p.u === 'h' ? 0.491 : 0.747) * 0.4 + 0.02 + (i > 0 ? 0.12 : 0), 0);
  return em * size;
}

/** A plain figure with its small unit after it ("171 bpm"), counting up like the time. */
export function Figure({ value, unit, size, color, unitColor, play = false, delay = 0, duration = 700, part = 'int', maxGrow = 1.2, unitScale = 0.4, baseline = false, face = 'text' }: {
  value: number;
  unit?: string;
  size: number;
  color: string;
  unitColor: string;
  play?: boolean;
  delay?: number;
  duration?: number;
  part?: 'int' | 'dec1';
  maxGrow?: number;
  unitScale?: number;
  /** The unit on the figure's baseline, rather than the headline's small raised-off-the-floor unit. */
  baseline?: boolean;
  /** 'num': the figure in the number face; its unit is a word ("bpm", "cal") and stays in Inter. */
  face?: NumberFace;
}) {
  // A floor so a unit stays readable, but never bigger than its number on a small card (Oct 4: "333 cal" on the story's corner card).
  const u = Math.round(Math.max(Math.min(10, size * 0.6), size * unitScale));
  const line = Math.round(size * 1.1);
  const uLine = Math.round(u * 1.25);
  const num = face === 'num';
  const unitFloor = num
    ? lift(size, line, u, uLine, numberFace.centre, baseline ? 0 : HEADLINE_RAISE, INTER_CENTRE)
    : baseline ? lift(size, line, u, uLine) : Math.round(size * 0.1);
  return (
    <View style={styles.row}>
      <CountUp value={value} part={part} play={play} delay={delay} duration={duration} maxFontSizeMultiplier={maxGrow}
        style={num
          ? { ...numFont('600'), fontSize: size, lineHeight: line, letterSpacing: numberFace.tracking * size, color }
          : { ...font('600'), fontSize: size, lineHeight: line, letterSpacing: -0.04 * size, color }} />
      {unit ? <Text maxFontSizeMultiplier={maxGrow} style={{ ...font('500'), fontSize: u, lineHeight: uLine, color: unitColor, marginLeft: baseline ? Math.max(3, Math.round(size * 0.2)) : Math.max(3, Math.round(size * 0.1)), marginBottom: unitFloor }}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
