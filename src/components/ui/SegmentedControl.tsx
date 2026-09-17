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
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  scrollable = false,
  wrap = false,
}: Props<T>) {
  const styles = useThemedStyles(styleDefinitions);
  const items = segments.map((segment) => {
    const active = segment.value === value;
    return (
      <Pressable
        key={segment.value}
        onPress={() => onChange(segment.value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[styles.segment, wrap && styles.segmentWrapped, scrollable && styles.segmentLoose, active && styles.segmentActive]}
      >
        <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
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

  return <View style={[styles.track, wrap && styles.trackWrapped]}>{items}</View>;
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
  // Half the row each, so two fit per line and none of the words get clipped.
  segmentWrapped: { flexBasis: '48%', flexGrow: 1 },
  // Loose in a scrolling row, each chip carries its own edge so it never looks like bare words.
  segmentLoose: { flex: 0, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segmentActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { ...typography.smallStrong, color: colors.textMuted },
  labelActive: { color: colors.brandInk },
});
