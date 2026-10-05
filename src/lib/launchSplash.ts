import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/*
 * The phone's own launch picture stays up until the app's copy of it has
 * actually drawn (Oct 4, owner: "no blip on any device, in any circumstance").
 * Pictures load a moment after a screen appears; handing over before they had
 * showed a bare screen with no logo. Builds before 12 carry no splash module,
 * and the calls below quietly do nothing there.
 */
let done = false;

/** The longest the phone's picture (or the app's copy of it) is ever waited on. */
export const LAUNCH_MAX_MS = 2500;

export function hideLaunch() {
  if (done) return;
  done = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

/** Whether the phone's picture is still up, as on a real launch (on a phone; a browser has none). */
export function launchShowing() {
  return Platform.OS !== 'web' && !done;
}


if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
  // Never longer than this, whatever happens (a link that opens elsewhere, a slow phone).
  setTimeout(hideLaunch, LAUNCH_MAX_MS);
}
