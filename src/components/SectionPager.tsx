import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { PAGE_GUTTER, activationDistance, claimedDepth, waitsForDeeper } from '@/features/navigation/gestureClaim';
import { isPageSwipeLocked, sectionPan, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';
import { useResponsive } from '@/lib/useResponsive';
import { useTabActive } from '@/features/navigation/tabFocus';
import { SwipeArea } from '@/features/navigation/swipePress';

const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);
/** How far in from the left edge a touch counts as the phone's own back swipe (iOS takes about this much). */
const BACK_EDGE = 24;
/** How fast a flick has to be (points a second) to turn the page however short it was. */
const FLICK = 350;
/**
 * The settle after a swipe: a spring that carries on at the finger's own
 * speed and comes to rest on the page without bouncing past it (a bounce
 * would show the gutter and the next pane's edge).
 */
const SETTLE = { stiffness: 420, damping: 41, mass: 1, overshootClamping: true } as const;

/**
 * Sections inside a tab (Discussions / Find Players, Posts / Clips / Tagged)
 * or a page (Archive's Instants / Posts),
 * kept mounted side by side and slid between on the animation thread — the
 * same idea as the tab row, one level down. Nothing is built mid-drag, so
 * there is nothing to hitch on landing.
 *
 * Each pane is a whole page, as wide as the row and clipped to itself, with
 * a narrow gutter of page background between neighbours, so two panes never
 * run into each other mid-swipe. On a page with side margins (`bleed`) the
 * row reaches out to the screen's edges and each pane takes the margin back
 * inside itself, so a pane slides off the edge of the screen, the way iOS
 * pages do, rather than being cut short a margin in from it.
 *
 * Let go, the row always springs to a whole pane: a flick goes on to the
 * next one, anything else goes to whichever pane is more than half in view.
 *
 * The pane on show sets the height; the neighbours ride alongside it, clipped
 * to that height until they land. Settled, the page ends where the pane on
 * show ends: a short Discussions next to a long Find Players used to leave
 * room to scroll on into nothing (Oct 2, William: "it should be like a
 * bottom to the page"). While a swipe or a glide is under way the strip is
 * as tall as the tallest, so the pane coming in is never cut off. A swipe past the first or last pane is
 * handed up to the tab row when `delegateLeft` / `delegateRight` say so,
 * otherwise the row gives a little and springs back.
 */
export function SectionPager({ index, panes, onIndex, onLand, progress, depth = 1, delegateLeft = false, delegateRight = false, fill = false, edgeBack = false, bleed = 0, blocked }: {
  index: number;
  panes: React.ReactNode[];
  onIndex: (next: number) => void;
  /**
   * A worklet run on the animation thread the moment the row comes to rest on
   * a pane, before anything else changes: a page that shares one scroller
   * between its panes moves it there in the same frame (Community), so the
   * pane that came in never jumps on landing. Run for every pane change, a
   * swipe's, a tapped tab's and one asked for while off screen. Keep it stable.
   */
  onLand?: (dest: number) => void;
  /** Written as the finger moves: -1..1 toward the next pane, for an underline to follow. */
  progress?: SharedValue<number>;
  depth?: 1 | 2;
  delegateLeft?: boolean;
  delegateRight?: boolean;
  /**
   * Where page turns asked for by code arrive (see pageSlide). Only the
   * browser's pager listens: this one already glides whenever `index`
   * changes, so a section asked for is the slide.
   */
  slideChannel?: string;
  /**
   * The row fills the height it is given and each pane gets all of it, for
   * panes that are scrollers of their own (Archive). Without it the row is
   * as tall as its tallest pane and the page around it scrolls.
   */
  fill?: boolean;
  /**
   * On a page pushed on top of another: a swipe right that starts at the
   * screen's left edge is the phone's back gesture, on any pane, so the row
   * stands aside for it.
   */
  edgeBack?: boolean;
  /**
   * Only the browser's pager reads this (see SectionPager.web). This one
   * already glides whenever `index` changes, a tapped tab included.
   */
  slideOnTap?: boolean;
  /**
   * The side margin of the page this row sits in. The row reaches out over
   * it to the screen's edges, and each pane puts it back inside itself.
   */
  bleed?: number;
  /**
   * Only the browser's pager reads this (see SectionPager.web). This one
   * already keeps every pane built.
   */
  keepMounted?: boolean;
  /**
   * While true, no swipe starts (Community: the section on show has a pull
   * held open, and turning the page then would leave its disc behind).
   */
  blocked?: SharedValue<boolean>;
}) {
  const { isPhone } = useResponsive();
  const count = panes.length;
  const last = count - 1;
  // The pane width comes from measuring the row; until that lands (and on a
  // phone it has been known not to), the screen width stands in, so the
  // panes are never zero-wide and invisible.
  const { width: screenWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured > 0 ? measured : screenWidth;
  // One pane along: a pane's width and the gutter after it.
  const stride = (width || 1) + PAGE_GUTTER;
  const strideValue = useSharedValue(stride);
  useEffect(() => { strideValue.value = stride; }, [stride, strideValue]);
  const position = useSharedValue(index);
  const [shown, setShown] = useState(index);
  const shownRef = useRef(index);
  // Each pane's own height, and whether the row is moving between panes.
  const [heights, setHeights] = useState<number[]>([]);
  const [moving, setMoving] = useState(false);
  const noteHeight = (i: number, h: number) => setHeights((was) => (was[i] === h ? was : Object.assign([...was], { [i]: h })));
  const locked = useSharedValue(false);
  const config = useSharedValue({ enabled: isPhone, delegateLeft, delegateRight, depth, last, edgeBack, fill });
  useEffect(() => { config.value = { enabled: isPhone, delegateLeft, delegateRight, depth, last, edgeBack, fill }; }, [isPhone, delegateLeft, delegateRight, depth, last, edgeBack, fill, config]);
  useEffect(() => {
    locked.value = isPageSwipeLocked();
    return subscribePageSwipeLock(() => { locked.value = isPageSwipeLocked(); });
  }, [locked]);

  // The underline is drawn at the page's section (`index`) plus `progress`.
  // While a finger moves the row, and while its swipe settles, `progress` is
  // simply where the row is less that section, frame by frame, so the line
  // sits exactly under the row. (It used to be measured from wherever the
  // swipe began, rounded: a swipe started while the last one was still
  // settling put the line a whole tab out, or half way between.)
  const base = useSharedValue(index);
  const driving = useSharedValue(false);
  useAnimatedReaction(() => position.value, (at) => {
    if (driving.value && progress) progress.value = at - base.value;
  });

  // A tap on a tab glides the row; a swipe that already landed there does
  // nothing more; a change while this tab is off screen just jumps.
  const tabActive = useTabActive();
  useEffect(() => {
    if (index === shownRef.current) return;
    shownRef.current = index;
    setShown(index);
    // From here the underline glides by itself (useTabUnderline).
    driving.value = false;
    base.value = index;
    const landing = onLand;
    if (Math.abs(position.value - index) <= 0.01) { if (landing) runOnUI(landing)(index); return; }
    if (fill) {
      // Each pane is a full-height scroller of its own: nothing to unclip or
      // re-measure, so no render here. On screen the row glides; off screen
      // it is simply there, at once, on the animation thread (no frame's
      // wait, so a tab arriving never shows the old pane at its edge).
      const dest = index;
      if (tabActive) {
        position.value = withTiming(dest, { duration: 240, easing: EASE }, (finished) => { if (finished && landing) landing(dest); });
      } else {
        runOnUI(() => {
          'worklet';
          position.value = dest;
          if (progress) progress.value = 0;
          if (landing) landing(dest);
        })();
      }
      return;
    }
    if (tabActive) {
      setMoving(true);
      const dest = index;
      position.value = withTiming(dest, { duration: 240, easing: EASE }, (finished) => {
        if (!finished) return;
        // Moved first, then the clip shrinks to the new pane (setMoving), so the page never clamps.
        if (landing) landing(dest);
        runOnJS(setMoving)(false);
      });
    }
    else {
      // Off screen: same order as the glide. Unclip first and wait a frame so
      // the taller row has committed, then jump, then shrink to the new pane.
      setMoving(true);
      const dest = index;
      requestAnimationFrame(() => runOnUI(() => {
        'worklet';
        position.value = dest;
        if (progress) progress.value = 0;
        if (landing) landing(dest);
        runOnJS(setMoving)(false);
      })());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, position]);

  const latest = useRef(onIndex);
  latest.current = onIndex;
  const land = (dest: number) => {
    driving.value = false;
    base.value = dest;
    shownRef.current = dest;
    setShown(dest);
    if (!fill) setMoving(false);
    latest.current(dest);
  };

  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const settled = useSharedValue(true);
  const startY = useSharedValue(0);
  // Where the finger came down on the screen itself, for the back-swipe edge.
  const startScreenX = useSharedValue(0);
  const startPosition = useSharedValue(0);
  // A sideways drag taken while the page is held (`blocked`, a pull held open): kept from every
  // pager above too, so it never turns the tab instead, and simply ignored. Nothing moves.
  const frozen = useSharedValue(false);
  const landWorklet = onLand;
  const pan = useMemo(() => {
    // Let go (or taken away by the system): spring to a whole pane, never
    // left part way. A flick goes on one pane the way it was flung; anything
    // slower goes to the pane more than half in view.
    const settle = (velocityX: number) => {
      'worklet';
      settled.value = true;
      sectionPan.value = false;
      runOnJS(setPageDragging)(false);
      const c = config.value;
      const at = position.value;
      let dest = Math.round(at);
      if (velocityX < -FLICK) dest = Math.floor(at + 0.001) + 1;
      else if (velocityX > FLICK) dest = Math.ceil(at - 0.001) - 1;
      // Never more than one pane from where the swipe began.
      const from = Math.round(startPosition.value);
      dest = Math.max(0, Math.min(c.last, Math.max(from - 1, Math.min(from + 1, dest))));
      // The pane it is settling on takes taps from now, the way a tapped section's does (the
      // effect above), not only once the spring has finished: that comes about 0.6 s after the
      // finger lifts, the last 0.2 s of it with the page already looking still, and every tap in
      // that time was dropped (Oct 24, owner: "Buttons need to be way more responsive"). Nothing
      // on screen changes: the clip, the landing and onIndex still wait for land().
      runOnJS(setShown)(dest);
      position.value = withSpring(dest, { ...SETTLE, velocity: -velocityX / strideValue.value }, (finished) => {
        if (!finished) return;
        // The page is moved to the pane's own spot in this same frame; only
        // then does the clip take the new pane's height (land), so the page
        // is never clamped to a shorter pane first.
        if (landWorklet) landWorklet(dest);
        runOnJS(land)(dest);
      });
    };
    return Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      startX.value = t.x;
      armed.value = false;
      startY.value = t.y;
      startScreenX.value = t.absoluteX;
      frozen.value = false;
    })
    .onTouchesMove((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.x - startX.value;
      const dy = t.y - startY.value;
      const c = config.value;
      // The direction is decided once, in the first few points: mostly
      // sideways takes the row, anything else is left to the page's scroll.
      if (Math.abs(dx) > activationDistance(c.depth) && Math.abs(dx) > Math.abs(dy) * 1.4) {
        const at = Math.round(position.value);
        const handedOff = (c.delegateRight && dx > 0 && at <= 0) || (c.delegateLeft && dx < 0 && at >= c.last) || (c.edgeBack && dx > 0 && startScreenX.value < BACK_EDGE);
        if (!c.enabled || locked.value || handedOff || claimedDepth.value > c.depth + 1) state.fail();
        else if (blocked && blocked.value) {
          // Held: this pager takes the drag so the tab row above cannot (it stands down for a
          // deeper claim), and moves nothing with it (see onStart and onUpdate).
          frozen.value = true;
          claimedDepth.value = c.depth + 1;
          state.activate();
        }
        else if (waitsForDeeper(c.depth) && !armed.value) armed.value = true;
        else { claimedDepth.value = c.depth + 1; state.activate(); }
      } else if (Math.abs(dy) > 12) {
        state.fail();
      }
    })
    .onStart(() => {
      'worklet';
      if (frozen.value) return;
      // Picking up mid-settle is allowed: the row follows the finger from where it is.
      startPosition.value = position.value;
      settled.value = false;
      driving.value = true;
      sectionPan.value = true;
      runOnJS(setPageDragging)(true);
      // A pane that is a scroller of its own (fill) needs no unclipping: no render at the start of a swipe.
      if (!config.value.fill) runOnJS(setMoving)(true);
    })
    .onUpdate((e) => {
      'worklet';
      if (frozen.value) return;
      const c = config.value;
      let next = startPosition.value - e.translationX / strideValue.value;
      if (next < 0) next = next * 0.25;
      if (next > c.last) next = c.last + (next - c.last) * 0.25;
      position.value = next;
    })
    .onEnd((e) => {
      'worklet';
      if (!settled.value) settle(e.velocityX);
    })
    .onFinalize((e) => {
      'worklet';
      if (claimedDepth.value === config.value.depth + 1) claimedDepth.value = 0;
      frozen.value = false;
      // Cancelled mid-drag with no end: settle here all the same.
      if (!settled.value) settle(e.velocityX);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * strideValue.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setMeasured(w); }} style={{ overflow: 'hidden', alignSelf: 'stretch', marginHorizontal: -bleed, flex: fill ? 1 : undefined, height: !fill && !moving && heights[shown] ? heights[shown] : undefined }}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: fill ? 'stretch' : 'flex-start', width: stride * count - PAGE_GUTTER, flex: fill ? 1 : undefined }, row]}>
          {panes.map((pane, i) => (
            // All panes stay in the row at their own height, so landing never
            // re-lays the panes out (that made fast back-and-forth swiping
            // hitch); only the clip above them takes the shown pane's height.
            // (With `fill`, every pane is simply the row's full height.) Each
            // is clipped to its own page, so nothing in one (a row that runs
            // out to the margin) is ever drawn over its neighbour.
            <View key={i} style={{ width, marginRight: i < last ? PAGE_GUTTER : 0, paddingHorizontal: bleed, overflow: 'hidden' }} pointerEvents={i === shown ? 'auto' : 'none'} onLayout={fill ? undefined : (e) => noteHeight(i, e.nativeEvent.layout.height)}>
              {/* A press in a pane waits a beat before it shows, so a finger that is swiping never dips a card (swipePress). */}
              <SwipeArea on={isPhone}>{pane}</SwipeArea>
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
