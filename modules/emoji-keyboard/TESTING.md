# Emoji keyboard module: how to test it

**What it is for.** In a chat, tapping the emoji button should open the
iPhone's own emoji keyboard (the one you get from the 😀 key), not CourtSide's
own emoji panel. React Native (the toolkit the app is written in) has no way to
ask for that keyboard, so this folder adds a tiny piece of iPhone code (Swift)
that does it. Because it is iPhone code, not app JavaScript, it only arrives
with a **new App Store / TestFlight build**, not with an instant update.

**Nobody could compile it here** (this Mac has no Xcode), so the first real
check is the TestFlight build. If that build fails to compile, the error will
name `EmojiKeyboardSwitch.swift` or `EmojiKeyboardModule.swift`; send it to
Claude.

## Before the build: nothing to set up

Expo finds every folder in `modules/` by itself (the same way
`modules/workout-watch` got into build 15). No change to `package.json` or
`app.config.js` is needed. Checked with
`npx expo-modules-autolinking resolve -p apple`, which lists `EmojiKeyboard`.

## Hooked to the chat

In `app/messages/[id].tsx`, `toggleEmoji` calls
`openSystemEmojiKeyboard(composer.current)` on a phone (from
`src/features/messages/systemEmojiKeyboard.ts`). When the module is missing
(older builds, Android) that call just focuses the message box, so the same
instant update works on every build. The website keeps CourtSide's own panel.

## Version number: leave it

`app.config.js` says to bump `version` when something native changes. Not for
this module: the app treats it as optional, so keeping 1.0.0 is what lets one
instant update serve both the current store build and the next one. Bumping
`version` would stop today's builds from getting any later update.

## On TestFlight (iPhone)

1. Install the new build from TestFlight and open any chat.
2. **Keyboard down, tap the emoji button.** The keyboard should rise already
   showing emoji (not letters). If it rises with letters and flips to emoji a
   split second later, that is the backup path working; fine, but tell Claude.
3. **Tap a few emoji.** They go into the message box where the cursor is.
4. **Tap ABC** (bottom left of the emoji keyboard). Letters come back. Type a
   word, then tap the emoji button again: emoji keyboard again.
5. **Keyboard up with letters, tap the emoji button.** It switches to emoji in
   place, without the keyboard dropping. Not checked before this build: iOS may
   only read the keyboard choice when the box is first tapped. If nothing
   happens here (letters stay), it is harmless, but tell Claude: the follow-up
   is to drop and re-raise the box with emoji set, which needs care so the
   chat bar does not jump.
6. **Leave the chat and come back,** tap into the box (not the emoji button):
   you get whatever keyboard you used last, as iPhones always do. The app no
   longer forces emoji once you have left the box.
7. **Other boxes are untouched:** search, a comment, a post caption. They open
   with your normal keyboard.
8. **Emoji keyboard turned off:** Settings → General → Keyboard → Keyboards,
   remove Emoji. In a chat, the emoji button just opens the normal keyboard.
   (Add Emoji back afterwards.)

## Older builds, Android and the website

- **Older App Store builds** (without this module) get the instant update too:
  the emoji button just opens the phone's keyboard, and its own 😀 key is one
  tap away.
- **Android:** the same as older builds: the keyboard opens. Android has no
  public way for an app to pick the emoji keyboard.
- **Website:** keeps CourtSide's own emoji panel (computers have no emoji
  keyboard to open).

## App Review

The module uses only public Apple interfaces: the documented `textInputMode`
property that iPhone text boxes already have, the list of keyboards the person
has turned on (`UITextInputMode.activeInputModes`), and the standard
Objective-C runtime to give React Native's two text-box classes that property.
No private Apple code is called, so the automated check for private code has
nothing to flag. Apps have opened the emoji keyboard this way for years. The
small risk is that a future iOS stops honouring it; then the button simply
opens the normal keyboard, like on an older build.
