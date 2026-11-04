import UIKit

/*
 * The launch screen in the look the player picked, not the phone's light or dark mode (Nov 2, owner:
 * "if someone selects night, then the opening screen is always night, if it's day it's always day. If
 * it's whatever mode phone on then it responds according too. It shouldn't ever load black and load
 * into white or vise versa.").
 *
 * From the tap on the icon to the app's first page, the iPhone shows, in turn:
 *  1. iOS's saved picture of the launch screen, drawn before any of the app runs (LaunchSnapshots);
 *  2. the app's native copies of the launch screen while its code loads: expo-updates' stand-in view
 *     and expo-splash-screen's cover (both the SplashScreen storyboard, light or dark by the phone);
 *  3. the app's own drawn copy (src/components/LaunchMark.tsx), then the curtain, then the page.
 * All of them followed the phone's mode until now, so Night on a light phone opened white and then
 * turned dark, and Clean on a dark phone the other way round.
 *
 * The look is saved here by the app's code (src/lib/launchLook.ts: "light", "dark", or nothing for
 * the phone's own mode, as before), and read at the next launch, before anything is drawn:
 *  - the native copies (2) are given that look (their own light or dark setting, never the app's
 *    window, which would also change what the app reads as the phone's mode);
 *  - where iOS's picture (1) was not ours (iOS drew it again, or the phone is in the other mode and
 *    no picture of ours is there yet), the copies start as iOS's picture left off and dissolve into
 *    the look picked as soon as the app is on screen, a moment, rather than at the curtain a second
 *    later (the same change, once, softly, before the logo has settled);
 *  - the app's code is told which look its own copies (3) must draw (`applied`), so every frame after
 *    iOS's own picture is in the look picked.
 * Nothing saved (everyone, until the app's code saves a look): nothing here does anything.
 *
 * Only while the app's code still keeps the look (LaunchLookGate, which confirms it at every open):
 * should two opens in a row pass without that (an update that took the code away, say, rolled back), the
 * look saved is dropped at the next launch and iOS's own pictures put back, so a launch can never stay in
 * a look the app's own copies no longer draw (the very change between looks this is here to end).
 *
 * Native code: arrives with a new App Store build. The app's code that drives it arrives by update
 * and finds it missing on older builds (requireOptionalNativeModule).
 */

/// One of the launch screen's two looks.
enum LaunchLookStyle: String {
  case light
  case dark

  init(_ style: UIUserInterfaceStyle) {
    self = style == .dark ? .dark : .light
  }

  var interfaceStyle: UIUserInterfaceStyle {
    self == .dark ? .dark : .light
  }
}

/// What is done with iOS's own saved pictures of the launch screen (LaunchSnapshots).
enum SnapshotMode: String {
  /// Left as iOS draws them, by the phone's mode.
  case off
  /// The look picked written over them, in iOS's own picture format, only where the phone can write it.
  case same
  /// The same, falling back to PNG under iOS's file name where it cannot (LLDynamicLaunchScreen's way).
  case png
}

final class LaunchLook: NSObject {
  static let shared = LaunchLook()

  static let lookKey = "CourtSideLaunchLook"
  static let snapshotsKey = "CourtSideLaunchLookSnapshots"
  static let dissolveKey = "CourtSideLaunchLookDissolveMs"
  /// Opens in a row (the app on screen) with a look saved that the app's code never confirmed (confirm()).
  static let missesKey = "CourtSideLaunchLookUnconfirmedOpens"
  /// At this many, the next launch drops the look saved (two, so one open quit before the app's code ran never does).
  static let missesAllowed = 2

  /// The look saved for this open; nil: the phone's own, as before.
  private(set) var stored: LaunchLookStyle?
  /// The phone's own light or dark mode as the app opened.
  private(set) var phoneAtOpen: LaunchLookStyle = .light
  /// Whether iOS's own first picture this open was ours, in the look saved.
  private(set) var pictureWasOurs = false
  /// The look the app's native copies started in this open.
  private(set) var startedIn: LaunchLookStyle?
  /// The look the native copies are in now (nil: nothing saved, the phone's own).
  private(set) var current: LaunchLookStyle?
  private var prepared = false
  private var dissolved = false
  /// Whether the look saved was dropped at this launch (unconfirmed opens, see missesKey).
  private(set) var expired = false
  /// Whether the app's code confirmed the look this run, and whether this run was counted as an open without it.
  private var confirmedThisRun = false
  private var countedThisRun = false
  /// When this process prepared (wall clock, which runs on while the phone sleeps), and whether the open's first window has come since.
  private var preparedAt: TimeInterval = 0
  private var opened = false
  /// iOS's pictures were due to be put right while the app was only in the background: done once it is opened.
  private var syncOwed = false
  private weak var standIn: UIView?
  private weak var cover: UIView?
  private var syncTimer: Timer?
  /// When each step of this open happened (ms since 1970), for the simulator checks: prepared, visible, active, dissolved.
  private var times: [String: Double] = [:]
  /// What started the early dissolve this open: "active" (the app came on screen) or "fallback" (0.6 s after its window).
  private var dissolvedBy: String?

  private func mark(_ step: String) {
    if times[step] == nil { times[step] = (Date().timeIntervalSince1970 * 1000).rounded() }
  }

  /// The look the app's own drawn copies must be in this open: the one saved (the native copies end in it).
  var applied: LaunchLookStyle? { stored }

  static var snapshotMode: SnapshotMode {
    UserDefaults.standard.string(forKey: snapshotsKey).flatMap(SnapshotMode.init(rawValue:)) ?? .off
  }

  // MARK: Launch

  /// As the app launches, before any window: what was saved, and what iOS's own picture just showed.
  func prepareAtLaunch() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !prepared else { return }
    prepared = true
    preparedAt = Date().timeIntervalSince1970
    mark("prepared")
    let defaults = UserDefaults.standard
    stored = defaults.string(forKey: Self.lookKey).flatMap(LaunchLookStyle.init(rawValue:))
    if stored != nil, defaults.integer(forKey: Self.missesKey) >= Self.missesAllowed {
      // The app's code that keeps the look has not run in the last opens (an update took it away): the
      // phone's own mode again, as before, and iOS's pictures put back a moment later (below).
      for key in [Self.lookKey, Self.snapshotsKey, Self.dissolveKey, Self.missesKey] { defaults.removeObject(forKey: key) }
      stored = nil
      expired = true
    }
    phoneAtOpen = LaunchLookStyle(UIScreen.main.traitCollection.userInterfaceStyle)
    guard stored != nil else {
      // Nothing saved: everything as before. Only pictures of ours left from before are put back.
      if LaunchSnapshots.anyOurs { scheduleSync(after: 3) }
      return
    }
    readOpen()
    // Only the launch's own windows are looked at: up to 8 s after the open's first one (openBegins).
    NotificationCenter.default.addObserver(self, selector: #selector(windowBecameVisible(_:)), name: UIWindow.didBecomeVisibleNotification, object: nil)
    // iOS's pictures put right for the next open, once the app is up and settled.
    scheduleSync(after: 3)
  }

  /// What iOS's own picture showed this open and the look the native copies start in, from the phone's mode now.
  private func readOpen() {
    guard let stored else { return }
    phoneAtOpen = LaunchLookStyle(UIScreen.main.traitCollection.userInterfaceStyle)
    pictureWasOurs = LaunchSnapshots.pictureWasOurs(mode: phoneAtOpen, look: stored)
    let start = (pictureWasOurs || phoneAtOpen == stored) ? stored : phoneAtOpen
    startedIn = start
    current = start
    setStatusBar(start, animated: false)
  }

  /**
   * The open's first window or root view. On a tap on the icon it comes a moment after the launch, and
   * nothing changes. Where the process was started earlier in the background (Apple Health may wake the
   * app hours before it is opened, with no window), the phone's mode and iOS's picture are read again
   * now, as this open's, and iOS's pictures are put right after it.
   */
  private func openBegins() {
    guard !opened, stored != nil else { return }
    opened = true
    if abs(Date().timeIntervalSince1970 - preparedAt) > 2 {
      mark("reread")
      readOpen()
      scheduleSync(after: 3)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      guard let self else { return }
      NotificationCenter.default.removeObserver(self, name: UIWindow.didBecomeVisibleNotification, object: nil)
    }
  }

  @objc private func windowBecameVisible(_ note: Notification) {
    guard let window = note.object as? UIWindow else { return }
    openBegins()
    guard let root = window.rootViewController?.view else { return }
    mark("visible")
    restyle(root)
    // Should the app never be told it is active (it always is, on a real open), the dissolve still comes.
    if startedIn != stored {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.dissolve(by: "fallback") }
    }
  }

  /// React Native's root view, as it is made: its cover (expo-splash-screen's copy) gets the look.
  func rootViewMade(_ root: UIView) {
    openBegins()
    guard current != nil else { return }
    restyle(root)
    // Made before expo-splash-screen put its cover in (an order of add-ons other than today's): a turn later, before anything is drawn.
    if cover == nil, Self.coverOf(root) == nil, Self.hasCover(root) {
      DispatchQueue.main.async { [weak self] in self?.restyle(root) }
    }
  }

  /**
   * Gives the launch's native copies the current look: expo-splash-screen's cover on React Native's
   * root view (never the root view itself, whose light or dark setting the app reads as the phone's),
   * or expo-updates' stand-in view, shown until the app's code is ready to load and then thrown away.
   */
  private func restyle(_ root: UIView) {
    guard let current else { return }
    if let found = Self.coverOf(root) {
      found.overrideUserInterfaceStyle = current.interfaceStyle
      cover = found
    } else if Self.isStandIn(root) {
      root.overrideUserInterfaceStyle = current.interfaceStyle
      standIn = root
    }
  }

  /// Whether a root view is React Native's (it carries a cover, `loadingView`).
  private static func hasCover(_ root: UIView) -> Bool {
    root.responds(to: NSSelectorFromString("loadingView"))
  }

  /// expo-splash-screen's copy of the launch screen on React Native's root view, while it is there.
  private static func coverOf(_ root: UIView) -> UIView? {
    guard hasCover(root) else { return nil }
    return root.value(forKey: "loadingView") as? UIView
  }

  /// expo-updates' stand-in root view (EXDeferredRCTRootView), up until the app's code is ready.
  private static func isStandIn(_ view: UIView) -> Bool {
    NSStringFromClass(type(of: view)).contains("DeferredRCTRootView")
  }

  /**
   * The app is on screen: where its copies started in the phone's look (iOS's picture was not ours),
   * they dissolve into the look saved now, once.
   */
  func dissolve(by: String) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let stored, let current, current != stored, !dissolved else { return }
    dissolved = true
    dissolvedBy = by
    mark("dissolved")
    self.current = stored
    let seconds = max(0, UserDefaults.standard.object(forKey: Self.dissolveKey) as? Double ?? 250) / 1000
    for view in [standIn, cover].compactMap({ $0 }) where view.window != nil {
      let host = view.superview ?? view
      UIView.transition(with: host, duration: seconds, options: [.transitionCrossDissolve, .allowUserInteraction, .beginFromCurrentState]) {
        view.overrideUserInterfaceStyle = stored.interfaceStyle
        if #available(iOS 17.0, *) { view.updateTraitsIfNeeded() }
        view.layoutIfNeeded()
      }
    }
    // A cover not on screen yet (expo-updates still deciding) is simply given the look.
    for view in [standIn, cover].compactMap({ $0 }) where view.window == nil {
      view.overrideUserInterfaceStyle = stored.interfaceStyle
    }
    setStatusBar(stored, animated: true)
  }

  /**
   * The status bar's icons over the launch copies: light on the dark look, dark on the white one, until
   * the app's code sets them from its first screen (as before). The app sets them this same way
   * (UIViewControllerBasedStatusBarAppearance is off, so this is what React Native's StatusBar uses).
   */
  private func setStatusBar(_ look: LaunchLookStyle, animated: Bool) {
    let style: UIStatusBarStyle = look == .dark ? .lightContent : .darkContent
    UIApplication.shared.setStatusBarStyle(style, animated: animated)
  }

  /// The app came on screen (active): the early dissolve, where one is due.
  func becameActive() {
    dispatchPrecondition(condition: .onQueue(.main))
    if prepared && stored != nil { mark("active") }
    if stored != nil && !confirmedThisRun && !countedThisRun {
      // An open with a look saved: counted until the app's code confirms it (confirm() takes it off again).
      countedThisRun = true
      let defaults = UserDefaults.standard
      defaults.set(defaults.integer(forKey: Self.missesKey) + 1, forKey: Self.missesKey)
    }
    dissolve(by: "active")
    if syncOwed {
      syncOwed = false
      scheduleSync(after: 3)
    }
  }

  /**
   * The app's code that keeps the launch look is running (LaunchLookGate, at every open; any setLook
   * too): the look saved stays. Without it two opens in a row, the next launch drops it (missesKey).
   * From any thread.
   */
  func confirm() {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.confirmedThisRun = true
      let defaults = UserDefaults.standard
      if defaults.object(forKey: Self.missesKey) != nil { defaults.removeObject(forKey: Self.missesKey) }
    }
  }

  // MARK: Saving (from the app's code)

  /**
   * The look for the next open, from the app's code: "light", "dark", or nil (the phone's own mode),
   * with what is done with iOS's own pictures and how long the early dissolve takes. Nothing changes
   * on screen now; iOS's pictures are put right a moment later.
   */
  func save(look: String?, snapshots: String, dissolveMs: Double) {
    confirm()
    let style = look.flatMap(LaunchLookStyle.init(rawValue:))
    let mode = SnapshotMode(rawValue: snapshots) ?? .off
    let defaults = UserDefaults.standard
    let was = (defaults.string(forKey: Self.lookKey), defaults.string(forKey: Self.snapshotsKey), defaults.object(forKey: Self.dissolveKey) as? Double)
    if let style { defaults.set(style.rawValue, forKey: Self.lookKey) } else { defaults.removeObject(forKey: Self.lookKey) }
    if style == nil && mode == .off {
      defaults.removeObject(forKey: Self.snapshotsKey)
      defaults.removeObject(forKey: Self.dissolveKey)
    } else {
      defaults.set(mode.rawValue, forKey: Self.snapshotsKey)
      defaults.set(dissolveMs, forKey: Self.dissolveKey)
    }
    let changed = was.0 != style?.rawValue || was.1 != (style == nil && mode == .off ? nil : mode.rawValue)
    // The same as already saved and nothing of ours to put back (everyone with the switch off): no work at all.
    if !changed && style == nil && !LaunchSnapshots.anyOurs { return }
    // A change half a second on, once the Theme page's fade (250 ms) is over, so the drawing never catches it.
    DispatchQueue.main.async { [weak self] in self?.scheduleSync(after: changed ? 0.5 : 3) }
  }

  /// iOS's pictures brought in line with what is saved, after `seconds` (a later ask moves it on).
  func scheduleSync(after seconds: TimeInterval) {
    dispatchPrecondition(condition: .onQueue(.main))
    syncTimer?.invalidate()
    syncTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
      guard let self else { return }
      self.syncTimer = nil
      // Never while the app is only woken in the background (Apple Health): the next open does it.
      guard UIApplication.shared.applicationState != .background else {
        self.syncOwed = true
        return
      }
      self.syncNow(done: nil)
    }
  }

  /// iOS's pictures brought in line with what is saved, now.
  func syncNow(done: (() -> Void)?) {
    dispatchPrecondition(condition: .onQueue(.main))
    let look = UserDefaults.standard.string(forKey: Self.lookKey).flatMap(LaunchLookStyle.init(rawValue:))
    LaunchSnapshots.shared.sync(look: look, mode: Self.snapshotMode, done: done)
  }

  /**
   * Leaving the app (the app switcher, where it can be swiped away without ever going to the
   * background, or the home screen): a last chance to put iOS's pictures right for the next open,
   * should the timer not have run.
   */
  func leaving() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard syncTimer != nil else { return }
    syncTimer?.invalidate()
    syncTimer = nil
    var task: UIBackgroundTaskIdentifier = .invalid
    task = UIApplication.shared.beginBackgroundTask(withName: "CourtSideLaunchLook") {
      UIApplication.shared.endBackgroundTask(task)
      task = .invalid
    }
    syncNow {
      if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
      task = .invalid
    }
  }

  // MARK: For the simulator checks

  func status() -> [String: Any] {
    [
      "saved": UserDefaults.standard.string(forKey: Self.lookKey) ?? NSNull(),
      "snapshots": Self.snapshotMode.rawValue,
      "dissolveMs": UserDefaults.standard.object(forKey: Self.dissolveKey) as? Double ?? NSNull(),
      "storedAtOpen": stored?.rawValue ?? NSNull(),
      "phoneAtOpen": phoneAtOpen.rawValue,
      "pictureWasOurs": pictureWasOurs,
      "startedIn": startedIn?.rawValue ?? NSNull(),
      "now": current?.rawValue ?? NSNull(),
      "dissolved": dissolved,
      "pictures": LaunchSnapshots.shared.lastReport,
      "iOS": UIDevice.current.systemVersion,
      "dissolvedBy": dissolvedBy ?? NSNull(),
      "times": times,
      "expired": expired,
      "unconfirmedOpens": UserDefaults.standard.integer(forKey: Self.missesKey),
      "confirmed": confirmedThisRun,
    ]
  }
}
