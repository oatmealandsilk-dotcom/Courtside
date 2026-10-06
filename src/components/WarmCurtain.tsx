import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

import { BrandMark } from '@/components/BrandMark';
import { LaunchMark } from '@/components/LaunchMark';
import { MAP_WAIT_MS, curtainLiftBy, curtainReadyAnyway, launchSettle, setCurtainDown, setMapWaitOver, useCurtainReady, useStartDrawn } from '@/features/feed/warmup';
import { colors, spacing, font } from '@/theme';

/**
 * The splash, kept up over the app until the page it opens on is ready, then
 * faded out once. It lives in the shell rather than on any one screen, so
 * the move from the splash route into the tabs happens underneath it. The
 * app opens on Community (see startTab): the curtain lifts as soon as that
 * page has drawn, not when the feed is in, and the feed shows its own
 * loading pages the first time you get to it rather than the logo again.
 *
 * "Drawn" includes the map card at the top of Find Players (see
 * useStartMapHold), for at most MAP_WAIT_MS: lifting onto an empty card that
 * then filled in read as a second cut. The lift is one motion: the logo
 * fades and drifts up and away while the page beneath settles from a touch
 * large into place (launchSettle, in AppShell), on the same curve. With
 * Reduce Motion on, it is a plain fade.
 */
/**
 * The longest the curtain ever stays up, counted from the first time it is
 * drawn. Whatever the page under it is doing (no connection, nothing to
 * show, a load that never finishes), the app is never left behind the logo
 * with no way on: after this it lifts anyway, the bar comes up, and the
 * page shows what it has.
 */
const CURTAIN_MAX_MS = 10_000;
/** The lift: long enough to read as the page arriving, short enough not to keep anyone waiting (560 ms until Oct 6, when the owner found opening too slow). */
const LIFT_MS = 320;
const LIFT_EASE = Easing.bezier(0.33, 0, 0.15, 1);

export function WarmCurtain() {
  const styles = useThemedStyles(styleDefinitions);
  const warm = useCurtainReady();
  const drawn = useStartDrawn();
  const still = useReducedMotion();
  const [shown, setShown] = useState(!warm);
  // Once the lift has begun it never takes touches again, even if a map on the
  // page asks it to wait a moment longer while it fades (see useStartMapHold).
  const [lifting, setLifting] = useState(false);
  // 1 while the curtain covers everything, 0 once it has gone.
  const fade = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: fade.value }));
  // The mark and name drift up and grow a touch as they go: away, not just out.
  const brandStyle = useAnimatedStyle(() => (still ? {} : {
    transform: [{ translateY: (1 - fade.value) * -14 }, { scale: 1 + (1 - fade.value) * 0.05 }],
  }));
  // Hidden under the curtain, the page waits a touch large, ready to settle.
  useEffect(() => {
    if (shown && !still) launchSettle.value = 1;
    // However the curtain goes (lifted, or taken away by a change of page), the page is left at rest.
    return () => { launchSettle.value = 0; };
  }, [shown, still]);
  useEffect(() => {
    if (!warm || !shown) return;
    setLifting(true);
    const timing = { duration: still ? 320 : LIFT_MS, easing: LIFT_EASE };
    launchSettle.value = still ? 0 : withTiming(0, timing);
    fade.value = withTiming(0, timing, (finished) => { if (finished) { runOnJS(setShown)(false); runOnJS(setCurtainDown)(); } });
  }, [warm, shown, fade, still]);
  // Not shown at all (the page was already ready): playback need not wait on it.
  useEffect(() => { if (!shown) setCurtainDown(); }, [shown]);
  useEffect(() => {
    if (warm) return undefined;
    const t = setTimeout(curtainReadyAnyway, Math.max(0, curtainLiftBy(CURTAIN_MAX_MS) - Date.now()));
    return () => clearTimeout(t);
  }, [warm]);
  // The page has drawn: its map gets a short grace to draw too, never longer.
  useEffect(() => {
    if (warm || !drawn) return undefined;
    const t = setTimeout(setMapWaitOver, MAP_WAIT_MS);
    return () => clearTimeout(t);
  }, [warm, drawn]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents={warm || lifting ? 'none' : 'auto'} style={[styles.curtain, style]}>
      {Platform.OS !== 'web' ? (
        // On a phone: the launch picture's logo and line in the theme's colours, drawn exactly where the
        // launch picture draws them, the same as the screen before it: it lifts into the app (Oct 4).
        <Animated.View style={[StyleSheet.absoluteFill, brandStyle]}>
          <LaunchMark ink={colors.brand} faint={colors.textFaint} />
        </Animated.View>
      ) : (
        <>
          <Animated.View style={[styles.brand, brandStyle]}>
            <BrandMark size={76} />
            <Text style={styles.wordmark}>CourtSide</Text>
          </Animated.View>
          <Text style={styles.tagline}>Growing the game</Text>
        </>
      )}
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  curtain: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 60 },
  brand: { alignItems: 'center', gap: 22 },
  launchPicture: { backgroundColor: '#F8F7F2' },
  wordmark: { fontSize: 30, ...font('700'), color: colors.brand, letterSpacing: -0.9 },
  // 96 points up, the same place the launch image draws it, so nothing jumps when one hands over to the other.
  tagline: { position: 'absolute', bottom: 91, fontSize: 12, ...font('600'), letterSpacing: 1.4, color: colors.textFaint, textTransform: 'uppercase' },
});
