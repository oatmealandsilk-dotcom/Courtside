// The status bar's icons over the phone's own launch screen (Oct 25), before any of the app has run.
//
// The launch screen has two looks since Oct 25, white and dark, and the phone shows whichever
// matches its own light or dark mode (expo-splash-screen's `dark` in app.config.js). So on the
// iPhone the icons follow the phone too: Apple's default style (UIStatusBarStyleDefault) is dark
// icons in light mode and light icons in dark mode. Until then expo-status-bar's plugin fixed them
// dark (UIStatusBarStyleDarkContent), which suited only the white look.
//
// Android keeps what that plugin gave it: dark icons on the app's theme (windowLightStatusBar).
// The app sets the icons itself from its first screen on, on both (LaunchMark's launchStatusStyle,
// then ThemedStatusBar in app/_layout.tsx).
//
// Native config, so it arrives with a store build (the iPhone's next after 18).
const { AndroidConfig, withAndroidStyles, withInfoPlist } = require('expo/config-plugins');

module.exports = function withLaunchStatusBar(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIStatusBarStyle = 'UIStatusBarStyleDefault';
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:windowLightStatusBar',
      value: 'true',
    });
    return mod;
  });
  return config;
};
