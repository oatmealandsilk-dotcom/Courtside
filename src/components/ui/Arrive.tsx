import React, { useEffect, useState } from 'react';
import { type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { defineAnimation, LinearTransition, withTiming, type AnimationObject, type EntryExitAnimationFunction } from 'react-native-reanimated';

import { loadInOn } from '@/features/navigation/loadIn';
import { SIM_DRIVER, simLog } from '@/lib/simDriver';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useArriveGate } from './arriveGate';

export { useArriveGate, useArrivals } from './arriveGate';

/*
 * Things that arrive after a page is on show (Nov 4, owner: "Everything should load with good
 * animation, nothing should just cut in"): a face, a row, a section or a line of words that turns
 * up once its data lands comes in with a short fade (and, for most, a slight rise), instead of
 * snapping in. Admins first (loadIn.ts).
 *
 * Only what ARRIVES: whatever is in a page's first frame is simply there, as before, and so is
 * anything that lands while its page is not the one on show (a tab off to the side, a page under
 * another), while a finger is swiping a page or a tab, or under the opening curtain (which has its
 * own first showing, FirstReveal). So nothing ever plays again on a tab swipe, a swipe back, a
 * return to a page, a page opened again (a fresh page's first frame is still) or a theme change.
 *
 * On the animation thread (Reanimated's entering and exiting animations), decided once when the
 * thing is built: no extra redraws, and nothing left holding an animated value at rest. Its clock
 * never runs faster than about two frames at a time (`steady`), so an arrival that lands in the
 * same moment as a heavy redraw (the map card's pins) still plays every step, rather than being
 * mostly over by the time the phone draws again (which read as a cut, Nov 4 analysis 1d).
 *
 * Only ever round leaves (faces, rows, sections' own content, words): never round anything glass
 * or blurred, or a parent of the tab bar (the Oct 17 rule: an animated fade over glass goes
 * see-through). The website has its own version (Arrive.web.tsx: plain CSS animations).
 */

export type ArriveLook = 'rise' | 'pop' | 'slide' | 'fade' | 'lift';

/** At most this much of an arrival's time passes between two drawn frames (two frames at 60 Hz). */
const STEP_MS = 34;
/** At most this many beats apart, so a long row is never still arriving half a second later. */
const LAST_SLOT = 6;

/** How each look comes in: its start, how long, and how far apart each one after the first starts. */
const LOOKS: Record<ArriveLook, { opacity: number; y: number; x: number; scale: number; ms: number; gap: number; back: boolean }> = {
  // A (Up to hit's pick): a soft fade as it rises a few points and grows from 94%.
  rise: { opacity: 0, y: 6, x: 0, scale: 0.94, ms: 260, gap: 40, back: false },
  // B: grows from 60% with a slight overshoot as it fades in, the way a story ring pops in.
  pop: { opacity: 0, y: 0, x: 0, scale: 0.6, ms: 320, gap: 50, back: true },
  // C: slides in from the right as it fades in, as if the row were filling from the side.
  slide: { opacity: 0, y: 0, x: 24, scale: 1, ms: 280, gap: 30, back: false },
  // A row, a section's words, a picture: a fade only.
  fade: { opacity: 0, y: 0, x: 0, scale: 1, ms: 220, gap: 30, back: false },
  // A row in a list, a section: a fade as it rises 6 points into place.
  lift: { opacity: 0, y: 6, x: 0, scale: 1, ms: 220, gap: 30, back: false },
};

/**
 * A timing that never skips: like withTiming, but at most STEP_MS of it passes from one drawn
 * frame to the next, and it waits `wait` ms (counted the same way) before it starts.
 */
function steady(toValue: number, ms: number, wait: number, back: boolean): number {
  'worklet';
  return defineAnimation(toValue as unknown as AnimationObject, () => {
    'worklet';
    // Out-cubic, or a back-out with a small overshoot (look B).
    const ease = (t: number) => {
      'worklet';
      if (!back) return 1 - Math.pow(1 - t, 3);
      const s = 1.4;
      const u = t - 1;
      return u * u * ((s + 1) * u + s) + 1;
    };
    const onFrame = (a: { last: number; spent: number; startValue: number; current: number }, now: number) => {
      'worklet';
      const step = Math.min(Math.max(0, now - a.last), STEP_MS);
      a.last = now;
      a.spent += step;
      const t = a.spent - wait;
      if (t >= ms) { a.current = toValue; return true; }
      a.current = t <= 0 ? a.startValue : a.startValue + (toValue - a.startValue) * ease(t / ms);
      return false;
    };
    const onStart = (a: { last: number; spent: number; startValue: number; current: number }, value: number, now: number) => {
      'worklet';
      a.startValue = value;
      a.current = value;
      a.last = now;
      a.spent = 0;
    };
    return { onFrame, onStart, toValue, current: toValue, startValue: 0, last: 0, spent: 0, callback: undefined } as unknown as AnimationObject;
  }) as unknown as number;
}

const enterCache = new Map<string, EntryExitAnimationFunction>();
/** The entering animation for `look` at beat `slot`, made once and kept. */
function enterFor(look: ArriveLook, slot: number): EntryExitAnimationFunction {
  const at = Math.min(Math.max(0, slot), LAST_SLOT);
  const id = `${look}:${at}`;
  const made = enterCache.get(id);
  if (made) return made;
  const L = LOOKS[look];
  const wait = at * L.gap;
  const ms = L.ms;
  const back = L.back;
  const from = { opacity: L.opacity, y: L.y, x: L.x, scale: L.scale };
  // Opacity is done a little sooner than the movement, so it reads as arrived while it settles.
  const fadeMs = back ? Math.round(ms * 0.55) : Math.round(ms * 0.8);
  // Only what this look moves: every animated value is work on the phone's main thread in every frame it plays.
  const moveX = from.x !== 0;
  const moveY = from.y !== 0;
  const grow = from.scale !== 1;
  const fn: EntryExitAnimationFunction = () => {
    'worklet';
    const startAt: Record<string, number>[] = [];
    const moves: Record<string, number>[] = [];
    if (moveX) { startAt.push({ translateX: from.x }); moves.push({ translateX: steady(0, ms, wait, false) }); }
    if (moveY) { startAt.push({ translateY: from.y }); moves.push({ translateY: steady(0, ms, wait, false) }); }
    if (grow) { startAt.push({ scale: from.scale }); moves.push({ scale: steady(1, ms, wait, back) }); }
    return moves.length
      ? { initialValues: { opacity: from.opacity, transform: startAt as never }, animations: { opacity: steady(1, fadeMs, wait, false), transform: moves as never } }
      : { initialValues: { opacity: from.opacity }, animations: { opacity: steady(1, fadeMs, wait, false) } };
  };
  enterCache.set(id, fn);
  return fn;
}

/** How a thing leaves: a quick fade as it shrinks a little (a face) or just a fade (anything else). */
const LEAVE_SHRINK: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: { opacity: withTiming(0, { duration: 160 }), transform: [{ scale: withTiming(0.92, { duration: 160 }) }] },
  };
};
const LEAVE_FADE: EntryExitAnimationFunction = () => {
  'worklet';
  return { initialValues: { opacity: 1 }, animations: { opacity: withTiming(0, { duration: 140 }) } };
};
/** The others gliding over when one comes or goes. */
const ARRIVE_GLIDE = LinearTransition.duration(220);

/**
 * A leaf that plays its arrival when it is built as one (`slot` a number: its beat), and is simply
 * there otherwise (`slot` null). Decided once, when it is built. `leave`: fades out as it goes
 * ('shrink' for a face). `glide`: moves smoothly when the things before it come or go (on its own
 * outer view, so a move never cuts its arrival short). `style`: its own view's, which it has only
 * when it arrives, leaves or glides (built as none of them, its contents stand as they are).
 */
export function Arrive({ slot, look = 'rise', leave, glide = false, style, children, pointerEvents }: {
  slot: number | null;
  look?: ArriveLook;
  leave?: 'shrink' | 'fade' | false;
  glide?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}) {
  const [play] = useState(slot);
  // The simulator's proof only (nothing outside the harness): which arrivals played, to line up with a recording.
  useEffect(() => { if (SIM_DRIVER && play !== null) simLog(`[arrive] ${look} ${play}`); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The app's Reduce Motion answer (useReducedMotion: the owner's Oct 5 call is "always move"): if it ever says yes, a fade only.
  const still = useReducedMotion();
  const entering = play === null ? undefined : enterFor(still ? 'fade' : look, play);
  const exiting = !leave || !loadInOn() ? undefined : leave === 'shrink' ? LEAVE_SHRINK : LEAVE_FADE;
  // Built as no arrival, with no way out (with the load-in on) or glide to give it: its contents as they are, with no
  // view round them (so a card's own spacing between its lines is just as before). Decided once, as it is built.
  const [wrapped] = useState(() => play !== null || glide || (!!leave && loadInOn()));
  if (!wrapped) return <>{children}</>;
  if (!glide) return <Animated.View entering={entering} exiting={exiting} style={style} pointerEvents={pointerEvents}>{children}</Animated.View>;
  // Gliding, with no arrival of its own (there in the first frame): one view is enough.
  if (play === null) return <Animated.View layout={ARRIVE_GLIDE} exiting={exiting} style={style} pointerEvents={pointerEvents}>{children}</Animated.View>;
  return (
    <Animated.View layout={ARRIVE_GLIDE} exiting={exiting} style={style} pointerEvents={pointerEvents}>
      <Animated.View entering={entering}>{children}</Animated.View>
    </Animated.View>
  );
}

/** A word swap's way in and out: down into place from 4 points above, the old words up and away. */
const SWAP_IN: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 4 }] },
    animations: { opacity: steady(1, 180, 0, false), transform: [{ translateY: steady(0, 200, 0, false) }] },
  };
};
const SWAP_OUT: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: { opacity: withTiming(0, { duration: 130 }), transform: [{ translateY: withTiming(-4, { duration: 130 }) }] },
  };
};

/**
 * Words that change after the page is on show ("Open to hit" to "Most active in Austin", "2 near
 * you" to "3 near you", "No answers yet" to "4 answers"): the old ones fade up and away as the new
 * ones fade in, rather than swapping in one frame. The first words, and any change while the page
 * is not on show, are simply there. Empty text: nothing drawn (and its going fades too).
 */
export function SwapText({ text, style, still = false, ...rest }: Omit<TextProps, 'children' | 'style'> & { text: string; style?: StyleProp<TextStyle>; still?: boolean }) {
  const gate = useArriveGate(still);
  const live = gate();
  if (!text) return null;
  return (
    <Animated.Text key={text} entering={live ? SWAP_IN : undefined} exiting={live ? SWAP_OUT : undefined} style={style} {...rest}>
      {text}
    </Animated.Text>
  );
}

/**
 * For a leaf that cannot have a view put round it (a badge pinned to its icon's corner): Arrive's
 * way in, at beat `slot`, as its own entering animation, and its way out. Null slot: none.
 * (A browser gets none: Arrive.web.tsx.)
 */
export const arriveEntering = (slot: number | null, look: ArriveLook = 'pop'): EntryExitAnimationFunction | undefined => (slot === null ? undefined : enterFor(look, slot));
export const arriveExiting = (on: boolean): EntryExitAnimationFunction | undefined => (on ? LEAVE_SHRINK : undefined);
