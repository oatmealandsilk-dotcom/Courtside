import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import * as haptics from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { BrandWash } from '@/components/ui/BrandWash';
import { useApp } from '@/store/AppContext';
import { colors, readsOn, typography } from '@/theme';
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
 * Follow on the map's player card, in a row with Ask to hit, Message and ⋯
 * (Oct 7): the word until you follow, then a small round button.
 *
 * Not following, it is a pill that says "Follow", ringed in the brand's
 * colour on the card's own colour: easy to find (following is how friends
 * see each other on the map) without a second filled green pill beside Ask
 * to hit. The word takes the brand's colour where that reads at 4.5:1 on the
 * card, and the palette's ink where it does not (Melbourne's sky blue).
 *
 * Tap it and the pill draws in to the quiet disc of the buttons beside it:
 * a person in ink with a tick, or with dots while a private account's ask
 * waits ("Requested"). Unfollow (from the disc or the ⋯ menu) and it opens
 * back out into the word. The pills beside it take up the room it gives
 * back as it goes, and hand it back as it opens.
 * Reduce Motion: no change of size is animated; the faces only fade.
 *
 * `followsYou` changes only what it says to a screen reader ("Follow back"):
 * the words "Follow back" do not fit in the row on a small phone.
 */
export function FollowShrink({ following, onPress, name, userId, followsYou = false, size = 44 }: { following: boolean; onPress: () => void; name?: string; userId?: string; followsYou?: boolean; size?: number }) {
  useTheme();
  const { followRequests, currentUserId } = useApp();
  const requested = !following && !!userId && !!currentUserId && followRequests.some((r) => r.fromId === currentUserId && r.toId === userId);
  const filled = following || requested;
  // `on` crosses the faces and colours over; `shut` draws the width in (0 = the word's width, 1 = the disc).
  const on = useSharedValue(filled ? 1 : 0);
  const shut = useSharedValue(filled ? 1 : 0);
  const bump = useSharedValue(1);
  const motion = useSharedValue(1);
  const reduced = useRef(false);
  // How wide the word is, measured from a hidden copy of it, so the pill knows the width to open
  // back out to and the word is never squeezed into "Fo…" while the pill draws in. 0 until
  // measured: the pill then sizes itself around the word.
  const [wordText, setWordText] = useState(0);
  const wordWidth = wordText ? wordText + 2 * SHRINK_PAD + 2 : 0;
  useEffect(() => { reduceMotionEnabled().then((r) => { reduced.current = r; if (r) motion.value = 0; }).catch(() => {}); }, [motion]);
  useEffect(() => {
    on.value = withTiming(filled ? 1 : 0, { duration: 260, easing: EASE });
    shut.value = reduced.current ? (filled ? 1 : 0) : withTiming(filled ? 1 : 0, { duration: 320, easing: EASE });
  }, [filled, on, shut]);

  // Read on each draw and handed in as plain values (see FollowPill: read inside, they stick to the first theme).
  const { surface, surfaceAlt, brand, borderStrong, text } = colors;
  const wordInk = readsOn(brand, surface) ? brand : text;
  const box = useAnimatedStyle(() => {
    const look = {
      backgroundColor: interpolateColor(on.value, [0, 1], [surface, surfaceAlt]),
      borderColor: interpolateColor(on.value, [0, 1], [brand, borderStrong]),
      transform: [{ scale: bump.value }],
    };
    if (wordWidth > 0) return { ...look, width: wordWidth + (size - wordWidth) * shut.value };
    return shut.value > 0.5 ? { ...look, width: size } : look;
  }, [wordWidth, size, surface, surfaceAlt, brand, borderStrong]);
  // The word goes before the pill is too narrow for it, and comes back once there is room.
  const word = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - on.value * 1.8) }));
  const done = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 1 - (1 - on.value) * 0.2 * motion.value }] }));

  const press = () => {
    if (!reduced.current) bump.value = withSequence(withTiming(0.95, { duration: 60, easing: EASE }), withSpring(1, { damping: 20, stiffness: 320 }));
    haptics.tap();
    onPress();
  };

  const said = following ? 'Following' : requested ? 'Requested' : followsYou ? 'Follow back' : 'Follow';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: filled }} accessibilityLabel={`${said}${name ? ` ${name}` : ''}`} onPress={press} hitSlop={4}>
      <Animated.View style={[styles.shrink, { height: size, borderRadius: size / 2 }, box]}>
        <Animated.Text style={[styles.shrinkWord, { color: wordInk }, wordText ? { width: wordText } : null, word]} numberOfLines={1}>Follow</Animated.Text>
        <Animated.View pointerEvents="none" style={[styles.face, done]}>
          <View style={styles.person}>
            <Ionicons name="person-outline" size={18} color={text} />
            <View style={[styles.badge, { backgroundColor: text, borderColor: surfaceAlt }]}>
              <Ionicons name={requested ? 'ellipsis-horizontal' : 'checkmark'} size={8} color={surfaceAlt} />
            </View>
          </View>
        </Animated.View>
      </Animated.View>
      {/* The measure: the same word, unsqueezed, never seen or read out. */}
      <View pointerEvents="none" style={styles.measure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Text style={styles.shrinkWord} numberOfLines={1} onLayout={(e) => {
          const w = Math.ceil(e.nativeEvent.layout.width);
          if (w > 0 && w !== wordText) setWordText(w);
        }}>Follow</Text>
      </View>
    </Pressable>
  );
}

/** The word pill's padding either side of "Follow". */
const SHRINK_PAD = 12;

const styles = StyleSheet.create({
  // FollowShrink: the word pill, which draws in to a disc. Clipped, so the word never shows past it.
  shrink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SHRINK_PAD, borderWidth: 1, overflow: 'hidden' },
  shrinkWord: { ...typography.smallStrong, fontSize: 14, flexShrink: 0 },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0 },
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
