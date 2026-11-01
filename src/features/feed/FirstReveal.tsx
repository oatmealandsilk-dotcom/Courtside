import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

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
 *
 * And never left see-through by the animation library (Nov 1, owner's iPhone:
 * "It just loaded without the bottom ... even after I refreshed"). Reanimated
 * copies an animated value that has sat still for a second into the view's own
 * style and never takes that copy back; a busy phone that missed the copy of
 * the end value kept the start one (see-through) until the app was closed. So
 * the rise is a transition of the section's own style (Reanimated's CSS
 * transitions, which nothing copies): what the section's style says, opacity 1
 * and in place, is where it always ends, however busy the phone is.
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
/** Easing.out(Easing.cubic), the rise's curve, as a transition's curve. */
const OUT_CUBIC = cubicBezier(0.33, 1, 0.68, 1);

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
  // Built held, then up from the next moment on (never up from the start: a section built as
  // the curtain lifts still rises, as before). Up is the section's own style, for good.
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!hold || up || !(lifting || overdue)) return;
    played = true;
    setUp(true);
  }, [hold, up, lifting, overdue]);
  const still = useReducedMotion();
  if (!hold) return <>{children}</>;
  // The same view throughout (its children are never built again); only its own style changes,
  // and the change is the transition (with Reduce Motion on, a plain fade).
  const delay = Math.min(order, LAST_STEP) * STEP_MS;
  return (
    <Animated.View
      style={[
        up ? (still ? styles.upStill : styles.up) : still ? styles.heldStill : styles.held,
        { transitionProperty: still ? 'opacity' : ['opacity', 'transform'], transitionDuration: RISE_MS, transitionDelay: delay, transitionTimingFunction: OUT_CUBIC },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  held: { opacity: 0, transform: [{ translateY: RISE }] },
  heldStill: { opacity: 0 },
  up: { opacity: 1, transform: [{ translateY: 0 }] },
  upStill: { opacity: 1 },
});
