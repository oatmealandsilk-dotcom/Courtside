import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (next: T) => void;
  scrollable?: boolean;
  /** Two pills per row, for four longer labels that would otherwise be cut short. */
  wrap?: boolean;
  /**
   * The chosen one's fill and words, when not the brand's (a sheet's form
   * fills its choice with ink, as its Chips do, keeping green for the one
   * thing to press). Read from the live `colors` as you draw.
   */
  tint?: string;
  ink?: string;
  /** Taller, with body-size words: the one choice on a short sheet (Start a session's kind). */
  large?: boolean;
  /** Picks one of a few (a kind, not a page): read out as radio buttons rather than tabs. */
  radio?: boolean;
  /** What the choice is, for a screen reader ("Type of session"). */
  accessibilityLabel?: string;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  scrollable = false,
  wrap = false,
  tint,
  ink,
  large = false,
  radio = false,
  accessibilityLabel,
}: Props<T>) {
  const styles = useThemedStyles(styleDefinitions);
  const items = segments.map((segment) => {
    const active = segment.value === value;
    return (
      <Pressable
        key={segment.value}
        onPress={() => onChange(segment.value)}
        accessibilityRole={radio ? 'radio' : 'tab'}
        accessibilityState={radio ? { checked: active } : { selected: active }}
        style={({ pressed }) => [styles.segment, large && styles.segmentLarge, wrap && styles.segmentWrapped, scrollable && styles.segmentLoose, active && styles.segmentActive, active && tint ? { backgroundColor: tint, borderColor: tint } : null, pressed && !active && styles.segmentPressed]}
      >
        <Text style={[styles.label, large && styles.labelLarge, scrollable && { flexShrink: 0 }, active && styles.labelActive, active && ink ? { color: ink } : null]} numberOfLines={1}>
          {segment.label}
        </Text>
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollTrack}
      >
        {items}
      </ScrollView>
    );
  }

  return <View accessibilityRole={radio ? 'radiogroup' : undefined} accessibilityLabel={accessibilityLabel} style={[styles.track, wrap && styles.trackWrapped]}>{items}</View>;
}

const styleDefinitions = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  scrollTrack: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  trackWrapped: { flexWrap: 'wrap', borderRadius: radius.lg },
  segment: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentLarge: { paddingVertical: 12 },
  segmentPressed: { opacity: 0.7 },
  // Half the row each, so two fit per line and none of the words get clipped.
  segmentWrapped: { flexBasis: '48%', flexGrow: 1 },
  // Loose in a scrolling row, each chip carries its own edge so it never looks like bare words.
  // Explicitly not allowed to shrink: in a sideways scroller the browser would otherwise squeeze the words to nothing.
  segmentLoose: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: 64, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { ...typography.smallStrong, color: colors.textMuted },
  labelActive: { color: colors.brandInk },
  labelLarge: { ...typography.bodyStrong },
});
