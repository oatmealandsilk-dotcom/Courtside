import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  label: string;
  /** 0-1 */
  value: number;
  caption?: string;
  tint?: string;
}

export function Meter({ label, value, caption, tint = colors.brand }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: pct, min: 0, max: 100 }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tint }]} />
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.smallStrong, color: colors.text },
  caption: { ...typography.small, color: colors.textMuted },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
