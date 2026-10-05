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
/** Told once, the moment the phone's own launch picture starts to go. */
const onHidden = new Set<() => void>();

/** The longest the phone's picture (or the app's copy of it) is ever waited on. */
export const LAUNCH_MAX_MS = 2500;
/** How long the phone's own picture takes to dissolve into the app (iPhone; it is set below). */
export const LAUNCH_FADE_MS = 700;

export function hideLaunch() {
  if (done) return;
  done = true;
  SplashScreen.hideAsync().catch(() => undefined);
  for (const told of [...onHidden]) told();
  onHidden.clear();
}

/** Runs `then` once the phone's launch picture starts to go (at once if it already has). Gives back a way to stop waiting. */
export function whenLaunchHidden(then: () => void): () => void {
  if (done || Platform.OS === 'web') { then(); return () => undefined; }
  onHidden.add(then);
  return () => { onHidden.delete(then); };
}

/** Whether the phone's picture is still up, as on a real launch (on a phone; a browser has none). */
export function launchShowing() {
  return Platform.OS !== 'web' && !done;
}


if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
  // The phone's picture dissolves into the app's first screen instead of vanishing (Oct 5, owner's video:
  // the app's own cream copy of it showed blank before fading). A build without this option ignores it.
  try { SplashScreen.setOptions({ fade: true, duration: LAUNCH_FADE_MS }); } catch { /* an older build */ }
  // Never longer than this, whatever happens (a link that opens elsewhere, a slow phone).
  setTimeout(hideLaunch, LAUNCH_MAX_MS);
}
