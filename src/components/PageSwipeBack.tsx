import React, { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useNavigation } from 'expo-router';

import { isPageSwipeLocked, lockPageSwipe, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';

/**
 * iPhones before iOS 26 only go back from the screen's left edge; from 26 on,
 * the system's own swipe goes back from anywhere on the page. Read once: a
 * phone's iOS does not change while the app is open.
 */
const OLD_IOS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 26;

/** How far a finger travels before the page decides whether a drag is its own (past a row's 10). */
const SLOP = 12;
/** A drag that starts this close to the left edge is the system's own edge swipe, left alone. */
const EDGE = 28;
/** Let go past this share of the width (or flicked), and the page goes back. */
const COMMIT_AT = 0.35;
/** A flick this fast (points per second) toward the right goes back however short. */
const FLICK = 450;
/**
 * How far the page itself moves under the finger, at most. Before iOS 26 the
 * page below a pushed page is taken off screen, so dragging further would
 * only uncover a plain background; once the drag goes back, the stack's own
 * slide takes the page off with the real page below showing.
 */
const PULL = 60;

interface PageSwipeBackProps {
  children: React.ReactNode;
  onBack: () => void;
  /** While true (a row slid open, the hold menu up) the page leaves every drag alone. */
  standDown?: SharedValue<boolean>;
  /** A rightward drag the page left alone because of `standDown`: shut the open row, say. */
  onStandDown?: () => void;
}

/**
 * A page that goes back when dragged to the right from anywhere on it, not
 * just from the screen's left edge (Oct 22, the Messages inbox).
 *
 * On iOS 26 and later the native stack does the dragging itself: a stack
 * page already goes back from a rightward drag anywhere on it (the system's
 * own content swipe, on by default in react-native-screens), with the page
 * underneath showing. All this needs there is that nothing on the page takes
 * a rightward drag first (SwipeRow lets go of one), so this adds nothing.
 *
 * Older iPhones (Oct 23, owner: "Build every iPhone") get the app's own
 * version, the browser's (PageSwipeBack.web.tsx) done with Gesture Handler:
 * the stack's full-screen option there is a pan that also starts on leftward
 * drags and would steal a row's swipe to Mute/Delete, so it stays off. Only a
 * drag that is clearly sideways and to the right is taken; leftward ones stay
 * the rows', up-and-down ones the list's, and one that starts at the left
 * edge stays the system's edge swipe. The page leans with the finger, up to
 * PULL (a transform, never its opacity, so the glass over it stays glass);
 * let go past a third of the way, or with a flick, and it goes back with the
 * stack's own slide, the page below showing; sooner, and it eases back into
 * place. While `standDown` is true (a row slid open, the hold menu up) the
 * page leaves every drag alone, and a rightward one calls `onStandDown`.
 * The keyboard goes down as the drag starts. Android keeps its own
 * back gesture: nothing changes there either.
 */
export function PageSwipeBack({ children, onBack, standDown, onStandDown }: PageSwipeBackProps) {
  if (!OLD_IOS) return <>{children}</>;
  return <DragBack onBack={onBack} standDown={standDown} onStandDown={onStandDown}>{children}</DragBack>;
}

/**
 * Spread onto a strip that scrolls sideways inside the page (who is up to hit
 * today): a drag on it is the strip's, never the page's. Only older iPhones
 * need it; elsewhere it is empty.
 */
export const pageSwipeStrip = OLD_IOS
  ? { onTouchStart: () => lockPageSwipe(true), onTouchEnd: () => lockPageSwipe(false), onTouchCancel: () => lockPageSwipe(false) }
  : {};

function DragBack({ children, onBack, standDown, onStandDown }: PageSwipeBackProps) {
  const navigation = useNavigation();
  const x = useSharedValue(0);
  const width = useSharedValue(Dimensions.get('window').width);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const fromEdge = useSharedValue(false);
  const leaving = useSharedValue(false);
  const locked = useSharedValue(isPageSwipeLocked());
  const none = useSharedValue(false);
  const stand = standDown ?? none;
  useEffect(() => {
    locked.value = isPageSwipeLocked();
    return subscribePageSwipeLock(() => { locked.value = isPageSwipeLocked(); });
  }, [locked]);

  const latest = useRef({ onBack, onStandDown });
  latest.current = { onBack, onStandDown };
  const dragging = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (dragging.current) setPageDragging(false);
  }, []);

  const pan = useMemo(() => {
    const began = () => {
      dragging.current = true;
      setPageDragging(true);
      // The keyboard lives in its own window and would stay put while the page moves: down it goes now, as with the system's swipe.
      Keyboard.dismiss();
    };
    const stoodDown = () => latest.current.onStandDown?.();
    const letGo = (commit: boolean) => {
      dragging.current = false;
      setPageDragging(false);
      if (!commit) return;
      // The stack's own slide takes the page off, with the page below showing under it.
      latest.current.onBack();
      // Still here (nowhere it could go): ready for the next drag.
      timers.current.push(setTimeout(() => {
        if (navigation.isFocused()) leaving.value = false;
      }, 600));
    };
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e, state) => {
        'worklet';
        if (e.state === State.ACTIVE) return;
        // A second finger before the page has the drag: not a back swipe.
        if (e.numberOfTouches > 1) { state.fail(); return; }
        const t = e.changedTouches[0];
        if (!t) return;
        sx.value = t.absoluteX;
        sy.value = t.absoluteY;
        fromEdge.value = t.absoluteX < EDGE;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        if (e.state === State.ACTIVE) return;
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.absoluteX - sx.value;
        const dy = t.absoluteY - sy.value;
        if (dx > SLOP && dx > Math.abs(dy) * 1.4) {
          if (fromEdge.value || leaving.value || locked.value) state.fail();
          else if (stand.value) {
            // A row is slid open (or the hold menu is up): not a way back, but it does shut the open row, as iOS does.
            state.fail();
            runOnJS(stoodDown)();
          } else state.activate();
        } else if (Math.abs(dy) > SLOP || dx < -SLOP) {
          state.fail();
        }
      })
      .onStart(() => {
        'worklet';
        runOnJS(began)();
      })
      .onUpdate((e) => {
        'worklet';
        // Follows the finger at first, then less and less, never past PULL.
        const t = Math.max(0, e.translationX);
        x.value = PULL * (1 - Math.exp(-t / PULL));
      })
      .onEnd((e, success) => {
        'worklet';
        const travel = Math.max(0, e.translationX);
        const commit = success && (travel > width.value * COMMIT_AT || (e.velocityX > FLICK && travel > 30));
        if (commit) leaving.value = true;
        runOnJS(letGo)(commit);
        // Back into place; on a commit, while the stack slides the page off (an ease like its own, so the two never pull against each other).
        x.value = withTiming(0, { duration: commit ? 320 : 240, easing: Easing.bezier(0.2, 0.8, 0.25, 1) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // At rest (and on the first render) the page is in place: a stale settled value can only ever put it back there.
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={styles.fill} onLayout={(event) => { width.value = event.nativeEvent.layout.width; }}>
        <Animated.View style={[styles.fill, moved]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
