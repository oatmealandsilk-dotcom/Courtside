import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, radius } from '@/theme';
import { Wash } from '@/components/Wash';
import { CLOSE_MS, OPEN_SPRING, STAGE_EASING, getStage, setFull, stageDip, stageTop, subscribe as onStageChange, type StageGeo } from '@/features/feed/commentStage';
import { useAndroidBack } from '@/lib/androidBack';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** Out of the way fast: a quick ease-in, the way a card is tossed down. */
const EASE_OUT_OF_VIEW = Easing.bezier(0.4, 0, 1, 1);
/** Apple's sheets rise on a spring: quick, with the faintest settle at the top. */
const SPRING = { damping: 24, stiffness: 240, mass: 0.9, overshootClamping: false } as const;
const FLICK_PX_PER_S = 700;

/**
 * The comments stage's own drag, for a list inside it that hands a pull down
 * at its top over to the sheet (see comments). Worklets: start, follow the
 * finger, let go. Every other sheet has none.
 */
export interface SheetDrag {
  start: () => void;
  to: (translationY: number) => void;
  release: (velocityY: number) => void;
}
const DragSheetContext = createContext<SheetDrag | null>(null);
export const useSheetDrag = () => useContext(DragSheetContext);

/**
 * A card sheet with exactly two places the drag handle can leave it: open
 * all the way (near the top of the screen, the page behind still peeking
 * above it) or closed. It rises to a middle height on its own when it
 * appears — that opening height is never a place a drag settles back onto,
 * only a starting point; every drag on the handle resolves to fully open or
 * fully gone.
 *
 * `stage` makes it the comments stage instead (see StageSheet below): the
 * clip stays playing above it, so it has three stops and no dim.
 */
export function DragSheet(props: {
  /** Rendered inside the draggable strip, above `children` — a title row, usually. */
  header: React.ReactNode;
  children: React.ReactNode;
  /** Called once the close animation has finished; the screen does the actual navigation back. */
  onDismissed: () => void;
  /** How tall the sheet opens at first, as a fraction of the screen. */
  peekFraction?: number;
  /** Bump this number to close the sheet from outside (a Close button, a finished send). */
  closeSignal?: number;
  /** On a computer the sheet is a box sized to its contents (see the .web twin); a phone ignores it. */
  fitContent?: boolean;
  /**
   * How tall its contents are, once known (a ScrollView's content height): a
   * phone's sheet then opens only as tall as its header and that need, never
   * taller than `peekFraction`, so a short sheet has no empty half. The stage
   * ignores it.
   */
  contentHeight?: number;
  /** On a wide computer screen the sheet docks to the right (see the .web twin); a phone ignores it. */
  side?: boolean;
  /** The sheet has come to rest where it was going (first: it has finished opening). */
  onSettled?: () => void;
  /** The comments stage: where its stops are. Opt-in; every other sheet leaves it out. */
  stage?: StageGeo | null;
  /** Drawn on the stage above the sheet, over its tap-to-close area (the small rail). */
  stageOverlay?: React.ReactNode;
  /** Whether the sheet's page is the one in front (a browser's Escape listens only then; a phone's Back is the page's own). */
  active?: boolean;
  /**
   * Asked before a drag down, a tap outside or (in a browser) Escape closes
   * the sheet: false keeps it open (the page then asks its own question,
   * "Discard this group?", and bumps closeSignal if the answer is yes). A
   * close from closeSignal is never asked. The comments stage ignores it.
   */
  beforeClose?: () => boolean;
  /**
   * The page handles Android's Back itself (a step back in a form, say), so
   * the sheet leaves it alone. Without it, Back closes the sheet the way a
   * drag down does: it slides away, and beforeClose is asked first.
   */
  ownBack?: boolean;
}) {
  return props.stage ? <StageSheet {...props} geo={props.stage} /> : <PlainSheet {...props} />;
}

function PlainSheet({
  header,
  children,
  onDismissed,
  peekFraction = 0.66,
  closeSignal = 0,
  onSettled,
  contentHeight,
  beforeClose,
  ownBack = false,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  peekFraction?: number;
  closeSignal?: number;
  onSettled?: () => void;
  contentHeight?: number;
  beforeClose?: () => boolean;
  ownBack?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // A sliver of the page behind stays visible even fully "open" — the depth
  // cue Apple's own card sheets use instead of ever truly covering the screen.
  const fullHeight = Math.max(1, windowHeight - insets.top - 20);
  const peekHeight = Math.min(fullHeight, Math.round(windowHeight * peekFraction));
  // Fitted to a short sheet's contents once they are measured (contentHeight).
  const [headH, setHeadH] = useState(0);
  const fitted = contentHeight && headH ? Math.min(peekHeight, Math.round(headH + contentHeight + insets.bottom)) : peekHeight;
  const openOffset = fullHeight - fitted;
  // Once a finger (or the keyboard) has moved it, the sheet stays where it was put.
  const touched = useRef(false);

  // Distance the sheet's TOP edge sits below where "fully open" would put it:
  // 0 = open all the way, openOffset = the height it starts at, fullHeight = gone.
  // The sheet is drawn as a card of height (fullHeight − translateY) pinned to
  // the bottom edge, rather than a full-height card slid down — so the bottom
  // of its body (a comment box, a send button) is always on screen.
  const translateY = useSharedValue(fullHeight);
  const backdropOpacity = useSharedValue(0);
  const dismissedRef = useRef(false);
  const latestSettled = useRef(onSettled);
  latestSettled.current = onSettled;
  const settled = () => latestSettled.current?.();

  // Where the sheet was last sent to rest (its top edge), so a change in its
  // contents moves it only when that place really changes.
  const restAt = useRef(openOffset);
  useEffect(() => {
    // Settled however the opening ends: at rest, or cut short by the keyboard
    // taking it up ("Add a comment") or a finger on the handle.
    restAt.current = openOffset;
    translateY.value = withSpring(openOffset, SPRING, () => { runOnJS(settled)(); });
    backdropOpacity.value = withTiming(1, { duration: 260, easing: EASE });
    // Only the opening height depends on these; re-running on resize would
    // fight a drag in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The contents measured after the opening began: it settles at their height
  // instead, both ways. Contents that grow later (a list that arrives after
  // the first layout: who joined through your invite, a post that was still
  // loading) take it back up again, as far as the peek height, so a sheet
  // that first fitted a short page is never left stuck short. The browser's
  // twin measures again on every change for the same reason.
  useEffect(() => {
    if (touched.current || dismissedRef.current || openOffset === restAt.current) return;
    restAt.current = openOffset;
    translateY.value = withSpring(openOffset, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted]);

  const finish = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismissed();
  };
  const dismiss = () => {
    // The keyboard (a search or comment box in the sheet) goes down with the
    // sheet, not after it: the page it uncovers is then already at rest.
    Keyboard.dismiss();
    translateY.value = withTiming(fullHeight, { duration: 230, easing: EASE_OUT_OF_VIEW }, (done) => {
      if (done) runOnJS(finish)();
    });
    backdropOpacity.value = withTiming(0, { duration: 210, easing: EASE });
  };
  const openFull = () => {
    touched.current = true;
    translateY.value = withSpring(0, SPRING);
    backdropOpacity.value = withTiming(1, { duration: 240, easing: EASE });
  };
  const returnTo = (origin: number) => {
    touched.current = true;
    translateY.value = withSpring(origin, SPRING);
    backdropOpacity.value = withTiming(1 - origin / fullHeight, { duration: 220, easing: EASE });
  };
  // A close the person started (a drag down, a tap outside): the page may say not yet.
  const latestBefore = useRef(beforeClose);
  latestBefore.current = beforeClose;
  const userDismiss = (origin?: number) => {
    if (latestBefore.current && !latestBefore.current()) {
      if (origin !== undefined) returnTo(origin);
      return;
    }
    dismiss();
  };
  // Android's Back, while this sheet's page is in front: the same close as a
  // drag down (it slides away, the page's own question first, and onDismissed
  // then leaves the page), rather than the page vanishing in one frame.
  useAndroidBack(() => { if (!dismissedRef.current) userDismiss(); return true; }, !ownBack);
  // The keyboard: the sheet opens all the way, and its bottom rides up with
  // the keyboard frame by frame (the phone reports its height as it moves),
  // so a box at the bottom stays right on top of it, never jumping after it.
  const keyboard = useAnimatedKeyboard();
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, () => openFull());
    return () => { show.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHeight]);

  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  const startY = useSharedValue(0);
  const markTouched = () => { touched.current = true; };
  const pan = Gesture.Pan()
    .onStart(() => {
      'worklet';
      startY.value = translateY.value;
      runOnJS(markTouched)();
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.max(0, Math.min(fullHeight, startY.value + e.translationY));
      translateY.value = next;
      backdropOpacity.value = 1 - next / fullHeight;
    })
    .onEnd((e) => {
      'worklet';
      const origin = startY.value;
      const travelled = translateY.value - origin;
      if (e.velocityY > FLICK_PX_PER_S || (travelled > 0 && travelled > (fullHeight - origin) * 0.32)) {
        runOnJS(userDismiss)(origin);
      } else if (e.velocityY < -FLICK_PX_PER_S || (travelled < 0 && Math.abs(travelled) > origin * 0.32)) {
        runOnJS(openFull)();
      } else {
        runOnJS(returnTo)(origin);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: Math.max(0, fullHeight - translateY.value) }));
  // Clear of the home bar when the keyboard is down; on top of the keyboard when it is up.
  const bodyStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => userDismiss()} />
      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* The same warm glow the pages open with, so a sheet reads as part of the app. */}
        <Wash height={300} strength={0.85} />
        <GestureDetector gesture={pan}>
          <View style={styles.handle} onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (h !== headH) setHeadH(h); }}>
            <View style={styles.grabber} />
            {header}
          </View>
        </GestureDetector>
        <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

/** Spring and timing settings for the stage; the Reduce Motion path is chosen by hand, so these always run. */
const RELEASE = { damping: 28, stiffness: 260, mass: 0.9, reduceMotion: ReduceMotion.Never } as const;
const STAGE_SPRING = { ...SPRING, reduceMotion: ReduceMotion.Never } as const;
const SNAP_REDUCED = { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never } as const;

/**
 * The comments stage's sheet: the clip it is about stays playing above it,
 * shrunk into the room left (Home moves it, from the same number). Three
 * stops: closed, half (the clip on its stage) and full (the clip squeezed out
 * of the way). No dim behind it; the stage itself is the close target, and a
 * drag on it moves the sheet as a drag on the header does.
 *
 * Its position is `stageTop`, the sheet's top edge in window points. Home
 * sets it at the bottom edge at the tap; the sheet starts the rise once it has
 * drawn and owns it from there.
 */
function StageSheet({
  header,
  children,
  onDismissed,
  closeSignal = 0,
  onSettled,
  geo,
  stageOverlay,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  onDismissed: () => void;
  closeSignal?: number;
  onSettled?: () => void;
  geo: StageGeo;
  stageOverlay?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { H, yh, yf } = geo;
  const sheetH = H - yh;
  const keyboard = useAnimatedKeyboard();

  // A drag's starting point; whether the keyboard (not the person) took the
  // sheet up to full, so its going away brings the sheet back to half;
  // whether the sheet is on its way out (nothing else may move it then).
  const startY = useSharedValue(0);
  const raisedByKeyboard = useSharedValue(false);
  const closing = useSharedValue(false);
  // Reduce Motion: the card fades in and out rather than travelling, and
  // holds its height while it fades out.
  const card = useSharedValue(reduced ? 0 : 1);
  const heldAt = useSharedValue(-1);
  const dismissedRef = useRef(false);
  const latestDismissed = useRef(onDismissed);
  latestDismissed.current = onDismissed;
  // Gone (closed, or its stage taken down): it no longer catches a single
  // touch, even in the moment before the page has left.
  const [over, setOver] = useState(false);
  const finish = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setOver(true);
    latestDismissed.current();
  };
  // The stage this sheet took on was taken down under it (the feed gave up
  // on it, or it ended some other way): there is nothing left to close, so
  // the page goes at once rather than sitting over the feed, untouchable.
  useEffect(() => onStageChange(() => {
    const now = getStage();
    if (now && now.geo === geo && !now.ending) return;
    if (closing.value) return;
    closing.value = true;
    finish();
  }), [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  // The rise starts the moment the sheet has drawn, before the screen
  // shows it: the clip shrinks as the sheet comes up under it, as one move,
  // rather than over an empty black stage while the comments are still being
  // drawn. (Home has the page at rest, stageTop at the bottom edge, from the tap.)
  // Reduce Motion: the page dips out, the sheet is at half unseen, and the
  // card fades in as the page fades back. Nothing travels or shrinks.
  useLayoutEffect(() => {
    if (reduced) {
      stageDip.value = withSequence(withTiming(0, { duration: 100, reduceMotion: ReduceMotion.Never }), withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never }));
      stageTop.value = withDelay(100, withTiming(yh, { duration: 0, reduceMotion: ReduceMotion.Never }));
      card.value = withDelay(100, withTiming(1, { duration: 200, reduceMotion: ReduceMotion.Never }));
    } else {
      stageTop.value = withSpring(yh, OPEN_SPRING);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened: told once, the first time the sheet reaches a stop (half, or
  // full if a finger took it straight up before it got to half).
  const latestSettled = useRef(onSettled);
  latestSettled.current = onSettled;
  const settled = () => latestSettled.current?.();
  const arrived = useSharedValue(false);
  useAnimatedReaction(() => stageTop.value, (y) => {
    if (arrived.value || (Math.abs(y - yh) > 1 && Math.abs(y - yf) > 1)) return;
    arrived.value = true;
    runOnJS(settled)();
  }, [yh, yf]);

  /** One way out for ×, a tap on the stage, Back, the screen reader's escape: the clip lands softly back to full size. */
  const closeStage = () => {
    if (closing.value) return;
    closing.value = true;
    raisedByKeyboard.value = false;
    // Whatever happens to the animation, the page is not left open behind it.
    setTimeout(finish, (reduced ? 240 : CLOSE_MS) + 200);
    if (reduced) {
      heldAt.value = stageTop.value;
      card.value = withTiming(0, { duration: 200, reduceMotion: ReduceMotion.Never });
      stageDip.value = withSequence(withTiming(0, { duration: 100, reduceMotion: ReduceMotion.Never }), withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never }));
      stageTop.value = withDelay(100, withTiming(H, { duration: 0, reduceMotion: ReduceMotion.Never }));
      setTimeout(finish, 240);
      return;
    }
    stageTop.value = withTiming(H, { duration: CLOSE_MS, easing: STAGE_EASING, reduceMotion: ReduceMotion.Never }, (done) => { if (done) runOnJS(finish)(); });
  };
  const toStop = (target: number) => {
    setFull(target === yf);
    stageTop.value = reduced ? withTiming(target, SNAP_REDUCED) : withSpring(target, STAGE_SPRING);
  };

  // The keyboard takes the sheet up to full and the clip fades out as it
  // goes; when it goes away the sheet comes back to half and the clip grows
  // back, still playing. A sheet the person pulled to full stays there.
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      if (closing.value || stageTop.value <= yf + 1) return;
      raisedByKeyboard.value = true;
      toStop(yf);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      if (closing.value || !raisedByKeyboard.value) return;
      raisedByKeyboard.value = false;
      toStop(yh);
    });
    return () => { show.remove(); hide.remove(); };
  }, [yh, yf]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeCount = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal === closeCount.current) return;
    closeCount.current = closeSignal;
    closeStage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSignal]);

  // A tap on the stage steps back one place, never further: the keyboard
  // goes first (a stray tap never throws away a half-written comment), then
  // full comes down to half, then half closes. Not while the sheet is still
  // rising: the second tap of a quick double tap on the words lands here,
  // and would close what the first one opened.
  const tapStage = () => {
    if (closing.value || !arrived.value) return;
    if (Keyboard.isVisible()) { Keyboard.dismiss(); return; }
    if (stageTop.value < (yh + yf) / 2) { toStop(yh); return; }
    closeStage();
  };
  const dismissKeyboard = () => Keyboard.dismiss();

  // Letting go: where the sheet would coast to (a fifth of a second at the
  // finger's speed) and how fast it was going decide the stop. From half, a
  // short pull is not enough to close or to open all the way; from full, a
  // pull down comes to half, and it takes a hard flick or a long pull to close.
  const closeSoon = () => { setTimeout(finish, 900); };
  const release = (vY: number) => {
    'worklet';
    if (closing.value) return;
    const y = stageTop.value;
    const proj = y + 0.18 * vY;
    const fromHalf = startY.value >= (yh + yf) / 2;
    let target = yh;
    if (fromHalf) {
      if (vY >= 800 || proj - yh > 0.3 * sheetH) target = H;
      else if (vY <= -700 || yh - proj > 0.25 * (yh - yf)) target = yf;
    } else if (vY >= 2000 || proj > yh + 0.4 * sheetH) target = H;
    // From full, any pull down comes to half (the keyboard put away, the clip
    // back in view); only a pull up past full, or one that came back to the top, stays.
    else if (proj <= yf + 0.5) target = yf;
    if (target === H) {
      closing.value = true;
      runOnJS(closeSoon)();
      const done = (finished?: boolean) => { 'worklet'; if (finished) runOnJS(finish)(); };
      stageTop.value = reduced
        ? withTiming(H, SNAP_REDUCED, done)
        : withSpring(H, { ...RELEASE, velocity: vY, overshootClamping: true }, done);
      return;
    }
    runOnJS(setFull)(target === yf);
    stageTop.value = reduced ? withTiming(target, SNAP_REDUCED) : withSpring(target, { ...RELEASE, velocity: vY });
  };
  const dragStart = () => {
    'worklet';
    if (closing.value) return;
    startY.value = stageTop.value;
    raisedByKeyboard.value = false;
    runOnJS(dismissKeyboard)();
  };
  // 1:1 with the finger between full and closed; past full it gives, a little and less.
  const dragTo = (translationY: number) => {
    'worklet';
    if (closing.value) return;
    const y = startY.value + translationY;
    stageTop.value = Math.min(H, y < yf ? yf - Math.min(24, (yf - y) * 0.33) : y);
  };

  // Made once: the sheet re-draws as you type, and a drag must not be re-made under a finger.
  const { headerPan, stageZone, drag } = useMemo(() => {
    const headerPan = Gesture.Pan()
      .onStart(() => { 'worklet'; dragStart(); })
      .onUpdate((e) => { 'worklet'; dragTo(e.translationY); })
      .onEnd((e) => { 'worklet'; release(e.velocityY); });
    const stagePan = Gesture.Pan()
      .activeOffsetY([-8, 8])
      .failOffsetX([-24, 24])
      .onStart(() => { 'worklet'; dragStart(); })
      .onUpdate((e) => { 'worklet'; dragTo(e.translationY); })
      .onEnd((e) => { 'worklet'; release(e.velocityY); });
    const stageTap = Gesture.Tap().maxDistance(10).onEnd((_e, success) => { 'worklet'; if (success) runOnJS(tapStage)(); });
    // The list's pull down at its top (see comments) is this same drag.
    const drag: SheetDrag = { start: dragStart, to: dragTo, release };
    return { headerPan, stageZone: Gesture.Exclusive(stagePan, stageTap), drag };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sheetStyle = useAnimatedStyle(() => ({ height: Math.max(0, H - (heldAt.value >= 0 ? heldAt.value : stageTop.value)), opacity: card.value }));
  // Clear of the home bar when the keyboard is down; on top of the keyboard when it is up.
  const bodyStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, insets.bottom) }));

  return (
    <DragSheetContext.Provider value={drag}>
      {/* VoiceOver keeps to this layer (the stage's close, the small rail, the sheet), never the feed under it. */}
      <View style={StyleSheet.absoluteFill} pointerEvents={over ? 'none' : 'box-none'} accessibilityViewIsModal onAccessibilityEscape={closeStage}>
        {/* The stage: a tap steps back one place, a drag moves the sheet. A screen reader hears one button. */}
        <GestureDetector gesture={stageZone}>
          <View
            style={StyleSheet.absoluteFill}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            accessibilityHint="The clip keeps playing"
            onAccessibilityTap={tapStage}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') tapStage(); }}
          />
        </GestureDetector>
        {stageOverlay}
        <Animated.View style={[styles.sheet, styles.stageSheet, sheetStyle]}>
          <Wash height={300} strength={0.85} />
          <GestureDetector gesture={headerPan}>
            <View style={[styles.handle, styles.stageHandle]}>
              <View style={styles.grabber} />
              {header}
            </View>
          </GestureDetector>
          <Animated.View style={[styles.body, bodyStyle]}>{children}</Animated.View>
        </Animated.View>
      </View>
    </DragSheetContext.Provider>
  );
}

const styleDefinitions = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: -10 }, elevation: 16,
  },
  // On the stage the sheet sits on black, not on a dimmed page: a hairline
  // edge keeps the dark themes' sheets (Night, New York) reading as a card,
  // and no shadow darkens the bottom of the clip just above it.
  stageSheet: {
    borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowOpacity: 0, elevation: 0,
  },
  handle: { paddingTop: 10, gap: 10 },
  // The grab strip is a full 60pt: an easy thing to catch with a thumb.
  stageHandle: { minHeight: 60 },
  grabber: { width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong, alignSelf: 'center' },
  body: { flex: 1, minHeight: 0 },
});
