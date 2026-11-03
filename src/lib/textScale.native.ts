/* eslint-disable @typescript-eslint/no-require-imports */
import type React from 'react';
import { Platform, StyleSheet, type TextStyle } from 'react-native';

import { colors, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * Text follows the phone's text size setting, up to a point. iPhone's normal
 * sizes (up to about 1.3× the default) are honoured; the extra-large
 * accessibility sizes, which reach 3× and would push buttons off the screen,
 * stop at 1.3×. Set once here for every piece of text and every text box,
 * rather than on each of the thousands in the app. A text that sets its own
 * limit keeps it.
 */
const MAX = TextScale.DEFAULT;

// The Android parts below (Oct 5) never took effect while the cap was not installing (see wrapped).
// They stay off until they can be checked on an Android phone, so installing the cap changes
// nothing on Android but the cap itself.
const ANDROID_EXTRAS = false && Platform.OS === 'android';

/*
 * Android only (Oct 5), also set once here for every text and text box.
 *
 * Bold Inter. Since Oct 22 the app is set in the phone's own font, which
 * takes its weight from fontWeight like any system font; only the CourtSide
 * wordmark is still Inter. Each weight of Inter is a family of its own,
 * loaded as the family's normal face. Android reads fontWeight 700 as "the
 * bold face of this family", finds none, and falls back to the phone's own
 * font (Roboto Bold). So a bold Inter on Android is drawn as its own family
 * with no weight on top (a lighter Inter asked to be bold becomes Inter
 * Bold; Inter Bold and ExtraBold stay themselves). 400 to 600 were never
 * affected, and the phone's own font is left alone.
 *
 * Font padding. Android adds extra room above and below each line of text
 * unless told not to, so a label sat a point or two lower in its pill than
 * on an iPhone; off by default, as on an iPhone (a text can still ask).
 *
 * Text cursor and selection handles in the brand's green, not Android's
 * default teal (a box that sets its own colours keeps them).
 */
const BOLD_INTER = 'Inter_700Bold';
const NO_FONT_PADDING: TextStyle = { includeFontPadding: false };

function boldWeight(weight: TextStyle['fontWeight']): boolean {
  if (weight === undefined || weight === null) return false;
  if (weight === 'bold') return true;
  const n = typeof weight === 'number' ? weight : parseInt(String(weight), 10);
  return Number.isFinite(n) && n >= 700;
}

/** The style with a bold Inter turned into the Inter Bold family (see above), or as it was. */
function interBold(style: unknown): unknown {
  if (!style) return style;
  const flat = StyleSheet.flatten(style as TextStyle) as TextStyle | undefined;
  if (!flat || typeof flat.fontFamily !== 'string' || !flat.fontFamily.startsWith('Inter_') || !boldWeight(flat.fontWeight)) return style;
  const ownBold = flat.fontFamily === BOLD_INTER || flat.fontFamily === 'Inter_800ExtraBold';
  return [style, { fontFamily: ownBold ? flat.fontFamily : BOLD_INTER, fontWeight: 'normal' }];
}

type Props = Record<string, unknown>;
type Component = ((props: Props) => React.ReactNode) & { __capped?: boolean };

/*
 * Where the capped text is put. In React Native 0.86 the 'default' export of
 * Text.js and TextInput.js is a read-only getter, so assigning to it threw
 * (silently, in the try below) and the cap never took effect (Nov 3 sweep: names
 * split mid-word and ratings tripled at the largest text sizes). The Text and
 * TextInput that the app imports are read through getters on
 * require('react-native'), which can be redefined; that is where the capped
 * versions go now. The old assignment stays as a fallback for a React Native
 * that exports differently.
 */
function wrapped(name: 'Text' | 'TextInput', file: { default: unknown }, adjust: (props: Props) => Props) {
  const rn = require('react-native') as Record<string, unknown>;
  const original = rn[name] as Component;
  if (typeof original !== 'function' || original.__capped) return;
  const Capped = (props: Props) => original(adjust(props));
  Object.assign(Capped, original, { displayName: name, __capped: true });
  const own = Object.getOwnPropertyDescriptor(rn, name);
  if (own?.configurable) {
    Object.defineProperty(rn, name, { configurable: true, enumerable: own.enumerable ?? true, get: () => Capped });
    return;
  }
  try { file.default = Capped; } catch { /* left as it was */ }
}

const capped = (props: Props): Props => (props.maxFontSizeMultiplier === undefined ? { ...props, maxFontSizeMultiplier: MAX } : props);

const text = (props: Props): Props => {
  const next = capped(props);
  if (!ANDROID_EXTRAS) return next;
  return { ...next, style: [NO_FONT_PADDING, interBold(next.style)] };
};

const input = (props: Props): Props => {
  const next = capped(props);
  if (!ANDROID_EXTRAS) return next;
  // Read at draw time, so the green is the court you are on.
  return {
    ...next,
    style: interBold(next.style),
    cursorColor: next.cursorColor ?? colors.brand,
    selectionHandleColor: next.selectionHandleColor ?? colors.brand,
    selectionColor: next.selectionColor ?? withAlpha(colors.brand, 0.3),
  };
};

try {
  wrapped('Text', require('react-native/Libraries/Text/Text') as { default: unknown }, text);
  wrapped('TextInput', require('react-native/Libraries/Components/TextInput/TextInput') as { default: unknown }, input);
} catch {
  // A React Native that moved these files: text simply follows the setting with no limit, as before.
}
