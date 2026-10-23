import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { reportError } from '@/lib/crashReporting';
import { useReducedMotion } from '@/lib/useReducedMotion';
import {
  CAPTURE_CAP_MS,
  CROSSFADE_MS,
  END_GRACE_MS,
  LAND_CAP_MS,
  PHOTO_DENSITY,
  PHOTO_QUALITY,
  type TapPoint,
  type ThemeSwitcherHandle,
  type ThemeSwitcherProps,
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
 *    new look, and is taken away. The status bar's icons change as it starts
 *    to fade (onSettled), never while the old look is still showing.
 *
 * On a phone it is always the fade: the circle reveal (THEME_SWITCH 'reveal')
 * is a browser-only look until it has been tried on an iPhone (an SVG mask
 * redrawn on the CPU every frame, over a full-screen picture).
 *
 * Only that picture ever fades, a separate layer laid over the app: the app's
 * own views (and so the glass tab bar's blur) are never faded, so the glass is
 * never see-through. The fade runs on the animation thread.
 *
 * Never stuck, whatever the phone does:
 * - the picture must be on screen within CAPTURE_CAP_MS of the tap, or the
 *   change simply happens at once, with no animation (also when the phone
 *   can't photograph). How long the photo took, and how often it was too
 *   slow, is filed once a session (see noteTiming below), so the cap can be
 *   set from real phones;
 * - the picture moves after LAND_CAP_MS even if the redraw never reports in;
 * - it is taken away END_GRACE_MS after its fade should have ended, whether
 *   or not the animation says it finished (a lost callback, a dropped settled
 *   value), and it is unmounted, never left see-through.
 *
 * A second tap never waits beneath a still picture (its check would be hidden):
 * - before the app has recoloured, the picture is simply dropped (what is
 *   beneath is still the old look, with the new check) and the new pick
 *   starts its own;
 * - once the app has recoloured beneath it, the picture starts its fade at
 *   once, and the new pick photographs the live look and slips its own
 *   picture beneath the fading one, as it does whenever one is already
 *   fading: nothing jumps.
 */
type Phase = 'capturing' | 'shown' | 'applied' | 'moving' | 'over';
type Run = {
  id: number;
  name: string;
  apply: () => void;
  phase: Phase;
  /** The app has been recoloured to `name` (under the picture or bare). */
  applied: boolean;
  /** The status bar has been told `name` is on screen. */
  settled: boolean;
  uri?: string;
  timer?: ReturnType<typeof setTimeout>;
  /** When the tap came, and how long the photo and the picture took (ms). */
  t0: number;
  photoMs?: number;
  missed?: boolean;
};
type CoverSpec = { id: number; uri: string; go: boolean };

export const ThemeSwitcher = forwardRef<ThemeSwitcherHandle, ThemeSwitcherProps>(function ThemeSwitcher({ app, onSettled }, ref) {
  const { width, height } = useWindowDimensions();
  const size = useRef({ width, height });
  size.current = { width, height };
  const still = useReducedMotion();
  const stillRef = useRef(still);
  stillRef.current = still;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const [covers, setCovers] = useState<CoverSpec[]>([]);
  // Oldest first. At most one run that is not yet moving: the newest.
  const runs = useRef<Run[]>([]);
  const seq = useRef(0);
  // The newest run whose look the status bar has been told about.
  const settledId = useRef(0);

  const clear = (run: Run) => {
    if (run.timer) clearTimeout(run.timer);
    run.timer = undefined;
  };
  /** The run's look is the one on screen now (or starting to be): the status bar follows it, never an older run's. */
  const settle = (run: Run) => {
    if (run.settled || !run.applied) return;
    run.settled = true;
    if (run.id < settledId.current) return;
    settledId.current = run.id;
    settledRef.current?.(run.name);
  };
  /** Take a run's picture away for good. */
  const end = (run: Run) => {
    if (run.phase === 'over') return;
    run.phase = 'over';
    clear(run);
    settle(run);
    runs.current = runs.current.filter((r) => r !== run);
    const id = run.id;
    setCovers((list) => (list.some((c) => c.id === id) ? list.filter((c) => c.id !== id) : list));
    if (run.uri) {
      try { releaseCapture(run.uri); } catch {}
    }
  };
  /** The plain switch: no picture, the new court at once. */
  const instant = (run: Run) => {
    clear(run);
    run.applied = true;
    run.apply();
    end(run);
  };

  /** The new colours are in (or we stopped waiting): two frames for the blur and glass to catch up, then the picture fades. */
  const move = (run: Run) => {
    if (run.phase !== 'applied') return;
    run.phase = 'moving';
    clear(run);
    // Whatever the animation does, the picture is gone shortly after the fade should have ended
    // (counted again from when it is told to go, below; this one covers frames that never come).
    run.timer = setTimeout(() => end(run), CROSSFADE_MS + END_GRACE_MS + 300);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (run.phase !== 'moving') return;
      clear(run);
      run.timer = setTimeout(() => end(run), CROSSFADE_MS + END_GRACE_MS);
      const id = run.id;
      setCovers((list) => list.map((c) => (c.id === id ? { ...c, go: true } : c)));
      settle(run);
    }));
  };
  const recolour = (run: Run) => {
    run.phase = 'applied';
    clear(run);
    run.timer = setTimeout(() => move(run), LAND_CAP_MS);
    run.applied = true;
    run.apply();
  };

  // The picture is on screen: the frame after, the app recolours beneath it.
  const onShown = useCallback((id: number) => {
    const run = runs.current.find((r) => r.id === id);
    if (!run || run.phase !== 'capturing') return;
    clear(run);
    run.phase = 'shown';
    noteTiming(`photo ${run.photoMs ?? '?'} ms, on screen ${Date.now() - run.t0} ms`, false);
    requestAnimationFrame(() => { if (run.phase === 'shown') recolour(run); });
  }, []);
  // The picture could not be shown: the plain switch, at once rather than at the cap.
  const onFailed = useCallback((id: number) => {
    const run = runs.current.find((r) => r.id === id);
    if (!run || run.phase !== 'capturing') return;
    noteTiming('picture would not load', true);
    instant(run);
  }, []);
  const onGone = useCallback((id: number) => {
    const run = runs.current.find((r) => r.id === id);
    if (run) end(run);
  }, []);

  /** The photo, at no more than PHOTO_DENSITY pixels a point (less to draw, encode and load than the phone's own 3). */
  const photoSize = (): { width?: number; height?: number } => {
    const density = PixelRatio.get();
    if (!(density > PHOTO_DENSITY)) return {};
    const { width: w, height: h } = size.current;
    if (Platform.OS === 'ios') {
      // iOS draws the given size in points at the phone's own scale.
      return { width: (w * PHOTO_DENSITY) / density, height: (h * PHOTO_DENSITY) / density };
    }
    // Android scales its photo to the given size in pixels.
    return { width: Math.round(w * PHOTO_DENSITY), height: Math.round(h * PHOTO_DENSITY) };
  };

  useImperativeHandle(ref, () => ({
    start(name, apply, _from?: TapPoint) {
      const run: Run = { id: ++seq.current, name, apply, phase: 'capturing', applied: false, settled: false, t0: Date.now() };
      if (stillRef.current) {
        // Reduce Motion (the app's own setting, src/lib/useReducedMotion): at once.
        for (const r of runs.current.slice()) if (r.phase !== 'moving') end(r);
        instant(run);
        return;
      }
      const head = runs.current.find((r) => r.phase !== 'moving' && r.phase !== 'over');
      if (head) {
        if (head.phase === 'applied') {
          // Recoloured beneath its picture: that picture fades now, and the new pick slips its own beneath it.
          move(head);
        } else {
          // Not recoloured yet: what is beneath the picture is the old look itself, with the new check. Drop it.
          end(head);
        }
      }
      runs.current.push(run);
      // A slow photograph never holds the tap up: past the cap, the plain switch.
      run.timer = setTimeout(() => {
        if (run.phase !== 'capturing') return;
        run.missed = true;
        if (run.photoMs != null) noteTiming(`photo ${run.photoMs} ms, picture not on screen by ${CAPTURE_CAP_MS} ms`, true);
        instant(run);
      }, CAPTURE_CAP_MS);
      // One frame first, so the tapped card's check is in the picture.
      requestAnimationFrame(() => {
        if (run.phase !== 'capturing') return;
        if (!app.current) { instant(run); return; }
        captureRef(app.current, { format: 'jpg', quality: PHOTO_QUALITY, result: 'tmpfile', ...photoSize() })
          .then((uri) => {
            const ms = Date.now() - run.t0;
            if (run.phase !== 'capturing') {
              // Too late (or a newer tap took over): only counted when it was the cap that gave up.
              if (run.missed && run.photoMs == null) noteTiming(`photo ${ms} ms, too late for the ${CAPTURE_CAP_MS} ms cap`, true);
              try { releaseCapture(uri); } catch {}
              return;
            }
            run.photoMs = ms;
            run.uri = uri;
            setCovers((list) => [...list, { id: run.id, uri, go: false }]);
          })
          .catch(() => {
            if (run.phase === 'capturing') {
              noteTiming('photo failed', true);
              instant(run);
            }
          });
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
      {/* Newest first, so an older picture still fading stays on top of a newer one. */}
      {covers.slice().reverse().map((cover) => (
        <Cover key={cover.id} cover={cover} onShown={onShown} onFailed={onFailed} onGone={onGone} />
      ))}
    </View>
  );
});

/**
 * One picture of an old look, laid exactly over the app's own box. It starts
 * fully shown (a plain resting value, so a lost animation update can only
 * ever leave it showing, and then the switcher's timer takes it away) and
 * only ever fades once, when `go` turns on.
 */
const Cover = memo(function Cover({ cover, onShown, onFailed, onGone }: { cover: CoverSpec; onShown: (id: number) => void; onFailed: (id: number) => void; onGone: (id: number) => void }) {
  const fade = useSharedValue(1);
  const { id, go } = cover;
  useEffect(() => {
    if (!go) return;
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(onGone)(id);
    };
    fade.value = withTiming(0, { duration: CROSSFADE_MS, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.Never }, finish);
  }, [go, id, fade, onGone]);
  const look = useAnimatedStyle(() => ({ opacity: fade.value }));
  return (
    <Animated.Image
      source={{ uri: cover.uri }}
      onLoad={() => onShown(id)}
      onError={() => onFailed(id)}
      fadeDuration={0}
      resizeMode="stretch"
      style={[StyleSheet.absoluteFill, look]}
    />
  );
});

/*
 * How long the photo takes on real phones, so CAPTURE_CAP_MS can be set from
 * numbers rather than a guess. Each change is logged while developing; on a
 * phone one line a session goes into the app's own error table (app_errors,
 * marked "not a crash"): at the first change that was too slow, or after
 * three changes if none was. No content, only times.
 */
const timing = { runs: 0, missed: 0, lines: [] as string[], filed: false };
function noteTiming(line: string, missed: boolean) {
  timing.runs += 1;
  if (missed) timing.missed += 1;
  if (timing.lines.length < 6) timing.lines.push(`${missed ? 'TOO SLOW ' : ''}${line}`);
  if (__DEV__) console.log(`[theme switch] ${missed ? 'too slow: ' : ''}${line}`);
  if (timing.filed || Platform.OS === 'web') return;
  if (!missed && timing.runs < 3) return;
  timing.filed = true;
  void reportError(
    new Error(`Theme switch timing (not a crash, cap ${CAPTURE_CAP_MS} ms, photo ${PHOTO_DENSITY}x): ${timing.missed} of ${timing.runs} too slow. ${timing.lines.join('; ')}`),
    { where: 'theme-switch' },
  );
}

const styles = StyleSheet.create({
  top: { zIndex: 9999 },
});
