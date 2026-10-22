import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/** One number on the strip: its name, its value, and maybe a small unit after it ("1" "h" "30" "m" as parts). */
export type StatItem = { label: string; parts: { value: string; unit?: string }[] };

/*
 * Up to three numbers in a row (design preview, Oct 22, ?sig=1 on the web
 * only), the way a training log lists them: the name small and quiet on top,
 * the number under it, equal columns split by hairlines. No boxes, pills or
 * fill. A missing number is left out, never shown as 0 or a dash.
 */
export function StatStrip({ items }: { items: StatItem[] }) {
  useTheme();
  const shown = items.filter((i) => i.parts.length).slice(0, 3);
  if (!shown.length) return null;
  return (
    <View style={styles.row}>
      {shown.map((it, i) => (
        <View
          key={it.label}
          accessible
          accessibilityLabel={`${it.label} ${it.parts.map((p) => `${p.value}${p.unit ?? ''}`).join(' ')}`}
          style={[styles.col, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingLeft: spacing.md }]}
        >
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[typography.caption, { textTransform: 'uppercase', color: colors.textFaint }]}>{it.label}</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={{ marginTop: spacing.xs }}>
            {it.parts.map((p, j) => (
              <React.Fragment key={j}>
                <Text style={[typography.title, styles.tab, { ...font('500'), color: colors.text }]}>{p.value}</Text>
                {p.unit ? <Text style={[typography.small, { color: colors.textMuted }]}>{p.unit}{j < it.parts.length - 1 ? ' ' : ''}</Text> : null}
              </React.Fragment>
            ))}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', marginVertical: spacing.md },
  col: { flex: 1, minWidth: 0, justifyContent: 'center', minHeight: 32 },
  tab: { fontVariant: ['tabular-nums'] },
});
