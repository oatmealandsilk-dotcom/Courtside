import React, { useEffect, useRef } from 'react';
import Reanimated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LIKE_RED, RailGlyph } from '@/components/RailGlyph';

export { LIKE_RED };

/**
 * The like heart. A double tap on the picture (the feed hands in a fresh
 * `pop` count each time) makes it grow and settle, quick, on the animation
 * thread. A tap on the button itself has the button's own dip and needs
 * nothing more here. On a clip's rail (`rail`) it is drawn in the rail's
 * look (RAIL_ICONS_LOOK), with the rest of the rail.
 */
export function Heart({ liked, pop: token = 0, size = 36, ink = 'white', style, rail = false }: { liked: boolean; pop?: number; size?: number; ink?: string; style?: object; rail?: boolean }) {
  const pop = useSharedValue(1);
  const seen = useRef(token);
  useEffect(() => {
    if (token && token !== seen.current) pop.value = withSequence(withTiming(1.3, { duration: 90 }), withTiming(1, { duration: 140 }));
    seen.current = token;
  }, [token, pop]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Reanimated.View style={animated}>
      {rail ? <RailGlyph icon="heart" on={liked} size={size} ink={ink} style={style} /> : <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? LIKE_RED : ink} style={style} />}
    </Reanimated.View>
  );
}
