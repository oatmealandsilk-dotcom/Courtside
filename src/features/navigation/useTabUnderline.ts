import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Easing, runOnUI, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const easeOut = Easing.out(Easing.cubic);
/**
 * The glide's curve, held at its start until the glide has begun. A browser
 * busy drawing the new tab can hand the first frame a time from just before
 * the glide started, and the curve run backwards from there threw the line a
 * little the wrong way first (on Profile, up to a quarter of a tab).
 */
function glideCurve(t: number) {
  'worklet';
  return easeOut(Math.max(0, t));
}

/**
 * The underline beneath a row of tabs, kept on the animation thread.
 *
 * `progress` is written by the page swipe itself while the finger is down
 * (-1..1, toward the next tab), so the line moves in the very same frame as
 * the page instead of a beat behind it. A tap glides it; a finished swipe has
 * already carried it to the new tab, so it simply lands there.
 */
export function useTabUnderline(index: number, count: number, tabWidth: number) {
  const progress = useSharedValue(0);
  const base = useSharedValue(index);
  useEffect(() => {
    // The line carries on from wherever it is drawn right now: part way along
    // with a swipe that is still settling, or mid-glide. Starting the glide
    // from the old tab made it jump back first when a tab was tapped while a
    // swipe settled.
    const glide = (to: number, end: number) => {
      'worklet';
      const at = Math.max(0, Math.min(end, base.value + progress.value));
      progress.value = 0;
      // A finished swipe has already carried it there, so it simply lands.
      if (Math.abs(at - to) < 0.01) { base.value = to; return; }
      base.value = at;
      base.value = withTiming(to, { duration: 240, easing: glideCurve });
    };
    // On the phone the line moves on the animation thread, so it is read and
    // moved there in one go and never slips a frame in between. A browser has
    // only the one thread, and there it happens straight away.
    if (Platform.OS === 'web') glide(index, count - 1);
    else runOnUI(glide)(index, count - 1);
  }, [index, count, base, progress]);
  const style = useAnimatedStyle(() => {
    const at = Math.max(0, Math.min(count - 1, base.value + progress.value));
    return { transform: [{ translateX: at * tabWidth }] };
  });
  return { progress, style };
}
