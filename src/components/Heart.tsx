import React, { useEffect, useRef } from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

/** The heart's red: bright and warm, the one that gets a reaction. */
export const LIKE_RED = '#FF3B5C';

/**
 * The like heart. Whenever it turns red — from a tap on it or a double tap
 * on the picture — it pops once, quick and small, on the animation thread.
 */
export function Heart({ liked, size = 36, ink = 'white', style }: { liked: boolean; size?: number; ink?: string; style?: object }) {
  const pop = useSharedValue(1);
  const was = useRef(liked);
  useEffect(() => {
    if (liked && !was.current) pop.value = withSequence(withTiming(1.3, { duration: 90 }), withTiming(1, { duration: 140 }));
    was.current = liked;
  }, [liked, pop]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Reanimated.View style={animated}>
      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? LIKE_RED : ink} style={style} />
    </Reanimated.View>
  );
}
