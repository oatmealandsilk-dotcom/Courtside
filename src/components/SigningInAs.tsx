import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
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
    <Animated.View entering={FadeIn.duration(180)} style={styles.root} accessibilityLiveRegion="polite" accessibilityLabel={`Signing in as ${name}`}>
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
    <Animated.View entering={FadeIn.duration(180)} style={styles.root} accessibilityLiveRegion="polite" accessibilityLabel={`Signing in with ${label}`}>
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
