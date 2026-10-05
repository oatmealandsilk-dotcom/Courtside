import React from 'react';
import { Text, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { colors, font } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The small sticker on a clip or photo shared to an Instagram story (Oct 5):
 * the CourtSide mark, then "@handle" over "on CourtSide", on a pill in this
 * court's page colour. Drawn out of sight and photographed (mediaStory.ts),
 * so Instagram gets it as a sticker to move, resize or delete. Everything
 * scales with `width` (230 is the base).
 */
export function HandleSticker({ handle, width = 230 }: { handle: string; width?: number }) {
  useTheme();
  const u = width / 230;
  return (
    <View
      collapsable={false}
      style={{
        alignSelf: 'flex-start', maxWidth: width, flexDirection: 'row', alignItems: 'center', gap: 10 * u,
        paddingVertical: 10 * u, paddingLeft: 12 * u, paddingRight: 20 * u, borderRadius: 40 * u, backgroundColor: colors.bg,
      }}
    >
      <BrandMark size={34 * u} color={colors.brand} />
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ ...font('700'), fontSize: 17 * u, lineHeight: 21 * u, color: colors.text }}>@{handle}</Text>
        <Text numberOfLines={1} style={{ ...font('600'), fontSize: 12 * u, lineHeight: 16 * u, color: colors.brand }}>on CourtSide</Text>
      </View>
    </View>
  );
}
