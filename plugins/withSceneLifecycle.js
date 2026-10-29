// The iPhone app on Apple's newer "scene" start-up (Oct 29).
//
// From iOS 27, an app built with the newer Xcode stops at launch unless it starts through a
// scene (UIKit's ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption trap). The
// AppDelegate that `expo prebuild` writes for SDK 57 still makes its own window, so a simulator
// build from Xcode 27 crashed before drawing anything. Expo 57 ships the scene half already
// (ExpoAppSceneDelegate in the expo package): it makes the window from the scene, starts React
// Native in it, and passes links, quick actions and foreground/background on to the AppDelegate
// as before. This plugin only wires it in:
//  - Info.plist names that scene delegate (one window, no iPad multi-window);
//  - the AppDelegate says it provides the React Native factory and no longer makes the window.
//
// Native config, so it reaches phones only with a new store build. Nothing in the app's own
// pages changes.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START_IN_APP_DELEGATE = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            // ExpoAppSceneDelegate's Objective-C name (@objc(EXExpoAppSceneDelegate) in expo/ios).
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return mod;
  });
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    let src = mod.modResults.contents;
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      const decl = 'class AppDelegate: ExpoAppDelegate {';
      if (!src.includes(decl)) throw new Error('withSceneLifecycle: AppDelegate declaration not found');
      src = src.replace(decl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (START_IN_APP_DELEGATE.test(src)) {
      // The scene delegate makes the window and starts React Native in it.
      src = src.replace(START_IN_APP_DELEGATE, '');
    } else if (src.includes('UIWindow(frame: UIScreen.main.bounds)')) {
      throw new Error('withSceneLifecycle: could not take the window start-up out of AppDelegate');
    }
    mod.modResults.contents = src;
    return mod;
  });
  return config;
};
