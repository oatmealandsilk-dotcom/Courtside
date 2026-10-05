import Foundation
import HealthKit
import UIKit
import UserNotifications

/*
 * "Workout detected" on the lock screen, straight from Apple Health (owner,
 * Oct 5: "They should also give notification like how mine gives me a
 * notification from Apple when it registers a workout").
 *
 * Apple Health wakes CourtSide whenever a workout is saved to it (by the
 * Apple Watch, or any app that writes to Health), even when CourtSide is
 * closed: an observer on workouts, with background delivery switched on.
 * Each wake reads only what is new since the last one (an anchor, kept on
 * the phone), and puts up the phone's own alert for a workout worth one:
 *
 * - "Tennis detected" / "Log it on CourtSide.", or "Workout detected" /
 *   "Run · Log it on CourtSide.": the server's own words for WHOOP's alert
 *   (migration 107). Never a number on the lock screen.
 * - Only one that ended in the last 12 hours, 5 minutes to 10 hours long
 *   (the server keeps no other), never between 10pm and 7am here, tennis
 *   only unless the person said yes to every workout, never WHOOP's copy of
 *   a tennis session when WHOOP sends its own alert, none when Settings'
 *   alert switch for sessions is off, and each session once (also when two
 *   apps saved it: the Watch's run and Strava's copy of it).
 * - With CourtSide open on screen, no alert: the app is told instead, and
 *   its own check puts up its own "Workout detected" note at once.
 *
 * What it may do is saved by the app (WorkoutWatchModule's start, from
 * src/features/health/workoutWatch.ts) whenever the person turns sessions
 * on, and each time the app opens; stop forgets it all. Nothing here ever
 * asks for Health or for alerts: those are the app's own questions. The
 * alert's tap is handled in the app (useWorkoutWatch), which hands the
 * workout to the server as its own check would and opens Log it on it.
 */
final class WorkoutWatcher: @unchecked Sendable {
  static let shared = WorkoutWatcher()

  /** What the person has switched on, saved by the app. */
  struct Prefs: Equatable {
    /** Tennis sessions from Apple Health (reads_workouts and flag:tennis-apple). */
    var tennis: Bool
    /** Every other workout too (reads_all_workouts and flag:workouts-apple). */
    var workouts: Bool
    /** WHOOP sends its own tennis alert: its copy in Health stays quiet. */
    var skipWhoopTennis: Bool
    /** Settings' alert switch for sessions (push_activity). Off: no alert, the app still finds them. */
    var alerts: Bool

    var asDictionary: [String: Bool] {
      ["tennis": tennis, "workouts": workouts, "skipWhoopTennis": skipWhoopTennis, "alerts": alerts]
    }

    init(tennis: Bool, workouts: Bool, skipWhoopTennis: Bool, alerts: Bool) {
      self.tennis = tennis
      self.workouts = workouts
      self.skipWhoopTennis = skipWhoopTennis
      self.alerts = alerts
    }

    init?(_ dictionary: [String: Any]?) {
      guard let d = dictionary else { return nil }
      self.init(
        tennis: d["tennis"] as? Bool ?? false,
        workouts: d["workouts"] as? Bool ?? false,
        skipWhoopTennis: d["skipWhoopTennis"] as? Bool ?? false,
        alerts: d["alerts"] as? Bool ?? true
      )
    }
  }

  private enum Key {
    static let prefs = "courtside.workoutWatch.prefs"
    static let anchor = "courtside.workoutWatch.anchor"
    static let notified = "courtside.workoutWatch.notified"
  }

  /** How long ago a workout may have ended and still get an alert (the server's rule). */
  private static let freshFor: TimeInterval = 12 * 3600
  /** The lengths the server keeps, in minutes (record_activity). */
  private static let minutes = 5...600
  /** The workouts already announced (see Seen), newest last, at most this many. */
  private static let rememberAtMost = 200
  /** Several saved at once (a watch catching up): alerts for the newest few only. */
  private static let alertsAtOnce = 3
  /** Apple Health waits for each wake to be finished; it is finished by this many seconds at the latest. */
  private static let wakeBudget: TimeInterval = 20

  private let store = HKHealthStore()
  /** Every piece of state below is read and written on this one queue, one thing at a time. */
  private let queue = DispatchQueue(label: "co.courtside.workout-watch")
  private let defaults = UserDefaults.standard
  private var observer: HKObserverQuery?
  /** Set while the app listens (WorkoutWatchModule): told about a new workout instead of an alert, while the app is open. */
  private var inFrontHandler: (@Sendable ([String: Any]) -> Void)?

  private init() {}

  // MARK: - What the app calls

  /**
   * At launch, before anything else (WorkoutWatchAppDelegate): the observer
   * is set up again, so a wake from Health finds it waiting, also when the
   * app was closed. Only when the person has it on.
   */
  func resumeAtLaunch() {
    queue.async {
      guard self.loadPrefs() != nil else { return }
      self.arm()
    }
  }

  /**
   * Switched on, or opened with it on: the person's switches are saved and
   * the observer set up. The first time (or the first after stop) only notes
   * how far Health has got, so nothing already in it ever buzzes.
   */
  func start(_ prefs: Prefs) {
    queue.async {
      let fresh = self.loadPrefs() == nil
      self.defaults.set(prefs.asDictionary, forKey: Key.prefs)
      if fresh {
        self.defaults.removeObject(forKey: Key.anchor)
        self.defaults.removeObject(forKey: Key.notified)
      }
      self.arm()
      if self.loadAnchor() == nil { self.look {} }
    }
  }

  /** Switched off, or signed out: no more wakes, and everything kept for it is forgotten. */
  func stop() {
    queue.async {
      self.defaults.removeObject(forKey: Key.prefs)
      self.defaults.removeObject(forKey: Key.anchor)
      self.defaults.removeObject(forKey: Key.notified)
      if let observer = self.observer {
        self.store.stop(observer)
        self.observer = nil
      }
      guard HKHealthStore.isHealthDataAvailable() else { return }
      self.store.disableBackgroundDelivery(for: HKObjectType.workoutType()) { _, _ in }
    }
  }

  /** The app's listener (or nil when it stops listening). */
  func setInFrontHandler(_ handler: (@Sendable ([String: Any]) -> Void)?) {
    queue.async { self.inFrontHandler = handler }
  }

  // MARK: - The observer

  private func arm() {
    guard observer == nil, HKHealthStore.isHealthDataAvailable() else { return }
    let query = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { [weak self] _, completionHandler, error in
      // Apple Health waits for this before it wakes the app again, and gives
      // up on an app that never calls it: it is called on every path, and
      // after `wakeBudget` seconds at the latest.
      let finish = Once(completionHandler)
      guard let self, error == nil else {
        finish.run()
        return
      }
      self.queue.asyncAfter(deadline: .now() + WorkoutWatcher.wakeBudget) { finish.run() }
      self.queue.async { self.look { finish.run() } }
    }
    store.execute(query)
    observer = query
    // Health remembers this between launches; asking again each launch is harmless.
    store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate) { _, _ in }
  }

  /** Reads what is new since the last look and announces what deserves it. `done` is called exactly once, on every path. */
  private func look(_ done: @escaping @Sendable () -> Void) {
    guard let prefs = loadPrefs() else {
      done()
      return
    }
    let anchor = loadAnchor()
    // The very first look only finds where Health is up to; the last two
    // days are enough for that (anything older can never get an alert).
    let predicate = anchor == nil ? HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-2 * 86_400), end: nil, options: []) : nil
    let query = HKAnchoredObjectQuery(type: HKObjectType.workoutType(), predicate: predicate, anchor: anchor, limit: HKObjectQueryNoLimit) { [weak self] _, samples, _, newAnchor, error in
      guard let self else {
        done()
        return
      }
      self.queue.async {
        // Not readable (the phone is locked, and Health keeps its data
        // sealed until it is unlocked): the anchor stays where it was, so
        // the next look reads the same workouts again.
        guard error == nil, let newAnchor else {
          done()
          return
        }
        self.saveAnchor(newAnchor)
        if anchor == nil {
          done()
          return
        }
        let now = Date()
        var seen = (self.defaults.stringArray(forKey: Key.notified) ?? []).compactMap(Seen.init)
        var fresh: [HKWorkout] = []
        let candidates = (samples ?? []).compactMap { $0 as? HKWorkout }.filter { self.deserves($0, prefs: prefs, now: now) }
        for w in candidates.sorted(by: { $0.startDate < $1.startDate }) {
          // Each once; and one session once, though two apps saved it (the Watch's run, and
          // Strava's copy of it): the server's own rule for a twin (note_detected_activity).
          let s = Seen(w)
          if seen.contains(where: { $0.id == s.id || $0.sameSession(as: s) }) { continue }
          seen.append(s)
          fresh.append(w)
        }
        guard !fresh.isEmpty else {
          done()
          return
        }
        // Remembered before anything else, so no later wake announces them again.
        self.defaults.set(seen.suffix(WorkoutWatcher.rememberAtMost).map(\.encoded), forKey: Key.notified)
        self.announce(fresh, prefs: prefs, now: now, done: done)
      }
    }
    store.execute(query)
  }

  /** Whether a workout just saved to Health should get an alert. */
  private func deserves(_ w: HKWorkout, prefs: Prefs, now: Date) -> Bool {
    let length = Int((w.endDate.timeIntervalSince(w.startDate) / 60).rounded())
    guard WorkoutWatcher.minutes.contains(length) else { return false }
    guard w.endDate > now.addingTimeInterval(-WorkoutWatcher.freshFor), w.endDate < now.addingTimeInterval(600) else { return false }
    let tennis = w.workoutActivityType == .tennis
    guard tennis ? prefs.tennis : prefs.workouts else { return false }
    if tennis && prefs.skipWhoopTennis {
      let source = w.sourceRevision.source
      if "\(source.name) \(source.bundleIdentifier)".range(of: "whoop", options: .caseInsensitive) != nil { return false }
    }
    return true
  }

  private func announce(_ fresh: [HKWorkout], prefs: Prefs, now: Date, done: @escaping @Sendable () -> Void) {
    let newest = Array(fresh.sorted { $0.endDate > $1.endDate }.prefix(WorkoutWatcher.alertsAtOnce))
    DispatchQueue.main.async {
      // On screen (open, or opening: a launch the person made is "inactive" for its first moments).
      let onScreen = MainActor.assumeIsolated { UIApplication.shared.applicationState != .background }
      self.queue.async {
        if onScreen {
          // The app looks at once (when it is signed in and listening) and shows its own
          // note, with the numbers; otherwise its own check on opening finds it. Never a
          // lock-screen alert over the open app.
          if let handler = self.inFrontHandler, let first = newest.first { handler(WorkoutWatcher.payload(first)) }
          done()
          return
        }
        self.alert(newest, prefs: prefs, now: now, done: done)
      }
    }
  }

  /** The lock-screen alerts, with the app in the background or closed. */
  private func alert(_ newest: [HKWorkout], prefs: Prefs, now: Date, done: @escaping @Sendable () -> Void) {
    // Night where the phone is, or the person turned these alerts off: in the app only, as on the server.
    let hour = Calendar.current.component(.hour, from: now)
    guard prefs.alerts, hour >= 7, hour < 22 else {
      done()
      return
    }
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      // Alerts not allowed (the app's own question was never answered yes): nothing to put up.
      guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus) else {
        done()
        return
      }
      let group = DispatchGroup()
      for w in newest {
        group.enter()
        center.add(WorkoutWatcher.request(for: w)) { _ in group.leave() }
      }
      group.notify(queue: self.queue) { done() }
    }
  }

  // MARK: - The alert

  /** What the app needs to open Log it on the workout: Health's id, its times, and what it was. */
  static func payload(_ w: HKWorkout) -> [String: Any] {
    let tennis = w.workoutActivityType == .tennis
    return [
      "courtside": "workout-detected",
      "workoutId": w.uuid.uuidString,
      "startedAt": iso(w.startDate),
      "endedAt": iso(w.endDate),
      "tennis": tennis,
      "workout": name(of: w.workoutActivityType),
    ]
  }

  private static func request(for w: HKWorkout) -> UNNotificationRequest {
    let content = UNMutableNotificationContent()
    if w.workoutActivityType == .tennis {
      content.title = "Tennis detected"
      content.body = "Log it on CourtSide."
    } else {
      content.title = "Workout detected"
      content.body = "\(name(of: w.workoutActivityType)) · Log it on CourtSide."
    }
    content.sound = .default
    content.threadIdentifier = "courtside-workouts"
    content.userInfo = payload(w)
    // Named after the workout, so the same one can never show twice.
    return UNNotificationRequest(identifier: "courtside-workout-\(w.uuid.uuidString)", content: content, trigger: nil)
  }

  private static func iso(_ date: Date) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: date)
  }

  /**
   * The workout's name, as the app and the server say it (workoutName in
   * src/features/activity/workouts.ts and the server's workout_name,
   * migration 107): keep the three in step. One not listed is "Workout".
   */
  static func name(of type: HKWorkoutActivityType) -> String {
    switch type {
    case .tennis: return "Tennis"
    case .running: return "Run"
    case .wheelchairRunPace, .wheelchairWalkPace: return "Wheelchair workout"
    case .walking: return "Walk"
    case .cycling, .handCycling: return "Bike ride"
    case .hiking: return "Hike"
    case .swimming: return "Swim"
    case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength training"
    case .highIntensityIntervalTraining: return "HIIT"
    case .coreTraining: return "Core training"
    case .yoga: return "Yoga"
    case .pilates: return "Pilates"
    case .barre: return "Barre"
    case .flexibility: return "Stretching"
    case .cooldown: return "Cooldown"
    case .preparationAndRecovery: return "Recovery"
    case .mindAndBody: return "Mind and body"
    case .elliptical: return "Elliptical"
    case .rowing: return "Rowing"
    case .stairClimbing, .stairs, .stepTraining: return "Stair climbing"
    case .jumpRope: return "Jump rope"
    case .mixedCardio: return "Cardio"
    case .crossTraining: return "Cross training"
    case .cardioDance, .socialDance: return "Dance"
    case .boxing: return "Boxing"
    case .kickboxing: return "Kickboxing"
    case .martialArts: return "Martial arts"
    case .pickleball: return "Pickleball"
    case .tableTennis: return "Table tennis"
    case .squash: return "Squash"
    case .badminton: return "Badminton"
    case .racquetball: return "Racquetball"
    case .paddleSports: return "Paddling"
    case .soccer: return "Soccer"
    case .basketball: return "Basketball"
    case .volleyball: return "Volleyball"
    case .golf: return "Golf"
    case .climbing: return "Climbing"
    case .skatingSports: return "Skating"
    case .crossCountrySkiing, .downhillSkiing: return "Skiing"
    case .snowboarding: return "Snowboarding"
    case .surfingSports: return "Surfing"
    case .trackAndField: return "Track and field"
    default:
      // Apple's retired kinds, still found in older data, by number (naming them is a build warning):
      // 14 and 15 were dance, 30 mixed cardio.
      switch type.rawValue {
      case 14, 15: return "Dance"
      case 30: return "Cardio"
      default: return "Workout"
      }
    }
  }

  // MARK: - What is kept on the phone

  private func loadPrefs() -> Prefs? {
    Prefs(defaults.dictionary(forKey: Key.prefs))
  }

  private func loadAnchor() -> HKQueryAnchor? {
    guard let data = defaults.data(forKey: Key.anchor) else { return nil }
    return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
  }

  private func saveAnchor(_ anchor: HKQueryAnchor) {
    guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
    defaults.set(data, forKey: Key.anchor)
  }
}

/** A workout already announced, as kept on the phone: Health's id, when it ran, and its kind. */
private struct Seen {
  let id: String
  let start: TimeInterval
  let end: TimeInterval
  let type: UInt

  init(_ w: HKWorkout) {
    id = w.uuid.uuidString
    start = w.startDate.timeIntervalSince1970
    end = w.endDate.timeIntervalSince1970
    type = w.workoutActivityType.rawValue
  }

  init?(_ encoded: String) {
    let parts = encoded.split(separator: "|")
    guard parts.count == 4, let start = TimeInterval(parts[1]), let end = TimeInterval(parts[2]), let type = UInt(parts[3]) else { return nil }
    self.id = String(parts[0])
    self.start = start
    self.end = end
    self.type = type
  }

  var encoded: String { "\(id)|\(start)|\(end)|\(type)" }

  /** The same session saved twice: the same kind, starting within ten minutes, or overlapping by half the shorter one. */
  func sameSession(as other: Seen) -> Bool {
    guard type == other.type else { return false }
    if abs(start - other.start) <= 600 { return true }
    let overlap = min(end, other.end) - max(start, other.start)
    return overlap >= 0.5 * min(end - start, other.end - other.start)
  }
}

/** A completion handler that runs once, however many paths reach it. */
private final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var body: (() -> Void)?

  init(_ body: @escaping () -> Void) {
    self.body = body
  }

  func run() {
    lock.lock()
    let body = self.body
    self.body = nil
    lock.unlock()
    body?()
  }
}
