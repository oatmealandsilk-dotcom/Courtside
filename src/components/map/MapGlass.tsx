import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { colors } from '@/theme';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The see-through fill of the full map's floating controls (Back, the search
 * bar, Location, the "All N players" pill, Back to me, the search list).
 *
 * Oct 22, owner: "this button should either stay transparent or not" — he
 * wants it to STAY transparent, every time. Apple's own glass (GlassView)
 * could not promise that: put up while anything round it was fading it came
 * out a flat filled plate, and the workarounds (putting it up again later,
 * a veil until then) made it differ from one opening of the map to the next.
 * So these controls no longer use any live effect at all, on any phone or in
 * the browser: one fixed, see-through fill of the theme's own surface colour,
 * the same every frame, in every theme. The hairline edge and the soft
 * shadow stay where they were (the caller's style and its wrapper).
 *
 * An animated view, so a control can glide to a new size (the players pill's
 * width, the search list's height: Oct 22 sweep). Its fill is never faded.
 *
 * `dense` is for what holds rows of words to read (the search list), so the
 * map under it never muddles them; still a touch see-through.
 */
export function MapGlass({ children, style, radius, dense = false }: { children?: React.ReactNode; style?: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>; radius: number; dense?: boolean }) {
  // Read on every draw (with the theme), so the fill is always the court you are on.
  const { dark } = useTheme();
  const alpha = dense ? 'E6' : dark ? '8C' : '80';
  return <Animated.View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: `${colors.surface.slice(0, 7)}${alpha}` }, style]}>{children}</Animated.View>;
}
