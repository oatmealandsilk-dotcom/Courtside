import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { colors, typography } from '@/theme';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Follow, and then Following: the pill dips on the tap, springs back, and
 * fills with the brand colour as the check slides in. Under Reduce Motion the
 * colour still changes; nothing moves.
 */
export function FollowPill({ following, onPress, small = false, name }: { following: boolean; onPress: () => void; small?: boolean; name?: string }) {
  useTheme();
  const on = useSharedValue(following ? 1 : 0);
  const bump = useSharedValue(1);
  const reduced = useRef(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduced.current = r; }).catch(() => {}); }, []);
  useEffect(() => { on.value = withTiming(following ? 1 : 0, { duration: 280, easing: EASE }); }, [following, on]);

  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.surfaceAlt, colors.brand]),
    borderColor: interpolateColor(on.value, [0, 1], [colors.borderStrong, colors.brand]),
    transform: [{ scale: bump.value }],
  }));
  const label = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [colors.text, colors.brandInk]) }));

  const press = () => {
    if (!reduced.current) bump.value = withSequence(withTiming(0.92, { duration: 70 }), withSpring(1, { damping: 11, stiffness: 260 }));
    haptics.tap();
    onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: following }} accessibilityLabel={`${following ? 'Following' : 'Follow'}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={4}>
      <Animated.View style={[styles.pill, small && styles.small, pill]}>
        {following ? <Ionicons name="checkmark" size={14} color={colors.brandInk} /> : null}
        <Animated.Text style={[styles.text, small && styles.textSmall, label]}>{following ? 'Following' : 'Follow'}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  small: { paddingVertical: 7, paddingHorizontal: 12 },
  text: { ...typography.smallStrong, fontSize: 14 },
  textSmall: { fontSize: 13 },
});
