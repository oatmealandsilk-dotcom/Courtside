/* eslint-disable @typescript-eslint/no-require-imports */
import type React from 'react';

/**
 * Text follows the phone's text size setting, up to a point. iPhone's normal
 * sizes (up to about 1.3× the default) are honoured; the extra-large
 * accessibility sizes, which reach 3× and would push buttons off the screen,
 * stop at 1.3×. Set once here for every piece of text and every text box,
 * rather than on each of the thousands in the app. A text that sets its own
 * limit keeps it.
 */
const MAX = 1.3;

type Mod = { default: unknown };
function capped(mod: Mod, name: string) {
  const original = mod.default as ((props: Record<string, unknown>) => React.ReactNode) & { __capped?: boolean };
  if (typeof original !== 'function' || original.__capped) return;
  const Capped = (props: Record<string, unknown>) =>
    original(props.maxFontSizeMultiplier === undefined ? { ...props, maxFontSizeMultiplier: MAX } : props);
  Object.assign(Capped, original, { displayName: name, __capped: true });
  try { mod.default = Capped; } catch { /* left as it was */ }
}

try {
  capped(require('react-native/Libraries/Text/Text') as Mod, 'Text');
  capped(require('react-native/Libraries/Components/TextInput/TextInput') as Mod, 'TextInput');
} catch {
  // A React Native that moved these files: text simply follows the setting with no limit, as before.
}
