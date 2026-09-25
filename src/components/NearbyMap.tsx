import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { CourtSheet, FilterChips, MapButtons, MapTopBar, NearbyRail, PlayerSheet, PreviewOverlay, WeatherChip } from '@/components/map/MapChrome';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { milesBetween } from '@/features/players/geo';
import { useMapModel } from '@/features/players/mapModel';
import type { LatLng } from '@/features/players/positions';
import { useWeather } from '@/features/players/useWeather';
import { levelBadge } from '@/lib/badges';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const HEIGHT = 330;
/** How much of the world the map shows at first: roughly a city. */
const CITY = { latitudeDelta: 0.16, longitudeDelta: 0.16 };
/** Close enough to read street names, when the map goes to someone. */
const CLOSE = { latitudeDelta: 0.035, longitudeDelta: 0.035 };


/**
 * A real map of who is around you — Apple Maps on iPhone. Profiles only say
 * a city, so each player is set down at a fixed spot near theirs rather
 * than tracked.
 *
 * In the Find Players tab it is a still card. Opened, it is the whole page:
 * search, filters, a courts layer, a rail of the nearest players along the
 * bottom, and a card for whoever you tap.
 */
export type { NearbyMapProps };

export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { night } = useTheme();
  const insets = useSafeAreaInsets();
  const { followingIds, actions } = useApp();
  const model = useMapModel(me, players, at);
  const { home } = model;
  const weather = useWeather(home);
  const cityName = me.location.trim() ? me.location.split(',')[0] : 'you';
  const start: Region = { latitude: home.lat, longitude: home.lng, ...CITY };
  const map = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>(start);
  const goTo = (spot: LatLng, delta = CLOSE, ms = 420) => {
    const next = { latitude: spot.lat, longitude: spot.lng, ...delta };
    setRegion(next);
    map.current?.animateToRegion(next, ms);
  };
  // A fix arriving after the map is up moves the map to it.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    goTo(home, CITY, 500);
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking someone, or typing a city, takes the map there.
  useEffect(() => { if (model.selected) goTo(model.selected.at); }, [model.selected]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.selectedCourt) goTo(model.selectedCourt); }, [model.selectedCourt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.place) goTo(model.place, CITY); }, [model.place]); // eslint-disable-line react-hooks/exhaustive-deps

  const pins = (expanded ? model.shown : model.inTown.length ? model.inTown : model.ranked.slice(0, 12)).map((p) => {
    const on = model.selected?.user.id === p.user.id;
    return (
      <Marker
        key={`${p.user.id}${on ? '-on' : ''}`}
        coordinate={{ latitude: p.at.lat, longitude: p.at.lng }}
        anchor={{ x: 0.5, y: expanded ? 0.35 : 0.5 }}
        tracksViewChanges={false}
        zIndex={on ? 10 : 1}
        accessibilityLabel={`${p.user.name}${expanded ? '' : ', open profile'}`}
        onPress={() => (expanded ? model.select(p.user.id) : onOpen(p.user.id))}
      >
        {/* The pin is the player: their picture in a ring of their level's colour, their name beneath on the full map. */}
        <View style={styles.pin}>
          <View style={[styles.pinRing, { borderColor: levelBadge(p.user.profile).tint }, on && styles.pinRingOn]}>
            <Avatar name={p.user.name} seed={p.user.avatarSeed} size={on ? 38 : 30} ring={p.user.isCoach} />
          </View>
          {expanded ? <Text style={styles.pinLabel} numberOfLines={1}>{p.user.name.split(' ')[0]}</Text> : null}
        </View>
      </Marker>
    );
  });
  const courtPins = model.courts.map((c) => {
    const on = model.selectedCourt?.id === c.id;
    return (
      <Marker key={`${c.id}${on ? '-on' : ''}`} coordinate={{ latitude: c.lat, longitude: c.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} accessibilityLabel={c.name} onPress={() => model.selectCourt(c.id)}>
        <View style={[styles.court, on && styles.courtOn]}>
          <Ionicons name="tennisball" size={13} color={colors.brandInk} />
          {c.count > 1 ? <Text style={styles.courtCount}>{c.count}</Text> : null}
        </View>
      </Marker>
    );
  });
  const mePin = (
    <Marker coordinate={{ latitude: home.lat, longitude: home.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} accessibilityLabel="You" zIndex={5}>
      <View style={styles.meHalo}>
        <View style={styles.meRing}>
          <Avatar name={me.name} seed={me.avatarSeed} size={expanded ? 34 : 26} />
        </View>
      </View>
    </Marker>
  );

  const canvas = (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={start}
      onRegionChangeComplete={expanded ? (r) => { setRegion(r); if (model.courtsOn) void model.loadCourts({ lat: r.latitude, lng: r.longitude }); } : undefined}
      onPress={expanded ? () => { model.select(null); model.selectCourt(null); } : undefined}
      scrollEnabled={expanded}
      zoomEnabled={expanded}
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
      pointerEvents={expanded ? 'auto' : 'none'}
    >
      {courtPins}
      {pins}
      {mePin}
    </MapView>
  );

  if (!expanded) {
    return (
      <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players near you" onPress={onExpand} disabled={!onExpand} style={styles.card}>
        {canvas}
        <PreviewOverlay cityName={cityName} count={model.inTown.length} weather={weather} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
      </Pressable>
    );
  }

  const message = (id: string) => {
    if (!actions.canMessage(id)) { showToast({ title: 'Only people they follow can message them', icon: 'lock-closed-outline' }); return; }
    router.push(`/messages/${actions.openConversationWith(id)}`);
  };
  const directions = (c: { lat: number; lng: number; name: string }) => {
    const url = Platform.OS === 'ios' ? `maps://?daddr=${c.lat},${c.lng}&q=${encodeURIComponent(c.name)}` : `geo:${c.lat},${c.lng}?q=${c.lat},${c.lng}(${encodeURIComponent(c.name)})`;
    void Linking.openURL(url).catch(() => Linking.openURL(`https://maps.apple.com/?daddr=${c.lat},${c.lng}`));
  };
  return (
    <View style={styles.fill}>
      {canvas}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
        <WeatherChip weather={weather} />
      </View>
      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom }]}>
        <MapButtons onRecentre={() => { model.select(null); goTo(home, CITY, 360); }} />
        {model.selected ? (
          <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onFollow={() => actions.toggleFollow(model.selected!.user.id)} />
        ) : model.selectedCourt ? (
          <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} onClose={() => model.selectCourt(null)} onDirections={() => directions(model.selectedCourt!)} />
        ) : (
          <NearbyRail items={model.shown} cityName={model.place ? model.place.name.split(',')[0] : cityName} selectedId={null} onSelect={model.select} />
        )}
      </View>
      {/* Keeps the region state honest for the courts layer; nothing to draw. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0 }} accessibilityElementsHidden>{region.latitude ? null : null}</View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.sm },
  pin: { alignItems: 'center', gap: 2 },
  pinRing: { padding: 2, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  pinRingOn: { borderWidth: 3 },
  pinLabel: { ...typography.caption, letterSpacing: 0, color: colors.text, backgroundColor: colors.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden', maxWidth: 90 },
  meHalo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', opacity: 0.96 },
  meRing: { padding: 2, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 2.5, borderColor: colors.brand },
  court: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 24, borderRadius: 12, backgroundColor: colors.court, borderWidth: 2, borderColor: colors.bg, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  courtOn: { transform: [{ scale: 1.2 }] },
  courtCount: { ...typography.caption, letterSpacing: 0, color: colors.brandInk },
});
