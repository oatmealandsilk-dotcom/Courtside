import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Image as SvgImage, Mask, Rect } from 'react-native-svg';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { useReducedMotion } from '@/lib/useReducedMotion';
import {
  CAPTURE_CAP_MS,
  CROSSFADE_MS,
  END_GRACE_MS,
  LAND_CAP_MS,
  REVEAL_MS,
  THEME_SWITCH,
  coverRadius,
  middleOf,
  type TapPoint,
  type ThemeSwitcherHandle,
} from './themeSwitch';

/**
 * A theme change on a phone (Oct 21, Oct 23). The old veil (a see-through
 * tint of the new court raised over the screen while it recoloured) read as a
 * grey, faded blink; now:
 *
 * 1. A frame after the tap (so the card's check has moved), the app as it is
 *    is photographed and laid over itself as a plain picture: nothing moves.
 * 2. The frame after that picture is on screen, the app recolours beneath it,
 *    out of sight, so a repaint in patches is never seen.
 * 3. Once the new colours have landed, the picture fades away over the live
 *    new look (THEME_SWITCH 'crossfade'), or a circle opens in it from the
 *    tapped card ('reveal'), and the picture is taken away.
 *
 * Only that picture ever fades or opens, a separate layer laid over the app:
 * the app's own views (and so the glass tab bar's blur) are never faded, so
 * the glass is never see-through. The move runs on the animation thread.
 *
 * Never stuck, whatever the phone does:
 * - the picture must be on screen within CAPTURE_CAP_MS of the tap, or the
 *   change simply happens at once, with no animation (also when the phone
 *   can't photograph);
 * - the picture moves after LAND_CAP_MS even if the redraw never reports in;
 * - it is taken away END_GRACE_MS after its move should have ended, whether
 *   or not the animation says it finished (a lost callback, a dropped settled
 *   value), and it is unmounted, never left see-through.
 *
 * A second tap: while the picture still covers everything, the new court is
 * simply put on beneath it instead. While one is already moving, the live
 * look (the court being moved to) is photographed and slipped beneath the
 * moving one, which carries on undisturbed, and the new court moves in from
 * there: nothing jumps.
 */
type Phase = 'capturing' | 'shown' | 'applied' | 'moving' | 'over';
type Run = {
  id: number;
  name: string;
  apply: () => void;
  phase: Phase;
  point: TapPoint;
  uri?: string;
  timer?: ReturnType<typeof setTimeout>;
};
type CoverSpec = { id: number; uri: string; x: number; y: number; reach: number; go: boolean };

export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, { app: React.RefObject<View | null> }>(function ThemeSwitcher({ app }, ref) {
  const { width, height } = useWindowDimensions();
  const size = useRef({ width, height });
  size.current = { width, height };
  const still = useReducedMotion();
  const stillRef = useRef(still);
  stillRef.current = still;
  const [covers, setCovers] = useState<CoverSpec[]>([]);
  // Oldest first. At most one run that is not yet moving: the newest.
  const runs = useRef<Run[]>([]);
  const seq = useRef(0);

  const clear = (run: Run) => {
    if (run.timer) clearTimeout(run.timer);
    run.timer = undefined;
  };
  /** Take a run's picture away for good. */
  const end = (run: Run) => {
    if (run.phase === 'over') return;
    run.phase = 'over';
    clear(run);
    runs.current = runs.current.filter((r) => r !== run);
    const id = run.id;
    setCovers((list) => (list.some((c) => c.id === id) ? list.filter((c) => c.id !== id) : list));
    if (run.uri) {
      try { releaseCapture(run.uri); } catch {}
    }
  };
  /** The plain switch: no picture, the new court at once. */
  const instant = (run: Run) => {
    const apply = run.apply;
    end(run);
    apply();
  };
  const reachOf = (point: TapPoint) => coverRadius(point, size.current.width, size.current.height);

  /** The new colours are in (or we stopped waiting): two frames for the blur and glass to catch up, then the picture moves. */
  const move = (run: Run) => {
    if (run.phase !== 'applied') return;
    run.phase = 'moving';
    clear(run);
    const duration = THEME_SWITCH === 'crossfade' ? CROSSFADE_MS : REVEAL_MS;
    // Whatever the animation does, the picture is gone shortly after the move should have ended
    // (counted again from when it is told to go, below; this one covers frames that never come).
    run.timer = setTimeout(() => end(run), duration + END_GRACE_MS + 300);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (run.phase !== 'moving') return;
      clear(run);
      run.timer = setTimeout(() => end(run), duration + END_GRACE_MS);
      const { x, y } = run.point;
      const id = run.id;
      setCovers((list) => list.map((c) => (c.id === id ? { ...c, x, y, reach: reachOf(run.point), go: true } : c)));
    }));
  };
  const recolour = (run: Run) => {
    run.phase = 'applied';
    clear(run);
    run.timer = setTimeout(() => move(run), LAND_CAP_MS);
    run.apply();
  };

  // The picture is on screen: the frame after, the app recolours beneath it.
  const onShown = useCallback((id: number) => {
    const run = runs.current.find((r) => r.id === id);
    if (!run || run.phase !== 'capturing') return;
    clear(run);
    run.phase = 'shown';
    requestAnimationFrame(() => { if (run.phase === 'shown') recolour(run); });
  }, []);
  const onGone = useCallback((id: number) => {
    const run = runs.current.find((r) => r.id === id);
    if (run) end(run);
  }, []);

  useImperativeHandle(ref, () => ({
    start(name, apply, from) {
      const point = from ?? middleOf(size.current.width, size.current.height);
      if (stillRef.current) {
        // Reduce Motion (the app's own setting, src/lib/useReducedMotion): at once.
        for (const run of runs.current.slice()) if (run.phase !== 'moving') end(run);
        apply();
        return;
      }
      const head = runs.current.find((r) => r.phase !== 'moving' && r.phase !== 'over');
      if (head) {
        // The old look still covers everything: the new pick simply takes this one's place beneath it.
        head.name = name;
        head.apply = apply;
        head.point = point;
        if (head.phase === 'applied') recolour(head);
        return;
      }
      const run: Run = { id: ++seq.current, name, apply, phase: 'capturing', point };
      runs.current.push(run);
      // A slow photograph never holds the tap up: past the cap, the plain switch.
      run.timer = setTimeout(() => { if (run.phase === 'capturing') instant(run); }, CAPTURE_CAP_MS);
      // One frame first, so the tapped card's check is in the picture.
      requestAnimationFrame(() => {
        if (run.phase !== 'capturing') return;
        if (!app.current) { instant(run); return; }
        captureRef(app.current, { format: 'jpg', quality: 0.9, result: 'tmpfile' })
          .then((uri) => {
            if (run.phase !== 'capturing') {
              try { releaseCapture(uri); } catch {}
              return;
            }
            run.uri = uri;
            const { x, y } = run.point;
            setCovers((list) => [...list, { id: run.id, uri, x, y, reach: reachOf(run.point), go: false }]);
          })
          .catch(() => { if (run.phase === 'capturing') instant(run); });
      });
    },
    landed(name) {
      const run = runs.current.find((r) => r.phase === 'applied');
      if (run && run.name === name) move(run);
    },
  }));

  // Nothing left behind if the app itself goes.
  useEffect(() => () => { for (const run of runs.current.slice()) end(run); }, []);

  if (!covers.length) return null;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.top]}>
      {/* Newest first, so an older picture still moving stays on top of a newer one. */}
      {covers.slice().reverse().map((cover) => (
        <Cover key={cover.id} cover={cover} width={width} height={height} onShown={onShown} onGone={onGone} />
      ))}
    </View>
  );
});

const HoleCircle = Animated.createAnimatedComponent(Circle);

/**
 * One picture of an old look. It starts fully shown (a plain resting value,
 * so a lost animation update can only ever leave it showing, and then the
 * switcher's timer takes it away) and only ever moves once, when `go` turns on.
 */
const Cover = memo(function Cover({ cover, width, height, onShown, onGone }: { cover: CoverSpec; width: number; height: number; onShown: (id: number) => void; onGone: (id: number) => void }) {
  const fade = useSharedValue(1);
  const grow = useSharedValue(0);
  const { id, go, reach } = cover;
  useEffect(() => {
    if (!go) return;
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(onGone)(id);
    };
    if (THEME_SWITCH === 'crossfade') {
      fade.value = withTiming(0, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }, finish);
    } else {
      grow.value = withTiming(reach, { duration: REVEAL_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }, finish);
    }
  }, [go, id, reach, fade, grow, onGone]);
  const look = useAnimatedStyle(() => ({ opacity: fade.value }));
  const hole = useAnimatedProps(() => ({ r: grow.value }));
  const shown = () => onShown(id);

  if (THEME_SWITCH === 'crossfade') {
    return <Animated.Image source={{ uri: cover.uri }} onLoad={shown} fadeDuration={0} resizeMode="stretch" style={[styles.cover, { width, height }, look]} />;
  }
  const mask = `themeSwitchHole${id}`;
  return (
    <Svg width={width} height={height} style={styles.cover}>
      <Defs>
        <Mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill="#fff" />
          <HoleCircle cx={cover.x} cy={cover.y} r={0} fill="#000" animatedProps={hole} />
        </Mask>
      </Defs>
      <SvgImage href={{ uri: cover.uri }} onLoad={shown} x={0} y={0} width={width} height={height} preserveAspectRatio="none" mask={`url(#${mask})`} />
    </Svg>
  );
});

const styles = StyleSheet.create({
  top: { zIndex: 9999 },
  cover: { position: 'absolute', top: 0, left: 0 },
});
