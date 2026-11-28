import { Platform } from 'react-native';
import Constants from 'expo-constants';

/*
 * Which launch look this copy of the app draws (Oct 24).
 *
 * The phone's own launch picture is built into the installed app and only changes with a new
 * App Store build, while the app's code (and so its drawn copy of that picture: the loading
 * screen and the curtain) arrives by over-the-air update. The two must always match, or the
 * hand-over from one to the other jumps. So the new look (splash C: the icon's thin mark alone on
 * white, Clean's ground since Oct 25, "GROWING THE GAME" small at the foot; assets/splash-c.png)
 * is drawn only on an iPhone build newer than LAST_OLD_SPLASH_BUILD, the last one built with the old picture
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

/** The installed iPhone app's own build number (0 when unknown: Expo Go, a failed read). */
export function iosBuild(): number {
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

/*
 * The light launch look (Nov 27). The owner first asked for one green (the icon's own #236B3F on the
 * icon, the app's buttons and the launch screen: "new green is better"), then for the launch screen to
 * match the icon, reversed: the icon's cream mark on a dark green ground ("between 2 and 3": #1C5835),
 * the line in the cream with a little of the ground in it (SPLASH_C_COLORS, scripts/make-splash-c.py).
 * The phone's own launch picture only changes with a new store build, so the app's drawn copy (the
 * loading screen, the curtain) keeps the picture's old look, white with the old lighter green
 * (OLD_LIGHT_LOOK), on the builds that still carry it, and the hand-over from picture to drawing never
 * changes colour: iPhone builds up to 29 (in review Nov 25), Android's first build (versionCode 1,
 * Nov 5). The ground, the mark, the line and the status bar's icons all switch together. The dark look
 * is the same on every build. The website has no picture of its own: its loader (public/index.html)
 * and drawing switch together.
 */

/** The light launch look on builds made before Nov 27 (assets/splash-c.png until then): white, the old green, Clean's grey. */
export const OLD_LIGHT_LOOK = { ground: '#FFFFFF', green: '#2E7E4B', line: '#536471' } as const;
/** The last iPhone store build whose launch picture has OLD_LIGHT_LOOK. */
export const LAST_OLD_LIGHT_IOS_BUILD = 29;
/** The last Android build whose launch screen has OLD_LIGHT_LOOK. */
export const LAST_OLD_LIGHT_ANDROID_BUILD = 1;

/**
 * The installed Android app's own version code (0 when unknown). Read from the phone by expo-application
 * (its nativeBuildVersion, the package's own versionCode), never from expo-constants, whose Android side
 * sends no versionCode at all (so every Android build read 0), nor from the update's own config, which an
 * update could change. Loaded on Android only and inside try: a build without the module counts as old.
 */
function androidBuild(): number {
  if (Platform.OS !== 'android') return 0;
  try {
    const Application = require('expo-application') as typeof import('expo-application');
    const n = Number(Application.nativeBuildVersion ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * True when this app's own launch picture is the green one (Nov 27), so its drawn copy should be too;
 * false: the white one (OLD_LIGHT_LOOK). No build number (Expo Go, a failed read) keeps the white one.
 */
export const NEW_LAUNCH_LIGHT: boolean =
  Platform.OS === 'web' ||
  (Platform.OS === 'ios' && iosBuild() > LAST_OLD_LIGHT_IOS_BUILD) ||
  (Platform.OS === 'android' && androidBuild() > LAST_OLD_LIGHT_ANDROID_BUILD);
