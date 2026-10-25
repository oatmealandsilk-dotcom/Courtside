import { Appearance, Platform } from 'react-native';
import { iosBuild } from './splashLook';

/*
 * The phone's own light or dark mode (Oct 25, owner: "a toggle where you can do like automatic dark
 * mode … it automatically turned dark mode when your phone does"). Read for two things: Automatic
 * dark mode on the Theme page (src/theme/ThemeProvider.tsx), and which of the launch screen's two
 * looks the app draws (src/components/LaunchMark.tsx), the same one the phone's own launch picture
 * shows.
 *
 * Only an app built to follow the phone can tell: iPhone builds up to LAST_FORCED_DARK_BUILD were
 * made with the app's look fixed to dark (app.config.js userInterfaceStyle 'dark'), so there the
 * phone always reads as dark, whatever its setting. On those the switch is not offered and the
 * launch look stays as it was. Android's first build and every iPhone build after 18 follow the
 * phone ('automatic'). A browser always can (its prefers-color-scheme).
 */

/** The last iPhone store build whose look was fixed to dark (build 18, in review Oct 25). Raise it if a store build is made before userInterfaceStyle 'automatic' is in it. */
export const LAST_FORCED_DARK_BUILD = 18;

/** True when this app can see the phone's light or dark mode. */
export const PHONE_APPEARANCE: boolean =
  Platform.OS === 'web' || Platform.OS === 'android' || (Platform.OS === 'ios' && iosBuild() > LAST_FORCED_DARK_BUILD);

/** Whether the phone (or the browser) is in dark mode now. False where the app cannot tell. */
export function phoneDark(): boolean {
  if (!PHONE_APPEARANCE) return false;
  try {
    return Appearance.getColorScheme() === 'dark';
  } catch {
    return false;
  }
}

/** Tells `then` each time the phone goes dark or light. Gives back the way to stop. */
export function onPhoneAppearance(then: (dark: boolean) => void): () => void {
  if (!PHONE_APPEARANCE) return () => undefined;
  try {
    const sub = Appearance.addChangeListener(({ colorScheme }) => then(colorScheme === 'dark'));
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
