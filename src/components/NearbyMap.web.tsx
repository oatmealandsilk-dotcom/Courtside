import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Ionicons } from '@expo/vector-icons';

import type { User } from '@/data/types';
import { homeFor, positionFor, type LatLng } from '@/features/players/positions';
import { initials } from '@/lib/format';
import { colors, radius, spacing, surfaceColorFor, typography } from '@/theme';

const HEIGHT = 220;
const START_ZOOM = 11.5;
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
 * same vector-map engine behind modern map apps, so streets, parks and
 * water render crisply at any zoom. You sit where your device says you are,
 * or at the centre of your city, and players are set down near theirs.
 */
export function NearbyMap({ me, players, onOpen, onExpand, expanded = false, fullscreen = false, at, onLocate }: {
  me: User; players: User[]; onOpen: (id: string) => void;
  onExpand?: () => void;
  expanded?: boolean;
  fullscreen?: boolean;
  at?: LatLng | null;
  onLocate?: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { night } = useTheme();
  const nearby = expanded ? players.slice(0, 40) : players.slice(0, 12);
  const home = useMemo(() => homeFor(me, at), [me, at]);
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latestOpen = useRef(onOpen);
  latestOpen.current = onOpen;

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

    const pin = (html: string, size: number) => {
      const node = document.createElement('div');
      node.style.width = `${size}px`;
      node.style.height = `${size}px`;
      node.innerHTML = html;
      return node;
    };
    const markers: maplibregl.Marker[] = [];
    for (const player of nearby) {
      const spot = positionFor(player, home);
      const face = player.avatarUrl
        ? `background-image:url('${player.avatarUrl}');background-size:cover;`
        : `background:${surfaceColorFor(player.avatarSeed)};`;
      const node = pin(`<div style="width:34px;height:34px;border-radius:17px;background:${colors.bg};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.28);cursor:pointer"><div style="width:30px;height:30px;border-radius:15px;${face}color:#fff;font:600 11px system-ui,sans-serif;display:flex;align-items:center;justify-content:center">${player.avatarUrl ? '' : initials(player.name)}</div></div>`, 34);
      node.setAttribute('role', 'link');
      node.setAttribute('aria-label', `${player.name}, open profile`);
      node.addEventListener('click', (event) => { event.stopPropagation(); latestOpen.current(player.id); });
      markers.push(new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([spot.lng, spot.lat]).addTo(instance));
    }
    markers.push(new maplibregl.Marker({
      element: pin(`<div style="width:18px;height:18px;border-radius:9px;background:${colors.brand};border:3px solid ${colors.bg};box-shadow:0 0 0 6px ${colors.brand}33"></div>`, 18),
      anchor: 'center',
    }).setLngLat([home.lng, home.lat]).addTo(instance));

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
    // The box can change size after the map is made (the page settles, the
    // window resizes); the map has to be told or its centre drifts.
    const settle = setTimeout(() => { instance.resize(); instance.jumpTo({ center: [home.lng, home.lat] }); }, 60);
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
    watcher?.observe(el);
    return () => {
      clearTimeout(settle);
      watcher?.disconnect();
      el.removeEventListener('wheel', onWheel);
      markers.forEach((m) => m.remove());
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, night, home.lat, home.lng, nearby.map((p) => p.id).join(',')]);

  const canvas = <div ref={host} style={{ position: 'absolute', inset: 0, background: colors.bgElevated }} />;

  if (expanded) {
    return (
      <View style={fullscreen ? styles.fill : styles.card}>
        {fullscreen ? null : <View style={styles.head}>
          <Ionicons name="location-outline" size={16} color={colors.brand} />
          <Text style={styles.title}>Players near {me.location.trim() ? me.location.split(',')[0] : 'you'}</Text>
          <Text style={styles.count}>{nearby.length}</Text>
        </View>}
        <View style={[styles.map, fullscreen ? styles.fill : styles.mapExpanded]}>
          {canvas}
          <Text style={styles.credit}>© OpenStreetMap</Text>
          <View style={styles.zoomControls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => map.current?.zoomIn()} style={styles.zoomButton}>
              <Ionicons name="add" size={18} color={colors.text} />
            </Pressable>
            <View style={styles.zoomRule} />
            <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => map.current?.zoomOut()} style={styles.zoomButton}>
              <Ionicons name="remove" size={18} color={colors.text} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to me" onPress={() => map.current?.flyTo({ center: [home.lng, home.lat], zoom: START_ZOOM, duration: 600 })} style={styles.locate}>
            <Ionicons name="locate-outline" size={18} color={colors.brand} />
          </Pressable>
          {!at && onLocate ? (
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
        {onExpand ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={onExpand} hitSlop={8} style={styles.expand}>
            <Ionicons name="expand-outline" size={16} color={colors.brand} />
            <Text style={styles.expandText}>Open map</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.map}>
        {canvas}
        <Text style={styles.credit}>© OpenStreetMap</Text>
        {/* A still card: the tap goes to the full map, not to the tiles. */}
        <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players near you" onPress={onExpand} disabled={!onExpand} style={StyleSheet.absoluteFill} />
      </View>
      <Text style={styles.hint}>Tap the map to open it. The badge means coach.</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  title: { ...typography.smallStrong, color: colors.text, flex: 1 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  expand: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  expandText: { ...typography.caption, color: colors.brand, letterSpacing: 0 },
  map: { height: HEIGHT, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  mapExpanded: { height: 520, backgroundColor: colors.bgElevated },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  zoomControls: { position: 'absolute', right: 10, top: 10, zIndex: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  zoomButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  zoomRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  locate: { position: 'absolute', right: 10, bottom: 10, zIndex: 10, width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  useLocation: { position: 'absolute', left: 12, bottom: 12, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.brand },
  useLocationText: { ...typography.smallStrong, color: colors.brandInk },
  hint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, padding: spacing.md, paddingTop: spacing.sm },
  credit: { position: 'absolute', right: 6, bottom: 4, fontSize: 9, color: 'rgba(0,0,0,0.45)', backgroundColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 4, borderRadius: 3 },
});
