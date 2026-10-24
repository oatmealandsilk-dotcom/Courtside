import { Platform } from 'react-native';
import Constants from 'expo-constants';

/*
 * Which launch look this copy of the app draws (Oct 24).
 *
 * The phone's own launch picture is built into the installed app and only changes with a new
 * App Store build, while the app's code (and so its drawn copy of that picture: the loading
 * screen and the curtain) arrives by over-the-air update. The two must always match, or the
 * hand-over from one to the other jumps. So the new look (splash C: the icon's thin mark alone on
 * the icon's cream, "GROWING THE GAME" small at the foot; assets/splash-c.png) is drawn only on an
 * iPhone build newer than LAST_OLD_SPLASH_BUILD, the last one built with the old picture
 * (assets/splash.png: the old mark, "CourtSide" and the line). Older builds keep today's look.
 *
 * The build number is the installed app's own (its CFBundleVersion, read by expo-constants from
 * the phone, not from the update), so an update cannot fake it. No number (Expo Go, a failed
 * read) keeps today's look. Android has had no build yet: its first one carries the new launch
 * icon (assets/splash-c-android.png), so it always draws the new look. The website has no launch
 * picture of its own and has switched already: its loader (public/index.html) is the new look.
 */

/** The last iPhone store build whose launch picture is the old one (build 18, in review Oct 24). */
export const LAST_OLD_SPLASH_BUILD = 18;

function iosBuild(): number {
  try {
    const n = Number(Constants.platform?.ios?.buildNumber ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** True when this app draws the new, logo-only launch look (splash C); false: today's picture. */
export const NEW_SPLASH: boolean =
  Platform.OS === 'web' || Platform.OS === 'android' || (Platform.OS === 'ios' && iosBuild() > LAST_OLD_SPLASH_BUILD);
