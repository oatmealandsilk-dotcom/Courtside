import * as haptics from '@/lib/haptics';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PixelRatio, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image as PhotoImage } from 'expo-image';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { File, Paths } from 'expo-file-system';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardCredit, ChipsNoteLine, CitylessCard, CourtSheet, CourtsZoomNote, FilterChips, HitSheet, ListCrown, PIN_FIT_TOP, YouSheet, MapButtons, MapTopBar, PlaceSheet, PlayerSheet, PlayersPill, PlayersSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import { CardStage } from '@/components/map/CardStage';
import { warmMapEngine } from '@/components/map/engineCopy';
import { MapCanvas, type CanvasMarker, type MapCanvasHandle, type MapLoadStatus } from '@/components/map/MapCanvas';
import { MAP_LOADING, softShotAllowed, MAP_REVEAL_MS, MapCardFailed, MapCardLoading, MapLoadPill } from '@/components/map/MapLoadState';
import { cardCaptureBroken, cardHint, hasCardShot, hashText, loadCardShots, peekCardShot, peekPlaceShot, saveCardShot, saveStreetsShot, setCardHint, shotKey, useCardShots, forgetPlaces, type CardHint } from '@/components/map/cardShot';
import { useCardOnScreen, useHeldCardPlace } from '@/components/map/cardHold';
import { CARD_HEIGHT, CARD_ZOOM, onCard } from '@/components/map/cardFit';
import { STYLE, cardLook, lookFor } from '@/components/map/look';
import { MAP_PIN_CSS, clusterTemplates, courtLift, youLift } from '@/components/map/markers';
import { mapMarkers } from '@/components/map/pinList';
import { glowKey, useCourtGlow } from '@/features/places/lightUp';
import { livePin } from '@/features/activity/liveSession';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { placeZoom } from '@/features/places/geocode';
import { milesBetween } from '@/features/players/geo';
import { COURTS_MIN_ZOOM, useMapModel } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, nearbyLock, onTeenMap } from '@/features/players/mapPrivacy';
import { useCheckIn, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { CHECKIN_ZOOM, swoopShape, swoopTo, useCheckInZoom, useMapSwoop } from '@/features/players/checkInZoom';
import type { LatLng } from '@/features/players/positions';
import { CHROME_AFTER_MS, CHROME_MS, COVER_MS, GROW_SWOOP_MS, GrowAwayContext, HANDOFF_MS, REVEAL_MAX_MS, REVEAL_MS, aimGrow, armGrow, endGrow, growHandOver, growHost, growPlan, labelsOut, setGrowPlan, startGrow, useGrowClear, useGrowPicture, type GrowPlan, type Rect } from '@/features/players/mapGrow';
import { askToHit } from '@/features/players/courtLink';
import { isOpenToHit } from '@/features/players/openToHit';
import { useOpenClock } from '@/features/players/useOpenClock';
import { useWeather } from '@/features/players/useWeather';
import { show as showToast } from '@/lib/toast';
import { confirmUnfollow } from '@/lib/confirm';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { curtainState, useStartMapHold } from '@/features/feed/warmup';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useAndroidBack } from '@/lib/androidBack';
import { useIsFocusedLater } from '@/lib/useIsFocused';
import { colors, radius, spacing } from '@/theme';

const HEIGHT = CARD_HEIGHT;
/** How far in the map starts: roughly a city. */
const CITY_ZOOM = 11.5;
/** Close enough to read street names, when the map goes to someone. */
const CLOSE_ZOOM = 13.5;

export type { NearbyMapProps };

/**
 * The browser fetches its map engine separately and starts it early (see
 * NearbyMap.web). On the phone the engine is fetched once, during the splash,
 * and kept in a file (engineCopy), so each map's web view starts with it
 * already in place instead of downloading it after the page is on screen.
 */
export function preloadNearbyMap() { void warmMapEngine(); void loadCardShots(); }
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
 * layer, hit flags, and a card for whoever or whatever you tap. Nothing else
 * lies along the bottom (Oct 8, owner): the pins carry the faces, and an
 * "All N players" pill beside Back to me opens a short tray of everyone side
 * by side, Snap Map's way (Oct 9), pulled up into the full list.
 */
export function NearbyMap(props: NearbyMapProps) {
  const { me, players, onOpen, onExpand, expanded = false, onBack, at, locationOn, locating = false, onToggleLocation, focusCourt, focusHit, focusUser, focusSpot, focusPlace, holdPins = false, hitCount, inviting = false, cardHeight, holdCurtain = true } = props;
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  // The still card takes the place names off: it sets your city's name in the middle itself.
  const look = useMemo(() => (expanded ? lookFor(themes[theme]) : cardLook(lookFor(themes[theme]))), [theme, expanded]);
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
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
  // With the check-in zoom on (admins first, checkInZoom), once you are up the full map swoops down to you:
  // from the card it opens first (the card's own tap, onExpand), only while the card is still in view. Not inViewNow:
  // iOS's own location prompt, the first time, leaves the app 'inactive' for a moment, and that is still the card in view.
  const zoomOn = useCheckInZoom();
  // A grow under way (the page pushing in, the full map about to open over it): a tap on the card meanwhile opens no second full map.
  const growBusy = useRef(false);
  // The Community tab's card grows into the full map (mapGrow); what sits on it slips out of it as it does.
  const growsHere = !!props.grow && !expanded;
  // Its pins step aside with its words as you are found (a quick fade in the map's own drawing), and come back after.
  useGrowClear(growsHere, (clear) => canvas.current?.clearPins(clear));
  // The pictures the grow opens the full map with, taken while you are being found (growReady); let go if no grow takes them.
  const prep = useRef<GrowPrep | null>(null);
  const dropPrep = () => { const p = prep.current; prep.current = null; if (p) void p.done.then(() => dropShots(p.files)); };
  useEffect(() => () => dropPrep(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Whether the card may grow now (anything in the way of pictures of it: the plain way in).
  const canGrow = () => growsHere && !still && !keepNone && !cardCaptureBroken() && !!growHost();
  // The card's map alone, from its own drawing (no pins: they are not part of it), asked of its page (MapCanvas shoot).
  const shotWaiters = useRef<((data: string | null) => void)[]>([]);
  const mapAlone = () => new Promise<string | null>((done) => {
    const give = (data: string | null) => { clearTimeout(t); shotWaiters.current = shotWaiters.current.filter((w) => w !== give); done(data); };
    const t = setTimeout(() => give(null), MAP_ALONE_MAX_MS);
    shotWaiters.current.push(give);
    canvas.current?.shoot();
  });
  /**
   * The grow's pictures, taken early (v4): you said yes to both questions and the phone is finding you (half a second to
   * a couple, the page still but for the pill's finding light), so nothing has to be photographed once you are found.
   * The page as it is (taking it holds the phone for a moment, now, rather than mid-move) and the card's map alone, from
   * the map's own drawing (the phone is not held for that one). Kept in memory (and as files, gone after: dropShots).
   */
  const growReady = () => {
    dropPrep();
    const page = growHost();
    const card = spot.ref.current;
    const box = mapBox.current;
    if (!zoomOn || !onExpand || !canGrow() || !page || !card || !box) return;
    const files: string[] = [];
    const p: GrowPrep = { page, files, at: null, shot: null, box: null, done: Promise.resolve() };
    p.done = (async () => {
      // Asked first: the map's own page makes it, while the phone takes the other.
      const alone = mapAlone();
      try {
        const [pageAt, cardAt, boxAt] = await Promise.all([rectOf(page), rectOf(card), rectOf(box)]);
        if (fits(pageAt) && fits(cardAt) && fits(boxAt)) {
          p.at = { page: pageAt, card: cardAt, box: boxAt };
          p.shot = asFile(await captureRef(page, { format: 'jpg', quality: 0.92, result: 'tmpfile' }));
          files.push(p.shot);
        }
      } catch { p.shot = null; }
      const data = await alone;
      p.box = data ? tempPicture(data) : null;
      if (p.box) files.push(p.box);
      await Promise.all(files.map((uri) => PhotoImage.prefetch(uri, 'memory').catch(() => false)));
    })();
    prep.current = p;
  };
  // The full map's first view (the card grown), its streets asked for while you are found, so it draws sooner (swoop's WARM_JS).
  const growWarm = () => {
    const page = growHost();
    const card = spot.ref.current;
    if (!zoomOn || !onExpand || !canGrow() || !page || !card) return;
    void Promise.all([rectOf(page), rectOf(card)]).then(([pageAt, cardAt]) => {
      if (!fits(pageAt) || !fits(cardAt)) return;
      const grown = growPlan({ page: pageAt, card: cardAt, screen: { w: windowW, h: windowH }, center: view.center, zoom: view.zoom });
      canvas.current?.warm(grown.center, grown.zoom);
    }).catch(() => undefined);
  };
  const swoopOnUp = (here: LatLng): boolean => {
    if (expanded) { swoopTo(here, false); return false; }
    const seen = curtainState() !== 'up' && onScreen && props.visible !== false && props.inView?.() !== false && AppState.currentState !== 'background' && spot.onScreen();
    if (!onExpand || !seen) return false;
    swoopTo(here, true);
    // On the Community tab the card grows into the full map (mapGrow), with the pictures taken while you were found.
    const p = prep.current;
    prep.current = null;
    if (p && canGrow()) {
      armGrow();
      growBusy.current = true;
      void growGo(p).then((how) => { growBusy.current = false; if (how === 'plain') onExpand(); });
      return true;
    }
    if (p) void p.done.then(() => dropShots(p.files));
    onExpand();
    return true;
  };
  /**
   * The grow, from the card, the moment you are found (v4: nothing waits). The live Community page starts pushing in
   * this very frame, the card's words and pins fading and what sits on it slipping out (the pill playing its quick
   * moment as it goes); the full map opens over it HANDOFF_MS later, with no slide (app/_layout's map options), its first
   * frame the pictures readied while you were found, at exactly the point the push-in has reached, which it carries on.
   * A page that moved since its picture (scrolled while finding you): the full map opens once the card covers the screen,
   * with the card's map alone. 'plain' if the card could not be measured (the caller then opens the full map the plain
   * way); 'gone' if you left the page meanwhile (another tab, the app put away): nothing opens, the page is as it was.
   */
  const growGo = async (p: GrowPrep): Promise<'grown' | 'plain' | 'gone'> => {
    const page = growHost();
    const card = spot.ref.current;
    const box = mapBox.current;
    const letGo = () => { endGrow(); void p.done.then(() => dropShots(p.files)); };
    if (!page || page !== p.page || !card || !box) { letGo(); return 'plain'; }
    let at: GrowPrep['at'];
    try {
      const [pageAt, cardAt, boxAt] = await Promise.all([rectOf(page), rectOf(card), rectOf(box)]);
      at = { page: pageAt, card: cardAt, box: boxAt };
    } catch { at = null; }
    if (!at || !fits(at.page) || !fits(at.card) || !fits(at.box)) { letGo(); return 'plain'; }
    const plan = growPlan({ page: at.page, card: at.card, screen: { w: windowW, h: windowH }, center: view.center, zoom: view.zoom });
    aimGrow(plan);
    const started = startGrow(still);
    labelsOut();
    const here = () => growHost() === page && AppState.currentState !== 'background' && props.inView?.() !== false;
    try {
      // The pictures are in by now (taken while you were found); a check-in quicker than them waits here, the push-in going on.
      await Promise.all([Promise.race([p.done, wait(PREP_WAIT_MAX_MS)]), wait(HANDOFF_MS)]);
      // The page's picture is the page only if nothing moved since (the card where it was): else it opens once the card covers the screen.
      const pageSame = !!p.shot && !!p.at && same(p.at.page, at.page) && same(p.at.card, at.card);
      let boxShot = p.box;
      // No picture of the card's map alone (its page did not answer): the card itself now, its pins and words gone by now
      // (this one holds the phone for a moment, mid-move: only ever when the map's own drawing could not be had).
      if (!boxShot && here()) {
        const raw = asFile(await captureRef(box, { format: 'jpg', quality: 0.92, result: 'tmpfile' }));
        p.files.push(raw);
        await PhotoImage.prefetch(raw, 'memory').catch(() => false);
        boxShot = raw;
      }
      if (!pageSame) await wait(started + COVER_MS - Date.now());
      if (!here()) { letGo(); return 'gone'; }
      if (!boxShot) { letGo(); return 'plain'; }
      const shot = pageSame ? p.shot : null;
      setGrowPlan({ ...plan, shot, box: { rect: at.box, shot: boxShot, radius: Math.max(0, radius.xl - 1) }, started });
      router.push({ pathname: '/map', params: { grow: '1' } });
      // The full map lets go of the two it shows (planShots); any other taken meanwhile goes now.
      void p.done.then(() => dropShots(p.files.filter((f) => f !== shot && f !== boxShot)));
      return 'grown';
    } catch {
      letGo();
      return here() ? 'plain' : 'gone';
    }
  };
  const checkIn = useCheckIn(expanded ? 'map' : 'card', zoomOn ? { up: swoopOnUp, finding: growWarm, allowed: growReady, over: dropPrep } : undefined);
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
  // The still card (Oct 22, owner: "The map blips in 50% of the time … can we just pre load the map?").
  // Its map has drawn, with the app's pins and look on it: it takes taps, and its cover can go.
  const [cardUp, setCardUp] = useState(false);
  // The picture covering it (cardShot) has loaded and is on screen.
  const [photoIn, setPhotoIn] = useState(false);
  // Off screen, the map's load clocks wait (useMapLoad).
  const onScreen = useIsFocusedLater();
  // Scrolled off the screen (reading the list under it) counts as out of view too.
  const spot = useCardOnScreen();
  /** Whether the card is in view right now: the curtain not over it, its tab and section on show, on the screen, the app in front. */
  const inViewNow = () => curtainState() !== 'up' && onScreen && props.visible !== false && props.inView?.() !== false && AppState.currentState === 'active' && spot.onScreen();
  // Where the card is centred stays put while it is seen (cardHold): a fix landing then waits until it is out of view.
  const place = useHeldCardPlace(expanded, at, !!locationOn, locating, () => (cardUp || photoIn) && inViewNow());
  // The town the card showed last time, with Location on and no fix yet (mapModel): read until it has shown something.
  const shotsVersion = useCardShots();
  const hint = useRef<CardHint | null>(null);
  if (!expanded && !cardUp && !photoIn) hint.current = cardHint(me.id);
  const model = useMapModel(me, players, place.at, focusCourt, !expanded, focusHit, focusUser, focusSpot, place.locationOn, focusPlace, hint.current);
  // The full map's side of the check-in zoom: your pin waits, and lands as the camera settles on you.
  const swoop = useMapSwoop(expanded && zoomOn, !!model.mePos);
  // A fix held back while the card is seen (cardHold): what the card says comes from the place it shows, not the new fix,
  // so the card and the place it shows never disagree (its open hits, and the "You're early" line under it, wait too).
  const holding = !expanded && (place.locationOn !== !!locationOn || place.at?.lat !== at?.lat || place.at?.lng !== at?.lng);
  const invitingShown = useRef(inviting);
  if (!holding) invitingShown.current = inviting;
  // The still card on the start page holds the opening curtain until it shows its map (see warmup); the
  // feed's copy of the card never does (it is not what the app opens on).
  const painted = useStartMapHold(holdCurtain && !expanded && (!!model.city || model.cityPending));
  // Until its map has drawn, the card is covered: by a picture of how it last drew, when there is
  // one for exactly this look (cardShot), so it already shows its streets and the live map takes
  // over underneath with nothing changing; otherwise by its loading sketch, which fades off once,
  // slowly (starting at once even under a curtain still lifting, so it never lingers), never part way through a swipe. If the map never
  // comes after every retry, only "Map didn't load · Tap to try again" (Oct 5, owner).
  // The cover is over the map rather than the map being see-through: the map's web view keeps
  // drawing at full strength underneath (a phone may hold back a web view it cannot see).
  const [mapStatus, setMapStatus] = useState<MapLoadStatus>('loading');
  const [coverGone, setCoverGone] = useState(false);
  const coverIn = useSharedValue(1);
  const coverFade = useAnimatedStyle(() => ({ opacity: coverIn.value }));
  // Anything else picked (a search result, a pin) takes the place of your own card.
  useEffect(() => { if (model.selected || model.selectedCourt || model.selectedHit || model.place) setMeOpen(false); }, [model.selected, model.selectedCourt, model.selectedHit, model.place]);
  const { home, start } = model;
  // The full map opens where you are; the still card on your town (location on) or your profile's city.
  // Opened by the card growing into it (mapGrow): exactly where the grown card shows, so the hand-over cannot be seen.
  const growFrom = expanded ? props.growFrom ?? null : null;
  const view = growFrom ? { center: growFrom.center, zoom: growFrom.zoom } : expanded ? { center: start.center, zoom: start.zoom ?? CITY_ZOOM } : { center: model.city ?? start.center, zoom: CARD_ZOOM };
  // The still card's "N players around" counts only the faces on it (onCard), so the number and the map agree.
  const [cardW, setCardW] = useState(0);
  const cardCenter = model.city ?? start.center;
  const cardPlayers = model.inCity;
  const onCardCount = useMemo(
    () => (expanded ? 0 : cardPlayers.filter((p) => onCard(cardCenter, p.at, cardW || windowW - 2 * spacing.lg, cardHeight ?? HEIGHT)).length),
    [expanded, cardPlayers, cardCenter.lat, cardCenter.lng, cardW, windowW, cardHeight], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Zoomed out past about a city: the court pins step aside (pinList), and a note says so.
  const [far, setFar] = useState(() => view.zoom < COURTS_MIN_ZOOM);
  const weather = useWeather(home);
  const cityName = model.cityName;
  const canvas = useRef<MapCanvasHandle | null>(null);
  // A fix arriving after the map is up moves the map to it.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current.lat === home.lat && lastHome.current.lng === home.lng) return;
    lastHome.current = home;
    // Opened on a tagged court or a hit, or looking at a place searched for, the map stays there; the still card stays on your city.
    // Up to hit finding you with the zoom on: the swoop is the move (one move, never this one first).
    if (expanded && model.homeKnown && !swoop.busy && !focusCourt && !focusHit && !focusSpot && !model.place && !model.selected) canvas.current?.flyTo(home, CITY_ZOOM, 600);
  }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  // The still card follows a change of city on the profile.
  // Out of view once it has drawn (the only time a held move lands, cardHold), the card is covered again
  // and the map jumps; the cover goes once the new place has drawn. In view (Location just switched on
  // from the card), the map simply goes there, as you asked.
  const cityKey = model.city ? `${model.city.lat},${model.city.lng}` : '';
  const jumpGuard = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverAgainRef = useRef<(lost?: boolean) => void>(() => undefined);
  const showCardRef = useRef<(drawn?: boolean) => void>(() => undefined);
  useEffect(() => {
    if (expanded || !model.city) return;
    if (cardUp && !inViewNow()) {
      coverAgainRef.current();
      canvas.current?.jump(model.city, CARD_ZOOM);
      // Never left covered: a page that does not say it has drawn the new place within 8 s is shown as it is.
      if (jumpGuard.current) clearTimeout(jumpGuard.current);
      jumpGuard.current = setTimeout(() => { jumpGuard.current = null; showCardRef.current(false); }, 8000);
      return;
    }
    canvas.current?.flyTo(model.city, CARD_ZOOM, 0);
  }, [cityKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (jumpGuard.current) clearTimeout(jumpGuard.current); }, []);
  // Picking someone, a court, a hit, or typing a city takes the map there.
  // Keyed on who or what is picked, not the object: it is rebuilt on every data change, which must not pull the map back.
  useEffect(() => { if (model.selected) canvas.current?.flyTo(model.selected.at, CLOSE_ZOOM); }, [model.selected?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // A court's card is tall (who may play, right now, what players say): its court lands above it, not under it.
  useEffect(() => { if (model.selectedCourt) canvas.current?.flyTo(model.selectedCourt, CLOSE_ZOOM, 500, -courtLift(windowH)); }, [model.selectedCourt?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model.selectedHit) canvas.current?.flyTo(model.selectedHit.at, CLOSE_ZOOM, 500, -courtLift(windowH)); }, [model.selectedHit?.hit.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Your card up: your pin glides into the clear strip above it, so the ring switching on is there to see.
  useEffect(() => { if (meOpen && model.mePos) canvas.current?.flyTo(model.mePos, undefined, 500, -youLift(windowH)); }, [meOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // A place picked from the search: exactly as close as it needs (placeZoom), out as well as in, so its court pins show;
  // set in the clear above its list of courts, the way a court sits above its card.
  useEffect(() => { if (model.place) canvas.current?.flyTo(model.place, placeZoom(model.place, COURTS_MIN_ZOOM), 700, -courtLift(windowH), true); }, [model.place]); // eslint-disable-line react-hooks/exhaustive-deps
  // You are up, with the zoom on: down to street level over you (made by the page once its map is up: MapCanvas).
  // A full map just opened starts once its page has drawn where it is, or 0.7 s after its style is in at most.
  // Opened by the card growing into it: the swoop waits for the grown card to hand over (below), then is shorter.
  const swoopRun = useRef(swoop.run);
  swoopRun.current = swoop.run;
  // `grown`: after a grow, the ease that carries on at the push-in's own speed (growHandOver); the camera dives on at once
  // (now): the push-in was its start, and the map has drawn what is on screen.
  const startSwoop = (grown?: [number, number, number, number]) => {
    const run = swoopRun.current;
    if (!run) return;
    const shape = swoopShape();
    canvas.current?.swoop({ ...shape, ...(grown ? { ms: GROW_SWOOP_MS, ease: grown, now: true } : null), id: run.id, lat: run.to.lat, lng: run.to.lng, zoom: CHECKIN_ZOOM, still, wait: 700 });
  };
  const growing = useRef(!!growFrom);
  useEffect(() => { if (!growing.current) startSwoop(); }, [swoop.run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The grow's hand-over (mapGrow), on the full map it opened: it opened over the live page part way into the push-in, with
  // the pictures of it on top at exactly the point the push-in had reached, and they carry the push-in on (it is never
  // started again here) while the map loads under them; once the card covers the screen and the map has drawn, the
  // pictures dissolve as the camera dives on at the push-in's own speed (one move; they keep moving as they go, never a
  // still layer), and the map's buttons slide in (never fade: they are glass).
  const [growShot, setGrowShot] = useState(!!growFrom);
  const [growDue, setGrowDue] = useState(false);
  const [growLate, setGrowLate] = useState(false);
  const growPicture = useGrowPicture();
  const shotIn = useSharedValue(1);
  const shotFade = useAnimatedStyle(() => ({ opacity: shotIn.value }));
  const chromeIn = useSharedValue(growFrom ? 0 : 1);
  const topAway = -(insets.top + 150);
  const bottomAway = insets.bottom + 170;
  const topSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * topAway }] }));
  const bottomSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * bottomAway }] }));
  // Timed from the moment the push-in started (the moment you were found), not from this page opening.
  useEffect(() => {
    if (!growFrom) return undefined;
    const since = Date.now() - growFrom.started;
    const due = setTimeout(() => setGrowDue(true), Math.max(0, COVER_MS - since));
    const late = setTimeout(() => setGrowLate(true), Math.max(0, REVEAL_MAX_MS - since));
    return () => { clearTimeout(due); clearTimeout(late); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Over once (the dissolve done, or the page left part way): the page under it back as it was, the tab bar to it, and the
  // pictures gone from the phone.
  const growOver = useRef(!growFrom);
  const growEnd = () => {
    if (growOver.current) return false;
    growOver.current = true;
    endGrow();
    dropShots(planShots(growFrom));
    return true;
  };
  const growDone = () => {
    if (!growEnd()) return;
    setGrowShot(false);
    props.onGrown?.();
  };
  useEffect(() => {
    if (!growFrom || !growing.current || !growDue || (mapStatus === 'loading' && !growLate)) return;
    growing.current = false;
    // The camera starts as close as the pushed-in card is now (past the plan: it carries on past covering the screen), and
    // dives on at the speed the push-in has.
    const hand = growHandOver(growFrom, CHECKIN_ZOOM);
    if (Math.abs(hand.zoom - growFrom.zoom) > 0.005) canvas.current?.flyTo(growFrom.center, hand.zoom, 0, 0, true);
    startSwoop(hand.ease);
    shotIn.value = withTiming(0, { duration: REVEAL_MS, easing: Easing.out(Easing.quad) }, () => { runOnJS(growDone)(); });
    chromeIn.value = withDelay(CHROME_AFTER_MS, withTiming(1, { duration: CHROME_MS, easing: Easing.out(Easing.cubic) }));
  }, [growDue, growLate, mapStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // Left part way (Back mid-grow, or mid-dissolve).
  useEffect(() => () => { growEnd(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = expanded ? model.shown : cardPlayers;
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const selectedHitId = model.selectedHit?.hit.id ?? null;
  // The pins' clock: a player's open-to-hit time running out takes their green ring off (and midnight
  // moves a hit's "Tomorrow" to "Today") by itself. The player list is kept while unchanged, so the
  // pins are no longer rebuilt on every redraw of the tab under them and need telling when time passes.
  const pinClock = useOpenClock(shown.map((p) => p.user.openToHitUntil));
  // Courts light up by what is on there right now (Light up, admins first; null: as before).
  const glow = useCourtGlow(model, expanded, shown, playing?.courtId);
  const glowNow = glowKey(glow);
  // Everything drawn on the map, the same list the browser's map draws (pinList).
  const markers = useMemo<CanvasMarker[]>(
    () => mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe || !checkIn.on, playing, glow, meHold: swoop.meHold, land: swoop.land }),
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, theme, openToHit, model.mePos, hiddenMe, checkIn.on, playing?.courtId, playing?.courtName, pinClock, glowNow, swoop.meHold, swoop.land], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // What "+N" pins look like, in this theme's colours.
  const tpl = useMemo(() => clusterTemplates(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // The card's picture (cardShot): for exactly this look (who, theme, centre, size, lock, Reduce Motion);
  // one with its pins only while they are exactly the ones about to be drawn (the marker list's hash).
  const still = useReducedMotion();
  const scale = PixelRatio.get();
  const cardWidth = cardW || Math.round(windowW - 2 * spacing.lg);
  // The map's look itself is in the key, so a picture is never shown over a map that draws differently now (an update).
  const lookSig = useMemo(() => hashText(JSON.stringify(cardLook(lookFor(themes[theme]))) + STYLE + MAP_PIN_CSS), [theme]);
  // Never for a card centred on your own spot (far from any town the app knows): nothing of where you are is kept.
  const key = !expanded && model.city && !model.cityExact ? shotKey({ user: me.id, theme, look: lookSig, lat: model.city.lat, lng: model.city.lng, zoom: CARD_ZOOM, w: cardWidth, h: cardHeight ?? HEIGHT, scale, lock: lock ?? 'open', still }) : '';
  const markerHash = useMemo(() => (expanded ? '' : hashText(JSON.stringify({ items: markers, tpl }))), [expanded, markers, tpl]);
  // The loading look's extras (MAP_LOADING): your face with Location on ('B'); any picture kept of this place, softened ('D').
  const loadingMe = MAP_LOADING === 'B' && !expanded && place.locationOn && model.mePos ? me : null;
  const loadingSoft = MAP_LOADING === 'D' && softShotAllowed(me) && !expanded && model.city && !model.cityExact ? peekPlaceShot(me.id, model.city.lat, model.city.lng, theme) : null;
  const keyNow = useRef(key);
  const keepNoneNow = useRef(keepNone);
  keepNoneNow.current = keepNone;
  keyNow.current = key;
  const hashNow = useRef(markerHash);
  hashNow.current = markerHash;
  const pickCover = (): Cover => {
    const shot = expanded ? null : peekCardShot(key, markerHash);
    return shot ? { uri: shot.uri, kind: shot.kind, hash: markerHash } : { uri: null, kind: 'sketch', hash: markerHash };
  };
  const [cover, setCover] = useState<Cover>(pickCover);
  // A better cover for the look now (the city settled, the pins in, the pictures read), swapped only
  // while nobody can see the card: what is on screen never changes under someone's eyes.
  useEffect(() => {
    if (expanded || cardUp) return;
    const next = pickCover();
    if (next.uri === cover.uri && next.kind === cover.kind) return;
    if (inViewNow()) return;
    setPhotoIn(false);
    setCover(next);
  }, [key, markerHash, shotsVersion, cardUp]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * The map is going again (a fresh page, a new place): covered again at once. A new place, only ever while
   * out of sight. A page the phone stopped or whose drawing it took back (`lost`) may be noticed with the card
   * in view: the surface under it is blank already, so its picture goes straight over it, never the sketch.
   */
  const [lostCover, setLostCover] = useState(false);
  const lostNow = useRef(false);
  // A lost page is never left covered: one that has not drawn within 8 s is shown as it is (its map is up,
  // the streets on their way) or, with no map at all yet, says "Map didn't load · Tap to try again".
  // A page still talking (loading slowly) is given more time, up to 45 s, before it is called a failure;
  // the load's own clocks (useMapLoad) can say so sooner.
  const [lostFailed, setLostFailed] = useState(false);
  const lostGuard = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (lostGuard.current) clearTimeout(lostGuard.current); }, []);
  // Whether the card on show was drawn (onPainted), not just shown by a guard on a half-drawn page:
  // only a drawn card is photographed (cardShot), and a guard-shown one can still say it failed.
  const [drawn, setDrawn] = useState(false);
  coverAgainRef.current = (lost = false) => {
    stopWait.current();
    if (lostGuard.current) { clearTimeout(lostGuard.current); lostGuard.current = null; }
    setLostFailed(false);
    if (lost) {
      const from = Date.now();
      const check = () => {
        lostGuard.current = null;
        if (canvas.current?.isUp()) { showCardRef.current(false); return; }
        if ((canvas.current?.quiet() ?? Infinity) < 5000 && Date.now() - from < 45000) { lostGuard.current = setTimeout(check, 4000); return; }
        setLostFailed(true);
      };
      lostGuard.current = setTimeout(check, 8000);
    }
    lostNow.current = lost;
    setLostCover(lost);
    setDrawn(false);
    setCardUp(false);
    setCoverGone(false);
    coverIn.value = 1;
    setPhotoIn(false);
    setCover(pickCover());
  };
  const stopWait = useRef<() => void>(() => undefined);
  useEffect(() => () => stopWait.current(), []);
  /** The map has drawn: the cover goes, as quietly as it can. */
  const showCard = (real = true) => {
    // Already shown by a guard, and now it has really drawn: nothing to reveal, it just counts as drawn.
    if (cardUp && real) {
      if (jumpGuard.current) { clearTimeout(jumpGuard.current); jumpGuard.current = null; }
      setDrawn(true);
      setLostFailed(false);
      return;
    }
    if (jumpGuard.current) { clearTimeout(jumpGuard.current); jumpGuard.current = null; }
    if (lostGuard.current) { clearTimeout(lostGuard.current); lostGuard.current = null; }
    setLostFailed(false);
    lostNow.current = false;
    setLostCover(false);
    setDrawn(real);
    setCardUp(true);
    stopWait.current();
    const curtain = curtainState();
    // A picture of exactly this card: the map under it is the same, so it just goes.
    const same = cover.kind === 'card' && photoIn && cover.hash === hashNow.current;
    // Nobody looking (the curtain still over it, the section or tab off to the side, the app away): no fade to catch, it is just there.
    if (same || curtain === 'up' || !onScreen || props.visible === false || props.inView?.() === false || AppState.currentState !== 'active') {
      coverIn.value = 0;
      setCoverGone(true);
      painted?.();
      return;
    }
    painted?.();
    const fade = () => { coverIn.value = withTiming(0, { duration: MAP_REVEAL_MS, easing: Easing.inOut(Easing.quad) }, (done) => { if (done) runOnJS(setCoverGone)(true); }); };
    // The curtain still fading (a slow open): the cover's fade starts at once under it rather than waiting
    // for the curtain to end, so the sketch never lingers behind it; both are soft, nothing pops.
    fade();
  };
  showCardRef.current = showCard;
  // Given up on: "Map didn't load" fades in over the cover (and back off for a retry), at once out of sight.
  const failed = !expanded && (mapStatus === 'failed' || lostFailed) && (!cardUp || !drawn);
  const failIn = useSharedValue(0);
  const failFade = useAnimatedStyle(() => ({ opacity: failIn.value }));
  // After "Tap to try again" its words stay until it has faded off, so nothing goes in one frame.
  const [failShown, setFailShown] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const to = failed ? 1 : 0;
    if (failed) setFailShown(true);
    const off = () => { if (!failed) setFailShown(false); };
    if (inViewNow()) failIn.value = withTiming(to, { duration: MAP_REVEAL_MS, easing: Easing.inOut(Easing.quad) }, (done) => { if (done) runOnJS(off)(); });
    else { failIn.value = to; off(); }
  }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keeping the card's picture fresh: once it has drawn and been still a moment in view, the map alone
  // (from the page) and the card with its pins (a photograph of the map, never of what is over it).
  const mapBox = useRef<View | null>(null);
  const shotFor = useRef<string | null>(null);
  useEffect(() => {
    if (expanded || keepNone || !cardUp || !drawn || !coverGone || !key) return undefined;
    let tries = 0;
    const t = setInterval(() => {
      tries += 1;
      if (tries > 8) { clearInterval(t); return; }
      if (!inViewNow() || curtainState() !== 'down') return;
      if (!hasCardShot(key, 'streets')) { shotFor.current = key; canvas.current?.shoot(); return; }
      clearInterval(t);
      if (cardCaptureBroken() || hasCardShot(key, 'card', markerHash) || !mapBox.current) return;
      const k = key, h = markerHash;
      captureRef(mapBox.current, { format: 'jpg', quality: 0.92, result: 'base64' })
        .then((b64) => { if (k === keyNow.current && h === hashNow.current && !keepNoneNow.current) saveCardShot(k, h, b64); })
        .catch(() => undefined);
    }, 1200);
    return () => clearInterval(t);
  }, [expanded, keepNone, cardUp, drawn, coverGone, key, markerHash]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where the card was, for next time (mapModel's hint): only a centre from a real fix.
  useEffect(() => {
    if (!expanded && !keepNone && cardUp && place.locationOn && place.at && model.city && !model.cityExact) setCardHint(me.id, { lat: model.city.lat, lng: model.city.lng, name: cityName });
  }, [expanded, keepNone, cardUp, cityKey, cityName]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapView = (
    <MapCanvas
      ref={canvas}
      active={onScreen && props.visible !== false}
      center={view.center}
      zoom={view.zoom}
      look={look}
      interactive={expanded}
      markers={markers}
      tpl={tpl}
      // The full map's first pins come in as one wave (once any sheet over it has gone); a tap on "+N" zooms in clear of the bars and the cards.
      popIn={expanded}
      onPainted={expanded ? undefined : () => showCard()}
      onShot={expanded ? undefined : (data) => {
        // The check-in zoom's grow asked for the card's map alone (growReady), and the card's picture cover maybe too.
        shotWaiters.current.slice().forEach((give) => give(data));
        const k = shotFor.current; shotFor.current = null; if (k && k === keyNow.current && !keepNoneNow.current) saveStreetsShot(k, data);
      }}
      // The phone stopped the page (or took back its drawing) while the app was away: covered again before anyone looks.
      onLost={expanded ? undefined : () => { if (cardUp) coverAgainRef.current(true); }}
      // Given up on: the opening curtain stops waiting for it, and the card (or the full map's pill) says so.
      onStatus={(status) => { setMapStatus(status); if (!expanded && status === 'failed') painted?.(); }}
      holdPins={expanded && holdPins}
      // Zooming to fit a "+N": the top's two rows (and a face's reach) kept clear, as in a browser (PIN_FIT_TOP).
      pad={{ top: insets.top + PIN_FIT_TOP, bottom: 250, left: 50, right: 50 }}
      onTap={(id) => {
        // The still card is one button: any tap on it opens the full map.
        if (!expanded) { onExpand?.(); return; }
        // The same light tick as the map's other taps (Oct 22 sweep).
        haptics.tap();
        if (id === 'me') { model.select(null); model.selectCourt(null); model.selectHit(null); setMeOpen(true); }
        else if (id.startsWith('c:')) { setMeOpen(false); model.selectCourt(id.slice(2)); }
        else if (id.startsWith('h:')) { setMeOpen(false); model.selectHit(id.slice(2)); }
        else if (id.startsWith('p:')) { setMeOpen(false); model.select(id.slice(2)); }
      }}
      // A tap on the map puts away whatever is up (the list of players too), back to the bare map.
      onMapTap={() => { model.select(null); model.selectCourt(null); model.selectHit(null); setMeOpen(false); setListOpen(false); }}
      // Courts and their rings for where the map came to rest, zoomed in on a town (both check the zoom); and who is in view.
      onMove={(c, zoom, bounds) => { if (!expanded) return; model.loadRings(c, zoom); if (model.courtsOn) void model.loadCourts(c, zoom); model.loadPlayersIn(bounds); }}
      farBelow={COURTS_MIN_ZOOM}
      onFar={expanded ? setFar : undefined}
      // Only with the zoom on: the page's word is for this swoop alone, and the map is exactly as before without it.
      onSwooped={expanded && zoomOn ? (_arrived, id) => swoop.done(id) : undefined}
    />
  );

  // The full map: Android's Back closes the card that is up (yours, a player's,
  // a court's, a hit's, a place's, the list of players), then clears a search, and only then leaves the map.
  useAndroidBack(() => {
    if (meOpen) { setMeOpen(false); return true; }
    if (model.selected) { model.select(null); return true; }
    if (model.selectedCourt) { model.selectCourt(null); return true; }
    if (model.selectedHit) { model.selectHit(null); return true; }
    if (model.place) { model.clearPlace(); return true; }
    if (listOpen) { setListOpen(false); return true; }
    if (model.query.trim()) { model.setQuery(''); return true; }
    return false;
  }, expanded);

  if (!expanded && !model.city) {
    // A city still being looked up holds the card's place, looking as the map will while it loads; no city at all asks for one.
    return model.cityPending ? <View style={[styles.card, cardHeight ? { height: cardHeight } : null]}><MapCardLoading /></View> : <CitylessCard onOpenMap={onExpand} />;
  }
  if (!expanded) {
    // Given up on, the card is one button that tries again; otherwise it opens the full map.
    return (
      <Pressable
        accessibilityRole={failed || onExpand ? 'button' : undefined}
        accessibilityLabel={failed ? "The map didn't load. Tap to try again" : 'Map of players, courts and hits near you'}
        onPress={failed ? () => { setLostFailed(false); canvas.current?.retry(); } : onExpand ? () => { if (!growBusy.current) onExpand(); } : undefined}
        disabled={!failed && !onExpand}
        onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w > 0 && w !== cardW) setCardW(w); }}
        ref={spot.ref}
        style={[styles.card, cardHeight ? { height: cardHeight } : null]}
      >
        {/* Not yet drawn: covered, not tappable, and not read out (the city and its players come with the map). */}
        <View pointerEvents={cardUp ? 'auto' : 'none'} accessibilityElementsHidden={!cardUp} importantForAccessibility={cardUp ? 'auto' : 'no-hide-descendants'} style={StyleSheet.absoluteFill}>
          {/* The map alone, photographed for the card's picture (never what lies over it). */}
          <View ref={mapBox} collapsable={false} style={StyleSheet.absoluteFill}>{mapView}</View>
          {/* Over the map until it has drawn: the card's picture (cardShot), under the city's name and counts, which are live. */}
          {!coverGone && cover.uri ? (
            <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverFade]}>
              <PhotoImage
                source={{ uri: cover.uri }}
                contentFit="fill"
                transition={0}
                cachePolicy="memory"
                style={StyleSheet.absoluteFill}
                // On screen: the curtain may lift onto it, a card that already shows its streets.
                onLoad={() => {
                  // Only taken while nobody can see the swap (under the curtain, or out of view): one that
                  // arrives late, in view, is let go, and the sketch stays for its one slow fade.
                  // Back over a blank surface (the page was lost), it is taken in view too: blank to picture, not map to sketch.
                  if (curtainState() !== 'up' && inViewNow() && !lostNow.current) { setCover({ uri: null, kind: 'sketch', hash: markerHash }); return; }
                  setPhotoIn(true);
                  painted?.();
                }}
                onError={() => setCover({ uri: null, kind: 'sketch', hash: markerHash })}
              />
            </Reanimated.View>
          ) : null}
          <GrowAwayContext.Provider value={growsHere}>
            <PreviewOverlay cityName={cityName} count={onCardCount} placeCount={model.cardCourts.length} hitCount={hitCount !== undefined && model.cardFromYou && !holding ? hitCount : model.cardHits.length} weather={weather} checkIn={onToggleLocation ? checkIn : undefined} lock={lock} inviting={invitingShown.current} />
            <CardCredit />
          </GrowAwayContext.Provider>
        </View>
        {/* No picture (or not loaded yet): the loading sketch over all of it, the city's name and counts too (they come with the map), fading off it once. */}
        {!coverGone && (!cover.uri || !photoIn) && !(lostCover && cover.uri) ? (
          <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cover, coverFade]}>
            <MapCardLoading me={loadingMe} soft={loadingSoft} moving={onScreen && !failed && props.visible !== false} />
          </Reanimated.View>
        ) : null}
        {/* Given up on: one quiet message over everything, which the card's tap tries again. */}
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, failFade]}>
          {failed || failShown ? <View style={[StyleSheet.absoluteFill, styles.cover]}><MapCardFailed /></View> : null}
        </Reanimated.View>
      </Pressable>
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
  const buttons = (pill: boolean) => <View pointerEvents="box-none" style={styles.crown}><MapButtons lead={pill ? <PlayersPill items={model.tray} query={model.query} filter={model.filter} courts={model.nearestCourts} lock={lock} onOpen={() => { setListTall(false); trayAt.current = 0; setListOpen(true); }} /> : undefined} onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); model.clearPlace(); canvas.current?.flyTo(model.homeView.center, model.homeView.zoom ?? CITY_ZOOM, 600); }} /></View>;
  // Zoomed out past about a city with the courts on: "Zoom in to see courts" (not over a court's card, nor a search).
  const zoomNote = model.courtsOn && far && !model.selectedCourt && !model.query.trim();
  return (
    <View style={styles.fill} onLayout={(e) => setMapH(Math.round(e.nativeEvent.layout.height))}>
      {mapView}
      {/* Opened by the card growing into it: the picture of the Community page, carrying on the push-in over the map, then */}
      {/* dissolving into it; over the card in it, the card's map alone (its words, pins and buttons gone by then: mapGrow). */}
      {/* A page that moved since its picture: the card's map alone, which covers the screen by the time this opens. */}
      {growShot && growFrom ? (
        <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shotFade]}>
          <Reanimated.View style={[{ position: 'absolute', left: growFrom.page.x, top: growFrom.page.y, width: growFrom.page.w, height: growFrom.page.h }, growPicture]}>
            {growFrom.shot ? <PhotoImage source={{ uri: growFrom.shot }} contentFit="fill" transition={0} cachePolicy="memory" style={StyleSheet.absoluteFill} /> : null}
            {growFrom.box ? (
              <View style={{ position: 'absolute', left: growFrom.box.rect.x - growFrom.page.x, top: growFrom.box.rect.y - growFrom.page.y, width: growFrom.box.rect.w, height: growFrom.box.rect.h, borderRadius: growFrom.box.radius, overflow: 'hidden' }}>
                <PhotoImage source={{ uri: growFrom.box.shot }} contentFit="fill" transition={0} cachePolicy="memory" style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
      <Reanimated.View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }, growFrom ? topSlide : null]}>
        {/* Two rows (Oct 11, owner: "Two rows weather in search"): Back, the search and Location, the city and its weather in the bar itself; then the filter chips. */}
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} checkIn={onToggleLocation ? checkIn : undefined} results={model.courtResults} onPickCourt={model.pickCourt} places={model.placeSearch} onPickPlace={model.pickPlace} players={model.query.trim() ? model.tray.length : 0} cityName={model.homeKnown ? cityName : ''} weather={model.homeKnown ? weather : null} />
        <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setChipsEnd(Math.round(y + height)); }}>
          <FilterChips filter={model.filter} onFilter={model.setFilter} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
        </View>
        {/* Only while zoomed out: "Zoom in to see courts", under the chips. */}
        <ChipsNoteLine>
          {zoomNote ? <CourtsZoomNote /> : null}
        </ChipsNoteLine>
        {/* Slow to come, or didn't: a small pill under the chips, clear of the pins around you. */}
        {/* The check-in zoom on its way down: the map is up, its streets come as it lands, so no "Loading map…" meanwhile. */}
        <MapLoadPill status={swoop.busy && mapStatus === 'loading' ? 'painted' : mapStatus} onRetry={() => canvas.current?.retry()} />
        {/* Not checked in: one quiet ask, each time the map opens (Not now: gone for today). */}
        {/* The one-tap Check in bar over the map is gone (Oct 27, owner: "I don't like how there's two check in things take out the one on bottom of map"): the Check in button is the one way in. */}
      </Reanimated.View>
      <Reanimated.View pointerEvents="box-none" style={[styles.bottom, growFrom ? bottomSlide : null]}>
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
      </Reanimated.View>
    </View>
  );
}

type Cover = { uri: string | null; kind: 'card' | 'streets' | 'sketch'; hash: string };

/** The grow's pictures on the phone (mapGrow) that the full map shows: gone once it has taken over. */
const planShots = (p: GrowPlan | null) => (p ? [p.shot, p.box?.shot] : []);
/** Gone from the phone (temporary files either way): a picture taken of a view, or one written from the map's own drawing. */
function dropShots(uris: (string | null | undefined)[]) {
  for (const uri of uris) {
    if (!uri) continue;
    try { releaseCapture(uri.replace(/^file:\/\//, '')); } catch { /* not one of the picture tool's */ }
    try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* a temporary file either way */ }
  }
}

/** The grow's pictures, readied while you are being found (growReady), for the moment you are up (growGo). */
interface GrowPrep {
  /** The page they were taken of. */
  page: View;
  /** Where the page, the card and its map were as they were taken (window coordinates). */
  at: { page: Rect; card: Rect; box: Rect } | null;
  /** The page, and the card's map alone (files), or null where it could not be had. */
  shot: string | null;
  box: string | null;
  /** Every file taken, to let go of. */
  files: string[];
  /** Done (however it went). */
  done: Promise<void>;
}
/** How long the card's map is given to send its own drawing; and how long, once you are found, the pictures are waited for. */
const MAP_ALONE_MAX_MS = 1500;
const PREP_WAIT_MAX_MS = 1200;
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));
/** Where a view is on the screen; a view gone meanwhile never answers, so it is given up on after a moment. */
const rectOf = (v: View) => Promise.race([
  new Promise<Rect>((done) => v.measureInWindow((x, y, w, h) => done({ x, y, w, h }))),
  wait(500).then((): Rect => { throw new Error('not measured'); }),
]);
const fits = (r: Rect) => r.w > 0 && r.h > 0;
const same = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
const asFile = (raw: string) => (raw.startsWith('file:') ? raw : `file://${raw}`);
/** The card's map alone, as its page drew it (a JPEG data URL), written to a temporary file the full map can show at once. */
function tempPicture(dataUrl: string): string | null {
  try {
    const file = new File(Paths.cache, `grow-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`);
    file.create();
    file.write(dataUrl.replace(/^data:image\/\w+;base64,/, ''), { encoding: 'base64' });
    return file.uri;
  } catch {
    return null;
  }
}

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  // The card's own colour, solid, over the map while it loads.
  cover: { backgroundColor: colors.bgElevated },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2 },
  checkInBar: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  // The map's buttons, riding on whatever is up along the bottom.
  crown: { marginBottom: spacing.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  // Under a card: the card's colour beneath the tab bar, a point up over the card's foot so no seam shows.
  foot: { backgroundColor: colors.surface, marginTop: -1 },
});
