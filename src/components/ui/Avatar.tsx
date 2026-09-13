import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useApp } from '@/store/AppContext';
import { initials } from '@/lib/format';
import { colors, radius } from '@/theme';

/**
 * A default picture takes one of the theme's own accents, chosen by the
 * person's seed so it never changes between visits — but it does change
 * with the court, so Roland Garros avatars are clay and Wimbledon's are grass.
 */
function tintFor(seed: string): string {
  const palette = [colors.brand, colors.court, colors.hard, colors.clay, colors.grass, colors.borderStrong];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return palette[hash % palette.length];
}

interface Props {
  uri?: string;
  name: string;
  seed: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  ring?: boolean;
}

/** Coaches keep a green ring in every theme; the accent colour is not always green. */
const COACH_RING = '#4C9A5A';

export function Avatar({ uri, name, seed, size = 40, style, ring = false }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const photo = uri ?? users.find(user => user.avatarSeed === seed || user.id === seed)?.avatarUrl;
  const tint = tintFor(seed);
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
          borderColor: COACH_RING,
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
