import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import type { GroupLook } from '@/data/types';
import { GroupTile } from '@/features/groups/GroupTile';
import { colorChoices } from '@/features/groups/look';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, spacing, typography } from '@/theme';
import { useThemedStyles } from '@/theme/ThemeProvider';

/*
 * The moment a group is ready: its face, big, with a green tick that pops on
 * at its corner and a small burst of confetti in the theme's own court
 * colours, then a line on who was invited. With Reduce Motion the tick is
 * simply there and nothing flies. `leaving` says the sheet is about to take
 * you to the group by itself (not with a screen reader on: then it waits
 * for "Go to …", so nothing is cut off mid-sentence).
 */

const PIECES = 18;
const TILE = 104;

function Piece({ i, p, tint }: { i: number; p: SharedValue<number>; tint: string }) {
  // Each piece leaves at its own angle and distance, a few degrees off even, and falls a little as it fades.
  const angle = (i / PIECES) * Math.PI * 2 + ((i * 37) % 11) / 20;
  const dist = 92 + ((i * 53) % 5) * 14;
  const size = 7 + (i % 3) * 2;
  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t < 0.06 ? t / 0.06 : Math.max(0, Math.min(1, 1 - (t - 0.62) / 0.38)),
      transform: [
        { translateX: Math.cos(angle) * dist * t },
        { translateY: Math.sin(angle) * dist * t + 26 * t * t },
        { rotate: `${(i % 2 ? 1 : -1) * 220 * t}deg` },
        { scale: 1 - 0.35 * t },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: size, height: i % 3 === 0 ? size * 1.8 : size, borderRadius: i % 3 === 0 ? 2 : size / 2, backgroundColor: tint }, style]} />;
}

export function Celebrate({ name, look, invited, leaving = true }: { name: string; look: GroupLook; invited: number; leaving?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const reduced = useReducedMotion();
  const burst = useSharedValue(0);
  const pop = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 1 : 0);
  const tints = useMemo(() => colorChoices().map((c) => c.hex), []);
  useEffect(() => {
    if (reduced) { pop.value = 1; rise.value = 1; return; }
    rise.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never });
    pop.value = withDelay(180, withSpring(1, { damping: 11, stiffness: 220, mass: 0.7, reduceMotion: ReduceMotion.Never }));
    burst.value = withDelay(200, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }));
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const tileStyle = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ scale: 0.86 + 0.14 * rise.value }] }));
  const tickStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: 8 * (1 - rise.value) }] }));

  const sent = invited ? `${invited} ${invited === 1 ? 'invite' : 'invites'} sent.` : '';
  const line = leaving ? `${sent}${sent ? ' ' : ''}Taking you to the group…` : sent || 'Its feed is ready for a first post.';
  return (
    <View style={styles.wrap} accessible accessibilityRole="alert" accessibilityLabel={`${name} is ready. ${line}`}>
      <View style={styles.stage}>
        {reduced ? null : tints.length ? Array.from({ length: PIECES }, (_, i) => <Piece key={i} i={i} p={burst} tint={tints[i % tints.length]} />) : null}
        <Animated.View style={tileStyle}>
          <GroupTile name={name} look={look} size={TILE} />
          <Animated.View style={[styles.tick, tickStyle]}>
            <Ionicons name="checkmark" size={20} color={colors.brandInk} />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.View style={[styles.words, wordsStyle]}>
        <Text style={styles.title} numberOfLines={2}>{`${name} is ready`}</Text>
        <Text style={styles.line}>{line}</Text>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.lg },
  stage: { width: 240, height: 200, alignItems: 'center', justifyContent: 'center' },
  tick: {
    position: 'absolute', right: -8, bottom: -8, width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg,
  },
  words: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  title: { ...typography.title, fontSize: 26, letterSpacing: -0.9, color: colors.text, textAlign: 'center' },
  line: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
});
