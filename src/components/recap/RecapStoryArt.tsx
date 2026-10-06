import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RecapCard } from '@/components/recap/RecapCard';
import { weekRange, type WeekRecap } from '@/features/recap/recap';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';

/** The width the picture is laid out at; it is scaled to the stage (1080 × 1920 pixels). */
const BASE = 360;

/**
 * The weekly recap as an Instagram story picture (9:16), the way the
 * share-session pictures are made (storyImage.ts photographs it): the
 * recap card on the court's own page colour, the week's dates over it, and
 * nothing in the top and bottom strips Instagram covers with its buttons.
 * Only your own numbers, and only once you choose to share them.
 */
export function RecapStoryArt({ recap, width }: { recap: WeekRecap; width: number }) {
  useTheme();
  const height = Math.round((width * 16) / 9);
  const k = width / BASE;
  const baseH = (BASE * 16) / 9;
  return (
    <View collapsable={false} style={{ width, height, backgroundColor: colors.bg, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute', left: 0, top: 0, width: BASE, height: baseH,
          transform: [{ translateX: (width - BASE) / 2 }, { translateY: (height - baseH) / 2 }, { scale: k }],
        }}
      >
        <View style={[styles.wash, { backgroundColor: colors.brand }]} />
        <View style={styles.inner}>
          <Text style={[styles.week, { color: colors.brandInk }]}>{`My week on court · ${weekRange(recap.week)}`}</Text>
          <RecapCard recap={recap} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The brand colour across the top of the picture, the card sitting over its edge.
  wash: { position: 'absolute', left: 0, right: 0, top: 0, height: 300 },
  // Clear of Instagram's own strips (about the top 13% and the bottom 17%).
  inner: { position: 'absolute', left: 20, right: 20, top: 100, gap: 14 },
  week: { ...font('600'), fontSize: 15, letterSpacing: -0.2, textAlign: 'center' },
});
