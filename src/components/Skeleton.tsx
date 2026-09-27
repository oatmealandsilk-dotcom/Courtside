import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing } from '@/theme';

/**
 * Grey outlines of what is about to appear, breathing gently while it loads,
 * instead of a spinner: the page already has its shape, so it feels further
 * along than it is (Instagram's trick). Only opacity moves, on the native
 * animation thread, so it costs nothing while the real content is fetched.
 */
function Breathing({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  return <Animated.View accessibilityLabel="Loading" style={[{ opacity }, style]}>{children}</Animated.View>;
}

export function Bone({ w = '100%', h = 12, r = 6, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.bone, { width: w, height: h, borderRadius: r }, style]} />;
}

/** A player's page: picture, name, the tennis line, then the grid. */
export function ProfileSkeleton() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Breathing style={{ gap: spacing.lg }}>
      <View style={styles.row}>
        <Bone w={84} h={84} r={42} />
        <View style={{ flex: 1, gap: 10 }}>
          <Bone w="60%" h={18} r={9} />
          <Bone w="40%" h={12} />
          <Bone w="70%" h={12} />
        </View>
      </View>
      <View style={styles.row}><Bone h={40} r={20} style={{ flex: 1 }} w={undefined} /><Bone h={40} r={20} style={{ flex: 1 }} w={undefined} /></View>
      <Bone h={92} r={20} />
      <View style={styles.grid}>
        {Array.from({ length: 6 }, (_, i) => <Bone key={i} w="32.6%" h={140} r={4} />)}
      </View>
    </Breathing>
  );
}

/** A thread: the question, then a few replies. */
export function ThreadSkeleton() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Breathing style={{ gap: spacing.lg }}>
      <View style={styles.row}><Bone w={28} h={28} r={14} /><Bone w="35%" h={12} /></View>
      <View style={{ gap: 8 }}><Bone w="92%" h={20} r={8} /><Bone w="70%" h={20} r={8} /></View>
      <View style={{ gap: 7 }}><Bone w="100%" /><Bone w="96%" /><Bone w="60%" /></View>
      <View style={styles.row}><Bone w={64} h={30} r={15} /><Bone w={44} h={30} r={15} /><Bone w={44} h={30} r={15} /></View>
      <View style={styles.divider} />
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={styles.row}><Bone w={30} h={30} r={15} /><Bone w="30%" h={12} /></View>
          <View style={{ gap: 7, paddingLeft: 42 }}><Bone w="95%" /><Bone w="75%" /></View>
        </View>
      ))}
    </Breathing>
  );
}

/** A list of people: picture and two lines each. */
export function PeopleSkeleton({ rows = 7 }: { rows?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Breathing style={{ gap: 18 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Bone w={44} h={44} r={22} />
          <View style={{ flex: 1, gap: 8 }}><Bone w={`${55 - (i % 3) * 8}%`} h={13} /><Bone w={`${35 + (i % 2) * 10}%`} h={11} /></View>
          <Bone w={78} h={32} r={16} />
        </View>
      ))}
    </Breathing>
  );
}

const styleDefinitions = StyleSheet.create({
  bone: { backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
