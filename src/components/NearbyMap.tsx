import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { levelBadge } from '@/lib/badges';
import type { User } from '@/data/types';
import { homeFor, positionFor, type LatLng } from '@/features/players/positions';
import { useWeather } from '@/features/players/useWeather';
import { colors, radius, spacing, typography } from '@/theme';

const HEIGHT = 290;
/** How much of the world the map shows at first: roughly a city. */
const CITY = { latitudeDelta: 0.16, longitudeDelta: 0.16 };

/**
 * A real map of who is around you — Apple Maps on iPhone. There is no
 * location tracking in this build: you sit at the centre of your city and
 * players are set down at fixed spots near theirs.
 *
 * In the community tab it is a still card that opens into its own page;
 * expanded, every drag and pinch moves the map itself.
 */
export function NearbyMap({ me, players, onOpen, onExpand, expanded = false, fullscreen = false, at, onLocate, locationOn, locating = false, onToggleLocation }: {
  me: User; players: User[]; onOpen: (id: string) => void;
  /** Tapping the card or the expand button opens the full map. */
  onExpand?: () => void;
  expanded?: boolean;
  /** Fill whatever holds it, with no card frame: the map is the whole page. */
  fullscreen?: boolean;
  /** Where the device says you are; without it you sit at the centre of your city. */
  at?: LatLng | null;
  /** Asks the device for a fix; shown as a button when there is none yet. */
  onLocate?: () => void;
  /** Whether the app is using the device's location; the switch on the map flips it. */
  locationOn?: boolean;
  /** Asking the device where it is, right now. */
  locating?: boolean;
  onToggleLocation?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { night } = useTheme();
  const nearby = expanded ? players.slice(0, 40) : players.slice(0, 12);
  const home = useMemo(() => homeFor(me, at), [me, at]);
  const weather = useWeather(home);
  const start: Region = { latitude: home.lat, longitude: home.lng, ...CITY };
  const map = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>(start);
  // A fix arriving after the map is up moves the map to it.
  const lastHome = useRef(home);
  React.useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    const next = { latitude: home.lat, longitude: home.lng, ...CITY };
    setRegion(next);
    map.current?.animateToRegion(next, 500);
  }, [home]);

  const zoomBy = (factor: number) => {
    const next = { ...region, latitudeDelta: Math.max(0.005, Math.min(60, region.latitudeDelta * factor)), longitudeDelta: Math.max(0.005, Math.min(60, region.longitudeDelta * factor)) };
    setRegion(next);
    map.current?.animateToRegion(next, 220);
  };
  const recentre = () => { setRegion(start); map.current?.animateToRegion(start, 320); };

  const pins = nearby.map((player) => {
    const at = positionFor(player, home);
    return (
      <Marker
        key={player.id}
        coordinate={{ latitude: at.lat, longitude: at.lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        accessibilityLabel={`${player.name}, open profile`}
        onPress={() => onOpen(player.id)}
      >
        {/* The pin is the player: their picture in a ring of their level's colour. */}
        <View style={[styles.pinRing, { borderColor: levelBadge(player.profile).tint }]}>
          <Avatar name={player.name} seed={player.avatarSeed} size={30} ring={player.isCoach} />
        </View>
      </Marker>
    );
  });
  const mePin = (
    <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} accessibilityLabel="You">
      <View style={styles.meHalo}><View style={styles.meDot} /></View>
    </Marker>
  );

  const canvas = (interactive: boolean) => (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={start}
      onRegionChangeComplete={interactive ? setRegion : undefined}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      showsCompass={false}
      showsPointsOfInterests={false}
      showsBuildings={false}
      showsTraffic={false}
      showsIndoors={false}
      // Apple's quieter map: fewer labels, softer colour, so it sits with the paper.
      mapType="mutedStandard"
      toolbarEnabled={false}
      userInterfaceStyle={night ? 'dark' : 'light'}
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      {pins}
      {mePin}
    </MapView>
  );
  // A breath of the page's own colour over the map, and a fade into the card
  // at the bottom, so the map is part of the page rather than a window in it.
  const veil = (
    <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil]} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', colors.surface]} style={styles.fade} />
    </>
  );

  if (expanded) {
    return (
      <View style={fullscreen ? styles.fill : styles.card}>
        {fullscreen ? null : <View style={styles.head}>
          <Ionicons name="location-outline" size={16} color={colors.brand} />
          <Text style={styles.title}>Players near {me.location.trim() ? me.location.split(',')[0] : 'you'}</Text>
          <Text style={styles.count}>{nearby.length}</Text>
          <View style={{ flex: 1 }} />
          {onToggleLocation ? (
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} onPress={onToggleLocation} hitSlop={8} style={[styles.locPill, locationOn && styles.locPillOn]}>
              <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={12} color={locationOn ? colors.brandInk : colors.textMuted} />
              <Text style={[styles.locPillText, locationOn && { color: colors.brandInk }]}>{locating ? 'Finding you…' : locationOn ? 'Location on' : 'Location off'}</Text>
            </Pressable>
          ) : null}
        </View>}
        <View style={[styles.map, fullscreen ? styles.fill : styles.mapExpanded]}>
          {canvas(true)}
          {weather ? <View pointerEvents="none" style={styles.weather}><Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={14} color={colors.text} /><Text style={styles.weatherText}>{weather.tempF}° · {weather.label}</Text></View> : null}
          <View style={styles.zoomControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => zoomBy(0.5)} style={styles.zoomButton}>
              <Ionicons name="add" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.zoomRule} />
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => zoomBy(2)} style={styles.zoomButton}>
              <Ionicons name="remove" size={18} color={colors.text} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to me" onPress={recentre} style={styles.locate}>
            <Ionicons name="locate-outline" size={18} color={colors.brand} />
          </Pressable>
          {onToggleLocation ? (
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} onPress={onToggleLocation} style={[styles.useLocation, !locationOn && styles.useLocationOff]}>
              <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={15} color={locationOn ? colors.brandInk : colors.text} />
              <Text style={[styles.useLocationText, !locationOn && { color: colors.text }]}>{locating ? 'Finding you…' : locationOn ? 'Location on' : 'Location off'}</Text>
            </Pressable>
          ) : !at && onLocate ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Use my location" onPress={onLocate} style={styles.useLocation}>
              <Ionicons name="navigate" size={15} color={colors.brandInk} />
              <Text style={styles.useLocationText}>Use my location</Text>
            </Pressable>
          ) : null}
        </View>
        {fullscreen ? null : <Text style={styles.hint}>Drag to move around. Pinch or use + / − to zoom. Tap a player to open their profile.</Text>}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="location-outline" size={16} color={colors.brand} />
        <Text style={styles.title}>Players near {me.location.trim() ? me.location.split(',')[0] : 'you'}</Text>
        <Text style={styles.count}>{nearby.length}</Text>
        <View style={{ flex: 1 }} />
        {onToggleLocation ? (
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!locationOn }} accessibilityLabel={locationOn ? 'Turn location off' : 'Turn location on'} onPress={onToggleLocation} hitSlop={8} style={[styles.locPill, locationOn && styles.locPillOn]}>
            <Ionicons name={locationOn ? 'navigate' : 'navigate-outline'} size={12} color={locationOn ? colors.brandInk : colors.textMuted} />
            <Text style={[styles.locPillText, locationOn && { color: colors.brandInk }]}>{locating ? 'Finding you…' : locationOn ? 'Location on' : 'Location off'}</Text>
          </Pressable>
        ) : null}
        {onExpand ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={onExpand} hitSlop={8} style={styles.expand}>
            <Ionicons name="expand-outline" size={16} color={colors.brand} />
            <Text style={styles.expandText}>Open map</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole={onExpand ? 'button' : undefined}
        accessibilityLabel="Map of players near you"
        onPress={onExpand}
        disabled={!onExpand}
        style={styles.map}
      >
        {canvas(false)}
        {veil}
        {weather ? <View pointerEvents="none" style={styles.weather}><Ionicons name={weather.icon as keyof typeof Ionicons.glyphMap} size={14} color={colors.text} /><Text style={styles.weatherText}>{weather.tempF}° · {weather.label}</Text></View> : null}
      </Pressable>
      <Text style={styles.hint}>Tap the map to open it. The badge means coach.</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  title: { ...typography.bodyStrong, fontSize: 14, color: colors.text },
  // The count sits right by the words, in the theme colour, so it reads as part of them.
  count: { ...typography.smallStrong, fontSize: 15, color: colors.brand, marginLeft: -2 },
  locPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  locPillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  locPillText: { ...typography.caption, color: colors.textMuted, letterSpacing: 0 },
  useLocationOff: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  weather: { position: 'absolute', left: 10, top: 10, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...typography.caption, color: colors.text, letterSpacing: 0 },
  expand: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  expandText: { ...typography.caption, color: colors.brand, letterSpacing: 0 },
  map: { height: HEIGHT, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  mapExpanded: { height: 520, backgroundColor: colors.bgElevated },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  zoomControls: { position: 'absolute', right: 10, top: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  zoomButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  locate: { position: 'absolute', right: 10, bottom: 10, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  useLocation: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
  useLocationText: { ...typography.smallStrong, color: colors.brandInk },
  pinRing: { padding: 2, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  meDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, borderWidth: 3, borderColor: colors.bg },
  meHalo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', opacity: 0.95 },
  veil: { backgroundColor: colors.bg, opacity: 0.14 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
  hint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, padding: spacing.md, paddingTop: spacing.sm },
});
