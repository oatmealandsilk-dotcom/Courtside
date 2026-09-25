import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Ionicons } from '@expo/vector-icons';

import { CourtSheet, FilterChips, MapButtons, MapTopBar, NearbyRail, PlayerSheet, PreviewOverlay, WeatherChip } from '@/components/map/MapChrome';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { milesBetween } from '@/features/players/geo';
import { useMapModel } from '@/features/players/mapModel';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { useWeather } from '@/features/players/useWeather';
import { initials } from '@/lib/format';
import { colors, radius, spacing, surfaceColorFor, typography } from '@/theme';

const HEIGHT = 330;
const START_ZOOM = 11.5;
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;
/**
 * The plainest vector style OpenFreeMap offers (free, no key), recoloured
 * below into the soft, quiet look of Apple Maps: warm paper, white roads,
 * pale water and parks, and only the labels that matter.
 */
const STYLE = 'https://tiles.openfreemap.org/styles/positron';

type Look = Record<string, { fill?: string; line?: string; text?: string; halo?: string; hide?: boolean }>;
const DAY: Look = {
  background: { fill: '#F6F4EF' },
  landuse_residential: { fill: '#F1EFE9' },
  park: { fill: '#D7E9CB' },
  landcover_wood: { fill: '#D2E3C5' },
  water: { fill: '#B7D6EC' },
  waterway: { line: '#B7D6EC' },
  building: { fill: '#EAE7E0' },
  highway_path: { line: '#E6E2DA' },
  highway_minor: { line: '#FFFFFF' },
  highway_major_casing: { line: '#E3DFD6' },
  highway_major_inner: { line: '#FFFFFF' },
  highway_major_subtle: { line: '#FFFFFF' },
  highway_motorway_casing: { line: '#E8D9A0' },
  highway_motorway_inner: { line: '#FBEFC1' },
  highway_motorway_subtle: { line: '#FBEFC1' },
  highway_motorway_bridge_casing: { line: '#E8D9A0' },
  highway_motorway_bridge_inner: { line: '#FBEFC1' },
  tunnel_motorway_casing: { line: '#EEE6CC' },
  tunnel_motorway_inner: { line: '#F8F1D8' },
  railway: { line: '#E0DCD3' }, railway_transit: { line: '#E0DCD3' }, railway_service: { line: '#E0DCD3' },
  railway_dashline: { hide: true }, railway_transit_dashline: { hide: true }, railway_service_dashline: { hide: true },
  boundary_2: { line: '#CFCAC0' }, boundary_3: { line: '#D9D4CB' },
  'highway-name-path': { hide: true },
  'highway-name-minor': { text: '#8E8A80', halo: '#FFFFFF' },
  'highway-name-major': { text: '#6F6B62', halo: '#FFFFFF' },
  'highway-shield-non-us': { hide: true }, 'highway-shield-us-interstate': { hide: true }, road_shield_us: { hide: true },
  airport: { text: '#8E8A80', halo: '#F6F4EF' },
  label_other: { text: '#8E8A80', halo: '#F6F4EF' },
  label_village: { text: '#6F6B62', halo: '#F6F4EF' },
  label_town: { text: '#5C584F', halo: '#F6F4EF' },
  label_city: { text: '#3A372F', halo: '#F6F4EF' },
  label_city_capital: { text: '#3A372F', halo: '#F6F4EF' },
  label_state: { text: '#9A968C', halo: '#F6F4EF' },
  water_name_point_label: { text: '#6A94B5', halo: '#B7D6EC' },
  water_name_line_label: { text: '#6A94B5', halo: '#B7D6EC' },
  waterway_line_label: { text: '#6A94B5', halo: '#B7D6EC' },
};
const NIGHT: Look = {
  background: { fill: '#1C1C1E' },
  landuse_residential: { fill: '#222224' },
  park: { fill: '#1F2A21' },
  landcover_wood: { fill: '#1D271F' },
  water: { fill: '#152232' },
  waterway: { line: '#152232' },
  building: { fill: '#262628' },
  highway_path: { line: '#2C2C2E' },
  highway_minor: { line: '#333335' },
  highway_major_casing: { line: '#2A2A2C' },
  highway_major_inner: { line: '#3F3F42' },
  highway_major_subtle: { line: '#3F3F42' },
  highway_motorway_casing: { line: '#3A3620' },
  highway_motorway_inner: { line: '#5A5230' },
  highway_motorway_subtle: { line: '#5A5230' },
  highway_motorway_bridge_casing: { line: '#3A3620' },
  highway_motorway_bridge_inner: { line: '#5A5230' },
  tunnel_motorway_casing: { line: '#2E2C22' },
  tunnel_motorway_inner: { line: '#403C2A' },
  railway: { line: '#2E2E30' }, railway_transit: { line: '#2E2E30' }, railway_service: { line: '#2E2E30' },
  railway_dashline: { hide: true }, railway_transit_dashline: { hide: true }, railway_service_dashline: { hide: true },
  boundary_2: { line: '#3A3A3C' }, boundary_3: { line: '#333335' },
  'highway-name-path': { hide: true },
  'highway-name-minor': { text: '#8E8E93', halo: '#1C1C1E' },
  'highway-name-major': { text: '#AEAEB2', halo: '#1C1C1E' },
  'highway-shield-non-us': { hide: true }, 'highway-shield-us-interstate': { hide: true }, road_shield_us: { hide: true },
  airport: { text: '#8E8E93', halo: '#1C1C1E' },
  label_other: { text: '#8E8E93', halo: '#1C1C1E' },
  label_village: { text: '#AEAEB2', halo: '#1C1C1E' },
  label_town: { text: '#C7C7CC', halo: '#1C1C1E' },
  label_city: { text: '#E5E5EA', halo: '#1C1C1E' },
  label_city_capital: { text: '#E5E5EA', halo: '#1C1C1E' },
  label_state: { text: '#8E8E93', halo: '#1C1C1E' },
  water_name_point_label: { text: '#6B8FB0', halo: '#152232' },
  water_name_line_label: { text: '#6B8FB0', halo: '#152232' },
  waterway_line_label: { text: '#6B8FB0', halo: '#152232' },
};

/** Recolours the loaded style layer by layer; anything the style lacks is skipped. */
function applyLook(map: maplibregl.Map, look: Look) {
  for (const [id, rule] of Object.entries(look)) {
    if (!map.getLayer(id)) continue;
    try {
      if (rule.hide) { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (rule.fill) map.setPaintProperty(id, id === 'background' ? 'background-color' : 'fill-color', rule.fill);
      if (rule.line) map.setPaintProperty(id, 'line-color', rule.line);
      if (rule.text) map.setPaintProperty(id, 'text-color', rule.text);
      if (rule.halo) map.setPaintProperty(id, 'text-halo-color', rule.halo);
    } catch {
      // A layer that turned out to be a different type than expected: leave it.
    }
  }
}

// MapLibre does its heavy lifting in a background worker script. The bundler
// cannot find that file on its own, so a copy ships in public/ and the map is
// pointed at it — under the site's base path on GitHub Pages.
const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
maplibregl.setWorkerUrl(`${BASE}/maplibre/maplibre-gl-worker.mjs`);

/**
 * A real map of who is around you, in the browser, drawn by MapLibre — the
 * same vector-map engine behind modern map apps. You sit where your device
 * says you are, or at the centre of your city, and players are set down
 * near theirs. The controls laid over it are shared with the phone.
 */
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
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ onOpen, select: model.select, selectCourt: model.selectCourt, loadCourts: model.loadCourts, courtsOn: model.courtsOn });
  latest.current = { onOpen, select: model.select, selectCourt: model.selectCourt, loadCourts: model.loadCourts, courtsOn: model.courtsOn };

  // The map itself: made once per look and home, kept across everything else.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const instance = new maplibregl.Map({
      container: el,
      style: STYLE,
      center: [home.lng, home.lat],
      zoom: START_ZOOM,
      interactive: expanded,
      attributionControl: false,
      // Handled below, so a two-finger scroll pans and a pinch zooms.
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    instance.touchZoomRotate.disableRotation();
    instance.on('load', () => applyLook(instance, night ? NIGHT : DAY));
    instance.on('click', () => { latest.current.select(null); latest.current.selectCourt(null); });
    instance.on('moveend', () => { if (latest.current.courtsOn) { const c = instance.getCenter(); void latest.current.loadCourts({ lat: c.lat, lng: c.lng }); } });
    // Trackpad: a pinch arrives as a wheel with Ctrl held and zooms around the
    // pointer; a plain two-finger scroll slides the map. Both are ours.
    const onWheel = (event: WheelEvent) => {
      if (!expanded) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        const around = instance.unproject([event.clientX - rect.left, event.clientY - rect.top]);
        instance.zoomTo(instance.getZoom() - event.deltaY * 0.01, { around, animate: false });
      } else {
        instance.panBy([event.deltaX, event.deltaY], { animate: false });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    map.current = instance;
    const settle = setTimeout(() => { instance.resize(); instance.jumpTo({ center: [home.lng, home.lat] }); }, 60);
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
    watcher?.observe(el);
    return () => {
      clearTimeout(settle);
      watcher?.disconnect();
      el.removeEventListener('wheel', onWheel);
      instance.remove();
      map.current = null;
    };
  }, [expanded, night, home.lat, home.lng]);

  // Pins: rebuilt when who is shown or who is picked changes.
  const shown = expanded ? model.shown : model.inTown.length ? model.inTown : model.ranked.slice(0, 12);
  const selectedId = model.selected?.user.id ?? null;
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers: maplibregl.Marker[] = [];
    const pin = (html: string) => { const node = document.createElement('div'); node.innerHTML = html; return node; };
    for (const p of shown) {
      const on = p.user.id === selectedId;
      const size = on ? 38 : 30;
      const face = p.user.avatarUrl ? `background-image:url('${p.user.avatarUrl}');background-size:cover;` : `background:${surfaceColorFor(p.user.avatarSeed)};`;
      const label = expanded ? `<div style="margin-top:2px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:999px;background:${colors.bg};color:${colors.text};font:600 11px Inter,system-ui,sans-serif">${p.user.name.split(' ')[0]}</div>` : '';
      const node = pin(`<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer"><div style="width:${size + 8}px;height:${size + 8}px;border-radius:999px;background:${colors.bg};border:${on ? 3 : 2}px solid ${levelBadge(p.user.profile).tint};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.22)"><div style="width:${size}px;height:${size}px;border-radius:999px;${face}color:#fff;font:600 11px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center">${p.user.avatarUrl ? '' : initials(p.user.name)}</div></div>${label}</div>`);
      node.setAttribute('role', expanded ? 'button' : 'link');
      node.setAttribute('aria-label', expanded ? p.user.name : `${p.user.name}, open profile`);
      node.addEventListener('click', (event) => { event.stopPropagation(); if (expanded) latest.current.select(p.user.id); else latest.current.onOpen(p.user.id); });
      markers.push(new maplibregl.Marker({ element: node, anchor: expanded ? 'top' : 'center', offset: expanded ? [0, -(size + 8) / 2] : [0, 0] }).setLngLat([p.at.lng, p.at.lat]).addTo(instance));
    }
    const meFace = me.avatarUrl ? `background-image:url('${me.avatarUrl}');background-size:cover;` : `background:${surfaceColorFor(me.avatarSeed)};`;
    const meSize = expanded ? 34 : 26;
    markers.push(new maplibregl.Marker({
      element: pin(`<div style="width:64px;height:64px;border-radius:999px;background:${colors.brandDim};display:flex;align-items:center;justify-content:center;opacity:.96"><div style="width:${meSize + 9}px;height:${meSize + 9}px;border-radius:999px;background:${colors.bg};border:2.5px solid ${colors.brand};display:flex;align-items:center;justify-content:center"><div style="width:${meSize}px;height:${meSize}px;border-radius:999px;${meFace}color:#fff;font:600 11px Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center">${me.avatarUrl ? '' : initials(me.name)}</div></div></div>`),
      anchor: 'center',
    }).setLngLat([home.lng, home.lat]).addTo(instance));
    return () => { markers.forEach((m) => m.remove()); };
  }, [shown, selectedId, expanded, home.lat, home.lng, me, night]);

  // Courts, when that layer is on.
  const selectedCourtId = model.selectedCourt?.id ?? null;
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers: maplibregl.Marker[] = [];
    for (const c of model.courts) {
      const on = c.id === selectedCourtId;
      const node = document.createElement('div');
      node.innerHTML = `<div style="display:flex;align-items:center;gap:3px;height:24px;padding:0 7px;border-radius:12px;background:${colors.court};border:2px solid ${colors.bg};box-shadow:0 2px 6px rgba(0,0,0,.18);cursor:pointer;transform:scale(${on ? 1.2 : 1})"><span style="width:10px;height:10px;border-radius:999px;background:${colors.brandInk};display:inline-block"></span>${c.count > 1 ? `<span style="color:${colors.brandInk};font:600 11px Inter,system-ui,sans-serif">${c.count}</span>` : ''}</div>`;
      node.setAttribute('role', 'button'); node.setAttribute('aria-label', c.name);
      node.addEventListener('click', (event) => { event.stopPropagation(); latest.current.selectCourt(c.id); });
      markers.push(new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([c.lng, c.lat]).addTo(instance));
    }
    return () => { markers.forEach((m) => m.remove()); };
  }, [model.courts, selectedCourtId, night]);

  // Picking someone, a court, or typing a city takes the map there.
  useEffect(() => { if (model.selected) map.current?.flyTo({ center: [model.selected.at.lng, model.selected.at.lat], zoom: Math.max(map.current.getZoom(), CLOSE_ZOOM), duration: 500 }); }, [model.selected]);
  useEffect(() => { if (model.selectedCourt) map.current?.flyTo({ center: [model.selectedCourt.lng, model.selectedCourt.lat], zoom: Math.max(map.current.getZoom(), CLOSE_ZOOM), duration: 500 }); }, [model.selectedCourt]);
  useEffect(() => { if (model.place) map.current?.flyTo({ center: [model.place.lng, model.place.lat], zoom: START_ZOOM, duration: 700 }); }, [model.place]);

  const canvas = <div ref={host} style={{ position: 'absolute', inset: 0, background: colors.bgElevated }} />;

  if (!expanded) {
    return (
      <View style={styles.card}>
        {canvas}
        <Text style={styles.credit}>© OpenStreetMap</Text>
        {/* A still card: the tap goes to the full map, not to the tiles. */}
        <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players near you" onPress={onExpand} disabled={!onExpand} style={StyleSheet.absoluteFill} />
        <PreviewOverlay cityName={cityName} count={model.inTown.length} weather={weather} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
      </View>
    );
  }

  const message = (id: string) => {
    if (!actions.canMessage(id)) { showToast({ title: 'Only people they follow can message them', icon: 'lock-closed-outline' }); return; }
    router.push(`/messages/${actions.openConversationWith(id)}`);
  };
  return (
    <View style={styles.fill}>
      {canvas}
      <Text style={styles.credit}>© OpenStreetMap</Text>
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
        <WeatherChip weather={weather} />
      </View>
      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom }]}>
        <MapButtons onRecentre={() => { model.select(null); map.current?.flyTo({ center: [home.lng, home.lat], zoom: START_ZOOM, duration: 600 }); }} onZoomIn={() => map.current?.zoomIn()} onZoomOut={() => map.current?.zoomOut()} />
        {model.selected ? (
          <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onFollow={() => actions.toggleFollow(model.selected!.user.id)} />
        ) : model.selectedCourt ? (
          <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} onClose={() => model.selectCourt(null)} onDirections={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${model.selectedCourt!.lat},${model.selectedCourt!.lng}`, '_blank', 'noopener')} />
        ) : (
          <NearbyRail items={model.shown} cityName={model.place ? model.place.name.split(',')[0] : cityName} selectedId={null} onSelect={model.select} />
        )}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2, zIndex: 10 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.sm, zIndex: 10 },
  credit: { position: 'absolute', right: 6, bottom: 4, zIndex: 5, ...typography.caption, fontSize: 9, letterSpacing: 0, color: 'rgba(0,0,0,0.45)', backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 4, borderRadius: 3 },
});
