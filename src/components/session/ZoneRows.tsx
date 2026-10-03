import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { ZONE_NAMES, zoneColors } from '@/features/activity/zones';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, font, withAlpha } from '@/theme';

/**
 * The zones as five rows, Peak at the top: the zone's number, our word for
 * it, a track with a fill as long as its share of the biggest zone, and the
 * minutes. No heart-rate ranges: WHOOP would have to share the player's own
 * zone limits for that, and it does not.
 */
export function ZoneRows({ zones, play = false, delay = 220 }: { zones: number[]; play?: boolean; delay?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const fills = zoneColors('page');
  const top = Math.max(1, ...zones);
  const spoken = ZONE_NAMES.map((z) => `${z.name} ${zones[z.n - 1]} minutes`).join(', ');
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`Heart rate zones: ${spoken}`}>
      {ZONE_NAMES.map((z, i) => (
        <View key={z.n} style={styles.row}>
          <Text style={styles.n} maxFontSizeMultiplier={1.2}>{z.n}</Text>
          <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>{z.name}</Text>
          <View style={[styles.track, { backgroundColor: withAlpha(colors.text, 0.06) }]}>
            <Fill share={zones[z.n - 1] / top} color={fills[z.n - 1]} play={play} delay={delay + i * 60} />
          </View>
          <Text style={styles.min} maxFontSizeMultiplier={1.2}>{zones[z.n - 1]}m</Text>
        </View>
      ))}
    </View>
  );
}

function Fill({ share, color, play, delay }: { share: number; color: string; play: boolean; delay: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(play && !reduced ? 0 : 1);
  useEffect(() => {
    if (!play || reduced) { p.value = 1; return; }
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, [play, reduced, delay, p]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, share)) * p.value * 100}%` }));
  return <Reanimated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, style]} />;
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', height: 26, gap: 10 },
  n: { ...font('600'), fontSize: 12, color: colors.textFaint, width: 10, fontVariant: ['tabular-nums'] },
  name: { ...font('500'), fontSize: 13, color: colors.text, width: 70 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  min: { ...font('600'), fontSize: 13, color: colors.text, minWidth: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
