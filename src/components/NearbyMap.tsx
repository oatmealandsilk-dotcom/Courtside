import * as haptics from '@/lib/haptics';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, PixelRatio, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image as PhotoImage } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
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
import { mapMarkers, onTheCard } from '@/components/map/pinList';
import { glowKey, useCourtGlow } from '@/features/places/lightUp';
import { livePin } from '@/features/activity/liveSession';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { placeZoom } from '@/features/places/geocode';
import { milesBetween } from '@/features/players/geo';
import { COURTS_MIN_ZOOM, useMapModel, type MapFilter } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, nearbyLock, onTeenMap, useWhoSeesYouUp } from '@/features/players/mapPrivacy';
import { useCheckIn, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { useFindPlayersVisit, tipVisit, upToHitTipOn } from '@/features/players/upToHitTip';
import { useNoOneReaskDue } from '@/features/players/noOneReask';
import { tipWaiting } from '@/features/tips/tips';
import { useTourOpen } from '@/features/tour/tourStore';
import { CHECKIN_ZOOM, swoopDrop, swoopShape, swoopTo, useCheckInZoom, useMapSwoop, type SwoopTo } from '@/features/players/checkInZoom';
import type { LatLng } from '@/features/players/positions';
import { CHROME_AFTER_MS, CHROME_MS, COVER_MS, GROW_SWOOP_MS, GrowAwayContext, PAINT_WAIT_MS, REVEAL_MS, aimGrow, armGrow, cancelGrow, endGrow, goGrow, growCamera, growEarly, growHandOver, growHanded, growHost, growPlan, growPushed, growTAt, labelsOut, openGrow, setGrowMapStatus, setGrowWaiting, startGrow, useGrowClear, useGrowEarly, useGrowHanded, useGrowPushStats, useLatest, whenGrowPainted, type GrowPlan, type Rect } from '@/features/players/mapGrow';
import { zoomFile, zoomMark, zoomPath, zoomPreopen, zoomSettled, zoomTap, type ZoomReason } from '@/features/players/zoomTiming';
import { tabsOnShow } from '@/lib/goBack';
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
  // With the check-in zoom on (admins first, checkInZoom), once you are up the full map swoops down to you. On a phone
  // (v6) it is never opened the plain way from a card (that was the slide in from the side): the Community card grows
  // into it, only while the card is still in view, or nothing opens. Not inViewNow: iOS's own location prompt, the first
  // time, leaves the app 'inactive' for a moment, and that is still the card in view.
  const zoomOn = useCheckInZoom();
  // A grow under way (from the hidden full map opening until the page is back as it was): a tap on the card meanwhile opens no second full map.
  const growBusy = useRef(false);
  // The card's place is held from the hidden full map opening until the grow is over (cardHold): the page stays on show
  // under it and pushes in, so a fix landing as you are found must never move or cover the card mid-move.
  const growHold = useRef(false);
  // Up said for this tap (you are found): from then the grow opens the hidden map itself if it is not open yet (growGo).
  const upThisTap = useRef(false);
  // The Community tab's card grows into the full map (mapGrow); what sits on it slips out of it as it does.
  const growsHere = !!props.grow && !expanded;
  // With the zoom on (admins first), that card draws the full map's own pins (v5, mapGrow): its courts (lit ones too), open
  // hits, friends up to hit and you, laid out as the full map lays them out, so the push-in is into exactly what opens.
  // Everyone else's card is as it was (faces only).
  const fullCard = growsHere && zoomOn;
  // Reduce Motion, the phone's own setting, decided here and only here (v6): with it on the Community card does not zoom
  // at all (no push-in, nothing opens, you are simply up), so the push-in and the dive can never disagree about it (the
  // dive's page reads the setting itself and would jump where the push-in played). The app's own animations ignore the
  // setting (Oct 5, owner: "all animation should look like the one on my phone"); this one move respects it.
  const reduceMotion = useSystemReduceMotion();
  // The zoom's hooks on a phone: the Community card (it grows) and the full map's round arrow (it swoops where it is).
  // The For you copy of the card, and Reduce Motion, check in the plain way: nothing ever opens from them.
  const zoomHooks = zoomOn && (expanded || (growsHere && !reduceMotion));
  // As you are found: on the card that draws the full map's pins they all stay but yours (it lands on you at the end of the
  // dive), keeping their size on the screen as the page grows (its page follows the push-in: canvas lens, from growGo);
  // on any other, its pins step aside with its words (a quick fade in the map's own drawing). Back after.
  const [meOut, setMeOut] = useState(false);
  useGrowClear(growsHere, (clear) => {
    if (!clear) { growBusy.current = false; growHold.current = false; }
    if (!fullCard) { canvas.current?.clearPins(clear); return; }
    setMeOut(clear);
    if (!clear) { canvas.current?.lens(null); canvas.current?.pinsBack(); }
  });
  // The full map has shown its own pins over the card's (v6, its hand-over): the card's go at once, the same pins in the
  // same places under them, so no pin is ever seen twice or blinks.
  useGrowHanded(fullCard, () => canvas.current?.handed());
  // The push-in's own frames, for the timing log (admins).
  useGrowPushStats(fullCard);
  // Whether the card may grow now: the Community card, with something of where it is to show (not Only me), and its page up.
  const canGrow = () => growsHere && !keepNone && !!growHost();
  // "Who can see you on the map?" closing: the hidden full map waits a moment after it has gone, so the phone has finished
  // taking the sheet away before the next page opens over the tabs (iOS drops a page opened while another is still closing).
  const sheetUp = useWhoSeesYouUp();
  const sheetGoneAt = useRef(0);
  const sheetWas = useRef(sheetUp);
  useEffect(() => { if (sheetWas.current && !sheetUp) sheetGoneAt.current = Date.now(); sheetWas.current = sheetUp; }, [sheetUp]);
  /**
   * The hidden full map (v6, mapGrow's openGrow): opened see-through, its streets and pins hidden, its camera already on the
   * view the pushed-in card will show, so it has drawn by the time you are found. Asked for once the tabs are the page on
   * top (checked every 100 ms): never over a sheet still closing. `when`: while you are found, or only once you were.
   */
  const openEarly = (pageAt: Rect, cardAt: Rect, when: 'early' | 'found') => {
    const plan = growPlan({ page: pageAt, card: cardAt, screen: { w: windowW, h: windowH }, center: view.center, zoom: view.zoom });
    growHold.current = true;
    const id = openGrow({ ...plan, courts: fullCard ? model.courtPool : undefined });
    zoomPreopen(when);
    zoomMark('preopen');
    const tick = () => {
      const e = growEarly();
      if (!e || e.id !== id || e.cancelled || e.pushed) return;
      if (tabsOnShow() && Date.now() - sheetGoneAt.current >= SHEET_GONE_MS) {
        growPushed(id);
        router.push({ pathname: '/map', params: { grow: '1' } });
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  };
  /**
   * You said yes to "Who can see you on the map?" and the phone said yes to its own question (or both had before), and the
   * phone is finding you now (half a second to a few): the hidden full map opens, so it draws meanwhile (v6).
   */
  const growReady = () => {
    if (expanded) return;
    zoomMark('allowed');
    const page = growHost();
    const card = spot.ref.current;
    if (!zoomHooks || !onExpand || !canGrow() || !page || !card || growEarly()) return;
    void Promise.all([rectOf(page), rectOf(card)]).then(([pageAt, cardAt]) => {
      // Found already (a fix quicker than this): the grow opens it itself (growGo).
      if (upThisTap.current || growEarly() || !fits(pageAt) || !fits(cardAt)) return;
      openEarly(pageAt, cardAt, 'early');
    }).catch(() => undefined);
  };
  // The full map's first view (the card grown), its streets asked for while you are found, so it draws sooner (swoop's WARM_JS).
  const growWarm = () => {
    const page = growHost();
    const card = spot.ref.current;
    if (!zoomHooks || !onExpand || !canGrow() || !page || !card) return;
    void Promise.all([rectOf(page), rectOf(card)]).then(([pageAt, cardAt]) => {
      if (!fits(pageAt) || !fits(cardAt)) return;
      const grown = growPlan({ page: pageAt, card: cardAt, screen: { w: windowW, h: windowH }, center: view.center, zoom: view.zoom });
      canvas.current?.warm(grown.center, grown.zoom);
    }).catch(() => undefined);
  };
  /** No grow this tap (or it was let go before it started): the hidden full map closes itself, and the card is as it was. */
  const letGo = () => {
    cancelGrow();
    setGrowWaiting(false);
    growBusy.current = false;
    growHold.current = false;
  };
  const swoopOnUp = (here: LatLng): boolean | Promise<boolean> => {
    if (expanded) { swoopTo(here, false); return false; }
    upThisTap.current = true;
    zoomMark('found');
    const seen = curtainState() !== 'up' && onScreen && props.visible !== false && props.inView?.() !== false && AppState.currentState !== 'background' && spot.onScreen();
    // Never the plain way on a phone (the slide in from the side): anything in the way and nothing opens at all.
    const none = (why: ZoomReason) => { zoomPath('none', why); letGo(); return false; };
    if (!onExpand || !growsHere) return none('forYou');
    if (!seen) return none('notSeen');
    if (keepNone) return none('keepNone');
    if (!canGrow()) return none('measure');
    swoopTo(here, true);
    growBusy.current = true;
    growHold.current = true;
    // Your own pin stays off the card from now: it lands on you at the end of the dive (or on the card, if nothing opens).
    setMeOut(true);
    return growGo();
  };
  /**
   * The grow, from the card, the moment you are found (v6). The hidden full map has drawn (opened while you were found):
   * the live Community page starts pushing in this very frame, the card's words fading and what sits on it slipping out
   * (the pill playing its quick moment as it goes), and the full map hears when it started (goGrow) to take over at
   * COVER_MS. Not drawn yet: the pill keeps finding you up to PAINT_WAIT_MS while it does; still not, and nothing opens
   * (you are simply up, your pin landing on the card, the toast as ever). True if it grew.
   */
  const growGo = async (): Promise<boolean> => {
    const page = growHost();
    const card = spot.ref.current;
    const giveUp = (why: ZoomReason) => {
      zoomPath('none', why);
      letGo();
      setMeOut(false);
      // The swoop asked for goes unmade (the toast that waited for it comes now).
      swoopDrop();
      zoomFile();
      return false;
    };
    if (!page || !card) return giveUp('measure');
    // Not opened while you were found (a fix quicker than the phone's yes, or the page could not be measured then): now.
    if (!growEarly()) {
      try {
        const [pageAt, cardAt] = await Promise.all([rectOf(page), rectOf(card)]);
        if (fits(pageAt) && fits(cardAt) && !growEarly()) openEarly(pageAt, cardAt, 'found');
      } catch { /* below */ }
      if (!growEarly()) return giveUp('measure');
    }
    if (growEarly()?.status !== 'painted') {
      setGrowWaiting(true);
      if (!(await whenGrowPainted(PAINT_WAIT_MS))) return giveUp(growEarly()?.cancelled ? 'cancelled' : 'notReady');
    }
    // Measured again now: the push-in starts from where the page is (the hidden map's view does not depend on it: growCamera).
    let at: Rect[] | null = null;
    try { at = await Promise.all([rectOf(page), rectOf(card)]); } catch { at = null; }
    if (!at || !fits(at[0]) || !fits(at[1])) return giveUp('measure');
    if (growHost() !== page || AppState.currentState === 'background' || props.inView?.() === false) return giveUp('notSeen');
    const e = growEarly();
    if (!e || e.cancelled) return giveUp('cancelled');
    const plan = growPlan({ page: at[0], card: at[1], screen: { w: windowW, h: windowH }, center: view.center, zoom: view.zoom });
    armGrow();
    setGrowWaiting(false);
    aimGrow(plan);
    const started = startGrow(false);
    labelsOut();
    // The card's pins keep their size on the screen as the page grows round them (its own page follows the push-in).
    if (fullCard) canvas.current?.lens(started, plan.scale);
    goGrow({ ...plan, started });
    zoomMark('push');
    zoomPath('grown');
    return true;
  };
  const checkIn = useCheckIn(expanded ? 'map' : 'card', zoomHooks ? {
    up: swoopOnUp,
    finding: () => { upThisTap.current = false; if (!expanded) zoomMark('finding'); growWarm(); },
    allowed: growReady,
    // The tap is over: not up (refused, failed, the server said no), the hidden map goes; its row is filed unless it grew
    // (the full map files that one as it lands).
    over: () => {
      if (expanded) return;
      if (!upThisTap.current) { zoomPath('none', 'server'); letGo(); }
      if (!growBusy.current) zoomFile();
    },
  } : undefined);
  // The timing log's tap (admins with the zoom on): a row begins as Up to hit is turned on; where nothing can open
  // (the For you card, Reduce Motion) it says so at once.
  const tapNow = useLatest({ on: checkIn.on, busy: checkIn.busy, press: checkIn.press, hooks: zoomHooks, why: (growsHere ? 'rm' : 'forYou') as ZoomReason });
  const zoomPress = useRef(() => {
    const t = tapNow.current;
    if (!t.on && !t.busy) { zoomTap(); if (!t.hooks) { zoomPath('none', t.why); zoomFile(); } }
    t.press();
  }).current;
  const cardCheckIn = zoomOn && !expanded ? { ...checkIn, press: zoomPress } : checkIn;
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
  // Up to hit's one tip (upToHitTip): the Community card counts its visits, and on the 2nd or 3rd, to someone who has
  // never tapped Up to hit (nor been on the map), not on No one, not in the tutorial, it points at the pill.
  const tourOpen = useTourOpen();
  const uthVisit = useFindPlayersVisit(growsHere && onScreen && props.visible !== false && !tourOpen);
  const uthTip = growsHere && upToHitTipOn(me) && tipVisit(uthVisit) && onScreen && props.visible !== false && !tourOpen
    && mapVisibility !== 'none' && !settingsUnknown && !lastSeen[me.id] && tipWaiting('up-to-hit');
  // The No one re-ask (noOneReask): for someone on No one (or who said Not now), later, as trust builds; same card, same rules.
  const reaskDue = useNoOneReaskDue(me, settingsUnknown || !canChooseVisibility(mapLive, me, teenMap) ? undefined : mapVisibility);
  const reask = growsHere && reaskDue && onScreen && props.visible !== false && !tourOpen && tipWaiting('no-one-reask');
  // Where the card is centred stays put while it is seen (cardHold): a fix landing then waits until it is out of view.
  // And all through a grow (v6): the page is on show under the full map, then pushing in, though the router calls it covered.
  const place = useHeldCardPlace(expanded, at, !!locationOn, locating, () => growHold.current || ((cardUp || photoIn) && inViewNow()));
  // The town the card showed last time, with Location on and no fix yet (mapModel): read until it has shown something.
  const shotsVersion = useCardShots();
  const hint = useRef<CardHint | null>(null);
  if (!expanded && !cardUp && !photoIn) hint.current = cardHint(me.id);
  const model = useMapModel(me, players, place.at, focusCourt, !expanded, focusHit, focusUser, focusSpot, place.locationOn, focusPlace, hint.current, { full: fullCard, seed: expanded ? props.growFrom?.courts : null });
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
  const swoopAsk = (run: SwoopTo, grown?: [number, number, number, number]) => ({ ...swoopShape(), ...(grown ? { ms: GROW_SWOOP_MS, ease: grown, now: true } : null), id: run.id, lat: run.to.lat, lng: run.to.lng, zoom: CHECKIN_ZOOM, still, wait: 700 });
  const startSwoop = () => {
    const run = swoopRun.current;
    if (run) canvas.current?.swoop(swoopAsk(run));
  };
  const growing = useRef(!!growFrom);
  useEffect(() => { if (!growing.current) startSwoop(); }, [swoop.run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The grow's hand-over (v6, mapGrow), on the phone's full map opened early: it lies see-through over the live Community
  // page, its streets and pins hidden, its camera on the view the pushed-in card will show, drawn already. When the push-in
  // starts (goGrow, the moment you are found) it takes over at COVER_MS, the card just covering the screen: its camera set
  // where the card is looking that moment, its pins shown at once over the card's identical ones (which then go), its
  // streets in over the card's (REVEAL_MS, inside its own page), and the dive begun at the push-in's own speed. The map's
  // buttons slide in after (never fade: they are glass). No picture anywhere, nothing waiting mid-move.
  useGrowEarly();
  const earlyId = growFrom?.early ?? 0;
  const early = earlyId ? growEarly() : null;
  const goPlan = early && early.id === earlyId && early.started ? early.plan : null;
  const goPlanNow = useRef<GrowPlan | null>(null);
  if (goPlan) goPlanNow.current = goPlan;
  const goAt = goPlan?.started ?? 0;
  // How its drawing is getting on, for the card deciding whether to start (growGo); and for the timing log.
  useEffect(() => {
    if (!earlyId) return;
    setGrowMapStatus(earlyId, mapStatus);
    if (mapStatus === 'painted') zoomMark('painted');
  }, [mapStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // See-through (and not taking touches: app/map.tsx) until it has fully come in.
  const [seeThrough, setSeeThrough] = useState(!!growFrom);
  const chromeIn = useSharedValue(growFrom ? 0 : 1);
  const topAway = -(insets.top + 150);
  const bottomAway = insets.bottom + 170;
  const topSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * topAway }] }));
  const bottomSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * bottomAway }] }));
  const growDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handed = useRef(false);
  const handOver = () => {
    const p = goPlanNow.current;
    if (!p || handed.current) return;
    handed.current = true;
    growing.current = false;
    // Exactly where the pushed-in card is looking now (the push-in carries on past covering the screen; on the phone's one
    // clock), and the dive's start at the speed the push-in has then (growHandOver): one move, never a slow-down.
    const t = growTAt(Date.now() - p.started);
    const cam = growCamera(p, Math.pow(p.scale, t));
    const hand = growHandOver(p, CHECKIN_ZOOM, t);
    const run = swoopRun.current;
    canvas.current?.handOver(cam, run ? swoopAsk(run, hand.ease) : null);
    zoomMark('hand');
    // Two frames on, the card's pins go: the full map's identical ones are on show by then (a frame of both, never a blink).
    requestAnimationFrame(() => requestAnimationFrame(() => growHanded()));
    chromeIn.value = withDelay(CHROME_AFTER_MS, withTiming(1, { duration: CHROME_MS, easing: Easing.out(Easing.cubic) }));
    growDoneTimer.current = setTimeout(growDone, REVEAL_MS + 200);
  };
  // Timed from the moment the push-in started (the moment you were found), not from this page opening.
  useEffect(() => {
    if (!goAt || handed.current) return undefined;
    const t = setTimeout(handOver, Math.max(0, goAt + COVER_MS - Date.now()));
    return () => clearTimeout(t);
  }, [goAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Over once (it has fully come in, or the page left part way): the page under it back as it was, the tab bar to it.
  const growOver = useRef(!growFrom);
  const growEnd = () => {
    if (growOver.current) return false;
    growOver.current = true;
    endGrow();
    return true;
  };
  const growDone = () => {
    if (growOver.current) return;
    // Solid first (its streets have fully come in by now): the Community page going back to how it was, under it, can never
    // show through a map still part see-through.
    setSeeThrough(false);
    props.onGrown?.();
    requestAnimationFrame(() => requestAnimationFrame(() => growEnd()));
  };
  // Left part way (closed while it waited, or the app took the page).
  useEffect(() => () => { if (growDoneTimer.current) clearTimeout(growDoneTimer.current); growEnd(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The card drawing the full map's pins: everyone the full map places (its own list, unfiltered as it opens).
  const shown = expanded ? model.shown : fullCard ? model.ranked : cardPlayers;
  const selectedId = model.selected?.user.id ?? null;
  const selectedCourtId = model.selectedCourt?.id ?? null;
  const selectedHitId = model.selectedHit?.hit.id ?? null;
  // The pins' clock: a player's open-to-hit time running out takes their green ring off (and midnight
  // moves a hit's "Tomorrow" to "Today") by itself. The player list is kept while unchanged, so the
  // pins are no longer rebuilt on every redraw of the tab under them and need telling when time passes.
  const pinClock = useOpenClock(shown.map((p) => p.user.openToHitUntil));
  // Courts light up by what is on there right now (Light up, admins first; null: as before).
  const glow = useCourtGlow(model, expanded, shown, playing?.courtId, fullCard ? { full: true, seen: inViewNow } : undefined);
  const glowNow = glowKey(glow);
  // Everything drawn on the map, the same list the browser's map draws (pinList).
  const markers = useMemo<CanvasMarker[]>(
    () => {
      if (!fullCard) return mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe || !checkIn.on, playing, glow, meHold: swoop.meHold, land: swoop.land });
      // The card drawing the full map's pins: the full map's own list, nothing picked; your pin out once the push-in starts.
      return onTheCard(mapMarkers({ model, expanded: true, me, shown, selectedId: null, selectedCourtId: null, selectedHitId: null, hidden: hiddenMe || !checkIn.on, playing, glow, meHold: meOut ? 'out' : null }));
    },
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, theme, openToHit, model.mePos, hiddenMe, checkIn.on, playing?.courtId, playing?.courtName, pinClock, glowNow, swoop.meHold, swoop.land, fullCard, meOut], // eslint-disable-line react-hooks/exhaustive-deps
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
      // Never a picture with your own pin in it (the card drawing the full map's pins shows where you are): its streets only.
      if (cardCaptureBroken() || hasCardShot(key, 'card', markerHash) || !mapBox.current || markers.some((m) => m.id === 'me')) return;
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
      // Opened by the card growing into it: its pins are the card's, made from its first moment (hidden with it), never a wave.
      popIn={expanded && !growFrom}
      now={!!growFrom}
      // The phone's full map opened early by the check-in zoom (v6): see-through, hidden, until it takes over (handOver).
      hidden={!!growFrom}
      full={fullCard}
      onPainted={expanded ? undefined : () => showCard()}
      onShot={expanded ? undefined : (data) => {
        // The card's picture cover (cardShot): its streets alone.
        const k = shotFor.current; shotFor.current = null; if (k && k === keyNow.current && !keepNoneNow.current) saveStreetsShot(k, data);
      }}
      // The phone stopped the page (or took back its drawing) while the app was away: covered again before anyone looks.
      onLost={expanded ? undefined : () => { if (cardUp) coverAgainRef.current(true); }}
      // Given up on: the opening curtain stops waiting for it, and the card (or the full map's pill) says so.
      onStatus={(status) => { setMapStatus(status); if (!expanded && status === 'failed') painted?.(); }}
      holdPins={expanded && holdPins && !growFrom}
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
      // After a grow, its frames go in the timing log (admins).
      onSwooped={expanded && zoomOn ? (_arrived, id, stats) => { swoop.done(id); if (growFrom) zoomSettled(stats); } : undefined}
      onUp={growFrom ? () => zoomMark('up') : undefined}
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
        accessibilityLabel={failed ? "The map didn't load. Tap to try again" : 'Map of courts, open hits and friends up to hit'}
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
            <PreviewOverlay cityName={cityName} count={onCardCount} placeCount={model.cardCourts.length} hitCount={hitCount !== undefined && model.cardFromYou && !holding ? hitCount : model.cardHits.length} weather={weather} checkIn={onToggleLocation ? cardCheckIn : undefined} lock={lock} inviting={invitingShown.current} uthTip={uthTip} reask={reask} chip={fullCard} />
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
  // Near me (Oct 27, owner: "Near me should show people that have their location set in the area, like the city")
  // opens the players list: its town's players are listed there by their town, never put on the map (Apple
  // 5.1.2(i): pins stay friends only). Whatever card was up gives way to the list.
  // Every people chip does the same (Oct 28, owner: "The near me my level coaches etc. should be the same sideways
  // icons like following currently is"): Following, Open to hit, Near me, My level and Coaches each open the tray of
  // faces at rest, the full list a pull or See all away; All keeps the bare map and its pill.
  const pickFilter = (next: MapFilter) => {
    model.setFilter(next);
    if (next === 'all') return;
    setMeOpen(false);
    model.select(null);
    model.selectCourt(null);
    model.selectHit(null);
    model.clearPlace();
    setListTall(false);
    trayAt.current = 0;
    setListOpen(true);
  };
  const buttons = (pill: boolean) => <View pointerEvents="box-none" style={styles.crown}><MapButtons lead={pill ? <PlayersPill items={model.tray} query={model.query} filter={model.filter} courts={model.nearestCourts} lock={lock} nearTown={model.nearTown} onOpen={() => { setListTall(false); trayAt.current = 0; setListOpen(true); }} /> : undefined} onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); model.clearPlace(); canvas.current?.flyTo(model.homeView.center, model.homeView.zoom ?? CITY_ZOOM, 600); }} /></View>;
  // Zoomed out past about a city with the courts on: "Zoom in to see courts" (not over a court's card, nor a search).
  const zoomNote = model.courtsOn && far && !model.selectedCourt && !model.query.trim();
  return (
    // See-through while the card grows into it (v6): the live Community page under it is what is seen until it takes over.
    <View style={[styles.fill, seeThrough ? styles.seeThrough : null]} onLayout={(e) => setMapH(Math.round(e.nativeEvent.layout.height))}>
      {mapView}
      <Reanimated.View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }, growFrom ? topSlide : null]}>
        {/* Two rows (Oct 11, owner: "Two rows weather in search"): Back, the search and Location, the city and its weather in the bar itself; then the filter chips. */}
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} checkIn={onToggleLocation ? checkIn : undefined} results={model.courtResults} onPickCourt={model.pickCourt} places={model.placeSearch} onPickPlace={model.pickPlace} players={model.query.trim() ? model.tray.length : 0} cityName={model.homeKnown ? cityName : ''} weather={model.homeKnown ? weather : null} />
        <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setChipsEnd(Math.round(y + height)); }}>
          <FilterChips filter={model.filter} onFilter={pickFilter} onAgain={(key) => { if (key !== 'all') pickFilter(key); }} courtsOn={model.courtsOn} onCourts={model.toggleCourts} courtsLoading={model.courtsLoading} />
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
            <PlayersSheet items={model.tray} cityName={cityName} onSelect={model.select} onProfile={onOpen} nearTown={model.nearTown} query={model.query} filter={model.filter} courts={model.nearestCourts} onPickCourt={model.selectCourt} lock={lock} onUnlock={unlock} onClose={() => setListOpen(false)} openTall={listTall} onTall={setListTall} room={{ height: mapH, top: chipsEnd, foot: barInset }} stripAt={trayAt} />
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

/**
 * Reduce Motion, the phone's own setting (v6): read here for the check-in zoom alone, as it is now and whenever it changes.
 * (The app's useReducedMotion is always no, on purpose: Oct 5, owner, "all animation should look like the one on my phone".)
 */
function useSystemReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setOn(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => setOn(v));
    return () => { live = false; sub.remove(); };
  }, []);
  return on;
}

/** How long after "Who can see you on the map?" has gone the hidden full map may open over the tabs (the phone finishing taking the sheet away). */
const SHEET_GONE_MS = 400;
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, Math.max(0, ms)));
/** Where a view is on the screen; a view gone meanwhile never answers, so it is given up on after a moment. */
const rectOf = (v: View) => Promise.race([
  new Promise<Rect>((done) => v.measureInWindow((x, y, w, h) => done({ x, y, w, h }))),
  wait(500).then((): Rect => { throw new Error('not measured'); }),
]);
const fits = (r: Rect) => r.w > 0 && r.h > 0;

const styleDefinitions = StyleSheet.create({
  card: { height: HEIGHT, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  // The card's own colour, solid, over the map while it loads.
  cover: { backgroundColor: colors.bgElevated },
  fill: { flex: 1, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  // The phone's full map while the card grows into it (v6): nothing of its own showing over the page under it.
  seeThrough: { backgroundColor: 'transparent' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, gap: 2 },
  checkInBar: { marginHorizontal: spacing.md, marginTop: spacing.sm },
  // The map's buttons, riding on whatever is up along the bottom.
  crown: { marginBottom: spacing.md },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  // Under a card: the card's colour beneath the tab bar, a point up over the card's foot so no seam shows.
  foot: { backgroundColor: colors.surface, marginTop: -1 },
});
