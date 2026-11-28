// The status bar's icons over the phone's own launch screen (Oct 25), before any of the app has run.
//
// The launch screen has two looks, light and dark, and the phone shows whichever matches its own
// light or dark mode (expo-splash-screen's `dark` in app.config.js). From Oct 25 the light look was
// white, so the icons followed the phone (Apple's UIStatusBarStyleDefault: dark icons in light mode,
// light in dark mode). Since Nov 27 the light look is the icon reversed, a cream mark on dark green
// (scripts/make-splash-c.py), so both looks are dark: the icons are light on both
// (UIStatusBarStyleLightContent on the iPhone; on Android windowLightStatusBar off, on the app's
// theme and on the launch screen's own).
//
// The app sets the icons itself from its first screen on, on both (LaunchMark's launchStatusStyle,
// then ThemedStatusBar in app/_layout.tsx).
//
// Native config, so it arrives with a store build (iPhone: after 29; Android: after versionCode 1),
// the same builds whose launch picture is green (src/lib/splashLook.ts, NEW_LAUNCH_LIGHT).
// Android's window behind the app (the theme's android:windowBackground, @color/activityBackground) is the
// launch screen's ground too: dark green by day (app.config.js backgroundColor) and, from here, the dark
// look's #0F1412 when the phone is in dark mode (values-night), so a frame where the window shows before
// the app's first draw is never green next to the dark launch screen.
const NIGHT_GROUND = '#0F1412';

const { AndroidConfig, withAndroidColorsNight, withAndroidStyles, withInfoPlist } = require('expo/config-plugins');

module.exports = function withLaunchStatusBar(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIStatusBarStyle = 'UIStatusBarStyleLightContent';
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    for (const parent of [AndroidConfig.Styles.getAppThemeGroup(), { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' }]) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent,
        name: 'android:windowLightStatusBar',
        value: 'false',
      });
    }
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, { name: 'activityBackground', value: NIGHT_GROUND });
    return mod;
  });
  return config;
};
