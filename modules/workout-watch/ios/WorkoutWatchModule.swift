import ExpoModulesCore

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
  public func definition() -> ModuleDefinition {
    Name("WorkoutWatch")

    Events("onWorkout")

    AsyncFunction("start") { (tennis: Bool, workouts: Bool, skipWhoopTennis: Bool, alerts: Bool) in
      WorkoutWatcher.shared.start(WorkoutWatcher.Prefs(tennis: tennis, workouts: workouts, skipWhoopTennis: skipWhoopTennis, alerts: alerts))
    }

    AsyncFunction("stop") {
      WorkoutWatcher.shared.stop()
    }

    OnStartObserving("onWorkout") { [weak self] in
      let ref = WeakModule(self)
      WorkoutWatcher.shared.setInFrontHandler { payload in
        ref.module?.sendEvent("onWorkout", payload.mapValues { Optional($0) })
      }
    }

    OnStopObserving("onWorkout") {
      WorkoutWatcher.shared.setInFrontHandler(nil)
    }

    OnDestroy {
      WorkoutWatcher.shared.setInFrontHandler(nil)
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
