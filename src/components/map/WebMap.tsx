import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CitylessCard, CourtSheet, CourtsZoomNote, FilterChips, HitSheet, MapCredit, YouSheet, MapButtons, MapTopBar, NearbyRail, PlaceSheet, PlayerSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import { CardStage } from '@/components/map/CardStage';
import { CARD_HEIGHT, CARD_ZOOM, cardView } from '@/components/map/cardFit';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { placeZoom } from '@/features/places/geocode';
import { milesBetween } from '@/features/players/geo';
import { COURTS_MIN_ZOOM, useMapModel } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, nearbyLock, onTeenMap } from '@/features/players/mapPrivacy';
import { useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { askToHit } from '@/features/players/courtLink';
import { isOpenToHit } from '@/features/players/openToHit';
import { useOpenClock } from '@/features/players/useOpenClock';
import { useBarInset } from '@/features/navigation/barInset';
import { show as showToast } from '@/lib/toast';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { levelBadge } from '@/lib/badges';
import { useWeather } from '@/features/players/useWeather';
import { colors, radius, spacing, typography } from '@/theme';
import { STYLE, applyLook, cardLook, lookFor } from '@/components/map/look';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, MAP_PIN_CSS, SHORT_ZOOM, clusterTemplates, courtLift, youLift } from '@/components/map/markers';
import { CARD_BOX, FULL_MAP_BOX, PIN_ENGINE_JS, type PinEngine, type PinEngineFactory } from '@/components/map/pinEngine';
import { mapMarkers } from '@/components/map/pinList';
import { PAINT_WATCH_JS } from '@/components/map/engineLoader';
import { MapCardFailed, MapCardLoading, MapLoadPill } from '@/components/map/MapLoadState';
import { useMapLoad } from '@/components/map/useMapLoad';
import { useStartMapHold } from '@/features/feed/warmup';

// The court pictures in chats (CourtMapThumb) fetch their drawing through
// this file too. With two separate files each fetching the map engine, the
// bundler moved the engine (about a megabyte) into the app's first download
// for everyone, sign-in page included. One door in keeps it out.
export { snapshotMap } from '@/components/map/snapshotWeb';

const HEIGHT = CARD_HEIGHT;
const START_ZOOM = 11.5;
/**
 * The pins' engine: the very text the phone's map runs inside its web view
 * (pinEngine), made into a function here, so the browser and the phone
 * gather, split and cascade their pins the same way.
 */
const makePins = new Function(`return ${PIN_ENGINE_JS}`)() as PinEngineFactory;
/** When a map is up and has first drawn, fetching again any streets that failed: the very text the phone's page runs (engineLoader). */
const watchPaint = new Function(`return ${PAINT_WATCH_JS}`)() as (map: maplibregl.Map, tell: (what: 'up' | 'painted' | 'fail' | 'tiles' | 'retry', why?: string) => void) => { stop: () => void };
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;
// MapLibre does its heavy lifting in a background worker script. The bundler
// cannot find that file on its own, so a copy ships in public/ and the map is
// pointed at it — under the site's base path on GitHub Pages.
const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
maplibregl.setWorkerUrl(`${BASE}/maplibre/maplibre-gl-worker.mjs`);

/**
 * A real map of who is around you and where to play, in the browser, drawn
 * by MapLibre — the same vector-map engine behind modern map apps. Players
 * appear only where they last shared their location (no shared spot, no pin,
 * never placed by their profile's city); courts and open hits have their own
 * marks. The controls laid over it are shared with the phone.
 */
export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation, focusCourt, focusHit, focusUser, focusSpot, focusPlace, holdPins = false, hitCount, inviting = false } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { theme, night } = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const { followingIds, actions, mapLive, mapVisibility, teenMap, lastSeen } = useApp();
  // Who can see you on the map (migration 63): from your card and the location button, once there is a choice to make.
  const choosing = canChooseVisibility(mapLive, me, teenMap);
  // A teen (migration 78) is shared only with friends who follow them back, and with nobody until they say so.
  const teen = onTeenMap(me, teenMap);
  const hiddenMe = choosing && (mapVisibility === 'none' || (teen && mapVisibility == null));
  // Since migration 98 you share to see: what keeps "Players nearby" from you
  // (Location off, or Only me), said by the tray and the still card, with the tap that changes it.
  const lock = nearbyLock({ mapLive, me, mapVisibility, locationOn: !!locationOn, hasSpot: !!lastSeen[me.id] });
  const unlock = lock === 'hidden' ? () => { void askWhoSeesYou('manage'); } : onToggleLocation;
  // The "Open to hit today" switch on your card: a teen who never said who sees them is asked first.
  const toggleOpen = useOpenToHitToggle();
  // Your own pin, tapped: the card with your open-to-hit switch.
  const [meOpen, setMeOpen] = useState(false);
  // Your ring (and your card's switch) go out by themselves at the time you picked.
  useOpenClock([me.openToHitUntil]);
  const openToHit = isOpenToHit(me);
  const model = useMapModel(me, players, at, focusCourt, !expanded, focusHit, focusUser, focusSpot, !!locationOn, focusPlace);
  // The still card on the start page holds the opening curtain until its streets are drawn (see warmup).
  const painted = useStartMapHold(!expanded && (!!model.city || model.cityPending));
  // The still card fades in whole once its map has drawn (Oct 4, owner). Until
  // then it shows only its loading look, however long that takes, and if the
  // map never comes after every retry, only "Map didn't load · Tap to try
  // again" (Oct 5, owner): never the city and its players over a blank map.
  const [cardShown, setCardShown] = useState(false);
  // The loading look underneath goes once the map's fade-in has finished.
  const [loaderGone, setLoaderGone] = useState(false);
  useEffect(() => { if (!cardShown) return undefined; const t = setTimeout(() => setLoaderGone(true), 450); return () => clearTimeout(t); }, [cardShown]);
  // Getting the map going, and again if its style never arrives (useMapLoad): each try is a new map.
  const load = useMapLoad(expanded ? 'full map' : 'map card');
  // Anything else picked (a search result, a pin) takes the place of your own card.
  useEffect(() => { if (model.selected || model.selectedCourt || model.selectedHit) setMeOpen(false); }, [model.selected, model.selectedCourt, model.selectedHit]);
  const { home, start } = model;
  // The full map opens where you are; the still card on your town (location on) or your profile's city.
  // The still card: your town (location on) or your profile's city, taking in
  // everyone its "players around" counts, so the count never sits over an empty map (cardView, as on the phone).
  const { width: windowW } = useWindowDimensions();
  const [cardW, setCardW] = useState(0);
  const cardAt = useMemo(
    () => (expanded || !model.city ? null : cardView(model.city, model.inCity.map((p) => p.at), cardW || windowW - 2 * spacing.lg)),
    [expanded, model.city, model.inCity, cardW, windowW],
  );
  const view = expanded ? { center: start.center, zoom: start.zoom ?? START_ZOOM } : cardAt ?? { center: start.center, zoom: CARD_ZOOM };
  // Zoomed out past about a city: the court pins step aside (pinList), and a note says so.
  // Told the moment the zoom crosses it (as on the phone), kept in a ref so a pinch only sets it on the crossing.
  const [far, setFar] = useState(() => view.zoom < COURTS_MIN_ZOOM);
  const farNow = useRef(far);
  const weather = useWeather(home);
  const cityName = model.cityName;
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Which map the marks are on: a new one (a new look, or your location arriving
  // and the map starting again there) counts up, so every mark is drawn onto it afresh.
  const [mapGen, setMapGen] = useState(0);
  const latest = useRef({ onOpen, select: model.select, selectCourt: model.selectCourt, selectHit: model.selectHit, loadCourts: model.loadCourts, loadRings: model.loadRings, loadPlayersIn: model.loadPlayersIn, courtsOn: model.courtsOn, openMe: () => undefined as void, expand: onExpand });
  // A pin tapped while your own card is up swaps your card for its one (as on the phone), rather than staying behind it.
  latest.current = {
    onOpen,
    select: (id: string | null) => { if (id) setMeOpen(false); model.select(id); },
    selectCourt: (id: string | null) => { if (id) setMeOpen(false); model.selectCourt(id); },
    selectHit: (id: string | null) => { if (id) setMeOpen(false); model.selectHit(id); },
    loadCourts: model.loadCourts, loadRings: model.loadRings, loadPlayersIn: model.loadPlayersIn, courtsOn: model.courtsOn,
    openMe: () => { if (expanded) { model.select(null); model.selectCourt(null); model.selectHit(null); setMeOpen(true); } else onExpand?.(); },
    expand: onExpand,
  };
  // The pins on the map now (pinEngine), and whether this visit's first ones have cascaded in yet: a map made again (a new look) never replays it.
  const pinsOn = useRef<PinEngine | null>(null);
  const cascaded = useRef(false);
  // Held while "Who can see you on the map?" is over the map, read when a map is made.
  const holdNow = useRef(expanded && holdPins);
  holdNow.current = expanded && holdPins;
  // Where the full map was looking when it last came to rest, so a map made again (a new theme) stays there.
  const camera = useRef<{ center: [number, number]; zoom: number } | null>(null);

  // The map itself: made once per look, kept across everything else. Your
  // location arriving moves it (below) rather than making it again, which
  // faded every pin out and in and reloaded the map under the first-time flow.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const opening = (expanded && camera.current) || { center: [view.center.lng, view.center.lat] as [number, number], zoom: view.zoom };
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: el,
        style: STYLE,
        center: opening.center,
        zoom: opening.zoom,
        interactive: expanded,
        attributionControl: false,
        // Handled below, so a two-finger scroll pans and a pinch zooms.
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (error) {
      load.failed(`start: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    load.heard('boot');
    // First of all, before anything else listens: when the map is up, when it has drawn
    // (the curtain over the start page may lift onto it, and the card fades in), or that it failed.
    const watch = watchPaint(instance, (what, why) => {
      if (what === 'fail') { load.failed(why ?? 'failed'); return; }
      if (what === 'up') { load.heard('up'); return; }
      // Streets arriving, or failed ones being fetched again: still alive.
      if (what !== 'painted') { load.heard('other'); return; }
      requestAnimationFrame(() => { load.heard('painted'); if (!expanded) { painted(); setCardShown(true); } });
    });
    instance.touchZoomRotate.disableRotation();
    // The theme's colours go on as soon as the style's layers exist, before
    // anything is drawn, and with no fade (applyLook). Waiting for 'load'
    // (after the first full drawing) showed the plain style's own pale map,
    // with every street name, for a moment each time a map was made: a white
    // flash on a dark theme.
    instance.on('style.load', () => applyLook(instance, expanded ? lookFor(themes[theme]) : cardLook(lookFor(themes[theme]))));
    // The pins' shared styles, once per page, and the zoom classes they answer to.
    if (!document.getElementById('cs-pin-css')) { const css = document.createElement('style'); css.id = 'cs-pin-css'; css.textContent = MAP_PIN_CSS; document.head.appendChild(css); }
    const zoomClass = () => {
      const z = instance.getZoom();
      el.classList.toggle('cs-close', z >= CLOSE_ZOOM_NAMES); el.classList.toggle('cs-far', z < FAR_ZOOM); el.classList.toggle('cs-short', z < SHORT_ZOOM);
      const isFar = z < COURTS_MIN_ZOOM;
      if (expanded && isFar !== farNow.current) { farNow.current = isFar; setFar(isFar); }
    };
    // The still card: its pins only show who is there; the card itself takes the tap.
    el.classList.toggle('cs-quiet', !expanded);
    zoomClass();
    instance.on('zoom', zoomClass);
    instance.on('click', () => { latest.current.select(null); latest.current.selectCourt(null); latest.current.selectHit(null); setMeOpen(false); });
    // Courts and their rings for where the map came to rest: asked once it
    // has been still a moment, not on every frame of a scroll, and only zoomed
    // in on a town (both check the zoom). Rings come with the courts layer off
    // too. The still card never asks.
    let courtsTimer: ReturnType<typeof setTimeout> | null = null;
    instance.on('moveend', () => {
      if (!expanded) return;
      if (courtsTimer) clearTimeout(courtsTimer);
      courtsTimer = setTimeout(() => {
        const c = instance.getCenter();
        const b = instance.getBounds();
        camera.current = { center: [c.lng, c.lat], zoom: instance.getZoom() };
        latest.current.loadRings({ lat: c.lat, lng: c.lng }, instance.getZoom());
        if (latest.current.courtsOn) void latest.current.loadCourts({ lat: c.lat, lng: c.lng }, instance.getZoom());
        // Who is in view (migration 63 answers for one part of the map at a time).
        latest.current.loadPlayersIn({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() });
      }, 250);
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
    // Every pin, through the same engine as the phone's map. A tap on one does what a tap does there.
    pinsOn.current = makePins(instance, maplibregl, {
      popIn: expanded && !cascaded.current,
      hold: holdNow.current,
      cascaded: () => { cascaded.current = true; },
      quiet: !expanded,
      box: expanded ? FULL_MAP_BOX : CARD_BOX,
      pad: { top: 130, bottom: 260, left: 60, right: 60 },
      tap: (id: string) => {
        const now = latest.current;
        // The still card is one button: any tap on it opens the full map.
        if (!expanded) { now.expand?.(); return; }
        if (id === 'me') now.openMe();
        else if (id.startsWith('c:')) now.selectCourt(id.slice(2));
        else if (id.startsWith('h:')) now.selectHit(id.slice(2));
        else if (id.startsWith('p:')) now.select(id.slice(2));
      },
    });
    map.current = instance;
    setMapGen((n) => n + 1);
    const settle = setTimeout(() => { instance.resize(); instance.jumpTo({ center: opening.center }); }, 60);
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
    watcher?.observe(el);
    return () => {
      clearTimeout(settle);
      if (courtsTimer) clearTimeout(courtsTimer);
      if (frame) cancelAnimationFrame(frame);
      watcher?.disconnect();
      el.removeEventListener('wheel', onWheel);
      pinsOn.current?.destroy();
      pinsOn.current = null;
      watch.stop();
      instance.remove();
      map.current = null;
    };
  }, [expanded, theme, !expanded && !model.city, load.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Given up on: the opening curtain stops waiting for the card's map, and the card says so.
  useEffect(() => { if (!expanded && load.status === 'failed') painted(); }, [load.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet over the map has gone: the first pins come in.
  useEffect(() => { pinsOn.current?.hold(expanded && holdPins); }, [expanded, holdPins, mapGen]);
  // A fix arriving after the map is up moves the map to it (as on the phone);
  // opened on a tagged court, a hit or a spot, or looking at a place searched for, the map stays there.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    if (expanded && model.homeKnown && !focusCourt && !focusHit && !focusSpot && !model.place && !model.selected) map.current?.flyTo({ center: [home.lng, home.lat], zoom: START_ZOOM, duration: 600 });
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  // The still card follows a change of city on the profile, and players coming in further out than it shows.
  const cardKey = cardAt ? `${cardAt.center.lat.toFixed(5)},${cardAt.center.lng.toFixed(5)},${cardAt.zoom}` : '';
  useEffect(() => { if (cardAt) map.current?.jumpTo({ center: [cardAt.center.lng, cardAt.center.lat], zoom: cardAt.zoom }); }, [cardKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pins: the same list the phone's map draws (pinList), handed to the engine, which keeps
  // each pin between changes and gathers, splits and fades them (pinEngine).
  const shown = expanded ? model.shown : model.inCity;
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const selectedHitId = model.selectedHit?.hit.id ?? null;
  const markers = useMemo(
    () => mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe }),
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, night, theme, openToHit, model.mePos, hiddenMe], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // What "+N" pins look like, in this theme's colours.
  const tpl = useMemo(() => clusterTemplates(), [theme, night]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { pinsOn.current?.set({ items: markers, tpl }); }, [markers, tpl, mapGen]);

  // Picking someone, a court, a hit, or typing a city takes the map there.
  // (Again on a map made afresh, as when your location lands: a player opened from "Who's up today" stays in view.)
  // A beat later than the new map's own settling (its jump back to the middle), so the move is not undone.
  useEffect(() => {
    const at = model.selected?.at;
    if (!at) return undefined;
    const t = setTimeout(() => { const m = map.current; if (m) m.flyTo({ center: [at.lng, at.lat], zoom: Math.max(m.getZoom(), CLOSE_ZOOM), duration: 500 }); }, 90);
    return () => clearTimeout(t);
  }, [model.selected?.user.id, mapGen]); // eslint-disable-line react-hooks/exhaustive-deps
  // A court's card is tall (who may play, right now, what players say): its court lands above it, not under it.
  // Keyed on which court or hit is picked, not the object: courts and hits reloading must not pull the map back.
  useEffect(() => { if (model.selectedCourt) map.current?.flyTo({ center: [model.selectedCourt.lng, model.selectedCourt.lat], zoom: Math.max(map.current.getZoom(), CLOSE_ZOOM), duration: 500, offset: [0, -courtLift(host.current?.clientHeight ?? 800)] }); }, [model.selectedCourt?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.selectedHit) map.current?.flyTo({ center: [model.selectedHit.at.lng, model.selectedHit.at.lat], zoom: Math.max(map.current.getZoom(), CLOSE_ZOOM), duration: 500 }); }, [model.selectedHit?.hit.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Your card up: your pin glides into the clear strip above it, so the ring switching on is there to see.
  useEffect(() => { if (meOpen && model.mePos) map.current?.flyTo({ center: [model.mePos.lng, model.mePos.lat], zoom: map.current.getZoom(), duration: 500, offset: [0, -youLift(host.current?.clientHeight ?? 800)] }); }, [meOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // A place picked from the search: exactly as close as it needs (placeZoom), out as well as in, so its court pins show;
  // set in the clear above its list of courts, the way a court sits above its card (as on the phone).
  // A beat later than a new map's own settling (its jump back to the middle), so opening on a place is not undone.
  useEffect(() => {
    const p = model.place;
    if (!p) return undefined;
    const t = setTimeout(() => map.current?.flyTo({ center: [p.lng, p.lat], zoom: placeZoom(p, COURTS_MIN_ZOOM), duration: 700, offset: [0, -courtLift(host.current?.clientHeight ?? 800)] }), 90);
    return () => clearTimeout(t);
  }, [model.place]);

  // On the still card the pins say nothing a screen reader needs (the card says it all, and takes the tap).
  const canvas = <div ref={host} aria-hidden={expanded ? undefined : true} style={{ position: 'absolute', inset: 0, background: colors.bg }} />;

  if (!expanded && !model.city) {
    // A city still being looked up holds the card's place, looking as the map will while it loads; no city at all asks for one.
    return model.cityPending ? <View style={styles.card}><MapCardLoading /></View> : <CitylessCard onOpenMap={onExpand} />;
  }
  if (!expanded) {
    const failed = load.status === 'failed' && !cardShown;
    return (
      <View style={styles.card} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== cardW) setCardW(w); }}>
        {/* Under the map, until it has drawn and faded in over it. Given up on, a tap tries again; still loading, it opens the full map. */}
        {!loaderGone ? (failed ? <MapCardFailed /> : <MapCardLoading />) : null}
        {!cardShown ? (
          <Pressable
            accessibilityRole={failed || onExpand ? 'button' : undefined}
            accessibilityLabel={failed ? "The map didn't load. Tap to try again" : 'Map of players, courts and hits near you'}
            onPress={failed ? load.restart : onExpand}
            disabled={!failed && !onExpand}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View aria-hidden={!cardShown} style={[StyleSheet.absoluteFill, !cardShown && styles.noTaps, { opacity: cardShown ? 1 : 0, transform: [{ scale: cardShown ? 1 : 0.985 }], transition: 'opacity 420ms cubic-bezier(0.33, 1, 0.68, 1), transform 420ms cubic-bezier(0.33, 1, 0.68, 1)' } as object]}>
          {canvas}
          {/* A still card: the tap goes to the full map, not to the tiles. */}
          <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players, courts and hits near you" onPress={onExpand} disabled={!onExpand} style={StyleSheet.absoluteFill} />
          <PreviewOverlay cityName={cityName} count={model.inCity.length} placeCount={model.cardCourts.length} hitCount={hitCount !== undefined && model.cardFromYou ? hitCount : model.cardHits.length} weather={weather} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} lock={lock} inviting={inviting} />
          <MapCredit align="right" style={{ position: 'absolute', right: 10, bottom: 10 }} />
        </View>
      </View>
    );
  }

  // Which card is up: yours, a player's, a court's, a hit's, or none (the tray; or, not knowing where you are, the card asking).
  const stageKey = meOpen ? 'me'
    : model.selected ? `p:${model.selected.user.id}`
      : model.selectedCourt ? `c:${model.selectedCourt.id}`
        : model.selectedHit ? `h:${model.selectedHit.hit.id}`
          : model.place ? `place:${model.place.id}`
            : !model.homeKnown ? 'where' : 'tray';
  // Locked (checked with the server first), it says why in a note that stays to be read.
  const message = async (id: string) => {
    const lock = await actions.messageLock(id);
    if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; }
    router.push(`/messages/${actions.openConversationWith(id)}`);
  };
  // Into one of your groups (the sheet says if they can't be).
  const addToGroup = (id: string) => router.push({ pathname: '/pick-group', params: { user: id } });
  return (
    <View style={styles.fill}>
      {canvas}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} results={model.courtResults} onPickCourt={model.pickCourt} places={model.placeSearch} onPickPlace={model.pickPlace} players={model.query.trim() ? model.tray.length : 0} locationMenu={choosing} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
        {model.courtsOn && far && !model.selectedCourt && !model.query.trim() ? <CourtsZoomNote /> : null}
        {/* Slow to come, or didn't: a small pill under the chips, clear of the pins around you (as on the phone). */}
        <MapLoadPill status={load.status} onRetry={load.restart} />
      </View>
      <View pointerEvents="box-none" style={styles.bottom}>
        {/* What is up along the bottom (the tray or a card) glides in and out, the map's buttons riding on top of it: CardStage. */}
        <CardStage
          cardKey={stageKey}
          kind={stageKey === 'tray' || stageKey === 'where' ? 'tray' : 'card'}
          crown={<View pointerEvents="box-none" style={styles.crown}><MapButtons onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); model.clearPlace(); map.current?.flyTo({ center: [model.homeView.center.lng, model.homeView.center.lat], zoom: model.homeView.zoom ?? START_ZOOM, duration: 600 }); }} onZoomIn={() => map.current?.zoomIn()} onZoomOut={() => map.current?.zoomOut()} /></View>}
        >
          {stageKey === 'where' ? (
            <WhereCard locating={locating} onLocation={onToggleLocation} />
          ) : stageKey === 'tray' ? (
            <NearbyRail items={model.tray} cityName={cityName} selectedId={null} onSelect={model.select} weather={weather} query={model.query} filter={model.filter} courts={model.nearestCourts} onPickCourt={model.selectCourt} lock={lock} onUnlock={unlock} />
          ) : meOpen ? (
            <YouSheet me={me} open={openToHit} teen={teen} onToggle={(on) => { void toggleOpen(on); }} onProfile={() => { setMeOpen(false); router.push('/(tabs)/profile'); }} onClose={() => setMeOpen(false)} seenBy={mapVisibility} onSeenBy={choosing ? () => { void askWhoSeesYou('manage'); } : undefined} />
          ) : model.selected ? (
            <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onAskToHit={actions.canMessage(model.selected.user.id) ? () => askToHit([model.selected!.user.id]) : undefined} onAddToGroup={() => addToGroup(model.selected!.user.id)} onFollow={() => { const who = model.selected!.user; if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id)); else actions.toggleFollow(who.id); }} />
          ) : model.selectedCourt ? (
            <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} ringed={model.ringed.has(model.selectedCourt.id)} onClose={() => model.selectCourt(null)} />
          ) : model.selectedHit ? (
            <HitSheet hit={model.selectedHit.hit} miles={milesBetween(home, model.selectedHit.at)} onClose={() => model.selectHit(null)} />
          ) : model.place ? (
            <PlaceSheet place={model.place} rows={model.placeRows} loading={model.placeLoading} failed={model.placeFailed} onPickCourt={model.pickCourt} onRetry={model.retryPlace} onClose={model.clearPlace} played={model.ringFor} />
          ) : null}
        </CardStage>
        {/* The tray's own colour runs on beneath the floating tab bar, so no map shows between them. */}
        {barInset ? <View style={{ height: barInset, backgroundColor: colors.surface, marginTop: -spacing.md - 1 }} /> : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  // The map still on its way: taps go to the card under it (a compiled style: react-native-web ignores an inline pointerEvents).
  noTaps: { pointerEvents: 'none' },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2, zIndex: 10 },
  // The map's buttons, riding on whatever is up along the bottom.
  crown: { marginBottom: spacing.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.md, zIndex: 10 },
});
