import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSheet, FilterChips, MapCredit, YouSheet, MapButtons, MapTopBar, NearbyRail, PlayerSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { milesBetween } from '@/features/players/geo';
import { useMapModel } from '@/features/players/mapModel';
import { isOpenToHit } from '@/features/players/openToHit';
import { useBarInset } from '@/features/navigation/barInset';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { useWeather } from '@/features/players/useWeather';
import { colors, radius, spacing, typography } from '@/theme';
import { STYLE, applyLook, lookFor } from '@/components/map/look';
import { courtPinHtml, mePinHtml, playerPinHtml } from '@/components/map/markers';

const HEIGHT = 330;
const START_ZOOM = 11.5;
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;
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
  const { theme, night } = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const { followingIds, actions } = useApp();
  // Your own pin, tapped: the card with your open-to-hit switch.
  const [meOpen, setMeOpen] = useState(false);
  const openToHit = isOpenToHit(me);
  const model = useMapModel(me, players, at);
  const { home, start } = model;
  const startZoom = start.zoom ?? START_ZOOM;
  const weather = useWeather(home);
  const cityName = me.location.trim() ? me.location.split(',')[0] : 'you';
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ onOpen, select: model.select, selectCourt: model.selectCourt, loadCourts: model.loadCourts, courtsOn: model.courtsOn, openMe: () => undefined as void });
  latest.current = { onOpen, select: model.select, selectCourt: model.selectCourt, loadCourts: model.loadCourts, courtsOn: model.courtsOn, openMe: () => { if (expanded) { model.select(null); model.selectCourt(null); setMeOpen(true); } else onExpand?.(); } };

  // The map itself: made once per look and home, kept across everything else.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const instance = new maplibregl.Map({
      container: el,
      style: STYLE,
      center: [start.center.lng, start.center.lat],
      zoom: startZoom,
      interactive: expanded,
      attributionControl: false,
      // Handled below, so a two-finger scroll pans and a pinch zooms.
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    instance.touchZoomRotate.disableRotation();
    instance.on('load', () => applyLook(instance, lookFor(themes[theme])));
    instance.on('click', () => { latest.current.select(null); latest.current.selectCourt(null); setMeOpen(false); });
    // Courts for where the map came to rest: asked once it has been still a
    // moment, not on every frame of a scroll.
    let courtsTimer: ReturnType<typeof setTimeout> | null = null;
    instance.on('moveend', () => {
      if (!latest.current.courtsOn) return;
      if (courtsTimer) clearTimeout(courtsTimer);
      courtsTimer = setTimeout(() => { const c = instance.getCenter(); void latest.current.loadCourts({ lat: c.lat, lng: c.lng }); }, 250);
    });
    // Trackpad: a pinch arrives as a wheel with Ctrl held and zooms around the
    // pointer; a plain two-finger scroll slides the map. Both are ours. A
    // trackpad sends several wheel events per screen frame, so they are added
    // up and the map moves once per frame: smooth, and no wasted redraws.
    let dx = 0, dy = 0, dz = 0, frame = 0;
    let pointer: [number, number] = [0, 0];
    const flush = () => {
      frame = 0;
      if (dz) {
        instance.zoomTo(instance.getZoom() - dz, { around: instance.unproject(pointer), animate: false });
        dz = 0;
      }
      if (dx || dy) {
        instance.panBy([dx, dy], { animate: false });
        dx = 0; dy = 0;
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!expanded) return;
      event.preventDefault();
      // A mouse wheel can report in lines rather than pixels.
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        pointer = [event.clientX - rect.left, event.clientY - rect.top];
        dz += event.deltaY * scale * 0.01;
      } else {
        dx += event.deltaX * scale;
        dy += event.deltaY * scale;
      }
      if (!frame) frame = requestAnimationFrame(flush);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    map.current = instance;
    const settle = setTimeout(() => { instance.resize(); instance.jumpTo({ center: [start.center.lng, start.center.lat] }); }, 60);
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
    watcher?.observe(el);
    return () => {
      clearTimeout(settle);
      if (courtsTimer) clearTimeout(courtsTimer);
      if (frame) cancelAnimationFrame(frame);
      watcher?.disconnect();
      el.removeEventListener('wheel', onWheel);
      instance.remove();
      map.current = null;
    };
  }, [expanded, theme, start.center.lat, start.center.lng, startZoom]);

  // Pins: rebuilt when who is shown or who is picked changes.
  const shown = expanded ? model.shown : model.inTown.length ? model.inTown : model.ranked.slice(0, 12);
  const selectedId = model.selected?.user.id ?? null;
  // Players' pins persist between changes: a new filter fades out the ones
  // that leave and fades in the ones that arrive, and the rest never flicker.
  const pins = useRef(new Map<string, { marker: maplibregl.Marker; html: string; node: HTMLDivElement; leaving?: ReturnType<typeof setTimeout> }>());
  useEffect(() => () => { pins.current.forEach((p) => p.marker.remove()); pins.current.clear(); }, [expanded, theme]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const seen = new Set<string>();
    for (const p of shown) {
      const on = p.user.id === selectedId;
      const size = on ? 38 : 30;
      const html = playerPinHtml(p.user, { size, on, label: expanded, seenAt: p.seenAt });
      seen.add(p.user.id);
      const kept = pins.current.get(p.user.id);
      if (kept) {
        if (kept.leaving) { clearTimeout(kept.leaving); kept.leaving = undefined; kept.node.style.opacity = '1'; }
        if (kept.html !== html) {
          kept.node.innerHTML = html;
          kept.html = html;
          kept.marker.setOffset(expanded ? [0, -(size + 8) / 2] : [0, 0]);
        }
        kept.marker.setLngLat([p.at.lng, p.at.lat]);
        continue;
      }
      const node = document.createElement('div');
      node.innerHTML = html;
      node.style.opacity = '0';
      node.style.transition = 'opacity 180ms ease-out';
      node.setAttribute('role', expanded ? 'button' : 'link');
      node.setAttribute('aria-label', expanded ? p.user.name : `${p.user.name}, open profile`);
      const id = p.user.id;
      node.addEventListener('click', (event) => { event.stopPropagation(); if (expanded) latest.current.select(id); else latest.current.onOpen(id); });
      const marker = new maplibregl.Marker({ element: node, anchor: expanded ? 'top' : 'center', offset: expanded ? [0, -(size + 8) / 2] : [0, 0] }).setLngLat([p.at.lng, p.at.lat]).addTo(instance);
      pins.current.set(id, { marker, html, node });
      requestAnimationFrame(() => { node.style.opacity = '1'; });
    }
    for (const [id, pin] of pins.current) {
      if (seen.has(id) || pin.leaving) continue;
      pin.node.style.opacity = '0';
      pin.leaving = setTimeout(() => { pin.marker.remove(); pins.current.delete(id); }, 180);
    }
  }, [shown, selectedId, expanded, night, openToHit]);

  // You: one pin, rebuilt only when you or where you are changes.
  useEffect(() => {
    const instance = map.current;
    // Your pin only where you last shared your location; location off, no pin.
    const mine = model.mePos;
    if (!instance || !mine) return;
    const markers: maplibregl.Marker[] = [];
    const pin = (html: string) => { const node = document.createElement('div'); node.innerHTML = html; return node; };
    const meSize = expanded ? 34 : 26;
    markers.push(new maplibregl.Marker({
      element: (() => { const node = pin(mePinHtml(me, meSize)); node.setAttribute('role', 'button'); node.setAttribute('aria-label', 'You'); node.addEventListener('click', (event) => { event.stopPropagation(); latest.current.openMe(); }); return node; })(),
      anchor: 'center',
    }).setLngLat([mine.lng, mine.lat]).addTo(instance));
    return () => { markers.forEach((m) => m.remove()); };
  }, [expanded, model.mePos, me, night, openToHit]);

  // Courts, when that layer is on.
  const selectedCourtId = model.selectedCourt?.id ?? null;
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers: maplibregl.Marker[] = [];
    for (const c of model.courts) {
      const on = c.id === selectedCourtId;
      const node = document.createElement('div');
      node.innerHTML = courtPinHtml(c, on);
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

  const canvas = <div ref={host} style={{ position: 'absolute', inset: 0, background: colors.bg }} />;

  if (!expanded) {
    return (
      <View style={styles.card}>
        {canvas}
        <MapCredit style={{ position: 'absolute', right: 10, bottom: 10 }} />
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
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
      </View>
      <View pointerEvents="box-none" style={styles.bottom}>
        <MapButtons onRecentre={() => { model.select(null); map.current?.flyTo({ center: [start.center.lng, start.center.lat], zoom: startZoom, duration: 600 }); }} onZoomIn={() => map.current?.zoomIn()} onZoomOut={() => map.current?.zoomOut()} />
        {meOpen ? (
          <YouSheet me={me} open={openToHit} onToggle={actions.setOpenToHit} onProfile={() => { setMeOpen(false); router.push('/(tabs)/profile'); }} onClose={() => setMeOpen(false)} />
        ) : model.selected ? (
          <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onFollow={() => actions.toggleFollow(model.selected!.user.id)} />
        ) : model.selectedCourt ? (
          <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} onClose={() => model.selectCourt(null)} onDirections={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${model.selectedCourt!.lat},${model.selectedCourt!.lng}`, '_blank', 'noopener')} />
        ) : !model.homeKnown && !model.place ? (
          <WhereCard locating={locating} onLocation={onToggleLocation} />
        ) : (
          <NearbyRail items={model.shown} cityName={model.place ? model.place.name.split(',')[0] : cityName} selectedId={null} onSelect={model.select} weather={weather} />
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
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2, zIndex: 10 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.md, zIndex: 10 },
});
