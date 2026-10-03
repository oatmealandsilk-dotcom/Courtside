import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { durationParts, spokenDuration } from '@/features/activity/format';
import { font } from '@/theme';
import { CountUp } from './CountUp';

/**
 * A session's time as the headline: big figures, small units ("1h 24m"),
 * the figures counting up when `play` turns on. Figures at weight 600 and
 * pulled tight; units 0.4 of their size, weight 500, in a quieter ink.
 * One sentence for a screen reader ("1 hour 24 minutes").
 */
export function Duration({ minutes, size, color, unitColor, play = false, delay = 0, duration = 700, style, maxGrow = 1.2 }: {
  minutes: number;
  size: number;
  color: string;
  unitColor: string;
  play?: boolean;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  maxGrow?: number;
}) {
  const parts = durationParts(minutes);
  const unit = Math.round(size * 0.4);
  const figure = { ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -0.055 * size, color, ...(Platform.OS === 'web' ? { fontVariant: ['tabular-nums' as const] } : {}) };
  const unitStyle = { ...font('500'), fontSize: unit, lineHeight: Math.round(unit * 1.25), color: unitColor, marginBottom: Math.round(size * 0.1), marginLeft: Math.max(1, Math.round(size * 0.03)) };
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
export function Figure({ value, unit, size, color, unitColor, play = false, delay = 0, duration = 700, part = 'int', maxGrow = 1.2, unitScale = 0.4 }: {
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
}) {
  const u = Math.max(10, Math.round(size * unitScale));
  return (
    <View style={styles.row}>
      <CountUp value={value} part={part} play={play} delay={delay} duration={duration} maxFontSizeMultiplier={maxGrow}
        style={{ ...font('600'), fontSize: size, lineHeight: Math.round(size * 1.1), letterSpacing: -0.04 * size, color }} />
      {unit ? <Text maxFontSizeMultiplier={maxGrow} style={{ ...font('500'), fontSize: u, lineHeight: Math.round(u * 1.25), color: unitColor, marginLeft: Math.max(3, Math.round(size * 0.1)), marginBottom: Math.round(size * 0.1) }}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
});
