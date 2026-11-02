import ExpoModulesCore

/**
 * The app's handle on LaunchLook (see there), from src/lib/launchLook.ts.
 *
 * Builds before this module do not carry it: the app's code finds it missing and draws its launch
 * copies by the phone's mode, as before (requireOptionalNativeModule).
 */
public class LaunchLookModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CourtSideLaunchLook")

    // The look the app's own copies of the launch screen must draw this open: "light", "dark", or
    // nil (the phone's own mode, as before). Read once, as the app's code starts, for its first frame.
    Function("applied") { () -> String? in
      LaunchLook.shared.applied?.rawValue
    }

    // The look for the next open: "light", "dark" or nil (the phone's), what is done with iOS's own
    // saved pictures ("off", "same", "png") and how long the early dissolve takes (ms).
    Function("setLook") { (look: String?, snapshots: String, dissolveMs: Double) in
      LaunchLook.shared.save(look: look, snapshots: snapshots, dissolveMs: dissolveMs)
    }

    // What happened at this open and to iOS's pictures, for the simulator checks.
    AsyncFunction("status") { () -> [String: Any] in
      LaunchLook.shared.status()
    }.runOnQueue(.main)

    // iOS's pictures brought in line with what is saved, now, then the same report.
    AsyncFunction("syncNow") { (promise: Promise) in
      LaunchLook.shared.syncNow {
        promise.resolve(LaunchLook.shared.status())
      }
    }.runOnQueue(.main)
  }
}
