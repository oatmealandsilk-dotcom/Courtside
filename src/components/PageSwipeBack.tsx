import React, { useEffect, useMemo, useRef } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
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
 * edge stays the system's edge swipe. The page follows the finger (a
 * transform, never its opacity, so the glass over it stays glass); let go
 * past a third of the way, or with a flick, and it slides off and goes back;
 * sooner, and it eases back into place. While `standDown` is true (a row is
 * slid open) the page leaves every drag to the rows. Android keeps its own
 * back gesture: nothing changes there either.
 */
export function PageSwipeBack({ children, onBack, standDown }: { children: React.ReactNode; onBack: () => void; standDown?: SharedValue<boolean> }) {
  if (!OLD_IOS) return <>{children}</>;
  return <DragBack onBack={onBack} standDown={standDown}>{children}</DragBack>;
}

/**
 * Spread onto a strip that scrolls sideways inside the page (who is up to hit
 * today): a drag on it is the strip's, never the page's. Only older iPhones
 * need it; elsewhere it is empty.
 */
export const pageSwipeStrip = OLD_IOS
  ? { onTouchStart: () => lockPageSwipe(true), onTouchEnd: () => lockPageSwipe(false), onTouchCancel: () => lockPageSwipe(false) }
  : {};

function DragBack({ children, onBack, standDown }: { children: React.ReactNode; onBack: () => void; standDown?: SharedValue<boolean> }) {
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

  const latest = useRef(onBack);
  latest.current = onBack;
  const dragging = useRef(false);
  const left = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    if (dragging.current) setPageDragging(false);
  }, []);

  const pan = useMemo(() => {
    const began = () => { dragging.current = true; setPageDragging(true); };
    const go = () => {
      if (left.current) return;
      left.current = true;
      latest.current();
      // Still here (nowhere it could go): the page comes back.
      timers.current.push(setTimeout(() => {
        // Gone from the stack already, only not yet unmounted: stays off.
        if (!navigation.isFocused()) return;
        left.current = false;
        leaving.value = false;
        x.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.25, 1) });
      }, 600));
    };
    const letGo = (commit: boolean, ms: number) => {
      dragging.current = false;
      setPageDragging(false);
      if (!commit) return;
      left.current = false;
      // The page has already slid off with the finger: the stack's own slide would only repeat it.
      navigation.setOptions({ animation: 'none' });
      // Whatever happens to the slide, the page is not left half gone.
      timers.current.push(setTimeout(go, ms + 200));
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
          if (fromEdge.value || leaving.value || locked.value || stand.value) state.fail();
          else state.activate();
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
        x.value = Math.max(0, e.translationX);
      })
      .onEnd((e, success) => {
        'worklet';
        const at = x.value;
        const w = width.value;
        const commit = success && (at > w * COMMIT_AT || (e.velocityX > FLICK && at > 30));
        if (commit) {
          leaving.value = true;
          const ms = Math.max(140, Math.min(260, (w - at) / Math.max(e.velocityX / 1000, 1.4)));
          runOnJS(letGo)(true, ms);
          x.value = withTiming(w, { duration: ms, easing: Easing.bezier(0.2, 0.8, 0.25, 1) }, () => { runOnJS(go)(); });
        } else {
          runOnJS(letGo)(false, 0);
          x.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.25, 1) });
        }
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
