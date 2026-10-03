import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CitylessCard, CourtSheet, FilterChips, HitSheet, MapCredit, YouSheet, MapButtons, MapTopBar, NearbyRail, PlayerSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import { CourtSpinner } from '@/components/CourtSpinner';
import { CardStage } from '@/components/map/CardStage';
import { MapCanvas, type CanvasMarker, type MapCanvasHandle } from '@/components/map/MapCanvas';
import { cardLook, lookFor } from '@/components/map/look';
import { clusterTemplates, courtLift, youLift } from '@/components/map/markers';
import { mapMarkers } from '@/components/map/pinList';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { milesBetween } from '@/features/players/geo';
import { useMapModel } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, onTeenMap } from '@/features/players/mapPrivacy';
import { useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { askToHit } from '@/features/players/courtLink';
import { isOpenToHit } from '@/features/players/openToHit';
import { useBarInset } from '@/features/navigation/barInset';
import { useWeather } from '@/features/players/useWeather';
import { show as showToast } from '@/lib/toast';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { useStartMapHold } from '@/features/feed/warmup';
import { colors, radius, spacing } from '@/theme';

const HEIGHT = 330;
/** How far in the map starts: roughly a city. */
const CITY_ZOOM = 11.5;
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;

export type { NearbyMapProps };

/**
 * The browser fetches its map engine separately and starts it early (see
 * NearbyMap.web). On the phone the map is part of the app already: nothing
 * to fetch, so nothing to do.
 */
export function preloadNearbyMap() {}
/** In the browser: once the map engine asked for is in. On the phone there is nothing to wait for. */
export function nearbyMapSettled(): Promise<void> { return Promise.resolve(); }

/**
 * A real map of who is around you and where to play, in the app's own
 * warm-paper look (the same vector map the browser draws, inside a web view —
 * not Apple's stock map). Players appear only where they last shared their
 * location, the way Snapchat's map works: no shared spot, no pin, and never
 * placed by the city on their profile.
 *
 * In the Find Players tab it is a still card: your city, its courts as quiet
 * dots and the open hits in town; any tap opens the full map. Opened, it is
 * the whole page: search (players, courts, places), filters, the courts
 * layer, hit flags, a rail of the nearest players along the bottom, and a
 * card for whoever or whatever you tap.
 */
export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation, focusCourt, focusHit, focusUser, focusSpot, holdPins = false } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  // The still card takes the place names off: it sets your city's name in the middle itself.
  const look = useMemo(() => (expanded ? lookFor(themes[theme]) : cardLook(lookFor(themes[theme]))), [theme, expanded]);
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const barInset = useBarInset();
  const { followingIds, actions, mapLive, mapVisibility, teenMap } = useApp();
  // Who can see you on the map (migration 63): from your card and the location button, once there is a choice to make.
  const choosing = canChooseVisibility(mapLive, me, teenMap);
  // A teen (migration 78) is shared only with friends who follow them back, and with nobody until they say so.
  const teen = onTeenMap(me, teenMap);
  const hiddenMe = choosing && (mapVisibility === 'none' || (teen && mapVisibility == null));
  // The "Open to hit today" switch on your card: a teen who never said who sees them is asked first.
  const toggleOpen = useOpenToHitToggle();
  // Your own pin, tapped: the card with your open-to-hit switch.
  const [meOpen, setMeOpen] = useState(false);
  const openToHit = isOpenToHit(me);
  const model = useMapModel(me, players, at, focusCourt, !expanded, focusHit, focusUser, focusSpot, !!locationOn);
  // The still card on the start page holds the opening curtain until its streets are drawn (see warmup).
  const painted = useStartMapHold(!expanded && (!!model.city || model.cityPending));
  // Anything else picked (a search result, a pin) takes the place of your own card.
  useEffect(() => { if (model.selected || model.selectedCourt || model.selectedHit) setMeOpen(false); }, [model.selected, model.selectedCourt, model.selectedHit]);
  const { home, start } = model;
  // The full map opens where you are; the still card on your town (location on) or your profile's city.
  const view = expanded ? { center: start.center, zoom: start.zoom ?? CITY_ZOOM } : { center: model.city ?? start.center, zoom: CITY_ZOOM };
  const weather = useWeather(home);
  const cityName = model.cityName;
  const canvas = useRef<MapCanvasHandle | null>(null);
  // A fix arriving after the map is up moves the map to it.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    // Opened on a tagged court or a hit, the map stays there; the still card stays on your city.
    if (expanded && model.homeKnown && !focusCourt && !focusHit && !focusSpot) canvas.current?.flyTo(home, CITY_ZOOM, 600);
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  // The still card follows a change of city on the profile.
  const cityKey = model.city ? `${model.city.lat},${model.city.lng}` : '';
  useEffect(() => { if (!expanded && model.city) canvas.current?.flyTo(model.city, CITY_ZOOM, 0); }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking someone, a court, a hit, or typing a city takes the map there.
  useEffect(() => { if (model.selected) canvas.current?.flyTo(model.selected.at, CLOSE_ZOOM); }, [model.selected]);
  // A court's card is tall (who may play, right now, what players say): its court lands above it, not under it.
  useEffect(() => { if (model.selectedCourt) canvas.current?.flyTo(model.selectedCourt, CLOSE_ZOOM, 500, -courtLift(windowH)); }, [model.selectedCourt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.selectedHit) canvas.current?.flyTo(model.selectedHit.at, CLOSE_ZOOM); }, [model.selectedHit]);
  // Your card up: your pin glides into the clear strip above it, so the ring switching on is there to see.
  useEffect(() => { if (meOpen && model.mePos) canvas.current?.flyTo(model.mePos, undefined, 500, -youLift(windowH)); }, [meOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.place) canvas.current?.flyTo(model.place, CITY_ZOOM, 700); }, [model.place]);

  const shown = expanded ? model.shown : model.inCity;
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const selectedHitId = model.selectedHit?.hit.id ?? null;
  // Everything drawn on the map, the same list the browser's map draws (pinList).
  const markers = useMemo<CanvasMarker[]>(
    () => mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe }),
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, theme, openToHit, model.mePos, hiddenMe], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // What "+N" pins look like, in this theme's colours.
  const tpl = useMemo(() => clusterTemplates(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapView = (
    <MapCanvas
      ref={canvas}
      center={view.center}
      zoom={view.zoom}
      look={look}
      interactive={expanded}
      markers={markers}
      tpl={tpl}
      // The full map's first pins come in as one wave (once any sheet over it has gone); a tap on "+N" zooms in clear of the bars and the tray.
      popIn={expanded}
      onPainted={expanded ? undefined : painted}
      holdPins={expanded && holdPins}
      pad={{ top: insets.top + 120, bottom: 250, left: 50, right: 50 }}
      onTap={(id) => {
        // The still card is one button: any tap on it opens the full map.
        if (!expanded) { onExpand?.(); return; }
        if (id === 'me') { model.select(null); model.selectCourt(null); model.selectHit(null); setMeOpen(true); }
        else if (id.startsWith('c:')) { setMeOpen(false); model.selectCourt(id.slice(2)); }
        else if (id.startsWith('h:')) { setMeOpen(false); model.selectHit(id.slice(2)); }
        else if (id.startsWith('p:')) { setMeOpen(false); model.select(id.slice(2)); }
      }}
      onMapTap={() => { model.select(null); model.selectCourt(null); model.selectHit(null); setMeOpen(false); }}
      // Courts and their rings for where the map came to rest, zoomed in on a town (both check the zoom); and who is in view.
      onMove={(c, zoom, bounds) => { if (!expanded) return; model.loadRings(c, zoom); if (model.courtsOn) void model.loadCourts(c, zoom); model.loadPlayersIn(bounds); }}
    />
  );

  if (!expanded && !model.city) {
    // A city still being looked up holds the card's place; no city at all asks for one.
    return model.cityPending ? <View style={[styles.card, styles.waiting]}><CourtSpinner size={24} /></View> : <CitylessCard onOpenMap={onExpand} />;
  }
  if (!expanded) {
    return (
      <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players, courts and hits near you" onPress={onExpand} disabled={!onExpand} style={styles.card}>
        {mapView}
        <PreviewOverlay cityName={cityName} count={model.inCity.length} placeCount={model.cardCourts.length} hitCount={model.cardHits.length} weather={weather} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} />
        <MapCredit align="right" style={{ position: 'absolute', right: 10, bottom: 10 }} />
      </Pressable>
    );
  }

  // Which card is up: yours, a player's, a court's, a hit's, or none (the tray; or, not knowing where you are, the card asking).
  const stageKey = meOpen ? 'me'
    : model.selected ? `p:${model.selected.user.id}`
      : model.selectedCourt ? `c:${model.selectedCourt.id}`
        : model.selectedHit ? `h:${model.selectedHit.hit.id}`
          : !model.homeKnown && !model.place ? 'where' : 'tray';
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
      {mapView}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} locationOn={locationOn} locating={locating} onToggleLocation={onToggleLocation} results={model.courtResults} onPickCourt={model.pickCourt} locationMenu={choosing} />
        <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
      </View>
      <View pointerEvents="box-none" style={styles.bottom}>
        {/* What is up along the bottom (the tray or a card) glides in and out, the map's buttons riding on top of it: CardStage. */}
        <CardStage
          cardKey={stageKey}
          kind={stageKey === 'tray' || stageKey === 'where' ? 'tray' : 'card'}
          crown={<View pointerEvents="box-none" style={styles.crown}><MapButtons onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); canvas.current?.flyTo(model.homeView.center, model.homeView.zoom ?? CITY_ZOOM, 600); }} /></View>}
        >
          {stageKey === 'where' ? (
            <WhereCard locating={locating} onLocation={onToggleLocation} />
          ) : stageKey === 'tray' ? (
            <NearbyRail items={model.tray} cityName={model.place ? model.place.name.split(',')[0] : cityName} selectedId={null} onSelect={model.select} weather={weather} query={model.query} filter={model.filter} courts={model.nearestCourts} onPickCourt={model.selectCourt} />
          ) : meOpen ? (
            <YouSheet me={me} open={openToHit} teen={teen} onToggle={(on) => { void toggleOpen(on); }} onProfile={() => { setMeOpen(false); router.push('/(tabs)/profile'); }} onClose={() => setMeOpen(false)} seenBy={mapVisibility} onSeenBy={choosing ? () => { void askWhoSeesYou('manage'); } : undefined} />
          ) : model.selected ? (
            <PlayerSheet placed={model.selected} following={followingIds.includes(model.selected.user.id)} onClose={() => model.select(null)} onProfile={() => onOpen(model.selected!.user.id)} onMessage={() => message(model.selected!.user.id)} onAskToHit={actions.canMessage(model.selected.user.id) ? () => askToHit([model.selected!.user.id]) : undefined} onAddToGroup={() => addToGroup(model.selected!.user.id)} onFollow={() => { const who = model.selected!.user; if (followingIds.includes(who.id)) confirmUnfollow(who, () => actions.toggleFollow(who.id)); else actions.toggleFollow(who.id); }} />
          ) : model.selectedCourt ? (
            <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} ringed={model.ringed.has(model.selectedCourt.id)} onClose={() => model.selectCourt(null)} />
          ) : model.selectedHit ? (
            <HitSheet hit={model.selectedHit.hit} miles={milesBetween(home, model.selectedHit.at)} onClose={() => model.selectHit(null)} />
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
  waiting: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2 },
  // The map's buttons, riding on whatever is up along the bottom.
  crown: { marginBottom: spacing.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', gap: spacing.md },
});
