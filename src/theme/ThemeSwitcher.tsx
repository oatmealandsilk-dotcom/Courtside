import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { CROSSFADE_MS, REVEAL_MS, THEME_SWITCH, coverRadius, middleOf, type ThemeSwitcherHandle } from './themeSwitch';

/**
 * A theme change on a phone (Oct 21). The old veil (a see-through tint of the
 * new court raised over the screen while it recoloured) read as a faded blink;
 * now the new court spreads out in a circle from the card you tapped.
 *
 * 1. The app as it is, photographed and laid over itself: nothing moves yet.
 * 2. The app recolours beneath that photograph, out of sight, so a repaint in
 *    patches is never seen.
 * 3. The new look, photographed, grows out of the tap point inside a circle
 *    until it covers the screen; then both photographs go and the live app,
 *    already in its new colours, is all that is left.
 *    (THEME_SWITCH 'crossfade' instead: no second photograph; the first one
 *    simply fades away over the live new look.)
 *
 * Everything that moves is the photographs, laid over the app as a sibling:
 * the app's own views (and so the glass tab bar's) are never faded or moved.
 * The circle runs on the animation thread, so a busy redraw can't stutter it.
 * A phone that can't take the photographs simply switches at once. A second
 * tap while one is running drops the running one where it is and starts again
 * from the court it was heading to.
 */
type Cover = { run: number; old: string; fresh: string | null };

export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, { app: React.RefObject<View | null> }>(function ThemeSwitcher({ app }, ref) {
  const { width, height } = useWindowDimensions();
  const [cover, setCover] = useState<Cover | null>(null);
  const run = useRef(0);
  // What the running change is waiting for, and what to do then.
  const step = useRef<{ run: number; wait: 'old' | 'landed' | 'fresh'; apply?: () => void } | null>(null);
  const files = useRef<string[]>([]);
  const grow = useSharedValue(0);
  // How much of the old photograph shows (only a crossfade lowers it).
  const fade = useSharedValue(1);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  const reach = useRef(0);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = () => {
    for (const uri of files.current.splice(0)) {
      try { releaseCapture(uri); } catch {}
    }
  };
  const done = (which: number) => {
    if (which !== run.current) return;
    if (watchdog.current) clearTimeout(watchdog.current);
    step.current = null;
    setCover(null);
    release();
  };
  const photograph = () => (app.current ? captureRef(app.current, { format: 'jpg', quality: 0.92, result: 'tmpfile' }) : Promise.reject(new Error('no app')));

  useImperativeHandle(ref, () => ({
    start(apply, from) {
      const mine = ++run.current;
      cancelAnimation(grow);
      cancelAnimation(fade);
      grow.value = 0;
      fade.value = 1;
      setCover(null);
      release();
      step.current = { run: mine, wait: 'old', apply };
      const point = from ?? middleOf(width, height);
      ox.value = point.x;
      oy.value = point.y;
      reach.current = coverRadius(point, width, height);
      // However it goes, the new court is on screen within about a second: never a photograph left stuck.
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        const now = step.current;
        if (mine !== run.current || !now) return;
        if (now.wait === 'old' && now.apply) now.apply();
        done(mine);
      }, 1200);
      photograph()
        .then((uri) => {
          files.current.push(uri);
          if (mine !== run.current) return;
          setCover({ run: mine, old: uri, fresh: null });
        })
        .catch(() => {
          // No photograph: the plain switch, at once.
          if (mine !== run.current) return;
          done(mine);
          apply();
        });
    },
    landed() {
      const now = step.current;
      if (!now || now.wait !== 'landed' || now.run !== run.current) return;
      const mine = now.run;
      // Two frames for the phone's own layers (blur, glass, the map) to catch up, then the new look.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (mine !== run.current) return;
        if (THEME_SWITCH === 'crossfade') {
          // The new look is live beneath: the old photograph fades away over it.
          step.current = { run: mine, wait: 'fresh' };
          fade.value = withTiming(0, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
            if (finished) runOnJS(done)(mine);
          });
          return;
        }
        photograph()
          .then((uri) => {
            files.current.push(uri);
            if (mine !== run.current) return;
            step.current = { run: mine, wait: 'fresh' };
            setCover((c) => (c && c.run === mine ? { ...c, fresh: uri } : c));
          })
          .catch(() => done(mine)); // the new look is already live beneath: just lift the photograph
      }));
    },
  }));

  // The old photograph is on screen: now it is safe to recolour beneath it.
  const oldShown = () => {
    const now = step.current;
    if (!now || now.wait !== 'old' || now.run !== run.current || !now.apply) return;
    const apply = now.apply;
    step.current = { run: now.run, wait: 'landed' };
    requestAnimationFrame(() => { if (now.run === run.current) apply(); });
  };
  // The new photograph is ready: the circle grows.
  const freshShown = () => {
    const now = step.current;
    if (!now || now.wait !== 'fresh' || now.run !== run.current) return;
    const mine = now.run;
    grow.value = 0;
    grow.value = withTiming(reach.current, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(done)(mine);
    });
  };

  const circle = useAnimatedStyle(() => ({
    left: ox.value - grow.value,
    top: oy.value - grow.value,
    width: grow.value * 2,
    height: grow.value * 2,
    borderRadius: grow.value,
  }));
  // The new photograph sits still on the screen while the circle around it grows.
  const still = useAnimatedStyle(() => ({ left: grow.value - ox.value, top: grow.value - oy.value }));
  const oldLook = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!cover) return null;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.top]}>
      {/* Only this photograph, laid over the app, ever fades: never the app (or its glass tab bar) itself. */}
      <Animated.Image source={{ uri: cover.old }} onLoad={oldShown} onError={oldShown} fadeDuration={0} resizeMode="stretch" style={[StyleSheet.absoluteFill, oldLook]} />
      {cover.fresh ? (
        <Animated.View style={[styles.circle, circle]}>
          <Animated.Image source={{ uri: cover.fresh }} onLoad={freshShown} onError={() => done(cover.run)} fadeDuration={0} resizeMode="stretch" style={[{ position: 'absolute', width, height }, still]} />
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  top: { zIndex: 9999 },
  circle: { position: 'absolute', overflow: 'hidden', width: 0, height: 0 },
});
