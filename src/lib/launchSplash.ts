import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/*
 * The phone's own launch picture stays up until the app's copy of it has
 * actually drawn (Oct 4, owner: "no blip on any device, in any circumstance").
 * Pictures load a moment after a screen appears; handing over before they had
 * showed a bare screen with no logo. Builds before 12 carry no splash module,
 * and the calls below quietly do nothing there.
 */
const NEEDED = new Set(['cover', 'brand']);
let done = false;

export function hideLaunch() {
  if (done) return;
  done = true;
  SplashScreen.hideAsync().catch(() => undefined);
}

/** One of the first screen's pictures has drawn; when both have, the phone's picture goes. */
export function launchPartReady(part: 'cover' | 'brand') {
  NEEDED.delete(part);
  if (!NEEDED.size) hideLaunch();
}

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
  // Never longer than this, whatever happens (a link that opens elsewhere, a slow phone).
  setTimeout(hideLaunch, 2500);
}
