import * as haptics from '@/lib/haptics';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as maplibregl from 'maplibre-gl';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ChipsNoteLine, CitylessCard, CourtSheet, CourtsZoomNote, FilterChips, HitSheet, ListCrown, MapCredit, PIN_FIT_TOP, YouSheet, MapButtons, MapTopBar, PlaceSheet, PlayerSheet, PlayersPill, PlayersSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import { CardStage } from '@/components/map/CardStage';
import { CARD_HEIGHT, CARD_ZOOM, onCard } from '@/components/map/cardFit';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { placeZoom } from '@/features/places/geocode';
import { milesBetween } from '@/features/players/geo';
import { COURTS_MIN_ZOOM, useMapModel } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, nearbyLock, onTeenMap } from '@/features/players/mapPrivacy';
import { useCheckIn, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { askToHit } from '@/features/players/courtLink';
import { isOpenToHit } from '@/features/players/openToHit';
import { useOpenClock } from '@/features/players/useOpenClock';
import { show as showToast } from '@/lib/toast';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { levelBadge } from '@/lib/badges';
import { useWeather } from '@/features/players/useWeather';
import { colors, radius, spacing, typography } from '@/theme';
import { STYLE, applyLook, cardLook, lookFor } from '@/components/map/look';
import { CLOSE_ZOOM_NAMES, FAR_ZOOM, MAP_PIN_CSS, SHORT_ZOOM, clusterTemplates, courtLift, youLift } from '@/components/map/markers';
import { CARD_BOX, FULL_MAP_BOX, PIN_ENGINE_JS, type PinEngine, type PinEngineFactory } from '@/components/map/pinEngine';
import { mapMarkers } from '@/components/map/pinList';
import { livePin } from '@/features/activity/liveSession';
import { PAINT_WATCH_JS } from '@/components/map/engineLoader';
import { MAP_LOADING, softShotAllowed, MAP_REVEAL_CSS, MAP_REVEAL_MS, MapCardFailed, MapCardLoading, MapLoadPill } from '@/components/map/MapLoadState';
import { useMapLoad } from '@/components/map/useMapLoad';
import { useIsFocusedLater } from '@/lib/useIsFocused';
import { curtainState, useStartMapHold } from '@/features/feed/warmup';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { cardHint, hasCardShot, hashText, peekCardShot, peekPlaceShot, saveStreetsShot, setCardHint, shotKey, useCardShots, forgetPlaces, type CardHint } from '@/components/map/cardShot';
import { useCardOnScreen, useHeldCardPlace } from '@/components/map/cardHold';

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

/**
 * Once every face on the pins in `el` has loaded (or 0.8 s at most), and two frames on: what the
 * still card reports as drawn is then exactly what stays on screen (as the phone's page does).
 */
function afterFaces(el: HTMLElement | null, done: () => void) {
  const urls = new Set<string>();
  el?.querySelectorAll<HTMLElement>('.maplibregl-marker, .maplibregl-marker *').forEach((node) => {
    const bg = node.style?.backgroundImage;
    if (!bg || !bg.includes('url(')) return;
    const url = bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).replace(/["']/g, '');
    if (url) urls.add(url);
  });
  let left = urls.size;
  let over = false;
  const end = () => { if (over) return; over = true; requestAnimationFrame(() => requestAnimationFrame(done)); };
  if (!left) { end(); return; }
  setTimeout(end, 800);
  urls.forEach((url) => { const im = new Image(); im.onload = im.onerror = () => { left -= 1; if (left <= 0) end(); }; im.src = url; });
}
/** For testers: ?mapcover=hold (or localStorage courtside-mapcover=hold) keeps the card's picture over its drawn map (see reveal), to compare the two. */
const HOLD_COVER = (() => {
  try { return typeof window !== 'undefined' && (/[?&]mapcover=hold\b/.test(window.location?.search ?? '') || window.localStorage.getItem('courtside-mapcover') === 'hold'); } catch { return false; }
})();
/** Whether a drawn map came out as one flat colour (a canvas that could not be read back). */
function isBlank(canvas: HTMLCanvasElement): boolean {
  try {
    const small = document.createElement('canvas');
    small.width = 8; small.height = 8;
    const g = small.getContext('2d');
    if (!g) return false;
    g.drawImage(canvas, 0, 0, 8, 8);
    const px = g.getImageData(0, 0, 8, 8).data;
    let lo = 999, hi = 0;
    for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo < 6;
  } catch {
    return false;
  }
}
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
 * marks. The controls laid over it are shared with the phone. Nothing lies
 * along the bottom of the full map (Oct 8, owner): the pins carry the faces,
 * and an "All N players" pill beside Back to me opens a short tray of
 * everyone side by side, Snap Map's way (Oct 9), pulled up into the full list.
 */
export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation, focusCourt, focusHit, focusUser, focusSpot, focusPlace, holdPins = false, hitCount, inviting = false, cardHeight, holdCurtain = true } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { theme, night } = useTheme();
  const insets = useSafeAreaInsets();
  // The full map runs without the floating tab bar on phones (AppShell's phoneOnlyHide, owner Oct 8), so
  // under a card only the home indicator is kept, in the card's own colour.
  const barInset = insets.bottom;
  const { followingIds, actions, mapLive, mapVisibility, teenMap, lastSeen, liveSession, courtNow, locationEnabled, remoteLoaded } = useApp();
  // Who can see you on the map (migration 63): from your card and the location button, once there is a choice to make.
  const choosing = canChooseVisibility(mapLive, me, teenMap);
  // A teen (migration 78) is shared only with friends who follow them back, and with nobody until they say so.
  const teen = onTeenMap(me, teenMap);
  const hiddenMe = choosing && (mapVisibility === 'none' || (teen && mapVisibility == null));
  // Only me (or a teen who has not chosen): nothing of where the card is gets kept on this device, its town or its pictures (cardShot).
  // Not known yet counts as Only me: on a cold open the card can paint before the account's settings arrive.
  const noneKnown = mapVisibility === 'none' || hiddenMe;
  const settingsUnknown = isSupabaseConfigured && (!remoteLoaded || (mapVisibility === undefined && mapLive !== false));
  const keepNone = noneKnown || settingsUnknown;
  // Anything kept before Only me (or the teen rule) was known goes as soon as it is.
  useEffect(() => { if (noneKnown && !settingsUnknown) forgetPlaces(me.id); }, [noneKnown, settingsUnknown, me.id]);
  // Playing a live session, checked in at its court (Oct 6): your pin says "Playing now", the court glows. Not on Only me, which nobody sees.
  const playing = livePin(liveSession, courtNow, locationEnabled && !hiddenMe);
  // Since migration 98 you share to see: what keeps "Players nearby" from you
  // (Location off, or Only me), said by the players pill, their list and the still card, with the tap that changes it.
  // The Check in button on the card and the full map (migration 189): the only way your spot is shared.
  const checkIn = useCheckIn(expanded ? 'map' : 'card');
  const lock = nearbyLock({ mapLive, me, mapVisibility, locationOn: !!locationOn, hasSpot: !!lastSeen[me.id] });
  const unlock = lock === 'hidden' ? () => { void askWhoSeesYou('manage'); } : onToggleLocation;
  // The "Open to hit today" switch on your card: a teen who never said who sees them is asked first.
  const toggleOpen = useOpenToHitToggle();
  // Your own pin, tapped: the card with your open-to-hit switch.
  const [meOpen, setMeOpen] = useState(false);
  // Everyone around, opened from the "All N players" pill: a short tray of faces side by side (Oct 9), pulled up into the full list.
  // A player's card opened from it comes back to it on closing.
  const [listOpen, setListOpen] = useState(false);
  // The tray opened into the full list (listStops): a player's card opened from it comes back to the list; the pill opens the tray again.
  const [listTall, setListTall] = useState(false);
  // How far along the tray's faces were scrolled: a player's card opened from it comes back to the same place; the pill starts it again.
  const trayAt = useRef(0);
  // Where the list may reach: the full map's height, and the foot of the filters (it stops under them, so they still work).
  const [mapH, setMapH] = useState(0);
  const [chipsEnd, setChipsEnd] = useState(0);
  // Your ring (and your card's switch) go out by themselves at the time you picked.
  useOpenClock([me.openToHitUntil]);
  const openToHit = isOpenToHit(me);
  // The still card fades in whole once its map has drawn (Oct 4, owner). Until
  // then it shows only its loading look, however long that takes, and if the
  // map never comes after every retry, only "Map didn't load · Tap to try
  // again" (Oct 5, owner): never the city and its players over a blank map.
  // Since Oct 22 (owner: "The map blips in 50% of the time … can we just pre load the map?") a picture
  // of how the card last drew stands in for the loading look when there is one for exactly this look
  // (cardShot): the card already shows its streets, the live pins on them, and the map drawing the
  // same under it changes nothing on screen.
  const [cardShown, setCardShown] = useState(false);
  // The loading look underneath goes once the map's fade-in has finished.
  const [loaderGone, setLoaderGone] = useState(false);
  // Drawn while out of view (the section beside, the tab off screen): no fade to catch mid-swipe, it is just there.
  const [cardSnap, setCardSnap] = useState(false);
  const outOfView = useRef<() => boolean>(() => false);
  useEffect(() => { if (!cardShown) return undefined; const t = setTimeout(() => setLoaderGone(true), MAP_REVEAL_MS + 30); return () => clearTimeout(t); }, [cardShown]);
  // Off screen, the map's load clocks wait (useMapLoad).
  const onScreen = useIsFocusedLater();
  // Scrolled off the screen (reading the list under it) counts as out of view too.
  const spot = useCardOnScreen();
  outOfView.current = () => !onScreen || props.visible === false || props.inView?.() === false || !spot.onScreen();
  /** Whether the card is in view right now: the curtain not over it, its tab and section on show, the page not in the background. */
  const inViewNow = () => curtainState() !== 'up' && !outOfView.current() && (typeof document === 'undefined' || document.visibilityState !== 'hidden');
  // The card's picture: loaded and on screen; and gone, once the map under it has drawn.
  const [photoIn, setPhotoIn] = useState(false);
  const [photoGone, setPhotoGone] = useState(false);
  // Where the card is centred stays put while it is seen (cardHold): a fix landing then waits until it is out of view.
  const place = useHeldCardPlace(expanded, at, !!locationOn, locating, () => (cardShown || photoIn) && inViewNow());
  // The town the card showed last time, with Location on and no fix yet (mapModel): read until it has shown something.
  const shotsVersion = useCardShots();
  const hint = useRef<CardHint | null>(null);
  if (!expanded && !cardShown && !photoIn) hint.current = cardHint(me.id);
  const model = useMapModel(me, players, place.at, focusCourt, !expanded, focusHit, focusUser, focusSpot, place.locationOn, focusPlace, hint.current);
  // A fix held back while the card is seen (cardHold): what the card says comes from the place it shows, not the new fix,
  // so the card and the place it shows never disagree (its open hits, and the "You're early" line under it, wait too).
  const holding = !expanded && (place.locationOn !== !!locationOn || place.at?.lat !== at?.lat || place.at?.lng !== at?.lng);
  const invitingShown = useRef(inviting);
  if (!holding) invitingShown.current = inviting;
  // The still card on the start page holds the opening curtain until it shows its map (see warmup); the feed's copy never does.
  const painted = useStartMapHold(holdCurtain && !expanded && (!!model.city || model.cityPending));
  // Getting the map going, and again if its style never arrives (useMapLoad): each try is a new map.
  const load = useMapLoad(expanded ? 'full map' : 'map card', onScreen && props.visible !== false);
  // Anything else picked (a search result, a pin) takes the place of your own card.
  useEffect(() => { if (model.selected || model.selectedCourt || model.selectedHit || model.place) setMeOpen(false); }, [model.selected, model.selectedCourt, model.selectedHit, model.place]);
  const { home, start } = model;
  // The full map opens where you are; the still card on your town (location on) or your profile's city.
  const view = expanded ? { center: start.center, zoom: start.zoom ?? START_ZOOM } : { center: model.city ?? start.center, zoom: CARD_ZOOM };
  // The still card's "N players around" counts only the faces on it (onCard, as on the phone), so the number and the map agree.
  const { width: windowW } = useWindowDimensions();
  const [cardW, setCardW] = useState(0);
  // The card's picture for exactly this look (cardShot): who, theme, centre, size, lock, Reduce Motion.
  const still = useReducedMotion();
  const pixelScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  // The map's look itself is in the key, so a picture is never shown over a map that draws differently now (an update).
  const lookSig = useMemo(() => hashText(JSON.stringify(cardLook(lookFor(themes[theme]))) + STYLE + MAP_PIN_CSS), [theme]);
  // Never for a card centred on your own spot (far from any town the app knows): nothing of where you are is kept.
  const shotKeyNow = !expanded && model.city && !model.cityExact ? shotKey({ user: me.id, theme, look: lookSig, lat: model.city.lat, lng: model.city.lng, zoom: CARD_ZOOM, w: cardW || Math.round(windowW - 2 * spacing.lg), h: cardHeight ?? HEIGHT, scale: pixelScale, lock: lock ?? 'open', still }) : '';
  // The loading look's extras (MAP_LOADING): your face with Location on ('B'); any picture kept of this place, softened ('D').
  const loadingMe = MAP_LOADING === 'B' && !expanded && place.locationOn && model.mePos ? me : null;
  const loadingSoft = MAP_LOADING === 'D' && softShotAllowed(me) && !expanded && model.city && !model.cityExact ? peekPlaceShot(me.id, model.city.lat, model.city.lng, theme) : null;
  const keyNow = useRef(shotKeyNow);
  keyNow.current = shotKeyNow;
  const [photo, setPhoto] = useState<string | null>(() => peekCardShot(shotKeyNow, '')?.uri ?? null);
  const photoNow = useRef(photo);
  photoNow.current = photo;
  const photoInNow = useRef(photoIn);
  photoInNow.current = photoIn;
  const photoGoneNow = useRef(photoGone);
  photoGoneNow.current = photoGone;
  // A picture for the look now (the city settled, the pictures read), swapped only while nobody can see the card.
  useEffect(() => {
    if (expanded || cardShown) return;
    const next = peekCardShot(shotKeyNow, '')?.uri ?? null;
    if (next === photo || inViewNow()) return;
    setPhotoIn(false);
    setPhotoGone(false);
    setPhoto(next);
  }, [shotKeyNow, shotsVersion, cardShown]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardCenter = model.city ?? start.center;
  const cardPlayers = model.inCity;
  const onCardCount = useMemo(
    () => (expanded ? 0 : cardPlayers.filter((p) => onCard(cardCenter, p.at, cardW || windowW - 2 * spacing.lg, cardHeight ?? HEIGHT)).length),
    [expanded, cardPlayers, cardCenter.lat, cardCenter.lng, cardW, windowW, cardHeight], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Zoomed out past about a city: the court pins step aside (pinList), and a note says so.
  // Told the moment the zoom crosses it (as on the phone), kept in a ref so a pinch only sets it on the crossing.
  const [far, setFar] = useState(() => view.zoom < COURTS_MIN_ZOOM);
  const farNow = useRef(far);
  const weather = useWeather(home);
  const cityName = model.cityName;
  const host = useRef<HTMLDivElement | null>(null);
  const built = useRef(false);
  const inMapPhoto = useRef<HTMLImageElement | null>(null);
  // The picture inside the map itself, straight over its drawing and under its pins: whichever copy of it loads
  // first (this one, or the one over the whole map) decides whether it is taken (takePhoto).
  const [photoInMap, setPhotoInMap] = useState(false);
  /** The picture has loaded: taken only while nobody can see it come (under the curtain, or out of view), and then simply there. */
  const takePhoto = useRef<() => boolean>(() => false);
  takePhoto.current = () => {
    if (photoInNow.current) return true;
    // One that arrives late, in view, is let go, and the loading look stays for its one slow fade.
    if (curtainState() !== 'up' && !outOfView.current()) { setPhoto(null); return false; }
    setCardSnap(true);
    setPhotoIn(true);
    return true;
  };
  const putPhotoInMap = (m: maplibregl.Map, uri: string) => {
    inMapPhoto.current?.remove();
    const img = document.createElement('img');
    img.alt = '';
    img.dataset.src = uri;
    img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
    img.onload = () => { if (inMapPhoto.current === img && takePhoto.current()) setPhotoInMap(true); };
    img.src = uri;
    m.getCanvas().insertAdjacentElement('afterend', img);
    inMapPhoto.current = img;
  };
  // The card's pins as they are now, for a map made afresh to have them from its first frame.
  const pinsNow = useRef<{ items: ReturnType<typeof mapMarkers>; tpl: ReturnType<typeof clusterTemplates> } | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  // Whether this map has said it drew once; and which showing of it a reveal on its way is for (a move before it
  // lands starts a new one, so a card is never shown on a place whose streets have not drawn yet).
  const paintedOnce = useRef(false);
  const revealGen = useRef(0);
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
  // Room kept clear when zooming to fit a "+N": the top's two rows (PIN_FIT_TOP) under the status bar, as on the phone (Oct 11; it was
  // 130 from the window's top). One object the pins read as they zoom, so a status bar measured after the map was made still counts.
  const fitPad = useRef({ top: PIN_FIT_TOP, bottom: 260, left: 60, right: 60 });
  fitPad.current.top = insets.top + PIN_FIT_TOP;
  // Where the full map was looking when it last came to rest, so a map made again (a new theme) stays there.
  const camera = useRef<{ center: [number, number]; zoom: number } | null>(null);

  // The map itself: made once per look, kept across everything else. Your
  // location arriving moves it (below) rather than making it again, which
  // faded every pin out and in and reloaded the map under the first-time flow.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const opening = (expanded && camera.current) || { center: [view.center.lng, view.center.lat] as [number, number], zoom: view.zoom };
    // A card made again (a new theme, its city back) out of sight is covered again, so it is never seen drawing.
    if (!expanded && built.current && outOfView.current()) { setCardSnap(true); setCardShown(false); setLoaderGone(false); setPhotoGone(false); }
    built.current = true;
    paintedOnce.current = false;
    revealGen.current += 1;
    // Opened on a court: its pin lands in the clear above its card, not under it (as when a court is picked).
    const liftOpening = expanded && !camera.current && !!focusCourt;
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
        // Its own size watcher shrinks and redraws the map whenever a page covers it (a zero size):
        // the one below does the same job and skips that (sweep, Oct 18).
        trackResize: false,
        // The still card keeps its drawing readable, for its picture (cardShot), and lays its labels down without a fade.
        ...(expanded ? {} : { canvasContextAttributes: { preserveDrawingBuffer: true }, fadeDuration: 0 }),
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
      paintedOnce.current = true;
      const gen = revealGen.current;
      requestAnimationFrame(() => { load.heard('painted'); if (!expanded) afterFaces(el, () => { if (gen === revealGen.current) revealRef.current(); }); });
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
    // A tap on the map puts away whatever is up (the list of players too), back to the bare map.
    instance.on('click', () => { latest.current.select(null); latest.current.selectCourt(null); latest.current.selectHit(null); setMeOpen(false); setListOpen(false); });
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
      pad: fitPad.current,
      tap: (id: string) => {
        const now = latest.current;
        // The still card is one button: any tap on it opens the full map.
        if (!expanded) { now.expand?.(); return; }
        // The same light tick as the map's other taps (Oct 22 sweep).
        haptics.tap();
        if (id === 'me') now.openMe();
        else if (id.startsWith('c:')) now.selectCourt(id.slice(2));
        else if (id.startsWith('h:')) now.selectHit(id.slice(2));
        else if (id.startsWith('p:')) now.select(id.slice(2));
      },
    });
    map.current = instance;
    if (!expanded) {
      // A map made again (a retry, a new look) while the card shows its picture: the picture and the pins go
      // onto the new one in this same moment, so not a frame of bare ground or a missing pin shows between.
      if (photoNow.current && !photoGoneNow.current) putPhotoInMap(instance, photoNow.current);
      if (pinsNow.current) pinsOn.current.set(pinsNow.current);
    }
    setMapGen((n) => n + 1);
    const settle = setTimeout(() => {
      instance.resize();
      if (liftOpening) instance.easeTo({ center: opening.center, duration: 0, offset: [0, -courtLift(el.clientHeight || 800)] });
      else instance.jumpTo({ center: opening.center });
    }, 60);
    // A zero size means a screen was pushed over the map (or its tab is hidden): skip it, or the map
    // shrinks to its 400x300 stand-in and redraws while no one can see it, then again on Back.
    // Back at the size it had (Find Players shown again after Discussions, which hides it at no size), there is nothing to redo either.
    let sizedW = 0, sizedH = 0;
    const watcher = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w > 0 && h > 0 && (w !== sizedW || h !== sizedH)) { sizedW = w; sizedH = h; instance.resize(); }
    }) : null;
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
      inMapPhoto.current = null;
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
  // The still card follows a change of city on the profile.
  // Out of view once it has drawn (the only time a held move lands, cardHold), it is covered again and
  // shown once the new place has drawn; in view (Location just switched on from the card), it simply goes there.
  const cityKey = model.city ? `${model.city.lat},${model.city.lng}` : '';
  useEffect(() => {
    const m = map.current;
    if (expanded || !model.city || !m) return;
    const again = cardShown && !inViewNow();
    if (again) { stopWait.current(); pinsOn.current?.calm(true); setCardSnap(true); setCardShown(false); setLoaderGone(false); setPhotoGone(false); setPhotoIn(false); }
    // Not shown yet (or covered again): any reveal on its way was for the old place, and the card waits for the new one's streets.
    const fresh = again || !cardShown;
    if (fresh) revealGen.current += 1;
    const gen = revealGen.current;
    m.jumpTo({ center: [model.city.lng, model.city.lat], zoom: CARD_ZOOM });
    if (fresh && paintedOnce.current) m.once('idle', () => afterFaces(host.current, () => { if (gen === revealGen.current) revealRef.current(); }));
  }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The map has drawn: the picture goes (the same streets under it, the same live pins over both), or
  // the loading look fades off once (at once, even under a curtain still lifting, so it never lingers), never mid-swipe.
  const stopWait = useRef<() => void>(() => undefined);
  useEffect(() => () => stopWait.current(), []);
  const reveal = () => {
    stopWait.current();
    // Where the curtain is, read before letting it go: once let go it reads as lifting, and a card drawn
    // under a curtain still fully over it would wait and fade in view instead of simply being there.
    const curtain = curtainState();
    pinsOn.current?.calm(false);
    // A check for testers only (?mapcover=hold): the picture stays over the drawn map, so the two can be compared.
    if (HOLD_COVER && photoNow.current) { (window as unknown as { __mapCardPainted?: boolean }).__mapCardPainted = true; setCardShown(true); setCardSnap(true); painted(); return; }
    if ((photoNow.current && photoInNow.current) || curtain === 'up' || outOfView.current()) {
      setPhotoGone(true); setCardSnap(true); setLoaderGone(true); setCardShown(true);
      painted();
      return;
    }
    painted();
    const fade = () => { setPhotoGone(true); setCardSnap(false); setCardShown(true); };
    // The curtain still fading (a slow open): the card's own fade starts at once under it rather than
    // waiting for the curtain to end, so the sketch never lingers behind it; both are soft, nothing pops.
    fade();
  };
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  // The picture inside the map itself (the pins stay live, exactly where the map puts them); taken out
  // in one frame once the map under it has drawn.
  useEffect(() => {
    const m = map.current;
    if (expanded || !m) return;
    const old = inMapPhoto.current;
    if (!photo || photoGone) { old?.remove(); inMapPhoto.current = null; setPhotoInMap(false); return; }
    if (old && old.dataset.src === photo && old.isConnected) return;
    putPhotoInMap(m, photo);
    setPhotoInMap(false);
  }, [photo, photoGone, mapGen]); // eslint-disable-line react-hooks/exhaustive-deps
  // The picture is up, in the map under its pins: the opening curtain may go once the pins' faces have
  // loaded, so the card it lifts onto already has every pin, at full strength, on its streets.
  useEffect(() => {
    if (expanded || !photoIn || !photoInMap || photoGone || cardShown) return undefined;
    let on = true;
    afterFaces(host.current, () => { if (!on) return; pinsOn.current?.calm(false); painted(); });
    return () => { on = false; };
  }, [expanded, photoIn, photoInMap, photoGone, cardShown]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keeping the picture fresh: once the card has drawn and been still a moment in view, the map alone (no pins: they are page elements).
  useEffect(() => {
    if (expanded || keepNone || !cardShown || !loaderGone || !shotKeyNow || hasCardShot(shotKeyNow, 'streets')) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tries > 8) { clearInterval(t); return; }
      const m = map.current;
      if (!m || !inViewNow() || curtainState() !== 'down' || m.isMoving() || !m.loaded()) return;
      clearInterval(t);
      try { const c = m.getCanvas(); if (!isBlank(c) && keyNow.current === shotKeyNow) saveStreetsShot(shotKeyNow, c.toDataURL('image/jpeg', 0.92)); } catch { /* not readable */ }
    }, 1200);
    return () => clearInterval(t);
  }, [expanded, keepNone, cardShown, loaderGone, shotKeyNow, mapGen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where the card was, for next time (mapModel's hint): only a centre from a real fix.
  useEffect(() => {
    if (!expanded && !keepNone && cardShown && place.locationOn && place.at && model.city && !model.cityExact) setCardHint(me.id, { lat: model.city.lat, lng: model.city.lng, name: model.cityName });
  }, [expanded, keepNone, cardShown, cityKey, model.cityName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pins: the same list the phone's map draws (pinList), handed to the engine, which keeps
  // each pin between changes and gathers, splits and fades them (pinEngine).
  const shown = expanded ? model.shown : cardPlayers;
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const selectedHitId = model.selectedHit?.hit.id ?? null;
  // The pins' clock: a player's open-to-hit time running out takes their green ring off (and midnight
  // moves a hit's "Tomorrow" to "Today") by itself. The player list is kept while unchanged, so the
  // pins are no longer rebuilt on every redraw of the tab under them and need telling when time passes.
  const pinClock = useOpenClock(shown.map((p) => p.user.openToHitUntil));
  const markers = useMemo(
    () => mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe || !checkIn.on, playing }),
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, night, theme, openToHit, model.mePos, hiddenMe, checkIn.on, playing?.courtId, playing?.courtName, pinClock], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // What "+N" pins look like, in this theme's colours.
  const tpl = useMemo(() => clusterTemplates(), [theme, night]); // eslint-disable-line react-hooks/exhaustive-deps
  pinsNow.current = { items: markers, tpl };
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
  useEffect(() => { if (model.selectedHit) map.current?.flyTo({ center: [model.selectedHit.at.lng, model.selectedHit.at.lat], zoom: Math.max(map.current.getZoom(), CLOSE_ZOOM), duration: 500, offset: [0, -courtLift(host.current?.clientHeight ?? 800)] }); }, [model.selectedHit?.hit.id]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Given up on: "Map didn't load", fading in over whatever the card shows (its picture stays under it);
  // after "Tap to try again" its words stay until it has faded off, so nothing goes in one frame.
  const failed = !expanded && load.status === 'failed' && !cardShown;
  const [failShown, setFailShown] = useState(false);
  useEffect(() => {
    if (failed) { setFailShown(true); return undefined; }
    const t = setTimeout(() => setFailShown(false), MAP_REVEAL_MS + 30);
    return () => clearTimeout(t);
  }, [failed]);
  // On the still card the pins say nothing a screen reader needs (the card says it all, and takes the tap).
  const canvas = <div ref={host} aria-hidden={expanded ? undefined : true} style={{ position: 'absolute', inset: 0, background: colors.bg }} />;

  if (!expanded && !model.city) {
    // A city still being looked up holds the card's place, looking as the map will while it loads; no city at all asks for one.
    return model.cityPending ? <View style={[styles.card, cardHeight ? { height: cardHeight } : null]}><MapCardLoading /></View> : <CitylessCard onOpenMap={onExpand} />;
  }
  if (!expanded) {
    // The picture is up (loaded, not yet handed over to the drawn map): the card shows from the first frame.
    // It stays up if the map never comes: "Map didn't load" fades in over it.
    const photoUp = !!photo && photoIn && !photoGone;
    const layerOn = cardShown || photoUp;
    return (
      <View ref={spot.ref} style={[styles.card, cardHeight ? { height: cardHeight } : null]} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== cardW) setCardW(w); }}>
        {/* Under the map, until it has drawn and faded in over it. Given up on, a tap tries again; still loading, it opens the full map. */}
        {!loaderGone ? <MapCardLoading me={loadingMe} soft={loadingSoft} moving={onScreen && !failed && props.visible !== false} /> : null}
        {!cardShown ? (
          <Pressable
            accessibilityRole={failed || onExpand ? 'button' : undefined}
            accessibilityLabel={failed ? "The map didn't load. Tap to try again" : 'Map of players, courts and hits near you'}
            onPress={failed ? load.restart : onExpand}
            disabled={!failed && !onExpand}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View aria-hidden={!cardShown} style={[StyleSheet.absoluteFill, !cardShown && styles.noTaps, { opacity: layerOn ? 1 : 0, transition: cardSnap ? 'none' : `opacity ${MAP_REVEAL_MS}ms ${MAP_REVEAL_CSS}` } as object]}>
          {canvas}
          {/* The picture over all of the map until the copy inside the map itself (under the pins) has loaded. */}
          {photo && !photoGone && !photoInMap ? <img src={photo} alt="" onLoad={() => { takePhoto.current(); }} onError={() => setPhoto(null)} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }} /> : null}
          {/* A still card: the tap goes to the full map, not to the tiles. */}
          <Pressable accessibilityRole={onExpand ? 'button' : undefined} accessibilityLabel="Map of players, courts and hits near you" onPress={onExpand} disabled={!onExpand} style={StyleSheet.absoluteFill} />
          <PreviewOverlay cityName={cityName} count={onCardCount} placeCount={model.cardCourts.length} hitCount={hitCount !== undefined && model.cardFromYou && !holding ? hitCount : model.cardHits.length} weather={weather} checkIn={onToggleLocation ? checkIn : undefined} lock={lock} inviting={invitingShown.current} />
          <MapCredit align="right" style={{ position: 'absolute', right: 10, bottom: 10 }} />
        </View>
        {/* Given up on: "Map didn't load", fading in over everything under it (the loading look, or the card's picture). */}
        {!loaderGone ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.failCover, { opacity: failed ? 1 : 0, transition: `opacity ${MAP_REVEAL_MS}ms ${MAP_REVEAL_CSS}` } as object]}>{failed || failShown ? <MapCardFailed /> : null}</View> : null}
      </View>
    );
  }

  // Which card is up: yours, a player's, a court's, a hit's, a place's, the list of players, or none
  // (the bare map, only its buttons; or, not knowing where you are, the card asking).
  const stageKey = meOpen ? 'me'
    : model.selected ? `p:${model.selected.user.id}`
      : model.selectedCourt ? `c:${model.selectedCourt.id}`
        : model.selectedHit ? `h:${model.selectedHit.hit.id}`
          : model.place ? `place:${model.place.id}`
            : !model.homeKnown ? 'where'
              : listOpen ? 'list' : 'bare';
  const bare = stageKey === 'bare';
  // Under a card, its own colour runs on beneath the home indicator, so no map shows below it; it
  // lies over the card's foot, so the card's shadow never darkens it into a band (Oct 7), and it rises and
  // sinks with its card. With nothing up the map runs to the bottom edge, and only the buttons keep clear
  // of the bar (or, with no bar, of the home indicator).
  const foot = (card: React.ReactNode) => (barInset ? <View pointerEvents="box-none">{card}<View pointerEvents="none" style={[styles.foot, { height: barInset }]} /></View> : card);
  // Locked (checked with the server first), it says why in a note that stays to be read.
  const message = async (id: string) => {
    const lock = await actions.messageLock(id);
    if (lock) { showToast({ title: lock, icon: 'lock-closed-outline', long: true }); return; }
    router.push(`/messages/${actions.openConversationWith(id)}`);
  };
  // Into one of your groups (the sheet says if they can't be).
  const addToGroup = (id: string) => router.push({ pathname: '/pick-group', params: { user: id } });
  // The map's buttons, riding on whatever is up along the bottom; on the players list, they fade as it rises (ListCrown).
  // Made for each layer from its own key, so one on its way out keeps the buttons it had: only the bare map's carry the
  // players pill (Oct 10: made from what was up now, a closing card's buttons grew the pill as it sank, the ⓘ jumping up over it).
  const buttons = (pill: boolean) => <View pointerEvents="box-none" style={styles.crown}><MapButtons lead={pill ? <PlayersPill items={model.tray} query={model.query} filter={model.filter} courts={model.nearestCourts} lock={lock} onOpen={() => { setListTall(false); trayAt.current = 0; setListOpen(true); }} /> : undefined} onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); model.clearPlace(); map.current?.flyTo({ center: [model.homeView.center.lng, model.homeView.center.lat], zoom: model.homeView.zoom ?? START_ZOOM, duration: 600 }); }} onZoomIn={() => map.current?.zoomIn()} onZoomOut={() => map.current?.zoomOut()} /></View>;
  // Zoomed out past about a city with the courts on: "Zoom in to see courts" (not over a court's card, nor a search).
  const zoomNote = model.courtsOn && far && !model.selectedCourt && !model.query.trim();
  return (
    <View style={styles.fill} onLayout={(e) => setMapH(Math.round(e.nativeEvent.layout.height))}>
      {canvas}
      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        {/* Two rows (Oct 11, owner: "Two rows weather in search"): Back, the search and Location, the city and its weather in the bar itself; then the filter chips. */}
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} checkIn={onToggleLocation ? checkIn : undefined} results={model.courtResults} onPickCourt={model.pickCourt} places={model.placeSearch} onPickPlace={model.pickPlace} players={model.query.trim() ? model.tray.length : 0} cityName={model.homeKnown ? cityName : ''} weather={model.homeKnown ? weather : null} />
        <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setChipsEnd(Math.round(y + height)); }}>
          <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
        </View>
        {/* Only while zoomed out: "Zoom in to see courts", under the chips (as on the phone). */}
        <ChipsNoteLine>
          {zoomNote ? <CourtsZoomNote /> : null}
        </ChipsNoteLine>
        {/* Slow to come, or didn't: a small pill under the chips, clear of the pins around you (as on the phone). */}
        <MapLoadPill status={load.status} onRetry={load.restart} />
        {/* Not checked in: one quiet ask, each time the map opens (Not now: gone for today). */}
        {/* The one-tap Check in bar over the map is gone (Oct 27, owner: "I don't like how there's two check in things take out the one on bottom of map"): the Check in button is the one way in. */}
      </View>
      <View pointerEvents="box-none" style={styles.bottom}>
        {/* What is up along the bottom (a card, or nothing) glides in and out, the map's buttons riding on top of it: CardStage. */}
        <CardStage
          cardKey={stageKey}
          kind={bare || stageKey === 'where' ? 'tray' : 'card'}
          crown={(key) => (key === 'list' ? <ListCrown>{buttons(false)}</ListCrown> : buttons(key === 'bare'))}
        >
          {bare ? (
            // Nothing up: only the room the buttons above keep clear of the home indicator (no tab bar on the full map).
            <View pointerEvents="none" style={{ height: Math.max(insets.bottom, spacing.md) }} />
          ) : foot(stageKey === 'where' ? (
            <WhereCard locating={locating} onLocation={onToggleLocation} />
          ) : stageKey === 'list' ? (
            <PlayersSheet items={model.tray} cityName={cityName} onSelect={model.select} query={model.query} filter={model.filter} courts={model.nearestCourts} onPickCourt={model.selectCourt} lock={lock} onUnlock={unlock} onClose={() => setListOpen(false)} openTall={listTall} onTall={setListTall} room={{ height: mapH, top: chipsEnd, foot: barInset }} stripAt={trayAt} />
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
          ) : null)}
        </CardStage>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  // The map still on its way: taps go to the card under it (a compiled style: react-native-web ignores an inline pointerEvents).
  noTaps: { pointerEvents: 'none' },
  // "Map didn't load" over the loading look, in the card's own colour.
  failCover: { backgroundColor: colors.bgElevated },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2, zIndex: 10 },
  checkInBar: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  // The map's buttons, riding on whatever is up along the bottom.
  crown: { marginBottom: spacing.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 10 },
  // Under a card: the card's colour beneath the tab bar, a point up over the card's foot so no seam shows.
  foot: { backgroundColor: colors.surface, marginTop: -1 },
});
