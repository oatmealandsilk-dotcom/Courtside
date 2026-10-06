import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, Dimensions, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import * as haptics from '@/lib/haptics';
import { PullDisc, usePullDisc } from '@/components/PullDisc';
import { PULL_DISARM, PULL_DISC, PULL_GAP, PULL_LAND_SLACK, PULL_LINE, PULL_MIN_SPIN, PULL_RETURN, WEB_PULL_LINE, fingerFor, pullFetch, pullRowLift, pullRowOpacity, rubberBand } from '@/lib/pullRefresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { KeyboardScrollContext, afterKeyboard, visibleAboveKeyboard, type Measurable } from '@/lib/keyboardScroll';
import { KEYBOARD_ROOM, useKeyboardRoom } from '@/lib/keyboardRoom';
import { TAB_FOR_KEY, subscribeScrollToTop } from '@/features/navigation/scrollToTop';
import { barCompact } from '@/features/navigation/barShrink';
import Reanimated, { type SharedValue, cancelAnimation, runOnJS, runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { Wash } from '@/components/Wash';
import { PAGE_WASH, PageWashContext, type PageWashFrame } from './pageWash';
import { useBarInset } from '@/features/navigation/barInset';
import { colors, spacing, typography } from '@/theme';

/**
 * How far down each route was left, kept outside React so it survives the
 * screen being unmounted and rebuilt — which is exactly what happens when you
 * swipe to another tab and back.
 */
const scrollMemory = new Map<string, number>();

// Pull-to-refresh on the phone, the same way the Home feed does it (the
// numbers are shared, in lib/pullRefresh): a blank strip the height of the
// held gap sits above the content, and the page normally rests just past it.
// Pulling scrolls the strip into view, then the phone's own stretch takes
// over, so the page gives less than the finger; the line is part way into
// that stretch. Let go past it and the phone's own bounce lands the page on
// the strip's top, where it holds while the fetch runs, then springs back.
const IOS = Platform.OS === 'ios';
// Roughly how far a page coasts after letting go, per point-per-millisecond of speed, at the normal slowing.
const COAST = 499;

/**
 * Browsers decide per touch whether a gesture is theirs to scroll with, by
 * intersecting touch-action from the finger's target up to the nearest
 * scrolling ancestor — which here is this screen's own ScrollView, not the
 * page-level swipe surface wrapped around it. Buttons allow horizontal pans,
 * so a sideways swipe that starts on one (the section tabs, say) is taken by
 * the browser and cancelled instead of reaching the swipe surface. Declaring
 * vertical-only here, beneath the scroller, keeps those swipes ours.
 */
const verticalOnlyTouch = Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  right?: ReactNode;
  padded?: boolean;
  onBack?: () => void;
  compactTitle?: boolean;
  /** Desktop-only right-hand column, Instagram style. Ignored below the desktop breakpoint. */
  rail?: ReactNode;
  headerWrapper?: (header: ReactNode) => ReactNode;
  /**
   * Which screen this is, for remembering scroll position. Needed because a
   * screen drawn as a swipe preview sees the route you are leaving, not its
   * own — without this, Coaching's position would be applied to Profile.
   */
  memoryKey?: string;
  /** Hands the caller the scroller, for jumping to a particular child. */
  scrollRef?: React.MutableRefObject<ScrollView | null>;
  /** Kept up to date with how far down the page is, for a caller that remembers a spot per section. */
  offsetY?: SharedValue<number>;
  /**
   * Pull down past the top to run this; a small "Updated" note confirms it.
   * Giving back `false` means it did not work, and then there is no note.
   */
  onRefresh?: () => Promise<boolean | void> | boolean | void;
  /** The colour wash behind the top of the page. Every page carries it; pass false to go without. */
  wash?: boolean;
  /**
   * Whether the phone's floating tab bar shows over this page. A page that
   * AppShell hides the bar on (its phoneOnlyHide list) passes false, so no
   * room is kept for a bar that is not there. Said by the page itself rather
   * than read from the address: a tab stays drawn underneath the pages opened
   * over it, and its bottom must not move when one opens.
   */
  bar?: boolean;
  /**
   * For a page that does not scroll as a whole (scroll={false}) but holds
   * scrollers of its own (Archive's two sections): they run on down behind
   * the floating bar the way a scrolling page does, and keep clear of it at
   * the end of their own content, so no room is kept here.
   */
  scrollsInside?: boolean;
}

export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  right,
  padded = true,
  onBack,
  compactTitle = false,
  rail,
  headerWrapper,
  memoryKey,
  scrollRef,
  offsetY,
  onRefresh,
  wash = true,
  bar = true,
  scrollsInside = false,
}: Props) {
  // The floating tab bar covers this much of the bottom; a page's last line stays above it.
  const barInset = useBarInset();
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // While a sideways page swipe is under way, this scroller stands down.
  const swiping = useSyncExternalStore(subscribePageDragging, isPageDragging, () => false);
  const key = memoryKey ?? pathname;
  const scroller = useRef<ScrollView | null>(null);
  // Captured once so the starting offset is set before the first paint rather
  // than scrolled to afterwards, which is what made it jump into place.
  const initial = useRef(scrollMemory.get(key) ?? 0);
  // The strip only exists on the phone, and only on pages that can refresh.
  const strip = Platform.OS !== 'web' && onRefresh ? PULL_GAP : 0;
  const restored = useRef(initial.current === 0);
  const { isPhone, isDesktop } = useResponsive();
  // The page's own height. A short page must still be able to scroll past the
  // pull strip, or it rests on the strip and its disc shows for good.
  const [viewH, setViewH] = useState(0);
  // Whether the keyboard is up. An iPhone says so as the keys start to move;
  // Android only once they have, since its "will" events never fire. Two
  // kinds of page listen. One with a pull strip on an iPhone: with the keys
  // up the phone lets a page scroll past its content, so the box you type in
  // clears them, and the stop at the page's top (below) would pull every
  // let-go back inside the content, so it stands down until the keys go; a
  // fling into the strip meanwhile is still caught as it scrolls. And one
  // that does not scroll, for the room at its bottom.
  const [keysUp, setKeysUp] = useState(false);
  // On a fixed page on an iPhone, how far the keys reach up into the page:
  // truly, and as the keyboard avoider (KeyboardAvoidingView, below) works it out.
  const [keysCover, setKeysCover] = useState<{ truly: number; avoided: number } | null>(null);
  // The avoider's place in its parent: the same layout it does its own sum with.
  const avoiderFrame = useRef<{ y: number; height: number } | null>(null);
  // In a browser, where the scrolling part starts under the wash, for a bar pinned at its top to carry the wash on (pageWash).
  const washFrame = useRef<PageWashFrame>({ node: null, y: 0 });
  // Android has no need: there the keyboard's room is an empty box that follows the keys (useKeyboardRoom, below).
  const watchKeys = IOS && (!scroll || strip > 0);
  useEffect(() => {
    if (!watchKeys) return;
    setKeysUp(Keyboard.isVisible());
    const up = Keyboard.addListener(IOS ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeysUp(true);
      if (!IOS || scroll) return;
      const top = e.endCoordinates.screenY;
      const f = avoiderFrame.current;
      // Some settings report keys with no position; the avoider ignores those too.
      if (!(top > 0) || !f) { setKeysCover(null); return; }
      // A fixed page runs to the bottom of the screen (a sheet is pinned
      // there), so the keys truly cover it from their top edge down. The
      // page's own place on screen can't be asked for: inside a sheet the
      // phone reports it as if the sheet started at the very top. The avoider
      // does its sum against its parent, which is where it falls short.
      setKeysCover({ truly: Math.max(0, Dimensions.get('screen').height - top), avoided: Math.max(0, f.y + f.height - top) });
    });
    const down = Keyboard.addListener(IOS ? 'keyboardWillHide' : 'keyboardDidHide', () => { setKeysUp(false); setKeysCover(null); });
    return () => { up.remove(); down.remove(); setKeysUp(false); setKeysCover(null); };
  }, [watchKeys, scroll]);
  // The room the page keeps at its bottom: the floating bar's, or on a page
  // the bar is hidden on, just the home-indicator strip's. A page that does
  // not scroll gives it up while the keys are up. On an iPhone they cover the
  // bar and the strip, and the avoider lifts the page by the keys' height, so
  // keeping the room as well left an empty band sitting on top of the keys.
  // What it keeps instead is what the avoider misses: measuring against its
  // parent, it comes up short on a page in a sheet (the location picker) by
  // the sheet's distance from the top. Keys shorter than the room (a hardware
  // keyboard's slim strip) leave the rest of it kept. Android (Oct 5) is
  // drawn edge to edge: the window does not shrink for the keys, which cover
  // the bottom of the page, so there the room stays and an empty box as tall
  // as the keys, less this room, goes under the page (keyboardRoom, below).
  // A tablet or an unfolded foldable on Android takes the wide layout, still
  // edge to edge, so it keeps clear of the navigation bar; a computer has none.
  const wideNative = !isPhone && Platform.OS !== 'web';
  const barRoom = !isPhone ? (wideNative ? insets.bottom : 0) : bar ? barInset : insets.bottom;
  let room = barRoom;
  if (!scroll && isPhone && IOS && keysCover) room = Math.max(keysCover.truly, barRoom) - keysCover.avoided;
  if (!scroll && scrollsInside) room = 0;
  // Android only (0 everywhere else): the keyboard's room, past what the page already keeps.
  const keyboardRoom = useKeyboardRoom(room);
  // Pull-to-refresh: the disc while it runs, then a small note that
  // slides in under the header and fades — enough to know it happened.
  const updated = useRef(new Animated.Value(0)).current;
  // In a browser there is no pull-to-refresh, so the page listens for the
  // pull itself: a trackpad or wheel pushed up past the top, or a finger
  // dragged down from the top. The finger's travel goes through the same
  // give the phone has, the disc draws round in step and closes at the line,
  // and only letting go past it refreshes.
  const refreshNowRef = useRef<() => Promise<void>>(async () => undefined);
  // One fetch at a time, but the finger is never locked out: a pull during
  // the way back simply starts the next one.
  const busy = useRef(false);
  // How open the pull is, in points (the phone's gap, or the browser's
  // pull), and the disc's moving parts. Both live on the animation thread.
  const gap = useSharedValue(0);
  const disc = usePullDisc();
  // Whether this page can refresh right now: asked at the moment of each
  // pull, since a page can gain or lose it after the listeners are on.
  const canRefresh = useRef(false);
  canRefresh.current = Boolean(onRefresh);
  const webPull = useCallback((node: ScrollView | null) => {
    if (Platform.OS !== 'web' || !node) return;
    const el = ((node as unknown as { getScrollableNode?: () => unknown }).getScrollableNode?.() ?? node) as unknown as HTMLElement;
    if (!el || typeof el.addEventListener !== 'function' || (el as unknown as { __pullWired?: boolean }).__pullWired) return;
    (el as unknown as { __pullWired?: boolean }).__pullWired = true;
    let finger = 0;
    let armed = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let touchStart: number | null = null;
    const room = () => el.clientHeight || 800;
    const follow = (amount: number) => {
      finger = Math.max(0, amount);
      gap.value = rubberBand(finger, room());
      if (!armed && gap.value >= WEB_PULL_LINE) { armed = true; disc.arm(); haptics.tap(); }
      else if (armed && gap.value < WEB_PULL_LINE - PULL_DISARM) { armed = false; disc.disarm(); }
    };
    // Picks the pull up wherever it is, even part way back.
    const pickUp = () => { cancelAnimation(gap); finger = fingerFor(gap.value, room()); if (!busy.current) disc.rest(); };
    const letGo = () => {
      if (idle) { clearTimeout(idle); idle = null; }
      if (armed) {
        armed = false;
        disc.start();
        gap.value = withSpring(PULL_GAP, PULL_RETURN);
        void refreshNowRef.current();
      } else if (gap.value > 0) gap.value = withSpring(0, PULL_RETURN);
      finger = 0;
    };
    el.addEventListener('wheel', (e: WheelEvent) => {
      if (!canRefresh.current || busy.current || el.scrollTop > 0 || (e.deltaY >= 0 && finger <= 0)) return;
      if (finger <= 0 && gap.value > 0) pickUp();
      follow(finger - e.deltaY);
      if (idle) clearTimeout(idle);
      idle = setTimeout(letGo, 220);
    }, { passive: true });
    el.addEventListener('touchstart', (e: TouchEvent) => {
      touchStart = canRefresh.current && el.scrollTop <= 0 && !busy.current ? e.touches[0].clientY : null;
      if (touchStart !== null) { pickUp(); touchStart -= finger; }
    }, { passive: true });
    el.addEventListener('touchmove', (e: TouchEvent) => { if (touchStart !== null) follow(e.touches[0].clientY - touchStart); }, { passive: true });
    const touchEnd = () => { if (touchStart === null) return; touchStart = null; letGo(); };
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('touchcancel', touchEnd);
  }, [gap, disc]);
  // The listeners go on once the page has something to refresh. Not from the
  // scroller's own ref: that is handed over only once, when the page first
  // appears, and a page that could not refresh yet (Profile, for one) never
  // got them at all.
  const hasRefresh = Boolean(onRefresh);
  useEffect(() => { if (hasRefresh) webPull(scroller.current); }, [hasRefresh, webPull]);

  // The bottom bar ducks as this page scrolls — worked out here on the
  // animation thread, frame for frame with the finger, so it never steps.
  const lastY = useSharedValue(-1);
  // Where the page is, so the wash behind the top scrolls away with it.
  const scrollY = useSharedValue(0);
  // A browser pays for every frame of this on the main thread, so there the wash simply stays put.
  const washStyle = useAnimatedStyle(() => (Platform.OS === 'web' ? {} : { transform: [{ translateY: -Math.max(0, scrollY.value - strip) }] }));
  const list = useAnimatedRef<Reanimated.ScrollView>();
  // A finger is down; the line has been crossed; the fetch is running; a
  // move back past the strip is under way.
  const dragging = useSharedValue(false);
  const armed = useSharedValue(false);
  const holding = useSharedValue(false);
  const settling = useSharedValue(false);
  const tick = useCallback(() => haptics.tap(), []);
  const beginPull = useCallback(() => { void refreshNowRef.current(); }, []);
  // A move the scroller is asked for when a pull lets go. It waits one frame:
  // asked for in the same moment as letting go, the phone's own coasting,
  // which starts just after, would undo it.
  const settleTo = useCallback((y: number) => {
    'worklet';
    if (settling.value) return;
    settling.value = true;
    requestAnimationFrame(() => { scrollTo(list, 0, y, true); });
  }, [list, settling]);
  // The way back after a refresh is driven frame by frame on the animation
  // thread: a spring from wherever the page is, which a finger can catch.
  const glide = useSharedValue(0);
  const gliding = useSharedValue(false);
  useAnimatedReaction(() => glide.value, (v, prev) => { if (gliding.value && v !== prev) scrollTo(list, 0, v, false); }, []);
  const remember = useCallback((y: number) => { scrollMemory.set(key, Math.max(0, y - strip)); }, [key, strip]);
  // The disc rides in the middle of the open gap, fading in as it opens and out as it closes.
  const rowStyle = useAnimatedStyle(() => ({ opacity: pullRowOpacity(gap.value), transform: [{ translateY: pullRowLift(gap.value) }] }));
  // In a browser the page itself does not move: the disc comes down over the
  // top of it instead, as far as the held gap, and fades in on the way.
  const webDiscStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, (gap.value - 8) / 24)), transform: [{ translateY: -40 + 46 * Math.min(1, gap.value / PULL_GAP) }] }));
  // Back past the strip once the fetch is done — unless the page has been
  // scrolled away from it meanwhile, in which case it stays where it was put.
  const finish = useCallback(() => {
    'worklet';
    holding.value = false;
    // A finger already on the page keeps it; letting go settles it like any pull.
    if (dragging.value) { disc.rest(); return; }
    const y = scrollY.value;
    if (y < strip - 1) {
      gliding.value = true;
      glide.value = y;
      glide.value = withSpring(strip, PULL_RETURN, (done) => {
        gliding.value = false;
        // The spring's last step lands after it stops driving the scroller, so that step is made here.
        if (done) { scrollTo(list, 0, strip, false); disc.rest(); runOnJS(remember)(strip); }
      });
    } else disc.rest();
  }, [strip, scrollY, holding, dragging, gliding, glide, list, disc, remember]);
  // The way back is always the current one: a page can stop offering a
  // refresh while one runs, and its strip goes with it.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const onScrollAnimated = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      scrollY.value = y;
      if (offsetY) offsetY.value = y;
      if (strip > 0) {
        gap.value = strip - y;
        // The line counts only under a finger: a fling or a bounce never ticks.
        // Crossing it closes the disc's ring and ticks in the same moment.
        if (dragging.value && !holding.value) {
          if (!armed.value && gap.value >= PULL_LINE) { armed.value = true; disc.arm(); runOnJS(tick)(); }
          else if (armed.value && gap.value < PULL_LINE - PULL_DISARM) { armed.value = false; disc.disarm(); }
        }
        // Heading for the top on its own (a tap on the clock), the page stops
        // at its top rather than in the strip.
        if (!dragging.value && !holding.value && !gliding.value && y < strip - 2 && lastY.value >= 0 && y < lastY.value) settleTo(strip);
        if (y >= strip - 0.5) settling.value = false;
      }
      // The first report is just where the page already sat (a tab switch
      // restoring its place): nothing to react to.
      if (lastY.value < 0) { lastY.value = y; return; }
      const dy = y - lastY.value;
      lastY.value = y;
      // Only a real move counts, in either direction; the bar carries on from wherever it is.
      if (Math.abs(dy) > 0.3 && y >= strip) barCompact.value = Math.max(0, Math.min(1, barCompact.value + dy / 150));
    },
    onBeginDrag: () => {
      dragging.value = true;
      settling.value = false;
      // A finger on the page while it springs back catches it where it is.
      if (gliding.value) { cancelAnimation(glide); gliding.value = false; }
      if (!holding.value) { armed.value = false; disc.rest(); }
    },
    onEndDrag: (event) => {
      dragging.value = false;
      const y = event.contentOffset.y;
      // Where the page was left is kept once the finger lifts and once the
      // glide ends, not on every frame: a message across to the app's logic
      // 120 times a second, only to be overwritten, was stealing time from the scroll.
      runOnJS(remember)(y);
      if (strip <= 0) return;
      // Where the phone says it will stop, the stop at the page's top
      // included; without that (Android), a guess from its speed.
      const goal = event.targetContentOffset?.y ?? y + (IOS ? event.velocity?.y ?? 0 : 0) * COAST;
      if (armed.value && !holding.value) {
        // Let go past the line: it refreshes, and the disc starts turning.
        armed.value = false;
        holding.value = true;
        disc.start();
        runOnJS(beginPull)();
        // Let go still moving down (the usual, even with the lift of a finger
        // in it), the phone's own bounce lands the page on the strip's top:
        // that is left alone. Heading anywhere else (a flick back up), it is
        // sent there.
        if (goal > PULL_LAND_SLACK) settleTo(0);
      } else if (y < strip && goal < strip - 0.5) {
        // Short of the line it goes back past the strip. While a fetch runs it
        // goes back to the held gap instead, which the bounce mostly does itself.
        if (!holding.value) settleTo(strip);
        else if (goal > PULL_LAND_SLACK) settleTo(0);
      }
    },
    // Each frame of the spring back reports as a scroll that has come to rest; only the real end of a move counts.
    onMomentumEnd: (event) => { settling.value = false; if (!gliding.value) runOnJS(remember)(event.contentOffset.y); },
  });

  const refreshNow = useCallback(async () => {
    if (busy.current) return;
    // Nothing to fetch after all (the page stopped offering it mid-pull): straight back.
    if (!onRefresh) {
      if (Platform.OS !== 'web') runOnUI(finishRef.current)();
      else gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); });
      return;
    }
    busy.current = true;
    const began = Date.now();
    // A fetch that fails, or hangs past a few seconds, gets no note.
    const ok = (await pullFetch(onRefresh)) !== false;
    // A quick fetch still shows the disc turning for a moment, so the pull reads as having done something.
    const left = PULL_MIN_SPIN - (Date.now() - began);
    if (left > 0) await new Promise<void>((resolve) => setTimeout(resolve, left));
    busy.current = false;
    if (Platform.OS !== 'web') runOnUI(finishRef.current)();
    else gap.value = withSpring(0, PULL_RETURN, (done) => { if (done) disc.rest(); });
    // The note says it worked, so it only shows when it did. It comes in once
    // the page is most of the way back and the disc has gone, not on top of it.
    if (!ok) return;
    updated.setValue(0);
    Animated.sequence([
      Animated.delay(180),
      Animated.spring(updated, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220 }),
      Animated.delay(900),
      Animated.timing(updated, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [onRefresh, updated, gap, disc]);
  refreshNowRef.current = refreshNow;

  // A text box asks for this when it gains focus: once the keyboard is up,
  // measure where the box sits and scroll just enough to clear the keyboard.
  const reveal = useCallback((node: Measurable | null) => {
    if (!node?.measureInWindow || !scroller.current) return;
    afterKeyboard(() => {
      node.measureInWindow?.((_x, y, _w, h) => {
        const visibleBottom = visibleAboveKeyboard() - 24;
        const overflow = y + h - visibleBottom;
        if (overflow <= 0) return;
        const current = scrollMemory.get(key) ?? 0;
        scroller.current?.scrollTo({ y: current + overflow, animated: true });
      });
    });
  }, [key]);

  // "Top" is just under the pull-to-refresh strip: landing on the strip by a
  // tap rather than a pull would show the spinner with nothing to dismiss it.
  useEffect(() => subscribeScrollToTop((tab, instant, below = 0) => {
    if (TAB_FOR_KEY[key] !== tab && key !== tab) return;
    scroller.current?.scrollTo({ y: strip + below, animated: !instant });
    if (instant) scrollMemory.set(key, below);
  }), [key, strip]);

  // Under the header, over the top of the page: a small note once a pull has fetched.
  const updatedNote = onRefresh ? (
    <Animated.View pointerEvents="none" style={[styles.updated, { opacity: updated, transform: [{ translateY: updated.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: updated.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }]}>
      <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
      <Text style={styles.updatedText}>Updated</Text>
    </Animated.View>
  ) : null;

  const showRail = Boolean(rail) && isDesktop;
  // Centred column, like Instagram's 935px container.
  const columnWidth = showRail ? LAYOUT.feedColumn : LAYOUT.soloColumn;
  const containerWidth = showRail ? columnWidth + LAYOUT.rail + spacing.xxl : columnWidth;

  // On a computer the page sits in a centred column. A page that does not
  // scroll (the map) fills the column's height; before, the column was only
  // as tall as its content, and a map that fills its space had none, so it
  // drew nothing at all.
  const constrain = (node: ReactNode, fill = false) =>
    isPhone ? node : <View style={[styles.constrain, fill && styles.flex, { maxWidth: containerWidth }]}>{node}</View>;

  const header =
    title || onBack ? (
      constrain(
        <View style={[styles.header, !isPhone && styles.headerWide]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <Text style={compactTitle || !isPhone ? styles.titleCompact : styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>,
      )
    ) : null;

  const main = (
    <View style={[padded && styles.padded, { paddingBottom: (scroll ? spacing.xxxl : 0) + room, flex: showRail || !scroll ? 1 : undefined }]}>
      {children}
    </View>
  );

  const body = constrain(
    showRail ? (
      <View style={styles.withRail}>
        <View style={[styles.column, { maxWidth: columnWidth }]}>{main}</View>
        <View style={[styles.rail, { width: LAYOUT.rail }]}>{rail}</View>
      </View>
    ) : (
      main
    ),
    !scroll,
  );

  return (
    <KeyboardScrollContext.Provider value={scroll ? reveal : null}>
    <PageWashContext.Provider value={wash && scroll && Platform.OS === 'web' ? washFrame : null}>
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: isPhone ? insets.top : wideNative ? Math.max(insets.top, spacing.sm) : spacing.sm }]}
      // A scrolling page moves the box itself; a fixed page lifts everything.
      behavior={Platform.OS === 'ios' && !scroll ? 'padding' : undefined}
      enabled={Platform.OS === 'ios' && !scroll}
      onLayout={(e) => { avoiderFrame.current = e.nativeEvent.layout; }}
    >
      {wash ? <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, washStyle]}><Wash height={PAGE_WASH.height} strength={PAGE_WASH.strength} /></Reanimated.View> : null}
      {headerWrapper ? headerWrapper(header) : header}
      {scroll ? (
        <View
          style={styles.flex}
          ref={Platform.OS === 'web' ? (node) => { washFrame.current.node = node; } : undefined}
          onLayout={Platform.OS === 'web' ? (e) => { washFrame.current.y = e.nativeEvent.layout.y; } : undefined}
        >
        <Reanimated.ScrollView
          ref={(node: unknown) => { list(node as never); scroller.current = node as unknown as ScrollView | null; if (scrollRef) scrollRef.current = node as unknown as ScrollView | null; }}
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, verticalOnlyTouch, strip > 0 && viewH > 0 ? { minHeight: viewH + strip } : null]}
          onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h > 0 && h !== viewH) setViewH(h); }}
          scrollEnabled={!swiping}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          // Keeps whatever box you are typing in above the keyboard (on Android, the keyboard's room at the end does).
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          // Android has no keyboard that follows the finger down: a drag on the page puts it away.
          keyboardDismissMode={Platform.OS === 'android' ? 'on-drag' : 'interactive'}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          // A fling up the page stops exactly at its top, never coasting on
          // into the pull strip; below that the page scrolls freely.
          snapToOffsets={strip > 0 && !keysUp ? [strip] : undefined}
          snapToStart={false}
          snapToEnd={false}
          // Set before the first paint, so there is no visible jump. Web ignores
          // this, which is what the fallback below is for.
          contentOffset={{ x: 0, y: strip + initial.current }}
          onScroll={onScrollAnimated}
          onContentSizeChange={(_width, height) => {
            // A page that was too short to rest below the pull strip (so the
            // strip and its disc showed) settles below it once it is tall enough.
            // Never under a finger or while the gap is held.
            if (strip > 0 && !busy.current && !holding.value && !dragging.value && !gliding.value && scrollY.value < strip - 1 && viewH > 0 && height >= viewH + strip - 1) {
              scroller.current?.scrollTo({ y: strip, animated: false });
            }
            if (restored.current) return;
            // Wait until the content is tall enough to hold the position,
            // otherwise the scroll clamps to the bottom of a half-built page.
            if (height > initial.current) {
              restored.current = true;
              scroller.current?.scrollTo({ y: strip + initial.current, animated: false });
            }
          }}
        >
          {strip > 0 ? <View pointerEvents="none" style={{ height: strip }} /> : null}
          {body}
          {KEYBOARD_ROOM ? <Reanimated.View pointerEvents="none" style={keyboardRoom} /> : null}
        </Reanimated.ScrollView>
        {/* In front of the page, in the gap the pull opens: the disc, which draws round as you
            pull, closes at the line and turns while it fetches. In front, so it is never seen
            through the page or hidden by it; it only ever shows inside the gap. */}
        {strip > 0 ? (
          <Reanimated.View pointerEvents="none" style={[styles.pullRow, rowStyle]}>
            <PullDisc gap={gap} disc={disc} line={PULL_LINE} />
          </Reanimated.View>
        ) : null}
        {updatedNote}
        </View>
      ) : (
        <View style={styles.flex}>
          {body}
          {KEYBOARD_ROOM ? <Reanimated.View pointerEvents="none" style={keyboardRoom} /> : null}
          {updatedNote}
        </View>
      )}
      {onRefresh && Platform.OS === 'web' ? (
        <Reanimated.View pointerEvents="none" style={[styles.webRefresh, webDiscStyle]}>
          <PullDisc gap={gap} disc={disc} line={WEB_PULL_LINE} />
        </Reanimated.View>
      ) : null}
    </KeyboardAvoidingView>
    </PageWashContext.Provider>
    </KeyboardScrollContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  pullRow: { position: 'absolute', top: 0, left: 0, right: 0, height: PULL_DISC, alignItems: 'center', justifyContent: 'center' },
  webRefresh: { position: 'absolute', alignSelf: 'center', top: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  updated: { position: 'absolute', alignSelf: 'center', top: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  updatedText: { ...typography.smallStrong, color: colors.text },
  constrain: { width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerWide: { paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  headerText: { flex: 1, gap: 4 },
  title: { ...typography.display, color: colors.text },
  titleCompact: { ...typography.title, color: colors.text },
  back: { paddingRight: spacing.xs, paddingVertical: spacing.xs },
  subtitle: { ...typography.small, color: colors.textMuted },
  padded: { paddingHorizontal: spacing.lg },
  withRail: { flexDirection: 'row', gap: spacing.xxl, alignItems: 'flex-start' },
  column: { flex: 1 },
  rail: { paddingTop: spacing.lg, paddingRight: spacing.lg },
});
