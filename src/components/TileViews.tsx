import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { compactNumber } from '@/lib/format';
import { font } from '@/theme';

/**
 * A clip's view count on a profile grid tile, bottom left, the way Reels and
 * TikTok show it: a soft shade along the bottom so the number reads on any
 * picture, bright sky or white shirt, instead of white text straight on it.
 * (White on a dark shade is the one colour pairing that works over any photo,
 * so it does not follow the theme.)
 */
export function TileViews({ views }: { views: number }) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        <Ionicons name="play" size={10} color="#FFFFFF" />
        <Text style={styles.text}>{compactNumber(views)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, justifyContent: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 7, paddingBottom: 6 },
  text: { fontSize: 12, lineHeight: 14, ...font('600'), color: '#FFFFFF', fontVariant: ['tabular-nums'] },
});
