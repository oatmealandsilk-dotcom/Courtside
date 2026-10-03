import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { Suspense, lazy } from 'react';
import { StyleSheet, Text, View } from 'react-native';
// The map's stylesheet is small and stays with the app; only the engine waits.
import 'maplibre-gl/dist/maplibre-gl.css';

import { CourtSpinner } from '@/components/CourtSpinner';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { useStartMapHold } from '@/features/feed/warmup';
import { Button } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/theme';

export type { NearbyMapProps };

const RELOADED = 'courtside-map-reload';

/**
 * The map engine is about a megabyte, a fifth of the whole app. It is not
 * part of the app's first download, so the splash comes up that much faster.
 * The app opens on Find Players, though, so the splash starts fetching it
 * (preloadNearbyMap) while the logo is up, and the map is usually in by the
 * time the page shows. Until it arrives, a box of exactly the map's size
 * holds its place so nothing jumps.
 */
let loading: Promise<typeof import('@/components/map/WebMap')> | null = null;
/** One fetch of the engine, shared by the early start and the map itself. */
const loadMap = () => (loading ??= import('@/components/map/WebMap'));
export function preloadNearbyMap() {
  // A failure here is left for the map to meet and handle (below) when it is drawn.
  loadMap().catch(() => undefined);
}
/**
 * Once the engine that was asked for is in (or failed), so background work
 * (the Feed warming up) never takes the connection while the map still needs
 * it. Straight away if nothing has asked for the map.
 */
export function nearbyMapSettled(): Promise<void> {
  return loading ? loading.then(() => undefined, () => undefined) : Promise.resolve();
}

const WebMap = lazy(() => loadMap().then((m) => {
  try { sessionStorage.removeItem(RELOADED); } catch {}
  return { default: m.NearbyMap };
}, () => {
  // A tab left open across an update asks for the old file, which is gone:
  // reload once to pick up the new app. Only once, so an outage can't loop;
  // after that the map's spot says so quietly instead of the whole page failing.
  let tried = false;
  try { tried = sessionStorage.getItem(RELOADED) === '1'; sessionStorage.setItem(RELOADED, '1'); } catch {}
  if (tried) return { default: MapUnavailable };
  window.location.reload();
  return new Promise<never>(() => {});
}));

export function NearbyMap(props: NearbyMapProps) {
  return (
    <Suspense fallback={<StandIn expanded={!!props.expanded} />}>
      <WebMap {...props} />
    </Suspense>
  );
}

/** The map's place while its engine downloads. As a still card on the start page, it holds the opening curtain too (see warmup), handing over to the map itself. */
function StandIn({ expanded }: { expanded: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  useStartMapHold(!expanded);
  return (
    <View style={expanded ? styles.fill : styles.card}>
      <CourtSpinner size={24} />
    </View>
  );
}

function MapUnavailable({ expanded, onBack }: NearbyMapProps) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={expanded ? styles.fill : styles.card}>
      <Text style={styles.title}>The map didn’t load</Text>
      <Text style={styles.body}>Check your connection, then refresh the page.</Text>
      {expanded && onBack ? <Button label="Go back" variant="secondary" onPress={onBack} style={{ marginTop: spacing.md }} /> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: 330, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4, padding: spacing.xl },
  fill: { flex: 1, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center', gap: 4, padding: spacing.xl },
  title: { ...typography.bodyStrong, color: colors.text, textAlign: 'center' },
  body: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
