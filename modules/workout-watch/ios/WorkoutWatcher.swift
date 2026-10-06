import Foundation
import HealthKit
import UIKit
import UserNotifications

/*
 * "Activity detected" on the lock screen, straight from Apple Health (owner,
 * Oct 5: "They should also give notification like how mine gives me a
 * notification from Apple when it registers a workout").
 *
 * Apple Health wakes CourtSide whenever a workout is saved to it (by the
 * Apple Watch, or any app that writes to Health), even when CourtSide is
 * closed: an observer on workouts, with background delivery switched on.
 * Each wake reads only what is new since the last one (an anchor, kept on
 * the phone), and puts up the phone's own alert for a workout worth one:
 *
 * - "Tennis detected" / "Log it on CourtSide.", or "Activity detected" /
 *   "Run · Log it on CourtSide.": the server's own words for WHOOP's alert
 *   (migration 107; "Activity detected" since 131, owner, Oct 5). Never a
 *   number on the lock screen.
 * - Only one that ended in the last 12 hours, 5 minutes to 10 hours long
 *   (the server keeps no other), never between 10pm and 7am here, tennis
 *   only unless the person said yes to every workout, no tennis at all when
 *   WHOOP already sends its own tennis alert (one session, one alert), none
 *   when Settings' alert switch for sessions is off, and each session once
 *   (also when two apps saved it: the Watch's run and Strava's copy of it).
 * - With CourtSide open on screen, no alert: the app is told instead, and
 *   its own check puts up its own "Activity detected" note at once.
 * - Several at once (a watch catching up; owner, Oct 5, "grouped noti"): up
 *   to three in one go keep an alert each; a fourth folds the go into ONE
 *   "4 workouts found" / "Tap to log them on CourtSide." alert in place of
 *   its single ones, whose tap opens their list in the app (see Burst).
 *
 * A locked phone: Health keeps its data sealed until the phone is unlocked,
 * which is the usual state when a Watch workout reaches a phone in a pocket.
 * Such a read is kept waiting and made again at the unlock (while iOS still
 * lets the app run, about half a minute), or else at the next wake, launch
 * or open. So with the phone locked the alert can come at the unlock, or
 * only with the next workout Health saves.
 *
 * Each time the app comes to the front, whatever Health saved meanwhile is
 * read too (as seen, no alert: the app shows its own note), so a session
 * the app already filed never buzzes later.
 *
 * What it may do is saved by the app (WorkoutWatchModule's start, from
 * src/features/health/workoutWatch.ts) whenever the person turns sessions
 * on, and each time the app opens; stop forgets it all. Switches the app has
 * not confirmed for 30 days count as off (`lease`), so an older version of
 * the app's code that never says (an instant update rolled back) can't leave
 * alerts running for someone who has since turned sessions off. Nothing here
 * ever asks for Health or for alerts: those are the app's own questions. The
 * alert's tap is handled in the app (useWorkoutWatch), which hands the
 * workout to the server as its own check would and opens Log it on it.
 *
 * Every failure from Health is written to the phone's log ("[WorkoutWatch]",
 * seen in Console.app during a device test): a signed build without the
 * background-delivery entitlement otherwise looks exactly like "no workouts".
 */
final class WorkoutWatcher: @unchecked Sendable {
  static let shared = WorkoutWatcher()

  /** What the person has switched on, saved by the app. */
  struct Prefs: Equatable {
    /** Tennis sessions from Apple Health (reads_workouts and flag:tennis-apple). */
    var tennis: Bool
    /** Every other workout too (reads_all_workouts and flag:workouts-apple). */
    var workouts: Bool
    /** WHOOP sends its own tennis alert (its server push): no tennis alert from here at all, so one session never buzzes twice. */
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
    /** A read Health refused while the phone was locked, still to be made. */
    static let pending = "courtside.workoutWatch.pending"
    /** When the app last confirmed the switches (start). */
    static let confirmedAt = "courtside.workoutWatch.confirmedAt"
    /** The workouts alerted in the latest go (see Burst), to fold a fourth into one alert. */
    static let burst = "courtside.workoutWatch.burst"
  }

  /** How long ago a workout may have ended and still get an alert (the server's rule). */
  private static let freshFor: TimeInterval = 12 * 3600
  /** The lengths the server keeps, in minutes (record_activity). */
  private static let minutes = 5...600
  /** The workouts already announced (see Seen), newest last, at most this many. */
  private static let rememberAtMost = 200
  /**
   * Several saved at once (a watch catching up; owner, Oct 5, "grouped
   * noti"): up to this many keep an alert each, as before; more than this in
   * one go fold into ONE "4 workouts found" alert, which takes the place of
   * that go's single alerts. The app and the server fold the same way
   * (src/features/activity/found.ts, migration 2026100600018).
   */
  private static let alertsAtOnce = 3
  /** Alerts this close together (Health can wake the app several times as a watch catches up) are one go. */
  private static let burstWindow: TimeInterval = 10 * 60
  /** The most workouts one folded alert carries for its tap (a look hands over at most 40 at a time). */
  private static let burstAtMost = 40
  /** Apple Health waits for each wake to be finished; it is finished by this many seconds at the latest. */
  private static let wakeBudget: TimeInterval = 20
  /** Switches not confirmed by the app for this long count as off (see the note at the top). */
  private static let lease: TimeInterval = 30 * 86_400

  private let store = HKHealthStore()
  /** Every piece of state below is read and written on this one queue, one thing at a time (except unlockTask: the main thread's). */
  private let queue = DispatchQueue(label: "co.courtside.workout-watch")
  private let defaults = UserDefaults.standard
  private var observer: HKObserverQuery?
  /** Set while the app listens (WorkoutWatchModule): told about a new workout instead of an alert, while the app is open. */
  private var inFrontHandler: (@Sendable ([String: Any]) -> Void)?
  /** Which module instance set the handler: an older one going away (the app reloading) never clears a newer one's. */
  private var inFrontOwner: UUID?
  /** The phone's notices of the app coming to the front and of the phone being unlocked (kept for as long as the app runs). */
  private var appNotices: [NSObjectProtocol] = []
  /** Main thread only: the few seconds iOS grants while a read refused by a locked phone waits for the unlock. */
  private var unlockTask: UIBackgroundTaskIdentifier = .invalid

  private init() {
    // Made at launch on the main thread (WorkoutWatchAppDelegate), so the very first open is heard too.
    if Thread.isMainThread {
      MainActor.assumeIsolated { listenToApp() }
    } else {
      DispatchQueue.main.async { MainActor.assumeIsolated { self.listenToApp() } }
    }
  }

  // MARK: - What the app calls

  /**
   * At launch, before anything else (WorkoutWatchAppDelegate): the observer
   * is set up again, so a wake from Health finds it waiting, also when the
   * app was closed. Only when the person has it on. A read the locked phone
   * refused is made now.
   */
  func resumeAtLaunch() {
    queue.async {
      guard self.loadPrefs() != nil else {
        // Switches the app has not confirmed for a month: off, and Health stops waking the app for them.
        if self.defaults.object(forKey: Key.prefs) != nil { self.forget() }
        return
      }
      self.arm()
      if self.defaults.bool(forKey: Key.pending) { self.look {} }
    }
  }

  /**
   * Switched on, or opened with it on: the person's switches are saved (and
   * confirmed for another 30 days) and the observer set up. The first time
   * (or the first after stop) only notes how far Health has got, so nothing
   * already in it ever buzzes.
   */
  func start(_ prefs: Prefs) {
    queue.async {
      if self.loadPrefs() == nil {
        self.defaults.removeObject(forKey: Key.anchor)
        self.defaults.removeObject(forKey: Key.notified)
        self.defaults.removeObject(forKey: Key.pending)
      }
      self.defaults.set(prefs.asDictionary, forKey: Key.prefs)
      self.defaults.set(Date(), forKey: Key.confirmedAt)
      self.arm()
      if self.loadAnchor() == nil || self.defaults.bool(forKey: Key.pending) { self.look {} }
    }
  }

  /** Switched off, or signed out: no more wakes, and everything kept for it is forgotten. */
  func stop() {
    queue.async { self.forget() }
  }

  /** The app's listener, from the module instance `owner`. */
  func setInFrontHandler(owner: UUID, _ handler: @escaping @Sendable ([String: Any]) -> Void) {
    queue.async {
      self.inFrontOwner = owner
      self.inFrontHandler = handler
    }
  }

  /** The app stops listening: cleared only when `owner` is the one that set it. */
  func clearInFrontHandler(owner: UUID) {
    queue.async {
      guard self.inFrontOwner == owner else { return }
      self.inFrontOwner = nil
      self.inFrontHandler = nil
    }
  }

  // MARK: - The app coming to the front, and the unlock

  @MainActor private func listenToApp() {
    let center = NotificationCenter.default
    appNotices = [
      center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] _ in self?.catchUp() },
      center.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil, queue: nil) { [weak self] _ in self?.unlocked() },
    ]
  }

  /**
   * The app came to the front: the observer set up again if Health stopped
   * it, and whatever Health saved meanwhile read now. With the app open that
   * is marked as seen, without an alert (the app is told and shows its own
   * note), so a session the app files now never buzzes with a later wake.
   */
  private func catchUp() {
    queue.async {
      guard self.loadPrefs() != nil else { return }
      self.arm()
      self.look {}
    }
  }

  /** The phone was unlocked: a read Health refused while it was locked is made now. */
  private func unlocked() {
    queue.async {
      guard self.defaults.bool(forKey: Key.pending), self.loadPrefs() != nil else {
        self.endUnlockWait()
        return
      }
      self.look { self.endUnlockWait() }
    }
  }

  /** Asks iOS for its few seconds of grace after a locked read, so an unlock soon after still gets the alert at once. */
  private func waitForUnlock() {
    DispatchQueue.main.async {
      MainActor.assumeIsolated {
        guard self.unlockTask == .invalid else { return }
        self.unlockTask = UIApplication.shared.beginBackgroundTask(withName: "workout-watch") { [weak self] in
          // The time is up: the read stays pending, for the next wake, launch or open.
          MainActor.assumeIsolated { self?.endUnlockWaitNow() }
        }
      }
    }
  }

  private func endUnlockWait() {
    DispatchQueue.main.async { MainActor.assumeIsolated { self.endUnlockWaitNow() } }
  }

  @MainActor private func endUnlockWaitNow() {
    guard unlockTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(unlockTask)
    unlockTask = .invalid
  }

  // MARK: - The observer

  private func arm() {
    guard observer == nil, HKHealthStore.isHealthDataAvailable() else { return }
    let query = HKObserverQuery(sampleType: HKObjectType.workoutType(), predicate: nil) { [weak self] query, completionHandler, error in
      // Apple Health waits for this before it wakes the app again, and gives
      // up on an app that never calls it: it is called on every path, and
      // after `wakeBudget` seconds at the latest.
      let finish = Once(completionHandler)
      guard let self else {
        finish.run()
        return
      }
      if let error {
        // Health stopped this observer: let go of it, so the next open, start or launch sets up a new one.
        NSLog("[WorkoutWatch] workout observer failed: %@", String(describing: error))
        let failed = ObjectIdentifier(query)
        self.queue.async {
          if let current = self.observer, ObjectIdentifier(current) == failed {
            self.store.stop(current)
            self.observer = nil
          }
        }
        finish.run()
        return
      }
      self.queue.asyncAfter(deadline: .now() + WorkoutWatcher.wakeBudget) { finish.run() }
      self.queue.async { self.look { finish.run() } }
    }
    store.execute(query)
    observer = query
    // Health remembers this between launches; asking again each launch is harmless. It fails when the
    // signed build lacks the background-delivery entitlement: then no wakes at all, hence the log.
    store.enableBackgroundDelivery(for: HKObjectType.workoutType(), frequency: .immediate) { ok, error in
      if !ok || error != nil { NSLog("[WorkoutWatch] enableBackgroundDelivery failed: %@", String(describing: error)) }
    }
  }

  /** Reads what is new since the last look and announces what deserves it. `done` is called exactly once, on every path. */
  private func look(_ done: @escaping @Sendable () -> Void) {
    guard loadPrefs() != nil, HKHealthStore.isHealthDataAvailable() else {
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
        // Switched off or signed out while this read ran (stop): nothing is kept, nothing announced.
        guard let prefs = self.loadPrefs() else {
          done()
          return
        }
        if let error {
          if WorkoutWatcher.isLocked(error) {
            // The phone is locked, and Health keeps its data sealed until it is unlocked: the anchor
            // stays where it was, and the same read is made again at the unlock (while iOS still lets
            // the app run), else at the next wake, launch or open. Health's wake is still answered at
            // once (`done`): an app that keeps Health waiting stops being woken.
            self.defaults.set(true, forKey: Key.pending)
            self.waitForUnlock()
          } else {
            NSLog("[WorkoutWatch] reading workouts failed: %@", String(describing: error))
          }
          done()
          return
        }
        guard let newAnchor else {
          done()
          return
        }
        self.defaults.removeObject(forKey: Key.pending)
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
        self.announce(fresh, now: now, done: done)
      }
    }
    store.execute(query)
  }

  /** Health's "the phone is locked" answer to a read. */
  private static func isLocked(_ error: Error) -> Bool {
    let e = error as NSError
    return e.domain == HKErrorDomain && e.code == HKError.Code.errorDatabaseInaccessible.rawValue
  }

  /** Whether a workout just saved to Health should get an alert. */
  private func deserves(_ w: HKWorkout, prefs: Prefs, now: Date) -> Bool {
    let length = Int((w.endDate.timeIntervalSince(w.startDate) / 60).rounded())
    guard WorkoutWatcher.minutes.contains(length) else { return false }
    guard w.endDate > now.addingTimeInterval(-WorkoutWatcher.freshFor), w.endDate < now.addingTimeInterval(600) else { return false }
    let tennis = w.workoutActivityType == .tennis
    guard tennis ? prefs.tennis : prefs.workouts else { return false }
    // WHOOP sends its own "Tennis detected" for the session (the server's push, which only stays quiet when
    // the app has already handed the Watch's copy over): from any source, tennis gets no second alert from
    // here. Runs and the rest still do, and the app's own check files the tennis all the same. (Fitbit, Oura
    // and Polar never push from the server, so their copies need no such rule.)
    if tennis && prefs.skipWhoopTennis { return false }
    return true
  }

  private func announce(_ fresh: [HKWorkout], now: Date, done: @escaping @Sendable () -> Void) {
    let newest = fresh.sorted { $0.endDate > $1.endDate }
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
        self.alert(newest, now: now, done: done)
      }
    }
  }

  /**
   * The lock-screen alerts, with the app in the background or closed, newest
   * first: one each while the go they belong to (this wake's and any alerted
   * in the last ten minutes) is three or fewer, as before. A fourth folds the
   * whole go into ONE "4 workouts found" alert: the go's single alerts are
   * taken down, and the one alert stays up, brought up to date (without
   * another buzz) as more of the same go arrive.
   */
  private func alert(_ newest: [HKWorkout], now: Date, done: @escaping @Sendable () -> Void) {
    // Night where the phone is, or the person turned these alerts off: in the app only, as on the server.
    let hour = Calendar.current.component(.hour, from: now)
    guard loadPrefs()?.alerts == true, hour >= 7, hour < 22 else {
      done()
      return
    }
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let allowed = [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
      self.queue.async {
        // Alerts not allowed (the app's own question was never answered yes), or the person turned
        // sessions or these alerts off (or signed out) while Health was read: nothing to put up.
        guard allowed, self.loadPrefs()?.alerts == true else {
          done()
          return
        }
        let center = UNUserNotificationCenter.current()
        var burst = self.loadBurst(now: now)
        let firstFold = !burst.folded
        burst.add(newest.map(WorkoutWatcher.payload), at: now)
        if burst.workouts.count > WorkoutWatcher.alertsAtOnce { burst.folded = true }
        self.saveBurst(burst)
        let group = DispatchGroup()
        if burst.folded {
          // More than three in one go: the go's single alerts come down, and its one alert goes up (or is brought up to date).
          let singles = burst.workouts.compactMap { $0["workoutId"] as? String }.map { "courtside-workout-\($0)" }
          center.removeDeliveredNotifications(withIdentifiers: singles)
          center.removePendingNotificationRequests(withIdentifiers: singles)
          group.enter()
          center.add(WorkoutWatcher.foundRequest(burst, sound: firstFold)) { error in
            if let error { NSLog("[WorkoutWatch] alert failed: %@", String(describing: error)) }
            group.leave()
          }
        } else {
          for w in newest {
            group.enter()
            center.add(WorkoutWatcher.request(for: w)) { error in
              if let error { NSLog("[WorkoutWatch] alert failed: %@", String(describing: error)) }
              group.leave()
            }
          }
        }
        group.notify(queue: self.queue) { done() }
      }
    }
  }

  /** The go under way: the alerts put up in the last `burstWindow`, or a new one. On `queue`. */
  private func loadBurst(now: Date) -> Burst {
    guard let d = defaults.dictionary(forKey: Key.burst), let b = Burst(d), now.timeIntervalSince(b.lastAt) < WorkoutWatcher.burstWindow, b.lastAt <= now.addingTimeInterval(60) else {
      return Burst(id: UUID().uuidString, lastAt: now, folded: false, workouts: [])
    }
    return b
  }

  private func saveBurst(_ b: Burst) {
    defaults.set(b.asDictionary, forKey: Key.burst)
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
      content.title = "Activity detected"
      content.body = "\(name(of: w.workoutActivityType)) · Log it on CourtSide."
    }
    content.sound = .default
    content.threadIdentifier = "courtside-workouts"
    content.userInfo = payload(w)
    // Named after the workout, so the same one can never show twice.
    return UNNotificationRequest(identifier: "courtside-workout-\(w.uuid.uuidString)", content: content, trigger: nil)
  }

  /**
   * The one alert for a go of more than three: "4 workouts found" ("4 tennis
   * sessions found" when all were tennis) / "Tap to log them on CourtSide.",
   * the same words as the server's (migration 2026100600018) and the row in
   * Notifications. No times or stats on the lock screen. Its tap opens their
   * list in the app (useWorkoutWatch), from `workouts`, newest first. Named
   * after the go, so bringing it up to date replaces it rather than adding one.
   */
  private static func foundRequest(_ b: Burst, sound: Bool) -> UNNotificationRequest {
    let content = UNMutableNotificationContent()
    let allTennis = b.workouts.allSatisfy { ($0["tennis"] as? Bool) == true }
    content.title = "\(b.workouts.count) \(allTennis ? "tennis sessions" : "workouts") found"
    content.body = "Tap to log them on CourtSide."
    content.sound = sound ? .default : nil
    content.threadIdentifier = "courtside-workouts"
    content.userInfo = ["courtside": "workouts-found", "workouts": Array(b.workouts.prefix(WorkoutWatcher.burstAtMost))]
    return UNNotificationRequest(identifier: "courtside-workouts-found-\(b.id)", content: content, trigger: nil)
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

  /** The person's switches, while the app has confirmed them within `lease`; nil when off. */
  private func loadPrefs() -> Prefs? {
    guard let confirmed = defaults.object(forKey: Key.confirmedAt) as? Date,
          Date().timeIntervalSince(confirmed) < WorkoutWatcher.lease else { return nil }
    return Prefs(defaults.dictionary(forKey: Key.prefs))
  }

  /** Everything kept for the watching gone, the observer stopped, and Health's wakes switched off. On `queue`. */
  private func forget() {
    for key in [Key.prefs, Key.anchor, Key.notified, Key.pending, Key.confirmedAt, Key.burst] { defaults.removeObject(forKey: key) }
    if let observer {
      store.stop(observer)
      self.observer = nil
    }
    endUnlockWait()
    guard HKHealthStore.isHealthDataAvailable() else { return }
    store.disableBackgroundDelivery(for: HKObjectType.workoutType()) { ok, error in
      if !ok || error != nil { NSLog("[WorkoutWatch] disableBackgroundDelivery failed: %@", String(describing: error)) }
    }
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

/**
 * One go of alerts, as kept on the phone: the workouts alerted (each one's
 * payload, newest first), when the last went up, and whether they were
 * folded into one "workouts found" alert. A go ends ten minutes after its
 * last alert (`burstWindow`).
 */
private struct Burst {
  let id: String
  var lastAt: Date
  var folded: Bool
  var workouts: [[String: Any]]

  init(id: String, lastAt: Date, folded: Bool, workouts: [[String: Any]]) {
    self.id = id
    self.lastAt = lastAt
    self.folded = folded
    self.workouts = workouts
  }

  init?(_ d: [String: Any]) {
    guard let id = d["id"] as? String, let lastAt = d["lastAt"] as? Date else { return nil }
    self.init(id: id, lastAt: lastAt, folded: d["folded"] as? Bool ?? false, workouts: d["workouts"] as? [[String: Any]] ?? [])
  }

  var asDictionary: [String: Any] { ["id": id, "lastAt": lastAt, "folded": folded, "workouts": workouts] }

  /** These workouts join the go (each once), newest first by when they ended. */
  mutating func add(_ payloads: [[String: Any]], at now: Date) {
    let known = Set(workouts.compactMap { $0["workoutId"] as? String })
    workouts += payloads.filter { ($0["workoutId"] as? String).map { !known.contains($0) } ?? false }
    // ISO times, all written the same way (UTC): their order as text is their order in time.
    workouts.sort { ($0["endedAt"] as? String ?? "") > ($1["endedAt"] as? String ?? "") }
    lastAt = now
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
