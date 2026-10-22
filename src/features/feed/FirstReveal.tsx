import React, { useEffect, useRef, useState } from 'react';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { curtainHasLifted, isCurtainDown, useCurtainReady } from '@/features/feed/warmup';
import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * The start page's sections arriving as the opening curtain lifts (Oct 21,
 * owner: "make it absolute peak", and "don't make designs too bold"): each
 * one rises 7 points and fades in on its own, a beat after the one above
 * it, the whole of it done in 250 ms. Only on the very first showing of the
 * app: a section built later (coming back to the tab, data arriving after
 * the lift) is simply there. With Reduce Motion on, a plain fade.
 *
 * It is only ever put round a section's own content: never round the map
 * (its frame is there at once, and a web view a phone cannot see may stop
 * drawing), and never round anything glass (it goes see-through, Oct 17).
 *
 * Never left hidden (Oct 22, owner's iPhone: Find Players blank between the
 * tabs and "Near you"). A section waits for the curtain at most HOLD_MAX_MS:
 * a launch that leaves the start page before the curtain lifts (an alert's
 * page opened over it, say) takes the curtain's own clocks away with it, and
 * the page could otherwise wait for good. And once it has arrived, the
 * section's own style no longer says "hidden": the arrival is the animation
 * thread's alone, and an iPhone that loses that end value (a long busy moment
 * just after the lift) falls back to the section's own style, which is then
 * simply shown rather than see-through.
 */
const STEP_MS = 30;
const LAST_STEP = 3;
const RISE_MS = 160;
const RISE = 7;
/**
 * The longest a section waits for the curtain. A normal open lifts it within
 * about a second of the page drawing (the map's own grace is MAP_WAIT_MS), so
 * this only ever counts when the curtain's clocks are gone.
 */
const HOLD_MAX_MS = 4000;

/** Whether the first showing has played: from then on every section is simply there. */
let played = false;

export function FirstReveal({ order, children }: { order: number; children: React.ReactNode }) {
  // Decided once, when the section is built: hidden only under a curtain that has not gone yet.
  // Once the curtain has come down the first showing is over, played or not: a section built
  // afterwards (one beside the page, a pane reached by a swipe) is simply there, never staggered in.
  const [hold] = useState(() => !played && !isCurtainDown() && !curtainHasLifted());
  const lifting = useCurtainReady();
  // The curtain never said so in time: the section arrives anyway, the same way.
  const [overdue, setOverdue] = useState(false);
  useEffect(() => {
    if (!hold || lifting) return undefined;
    const t = setTimeout(() => setOverdue(true), HOLD_MAX_MS);
    return () => clearTimeout(t);
  }, [hold, lifting]);
  // Arrived: from here on the section is drawn with no style of the animation's at all.
  const [arrived, setArrived] = useState(false);
  const started = useRef(false);
  const still = useReducedMotion();
  const shown = useSharedValue(hold ? 0 : 1);
  useEffect(() => {
    if (!hold || !(lifting || overdue) || started.current) return;
    started.current = true;
    played = true;
    shown.value = withDelay(
      Math.min(order, LAST_STEP) * STEP_MS,
      withTiming(1, { duration: RISE_MS, easing: Easing.out(Easing.cubic) }, (finished) => { if (finished) runOnJS(setArrived)(true); }),
    );
  }, [hold, lifting, overdue, order, shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ translateY: still ? 0 : (1 - shown.value) * RISE }] }));
  if (!hold) return <>{children}</>;
  // The same view throughout (its children are never built again), only its style let go once it has arrived.
  return <Animated.View style={arrived ? undefined : style}>{children}</Animated.View>;
}
