import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSheet, FilterChips, MapCredit, YouSheet, MapButtons, MapTopBar, NearbyRail, PlayerSheet, PreviewOverlay } from '@/components/map/MapChrome';
import { MapCanvas, type CanvasMarker, type MapCanvasHandle } from '@/components/map/MapCanvas';
import { lookFor } from '@/components/map/look';
import { courtPinHtml, mePinHtml, playerPinHtml } from '@/components/map/markers';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { milesBetween } from '@/features/players/geo';
import { useMapModel } from '@/features/players/mapModel';
import { isOpenToHit } from '@/features/players/openToHit';
import { useBarInset } from '@/features/navigation/barInset';
import { useWeather } from '@/features/players/useWeather';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing } from '@/theme';

const HEIGHT = 330;
/** How far in the map starts: roughly a city. */
const CITY_ZOOM = 11.5;
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;

export type { NearbyMapProps };

/**
 * A real map of who is around you, in the app's own warm-paper look (the
 * same vector map the browser draws, inside a web view — not Apple's stock
 * map). Profiles only say a city, so each player is set down at a fixed
 * spot near theirs rather than tracked.
 *
 * In the Find Players tab it is a still card. Opened, it is the whole page:
 * search, filters, a courts layer, a rail of the nearest players along the
 * bottom, and a card for whoever you tap.
 */
export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const look = useMemo(() => lookFor(themes[theme]), [theme]);
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const { followingIds, actions } = useApp();
  // Your own pin, tapped: the card with your open-to-hit switch.
  const [meOpen, setMeOpen] = useState(false);
  const openToHit = isOpenToHit(me);
  const model = useMapModel(me, players, at);
  const { home } = model;
  const weather = useWeather(home);
  const cityName = me.location.trim() ? me.location.split(',')[0] : 'you';
  const canvas = useRef<MapCanvasHandle | null>(null);
  // A fix arriving after the map is up moves the map to it.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    canvas.current?.flyTo(home, CITY_ZOOM, 600);
  }, [home]);
  // Picking someone, a court, or typing a city takes the map there.
  useEffect(() => { if (model.selected) canvas.current?.flyTo(model.selected.at, CLOSE_ZOOM); }, [model.selected]);
  useEffect(() => { if (model.selectedCourt) canvas.current?.flyTo(model.selectedCourt, CLOSE_ZOOM); }, [model.selectedCourt]);
  useEffect(() => { if (model.place) canvas.current?.flyTo(model.place, CITY_ZOOM, 700); }, [model.place]);

  const shown = expanded ? model.shown : model.inTown.length ? model.inTown : model.ranked.slice(0, 12);
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const markers = useMemo<CanvasMarker[]>(() => {
    const list: CanvasMarker[] = model.courts.map((c) => ({ id: `c:${c.id}`, lat: c.lat, lng: c.lng, html: courtPinHtml(c, c.id === selectedCourtId) }));
    for (const p of shown) {
      const on = p.user.id === selectedId;
      const size = on ? 38 : 30;
      list.push({ id: `p:${p.user.id}`, lat: p.at.lat, lng: p.at.lng, html: playerPinHtml(p.user, { size, on, label: expanded }), anchor: expanded ? 'top' : 'center', offsetY: expanded ? -(size + 8) / 2 : 0 });
    }
    list.push({ id: 'me', lat: home.lat, lng: home.lng, html: mePinHtml(me, expanded ? 34 : 26) });
    return list;
  }, [model.courts, shown, selectedId, selectedCourtId, expanded, home.lat, home.lng, me, theme, openToHit]);

  const mapView = (
    <MapCanvas
      ref={canvas}
      center={home}
      zoom={CITY_ZOOM}
      look={look}
      interactive={expanded}
      markers={markers}
      onTap={(id) => { if (id === 'me') { if (expanded) { model.select(null); model.selectCourt(null); setMeOpen(true); } else onExpand?.(); } else if (id.startsWith('c:')) { setMeOpen(false); model.selectCourt(id.slice(2)); } else if (id.startsWith('p:')) { setMeOpen(false); (expanded ? model.select(id.slice(2)) : onOpen(id.slice(2))); } }}
      onMapTap={() => { model.select(null); model.selectCourt(null); setMeOpen(false); }}
      onMove={(c) => { if (model.courtsOn) void model.loadCourts(c); }}
    />
  );

  if (!expanded) {
    return (
      <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players near you" onPress={onExpand} disabled={!onExpand} style={styles.card}>
        {mapView}
        <MapCredit style={{ position: 'absolute', right: 10, bottom: 10 }} />
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
      {mapView}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} weather={weather} />
      </View>
      <View pointerEvents="box-none" style={styles.bottom}>
        <MapButtons onRecentre={() => { model.select(null); canvas.current?.flyTo(home, CITY_ZOOM, 600); }} />
        {meOpen ? (
          <YouSheet me={me} open={openToHit} onToggle={actions.setOpenToHit} onProfile={() => { setMeOpen(false); router.push('/(tabs)/profile'); }} onClose={() => setMeOpen(false)} />
        ) : model.selected ? (
          <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onFollow={() => actions.toggleFollow(model.selected!.user.id)} />
        ) : model.selectedCourt ? (
          <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} onClose={() => model.selectCourt(null)} onDirections={() => directions(model.selectedCourt!)} />
        ) : (
          <NearbyRail items={model.shown} cityName={model.place ? model.place.name.split(',')[0] : cityName} selectedId={null} onSelect={model.select} />
        )}
        {/* The tray's own colour runs on beneath the floating tab bar, so no map shows between them. */}
        {barInset ? <View style={{ height: barInset, backgroundColor: colors.surface, marginTop: -spacing.md - 1 }} /> : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.md },
});
