import ObjectiveC
import QuartzCore
import UIKit

/**
 * Puts the phone's own emoji keyboard up on React Native's text boxes
 * (owner, Oct 22: "clicking emoji should open the iPhones emoji thing").
 *
 * React Native has no keyboardType for emoji, and UIKit has no setter for the
 * keyboard's language either. What UIKit does have is a public, overridable
 * property: UIResponder.textInputMode. When a text box becomes first
 * responder, or is told reloadInputViews(), the keyboard asks it for its
 * textInputMode and shows that keyboard if the person has it turned on.
 * Returning the emoji mode from there is the long-standing way apps open the
 * emoji keyboard on purpose.
 *
 * We do not own React Native's text box classes (RCTUITextView for the chat's
 * multi-line box, RCTUITextField for one-line boxes), so the override is put
 * on those two classes only, at runtime, with the public Objective-C runtime
 * (class_addMethod / method_setImplementation, never UIKit's own classes and
 * never a private selector). The new getter returns exactly what the old one
 * did unless that one box carries our flag, so it is a no-op everywhere else:
 *
 *  - show(): the focused box gets the flag and reloadInputViews(), so the
 *    keyboard switches to emoji in place. With no box focused yet, it arms for
 *    one second instead: the first box that becomes first responder in that
 *    second takes the flag as it opens, so its keyboard comes up as emoji.
 *  - settle(): after the app focuses the box, a second look: if the box is
 *    focused but did not take the flag while opening, give it now and reload.
 *    No box focused yet: the arm is left on, and the app looks once more.
 *  - The flag comes off when that box stops being edited (blur), and when the
 *    person switches away from emoji themselves (the ABC or globe key), so a
 *    later reload by React Native never snaps them back to emoji.
 *
 * If the person has turned the emoji keyboard off (Settings > General >
 * Keyboard > Keyboards), there is no emoji mode to return: nothing changes
 * and the box opens with their normal keyboard.
 *
 * All of this runs on the main thread (the module's functions run there).
 */
enum EmojiKeyboardSwitch {
  private static let flagKey = UnsafeRawPointer(UnsafeMutableRawPointer.allocate(byteCount: 1, alignment: 1))
  private static let emojiLanguage = "emoji"

  /** Until when a box opening now should come up as emoji (0 = not armed). */
  private static var armedUntil: CFTimeInterval = 0
  /** The box that carries the flag now, to take it off when the person switches away. */
  private static weak var flagged: UIResponder?
  /** The first responder, as reportFirstResponder found it. */
  fileprivate static weak var found: UIResponder?
  /** React Native's text box classes that got the override. */
  private static var classes: [AnyClass] = []
  /** Each of those classes' getter as it was, by class. */
  private typealias Getter = @convention(c) (AnyObject, Selector) -> UITextInputMode?
  private static var originals: [ObjectIdentifier: Getter] = [:]
  private static let getterSelector = #selector(getter: UIResponder.textInputMode)

  /** The emoji keyboard, if the person has it turned on. */
  static var emojiMode: UITextInputMode? {
    UITextInputMode.activeInputModes.first { $0.primaryLanguage == emojiLanguage }
  }

  /** Puts the override in place once, the first time it is needed. */
  private static let installed: Bool = {
    for name in ["RCTUITextView", "RCTUITextField"] {
      if let cls = NSClassFromString(name), EmojiKeyboardSwitch.install(on: cls) {
        EmojiKeyboardSwitch.classes.append(cls)
      }
    }
    if !EmojiKeyboardSwitch.classes.isEmpty { EmojiKeyboardSwitch.observe() }
    return !EmojiKeyboardSwitch.classes.isEmpty
  }()

  /** The emoji keyboard now on the focused box (true), or armed for the box about to open (false). */
  static func show() -> Bool {
    guard installed, emojiMode != nil else { return false }
    if let box = focusedBox() {
      setFlag(box, true)
      box.reloadInputViews()
      return true
    }
    armedUntil = CACurrentMediaTime() + 1.0
    return false
  }

  /**
   * After the app focused the box: switch it now if it did not take the flag
   * while opening. With no box focused yet (a slow phone or a busy app can take
   * longer than the app's first look to focus it), the arm stays on for the
   * rest of its second, so a box that opens late still comes up as emoji.
   */
  static func settle() -> Bool {
    guard installed, emojiMode != nil, let box = focusedBox() else { return false }
    armedUntil = 0
    if hasFlag(box) { return true }
    setFlag(box, true)
    box.reloadInputViews()
    return true
  }

  // MARK: - The override

  private static func install(on cls: AnyClass) -> Bool {
    let sel = getterSelector
    guard let inherited = class_getInstanceMethod(cls, sel) else { return false }
    let original = unsafeBitCast(method_getImplementation(inherited), to: Getter.self)
    originals[ObjectIdentifier(cls)] = original
    let getter: @convention(block) (AnyObject) -> UITextInputMode? = { box in
      if let emoji = EmojiKeyboardSwitch.wantsEmoji(box) { return emoji }
      return original(box, sel)
    }
    let imp = imp_implementationWithBlock(getter)
    // The class's own getter if it has one is replaced; otherwise ours is added
    // to this class only, calling the inherited one (UITextView's or UITextField's
    // stay untouched for every other text box in the app).
    if !class_addMethod(cls, sel, imp, method_getTypeEncoding(inherited)) {
      method_setImplementation(inherited, imp)
    }
    return true
  }

  /** The emoji mode if this box should show it, nil to answer as before. */
  private static func wantsEmoji(_ box: AnyObject) -> UITextInputMode? {
    if hasFlag(box) { return emojiMode }
    guard armedUntil > 0, CACurrentMediaTime() < armedUntil,
          let responder = box as? UIResponder, responder.isFirstResponder else { return nil }
    armedUntil = 0
    setFlag(responder, true)
    return emojiMode
  }

  // MARK: - The flag

  private static func hasFlag(_ box: AnyObject) -> Bool {
    (objc_getAssociatedObject(box, flagKey) as? NSNumber)?.boolValue == true
  }

  private static func setFlag(_ box: AnyObject, _ on: Bool) {
    objc_setAssociatedObject(box, flagKey, on ? NSNumber(value: true) : nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    if on {
      if let previous = flagged, previous !== box { setFlag(previous, false) }
      flagged = box as? UIResponder
    } else if flagged === box {
      flagged = nil
    }
  }

  private static func observe() {
    let center = NotificationCenter.default
    for name in [UITextView.textDidEndEditingNotification, UITextField.textDidEndEditingNotification] {
      center.addObserver(forName: name, object: nil, queue: .main) { note in
        guard let object = note.object else { return }
        let box = object as AnyObject
        if EmojiKeyboardSwitch.hasFlag(box) { EmojiKeyboardSwitch.setFlag(box, false) }
      }
    }
    center.addObserver(forName: UITextInputMode.currentInputModeDidChangeNotification, object: nil, queue: .main) { note in
      guard let box = EmojiKeyboardSwitch.flagged else { return }
      // Only a switch we can see is away from emoji lets go: our own switch to
      // emoji posts this too, and must not undo itself. The keyboard now up is
      // the note's own, or what the box's getter said before ours.
      let mode = (note.object as? UITextInputMode) ?? EmojiKeyboardSwitch.originalMode(of: box)
      guard let language = mode?.primaryLanguage, language != EmojiKeyboardSwitch.emojiLanguage else { return }
      EmojiKeyboardSwitch.setFlag(box, false)
    }
  }

  /** What the box's getter would say without ours. */
  private static func originalMode(of box: UIResponder) -> UITextInputMode? {
    guard let cls = classes.first(where: { box.isKind(of: $0) }),
          let original = originals[ObjectIdentifier(cls)] else { return nil }
    return original(box, getterSelector)
  }

  // MARK: - Finding the focused box

  /** The focused text box, if it is one of React Native's. */
  private static func focusedBox() -> UIResponder? {
    found = nil
    // Sent to nil, an action goes to the first responder: the public way to find it.
    UIApplication.shared.sendAction(#selector(UIResponder.courtsideReportFirstResponder(_:)), to: nil, from: nil, for: nil)
    guard let responder = found else { return nil }
    found = nil
    return classes.contains(where: { responder.isKind(of: $0) }) ? responder : nil
  }
}

extension UIResponder {
  /** Answers EmojiKeyboardSwitch's "who is first responder?" (see focusedBox). */
  @objc fileprivate func courtsideReportFirstResponder(_ sender: Any?) {
    EmojiKeyboardSwitch.found = self
  }
}
