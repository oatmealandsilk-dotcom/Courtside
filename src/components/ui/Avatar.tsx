import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials } from '@/lib/format';
import { colors, radius, surfaceColorFor } from '@/theme';

interface Props {
  name: string;
  seed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  ring?: boolean;
}

export function Avatar({ name, seed, size = 40, style, ring = false }: Props) {
  const tint = surfaceColorFor(seed);
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius.pill,
          backgroundColor: tint,
          borderWidth: ring ? 2 : 0,
          borderColor: colors.brand,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFFFFF', fontWeight: '800' },
});
