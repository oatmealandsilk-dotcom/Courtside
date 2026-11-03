import { useMemo } from 'react';
import { Platform, View, type ColorValue, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTapFast } from '@/features/navigation/pressV2';

/**
 * A straight top-to-bottom shade (a scrim or a fade), drawn the same as expo-linear-gradient's
 * default direction, for the shades that stay on screen in the four main tabs while a page opens
 * over them.
 *
 * Why (Nov 2, owner: "Clicking should respond much faster"): on an iPhone, expo-linear-gradient
 * repaints itself on the main thread, by hand, every time iOS tells the views underneath that a
 * page is opening over them (LinearGradientView's traitCollectionDidChange). The Feed's shades
 * behind the clip words were the bulk of it (about 21 ms of the main thread per page opened, by
 * `sample`, against 2 with this on), and that repaint sat right before the page's slide could
 * start: with this on, pages opened from the tabs started sliding 0.02-0.04 s sooner in the
 * Simulator (Nov 2). React Native's own gradient (a style's backgroundImage) is a CAGradientLayer
 * that iOS draws itself, so nothing is repainted then. For a shade of one colour fading in or out
 * (every use of this) the two match to within 2 shades out of 255 (the two dither a little
 * differently), which the eye cannot see.
 *
 * Behind pressV2's TAP_FAST (admins first, like the other quicker taps), on iOS only: the web
 * build keeps expo's gradient (already a CSS gradient there, with no repaint to save, and
 * react-native-web may not draw backgroundImage), and Android keeps it too.
 *
 * Only for a single colour fading (the same colour at every stop, only its see-through changing):
 * with two colours the two gradients can blend the middle differently, so those stay on
 * LinearGradient.
 *
 * Look check (Nov 3, Simulator, Clean and Night, screenshots with this off and on): the clip's top
 * shade, the shade behind a clip's words and a Discussions card's fade in the Feed came out within
 * 2 shades in 255 (a few edge pixels of the words over or under them 3). The opened caption's shade
 * came out up to 5 apart, so ReelCaption keeps expo's gradient for that one.
 */
export function ShadeGradient({ colors, locations, style, pointerEvents }: {
  colors: readonly [ColorValue, ColorValue, ...ColorValue[]];
  /** 0 to 1 down the shade, one per colour; evenly spread when left out (as LinearGradient). */
  locations?: readonly [number, number, ...number[]] | null;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: ViewProps['pointerEvents'];
}) {
  const fast = useTapFast() && Platform.OS === 'ios';
  const image = useMemo(() => {
    // Only colours written out ('#rrggbb', 'rgba(...)'): one of the phone's own named colours (PlatformColor) is
    // not a string and cannot go into a CSS gradient, so that shade stays expo's.
    if (!fast || !colors.every((c) => typeof c === 'string')) return null;
    const n = colors.length;
    // A CSS gradient straight down ('to bottom', expo's default start and end), each stop at its location.
    return `linear-gradient(180deg, ${colors.map((c, i) => `${String(c)} ${((locations?.[i] ?? (n > 1 ? i / (n - 1) : 0)) * 100).toFixed(4)}%`).join(', ')})`;
  }, [fast, colors, locations]);
  if (image) return <View pointerEvents={pointerEvents} style={[style, { experimental_backgroundImage: image }]} />;
  return <LinearGradient pointerEvents={pointerEvents} colors={colors} locations={locations ?? undefined} style={style} />;
}
