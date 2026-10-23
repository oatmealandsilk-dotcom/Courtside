import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

/*
 * Motion that can never be left in an old place on an iPhone (Oct 23).
 *
 * Reanimated 4.5 on a phone hands an animated style's settled values back to
 * React (every 500 ms, for values still for 1–2 s) and drops the ones still
 * for longer unsynced (JS busy, the app sent to the background). After a
 * dropped value, the next React draw puts back the view's first-frame value
 * or an older synced one, and those synced values win over any plain style.
 * So a view whose animation rests at more than one look (on, then off; one
 * height, then another) needs one of these:
 *
 * - useRestKey: a key bumped each time it comes to rest, given to the view,
 *   so the view is built afresh at rest (its first frame is then the rest,
 *   and it carries no older synced value). For small leaf views.
 * - useRestLength: a box whose height (or width) glides. React holds the
 *   resting size as a plain style; the animation only clamps it while it
 *   moves, and at every rest writes the same open limits, so a dropped or
 *   synced value can never shrink or stretch it.
 */

/** Far larger than anything on screen: "no limit" while a box is at rest. */
export const NO_LIMIT = 100000;

/** A key for a view that is rebuilt at each rest on a phone (a browser never needs it). `bump` is safe to call from runOnJS. */
export function useRestKey(): [number, () => void] {
  const [key, setKey] = useState(0);
  const bump = useCallback(() => {
    if (Platform.OS !== 'web') setKey((k) => k + 1);
  }, []);
  return [key, bump];
}

type Run = (to: number, done: (finished?: boolean) => void) => number;

/**
 * A box's height (or width) that glides between sizes, with its resting size
 * held by React. `style` goes on the box, after its own style. `glide(n, run)`
 * eases there with the animation `run` builds (withTiming, withSpring);
 * `jump(n)` takes it at once. `then` runs once a glide has landed.
 */
export function useRestLength(dim: 'height' | 'width', initial: number | null = null) {
  const [rest, setRest] = useState<number | null>(initial);
  const restRef = useRef<number | null>(initial);
  const target = useRef<number | null>(initial);
  const thenRef = useRef<(() => void) | null>(null);
  const v = useSharedValue(initial ?? 0);
  const moving = useSharedValue(0);
  const wide = dim === 'width';
  const clamp = useAnimatedStyle(() => {
    if (!moving.value) return wide ? { minWidth: 0, maxWidth: NO_LIMIT } : { minHeight: 0, maxHeight: NO_LIMIT };
    return wide ? { minWidth: v.value, maxWidth: v.value } : { minHeight: v.value, maxHeight: v.value };
  }, [wide]);
  const put = useCallback((n: number) => { restRef.current = n; setRest(n); }, []);
  // React's size is in place: the clamp can let go (it holds the same size).
  useLayoutEffect(() => { if (rest === target.current) moving.value = 0; }, [rest, moving]);
  const settle = useCallback((n: number) => {
    if (n !== target.current) return;
    if (n === restRef.current) moving.value = 0;
    else put(n);
    const then = thenRef.current;
    thenRef.current = null;
    then?.();
  }, [moving, put]);
  const jump = useCallback((n: number) => {
    target.current = n;
    thenRef.current = null;
    cancelAnimation(v);
    v.value = n;
    if (n === restRef.current) moving.value = 0;
    else put(n);
  }, [v, moving, put]);
  const glide = useCallback((n: number, run: Run, then?: () => void) => {
    target.current = n;
    thenRef.current = then ?? null;
    // From where it rests (mid-glide, from where it has got to).
    if (!moving.value) v.value = restRef.current ?? 0;
    moving.value = 1;
    v.value = run(n, (finished) => {
      'worklet';
      if (finished) runOnJS(settle)(n);
    });
  }, [v, moving, settle]);
  const style = [rest != null ? (wide ? { width: rest } : { height: rest }) : null, clamp];
  return { rest, style, glide, jump, target };
}
