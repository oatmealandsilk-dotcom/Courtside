import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Wash } from '@/components/Wash';
import { themes, type ThemeName } from '@/theme/ThemeProvider';

/**
 * The chosen court as a tiny page — its ground with its wash faintly on it —
 * the same picture the Theme page shows for each court. Settings' Theme row
 * and Profile's ☰ menu both show it.
 */
export function ThemeTile({ name }: { name: ThemeName }) {
  const p = themes[name];
  return (
    <View style={[tile.box, { backgroundColor: p.bg, borderColor: p.borderStrong }]}>
      <Wash theme={name} height={26} strength={0.9} fade={p.bg} swatch />
    </View>
  );
}
const tile = StyleSheet.create({
  box: { width: 26, height: 24, borderRadius: 7, borderWidth: 1, overflow: 'hidden' },
});
