import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useResponsive } from '@/lib/useResponsive';
import { isPageSwipeLocked, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';
import { activationDistance, claimedDepth, waitsForDeeper } from '@/features/navigation/gestureClaim';

/**
 * Drag-to-swipe between pages on the phone.
 *
 * The finger is tracked and the page moved entirely on the UI thread, so the
 * swipe stays glued to the finger even while JavaScript is busy rendering.
 * JavaScript only hears from the gesture at three moments: when it starts (to
 * mount the preview), when it is known to be going through, and when it lands.
 */
export function SwipeSurface({ children, onSwipe, onCommit, onDragTo, onProgress, enabled: requestedEnabled = true, fill = true, renderPreview, delegateRight = false, delegateLeft = false, settledKey, progress: progressValue, depth = 1 }: {
  children: React.ReactNode; onSwipe: (direction: 1 | -1) => void;
  /** Fires the instant the gesture is known to be going through, before the animation. */
  onCommit?: (direction: 1 | -1) => void;
  /** Fires while the finger is still down, or with null when the drag is abandoned. */
  onDragTo?: (direction: 1 | -1 | null) => void;
  /** -1..1, positive toward the next page; fires per move and on settle. */
  onProgress?: (fraction: number) => void;
  delegateLeft?: boolean; delegateRight?: boolean; enabled?: boolean; fill?: boolean; renderPreview?: (direction: 1 | -1) => React.ReactNode;
  /**
   * Something that changes once the destination has actually rendered (the
   * route, the section). The outgoing page is held in place until then, so
   * a slow destination never flashes the old page back for a frame.
   */
  settledKey?: string;
  /** Written on the animation thread as the finger moves: -1..1 toward the next page. */
  progress?: SharedValue<number>;
  /** How deep this sits: 1 for a section swipe inside a tab, 2 for one inside that. Deeper wins. */
  depth?: 1 | 2;
}) {
  const { isPhone } = useResponsive();
  const enabled = requestedEnabled && isPhone;

  const offset = useSharedValue(0);
  const width = useSharedValue(1);
  const busy = useSharedValue(false);
  const locked = useSharedValue(false);
  // What this render allows, readable from the UI thread.
  const canNext = !renderPreview || !!renderPreview(1);
  const canPrev = !renderPreview || !!renderPreview(-1);
  const config = useSharedValue({ enabled, delegateLeft, delegateRight, canNext, canPrev, depth });
  useEffect(() => { config.value = { enabled, delegateLeft, delegateRight, canNext, canPrev, depth }; }, [enabled, delegateLeft, delegateRight, canNext, canPrev, depth, config]);
  useEffect(() => {
    locked.value = isPageSwipeLocked();
    return subscribePageSwipeLock(() => { locked.value = isPageSwipeLocked(); });
  }, [locked]);

  const [direction, setDirection] = useState<1 | -1>(1);
  const [dragging, setDragging] = useState(false);

  // Callbacks the UI thread can reach without re-creating the gesture.
  const latest = React.useRef({ onSwipe, onCommit, onDragTo, onProgress });
  latest.current = { onSwipe, onCommit, onDragTo, onProgress };
  const begin = (next: 1 | -1) => { setPageDragging(true); setDragging(true); setDirection(next); };
  const turn = (next: 1 | -1) => setDirection(next);
  const heading = (next: 1 | -1 | null) => latest.current.onDragTo?.(next);
  const progress = (fraction: number) => latest.current.onProgress?.(fraction);
  const decided = (commit: boolean, next: 1 | -1) => {
    setPageDragging(false);
    if (commit) latest.current.onCommit?.(next);
    else latest.current.onDragTo?.(null);
    latest.current.onProgress?.(commit ? next : 0);
  };
  const release = () => { offset.value = 0; setDragging(false); busy.value = false; };
  const awaiting = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const landed = (commit: boolean, next: 1 | -1) => {
    if (!commit) return release();
    latest.current.onSwipe(next);
    // Hold until the destination has rendered (settledKey changes), with a
    // ceiling so a page that never changes the key still lets go.
    awaiting.current = setTimeout(() => { awaiting.current = null; release(); }, 700);
  };
  useEffect(() => {
    if (!awaiting.current) return;
    clearTimeout(awaiting.current);
    awaiting.current = null;
    release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledKey]);

  // Shared values, not plain variables: a worklet only ever sees a frozen copy
  // of a plain variable, so the touch-down point would never reach touch-move.
  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const startY = useSharedValue(0);
  const lastDirection = useSharedValue(0);
  const pan = useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        const touch = e.allTouches[0];
        if (!touch) return;
        startX.value = touch.x;
        armed.value = false;
        startY.value = touch.y;
        lastDirection.value = 0;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        const touch = e.allTouches[0];
        if (!touch) return;
        const dx = touch.x - startX.value;
        const dy = touch.y - startY.value;
        const c = config.value;
        if (Math.abs(dx) > activationDistance(c.depth) && Math.abs(dx) > Math.abs(dy) * 1.4) {
          const handedOff = (c.delegateRight && dx > 0) || (c.delegateLeft && dx < 0);
          // A deeper surface that already owns this finger keeps it.
          if (!c.enabled || locked.value || busy.value || handedOff || claimedDepth.value > c.depth + 1) state.fail();
          else if (waitsForDeeper(c.depth) && !armed.value) armed.value = true;
          else { claimedDepth.value = c.depth + 1; state.activate(); }
        } else if (Math.abs(dy) > 12) {
          state.fail();
        }
      })
      .onStart((e) => {
        'worklet';
        const next: 1 | -1 = e.translationX < 0 ? 1 : -1;
        lastDirection.value = next;
        runOnJS(begin)(next);
      })
      .onUpdate((e) => {
        'worklet';
        const next: 1 | -1 = e.translationX < 0 ? 1 : -1;
        const c = config.value;
        const available = next === 1 ? c.canNext : c.canPrev;
        if (next !== lastDirection.value) {
          lastDirection.value = next;
          runOnJS(turn)(next);
          runOnJS(heading)(available ? next : null);
        }
        // Past the end of the line the page still gives a little, so a swipe
        // that goes nowhere still feels like it was heard.
        const dx = available ? e.translationX : e.translationX * 0.16;
        offset.value = dx;
        if (progressValue) progressValue.value = -dx / width.value;
        else runOnJS(progress)(-dx / width.value);
      })
      .onEnd((e) => {
        'worklet';
        const dx = e.translationX;
        const next: 1 | -1 = dx < 0 ? 1 : -1;
        const c = config.value;
        const available = next === 1 ? c.canNext : c.canPrev;
        const flick = Math.abs(dx) > 28 && Math.abs(e.velocityX) > 350 && Math.sign(dx) === Math.sign(e.velocityX);
        const commit = available && c.enabled && (Math.abs(dx) > width.value * 0.28 || flick);
        busy.value = true;
        runOnJS(decided)(commit, next);
        if (progressValue) progressValue.value = withTiming(commit ? next : 0, { duration: commit ? 220 : 170, easing: Easing.bezier(0.22, 0.61, 0.36, 1) });
        offset.value = withTiming(
          commit ? -next * width.value : 0,
          { duration: commit ? 220 : 170, easing: Easing.bezier(0.22, 0.61, 0.36, 1) },
          (finished) => { if (finished) runOnJS(landed)(commit, next); },
        );
      })
      .onFinalize((_e, success) => {
        'worklet';
        if (claimedDepth.value === config.value.depth + 1) claimedDepth.value = 0;
        // A gesture that failed before it ever started needs no settling; one
        // cancelled mid-drag springs back so the page is never left half way.
        if (!success && !busy.value) {
          runOnJS(decided)(false, lastDirection.value === -1 ? -1 : 1);
          if (offset.value !== 0) {
            busy.value = true;
            offset.value = withTiming(0, { duration: 160, easing: Easing.bezier(0.22, 0.61, 0.36, 1) }, (finished) => {
              if (finished) runOnJS(landed)(false, 1);
            });
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const previewStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const preview = dragging ? renderPreview?.(direction) : null;

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(event) => { width.value = event.nativeEvent.layout.width; }} style={{ flex: fill ? 1 : undefined, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: fill ? 1 : undefined }, pageStyle]}>{children}</Animated.View>
        {preview ? (
          <Animated.View pointerEvents="none" accessibilityElementsHidden style={[{ position: 'absolute', top: 0, bottom: 0, width: '100%', left: `${direction * 100}%` }, previewStyle]}>
            {preview}
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
