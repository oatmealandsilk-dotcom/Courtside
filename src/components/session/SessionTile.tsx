import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandWash } from '@/components/ui';
import type { SessionDetail } from '@/data/types';
import { resultWord, whatWord } from '@/features/activity/format';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme';
import { Duration } from './Duration';
import { cardLook } from './SessionCard';

/**
 * A session post with no photo, as a tile in a profile's grid: the session
 * card in small, what it was and the time, so the grid shows the session
 * rather than a block of words.
 */
export function SessionTile({ session, width }: { session: SessionDetail; width: number }) {
  useTheme();
  const look = cardLook();
  const k = width / 120;
  const result = resultWord(session);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tile, { backgroundColor: look.fill, padding: 10 * k }]}>
      {look.dark ? null : <BrandWash radius={0} />}
      <Text style={{ ...font('600'), fontSize: 9 * k, letterSpacing: 0.8 * k, color: look.eyebrow }} numberOfLines={1} maxFontSizeMultiplier={1}>
        {[whatWord(session), result].filter(Boolean).join(' · ').toUpperCase()}
      </Text>
      <Duration minutes={session.minutes} size={30 * k} color={look.figure} unitColor={look.muted} maxGrow={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { justifyContent: 'space-between' },
});
