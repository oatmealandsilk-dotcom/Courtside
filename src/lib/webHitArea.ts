import { Platform, type ViewStyle } from 'react-native';

/**
 * A bigger tap area on the website for a small button, with nothing moving (Nov 27 audit, A8): the browser
 * build ignores hitSlop, so a 15-23 px word or chip was all there was to hit (WCAG 2.5.8 asks for 24, ideally 44).
 * Padding grows the button's box and an equal negative margin takes the room back, so it draws exactly where it
 * did. Phones keep hitSlop, which works there; this returns nothing on them.
 * `x` is left out of the horizontal margin's left side when the button is pushed right by marginLeft: 'auto'.
 */
export function webHitArea(y: number, x = y, { pushedRight = false } = {}): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return pushedRight
    ? { paddingVertical: y, marginVertical: -y, paddingHorizontal: x, marginRight: -x }
    : { paddingVertical: y, marginVertical: -y, paddingHorizontal: x, marginHorizontal: -x };
}
