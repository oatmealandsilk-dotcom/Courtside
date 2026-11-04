import { useEffect, useRef } from 'react';
import { Animated, type EasingFunction } from 'react-native';

/**
 * A 0 → 1 clock that starts over from 0 forever (Reanimated's withRepeat(withTiming(1), -1, false)), run by React
 * Native's native animation driver (Nov 4, owner: "Our app just runs so laggy").
 *
 * Why: a Reanimated loop that changes a view's look every frame asks the whole app's screen to be redrawn every frame
 * (a "commit"), and each of those costs time in proportion to every view in the app. The Open to hit rings breathing
 * in Community alone took about 384 ms of every second of the phone's main thread while the tab sat still (Nov 2
 * sample; 71 ms with them off), up to 120 times a second on his 120 Hz iPhone, so every scroll and swipe there had
 * less of the phone left. The native driver moves the view itself, frame by frame, with no redraw of the app at all
 * (as Skeleton's breathing already did).
 *
 * The same curve and the same timing: the driver steps through the eased curve sampled every 1/60 s, drawn straight
 * between samples, which is within a hair of the curve itself. `run` false: stopped, back at 0 (as the loops rested
 * before). The caller derives its opacity and scale from it with interpolate, exactly as its old frame function did.
 */
export function useNativeLoop(run: boolean, duration: number, easing: EasingFunction): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!run) { value.setValue(0); return undefined; }
    value.setValue(0);
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => { loop.stop(); value.setValue(0); };
  }, [run, duration, easing, value]);
  return value;
}
