import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { durationParts, spokenDuration } from '@/features/activity/format';
import { font } from '@/theme';
import { CountUp } from './CountUp';

/**
 * How far to lift a small unit so it sits on its figure's baseline, both
 * bottom-aligned in Inter (ascent 0.969, descent 0.242 of the size, the
 * glyphs centred in each line box).
 */
const lift = (size: number, lineHeight: number, unit: number, unitLine: number) =>
  Math.max(0, Math.round((lineHeight / 2 - 0.3633 * size) - (unitLine / 2 - 0.3633 * unit)));

/**
 * A session's time as the headline: big figures, small units ("1h 24m"),
 * the figures counting up when `play` turns on. Figures at weight 600 and
 * pulled tight; units 0.4 of their size, weight 500, in a quieter ink.
 * One sentence for a screen reader ("1 hour 24 minutes").
 */
export function Duration({ minutes, size, color, unitColor, play = false, delay = 0, duration = 700, style, maxGrow = 1.2, unitScale }: {
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
}) {
  const parts = durationParts(minutes);
  const unit = Math.round(size * (unitScale ?? 0.4));
  const unitLine = Math.round(unit * 1.25);
  const figure = { ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -0.055 * size, color, ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums' as const] } : {}) };
  const unitStyle = { ...font('500'), fontSize: unit, lineHeight: unitLine, color: unitColor, marginBottom: unitScale == null ? Math.round(size * 0.1) : lift(size, Math.round(size * 1.08), unit, unitLine), marginLeft: Math.max(1, Math.round(size * 0.03)) };
  return (
    <View style={[styles.row, style]} accessible accessibilityRole="text" accessibilityLabel={spokenDuration(minutes)}>
      {parts.map((p, i) => (
        <React.Fragment key={p.u}>
          <CountUp
            // Each part counts on its own ("1h 00m" up to "1h 24m"), so the
            // hours never read 0 and the minutes never wrap round past 59.
            value={parts.length === 1 ? Math.round(minutes) : Number(p.n)}
            part={parts.length === 1 ? 'int' : p.u === 'h' ? 'hours' : 'minutes2'}
            play={play}
            delay={delay}
            duration={duration}
            style={[figure, i > 0 ? { marginLeft: Math.round(size * 0.12) } : null]}
            maxFontSizeMultiplier={maxGrow}
          />
          <Text style={unitStyle} maxFontSizeMultiplier={maxGrow}>{p.u}</Text>
        </React.Fragment>
      ))}
    </View>
  );
}

/** A plain figure with its small unit after it ("171 bpm"), counting up like the time. */
export function Figure({ value, unit, size, color, unitColor, play = false, delay = 0, duration = 700, part = 'int', maxGrow = 1.2, unitScale = 0.4, baseline = false }: {
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
}) {
  // A floor so a unit stays readable, but never bigger than its number on a small card (Oct 4: "333 cal" on the story's corner card).
  const u = Math.round(Math.max(Math.min(10, size * 0.6), size * unitScale));
  const line = Math.round(size * 1.1);
  const uLine = Math.round(u * 1.25);
  return (
    <View style={styles.row}>
      <CountUp value={value} part={part} play={play} delay={delay} duration={duration} maxFontSizeMultiplier={maxGrow}
        style={{ ...font('600'), fontSize: size, lineHeight: line, letterSpacing: -0.04 * size, color }} />
      {unit ? <Text maxFontSizeMultiplier={maxGrow} style={{ ...font('500'), fontSize: u, lineHeight: uLine, color: unitColor, marginLeft: baseline ? Math.max(3, Math.round(size * 0.2)) : Math.max(3, Math.round(size * 0.1)), marginBottom: baseline ? lift(size, line, u, uLine) : Math.round(size * 0.1) }}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
