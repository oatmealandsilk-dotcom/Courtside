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
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  scrollable = false,
}: Props<T>) {
  const items = segments.map((segment) => {
    const active = segment.value === value;
    return (
      <Pressable
        key={segment.value}
        onPress={() => onChange(segment.value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[styles.segment, active && styles.segmentActive]}
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

  return <View style={styles.track}>{items}</View>;
}

const styles = StyleSheet.create({
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
  segment: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.brand },
  label: { ...typography.smallStrong, color: colors.textMuted },
  labelActive: { color: colors.brandInk },
});
