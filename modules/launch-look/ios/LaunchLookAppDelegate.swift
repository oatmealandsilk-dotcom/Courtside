import ExpoModulesCore
import UIKit

/**
 * The launch's own moments for LaunchLook: before any window (what was saved, what iOS's picture just
 * showed), React Native's root view being made (expo-splash-screen's cover gets the look; this
 * subscriber comes after expo-splash-screen's, being later in the name order Expo links them in),
 * the app coming on screen (the early dissolve) and the app being left (iOS's pictures put right).
 * Each does nothing unless the app's code has saved a look.
 */
public class LaunchLookAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    LaunchLook.shared.prepareAtLaunch()
    return true
  }

  public func customizeRootView(_ rootView: UIView) {
    LaunchLook.shared.rootViewMade(rootView)
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    LaunchLook.shared.becameActive()
  }

  public func applicationDidEnterBackground(_ application: UIApplication) {
    LaunchLook.shared.enteredBackground()
  }
}
