import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { colors, radius, surfaceColorFor } from '@/theme';

interface Props {
  uri?: string;
  name: string;
  seed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  ring?: boolean;
}

export function Avatar({ uri, name, seed, size = 40, style, ring = false }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const photo = uri ?? users.find(user => user.avatarSeed === seed || user.id === seed)?.avatarUrl;
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
      {photo && <Image source={{uri:photo}} accessibilityLabel={`${name} profile photo`} style={{position:"absolute",width:size,height:size,borderRadius:size/2}}/>}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFFFFF', fontWeight: '800' },
});
