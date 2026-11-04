import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui';
import { Wash } from '@/components/Wash';
import { BrandMark } from '@/components/BrandMark';
import { colors, lift, spacing, typography } from '@/theme';

const PHOTO = 112;
const RING = PHOTO + 22;
const STROKE = 3;
const R = (RING - STROKE) / 2;
const LAP = 2 * Math.PI * R;

// On the web a leaving view is copied and the ring's ZoomIn restarts inside the
// copy, so there the overlay is kept mounted and faded out by Lingering instead.
const WEB = Platform.OS === 'web';
const OUT_MS = 200;
const OVERLAY_OUT = WEB ? undefined : FadeOut.duration(OUT_MS);

/**
 * Shows `children(value)` while there is a value. On native it simply goes
 * (the overlay's own exiting fades it); on the web it stays on screen, out of
 * the way of taps, and fades out over OUT_MS before it goes.
 */
export function Lingering<T>({ value, children }: { value: T | null | undefined; children: (v: T) => React.ReactNode }) {
  const kept = useRef<T | null>(null);
  if (value != null) kept.current = value;
  const present = value != null;
  const [, setGone] = useState(0);
  const fade = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  useEffect(() => {
    if (present) { fade.value = 1; return undefined; }
    if (!WEB || kept.current == null) { kept.current = null; return undefined; }
    fade.value = withTiming(0, { duration: OUT_MS });
    const done = setTimeout(() => { kept.current = null; setGone((n) => n + 1); }, OUT_MS + 40);
    return () => clearTimeout(done);
  }, [present, fade]);
  if (!WEB) return present ? <>{children(value as T)}</> : null;
  const shown = present ? (value as T) : kept.current;
  if (shown == null) return null;
  return (
    <Animated.View pointerEvents={present ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, { zIndex: 100 }, fadeStyle]}>
      {children(shown)}
    </Animated.View>
  );
}

/**
 * Picking a saved account: the whole screen becomes that account — its
 * picture grows into the middle, a thin arc turns around it while the
 * account loads, and the app opens from there. Instead of a spinner on the
 * list you just tapped.
 */
export function SigningInAs({ name, handle, avatarUrl, seed }: { name: string; handle?: string; avatarUrl?: string; seed: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const spin = useSpin();
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={OVERLAY_OUT} style={styles.root} accessibilityLiveRegion="polite" accessibilityLabel={`Signing in as ${name}`}>
      <Wash height={420} />
      <Animated.View entering={ZoomIn.duration(360).easing(Easing.out(Easing.cubic))} style={styles.center}>
        <View style={styles.ringBox}>
          <Animated.View style={[StyleSheet.absoluteFill, spin]}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill="none" />
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.brand} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={`${LAP * 0.24} ${LAP}`} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
            </Svg>
          </Animated.View>
          <Avatar name={name || handle || '?'} seed={seed} uri={avatarUrl} size={PHOTO} />
        </View>
        <Text style={styles.name} numberOfLines={1}>{name || (handle ? `@${handle}` : 'Your account')}</Text>
        {handle && name ? <Text style={styles.handle}>@{handle}</Text> : null}
      </Animated.View>
    </Animated.View>
  );
}

/** The thin arc that turns around whatever sits in the middle. */
function useSpin() {
  const turn = useSharedValue(0);
  useEffect(() => { turn.value = withRepeat(withTiming(360, { duration: 1100, easing: Easing.linear }), -1, false); }, [turn]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
}

/**
 * Continue with Apple or Google: the same moment as picking a saved account,
 * with the service's mark in the middle, so the page answers the tap at once
 * — behind Apple's own sheet, and while the account opens afterwards.
 */
export function SigningInWith({ provider }: { provider: 'apple' | 'google' }) {
  const styles = useThemedStyles(styleDefinitions);
  const spin = useSpin();
  const label = provider === 'apple' ? 'Apple' : 'Google';
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={OVERLAY_OUT} style={styles.root} accessibilityLiveRegion="polite" accessibilityLabel={`Signing in with ${label}`}>
      <Wash height={420} />
      <Animated.View entering={ZoomIn.duration(360).easing(Easing.out(Easing.cubic))} style={styles.center}>
        <View style={styles.ringBox}>
          <Animated.View style={[StyleSheet.absoluteFill, spin]}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.border} strokeWidth={STROKE} fill="none" />
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={colors.brand} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={`${LAP * 0.24} ${LAP}`} transform={`rotate(-90 ${RING / 2} ${RING / 2})`} />
            </Svg>
          </Animated.View>
          <View style={styles.disc}>
            <BrandMark size={52} />
            <View style={styles.badge}><Ionicons name={provider === 'apple' ? 'logo-apple' : 'logo-google'} size={18} color={colors.text} /></View>
          </View>
        </View>
        <Text style={styles.name}>Signing in with {label}</Text>
        <Text style={styles.handle}>Getting CourtSide ready for you</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  disc: { width: PHOTO, height: PHOTO, borderRadius: PHOTO / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...lift },
  badge: { position: 'absolute', right: 2, bottom: 2, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.sm, paddingBottom: 60 },
  ringBox: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  name: { ...typography.title, color: colors.text },
  handle: { ...typography.body, color: colors.textMuted },
});
