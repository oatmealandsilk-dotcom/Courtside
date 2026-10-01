import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandWash } from '@/components/ui/BrandWash';
import { useApp } from '@/store/AppContext';
import { colors, typography } from '@/theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Follow, and then Following: the pill dips slightly on the tap, settles, and
 * fills with the brand colour as the check slides in. Under Reduce Motion the
 * colour still changes; nothing moves. A private account (given `userId`)
 * does exactly the same and reads "Requested" until they accept; tapping
 * it again takes the ask back.
 */
export function FollowPill({ following, onPress, small = false, name, userId, wide = false }: { following: boolean; onPress: () => void; small?: boolean; name?: string; userId?: string; /** Fills the width it is given (a suggestion card's button). */ wide?: boolean }) {
  useTheme();
  const { followRequests, currentUserId } = useApp();
  const requested = !following && !!userId && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === userId);
  const filled = following || requested;
  const on = useSharedValue(filled ? 1 : 0);
  const bump = useSharedValue(1);
  const reduced = useRef(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduced.current = r; }).catch(() => {}); }, []);
  useEffect(() => { on.value = withTiming(filled ? 1 : 0, { duration: 280, easing: EASE }); }, [filled, on]);

  // The theme's colours are read here, on each draw, and handed to the animation as plain values.
  // Read inside it, they were copied once, from whichever theme the pill first drew in (it stayed
  // Paris orange in every other theme until the app restarted).
  const { surfaceAlt, brand, borderStrong, text, brandInk } = colors;
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [surfaceAlt, brand]),
    borderColor: interpolateColor(on.value, [0, 1], [borderStrong, brand]),
    transform: [{ scale: bump.value }],
  }), [surfaceAlt, brand, borderStrong]);
  const label = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [text, brandInk]) }), [text, brandInk]);
  const wash = useAnimatedStyle(() => ({ opacity: on.value }));

  const press = () => {
    // A small, quick press: a slight dip and a settle with no wobble (a deeper dip and a loose spring read as a bounce).
    if (!reduced.current) bump.value = withSequence(withTiming(0.96, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${following ? 'Following' : requested ? 'Requested' : 'Follow'}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={4} style={wide ? styles.wide : undefined}>
      <Animated.View style={[styles.pill, small && styles.small, wide && styles.wide, pill]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, wash]}><BrandWash /></Animated.View>
        {filled ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : null}
        <Animated.Text style={[styles.text, small && styles.textSmall, label]}>{following ? 'Following' : requested ? 'Requested' : 'Follow'}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  small: { paddingVertical: 7, paddingHorizontal: 12 },
  wide: { alignSelf: 'stretch' },
  text: { ...typography.smallStrong, fontSize: 14 },
  textSmall: { fontSize: 13 },
});
