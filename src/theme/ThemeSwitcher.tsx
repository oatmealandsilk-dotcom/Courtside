import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Image as SvgImage, Mask, Rect } from 'react-native-svg';
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
 * 3. The moment the new colours land, a circle opens in that photograph at
 *    the tap point and grows until the photograph is gone: through it you see
 *    the live app, already in its new colours. There is no second photograph:
 *    an earlier draft took one and waited for it, a second wait before
 *    anything moved (Oct 16, owner: "lets make it instant").
 *    (THEME_SWITCH 'crossfade' instead: the photograph simply fades away over
 *    the live new look.)
 *
 * Everything that moves is the photograph, laid over the app as a sibling:
 * the app's own views (and so the glass tab bar's) are never faded or moved.
 * The circle runs on the animation thread, so a busy redraw can't stutter it.
 * A phone that can't take the photograph simply switches at once. A second
 * tap while one is running drops the running one where it is and starts again
 * from the court it was heading to.
 */
type Cover = { run: number; old: string; x: number; y: number };

const HoleCircle = Animated.createAnimatedComponent(Circle);

export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, { app: React.RefObject<View | null> }>(function ThemeSwitcher({ app }, ref) {
  const { width, height } = useWindowDimensions();
  const [cover, setCover] = useState<Cover | null>(null);
  const run = useRef(0);
  // What the running change is waiting for, and what to do then.
  const step = useRef<{ run: number; wait: 'old' | 'landed' | 'moving'; apply?: () => void } | null>(null);
  const files = useRef<string[]>([]);
  // The radius of the hole in the old photograph (reveal).
  const grow = useSharedValue(0);
  // How much of the old photograph shows (only a crossfade lowers it).
  const fade = useSharedValue(1);
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
          setCover({ run: mine, old: uri, x: point.x, y: point.y });
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
      step.current = { run: mine, wait: 'moving' };
      // One frame for the phone's own layers (blur, glass, the map) to catch up, then it moves:
      // the hole opens straight onto the live app, so nothing else is waited for.
      requestAnimationFrame(() => {
        if (mine !== run.current) return;
        if (watchdog.current) clearTimeout(watchdog.current); // moving now: let it finish
        const finish = (finished?: boolean) => {
          'worklet';
          if (finished) runOnJS(done)(mine);
        };
        if (THEME_SWITCH === 'crossfade') {
          fade.value = withTiming(0, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.quad) }, finish);
        } else {
          grow.value = withTiming(reach.current, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic) }, finish);
        }
      });
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

  // The hole in the old photograph, through which the live new look shows.
  const hole = useAnimatedProps(() => ({ r: grow.value }));
  const oldLook = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!cover) return null;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.top]}>
      {/* Only this photograph, laid over the app, ever fades or opens: never the app (or its glass tab bar) itself. */}
      <Animated.View style={[StyleSheet.absoluteFill, oldLook]}>
        <Svg width={width} height={height}>
          <Defs>
            <Mask id="themeSwitchHole" maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <Rect x={0} y={0} width={width} height={height} fill="#fff" />
              <HoleCircle cx={cover.x} cy={cover.y} r={0} fill="#000" animatedProps={hole} />
            </Mask>
          </Defs>
          <SvgImage href={{ uri: cover.old }} onLoad={oldShown} x={0} y={0} width={width} height={height} preserveAspectRatio="none" mask="url(#themeSwitchHole)" />
        </Svg>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  top: { zIndex: 9999 },
});
