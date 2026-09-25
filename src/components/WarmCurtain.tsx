import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BrandMark } from '@/components/BrandMark';
import { setCurtainDown, useFeedWarm } from '@/features/feed/warmup';
import { colors, spacing, font } from '@/theme';

/**
 * The splash, kept up over the app until the feed's first pages are in, then
 * faded out once. It lives in the shell rather than on any one screen, so
 * the move from the splash route into the tabs happens underneath it.
 */
export function WarmCurtain() {
  useTheme();
  const warm = useFeedWarm();
  const [shown, setShown] = useState(!warm);
  const fade = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  useEffect(() => {
    if (!warm || !shown) return;
    fade.value = withTiming(0, { duration: 420 }, (finished) => { if (finished) { runOnJS(setShown)(false); runOnJS(setCurtainDown)(); } });
  }, [warm, shown, fade]);
  // Not shown at all (the feed was already warm): playback need not wait on it.
  useEffect(() => { if (!shown) setCurtainDown(); }, [shown]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents={warm ? 'none' : 'auto'} style={[styles.curtain, style]}>
      <View style={styles.brand}>
        <BrandMark size={84} />
        <Text style={styles.wordmark}>CourtSide</Text>
      </View>
      <Text style={styles.tagline}>Growing the game</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  brand: { alignItems: 'center', gap: spacing.md },
  wordmark: { fontSize: 34, ...font('700'), color: colors.brand, letterSpacing: -1 },
  // 96 points up, the same place the launch image draws it, so nothing jumps when one hands over to the other.
  tagline: { position: 'absolute', bottom: 96, fontSize: 12, ...font('600'), letterSpacing: 1.4, color: colors.textFaint, textTransform: 'uppercase' },
});
