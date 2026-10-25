import React, { useEffect, useMemo, useRef, useState } from 'react';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { router } from 'expo-router';

import Discuss from '../../app/(tabs)/discuss';
import Home from '../../app/(tabs)/index';
import Coaches from '../../app/(tabs)/coaches';
import Profile from '../../app/(tabs)/profile';
import { TabFocus } from '@/features/navigation/tabFocus';
import { catchUpNow } from '@/theme/catchUp';
import { activationDistance, claimedDepth, waitsForDeeper } from '@/features/navigation/gestureClaim';
import { setPendingTab } from '@/features/navigation/pendingTab';
import { askedSection, requestSection } from '@/features/navigation/swipeOrder';
import { isPageSwipeLocked, setPageDragging, subscribePageSwipeLock } from '@/features/navigation/swipeLock';
import { useResponsive } from '@/lib/useResponsive';
import { SwipeArea } from '@/features/navigation/swipePress';

/**
 * The strip, left to right: Community (where the app opens, Find Players
 * then Discussions), Home, Coaching, Profile. The bar's buttons and the
 * shell's TAB_ORDER follow the same order.
 */
export const TAB_PATHS = ['/discuss', '/', '/coaches', '/profile'] as const;

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

  // Where the row sits, as a fractional tab index; 1.4 is partway from Home to Coaching.
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
  // A far tab (Profile to Community) is lifted out of its slot and set down next
  // door to the current one for the length of the glide, so the two slide
  // past each other the way neighbours do — nothing in between is dragged by.
  const jumpTab = useSharedValue(-1);
  const jumpOffset = useSharedValue(0);
  useEffect(() => {
    if (target === activeRef.current) return;
    const from = activeRef.current;
    moveTo(target);
    setActive(target);
    if (Math.abs(target - from) <= 1) {
      // Community, if it was left, is put back once the row is at rest (atRest).
      position.value = withTiming(target, { duration: 260, easing: EASE }, (finished) => { if (finished) runOnJS(atRest)(); });
      return;
    }
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
      else runOnJS(atRest)();
    });
  }, [target, position, width, jumpTab, jumpOffset]);

  const heading = (index: number | null) => {
    setPendingTab(index === null ? null : TAB_PATHS[index]);
    if (index === null) return;
    // A drag that springs back to the tab it began on asks for nothing: on
    // Find Players, a pull past the left end would otherwise flip the page to
    // Discussions.
    const from = activeRef.current;
    if (index === from) return;
    // Profile opens on Posts. (Community's section is set when it is left,
    // not here: asked mid-drag, it changed under the finger while its edge
    // was already sliding in.)
    if (TAB_PATHS[index] === '/profile') requestSection('/profile', 'Posts');
  };
  const land = (index: number) => {
    moveTo(index);
    atRest();
    setActive(index);
    setPendingTab(TAB_PATHS[index]);
    if (TAB_PATHS[index] !== pathnameRef.current) router.navigate(TAB_PATHS[index]);
  };
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  // Community opens at its top every time you come to it from another tab
  // (all four tabs stay mounted, so it used to sit wherever you last left it,
  // and the threads were above you). Coming back from a thread you opened
  // does not count: that never changes the tab, so your place is kept.
  // It is put back as it is LEFT, once the row is at rest and Community is
  // off screen, not as you arrive (Oct 22, owner: "Nothing framing in or
  // out"): arriving, it slid in at its old place and then jumped to the top.
  // A swipe from the Feed reaches it on Discussions, the section next door,
  // so that is the section it waits on; the bar asks for Find Players itself
  // (askForCommunityMap) before it glides there.
  // Community left and not yet put back. Set whenever the row's tab moves off it, by any way
  // (a bar tap, a link, a finger), and only cleared once the row has come to rest off Community:
  // a glide cut short (a second tap, a finger picking the row up) leaves it set for the next rest,
  // so the reset is never lost (audit, Oct 22). Coming back first clears it: nothing was left.
  const communityLeft = useRef(false);
  const moveTo = (index: number) => {
    if (TAB_PATHS[activeRef.current] === '/discuss' && TAB_PATHS[index] !== '/discuss') communityLeft.current = true;
    if (TAB_PATHS[index] === '/discuss') communityLeft.current = false;
    activeRef.current = index;
  };
  function atRest() {
    if (!communityLeft.current || TAB_PATHS[activeRef.current] === '/discuss') return;
    communityLeft.current = false;
    requestScrollToTop('/discuss', true);
    // Out of sight, so as background work: a tap on the tab you just reached goes first.
    requestSection('/discuss', 'discussions', { background: true });
  }
  // Opened on another tab (a link straight to the Feed, a notification): Community was never left,
  // so it still sits on Find Players. It is put on Discussions now, out of sight, so a swipe from
  // the Feed brings in the section next door. Not when a page already asked for one.
  useEffect(() => {
    if (TAB_PATHS[activeRef.current] !== '/discuss' && askedSection('/discuss') === undefined) requestSection('/discuss', 'discussions', { background: true });
  }, []);

  // Shared values, not plain variables: the animation thread only ever sees a
  // frozen copy of a plain variable, so nothing set on touch-down would survive.
  const startX = useSharedValue(0);
  const armed = useSharedValue(false);
  const settled = useSharedValue(true);
  const startY = useSharedValue(0);
  const startPosition = useSharedValue(0);
  const lastHeading = useSharedValue(-1);
  // A theme picked a moment ago: a finger on the row lets the tabs either side catch up at once
  // (src/theme/catchUp.ts), so one slid in is never seen in the old court. Nothing when none is held.
  const nearCaughtUp = useRef(() => {
    const i = activeRef.current;
    catchUpNow([TAB_PATHS[i], TAB_PATHS[i - 1], TAB_PATHS[i + 1]].filter((p): p is (typeof TAB_PATHS)[number] => !!p));
  }).current;
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
        runOnJS(nearCaughtUp)();
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
  // In TAB_PATHS order.
  const panes = useMemo(() => [Discuss, Home, Coaches, Profile].map((Tab, i) => <Tab key={TAB_PATHS[i]} />), []);

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1, flexDirection: 'row', width: width * TAB_PATHS.length }, row]}>
          {/* A press on a tab waits a beat before it shows, so a finger that is swiping never dips a card (swipePress). */}
          <SwipeArea on={isPhone}>
            {panes.map((pane, i) => (
              <TabSlot key={TAB_PATHS[i]} index={i} width={width} jumpTab={jumpTab} jumpOffset={jumpOffset}>
                <TabFocus active={active === i}>{pane}</TabFocus>
              </TabSlot>
            ))}
          </SwipeArea>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
