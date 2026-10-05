import { Platform } from 'react-native';

import { finishAndroidGoogle } from '@/data/remote';
import { reportError } from '@/lib/crashReporting';

/*
 * Addresses the phone opens the app with, before the app's pages see them
 * (Oct 5). Android only: an iPhone is left exactly as it was.
 *
 * Google sign-in, Link Google, a paid booking and connecting a tracker each
 * open a browser tab inside the app and wait for it to come back to a
 * courtside:// address. On an iPhone the sign-in sheet takes that address
 * itself. On Android it comes back as an ordinary link to the app, so the
 * app's pages also went to it: Link Google threw you out of Account center
 * onto the map, Google sign-in flashed the splash over the form, a tracker
 * opened a second Health page and a booking a second "booking done". The tab
 * that is waiting still gets the address (through its own listener); this
 * only stops the pages going there too.
 *
 * And a Google sign-in that comes back to an app Android closed meanwhile
 * (short of memory, while Google was open) opens it afresh with the code in
 * the address. Nothing was waiting for it any more, so it is finished here:
 * the app opens on its splash and the account loads once the login is in.
 */
const RETURN = /^courtside:\/\/(auth|booking-done|coach-studio|health)?\/?([?#]|$)/;
const GOOGLE_CODE = /^courtside:\/\/auth\/?\?(.*&)?code=/;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (Platform.OS !== 'android') return path;
  if (initial) {
    if (GOOGLE_CODE.test(path)) {
      void finishAndroidGoogle(path).catch((err: unknown) => { void reportError(err, { where: 'google sign-in after restart' }); });
      return '/';
    }
    // There is no page called "auth": any other return to it simply opens the app.
    if (/^courtside:\/\/auth\b/.test(path)) return '/';
    return path;
  }
  return RETURN.test(path) ? null : path;
}
