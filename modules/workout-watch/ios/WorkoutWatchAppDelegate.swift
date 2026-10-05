import ExpoModulesCore
import UIKit

/**
 * Apple Health wakes a closed app by launching it in the background, and
 * expects the app to set up its workout observer as it launches (Apple's own
 * advice: in didFinishLaunching). This does that, before the app's
 * JavaScript has even loaded, and only when the person has the alerts on.
 */
public class WorkoutWatchAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    WorkoutWatcher.shared.resumeAtLaunch()
    return true
  }
}
