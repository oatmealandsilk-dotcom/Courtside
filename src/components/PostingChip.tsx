import React, { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useEasedFraction, useUploadJob } from '@/lib/uploads';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, typography } from '@/theme';

/**
 * Your post on the feed while it is still going up: "Posting… 42%" over a
 * thin line filling underneath, standing in for the buttons it gets once it
 * has landed. Then a tick and "Posted" for a moment, and it fades away.
 *
 * Over a clip or an Instant it is a dark pill that reads on any picture; on a
 * photo post's own page it wears the page's colours, like the posting strip
 * it takes the place of. The figure is the strip's own, so the two never disagree.
 */
export function PostingChip({ id, onPicture = false, style }: { id: string; onPicture?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  const job = useUploadJob(id);
  const fraction = useEasedFraction(id);
  const done = job?.state === 'done';
  const fill = useSharedValue(fraction);
  const fade = useSharedValue(1);
  useEffect(() => { fill.value = withTiming(fraction, { duration: 60, easing: Easing.linear }); }, [fraction, fill]);
  useEffect(() => { if (done) fade.value = withDelay(1400, withTiming(0, { duration: 320 })); }, [done, fade]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  if (!job || job.state === 'failed') return null;
  const pct = Math.round(fraction * 100);
  return (
    <Reanimated.View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={done ? 'Posted' : 'Posting'}
      accessibilityValue={done ? undefined : { min: 0, max: 100, now: pct }}
      style={[styles.chip, onPicture ? styles.onPicture : styles.onPage, style, fadeStyle]}
    >
      <View style={styles.row}>
        {done ? <Ionicons name="checkmark-circle" size={15} color={onPicture ? '#FFFFFF' : colors.brand} /> : null}
        <Text style={[styles.label, onPicture && styles.labelOnPicture]}>{done ? 'Posted' : `Posting… ${pct}%`}</Text>
      </View>
      <View style={[styles.track, onPicture && styles.trackOnPicture]}>
        <Reanimated.View style={[styles.fill, onPicture && styles.fillOnPicture, fillStyle]} />
      </View>
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minWidth: 148, gap: 7, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderRadius: radius.md, overflow: 'hidden' },
  // The rail's own dark edge, made into a pill: readable on a bright court or a night match alike.
  onPicture: { backgroundColor: 'rgba(0,0,0,0.5)' },
  onPage: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  labelOnPicture: { color: '#FFFFFF' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  trackOnPicture: { backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 3, backgroundColor: colors.brand },
  // The same white line a clip's own progress wears.
  fillOnPicture: { backgroundColor: 'rgba(255,255,255,0.9)' },
});
