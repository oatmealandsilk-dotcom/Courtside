import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { Suspense, lazy } from 'react';
import { StyleSheet, View } from 'react-native';
// The map's stylesheet is small and stays with the app; only the engine waits.
import 'maplibre-gl/dist/maplibre-gl.css';

import { CourtSpinner } from '@/components/CourtSpinner';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { colors, radius } from '@/theme';

export type { NearbyMapProps };

/**
 * The map engine is about a megabyte, a fifth of the whole app. It downloads
 * the first time a map is actually shown, not with the app, so everyone who
 * only watches clips opens CourtSide that much faster. Until it arrives, a
 * box of exactly the map's size holds its place so nothing jumps.
 */
const WebMap = lazy(() => import('@/components/map/WebMap').then((m) => ({ default: m.NearbyMap })));

export function NearbyMap(props: NearbyMapProps) {
  const styles = useThemedStyles(styleDefinitions);
  const standIn = (
    <View style={props.expanded ? styles.fill : styles.card}>
      <CourtSpinner size={24} />
    </View>
  );
  return (
    <Suspense fallback={standIn}>
      <WebMap {...props} />
    </Suspense>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: 330, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
});
