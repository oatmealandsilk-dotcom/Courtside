import ExpoModulesCore
import Foundation

/**
 * The app's handle on WorkoutWatcher (see there): src/features/health/workoutWatch.ts
 * calls start with the person's switches whenever sessions are turned on and
 * each time the app opens, and stop when they are turned off or the person
 * signs out. While the app listens for "onWorkout" (open, signed in), a
 * workout saved to Health with the app on screen is handed to it instead of
 * a lock-screen alert.
 *
 * Builds before 15 do not carry this module: the app's JavaScript finds it
 * missing and does nothing (requireOptionalNativeModule).
 */
public class WorkoutWatchModule: Module {
  /**
   * This instance's mark on the watcher's listener. When the app reloads (an
   * instant update, or in development) the old instance's goodbye can arrive
   * after the new one has started listening: it only ever clears its own.
   */
  private let listenerToken = UUID()

  public func definition() -> ModuleDefinition {
    Name("WorkoutWatch")

    Events("onWorkout")

    AsyncFunction("start") { (tennis: Bool, workouts: Bool, skipWhoopTennis: Bool, alerts: Bool) in
      WorkoutWatcher.shared.start(WorkoutWatcher.Prefs(tennis: tennis, workouts: workouts, skipWhoopTennis: skipWhoopTennis, alerts: alerts))
    }

    AsyncFunction("stop") {
      WorkoutWatcher.shared.stop()
    }

    OnStartObserving("onWorkout") { [weak self, token = self.listenerToken] in
      let ref = WeakModule(self)
      WorkoutWatcher.shared.setInFrontHandler(owner: token) { payload in
        ref.module?.sendEvent("onWorkout", payload.mapValues { Optional($0) })
      }
    }

    OnStopObserving("onWorkout") { [token = self.listenerToken] in
      WorkoutWatcher.shared.clearInFrontHandler(owner: token)
    }

    OnDestroy { [token = self.listenerToken] in
      WorkoutWatcher.shared.clearInFrontHandler(owner: token)
    }
  }
}

/** The module, held loosely, for the watcher's queue: the module can go away (the app reloads) while the watcher stays. */
private final class WeakModule: @unchecked Sendable {
  weak var module: WorkoutWatchModule?

  init(_ module: WorkoutWatchModule?) {
    self.module = module
  }
}
