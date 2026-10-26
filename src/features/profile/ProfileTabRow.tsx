import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, typography } from '@/theme';
import { TextScale, oneLine } from '@/theme/textScale';
import { compactNumber } from '@/lib/format';
import type { useTabUnderline } from '@/features/navigation/useTabUnderline';

/**
 * Which look the row of sections on a profile wears (All · Activity · Clips · Tagged, above the grid).
 * Oct 25, owner, circling the row on his own profile: "This part could look better idk how but it can".
 *
 *   'now'  today's row, unchanged: equal tabs, the count beside each word (the picked one's in the
 *          accent colour), a 3 pt accent line the full width of the tab.
 *   'A'    tighter: a shorter row, the counts quiet beside the word (never coloured), a short 3 pt
 *          accent line centred under the picked tab on the thin full-width line.
 *   'B'    stacked: the word with its count small and quiet under it, the picked word bold, and a
 *          3 pt line in the text colour (no accent), the way Instagram marks its tabs.
 *   'C'    segmented: one quiet track with the picked section raised on a plain card that slides,
 *          the way Apple's own section switches look; counts faint beside the word. No line.
 *
 * 'now' keeps the code that was there before, so nothing changes until this is switched.
 */
export type ProfileTabsLook = 'now' | 'A' | 'B' | 'C';
export const PROFILE_TABS_LOOK: ProfileTabsLook = 'now';

type Tab = { key: string; label: string; count: number };

type Props = {
  look: Exclude<ProfileTabsLook, 'now'>;
  tabs: readonly Tab[];
  selected: string;
  onPress: (key: string) => void;
  /** One tab's width, as measured by the row (0 until it is laid out). */
  tabWidth: number;
  onTabWidth: (width: number) => void;
  /** The line's glide (useTabUnderline().style) on the live page; left out for a still copy. */
  underlineStyle?: ReturnType<typeof useTabUnderline>['style'];
};

const SHORT_LINE = 28;

export function ProfileTabRow({ look, tabs, selected, onPress, tabWidth, onTabWidth, underlineStyle }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const index = Math.max(0, tabs.findIndex((t) => t.key === selected));
  // The marker rides in a box one tab wide, moved by the same glide as today's line.
  const place = underlineStyle ? [{ width: tabWidth }, underlineStyle] : [{ width: tabWidth, left: index * tabWidth }];
  const measure = (w: number) => onTabWidth(w / tabs.length);

  const words = (t: Tab, on: boolean) => {
    if (look === 'B') {
      return <View style={styles.stack}>
        <Text {...oneLine(TextScale.TITLE)} style={[typography.body, on ? styles.wordOn : styles.wordOff]}>{t.label}</Text>
        <Text {...oneLine(TextScale.CHROME)} style={styles.countUnder}>{compactNumber(t.count)}</Text>
      </View>;
    }
    return <Text {...oneLine(TextScale.TITLE)} style={[look === 'C' ? styles.segWord : typography.body, on ? styles.wordOn : styles.wordOff]}>
      {t.label}<Text style={[styles.countBeside, on && styles.countBesideOn]}>{'  '}{compactNumber(t.count)}</Text>
    </Text>;
  };

  const buttons = tabs.map((t) => {
    const on = t.key === selected;
    return <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}, ${t.count}`} onPress={() => onPress(t.key)} style={look === 'A' ? styles.tabA : look === 'B' ? styles.tabB : styles.tabC}>
      {words(t, on)}
    </Pressable>;
  });

  if (look === 'C') {
    return <View style={styles.track}>
      <View style={styles.trackRow} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        {tabWidth > 0 ? <Reanimated.View pointerEvents="none" style={[styles.thumb, ...place]} /> : null}
        {buttons}
      </View>
    </View>;
  }

  return <View style={styles.row} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
    {buttons}
    {tabWidth > 0 ? <Reanimated.View pointerEvents="none" style={[styles.lineBox, ...place]}>
      <View style={look === 'A' ? styles.lineShort : styles.lineFull} />
    </Reanimated.View> : null}
  </View>;
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', marginTop: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, zIndex: 1 },
  tabA: { flex: 1, alignItems: 'center', paddingTop: 13, paddingBottom: 14 },
  tabB: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 11 },
  tabC: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  wordOn: { ...font('600'), color: colors.text },
  wordOff: { color: colors.textMuted },
  stack: { alignItems: 'center', gap: 1 },
  countUnder: { ...font('400'), fontSize: 12, lineHeight: 16, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  countBeside: { ...font('400'), fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  countBesideOn: { color: colors.textMuted },
  lineBox: { position: 'absolute', left: 0, bottom: -1.5, height: 3, alignItems: 'center' },
  lineShort: { width: SHORT_LINE, height: 3, borderRadius: 1.5, backgroundColor: colors.brand },
  lineFull: { alignSelf: 'stretch', height: 3, borderRadius: 1.5, backgroundColor: colors.text },
  track: { marginTop: 16, marginBottom: 10, padding: 3, borderRadius: 11, backgroundColor: `${colors.text}10` },
  trackRow: { flexDirection: 'row' },
  thumb: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segWord: { ...font('400'), fontSize: 14 },
});
