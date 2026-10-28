import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PixelRatio, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, Extrapolation, cancelAnimation, interpolate, makeMutable, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassView } from 'expo-glass-effect';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { BrandWash } from '@/components/ui/BrandWash';
import { CLEAR_GLASS_ALPHA, Glass, LIGHT_GLASS_ALPHA, liquidGlass } from '@/components/ui/Glass';
import { BAR_SLIDE, LENS_LOOK, LENS_TABS, lensAt, lensFeel, lensFollow, lensGoal, lensHeld, lensLag, lensLift, lensPlace, lensPress, lensReset, lensRide, lensRides, lensRow, lensSettle, lensTo, lensTrail } from '@/features/navigation/barLens';
import { useFeedOnPicture, useRowOnFeed } from '@/features/navigation/barOverMedia';
import { usePressV2 } from '@/features/navigation/pressV2';
import { BAR_SHAPE, NEW_BAR, PLUS_LOOK, SHAPE, newBarFoot } from '@/features/navigation/tabBarLook';
import { barCompact } from '@/features/navigation/barShrink';
import { getStage } from '@/features/feed/commentStage';
import { BAR_RECEDE } from '@/features/compose/createMenu';
import { HOLD_MARK, HOLD_MS, NO_CALLOUT, SHOW_ALL_FEEDS, holdFeedTab, noteFeedPressIn, noteFeedPressOut, winFinger } from '@/features/feed/feedWindows';
import * as haptics from '@/lib/haptics';
import { FeedHold } from '@/features/feed/FeedHold';
import { FLIP_PAST, followDrop, followHeld, followLook, followOn } from '@/features/feed/swipeFollow';
import { activeFade, FadeCopy, FadeSpot } from '@/theme/ThemeFade';
import { brandShadow } from '@/theme/fillMode';
import { darkColors, themes, useTheme, type ThemeName } from '@/theme/ThemeProvider';
import { TextScale, font, inkOn, typography, withAlpha } from '@/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

type Palette = (typeof themes)[ThemeName];
/** A style an animated view takes: plain, or moved on the animation thread. */
type AnimStyle = React.ComponentProps<typeof Animated.View>['style'];

/** The screen's pixels per point, read once: the bar's moves are rounded to whole pixels. */
const PX = PixelRatio.get();

/** The bar going dark over a clip, or light again: the Feed's top row's own 180 ms, so the two change together. */
const MEDIA_FADE_MS = 180;
let mediaSeq = 0;
/** Each pair of copies laid down for a followed swipe (TabBarLooks' `copies`). */
let copySeq = 0;
/** The bar as it was before a clip came or went (`media`), laid over the live bar and fading out (`alpha`: its ground, the glass's own tint unless said). */
interface MediaLayer { key: number; media: boolean; op: SharedValue<number>; alpha?: number }
/**
 * The swipe followed (features/feed/swipeFollow): how solid the copy of the other look is, laid over
 * the live glass while a finger moves the Feed between a picture page and a written one. The glass
 * turns under it half way, and the copy turns to the look the glass had: at half way the copy over
 * the glass before and the copy over the glass after are the very same mix of the two looks and of
 * the page showing through (the copy's icons cross at half way too), so the glass turning never
 * shows. With the glass's own tint `a` that needs the copy's ground at 2a / (1 + a): about 0.82 in
 * a browser, 0.86 on iOS 26, 0.95 on Android. (Exact where the glass is its tint over the page: a
 * browser, Android; close to it on an iPhone, whose glass is Apple's.)
 */
const FOLLOW_ALPHA = (2 * CLEAR_GLASS_ALPHA) / (1 + CLEAR_GLASS_ALPHA);
/** The same for the new bar's lighter glass (LIGHT_GLASS_ALPHA). */
const NEW_FOLLOW_ALPHA = (2 * LIGHT_GLASS_ALPHA) / (1 + LIGHT_GLASS_ALPHA);
/** After a followed swipe has let go of the bar, how long it may wait for the Feed to say the same look before it takes the Feed's. */
const FOLLOW_SETTLE_MS = 1200;
/** A tab lit at the touch whose page has not come (the finger slid off, or the page never answered) goes dark again after this. */
const LIT_GIVE_UP_MS = 1500;
/** After a finger lifts, how long a tab lit at the touch waits for the tap itself before it is taken back. */
const LIT_TAP_WAIT_MS = 150;
/**
 * A tab answers the touch at once. A browser otherwise holds a press back 50 ms (react-native-web's
 * own wait, meant for a finger that may yet scroll; the bar never scrolls). The Feed's hold is timed
 * from the touch too (FeedHold), so the two land together. React Native has no such wait.
 */
const PRESS_AT_ONCE = (Platform.OS === 'web' ? { delayPressIn: 0 } : {}) as object;

export interface LookItem {
  route: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

/**
 * The phone's tab bar as a quiet pill (src/features/navigation/tabBarLook.ts):
 * today's bar in a new shape, on the old bar's Liquid Glass (Oct 25, owner:
 * "Te bottom bar should be Liquid Glass like Strava and instagram"). NavBar
 * keeps everything it does (the rise on a fresh open, the tuck as you scroll,
 * the Create box's veil, the tutorial's targets); this only draws the bar.
 *
 * The glass bar's rules, kept here: nothing that holds the glass ever fades
 * (the rise and the tuck only move it; the fading copies are solid and laid
 * over it, never around it); its hairline edge is a plain layer, not a border
 * on the glass; its shadow sits on the rounded layer around it, as on the old
 * glass bar for weeks.
 */
export const LookBar = React.memo(function LookBar({
  items, activeRoute, feedUnder, tabsUnder, profileAlerts, onTab, onTabPressIn, onCreate, tourRef, tourCreate,
  bottom, outerStyle, tuckStyle, hideFromReader, veilStyle, veilBlocks, onVeil, onFeedHold, follow = false, lens = false, newBar = false,
}: {
  items: LookItem[];
  activeRoute: string | undefined;
  /** Whether the page under the bar is the Feed itself, not a page opened over it (AppShell). */
  feedUnder: boolean;
  /** Whether it is one of the four tabs, not a page opened over them (AppShell). */
  tabsUnder: boolean;
  profileAlerts: number;
  onTab: (route: string) => void;
  /** A finger came down on a tab: the page it will open can get ready while it is down. */
  onTabPressIn?: (route: string) => void;
  onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined;
  tourCreate: (node: View | null) => void;
  /** The phone's own bottom strip (home indicator), or a little air where there is none. */
  bottom: number;
  /** The rise on a fresh open (NavBar's `held` and `duck`). */
  outerStyle: AnimStyle;
  /** The tuck toward the edge while scrolling down. */
  tuckStyle: AnimStyle;
  hideFromReader: 'auto' | 'no-hide-descendants';
  veilStyle: AnimStyle;
  veilBlocks: boolean;
  onVeil: () => void;
  /** A hold on the Feed tab while on the Feed: the Feed's windows (features/feed/feedWindows). Only given while they are on. */
  onFeedHold?: () => void;
  /** The swipe followed (features/feed/swipeFollow, admins first): over the Feed, the bar's look follows a finger's swipe. */
  follow?: boolean;
  /** The lens under the lit tab (features/navigation/barLens, admins first). */
  lens?: boolean;
  /** The new bar (tabBarLook's NEW_BAR, barLens's BAR_IG_FOR_EVERYONE; admins first): its own shape, colours and lens. */
  newBar?: boolean;
}) {
  const { theme } = useTheme();
  // Which bar: today's quiet pill, or the new one (its measures, styles and glass).
  const look = newBar ? NEW_LOOK : QUIET_LOOK;
  // The new bar's lens with the phone's Reduce Motion (the app's own answer: useReducedMotion): a quick plain slide.
  const calm = useReducedMotion();
  useLayoutEffect(() => { lensFeel.value = newBar ? (calm ? 2 : 1) : 0; }, [newBar, calm]);
  // How much of its tint this bar's glass shows, for the copies laid over it (a clip's look fading, a followed swipe).
  const glassAlpha = newBar ? LIGHT_GLASS_ALPHA : CLEAR_GLASS_ALPHA;
  const followAlpha = newBar ? NEW_FOLLOW_ALPHA : FOLLOW_ALPHA;
  // Over a clip on the Feed the bar turns dark, as today's glass does over a picture: on the Feed
  // itself, never on a light page opened from the clip (a player, a court), where the Feed tab is still the lit one.
  const onPicture = useFeedOnPicture();
  // Whether the Feed is the tab under the bar: on the phone, as the tab row slides (half way across,
  // TabsPager), not at the tap while the row still shows the tab being left, and with no page opened
  // over the tabs; in a browser, whose tabs change in one go, the tab on show.
  const rowOnFeed = useRowOnFeed();
  const feedShown = rowOnFeed ?? activeRoute === 'index';
  // The bar is over the Feed itself (its look is the Feed's).
  const overFeed = feedShown && (rowOnFeed === null ? feedUnder : tabsUnder);
  const media = overFeed && onPicture;
  // A clip coming or going (or a page opened over the Feed) changes the bar's ground: the look being
  // left is laid over the new one in the same redraw and fades out, then is taken away, so the bar
  // never snaps from light to dark under a top row that eases, and nothing rests on an animated value.
  // A change of tab does not: the page under the bar is changing whole then, and the glass simply
  // turns, once (Oct 25 audit: a solid white or black slab at the tap that washed through grey,
  // with the icons all but gone, on every tap to or from the Feed over a clip).
  const [shownMedia, setShownMedia] = useState(media);
  const [shownFeed, setShownFeed] = useState(feedShown);
  const [mediaLayers, setMediaLayers] = useState<readonly MediaLayer[]>([]);
  // The glass's own dark or light: `media`, except for two frames after a clip's comments were up.
  const [glassHeld, setGlassHeld] = useState<boolean | null>(null);
  // The swipe followed (features/feed/swipeFollow): while a finger moves the Feed between a picture
  // page and a written one, a copy of the other look lies over the live glass and follows the page,
  // and the glass turns under it half way (`followGlass`, until the Feed itself says the same look,
  // as the page lands). Two copies are laid down as the look starts to change, one in each look, and
  // both follow the page on the animation thread until the swipe lets go; the one over the glass of
  // the other look is the one shown. The glass turning and the copy shown changing are the same
  // redraw, so neither is ever a frame behind the other, and no copy is built mid-glide (one built
  // then showed, for a frame, where the page had been a moment before). Never on with the switch
  // off: everything below is as before.
  const followable = follow && overFeed;
  const [followGlass, setFollowGlass] = useState<boolean | null>(null);
  const [following, setFollowing] = useState(false);
  // On the animation thread, so the swipe's own reaction (below) carries on across a change of it.
  const followableNow = useSharedValue(followable ? 1 : 0);
  useLayoutEffect(() => { followableNow.value = followable ? 1 : 0; }, [followable, followableNow]);
  if (shownMedia !== media || shownFeed !== feedShown) {
    // The look the glass showed until now: a followed swipe may have turned it already, and then the
    // Feed coming to the same look changes nothing on screen.
    const before = followGlass ?? shownMedia;
    setShownMedia(media);
    setShownFeed(feedShown);
    if (followGlass !== null) setFollowGlass(null);
    if (before !== media && shownFeed === feedShown) {
      const layer: MediaLayer = { key: ++mediaSeq, media: before, op: makeMutable(1) };
      setMediaLayers((layers) => [layer, ...layers].slice(0, 3));
    }
    // With a clip's comments up (commentStage) the bar sits under their fade (AppShell's navFade, down
    // to nothing), and a page opened over them (a profile, a court, or another tab) flips `media` in the
    // same redraw that lets the fade go, which reaches the screen only a frame later. Glass re-tinted under
    // a parent at nothing can stay see-through (Oct 17), so there it keeps its look until the bar is whole
    // again. Anywhere else it re-tints at once, as before.
    if (before !== media && glassHeld === null && getStage()?.mode === 'stage') setGlassHeld(before);
  }
  // The switch turned off: nothing is held for a swipe.
  if (!follow && (followGlass !== null || following)) {
    if (followGlass !== null) setFollowGlass(null);
    if (following) setFollowing(false);
  }
  // What the live glass shows: the look a followed swipe turned it to, until the Feed says it too.
  const glassLook = followGlass ?? media;
  // Told to the animation thread once drawn, for the half-way turn.
  const glassNow = useSharedValue(glassLook ? 1 : 0);
  useLayoutEffect(() => { glassNow.value = glassLook ? 1 : 0; }, [glassLook, glassNow]);
  // The look the swipe has asked the glass for and the glass has not drawn yet (-1 none).
  const asked = useSharedValue(-1);
  // 1 from the moment a swipe starts carrying the look (the copies are laid down) until it lets go.
  const session = useSharedValue(0);
  // The pager's last let-go heard (followDrop; -1 not yet).
  const dropSeen = useSharedValue(-1);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  // Read by the timer and the hand-back below, which outlive the redraw that set them.
  const nowRef = useRef({ media, followGlass, followAlpha });
  nowRef.current = { media, followGlass, followAlpha };
  const turnGlass = useCallback((dark: boolean) => { setFollowGlass(dark); }, []);
  const startFollowing = useCallback(() => {
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    setFollowing(true);
  }, []);
  // The bar goes back to the Feed's own look at once, from what it shows right now: the glass as
  // last drawn (the look a swipe turned it to, or the Feed's) and, with `look` (the page's, 0 to 1;
  // -1 none), the copy of the other look over it, laid over the Feed's own glass as fading copies
  // (the glass's own tint, and the follow copy's), as a page change's copy fades. `glassToo` false:
  // the glass has turned already (the bar gone from over the Feed), only the copy fades.
  const handBack = useCallback((look: number, glassToo: boolean) => {
    const { media: feedLook, followGlass: turned, followAlpha: copyA } = nowRef.current;
    const drawn = turned ?? feedLook;
    const copy = look < 0 ? 0 : drawn ? 1 - look : look;
    const layers: MediaLayer[] = [];
    if (glassToo && turned !== null && turned !== feedLook) layers.push({ key: ++mediaSeq, media: turned, op: makeMutable(1) });
    if (copy > 0.01) layers.push({ key: ++mediaSeq, media: !drawn, op: makeMutable(Math.min(1, copy)), alpha: copyA });
    if (layers.length) setMediaLayers((was) => [...layers, ...was].slice(0, 4));
    setFollowGlass(null);
  }, []);
  // The swipe let go of the bar. At rest on a page (`rest` 0 or 1), still over the Feed: the glass
  // is that page's look and the copies go (they are at nothing by then); the Feed says the same look
  // as the page lands (already says it: the glass is the Feed's at once), and if it has not within
  // FOLLOW_SETTLE_MS (a feed dealt again under the finger), the bar takes the Feed's look, fading as
  // it always has. Let go part way: back to the Feed's own look at once, fading from where it stands
  // (the bar gone from over the Feed has turned already: only the copy fades then).
  const stopFollowing = useCallback((rest: number, over: number) => {
    setFollowing(false);
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    if (rest > 0 && rest < 1) { handBack(rest, !!over); return; }
    const look = rest >= 1;
    if (!over || look === nowRef.current.media) { setFollowGlass(null); return; }
    setFollowGlass(look);
    const settle = () => {
      // A finger still holds the page part way (its look already the next page's): asked again later.
      if (followHeld.value) { settleTimer.current = setTimeout(settle, FOLLOW_SETTLE_MS / 4); return; }
      settleTimer.current = null;
      const { media: feedLook, followGlass: turned } = nowRef.current;
      if (turned === null) return;
      if (turned !== feedLook) {
        const layer: MediaLayer = { key: ++mediaSeq, media: turned, op: makeMutable(1) };
        setMediaLayers((layers) => [layer, ...layers].slice(0, 3));
      }
      setFollowGlass(null);
    };
    settleTimer.current = setTimeout(settle, FOLLOW_SETTLE_MS);
  }, [handBack]);
  // The pager let go of its look at once (a move made in code began, back to the top; the feed is no
  // longer the one on show): the bar is the Feed's own again now, never waiting for the Feed to say a
  // look it may never say (the page the swipe was heading for is never landed on).
  const dropFollow = useCallback((rest: number, had: number) => {
    setFollowing(false);
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    handBack(had ? rest : -1, true);
  }, [handBack]);
  useAnimatedReaction(
    () => {
      // Heard as well: the pager letting go at once (followDrop).
      void followDrop.value;
      if (!followableNow.value) return -1;
      if (followOn.value) return followLook.value;
      // A finger still on the feed (or the feed still moving) at a page's own look: 2 or 3.
      return followHeld.value ? 2 + followLook.value : -1;
    },
    (now) => {
      const drop = followDrop.value;
      if (dropSeen.value < 0) dropSeen.value = drop;
      else if (drop !== dropSeen.value) {
        dropSeen.value = drop;
        const had = session.value;
        session.value = 0;
        asked.value = -1;
        runOnJS(dropFollow)(followLook.value, had);
        return;
      }
      if (now < 0) {
        if (session.value) {
          session.value = 0;
          asked.value = -1;
          runOnJS(stopFollowing)(followLook.value, followableNow.value);
        }
        return;
      }
      // The copies are laid down as the look starts to change, and stay until the swipe lets go, a
      // page passed on the way included (a second flick mid-glide): never built mid-glide.
      if (!session.value) {
        if (now >= 2) return;
        session.value = 1;
        runOnJS(startFollowing)();
      }
      const look = now >= 2 ? now - 2 : now;
      // Half way (a little past it, so a finger resting near the middle never flickers it): the glass
      // turns. Worked out from the glass as drawn, so a turn still on its way is never lost or doubled.
      const glass = glassNow.value;
      const want = glass === 1 ? (look < 0.5 - FLIP_PAST ? 0 : 1) : (look > 0.5 + FLIP_PAST ? 1 : 0);
      if (want === glass) { asked.value = -1; return; }
      if (asked.value !== want) { asked.value = want; runOnJS(turnGlass)(want === 1); }
    },
    [],
  );
  // The tab lit at the touch (Oct 25 audit: the new tab lit only once the router had redrawn about a
  // thousand parts, 60-170 ms after the finger lifted, with no answer to the touch before that). It
  // lights the moment the finger comes down, in a redraw of the bar alone, and the page follows; the
  // address catching up makes it the lit tab by right. A finger that slides off takes it back.
  const [pressed, setPressed] = useState<string | null>(null);
  const [seenRoute, setSeenRoute] = useState(activeRoute);
  if (seenRoute !== activeRoute) {
    setSeenRoute(activeRoute);
    if (pressed !== null) setPressed(null);
  }
  const lit = pressed ?? activeRoute;
  useEffect(() => {
    if (pressed === null) return undefined;
    // (Not while a finger slides along the new bar: the tab under it stays lit until it lets go.)
    const t = setTimeout(() => { if (!press.current.sliding) setPressed(null); }, LIT_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [pressed]);
  // Read by the handlers below, which are made once (the bar redraws only when what it shows changes).
  const now = useRef({ activeRoute, onTab, onTabPressIn, newBar, calm });
  now.current = { activeRoute, onTab, onTabPressIn, newBar, calm };
  // `slid`: this touch became a slide along the bar (the new bar's), so the tab it started on is not also tapped;
  // `sliding`: that slide still has the finger, so the tab it lit stays lit.
  const press = useRef({ route: null as string | null, tapped: false, painted: true, frame: 0, wait: undefined as ReturnType<typeof setTimeout> | undefined, seq: 0, slid: false, sliding: false });
  useEffect(() => () => { clearTimeout(press.current.wait); cancelAnimationFrame(press.current.frame); }, []);
  const tabPressIn = useCallback((route: string) => {
    const p = press.current;
    clearTimeout(p.wait);
    p.tapped = false;
    p.slid = false;
    p.route = route;
    // The new bar's lens lifts a touch at the touch (iOS 26's own), and comes down once the finger is up
    // and it has landed (StretchLens). Not with Reduce Motion.
    if (now.current.newBar) {
      lensPress.value = 1;
      if (!now.current.calm) lensLift.value = withTiming(1, LIFT_UP);
      // It sets off at the touch itself, before the bar has redrawn with the tab lit (the redraw then finds it on its way).
      const place = lensPlace(route);
      if (place >= 0 && route !== now.current.activeRoute) {
        if (Platform.OS === 'web') lensTo(place, true);
        else runOnUI(lensTo)(place, true);
      }
    }
    // The tab already on show: any other tab lit by a quicker tap whose page has not come yet goes dark.
    if (route === now.current.activeRoute) setPressed(null);
    else {
      setPressed(route);
      // In a browser the bar's redraw and the page's share one thread: the page waits for a frame
      // with the lit tab in it (below). A phone draws the bar's redraw on its own.
      p.painted = false;
      cancelAnimationFrame(p.frame);
      p.frame = requestAnimationFrame(() => { p.painted = true; });
    }
    now.current.onTabPressIn?.(route);
  }, []);
  const tabPressOut = useCallback(() => {
    const p = press.current;
    if (now.current.newBar) lensPress.value = 0;
    clearTimeout(p.wait);
    // The tap itself comes just after (or just before) the finger lifts; a press that never became one goes dark again.
    p.wait = setTimeout(() => { if (!p.tapped && !p.sliding) { p.route = null; setPressed(null); } }, LIT_TAP_WAIT_MS);
  }, []);
  const openTab = useCallback((route: string) => {
    const p = press.current;
    clearTimeout(p.wait);
    p.tapped = true;
    // Only the latest tap goes: one held for its lit frame (below) never lands after a later tap.
    const mine = ++p.seq;
    const go = () => { if (p.seq === mine) now.current.onTab(route); };
    if (route === now.current.activeRoute) { setPressed(null); go(); return; }
    // Lit already at the touch, and drawn: the page goes now. Otherwise (a quick tap in a busy
    // browser, a keyboard, a screen reader) the lit tab is drawn first, then the page.
    const litFirst = p.route !== route || !p.painted;
    p.route = route;
    setPressed(route);
    if (Platform.OS === 'web' && litFirst) {
      cancelAnimationFrame(p.frame);
      p.frame = requestAnimationFrame(() => { setTimeout(go, 0); });
      return;
    }
    go();
  }, []);
  // A tap on a tab (a touch that became a slide along the bar is the slide's, not a tap's).
  const tabPress = useCallback((route: string) => {
    if (press.current.slid) return;
    openTab(route);
  }, [openTab]);
  // The lens (features/navigation/barLens) goes to the lit tab in the redraw that lights it: at the
  // touch for a tap, as the address changes for anything else. Its moves are the animation thread's.
  // A tab lit by a finger on the bar may take it off a swipe that is settling; nothing else may.
  const litPlace = lens ? lensPlace(lit) : -1;
  const litByTap = pressed !== null;
  useLayoutEffect(() => {
    if (!lens) return;
    if (Platform.OS === 'web') lensTo(litPlace, litByTap);
    else runOnUI(lensTo)(litPlace, litByTap);
  }, [lens, litPlace, litByTap]);
  // Turned off, or the bar gone: the next lens is placed afresh (cleared before a new one is placed).
  useLayoutEffect(() => (lens ? () => {
    if (Platform.OS === 'web') lensReset();
    else runOnUI(lensReset)();
  } : undefined), [lens]);
  // Where each tab's middle is along the bar, from the pill's width (worked out from the window's
  // until it has been measured; measured only while the lens is on, so the bar is untouched without it).
  const [measured, setMeasured] = useState<number | null>(null);
  const onPillLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setMeasured((was) => (was === w ? was : w));
  }, []);
  const pillW = measured ?? Dimensions.get('window').width - 2 * look.m.side;
  const lensGeo = useMemo<LensGeo | null>(() => (lens ? lensGeometry(pillW, look.m) : null), [lens, pillW, look]);
  // Press and slide (the new bar's, barLens's BAR_SLIDE): a finger that comes down on the bar and moves
  // along it drags the lens across the tabs, lifted, each tab lighting (a light tick) as the lens comes over
  // it, and lifting opens the tab it is on. It starts only once the finger has moved 12 points sideways
  // within the Feed tab's hold time, so the hold (FeedHold, 400 ms of a still finger) and a tap are
  // untouched: the two gestures never share the finger (whichever starts first has it; a hold that has
  // the windows up is never taken over). Never while the Create box is up.
  const slideOn = newBar && !!lensGeo && BAR_SLIDE;
  const slideAt = useSharedValue<number[]>(lensGeo ? [...lensGeo.centers] : [0, 1, 2, 3]);
  useLayoutEffect(() => { if (lensGeo) slideAt.value = [...lensGeo.centers]; }, [lensGeo, slideAt]);
  // The tab on show, for a slide taken away part way (it goes back there).
  const homePlace = useSharedValue(lensPlace(activeRoute));
  useLayoutEffect(() => { homePlace.value = lensPlace(activeRoute); }, [activeRoute, homePlace]);
  const sliding = useSharedValue(0);
  const slideOver = useSharedValue(-1);
  const slideBegin = useCallback((route: string) => {
    const p = press.current;
    clearTimeout(p.wait);
    p.slid = true;
    p.sliding = true;
    p.route = route;
    setPressed(route === now.current.activeRoute ? null : route);
  }, []);
  const slideMove = useCallback((route: string) => {
    press.current.route = route;
    setPressed(route === now.current.activeRoute ? null : route);
    haptics.tick();
  }, []);
  const slideEnd = useCallback((route: string | null) => {
    const p = press.current;
    p.sliding = false;
    if (route === null || route === now.current.activeRoute) { p.route = null; setPressed(null); return; }
    openTab(route);
  }, [openTab]);
  const slide = useMemo(() => Gesture.Pan()
    .enabled(slideOn && !veilBlocks)
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onStart((e) => {
      'worklet';
      // The Feed's hold has the finger (its windows are up): the slide is theirs.
      if (winFinger.value) return;
      const at = interpolate(e.x, slideAt.value, [0, 1, 2, 3], Extrapolation.CLAMP);
      sliding.value = 1;
      lensRide(at);
      lensPress.value = 1;
      if (lensFeel.value === 1) lensLift.value = withTiming(1, LIFT_UP);
      const near = Math.round(at);
      slideOver.value = near;
      runOnJS(slideBegin)(LENS_TABS[near]);
    })
    .onUpdate((e) => {
      'worklet';
      if (!sliding.value) return;
      const at = interpolate(e.x, slideAt.value, [0, 1, 2, 3], Extrapolation.CLAMP);
      lensFollow(at);
      const near = Math.round(at);
      if (near !== slideOver.value) {
        slideOver.value = near;
        runOnJS(slideMove)(LENS_TABS[near]);
      }
    })
    .onEnd(() => {
      'worklet';
      if (!sliding.value) return;
      sliding.value = 0;
      lensPress.value = 0;
      const to = slideOver.value;
      lensSettle(to, SLIDE_LAND_MS);
      runOnJS(slideEnd)(LENS_TABS[to]);
    })
    .onFinalize(() => {
      'worklet';
      // Taken away part way (never let go of): back to the tab on show.
      if (!sliding.value) return;
      sliding.value = 0;
      lensPress.value = 0;
      const home = homePlace.value;
      if (home >= 0) lensSettle(home, SLIDE_LAND_MS);
      runOnJS(slideEnd)(null);
    }), [slideOn, veilBlocks, slideAt, homePlace, sliding, slideOver, slideBegin, slideMove, slideEnd]);
  useEffect(() => {
    if (glassHeld === null) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setGlassHeld(null)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [glassHeld]);
  const begun = useRef(new Set<number>());
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const drop = (key: number) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);
      begun.current.delete(key);
      setMediaLayers((layers) => layers.filter((l) => l.key !== key));
    };
    for (const layer of mediaLayers) {
      if (begun.current.has(layer.key)) continue;
      begun.current.add(layer.key);
      const { key } = layer;
      layer.op.value = withTiming(0, { duration: MEDIA_FADE_MS, easing: Easing.out(Easing.quad) }, (finished) => {
        'worklet';
        if (finished) runOnJS(drop)(key);
      });
      // Whatever the animation reports, the copy goes.
      timers.current.set(key, setTimeout(() => drop(key), MEDIA_FADE_MS + 300));
    }
  }, [mediaLayers]);
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); timers.current.clear(); }, []);
  const face = (palette: Palette, live: boolean, overMedia: boolean = glassLook, copyAlpha = 1) => (
    <Face palette={palette} look={look} calm={calm} media={overMedia} glassMedia={live ? (glassHeld ?? overMedia) : overMedia} live={live} copyAlpha={copyAlpha} items={items} activeRoute={lit} profileAlerts={profileAlerts} lens={litPlace >= 0 ? lensGeo : null} lensFallback={litPlace}
      onTabPressIn={tabPressIn} onTabPressOut={tabPressOut} onTab={tabPress} onCreate={onCreate} tourRef={tourRef} tourCreate={tourCreate} veilStyle={veilStyle} veilBlocks={veilBlocks} onVeil={onVeil} onFeedHold={live ? onFeedHold : undefined} />
  );
  // The swipe followed: the two copies' faces, built once as a swipe starts carrying the look (and
  // again only if what they show changes), so the redraw that turns the glass leaves them be.
  const copies = useMemo(() => (following ? {
    key: ++copySeq,
    dark: face(themes[theme], false, true, followAlpha),
    light: face(themes[theme], false, false, followAlpha),
  } : null), [following, theme, items, lit, profileAlerts, onCreate, tourRef, tourCreate, veilStyle, veilBlocks, onVeil, lensGeo, look, calm]); // eslint-disable-line react-hooks/exhaustive-deps
  // The shadow around the glass: on an iPhone, drawn along the pill's own outline (a box shadow),
  // not worked out from everything inside it, which redrew the bar off screen every frame while a
  // page slid or scrolled under the glass (Oct 25 audit). The same shadow to look at. Quicker press feel only (admins first).
  const quick = usePressV2();
  // The new bar tucks less as you scroll down (it already sits lower, nearer the home bar).
  const newTuck = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, NEW_BAR.tuck]) * PX) / PX }] }));
  const st = look.st;
  return (
    <Animated.View pointerEvents="box-none" importantForAccessibility={hideFromReader} style={[st.float, { bottom: newBar ? newBarFoot(bottom) : bottom }, outerStyle]}>
      <Animated.View style={[st.pillWrap, newBar ? newTuck : tuckStyle]}>
        {/* Split (BAR_SHAPE 'C'): two grounds, each with its own shadow (Face), so this layer holds no shadow of its own. */}
        <SlideOver gesture={slideOn ? slide : null}>
        <View onLayout={lens ? onPillLayout : undefined} style={look.m.split ? st.splitHolder : [st.pillShadow, (quick || newBar) && Platform.OS === 'ios' ? st.pillShadowPath : null]}>
          {face(themes[theme], true)}
          {/* The swipe followed: the other look, following the page over the live glass (never glass itself), the
              glass turning under it half way. Each look's copy shows only over the glass of the other, switched in
              the redraw that turns the glass (a plain style, never a fade: what fades is each copy, by the page). */}
          {copies ? (
            <React.Fragment key={copies.key}>
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, glassLook ? st.copyAway : null]}>
                <FollowCopy dark>{copies.dark}</FollowCopy>
              </View>
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, glassLook ? null : st.copyAway]}>
                <FollowCopy dark={false}>{copies.light}</FollowCopy>
              </View>
            </React.Fragment>
          ) : null}
          {/* The bar as it was before a clip came or went, as see-through as the glass, fading out over the live glass (already re-tinted). */}
          {mediaLayers.map((layer) => (
            <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="media-fade-bar">{face(themes[theme], false, layer.media, layer.alpha ?? glassAlpha)}</FadeCopy>
          ))}
          {/* A theme picked on the Theme page: the bar in the court being left, laid over the live one (beside
              the glass, never holding it) and fading with the page (ThemeFade). The glass re-tints at the tap, under it. */}
          <FadeSpot store={activeFade} render={(layers) => layers.map((layer) => (
            <FadeCopy key={layer.key} op={layer.op} style={StyleSheet.absoluteFill} testID="theme-fade-bar">{face(themes[layer.theme], false)}</FadeCopy>
          ))} />
        </View>
        </SlideOver>
      </Animated.View>
    </Animated.View>
  );
});

/** The new bar's press and slide around the bar (LookBar's `slide`); without one, the bar exactly as it was. */
function SlideOver({ gesture, children }: { gesture: ReturnType<typeof Gesture.Pan> | null; children: React.ReactElement }) {
  if (!gesture) return children;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

const holdNoop = () => undefined;

/**
 * The swipe followed: a copy of the bar in one look (`dark` or light) over the live glass, as solid
 * as the page is far into the swipe toward that look (followLook), on the animation thread. A sibling
 * laid over the glass, never around it, and never glass itself: the one thing here whose opacity moves.
 */
const FollowCopy = React.memo(function FollowCopy({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  const look = useAnimatedStyle(() => ({ opacity: dark ? followLook.value : 1 - followLook.value }));
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden testID="follow-bar" style={[StyleSheet.absoluteFill, look]}>{children}</Animated.View>;
});

/** Where the lens sits along the bar: each tab's middle (in the row's order), the lens's width and its height. */
interface LensGeo { centers: readonly number[]; width: number; height: number }

/** How far in the lens sits from the bar's top and bottom, and from its ends on the first and last tab (the quiet pill's). */
const LENS_INSET = 4;

/**
 * The lens's measures on a pill `pillW` wide: the + keeps the middle of five equal slots (the
 * tabs' slots either side of it), and the lens is as much wider than a slot as keeps it the same
 * way in from the pill's round ends as from its top and bottom on the first and last tab.
 */
function lensGeometry(pillW: number, m: BarSpec): LensGeo {
  const tabsW = m.split ? pillW - m.height - SPLIT_GAP : pillW;
  const slotW = (tabsW - 2 * m.pad) / (m.split ? 4 : 5);
  const centers = [0, 1, 2, 3].map((i) => m.pad + slotW * ((m.split || i < 2 ? i : i + 1) + 0.5));
  return { centers, width: slotW + 2 * m.pad - 2 * m.lensInset, height: m.height - 2 * m.lensInset };
}

/**
 * The lens behind the lit tab (features/navigation/barLens): moved sideways only, on the animation
 * thread, never faded. On the live bar on iOS 26 it is Apple's glass, inside the bar's own; anywhere
 * else, and on every copy laid over the live bar (which fade), a plain capsule in the court's colours.
 */
const Lens = React.memo(function Lens({ geo, fallback, fill, glass, glassDark, st }: {
  geo: LensGeo; fallback: number; fill: string; glass: boolean; glassDark: boolean; st: BarStyles;
}) {
  const move = useAnimatedStyle(() => {
    // Each value read here by name, not through a helper: the animation thread redraws a style only
    // for the values its own code reads (lensShown's, read inside it, would not move the lens).
    const own = lensAt.value;
    const at = lensRides.value ? Math.max(0, Math.min(3, lensRow.value)) + lensLag.value : own < 0 ? fallback : own;
    return { transform: [{ translateX: interpolate(at, [0, 1, 2, 3], geo.centers as number[], Extrapolation.CLAMP) - geo.width / 2 }] };
  }, [geo, fallback]);
  return (
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden testID="bar-lens" style={[st.lens, { width: geo.width }, move]}>
      {glass ? (
        <GlassView glassEffectStyle="regular" isInteractive={false} tintColor={fill} colorScheme={glassDark ? 'dark' : 'light'} style={st.lensShape} />
      ) : (
        <View style={[st.lensShape, { backgroundColor: fill }]} />
      )}
    </Animated.View>
  );
});

/** How far the new bar's lens may stretch past its own width while it travels, as a share of that width. */
const STRETCH_MAX = 0.3;
/** Its lift at the touch: this much taller (and as much wider), as a share of its height (about 1.07 times). */
const LIFT = 0.07;
/** Up at the touch, quickly; down, once the finger is up and the lens has landed, on a soft spring with no bounce. */
const LIFT_UP = { duration: 120, easing: Easing.out(Easing.cubic) };
const LIFT_DOWN = { dampingRatio: 1, duration: 280 } as const;
/** A slide along the bar let go: the lens lands on the tab under it this quickly. */
const SLIDE_LAND_MS = 220;
/** How near its tab (in tabs) the lens counts as landed, for the lift to start coming down. */
const LANDED = 0.12;
/**
 * The trailing edge's chase: a spring with no bounce this stiff, re-aimed at the lens every frame it
 * moves, so it trails it by about 2 / √k seconds of its speed (about 28 ms after a tap: a one-tab move
 * stretches it about a fifth): the faster the lens goes, the longer it stretches, and it gathers up as
 * the lens slows to land. Never past the lens. Softer (about 50 ms) while a finger drags it, page or
 * bar, whose speeds are slower than a tap's spring, so a quick swipe still shows it.
 */
const TRAIL_K = 5000;
const TRAIL_SPRING = { stiffness: TRAIL_K, damping: 2 * Math.sqrt(TRAIL_K), mass: 1, overshootClamping: true } as const;
const TRAIL_RIDE_K = 1600;
const TRAIL_RIDE = { stiffness: TRAIL_RIDE_K, damping: 2 * Math.sqrt(TRAIL_RIDE_K), mass: 1, overshootClamping: true } as const;
/** The middle piece's own width before it is stretched (any width: it is only ever scaled). */
const MID_W = 100;

/**
 * The new bar's lens (Oct 28, owner: "Also the animation is inportant for tab switching"), after iOS 26's
 * own: at the touch it lifts a touch and sets off at once; as it travels its leading edge leads and its
 * trailing edge follows, so it stretches toward the tab with its speed and gathers up again as it lands,
 * on a spring with no bounce that never passes the tab. A swipe between tabs drags it frame by frame
 * (the row's own place, barLens's lensRow), stretching with the finger's speed.
 *
 * Only transforms, on the animation thread: a round end at each side and a plain middle between their
 * centres, each moved (the middle also stretched), so the ends stay round however long it gets (a
 * stretched capsule would flatten them). The three are one solid colour and overlap; their holder (never
 * glass, never holding glass, never animated) gives them their see-through, all at once, so the overlaps
 * never show. With Reduce Motion: no stretch, no lift.
 */
const StretchLens = React.memo(function StretchLens({ geo, fallback, color, alpha, drive, calm, st }: {
  geo: LensGeo; fallback: number; color: string; alpha: number;
  /** The live bar's: it moves the trailing edge and the lift for every copy too (they read the same values). */
  drive: boolean;
  calm: boolean; st: BarStyles;
}) {
  const h = geo.height;
  useAnimatedReaction(() => {
    if (!drive) return null;
    const own = lensAt.value;
    return lensRides.value ? Math.max(0, Math.min(3, lensRow.value)) + lensLag.value : own < 0 ? fallback : own;
  }, (at, was) => {
    if (at === null) return;
    // Placed (the first time, or straight onto a tab: a jump, never a move) or calm: the trailing edge is simply there too.
    if (calm || was === null || lensTrail.value < 0 || Math.abs(at - was) > 0.5) {
      cancelAnimation(lensTrail);
      lensTrail.value = at;
      return;
    }
    lensTrail.value = withSpring(at, lensRides.value ? TRAIL_RIDE : TRAIL_SPRING);
  }, [drive, fallback, calm]);
  useAnimatedReaction(() => {
    // Not while a finger is on the bar or drags the lens along it.
    if (!drive || lensPress.value || lensHeld.value || lensLift.value <= 0) return 0;
    const goal = lensGoal.value;
    if (goal < 0) return 1;
    const own = lensAt.value;
    const at = lensRides.value ? Math.max(0, Math.min(3, lensRow.value)) + lensLag.value : own < 0 ? goal : own;
    return Math.abs(at - goal) < LANDED ? 1 : 0;
  }, (down, was) => {
    if (down === 1 && was !== 1) lensLift.value = withSpring(0, LIFT_DOWN);
  }, [drive]);
  const box = useDerivedValue(() => {
    const own = lensAt.value;
    const at = lensRides.value ? Math.max(0, Math.min(3, lensRow.value)) + lensLag.value : own < 0 ? fallback : own;
    const trail = calm || lensTrail.value < 0 ? at : lensTrail.value;
    const lead = interpolate(at, [0, 1, 2, 3], geo.centers as number[], Extrapolation.CLAMP);
    const back = interpolate(trail, [0, 1, 2, 3], geo.centers as number[], Extrapolation.CLAMP);
    const w = geo.width;
    let left = Math.min(lead, back) - w / 2;
    let right = Math.max(lead, back) + w / 2;
    // Never longer than STRETCH_MAX past its width: the trailing edge is the one held in.
    const most = w * (1 + STRETCH_MAX);
    if (right - left > most) {
      if (lead >= back) left = right - most;
      else right = left + most;
    }
    const grow = calm ? 0 : LIFT * h * lensLift.value;
    return { mid: (left + right) / 2, w: right - left + grow, h: h + grow };
  }, [geo, fallback, calm]);
  const startCap = useAnimatedStyle(() => {
    const b = box.value;
    return { transform: [{ translateX: b.mid - b.w / 2 + b.h / 2 - h / 2 }, { scale: b.h / h }] };
  }, [h]);
  const endCap = useAnimatedStyle(() => {
    const b = box.value;
    return { transform: [{ translateX: b.mid + b.w / 2 - b.h / 2 - h / 2 }, { scale: b.h / h }] };
  }, [h]);
  const middle = useAnimatedStyle(() => {
    const b = box.value;
    return { transform: [{ translateX: b.mid - MID_W / 2 }, { scaleX: Math.max(0.001, (b.w - b.h) / MID_W) }, { scaleY: b.h / h }] };
  }, [h]);
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden testID="bar-lens" needsOffscreenAlphaCompositing style={[st.stretch, { height: h, opacity: alpha }]}>
      <Animated.View testID="bar-lens-mid" style={[st.stretchMid, { height: h, backgroundColor: color }, middle]} />
      <Animated.View testID="bar-lens-start" style={[st.stretchCap, { width: h, height: h, borderRadius: h / 2, backgroundColor: color }, startCap]} />
      <Animated.View testID="bar-lens-end" style={[st.stretchCap, { width: h, height: h, borderRadius: h / 2, backgroundColor: color }, endCap]} />
    </View>
  );
});

/** The new bar's icon pop as a tab lights (1, a touch bigger, 1 again): only on the live bar, never with Reduce Motion. */
const POP = 1.12;
const POP_UP = { duration: 110, easing: Easing.out(Easing.quad) };
const POP_DOWN = { dampingRatio: 1, duration: 260 } as const;

/** A tab's icon; on the new bar it pops a touch as it lights. */
const TabGlyph = React.memo(function TabGlyph({ name, size, color, active, pop }: {
  name: keyof typeof Ionicons.glyphMap; size: number; color: string; active: boolean; pop: boolean;
}) {
  const scale = useSharedValue(1);
  const was = useRef(active);
  useEffect(() => {
    if (pop && active && !was.current) scale.value = withSequence(withTiming(POP, POP_UP), withSpring(1, POP_DOWN));
    was.current = active;
  }, [active, pop, scale]);
  const grow = useAnimatedStyle(() => (scale.value === 1 ? { transform: [] } : { transform: [{ scale: scale.value }] }));
  if (!pop) return <Ionicons name={name} size={size} color={color} />;
  return <Animated.View style={grow}><Ionicons name={name} size={size} color={color} /></Animated.View>;
});

/** The bar's ground and its row, in one court's colours: the live bar, or a fading copy of it. */
function Face({ palette: c, look, calm, media, glassMedia, live, copyAlpha, items, activeRoute, profileAlerts, onTabPressIn, onTabPressOut, onTab, onCreate, tourRef, tourCreate, veilStyle, veilBlocks, onVeil, onFeedHold, lens, lensFallback }: {
  /** `glassMedia`: the live glass's own dark or light, which may trail `media` by two frames (LookBar). */
  palette: Palette; look: BarLook; calm: boolean; media: boolean; glassMedia: boolean; live: boolean;
  /** A copy's ground: solid (1) for a court being left, whose page is fading under it too; as see-through as the glass for a clip's look. */
  copyAlpha: number;
  items: LookItem[]; activeRoute: string | undefined; profileAlerts: number;
  onTabPressIn: (route: string) => void; onTabPressOut: () => void;
  onTab: (route: string) => void; onCreate: () => void;
  tourRef: (route: string) => ((node: View | null) => void) | undefined; tourCreate: (node: View | null) => void;
  veilStyle: AnimStyle; veilBlocks: boolean; onVeil: () => void; onFeedHold?: () => void;
  /** The lens's measures (null: no lens), and the lit tab's place until it has been placed. */
  lens: LensGeo | null; lensFallback: number;
}) {
  const { m, st, fresh } = look;
  // Ducking lets the words go and settles the icons into the middle, as today's bar does
  // (NavBar: half a word's line and its gap, landed on the screen's real pixels).
  const settle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round(interpolate(barCompact.value, [0, 1], [0, m.settle]) * PX) / PX }] }), [m.settle]);
  const labelFade = useAnimatedStyle(() => ({ opacity: interpolate(barCompact.value, [0, 0.6], [1, 0], 'clamp') }));
  // The ground: the old glass bar's Liquid Glass, tinted with the page's own colour (NavBar's 'now'),
  // and on a fading copy that colour solid. Over a picture: dark glass (the page's own colour where it
  // is dark already, as on New York) and white marks, the glass told so too, so the two always agree.
  const darkPage = inkOn(c.bg) === '#FFFFFF';
  const groundOf = (overMedia: boolean) => (overMedia ? (darkPage ? c.bg : darkColors.bg) : c.bg);
  const ground = groundOf(media);
  // The new bar (Oct 28, after Instagram's and Strava's): the tabs in the page's own ink, the lit one in the
  // brand's colour, icon and word; a faint edge that keeps it apart from a white page (its glass has its own light).
  const line = fresh
    ? (media || darkPage ? withAlpha(c.onMedia, 0.16) : withAlpha(c.text, 0.07))
    : media ? withAlpha(c.onMedia, 0.14) : c.border;
  const idleIcon = media ? withAlpha(c.onMedia, fresh ? 0.92 : 0.66) : fresh ? c.text : c.textMuted;
  const idleLabel = media ? withAlpha(c.onMedia, fresh ? 0.88 : 0.6) : fresh ? c.text : c.textFaint;
  // The lit tab in today's colours: Community amber, Coaching blue, the rest the court's own colour
  // (on the new bar, every tab the court's own colour). Over a clip on a light court (its ground gone
  // near-black) that colour is lifted a little toward white so it still reads, in the same hue.
  // On the new bar over a clip, the brand's colour lightened in its own hue instead (mixing in white
  // turned the lit tab a washed-out grey-green on the dark glass).
  const litOf = (route: string) => {
    const base = fresh ? c.brand : route === 'coaches' ? c.info : route === 'discuss' ? c.warning : c.brand;
    if (!media || darkPage) return base;
    return fresh ? lightened(base) : toward(base, c.onMedia, 0.35);
  };

  // The new bar's + as a plain icon in the row with its word (PLUS_LOOK 'icon'), lit while the Create box is up.
  const plusLit = veilBlocks;
  const plus = fresh && PLUS_LOOK === 'icon' ? (
    <View style={[st.slot, st.plusAbove]} key="create">
      <Pressable disabled={!live} accessible={live} accessibilityRole="button" accessibilityLabel="Create a post" onPress={onCreate} {...PRESS_AT_ONCE} style={st.hit}>
        <View ref={live ? tourCreate : undefined} style={st.target}>
          <Animated.View style={[st.inner, settle]}>
            <Ionicons name={plusLit ? 'add-circle' : 'add-circle-outline'} size={m.icon} color={plusLit ? litOf('create') : idleIcon} />
            <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[st.label, { color: plusLit ? litOf('create') : idleLabel }, labelFade]}>Create</Animated.Text>
          </Animated.View>
        </View>
      </Pressable>
    </View>
  ) : (
    <View style={[m.split ? st.plusSolo : st.slot, st.plusAbove]} key="create">
      <Pressable disabled={!live} accessible={live} accessibilityRole="button" accessibilityLabel="Create a post" onPress={onCreate} style={st.hit}>
        <View ref={live ? tourCreate : undefined} style={[st.plus, { backgroundColor: c.brand }]}>
          <BrandWash radius={m.plusRadius} />
          <Ionicons name="add" size={m.plusIcon} color={c.brandInk} />
        </View>
      </Pressable>
    </View>
  );

  const row: React.ReactNode[] = [];
  items.forEach((item, index) => {
    if (index === 2 && !m.split) row.push(plus);
    const active = item.route === activeRoute;
    const hold = item.route === 'index' ? onFeedHold : undefined;
    row.push(
      <View style={st.slot} key={item.route}>
        <FeedHold onHold={hold ? holdFeedTab : undefined}>
        <Pressable
          disabled={!live}
          accessible={live}
          onPressIn={() => { onTabPressIn(item.route); if (hold) noteFeedPressIn(); }}
          onPressOut={() => { onTabPressOut(); if (hold) noteFeedPressOut(); }}
          onPress={() => onTab(item.route)}
          // The hold is FeedHold's (the finger can then slide between the cards); this keeps it from also pressing the tab.
          // At the touch (PRESS_AT_ONCE), so its 400 ms lands with FeedHold's in a browser too.
          onLongPress={hold ? holdNoop : undefined}
          delayLongPress={hold ? HOLD_MS : undefined}
          {...PRESS_AT_ONCE}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={item.label}
          accessibilityActions={hold ? SHOW_ALL_FEEDS : undefined}
          onAccessibilityAction={hold ? (e) => { if (e.nativeEvent.actionName === 'showAllFeeds') hold(); } : undefined}
          style={hold ? [st.hit, NO_CALLOUT] : st.hit}
          {...(hold ? HOLD_MARK : null)}
        >
          {/* What the tutorial lights: the tab's width, the icon and its word's height, as today. */}
          <View ref={live ? tourRef(item.route) : undefined} style={st.target}>
            <Animated.View style={[st.inner, settle]}>
              <View>
                <TabGlyph name={active ? item.activeIcon : item.icon} size={m.icon} color={active ? litOf(item.route) : idleIcon} active={active} pop={fresh && live && !calm} />
                {item.route === 'profile' && profileAlerts > 0 ? (
                  <View style={[st.badge, { backgroundColor: c.danger }]}>
                    <Text maxFontSizeMultiplier={TextScale.CHROME} style={[st.badgeText, { color: c.onDanger }]}>{profileAlerts > 9 ? '9+' : profileAlerts}</Text>
                  </View>
                ) : null}
              </View>
              <Animated.Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CHROME} style={[st.label, { color: active ? litOf(item.route) : idleLabel }, labelFade]}>{item.label}</Animated.Text>
            </Animated.View>
          </View>
        </Pressable>
        </FeedHold>
      </View>,
    );
  });

  // The lens: a step darker than the ground on a light court, a step lighter on a dark one and over
  // a clip, in the ground the glass shows (the live glass may trail a clip's look by two frames).
  const lensDark = live ? glassMedia : media;
  const lensFill = lensDark ? withAlpha(c.onMedia, 0.16) : withAlpha(c.text, darkPage ? 0.12 : 0.07);
  // The new bar's: a soft wash of the brand's colour on a light court (the lit icon and word are that
  // colour), a step lighter on a dark court and over a clip. Never a heavy grey.
  const tint = lensDark ? { color: c.onMedia, alpha: 0.18 } : darkPage ? { color: c.text, alpha: 0.13 } : { color: c.brand, alpha: 0.11 };
  const inside = (
    <>
      {lens ? (fresh
        ? <StretchLens geo={lens} fallback={lensFallback} color={tint.color} alpha={tint.alpha} drive={live} calm={calm} st={st} />
        : <Lens geo={lens} fallback={lensFallback} fill={lensFill} glass={live && liquidGlass && LENS_LOOK === 'glass'} glassDark={lensDark || darkPage} st={st} />) : null}
      {row}
      {/* The hairline edge is a plain layer of its own, never a border on the glass, and above the
          Create box's veil, so the bar keeps its own edge while the box is up. */}
      <View pointerEvents="none" style={[st.rim, { borderColor: line }]} />
      {/* The new bar's bright inner edge, as Apple's glass has its own (so not there on iOS 26). */}
      {fresh && !liquidGlass ? <View pointerEvents="none" style={[st.glint, { borderColor: media || darkPage ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.8)' }]} /> : null}
      {/* While the Create box is up the bar keeps its colour (Oct 25, owner: "Don't like how this bottom
          gets dark grey"): a veil of its own ground, not the page's dim, steps the four tabs back so the
          lit + stands out, and catches a tap there to close the box. Only this child fades, never the glass. */}
      {live ? (
        <Animated.View pointerEvents={veilBlocks ? 'auto' : 'none'} style={[st.veil, { backgroundColor: withAlpha(ground, BAR_RECEDE) }, veilStyle]}>
          <Pressable accessible={false} importantForAccessibility="no" onPress={onVeil} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </>
  );
  // A fading copy is never glass: it is the one thing here whose opacity moves, and glass under a
  // fade can go see-through and stay that way (Oct 17). For a clip's look its ground is as
  // see-through as the glass's own tint, so it reads as the glass it stands for, never as a solid
  // slab over it (Oct 25 audit); for a court being left, solid, as that court's page is under it.
  if (m.split) {
    // Split: the four tabs on one ground, the + on a round one of its own beside it, each as the
    // single pill is (glass live, solid on a fading copy), each with its own edge and its own shadow.
    // The Create box's veil stays on the tabs only, so the + is still the one thing lit.
    const ground2 = (key: string, wrap: object, shape: object, radius: number, children: React.ReactNode) => (
      <View key={key} style={[wrap, live ? [st.shadow, { borderRadius: radius }] : null]}>
        {live ? (
          <Glass clear tint={groundOf(glassMedia)} dark={glassMedia ? true : undefined} radius={radius} style={shape}>{children}</Glass>
        ) : (
          <View style={[shape, { backgroundColor: copyAlpha < 1 ? withAlpha(ground, copyAlpha) : ground }]}>{children}</View>
        )}
      </View>
    );
    return (
      <View style={st.splitRow}>
        {ground2('tabs', st.splitTabs, st.pill, m.radius, inside)}
        {ground2('plus', st.splitPlus, st.plusPill, m.height / 2, (
          <>
            {plus}
            <View pointerEvents="none" style={[st.rim, { borderRadius: m.height / 2, borderColor: line }]} />
          </>
        ))}
      </View>
    );
  }
  if (!live) return <View style={[st.pill, { backgroundColor: copyAlpha < 1 ? withAlpha(ground, copyAlpha) : ground }]}>{inside}</View>;
  // The live bar: real Liquid Glass on iOS 26, a frosted blur on older iPhones, the tint nearly solid
  // on Android and the web (Glass). It re-tints at once when a court is picked or a clip comes or goes,
  // under the solid copy fading over it; nothing that holds it ever fades. The new bar's is lighter.
  return (
    <Glass clear light={fresh} tint={groundOf(glassMedia)} dark={glassMedia ? true : undefined} radius={m.radius} style={st.pill}>
      {inside}
    </Glass>
  );
}

/** `hex` moved part of the way (`t`, 0 to 1) toward `to`; both `#RRGGBB`, anything else comes back as it was. */
function toward(hex: string, to: string, t: number): string {
  const a = hex.replace('#', '');
  const b = to.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(a) || !/^[0-9a-f]{6}$/i.test(b)) return hex;
  const mixed = [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * `hex` (`#RRGGBB`) at least this light and this strong in its own hue, for a colour on dark glass
 * (Clean's green #2C7446 becomes about #5DBE80); anything else comes back as it was.
 */
function lightened(hex: string, light = 0.6, strong = 0.42): string {
  const h6 = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h6)) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l0 = (max + min) / 2;
  const d = max - min;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const l = Math.max(l0, light);
  const sat = d === 0 ? 0 : Math.max(s0, strong);
  const c2 = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c2 * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m0 = l - c2 / 2;
  const [r1, g1, b1] = hue < 60 ? [c2, x, 0] : hue < 120 ? [x, c2, 0] : hue < 180 ? [0, c2, x] : hue < 240 ? [0, x, c2] : hue < 300 ? [x, 0, c2] : [c2, 0, x];
  return `#${[r1, g1, b1].map((v) => Math.round((v + m0) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Each outline's own measures (tabBarLook's BAR_SHAPE; its height and lift are there): the corners,
 * how far in from each side, the room at the pill's ends, the icons, the words, the +, how far the
 * icons settle when the words go, and where Profile's count sits on its icon.
 */
const SHAPES = {
  // Today's quiet pill, less round than the old one (its ends were half its height).
  now: { radius: 18, side: 14, pad: 6, icon: 23, label: 11, plus: 38, plusIcon: 24, settle: 7, badgeLeft: 14 },
  A: { radius: SHAPE.height / 2, side: 16, pad: 11, icon: 23, label: 11, plus: 40, plusIcon: 24, settle: 7, badgeLeft: 14 },
  B: { radius: SHAPE.height / 2, side: 16, pad: 10, icon: 21, label: 10, plus: 34, plusIcon: 21, settle: 6, badgeLeft: 13 },
  C: { radius: SHAPE.height / 2, side: 16, pad: 9, icon: 23, label: 11, plus: 44, plusIcon: 26, settle: 7, badgeLeft: 14 },
} as const;
const S = SHAPES[BAR_SHAPE];
/** The + on a round glass button of its own beside the tabs, not in their row. */
const SPLIT = BAR_SHAPE === 'C';
/** The air between the tabs and the + when they are apart. */
const SPLIT_GAP = 10;
/** The +'s shape in the quiet pill (Oct 25, owner: "Show me square vs circle"): 'square' a 42×32 rounded square, 'circle' a round button. */
const PLUS_SHAPE = 'circle' as 'square' | 'circle';

/** One bar's measures: the quiet pill's (BAR_SHAPE) or the new bar's (tabBarLook's NEW_BAR). */
interface BarSpec {
  height: number; lift: number; radius: number; side: number; pad: number; icon: number; label: number;
  plus: number; plusIcon: number; plusW: number; plusH: number; plusRadius: number;
  settle: number; badgeLeft: number; lensInset: number; split: boolean;
}

const QUIET_SPEC: BarSpec = {
  ...S, height: SHAPE.height, lift: SHAPE.lift, lensInset: LENS_INSET, split: SPLIT,
  plusW: PLUS_SHAPE === 'circle' ? S.plus : 42, plusH: PLUS_SHAPE === 'circle' ? S.plus : 32, plusRadius: PLUS_SHAPE === 'circle' ? S.plus / 2 : 11,
};
const NEW_SPEC: BarSpec = {
  height: NEW_BAR.height, lift: 0, radius: NEW_BAR.height / 2, side: NEW_BAR.side, pad: NEW_BAR.pad,
  icon: NEW_BAR.icon, label: NEW_BAR.label, plus: NEW_BAR.plus, plusIcon: NEW_BAR.plusIcon,
  plusW: NEW_BAR.plus, plusH: NEW_BAR.plus, plusRadius: NEW_BAR.plus / 2,
  settle: NEW_BAR.settle, badgeLeft: NEW_BAR.badgeLeft, lensInset: NEW_BAR.inset, split: false,
};

function barStyles(m: BarSpec, fresh: boolean) {
  const RADIUS = m.radius;
  return StyleSheet.create({
    // Lifted off the bottom by the outline's own lift (tabBarLook counts it in the bar's height).
    float: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30, paddingBottom: m.lift },
    // As far in from each side as today's pill (the tutorial's lit tab keeps inside it: TourOverlay's BAR_SIDE).
    pillWrap: { width: '100%', paddingHorizontal: m.side },
    // The shadow on a rounded layer of its own around the glass (no fill, never faded), as the old glass bar's.
    // The new bar's a little wider and softer, as Instagram's and Strava's float.
    pillShadow: fresh
      ? { borderRadius: RADIUS, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
      : { borderRadius: RADIUS, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    // The same shadow along the pill's outline (an iPhone's shadowRadius is half a box shadow's blur).
    pillShadowPath: { shadowOpacity: 0, boxShadow: fresh ? '0px 4px 24px rgba(0, 0, 0, 0.08)' : '0px 3px 20px rgba(0, 0, 0, 0.07)' },
    shadow: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    pill: { height: m.height, borderRadius: RADIUS, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: m.pad },
    rim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2, borderRadius: RADIUS, borderWidth: StyleSheet.hairlineWidth },
    // The new bar's bright inner edge, just inside the hairline.
    glint: { position: 'absolute', top: StyleSheet.hairlineWidth, left: StyleSheet.hairlineWidth, right: StyleSheet.hairlineWidth, bottom: StyleSheet.hairlineWidth, zIndex: 2, borderRadius: RADIUS, borderWidth: 1 },
    splitHolder: { height: m.height },
    splitRow: { flexDirection: 'row', alignItems: 'center', gap: SPLIT_GAP, height: m.height },
    splitTabs: { flex: 1 },
    splitPlus: { width: m.height, height: m.height },
    plusPill: { width: m.height, height: m.height, borderRadius: m.height / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    // The whole round button answers a tap, not just the + in it.
    plusSolo: { width: m.height, height: m.height },
    slot: { flex: 1, alignSelf: 'stretch' },
    hit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    target: { alignSelf: 'stretch', alignItems: 'center' },
    inner: { alignItems: 'center', justifyContent: 'center', gap: fresh ? 2 : 3 },
    // The + stands above the Create box's veil (zIndex 2 over the veil's 1), at full strength.
    plusAbove: { zIndex: 2 },
    plus: { width: m.plusW, height: m.plusH, borderRadius: m.plusRadius, alignItems: 'center', justifyContent: 'center', ...brandShadow },
    label: fresh
      ? { ...typography.smallStrong, fontSize: m.label, letterSpacing: 0 }
      : { ...typography.smallStrong, fontSize: m.label, letterSpacing: 0.15 },
    // Sits off the icon's shoulder rather than on top of it, as today.
    badge: {
      position: 'absolute', top: -5, left: m.badgeLeft,
      minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
      alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { fontSize: 11, lineHeight: 13, ...font('700'), fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' },
    veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, borderRadius: RADIUS },
    // The swipe followed: the copy of the look the glass shows itself, kept laid down but not shown.
    copyAway: { opacity: 0 },
    // The lens: from the pill's left edge, moved along by a transform alone.
    lens: { position: 'absolute', left: 0, top: m.lensInset, bottom: m.lensInset },
    lensShape: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: m.height / 2 - m.lensInset, overflow: 'hidden' },
    // The new bar's lens: its holder across the pill, and its round ends and middle, each from the pill's left edge.
    stretch: { position: 'absolute', left: 0, right: 0, top: m.lensInset },
    stretchCap: { position: 'absolute', left: 0, top: 0 },
    stretchMid: { position: 'absolute', left: 0, top: 0, width: MID_W },
  });
}
type BarStyles = ReturnType<typeof barStyles>;

/** A bar's measures and styles, and whether it is the new one. */
interface BarLook { m: BarSpec; st: BarStyles; fresh: boolean }
const QUIET_LOOK: BarLook = { m: QUIET_SPEC, st: barStyles(QUIET_SPEC, false), fresh: false };
const NEW_LOOK: BarLook = { m: NEW_SPEC, st: barStyles(NEW_SPEC, true), fresh: true };
