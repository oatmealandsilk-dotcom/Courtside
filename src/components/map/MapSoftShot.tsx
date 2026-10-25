import React from 'react';
import { StyleSheet } from 'react-native';
import { Image as PhotoImage } from 'expo-image';

/**
 * The 'D' loading look (MapLoadState's MAP_LOADING): a picture kept of this place's map, scaled to
 * cover the card and softly blurred, so a size or look the picture was not taken for never shows as
 * a sharp map that then shifts. The blur is in the picture itself (not a live blur view), and it is a
 * little larger than the card, so its blurred edges stay outside it. A late picture eases in on its own.
 */
export function MapSoftShot({ uri }: { uri: string }) {
  return <PhotoImage source={{ uri }} contentFit="cover" blurRadius={12} transition={300} cachePolicy="memory" style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transform: [{ scale: 1.08 }] },
});
