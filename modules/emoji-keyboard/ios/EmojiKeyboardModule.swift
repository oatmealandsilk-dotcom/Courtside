import ExpoModulesCore

/**
 * The app's handle on EmojiKeyboardSwitch (see there). The chat's emoji button
 * calls show(); if no text box was focused yet, the app focuses the message
 * box and calls settle() a moment later (src/features/messages/systemEmojiKeyboard.ts).
 * Both run on the main thread, as UIKit needs.
 *
 * Builds before this module do not carry it: the app's JavaScript finds it
 * missing and just focuses the message box (requireOptionalNativeModule).
 */
public class EmojiKeyboardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EmojiKeyboard")

    /** Whether the person has the emoji keyboard turned on at all. */
    AsyncFunction("isAvailable") { () -> Bool in
      EmojiKeyboardSwitch.emojiMode != nil
    }.runOnQueue(.main)

    AsyncFunction("show") { () -> Bool in
      EmojiKeyboardSwitch.show()
    }.runOnQueue(.main)

    AsyncFunction("settle") { () -> Bool in
      EmojiKeyboardSwitch.settle()
    }.runOnQueue(.main)
  }
}
