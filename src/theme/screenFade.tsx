import React, { useEffect, useState } from 'react';
import { AppState, Image, Platform, StyleSheet } from 'react-native';
import Animated, { Easing, ReduceMotion, makeMutable, runOnJS, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { captureScreen, releaseCapture } from 'react-native-view-shot';
import { SCREEN_FADE_CURVE, SCREEN_FADE_MS } from './fadeTiming';
import { fadeEnded, fadeStarted } from './catchUp';
import { isPageDragging, subscribePageDragging } from '@/features/navigation/swipeLock';
import { reduceMotionNow } from '@/lib/useReducedMotion';

/*
 * The app changing look by itself, as one smooth cross-fade of the whole screen (Oct 25, owner,
 * after seeing Match phone flip the app dark in one go: "It should fade to dark mode not
 * immediately change, what does Instagram or Strava do"). An iPhone app built on Apple's own parts
 * gets this from the phone: as the phone turns dark, the whole screen dissolves from the old look
 * to the new in about a third of a second. CourtSide draws its own colours, so it does the same
 * itself:
 *
 *   1. a picture of the whole screen is taken (react-native-view-shot), as it is, before anything
 *      changes;
 *   2. it is laid over everything, the bar and any sheet included (on an iPhone straight on the
 *      phone's window, FullWindowOverlay, above the pages that slide up, which are the phone's own
 *      layers), looking exactly like the screen under it;
 *   3. the app turns to the new look underneath it, out of sight;
 *   4. once that has been drawn, the picture fades to nothing (SCREEN_FADE_MS, ease-in-out) and is
 *      taken away.
 *
 * Nothing that holds the glass bar or a blur ever fades: the picture is a layer of its own above
 * them (src/components/TabBarLooks.tsx's rule). Touches go straight through it. The website does
 * the same with the browser's own cross-fade (screenFade.web.ts).
 *
 * Never under a finger (ThemeProvider's followPhone waits for the page to be still first): a finger
 * landing while the picture is going up takes it away again, nothing changed, and the change waits;
 * a swipe starting while it fades hurries the rest of the fade. A second change while one is
 * fading lands under the same picture, which fades on to it. With Reduce Motion honoured
 * (src/lib/useReducedMotion.ts: not, by the owner's Oct 5 rule), the app leaving the screen, or no
 * picture to be had, the change is instant, as before.
 */

/** A change waiting to be shown (ThemeProvider's followPhone). */
export interface ScreenFadeJob {
  /** Puts the new look on, as it is by then; true when the screen changed. */
  land: () => boolean;
  /** A finger on the page now (the change must not land under it). */
  held: () => boolean;
  /** Tries the change again a moment later. */
  retry: () => void;
}

type Stage = 'idle' | 'capturing' | 'holding' | 'landing' | 'fading';

interface Shot {
  key: number;
  /** As the Image reads it. */
  uri: string;
  /** As view-shot gave it, to release. */
  file: string;
  op: SharedValue<number>;
}

/** The picture is given up on (the change then lands at once) when it takes longer than this. */
const CAPTURE_LIMIT_MS = 900;
/** Or when, taken, it has not been drawn this long after. */
const HOLD_LIMIT_MS = 600;
/** Once the new look is put on, the fade starts when it is drawn, or this long after at the latest. */
const LAND_LIMIT_MS = 400;
/** What is left of the fade when a swipe starts during it. */
const HURRY_MS = 90;
const EASE = Easing.bezier(...SCREEN_FADE_CURVE);

let stage: Stage = 'idle';
let job: ScreenFadeJob | null = null;
let shot: Shot | null = null;
let seq = 0;
/** Holding back the tabs out of sight (catchUp), so none of them redraws during the fade. */
let counted = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let show: ((next: Shot | null) => void) | null = null;

const frame = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => fn()) : setTimeout(fn, 16));

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

function release(file: string) {
  // After the picture has left the screen.
  setTimeout(() => { try { releaseCapture(file); } catch { /* already gone */ } }, 500);
}

/** Back to nothing at all: the picture taken away, nothing landed by this. */
function reset() {
  clearTimer();
  const was = shot;
  shot = null;
  job = null;
  stage = 'idle';
  show?.(null);
  if (was) release(was.file);
  if (counted) { counted = false; fadeEnded(); }
}

/** No fade after all: the picture goes and the change lands at once, in the same go (as before). */
function giveUp() {
  const pending = stage === 'capturing' || stage === 'holding' ? job : null;
  reset();
  pending?.land();
}

/** Plays the app's own change of look (Match phone) as a cross-fade of the whole screen. */
export function fadeScreen(next: ScreenFadeJob): void {
  // The picture is on its way: this change lands under it instead, whatever is due by then.
  if (stage === 'capturing' || stage === 'holding') { job = next; return; }
  // A picture already fading: this change goes on under it too, and it fades on to that.
  if (stage === 'landing' || stage === 'fading') { next.land(); return; }
  if (!show || reduceMotionNow() || AppState.currentState === 'background') { next.land(); return; }
  stage = 'capturing';
  job = next;
  const mine = ++seq;
  let taking: Promise<string>;
  try {
    // A png on an iPhone (exactly the screen); a full-quality jpg on Android, where a png of the
    // screen is slow to make. Android's video and map surfaces are copied in too.
    taking = captureScreen(Platform.OS === 'ios'
      ? { format: 'png', result: 'tmpfile' }
      : { format: 'jpg', quality: 1, result: 'tmpfile', handleGLSurfaceViewOnAndroid: true });
  } catch {
    giveUp();
    return;
  }
  timer = setTimeout(() => { if (seq === mine && stage === 'capturing') giveUp(); }, CAPTURE_LIMIT_MS);
  taking.then((file) => {
    if (seq !== mine || stage !== 'capturing') { release(file); return; }
    clearTimer();
    const waiting = job;
    if (!waiting || waiting.held()) {
      // A finger came down meanwhile: nothing has changed; the change waits for the page to be still.
      release(file);
      reset();
      waiting?.retry();
      return;
    }
    stage = 'holding';
    shot = { key: mine, uri: file.includes('://') ? file : `file://${file}`, file, op: makeMutable(1) };
    show?.(shot);
    timer = setTimeout(() => { if (shot?.key === mine && stage === 'holding') giveUp(); }, HOLD_LIMIT_MS);
  }, () => {
    if (seq === mine && stage === 'capturing') giveUp();
  });
}

/** The picture is drawn over the screen: the new look goes on under it. */
function drawn(key: number) {
  if (shot?.key !== key || stage !== 'holding') return;
  // Two frames on, so the picture is surely on the glass before anything changes under it.
  frame(() => frame(() => {
    if (shot?.key !== key || stage !== 'holding') return;
    clearTimer();
    const waiting = job;
    job = null;
    if (!waiting) { reset(); return; }
    if (waiting.held()) { reset(); waiting.retry(); return; }
    stage = 'landing';
    if (!counted) { counted = true; fadeStarted(); }
    if (!waiting.land()) { reset(); return; } // nothing to change by now (the phone went back)
    timer = setTimeout(() => startFade(key), LAND_LIMIT_MS);
  }));
}

/** The new look has been drawn under the picture (ThemeProvider, as the court on show is drawn). */
export function screenDrawn() {
  if (stage !== 'landing' || !shot) return;
  const key = shot.key;
  frame(() => frame(() => startFade(key)));
}

function startFade(key: number) {
  if (shot?.key !== key || stage !== 'landing') return;
  clearTimer();
  stage = 'fading';
  fadeTo(shot, SCREEN_FADE_MS);
}

function fadeTo(current: Shot, ms: number) {
  const { key } = current;
  current.op.value = withTiming(0, { duration: ms, easing: EASE, reduceMotion: ReduceMotion.Never }, (finished) => {
    'worklet';
    if (finished) runOnJS(done)(key);
  });
  clearTimer();
  // Whatever the animation reports, the picture goes.
  timer = setTimeout(() => done(key), ms + 300);
}

function done(key: number) {
  if (shot?.key !== key) return;
  reset();
}

/** A swipe starting: a picture still going up is taken away (nothing changed yet); a fading one hurries. */
function swipeStarted() {
  if (!isPageDragging() || !shot) return;
  if (stage === 'holding') {
    const waiting = job;
    reset();
    waiting?.retry();
  } else if (stage === 'landing' || stage === 'fading') {
    stage = 'fading';
    fadeTo(shot, HURRY_MS);
  }
}

/** The picture, while there is one: over everything, last in the app's root (ThemeProvider). */
export function ScreenFadeHost() {
  const [current, setCurrent] = useState<Shot | null>(null);
  useEffect(() => {
    show = setCurrent;
    const stopSwipe = subscribePageDragging(swipeStarted);
    // The app leaving the screen: a change on its way lands at once, a fade ends.
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      if (stage === 'capturing' || stage === 'holding') giveUp();
      else if (stage !== 'idle') reset();
    });
    return () => {
      stopSwipe();
      app.remove();
      if (show === setCurrent) show = null;
      if (stage !== 'idle') giveUp();
    };
  }, []);
  if (!current) return null;
  const layer = <ShotLayer key={current.key} shot={current} />;
  return Platform.OS === 'ios'
    ? <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>{layer}</FullWindowOverlay>
    : layer;
}

function ShotLayer({ shot: own }: { shot: Shot }) {
  const fade = useAnimatedStyle(() => ({ opacity: own.op.value }));
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, fade]}
    >
      <Image
        source={{ uri: own.uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="stretch"
        fadeDuration={0}
        onLoad={() => drawn(own.key)}
        onError={() => { if (shot?.key === own.key && stage === 'holding') giveUp(); }}
      />
    </Animated.View>
  );
}
