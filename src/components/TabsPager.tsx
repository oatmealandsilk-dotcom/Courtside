import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';

import Home from '../../app/(tabs)/index';
import Discuss from '../../app/(tabs)/discuss';
import Coaches from '../../app/(tabs)/coaches';
import Profile from '../../app/(tabs)/profile';
import { TabFocus } from '@/features/navigation/tabFocus';
import { activationDistance, claimedDepth, waitsForDeeper } from '@/features/navigation/gestureClaim';
import { setPendingTab } from '@/features/navigation/pendingTab';
import { requestSection } from '@/features/navigation/swipeOrder';
import { isPageSwipeLocked, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';
import { useResponsive } from '@/lib/useResponsive';

export const TAB_PATHS = ['/', '/discuss', '/coaches', '/profile'] as const;

/** One tab's slot in the row; it can be lifted next door for a far glide. */
function TabSlot({ index, width, jumpTab, jumpOffset, children }: { index: number; width: number; jumpTab: SharedValue<number>; jumpOffset: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const lifted = jumpTab.value === index;
    return { transform: [{ translateX: lifted ? jumpOffset.value : 0 }], zIndex: lifted ? 2 : 0 };
  });
  return <Animated.View style={[{ width, flex: 1 }, style]}>{children}</Animated.View>;
}
const LAST = TAB_PATHS.length - 1;
const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * The four main tabs, mounted side by side and slid between on the animation
 * thread — the way a native pager works, so a swipe never has to build the
 * next page or hand off to the router mid-flight. The router is told where
 * you landed afterwards, purely so the address and the bottom bar agree.
 */
export function TabsPager({ pathname }: { pathname: string }) {
  const { width } = useWindowDimensions();
  const { isPhone } = useResponsive();
  // A page pushed on top (settings, a player, a thread) is not a tab: the row
  // holds where it was until one of the four addresses comes back.
  const tabIndex = TAB_PATHS.indexOf(pathname as (typeof TAB_PATHS)[number]);
  const activeRef = useRef(Math.max(0, tabIndex));
  const target = tabIndex >= 0 ? tabIndex : activeRef.current;

  // Where the row sits, as a fractional tab index; 1.4 is most of the way from Community to Coaching.
  const position = useSharedValue(target);
  const widthValue = useSharedValue(width || 1);
  useEffect(() => { widthValue.value = width || 1; }, [width, widthValue]);
  const [active, setActive] = useState(target);
  const locked = useSharedValue(false);
  const enabled = useSharedValue(isPhone);
  useEffect(() => { enabled.value = isPhone; }, [isPhone, enabled]);
  useEffect(() => {
    locked.value = isPageSwipeLocked();
    return subscribePageSwipeLock(() => { locked.value = isPageSwipeLocked(); });
  }, [locked]);

  // A tap on the bottom bar, a link, or a back gesture changes the address;
  // the row glides there.
  // A far tab (Profile to Home) is lifted out of its slot and set down next
  // door to the current one for the length of the glide, so the two slide
  // past each other the way neighbours do — nothing in between is dragged by.
  const jumpTab = useSharedValue(-1);
  const jumpOffset = useSharedValue(0);
  useEffect(() => {
    if (target === activeRef.current) return;
    const from = activeRef.current;
    activeRef.current = target;
    setActive(target);
    if (Math.abs(target - from) <= 1) { position.value = withTiming(target, { duration: 260, easing: EASE }); return; }
    const dir = target > from ? 1 : -1;
    jumpTab.value = target;
    jumpOffset.value = (from + dir - target) * (width || 1);
    position.value = from;
    position.value = withTiming(from + dir, { duration: 280, easing: EASE }, (finished) => {
      // Landed: put the row at the real slot and the tab back where it lives, in one frame.
      position.value = target;
      jumpTab.value = -1;
      jumpOffset.value = 0;
      if (!finished) position.value = target;
    });
  }, [target, position, width, jumpTab, jumpOffset]);

  const heading = (index: number | null) => {
    setPendingTab(index === null ? null : TAB_PATHS[index]);
    if (index === null) return;
    // The section strips line up with the tab strip: coming from Coaching you
    // arrive at Find Players, from Home at Discussions, and Profile opens on Posts.
    const from = activeRef.current;
    if (index === 1) requestSection('/discuss', from > 1 ? 'players' : 'discussions');
    if (index === 3) requestSection('/profile', 'Posts');
  };
  const land = (index: number) => {
    activeRef.current = index;
    setActive(index);
    setPendingTab(TAB_PATHS[index]);
    if (TAB_PATHS[index] !== pathnameRef.current) router.navigate(TAB_PATHS[index]);
  };
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Shared values, not plain variables: the animation thread only ever sees a
  // frozen copy of a plain variable, so nothing set on touch-down would survive.
  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const settled = useSharedValue(true);
  const startY = useSharedValue(0);
  const startPosition = useSharedValue(0);
  const lastHeading = useSharedValue(-1);
  const pan = useMemo(() => {
    return Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        startX.value = t.x;
        armed.value = false;
        startY.value = t.y;
      })
      .onTouchesMove((e, state) => {
        'worklet';
        const t = e.allTouches[0];
        if (!t) return;
        const dx = t.x - startX.value;
        const dy = t.y - startY.value;
        if (Math.abs(dx) > activationDistance(0) && Math.abs(dx) > Math.abs(dy) * 1.4) {
          // A section swipe inside the tab may already own this finger.
          if (!enabled.value || locked.value || claimedDepth.value > 1) state.fail();
          else if (waitsForDeeper(0) && !armed.value) armed.value = true;
          else { claimedDepth.value = 1; state.activate(); }
        } else if (Math.abs(dy) > 12) {
          state.fail();
        }
      })
      .onStart(() => {
        'worklet';
        // Picking up mid-glide is allowed: the row simply follows the finger from where it is.
        startPosition.value = position.value;
        lastHeading.value = -1;
        settled.value = false;
        runOnJS(setPageDragging)(true);
      })
      .onUpdate((e) => {
        'worklet';
        let next = startPosition.value - e.translationX / widthValue.value;
        // Past either end the row still gives a little, so the pull is felt.
        if (next < 0) next = next * 0.25;
        if (next > LAST) next = LAST + (next - LAST) * 0.25;
        position.value = next;
        const toward = e.translationX < 0 ? Math.ceil(startPosition.value + 0.001) : Math.floor(startPosition.value - 0.001);
        const wanted = toward < 0 || toward > LAST || Math.abs(e.translationX) < 10 ? -1 : toward;
        if (wanted !== lastHeading.value) {
          lastHeading.value = wanted;
          runOnJS(heading)(wanted === -1 ? null : wanted);
        }
      })
      .onEnd((e) => {
        'worklet';
        const from = startPosition.value;
        const moved = -e.translationX / widthValue.value;
        const flick = Math.abs(e.translationX) > 28 && Math.abs(e.velocityX) > 350 && Math.sign(e.velocityX) === Math.sign(e.translationX);
        let dest: number;
        if (flick) dest = e.velocityX < 0 ? Math.ceil(from + 0.001) : Math.floor(from - 0.001);
        else if (Math.abs(moved) > 0.28) dest = moved > 0 ? Math.ceil(from + 0.001) : Math.floor(from - 0.001);
        else dest = Math.round(from);
        dest = Math.max(0, Math.min(LAST, dest));
        settled.value = true;
        runOnJS(setPageDragging)(false);
        runOnJS(heading)(dest);
        const distance = Math.abs(position.value - dest);
        position.value = withTiming(dest, { duration: 120 + Math.min(160, distance * 220), easing: EASE }, (finished) => {
          if (finished) runOnJS(land)(dest);
        });
      })
      .onFinalize(() => {
        'worklet';
        if (claimedDepth.value === 1) claimedDepth.value = 0;
        // Cancelled by the system mid-drag (a scroll took the finger, a call
        // came in): there was no end, so settle to the nearest tab here.
        if (!settled.value) {
          settled.value = true;
          const dest = Math.max(0, Math.min(LAST, Math.round(position.value)));
          runOnJS(setPageDragging)(false);
          runOnJS(heading)(dest);
          position.value = withTiming(dest, { duration: 160, easing: EASE }, (finished) => {
            if (finished) runOnJS(land)(dest);
          });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * widthValue.value }] }));
  // Built once. React skips re-rendering an element it has seen before, so
  // the address or the bar changing costs nothing inside the tabs themselves.
  const panes = useMemo(() => [Home, Discuss, Coaches, Profile].map((Tab, i) => <Tab key={TAB_PATHS[i]} />), []);

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1, flexDirection: 'row', width: width * TAB_PATHS.length }, row]}>
          {panes.map((pane, i) => (
            <TabSlot key={TAB_PATHS[i]} index={i} width={width} jumpTab={jumpTab} jumpOffset={jumpOffset}>
              <TabFocus active={active === i}>{pane}</TabFocus>
            </TabSlot>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
