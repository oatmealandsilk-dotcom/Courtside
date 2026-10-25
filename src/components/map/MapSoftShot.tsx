import React from 'react';
import { PixelRatio, Platform, StyleSheet } from 'react-native';
import { Image as PhotoImage } from 'expo-image';

/**
 * How soft, about the browser's 10 px blur on the screen. The picture was taken at the screen's pixel scale,
 * and each phone counts the radius in the picture's own pixels, differently: on an iPhone the image library
 * halves it (so 20 × scale gives ~10 pt), on Android it blurs a quarter-size copy (so 2.5 × scale gives ~10 dp).
 */
const BLUR = Platform.OS === 'ios' ? Math.round(20 * PixelRatio.get()) : Math.max(1, Math.round(2.5 * PixelRatio.get()));

/**
 * The 'D' loading look (MapLoadState's MAP_LOADING): a picture kept of this place's map, scaled to
 * cover the card and softly blurred, so a size or look the picture was not taken for never shows as
 * a sharp map that then shifts. The blur is in the picture itself (not a live blur view), and it is a
 * little larger than the card, so its blurred edges stay outside it. A late picture eases in on its own.
 */
export function MapSoftShot({ uri }: { uri: string }) {
  return <PhotoImage source={{ uri }} contentFit="cover" blurRadius={BLUR} transition={300} cachePolicy="memory" style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, transform: [{ scale: 1.08 }] },
});
