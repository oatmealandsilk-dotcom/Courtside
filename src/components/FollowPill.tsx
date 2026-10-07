import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandWash } from '@/components/ui/BrandWash';
import { useApp } from '@/store/AppContext';
import { colors, typography } from '@/theme';
import { reduceMotionEnabled } from '@/lib/useReducedMotion';

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Follow, and then Following: the pill dips slightly on the tap, settles, and
 * goes quiet (the brand colour drains away) as the check slides in. Under Reduce Motion the
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
  useEffect(() => { reduceMotionEnabled().then((r) => { reduced.current = r; }).catch(() => {}); }, []);
  useEffect(() => { on.value = withTiming(filled ? 1 : 0, { duration: 280, easing: EASE }); }, [filled, on]);

  // The theme's colours are read here, on each draw, and handed to the animation as plain values.
  // Read inside it, they were copied once, from whichever theme the pill first drew in (it stayed
  // Paris orange in every other theme until the app restarted).
  const { surfaceAlt, brand, borderStrong, text, brandInk } = colors;
  // Follow is the coloured one, the thing to tap; once you follow (or have asked to), the pill
  // goes quiet, the way Instagram does it (Oct 2, William: reverse the colours).
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [brand, surfaceAlt]),
    borderColor: interpolateColor(on.value, [0, 1], [brand, surfaceAlt]),
    transform: [{ scale: bump.value }],
  }), [surfaceAlt, brand, borderStrong]);
  const label = useAnimatedStyle(() => ({ color: interpolateColor(on.value, [0, 1], [brandInk, text]) }), [text, brandInk]);
  const wash = useAnimatedStyle(() => ({ opacity: 1 - on.value }));

  const press = () => {
    // A small, quick press: a slight dip and a settle with no wobble (a deeper dip and a loose spring read as a bounce).
    if (!reduced.current) bump.value = withSequence(withTiming(0.96, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${following ? 'Following' : requested ? 'Requested' : 'Follow'}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={6} style={wide ? styles.wide : undefined}>
      <Animated.View style={[styles.pill, small && styles.small, wide && styles.wide, pill]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, wash]}><BrandWash /></Animated.View>
        {filled ? <Ionicons name="checkmark" size={14} color={colors.text} /> : null}
        <Animated.Text style={[styles.text, small && styles.textSmall, label]}>{following ? 'Following' : requested ? 'Requested' : 'Follow'}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Follow as a round button, for a row with no room for a third word (the
 * map's player card, Oct 7): the same sand disc as the buttons beside it,
 * with a person and a plus in the brand's colour until you follow, then the
 * person in ink with a tick (a private account's ask waiting shows dots
 * instead). Only the glyph changes, never the disc, so it stays one of the
 * row's family in every theme: a brand tint behind it went olive on New
 * York's navy. The same dip, haptic and spoken label as FollowPill, and one
 * size whatever it says, so nothing beside it moves when you tap.
 */
export function FollowDisc({ following, onPress, name, userId, size = 44 }: { following: boolean; onPress: () => void; name?: string; userId?: string; size?: number }) {
  useTheme();
  const { followRequests, currentUserId } = useApp();
  const requested = !following && !!userId && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === userId);
  const filled = following || requested;
  const on = useSharedValue(filled ? 1 : 0);
  const bump = useSharedValue(1);
  // 1 while the faces may grow as they cross over; 0 under Reduce Motion, where they only fade.
  const motion = useSharedValue(1);
  const reduced = useRef(false);
  useEffect(() => { reduceMotionEnabled().then((r) => { reduced.current = r; if (r) motion.value = 0; }).catch(() => {}); }, [motion]);
  useEffect(() => { on.value = withTiming(filled ? 1 : 0, { duration: 280, easing: EASE }); }, [filled, on]);

  const disc = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  // The two faces cross over, the new one settling in from a touch smaller.
  const addFace = useAnimatedStyle(() => ({ opacity: 1 - on.value, transform: [{ scale: 1 - on.value * 0.2 * motion.value }] }));
  const doneFace = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 1 - (1 - on.value) * 0.2 * motion.value }] }));

  const press = () => {
    if (!reduced.current) bump.value = withSequence(withTiming(0.94, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    onPress();
  };

  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${following ? 'Following' : requested ? 'Requested' : 'Follow'}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={4}>
      <Animated.View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong }, disc]}>
        <Animated.View pointerEvents="none" style={[styles.face, addFace]}>
          <Ionicons name="person-add-outline" size={19} color={colors.brand} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.face, doneFace]}>
          <View style={styles.person}>
            <Ionicons name="person-outline" size={18} color={colors.text} />
            <View style={[styles.badge, { backgroundColor: colors.text, borderColor: colors.surfaceAlt }]}>
              <Ionicons name={requested ? 'ellipsis-horizontal' : 'checkmark'} size={8} color={colors.surfaceAlt} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  face: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  // The tick sits on the person's shoulder, cut out of it by a ring of the button's own colour.
  person: { width: 18, height: 18, marginRight: 3 },
  badge: { position: 'absolute', right: -6, bottom: -3, width: 13, height: 13, borderRadius: 6.5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  // One width whatever it says, like Instagram: Follow, Following and Requested never change
  // the pill's size, so nothing beside it shifts when you tap (Oct 2). Sized for "✓ Following".
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, width: 116, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  small: { width: 104, paddingVertical: 7, paddingHorizontal: 8 },
  wide: { alignSelf: 'stretch', width: 'auto' },
  text: { ...typography.smallStrong, fontSize: 14 },
  textSmall: { fontSize: 13 },
});
