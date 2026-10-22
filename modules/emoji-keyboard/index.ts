import { requireOptionalNativeModule } from 'expo-modules-core';

/*
 * CourtSide's emoji keyboard module (iPhone only, from the first App Store
 * build that carries it). See ios/EmojiKeyboardSwitch.swift for how it works
 * and TESTING.md for how to try it. The app calls it through
 * src/features/messages/systemEmojiKeyboard.ts, never directly.
 *
 * Instant updates reach builds with and without this module (runtimeVersion
 * policy appVersion), so it is looked up optionally: on an older build, on
 * Android and on the website this is null, and the app falls back to
 * focusing the message box.
 */
export type EmojiKeyboardNative = {
  /** Whether the person has the emoji keyboard turned on at all. */
  isAvailable(): Promise<boolean>;
  /** Emoji keyboard on the focused text box now (true), or armed for the box about to be focused (false). */
  show(): Promise<boolean>;
  /** After focusing the box: switch it to emoji if it did not open that way. */
  settle(): Promise<boolean>;
};

let native: EmojiKeyboardNative | null | undefined;

/** The module, or null where the build does not have it. */
export function emojiKeyboardModule(): EmojiKeyboardNative | null {
  if (native === undefined) {
    try {
      native = requireOptionalNativeModule<EmojiKeyboardNative>('EmojiKeyboard');
    } catch {
      native = null;
    }
  }
  return native;
}
