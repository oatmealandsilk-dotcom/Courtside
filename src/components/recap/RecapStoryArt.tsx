import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RecapCard, RecapHighlights } from '@/components/recap/RecapCard';
import type { PracticeSession } from '@/data/types';
import { weekRange, type WeekRecap } from '@/features/recap/recap';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';

/** The width the picture is laid out at; it is scaled to the stage (1080 × 1920 pixels). */
const BASE = 360;

/**
 * The weekly recap as an Instagram story picture (9:16), the way the
 * share-session pictures are made (storyImage.ts photographs it): the
 * recap card on the court's own page colour, the week's dates over it, what
 * stood out under it (the first of the recap's highlights: your biggest week
 * yet, a record), and the CourtSide lockup with courtsidebase.com along the
 * card's foot, as a session's picture has. Nothing sits in the top and bottom
 * strips Instagram covers with its own buttons. Only your own numbers, and
 * only once you choose to share them.
 */
export function RecapStoryArt({ recap, sessions, width }: {
  recap: WeekRecap;
  /** Your log, for what stood out (a record names its day and who it was against). */
  sessions: PracticeSession[];
  width: number;
}) {
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
          {/* The week's own dates say which week it was over the card, so an older week never goes out as "last week". */}
          <RecapCard recap={recap} story />
          <RecapHighlights recap={recap} sessions={sessions} limit={1} compact />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The brand colour across the top of the picture, the card sitting over its edge.
  wash: { position: 'absolute', left: 0, right: 0, top: 0, height: 280 },
  // Clear of Instagram's own strips (about the top 13% and the bottom 17%).
  inner: { position: 'absolute', left: 20, right: 20, top: 82, gap: 10 },
  week: { ...font('600'), fontSize: 15, letterSpacing: -0.2, textAlign: 'center' },
});
