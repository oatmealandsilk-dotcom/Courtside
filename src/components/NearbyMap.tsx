import * as haptics from '@/lib/haptics';
import { themes, useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PixelRatio, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image as PhotoImage } from 'expo-image';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { File, Paths } from 'expo-file-system';
import Reanimated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardCredit, ChipsNoteLine, CitylessCard, CourtSheet, CourtsZoomNote, FilterChips, HitSheet, ListCrown, PIN_FIT_TOP, YouSheet, MapButtons, MapTopBar, PlaceSheet, PlayerSheet, PlayersPill, PlayersSheet, PreviewOverlay, WhereCard } from '@/components/map/MapChrome';
import { CardStage } from '@/components/map/CardStage';
import { warmMapEngine } from '@/components/map/engineCopy';
import { MapCanvas, type CanvasMarker, type MapCanvasHandle, type MapLoadStatus, type MapVeil } from '@/components/map/MapCanvas';
import { MAP_LOADING, softShotAllowed, MAP_REVEAL_MS, MapCardFailed, MapCardLoading, MapLoadPill } from '@/components/map/MapLoadState';
import { cardCaptureBroken, cardHint, hasCardShot, hashText, loadCardShots, peekCardShot, peekPlaceShot, saveCardShot, saveStreetsShot, setCardHint, shotKey, useCardShots, forgetPlaces, type CardHint } from '@/components/map/cardShot';
import { useCardOnScreen, useHeldCardPlace } from '@/components/map/cardHold';
import { CARD_HEIGHT, CARD_ZOOM, onCard } from '@/components/map/cardFit';
import { STYLE, cardLook, lookFor } from '@/components/map/look';
import { MAP_PIN_CSS, clusterTemplates, courtLift, youLift } from '@/components/map/markers';
import { mapMarkers, onTheCard } from '@/components/map/pinList';
import { glowKey, useCourtGlow } from '@/features/places/lightUp';
import { playedTodayKey } from '@/features/places/playedToday';
import { usePlayedToday } from '@/features/places/usePlayedToday';
import { livePin } from '@/features/activity/liveSession';
import type { NearbyMapProps } from '@/components/NearbyMap.types';
import { placeZoom } from '@/features/places/geocode';
import { milesBetween } from '@/features/players/geo';
import { COURTS_MIN_ZOOM, useMapModel, type Listed, type MapFilter } from '@/features/players/mapModel';
import { askWhoSeesYou, canChooseVisibility, nearbyLock, onTeenMap, type NearbyLock } from '@/features/players/mapPrivacy';
import type { CourtRow } from '@/features/players/courts';
import type { Weather } from '@/lib/weather';
import { useCheckIn, useOpenToHitToggle, type CheckInControl, type CheckInZoomHooks } from '@/features/players/useLocationToggle';
import { useFindPlayersVisit, tipVisit, upToHitTipOn } from '@/features/players/upToHitTip';
import { useNoOneReaskDue } from '@/features/players/noOneReask';
import { tipWaiting } from '@/features/tips/tips';
import { useTourOpen } from '@/features/tour/tourStore';
import { CHECKIN_ZOOM, swoopShape, swoopTo, useCheckInZoom, useMapSwoop } from '@/features/players/checkInZoom';
import type { LatLng } from '@/features/players/positions';
import { CHROME_AFTER_MS, CHROME_MS, COVER_MS, GROW_SWOOP_MS, GrowAwayContext, HANDOFF_MS, REVEAL_MAX_MS, REVEAL_MS, aimGrow, aimGrowAt, armGrow, armQuick, endGrow, growArmed, growCamera, growFollow, growHandOver, growHost, growPlan, growTAt, labelsOut, setGrowPlan, startGrow, startSlip, useGrowClear, useGrowPicture, type GrowPlan, type Rect } from '@/features/players/mapGrow';
import { V7, V7_WARM_MID, coverU, metresApart, useV7ChromeControl, v7Arrival, v7Arrived, v7Away, v7ChromeNow, v7Drop, v7Flying, v7ForceHand, v7Geo, v7Held, v7Hold, v7Later, v7Layer, v7Move, v7Offer, v7OffHand, v7OnHand, v7OnLanded, v7Pushed, v7Reset, v7SetChrome, v7SetChromeControl, v7SetHanded, v7SetOverlay, v7SetPushed, v7SetRouteUp, v7SetTarget, v7Target, v7Ui, type V7Chrome, type V7Params } from '@/features/players/zoomV7';
import { zoomGo, zoomHanded, zoomMark, zoomNote as zoomWord, zoomPath, zoomTap, type ZoomReason } from '@/features/players/zoomTiming';
import { SIM_DRIVER, simAction } from '@/lib/simDriver';
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
/** No pins (one list, so a card without the zoom never hands on a new empty one). */
const NO_MARKERS: CanvasMarker[] = [];
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
  // Reduce Motion (the phone's own setting): read here, before anything of the zoom (the iPhone's opens the full map straight
  // onto you then, with no layer drawn ahead).
  const still = useReducedMotion();
  // The iPhone (v7, zoomV7): the plain card stays exactly as it is (the city words in its middle, its own pins, the pill), and
  // a map drawn ahead in the zoom layer (ZoomLayer) flies the move from it. The zoom is the iPhone's only on a phone now.
  // Still v7 with Reduce Motion (never the picture path's card, fullCard), but with no layer and no move.
  const v7On = growsHere && zoomOn && Platform.OS === 'ios';
  // The card drawing the full map's own pins (v5, mapGrow: its courts, lit ones too, open hits, friends up to hit and you,
  // laid out as the full map lays them out) was the picture path's, which no phone takes any more (the website has its own,
  // NearbyMap.web). Everyone else's card is as it was (faces only).
  const fullCard = growsHere && zoomOn && !v7On;
  // As you are found: on the card that draws the full map's pins they all stay but yours (it lands on you at the end of the
  // dive), keeping their size on the screen as the page grows (its page follows the push-in: canvas lens, from growGo);
  // on any other, its pins step aside with its words (a quick fade in the map's own drawing). Back after.
  const [meOut, setMeOut] = useState(false);
  useGrowClear(growsHere, (clear) => {
    // v7: the card is under the zoom layer's window from the first frame, so its own page is left as it is (a change made
    // in it while the full map covered it left the card blank for up to 0.17 s as Back slid the page in: see cardPins).
    if (v7On) return;
    if (!fullCard) { canvas.current?.clearPins(clear); return; }
    setMeOut(clear);
    if (!clear) canvas.current?.lens(null);
  });
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
        // Found already (a quick fix): the push-in is under way, and a picture now would hold the phone mid-move. None:
        // the full map opens once the card covers the screen, with the card's map alone (growGo).
        if (fits(pageAt) && fits(cardAt) && fits(boxAt) && !growArmed()) {
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
    // Reduce Motion takes the plain way in below (the full map opens straight onto you, close in, no swoop).
    if (!expanded && v7On && !still) return v7Up(here);
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
    // The card's pins keep their size on the screen as the page grows round them (its own page follows the push-in).
    if (fullCard) canvas.current?.lens(started, plan.scale);
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
      setGrowPlan({ ...plan, shot, box: { rect: at.box, shot: boxShot, radius: Math.max(0, radius.xl - 1) }, started, courts: fullCard ? model.courtPool : undefined });
      router.push({ pathname: '/map', params: { grow: '1' } });
      // The full map lets go of the two it shows (planShots); any other taken meanwhile goes now.
      void p.done.then(() => dropShots(p.files.filter((f) => f !== shot && f !== boxShot)));
      return 'grown';
    } catch {
      letGo();
      return here() ? 'plain' : 'gone';
    }
  };
  /**
   * v8 (zoomV7): this tap's move. Measured as finding you starts; started as soon as there is somewhere to go (where the phone
   * already is, else the new reading, else the server's yes), from the tap itself; or given up, with the reason. `arrival`:
   * over once the move has been handed over or stopped, or at once if none started (the toast and the one tip wait for it).
   */
  const v7Now = useRef<V7Tap | null>(null);
  const v7Finding = () => {
    zoomMark('finding');
    const old = v7Now.current;
    if (old && !old.over && !old.started) old.arrive();
    const cardNode = spot.ref.current;
    const page = growHost();
    const pre: Promise<V7Pre | null> = cardNode && page
      ? Promise.all([rectOf(page), rectOf(cardNode)]).then(([pageAt, cardAt]) => {
        if (!fits(pageAt) || !fits(cardAt)) return null;
        v7Layer()?.aim(cardAt);
        zoomMark('aimed');
        return { pageAt, cardAt };
      }).catch(() => null)
      : Promise.resolve(null);
    let arrive = () => undefined as void;
    const arrival = new Promise<void>((done) => { arrive = done; });
    v7Now.current = { pre, started: false, over: false, trying: false, next: null, found: false, arrival, arrive };
    // Nothing new reaches the layer from here (a new list sent to its page as the move starts held up its first frames).
    v7Hold(true);
    // The pill's quick moment as it slips out (it turns green on this very tap), when a move is likely.
    if (v7Layer()?.ready()) armQuick();
    const guess = lastSeen[me.id] ?? at ?? null;
    if (guess) { v7Layer()?.warm(guess, CHECKIN_ZOOM); v7Layer()?.warm(guess, V7_WARM_MID); }
  };
  /** v8: the tap's move given up before it started (the reason goes in its timing row); nothing opens, you are simply up. */
  const v7Give = (t: V7Tap, why: ZoomReason) => {
    if (t.over) return;
    t.over = true;
    zoomPath('none', why);
    v7Hold(false);
    t.arrive();
  };
  /**
   * v8: a spot to start from (where the phone already is, the new reading, or the server's yes). The page and the card are
   * measured by now (or in a moment); a layer not drawn yet (the first tap after opening, or drawn again where the card has
   * moved to) is waited for, V7.readyWait at most. A newer spot that comes meanwhile is the one started from.
   */
  const v7Try = async (here: LatLng, mark: 'early' | 'read' | 'found') => {
    const t = v7Now.current;
    if (!t || t.started || t.over) return;
    zoomMark(mark);
    if (t.trying) { t.next = here; return; }
    t.trying = true;
    const pre = await t.pre;
    const since = Date.now();
    while (v7Now.current === t && !t.over && !v7Layer()?.ready() && Date.now() - since < V7.readyWait) await wait(16);
    t.trying = false;
    if (v7Now.current !== t || t.over || t.started) return;
    if (Date.now() - since > 20) zoomWord(`waited ${Date.now() - since}ms`);
    const to = t.next ?? here;
    t.next = null;
    v7Go(t, to, pre);
  };
  /**
   * v8, the move, all at once (nothing measured or waited for now): the layer drawn ahead shows through the card and flies
   * the whole move, the page pushing in round your spot, the tab bar sliding away, the card's words fading and what sits on it
   * slipping out (mapGrow). Nothing opens and you are simply up if the layer has not drawn, the card was not measured, is out
   * of view, or you are not on it.
   */
  const v7Go = (t: V7Tap, here: LatLng, pre: V7Pre | null) => {
    const layer = v7Layer();
    const seen = curtainState() !== 'up' && onScreen && props.visible !== false && props.inView?.() !== false && AppState.currentState !== 'background' && spot.onScreen();
    const why: ZoomReason | null = !layer ? 'noLayer' : !layer.ready() ? 'notReady' : !pre || !growHost() ? 'measure' : !seen ? 'notSeen' : null;
    if (why || !layer || !pre) { v7Give(t, why ?? 'measure'); return; }
    const { pageAt, cardAt } = pre;
    // You on the card (window points): its middle shows its town at its zoom.
    const z0 = CARD_ZOOM;
    const wx = (ll: LatLng) => ((ll.lng + 180) / 360) * 512 * 2 ** z0;
    const wy = (ll: LatLng) => { const k = Math.sin((Math.max(-85, Math.min(85, ll.lat)) * Math.PI) / 180); return (0.5 - Math.log((1 + k) / (1 - k)) / (4 * Math.PI)) * 512 * 2 ** z0; };
    const K = { x: cardAt.x + cardAt.w / 2, y: cardAt.y + cardAt.h / 2 };
    const q0 = { x: K.x + wx(here) - wx(view.center), y: K.y + wy(here) - wy(view.center) };
    if (q0.x < cardAt.x || q0.x > cardAt.x + cardAt.w || q0.y < cardAt.y || q0.y > cardAt.y + cardAt.h) { v7Give(t, 'offCard'); return; }
    // The push-in grows round your own spot (kept in from the card's edges, so it covers the screen soon), as far as the card
    // needs to cover the screen and a touch more (its corners and edge go off the screen).
    const M = V7.margin;
    const P = { x: Math.min(Math.max(q0.x, cardAt.x + M), cardAt.x + cardAt.w - M), y: Math.min(Math.max(q0.y, cardAt.y + M), cardAt.y + cardAt.h - M) };
    const S = 1.03 * Math.max(P.x / (P.x - cardAt.x), (windowW - P.x) / (cardAt.x + cardAt.w - P.x), P.y / (P.y - cardAt.y), (windowH - P.y) / (cardAt.y + cardAt.h - P.y));
    const t0 = Date.now() + V7.lead;
    const p: V7Params = { t0, D: V7.D, ease: V7.ease, z0, z1: CHECKIN_ZOOM, S, P, W: windowW, H: windowH, K, city: view.center, you: here, uc: 0, tg: 0, landLead: V7.landLead, me: v7MeAt(here), trace: SIM_DRIVER };
    p.uc = coverU(p);
    p.tg = p.uc * V7.D + V7.glide;
    t.started = true;
    v7Reset(t0 + V7.D - V7.landLead + V7.ringMs);
    v7SetTarget(here);
    void v7Arrival()?.then(t.arrive);
    // Only the web view and the UI thread are told now, and nothing redraws on the JS thread this turn (the tab bar's slide
    // is the UI thread's own, the pages that listen hear of it on the next turn): a redraw now held the move's start back.
    layer.go(p);
    v7Ui.value = { n: 0, gap: 0, last: 0, first: -1, at: 0, gaps: [] };
    v7Geo.value = { kx: K.x, ky: K.y, px: P.x, py: P.y };
    v7Move.value = { on: 1, t0, D: V7.D, x1: V7.ease[0], y1: V7.ease[1], x2: V7.ease[2], y2: V7.ease[3], dz: CHECKIN_ZOOM - z0, S, hidden: 0, cMs: V7.chromeMs };
    aimGrowAt(pageAt, P, S);
    labelsOut();
    startSlip();
    setTimeout(armGrow, 0);
    zoomGo(t0);
    zoomPath('grown');
    // The streets where it lands, asked for at once.
    layer.warm(here, CHECKIN_ZOOM);
    layer.warm(here, V7_WARM_MID);
    v7Later(() => zoomMark('cover'), t0 + p.uc * V7.D - Date.now());
    // Once the camera has landed (your pin landing, the buttons in), the full map opens under the layer at the landing view,
    // with the card's courts: its web view is made off the move (made mid-move it stalled the layer's frames).
    const courts = model.courtPool;
    v7OnLanded(() => {
      if (t.over || v7Pushed()) return;
      const to = v7Target() ?? here;
      const plan = growPlan({ page: pageAt, card: cardAt, screen: { w: windowW, h: windowH }, center: to, zoom: CHECKIN_ZOOM });
      setGrowPlan({ ...plan, center: to, zoom: CHECKIN_ZOOM, started: t0, courts, v7: true });
      v7SetPushed();
      router.push({ pathname: '/map', params: { grow: '1' } });
      zoomMark('push');
    });
  };
  /** v8: your own pin as the full map draws it (its look and its tag), at `at`, for the layer to land as the camera settles. */
  const v7MeAt = (spotAt: LatLng): CanvasMarker | null => {
    if (hiddenMe) return null;
    // Only the courts round you count for it (the one you stand on): the rest of the list is never made.
    const near = model.courts.filter((c) => milesBetween(c, spotAt) < 0.2);
    const list = mapMarkers({ model: { ...model, mePos: spotAt, courts: near, hits: [] }, expanded: true, me, shown: [], selectedId: null, selectedCourtId: null, selectedHitId: null, hidden: false, playing, glow: null });
    return list.find((m) => m.id === 'me') ?? null;
  };
  /** v8: where the phone already is (a reading under 2 minutes old): the move starts from there, now. */
  const v7Early = (here: LatLng) => { void v7Try(here, 'early'); };
  /**
   * v8: the new reading. Not started yet: it starts from here. Under way: it lands here instead if this is more than
   * V7.retargetM from where it was going (moved during the move's tail, never while the card's edge is on screen).
   */
  const v7Read = (here: LatLng) => {
    const t = v7Now.current;
    if (!t || t.over) return;
    if (!t.started) { void v7Try(here, 'read'); return; }
    zoomMark('read');
    const was = v7Target();
    if (!was) return;
    const off = metresApart(was, here);
    if (off <= V7.retargetM) return;
    v7SetTarget(here);
    v7Layer()?.retarget(here);
    zoomWord(`retarget ${Math.round(off)}m`);
  };
  /** v8: the server said yes. Under way: it lands on this reading. Not started (the layer was drawing): it may start now. */
  const v7Up = (here: LatLng): boolean => {
    zoomMark('found');
    const t = v7Now.current;
    if (!t || t.over) return false;
    t.found = true;
    if (t.started) { v7Read(here); return true; }
    void v7Try(here, 'found');
    return true;
  };
  /**
   * v8: it could not put you up after all. Not started: nothing opens. Under way: the move stops and the page goes back (the
   * button then shakes, the toast says why); the full map already open under it takes over instead (it says you are not up).
   */
  const v7Failed = () => {
    const t = v7Now.current;
    if (!t || t.over) return;
    if (!t.started) { v7Give(t, 'server'); return; }
    t.over = true;
    zoomWord('serverNo');
    if (v7Pushed() && v7ForceHand()) return;
    v7Layer()?.stop();
  };
  /** v8: the tap is over, however it went: a move that never started (and is not waiting for the layer) is given up. */
  const v7Over = () => {
    const t = v7Now.current;
    if (!t || t.started || t.trying || t.over) return;
    v7Give(t, t.found ? 'notReady' : 'server');
  };
  const v7Landing = (): Promise<void> | null => v7Now.current?.arrival ?? null;
  // Which of the zoom's hooks Up to hit has here: the Community card's move (v7 on the iPhone), the full map's round arrow
  // (its swoop to you), or none (the For you copy of the card: you are simply up, as with the zoom off; a phone never slides
  // the map in for it).
  // With Reduce Motion the Community card opens the full map straight onto you (swoopOnUp's plain way).
  const zoomHooks: CheckInZoomHooks | undefined = !zoomOn ? undefined
    : v7On ? (still ? { up: swoopOnUp, instant: true } : { instant: true, finding: v7Finding, early: v7Early, read: v7Read, up: swoopOnUp, failed: v7Failed, over: v7Over, landed: v7Landing })
      : expanded || growsHere ? { up: swoopOnUp, finding: growWarm, allowed: growReady, over: dropPrep }
        : undefined;
  const checkIn = useCheckIn(expanded ? 'map' : 'card', zoomHooks);
  // The timing log's tap (v7, zoomTiming): a row begins as the card's Up to hit is turned on.
  const checkInNow = useRef(checkIn);
  checkInNow.current = checkIn;
  const v7Press = useRef(() => { const c = checkInNow.current; if (!c.on && !c.busy) zoomTap(); c.press(); }).current;
  const v7CheckIn = useMemo<CheckInControl>(() => ({ ...checkIn, press: v7Press }), [checkIn.on, checkIn.busy, checkIn.span, checkIn.until, checkIn.failed]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardCheckIn = v7On ? v7CheckIn : checkIn;
  // The simulator's proof (simDriver, demo builds only): its "uth" is a tap of this card's Up to hit.
  const cardPressNow = useRef(cardCheckIn.press);
  cardPressNow.current = cardCheckIn.press;
  useEffect(() => (growsHere ? simAction('uth', () => cardPressNow.current()) : undefined), [growsHere]);
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
  const place = useHeldCardPlace(expanded, at, !!locationOn, locating, () => (cardUp || photoIn) && inViewNow());
  // The town the card showed last time, with Location on and no fix yet (mapModel): read until it has shown something.
  const shotsVersion = useCardShots();
  const hint = useRef<CardHint | null>(null);
  if (!expanded && !cardUp && !photoIn) hint.current = cardHint(me.id);
  const model = useMapModel(me, players, place.at, focusCourt, !expanded, focusHit, focusUser, focusSpot, place.locationOn, focusPlace, hint.current, { full: fullCard || v7On, seed: expanded ? props.growFrom?.courts : null });
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
  const [growShot, setGrowShot] = useState(!!growFrom && !growFrom.v7);
  const [growDue, setGrowDue] = useState(false);
  const [growLate, setGrowLate] = useState(false);
  const growPicture = useGrowPicture();
  // v7: the buttons are already in when the full map takes over (their copies slid in over the layer as it landed).
  const chromeIn = useSharedValue(growFrom && !growFrom.v7 ? 0 : 1);
  const topAway = -(insets.top + 150);
  const bottomAway = insets.bottom + 170;
  const topSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * topAway }] }));
  const bottomSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - chromeIn.value) * bottomAway }] }));
  // Timed from the moment the push-in started (the moment you were found), not from this page opening.
  useEffect(() => {
    if (!growFrom || growFrom.v7) return undefined;
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
  // v7 (zoomV7): this map opened under the zoom layer at the landing view. Once it has drawn and the layer's camera has
  // landed it takes over in one frame (the two are the same picture but for your pin): the layer goes, your pin lands, the
  // map's buttons slide in. Drawn or not, it takes over V7.handMax after the landing (its own loading look then shows), and
  // at once if the app is put away.
  const v7Handed = useRef(false);
  // v8: until it has taken over, this map's buttons show what their copies over the layer show (ChromeData), so the two are
  // one picture; its own from then on (any difference then is this map's own data arriving, as on any opening).
  const [v7Live, setV7Live] = useState(!growFrom?.v7);
  const chromeControl = useV7ChromeControl(!!growFrom?.v7 && !v7Live) as CheckInControl | null;
  const v7Hand = (forced: boolean) => {
    if (!growFrom?.v7 || v7Handed.current) return;
    v7Handed.current = true;
    v7OffHand();
    v7SetHanded();
    v7Layer()?.handed();
    zoomHanded(forced);
    growing.current = false;
    growEnd();
    setV7Live(true);
    swoop.done(swoopRun.current?.id);
    // The layer is kept (aimed back at the card once it is on show again); the card's next offer reaches it then.
    v7Hold(false, false);
    v7Arrived();
    props.onGrown?.();
  };
  const v7HandNow = useRef(v7Hand);
  v7HandNow.current = v7Hand;
  const mapStatusNow = useRef(mapStatus);
  mapStatusNow.current = mapStatus;
  useEffect(() => {
    if (!growFrom?.v7) return undefined;
    v7OnHand((forced) => v7HandNow.current(forced));
    let late: ReturnType<typeof setTimeout> | null = null;
    // Not drawn V7.handMax after the landing: it takes over then only if its page gave up; one still loading is given until
    // V7.handMaxLoading (the layer meanwhile shows the very same view, finished, so taking over early would only show this
    // map's own loading look in its place).
    const offLanded = v7OnLanded(() => {
      late = setTimeout(() => {
        if (mapStatusNow.current === 'failed') { v7HandNow.current(true); return; }
        late = setTimeout(() => v7HandNow.current(true), V7.handMaxLoading - V7.handMax);
      }, V7.handMax);
    });
    // However the layer's camera goes, never later than this after the move was due to land.
    const latest = setTimeout(() => v7HandNow.current(true), growFrom.started + V7.D + V7.handMaxLoading + 1000 - Date.now());
    const app = AppState.addEventListener('change', (st) => { if (st === 'background') v7HandNow.current(true); });
    return () => {
      offLanded();
      if (late) clearTimeout(late);
      clearTimeout(latest);
      app.remove();
      // Left before it took over: the layer is put away (kept, aimed back at the card later).
      if (!v7Handed.current) { v7Handed.current = true; v7OffHand(); v7SetHanded(); v7Layer()?.handed(); zoomHanded(true); v7Hold(false, false); v7Arrived(); }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!growFrom?.v7 || mapStatus !== 'painted') return;
    zoomMark('drawn');
    v7SetRouteUp();
  }, [mapStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!growFrom || growFrom.v7 || !growing.current || !growDue || (mapStatus === 'loading' && !growLate)) return;
    growing.current = false;
    // The camera starts exactly where the pushed-in card is looking now (growCamera: past the plan, as the page carries on
    // past covering the screen; on the phone's one clock, as the map's page has been following it), and dives on at the
    // speed the push-in has.
    const hand = growHandOver(growFrom, CHECKIN_ZOOM);
    const cam = growCamera(growFrom, Math.pow(growFrom.scale, growTAt(Date.now() - growFrom.started)));
    // v5: the map's page lies over the pictures, its pins showing all along; its streets now come in over them (unveil),
    // and the pictures go once they have.
    canvas.current?.unveil();
    canvas.current?.flyTo(cam.center, cam.zoom, 0, 0, true);
    startSwoop(hand.ease);
    const done = setTimeout(growDone, REVEAL_MS + 80);
    growDoneTimer.current = done;
    chromeIn.value = withDelay(CHROME_AFTER_MS, withTiming(1, { duration: CHROME_MS, easing: Easing.out(Easing.cubic) }));
  }, [growDue, growLate, mapStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  // Left part way (Back mid-grow, or mid-dissolve).
  const growDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (growDoneTimer.current) clearTimeout(growDoneTimer.current); growEnd(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The map's page over the pictures (MapCanvas veil): see-through, pins only, following the push-in until it takes over.
  const [veil] = useState<MapVeil | null>(() => {
    if (!growFrom || !growFrom.box) return null;
    const f = growFollow(growFrom);
    const r = growFrom.box.rect;
    // The fixed point the page grows round, on the screen (the page's own coordinates plus where the page is).
    const ox = growFrom.page.x + (f.ax + (growFrom.card.x - growFrom.page.x + growFrom.card.w / 2));
    const oy = growFrom.page.y + (f.ay + (growFrom.card.y - growFrom.page.y + growFrom.card.h / 2));
    return { follow: f, card: { x: r.x, y: r.y, w: r.w, h: r.h, r: growFrom.box.radius, ox, oy } };
  });

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
  // Played here today (playedToday; off until approved; null: as before).
  const today = usePlayedToday(model, expanded, fullCard ? { full: true, seen: inViewNow } : undefined);
  const todayNow = playedTodayKey(today);
  // Everything drawn on the map, the same list the browser's map draws (pinList).
  const markers = useMemo<CanvasMarker[]>(
    () => {
      // v7: your pin has landed in the zoom layer already, so here it is simply there (never held, never landed again).
      if (!fullCard) return mapMarkers({ model, expanded, me, shown, selectedId, selectedCourtId, selectedHitId, hidden: hiddenMe || !checkIn.on, playing, glow, today, meHold: growFrom?.v7 ? null : swoop.meHold, land: growFrom?.v7 ? 0 : swoop.land });
      // The card drawing the full map's pins: the full map's own list, nothing picked; your pin out once the push-in starts.
      return onTheCard(mapMarkers({ model, expanded: true, me, shown, selectedId: null, selectedCourtId: null, selectedHitId: null, hidden: hiddenMe || !checkIn.on, playing, glow, today, meHold: meOut ? 'out' : null }));
    },
    [model.courts, model.ringed, model.cardCourts, model.cardRinged, model.hits, shown, selectedId, selectedCourtId, selectedHitId, expanded, me, theme, openToHit, model.mePos, hiddenMe, checkIn.on, playing?.courtId, playing?.courtName, pinClock, glowNow, todayNow, swoop.meHold, swoop.land, fullCard, meOut], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // What "+N" pins look like, in this theme's colours.
  const tpl = useMemo(() => clusterTemplates(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  // v7: nothing reaches the card's own page from the moment you are found until it is on show again after the move (nor while
  // it is out of sight otherwise): a new list sent while the full map covered it left the card blank for up to 0.17 s as
  // Back slid the page in, while its page drew again (simulator). It gets the latest as it is on show again.
  const cardPins = useRef(markers);
  if (!v7On || (onScreen && !v7Flying() && !v7Held())) cardPins.current = markers;
  // v7: the full map's own pins (its courts, lit ones too, open hits, friends up to hit; your pin waits to land), for the
  // zoom layer to switch to as the card covers the screen. The card keeps its own.
  const glowFull = useCourtGlow(model, false, v7On ? model.ranked : [], playing?.courtId, v7On ? { full: true, seen: inViewNow } : undefined);
  const glowFullNow = glowKey(glowFull);
  // And its "Played here today" glow (playedToday), as the full map draws it.
  const todayFull = usePlayedToday(model, false, v7On ? { full: true, seen: inViewNow } : undefined);
  const todayFullNow = playedTodayKey(todayFull);
  const fullMarkers = useMemo<CanvasMarker[]>(
    () => (v7On ? onTheCard(mapMarkers({ model, expanded: true, me, shown: model.ranked, selectedId: null, selectedCourtId: null, selectedHitId: null, hidden: hiddenMe || !checkIn.on, playing, glow: glowFull, today: todayFull, meHold: 'out' })) : NO_MARKERS),
    [v7On, model.courts, model.ringed, model.hits, model.ranked, me, theme, model.mePos, hiddenMe, checkIn.on, playing?.courtId, playing?.courtName, pinClock, glowFullNow, todayFullNow], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // v7: the zoom layer (ZoomLayer) is drawn ahead from this card while it is drawn and on show: its pins and the full map's,
  // the full map's look, its town and where it is on the screen (measured each time). Out of view a while, it is let go.
  const v7Shown = v7On && !still && cardUp && coverGone && onScreen && props.visible !== false;
  // Only once the card has been on show a moment (V7.settleMs): never while the page is still sliding in.
  const [v7Warm, setV7Warm] = useState(false);
  useEffect(() => {
    if (!v7Shown) { setV7Warm(false); return undefined; }
    const t = setTimeout(() => setV7Warm(true), V7.settleMs);
    return () => clearTimeout(t);
  }, [v7Shown]);
  const fullLook = useMemo(() => lookFor(themes[theme]), [theme]);
  useEffect(() => {
    if (!growsHere) return undefined;
    // No zoom, or Reduce Motion (the full map opens straight onto you): no layer drawn ahead.
    if (!v7On || still) { v7Drop(); return undefined; }
    if (!v7Warm) { v7Away(); return undefined; }
    const node = spot.ref.current;
    if (!node) return undefined;
    let live = true;
    void rectOf(node).then((rect) => {
      if (!live || !fits(rect)) return;
      v7Offer({ markers, fullMarkers, tpl, fullLook, city: view.center, zoom: CARD_ZOOM, rect, radius: radius.xl, border: themes[theme].border, bg: themes[theme].bgElevated });
    }).catch(() => undefined);
    return () => { live = false; };
  }, [growsHere, v7On, still, v7Warm, markers, fullMarkers, tpl, fullLook, theme, view.center.lat, view.center.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  // The card gone (its tab let go): the layer goes with it.
  useEffect(() => () => { if (growsHere) v7Drop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The card's picture (cardShot): for exactly this look (who, theme, centre, size, lock, Reduce Motion);
  // one with its pins only while they are exactly the ones about to be drawn (the marker list's hash).
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
      markers={cardPins.current}
      tpl={tpl}
      // The full map's first pins come in as one wave (once any sheet over it has gone); a tap on "+N" zooms in clear of the bars and the cards.
      // Opened by the card growing into it: its pins are the card's, there from its first moment (over the pictures), never a wave.
      popIn={expanded && !growFrom}
      now={!!growFrom}
      veil={veil}
      full={fullCard}
      // v7: the card's and the full map's pulses keep the wall clock's phase, as the zoom layer's do (MapCanvas phaseLock).
      phaseLock={v7On || (expanded && zoomOn)}
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

  // What sits on the card (its words, Up to hit, the weather): one set of props, the card's and (v7) the zoom layer's copy.
  const overlayProps = { cityName, count: onCardCount, placeCount: model.cardCourts.length, hitCount: hitCount !== undefined && model.cardFromYou && !holding ? hitCount : model.cardHits.length, weather, checkIn: onToggleLocation ? cardCheckIn : undefined, lock, inviting: invitingShown.current, uthTip, reask, chip: fullCard };
  useEffect(() => { if (v7Warm) v7SetOverlay({ ...overlayProps, uthTip: false, reask: false }); });
  // v8: the full map's buttons as they will be when it opens, for the copies over the layer (and the full map itself until it
  // has taken over); held still from the tap. The Up to hit control is the card's own, live.
  useEffect(() => {
    if (!v7Warm) return;
    const c: ChromeData = { cityName, homeKnown: model.homeKnown, weather, filter: 'all', courtsOn: true, courtsLoading: false, zoomNote: false, tray: model.tray, nearestCourts: model.nearestCourts, lock, nearTown: model.nearTown };
    v7SetChrome(c as unknown as V7Chrome);
    v7SetChromeControl(cardCheckIn);
  });
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
            <PreviewOverlay {...overlayProps} />
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
  // v8: opened by the zoom and not yet taken over, the buttons show their copies' picture (fz: ChromeData), never their own yet.
  const fz = growFrom?.v7 && !v7Live ? (v7ChromeNow() as unknown as ChromeData | null) : null;
  const buttons = (pill: boolean) => <View pointerEvents="box-none" style={styles.crown}><MapButtons lead={pill ? <PlayersPill items={fz ? fz.tray : model.tray} query={model.query} filter={fz ? fz.filter : model.filter} courts={fz ? fz.nearestCourts : model.nearestCourts} lock={fz ? fz.lock : lock} nearTown={fz ? fz.nearTown : model.nearTown} onOpen={() => { setListTall(false); trayAt.current = 0; setListOpen(true); }} /> : undefined} onRecentre={() => { model.select(null); model.selectCourt(null); model.selectHit(null); model.clearPlace(); canvas.current?.flyTo(model.homeView.center, model.homeView.zoom ?? CITY_ZOOM, 600); }} /></View>;
  // Zoomed out past about a city with the courts on: "Zoom in to see courts" (not over a court's card, nor a search).
  const zoomNote = model.courtsOn && far && !model.selectedCourt && !model.query.trim();
  return (
    <View style={styles.fill} onLayout={(e) => setMapH(Math.round(e.nativeEvent.layout.height))}>
      {/* Opened by the card growing into it: the picture of the Community page, carrying on the push-in under the map's */}
      {/* page (see-through, its pins showing on the card's spots: MapCanvas veil) until its streets have come in over it; */}
      {/* over the card in it, the card's map alone (its words, buttons and your pin gone by then: mapGrow). */}
      {/* A page that moved since its picture: the card's map alone, which covers the screen by the time this opens. */}
      {growShot && growFrom ? (
        <Reanimated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
      {mapView}
      <Reanimated.View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }, growFrom ? topSlide : null]}>
        {/* Two rows (Oct 11, owner: "Two rows weather in search"): Back, the search and Location, the city and its weather in the bar itself; then the filter chips. */}
        <MapTopBar onBack={onBack} query={model.query} onQuery={model.setQuery} checkIn={onToggleLocation ? (fz && chromeControl ? chromeControl : checkIn) : undefined} results={model.courtResults} onPickCourt={model.pickCourt} places={model.placeSearch} onPickPlace={model.pickPlace} players={model.query.trim() ? model.tray.length : 0} cityName={fz ? (fz.homeKnown ? fz.cityName : '') : model.homeKnown ? cityName : ''} weather={fz ? (fz.homeKnown ? fz.weather : null) : model.homeKnown ? weather : null} copy={!!fz} />
        <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; setChipsEnd(Math.round(y + height)); }}>
          <FilterChips filter={fz ? fz.filter : model.filter} onFilter={pickFilter} onAgain={(key) => { if (key !== 'all') pickFilter(key); }} courtsOn={fz ? fz.courtsOn : model.courtsOn} onCourts={model.toggleCourts} courtsLoading={fz ? fz.courtsLoading : model.courtsLoading} />
        </View>
        {/* Only while zoomed out: "Zoom in to see courts", under the chips. */}
        <ChipsNoteLine>
          {(fz ? fz.zoomNote : zoomNote) ? <CourtsZoomNote /> : null}
        </ChipsNoteLine>
        {/* Slow to come, or didn't: a small pill under the chips, clear of the pins around you. */}
        {/* The check-in zoom on its way down: the map is up, its streets come as it lands, so no "Loading map…" meanwhile. */}
        <MapLoadPill status={fz || (swoop.busy && mapStatus === 'loading') ? 'painted' : mapStatus} onRetry={() => canvas.current?.retry()} />
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
            <CourtSheet court={model.selectedCourt} miles={milesBetween(home, model.selectedCourt)} ringed={model.ringed.has(model.selectedCourt.id)} today={!!today?.has(model.selectedCourt.id)} onClose={() => model.selectCourt(null)} />
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

/** v8: where the page and the card were as you tapped (window points). */
interface V7Pre { pageAt: Rect; cardAt: Rect }
/** v8: one tap's move (NearbyMap's v7Now). */
interface V7Tap {
  pre: Promise<V7Pre | null>;
  /** Set going (the layer flying), or given up (`over`); `trying`: waiting for the measures or the layer, `next` the newest spot meanwhile. */
  started: boolean;
  over: boolean;
  trying: boolean;
  next: LatLng | null;
  /** The server has said yes. */
  found: boolean;
  /** Over once the move has been handed over or stopped, or none started. */
  arrival: Promise<void>;
  arrive: () => void;
}
/** v8: the full map's buttons as they will be when it opens (zoomV7's V7Chrome, in this file's own types). */
interface ChromeData { cityName: string; homeKnown: boolean; weather: Weather | null; filter: MapFilter; courtsOn: boolean; courtsLoading: boolean; zoomNote: boolean; tray: Listed[]; nearestCourts: CourtRow[]; lock: NearbyLock; nearTown: string }

/**
 * v8: the full map's buttons as they will be when it opens (its top bar, its filters, and along the bottom the players pill
 * and Back to me, at rest), drawn by the zoom layer over its map as the move lands (ZoomLayer). They slide in with `slide`
 * (0 off the screen, 1 in place: the full map's own slide, never a fade: their fill is the map's see-through one, MapGlass),
 * laid out exactly as the full map lays out its own, from the same parts, so when it takes over nothing moves. Never
 * touched, and no tips.
 */
export function ZoomChromeCopy({ p, slide }: { p: V7Chrome; slide: SharedValue<number> }) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const control = useV7ChromeControl(true) as CheckInControl | null;
  const d = p as unknown as ChromeData;
  const topAway = -(insets.top + 150);
  const bottomAway = insets.bottom + 170;
  const topSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - slide.value) * topAway }] }));
  const bottomSlide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - slide.value) * bottomAway }] }));
  const none = () => undefined;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Reanimated.View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.sm }, topSlide]}>
        <MapTopBar onBack={none} query="" onQuery={none} checkIn={control ?? undefined} players={0} cityName={d.homeKnown ? d.cityName : ''} weather={d.homeKnown ? d.weather : null} copy />
        <View>
          <FilterChips filter={d.filter} onFilter={none} courtsOn={d.courtsOn} onCourts={none} courtsLoading={d.courtsLoading} />
        </View>
        <ChipsNoteLine>
          {d.zoomNote ? <CourtsZoomNote /> : null}
        </ChipsNoteLine>
        <MapLoadPill status="painted" onRetry={none} />
      </Reanimated.View>
      <Reanimated.View pointerEvents="box-none" style={[styles.bottom, bottomSlide]}>
        <CardStage cardKey="bare" kind="tray" crown={() => <View pointerEvents="box-none" style={styles.crown}><MapButtons lead={<PlayersPill items={d.tray} query="" filter={d.filter} courts={d.nearestCourts} lock={d.lock} nearTown={d.nearTown} onOpen={none} />} onRecentre={none} /></View>}>
          <View pointerEvents="none" style={{ height: Math.max(insets.bottom, spacing.md) }} />
        </CardStage>
      </Reanimated.View>
    </View>
  );
}

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
