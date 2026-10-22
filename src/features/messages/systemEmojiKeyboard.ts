import { Platform } from 'react-native';
import { emojiKeyboardModule } from '../../../modules/emoji-keyboard';

/*
 * The chat's emoji button on a phone: the phone's own emoji keyboard (owner,
 * Oct 22: "clicking emoji should open the iPhones emoji thing ... or the
 * phones default one").
 *
 *  - iPhone build with modules/emoji-keyboard: the message box opens straight
 *    on the iOS emoji keyboard, or switches to it if the keyboard is already up.
 *  - Every other case (an older iPhone build, Android, the emoji keyboard
 *    turned off in the phone's Settings, or anything going wrong): the message
 *    box is focused, so the phone's keyboard comes up and its own emoji key is
 *    one tap away. Already up, focusing again does nothing.
 *
 * The website keeps the app's own emoji panel (computers have no emoji
 * keyboard of their own); this is only for phones.
 *
 * Call site, in app/messages/[id].tsx's toggleEmoji, on a phone:
 *   openSystemEmojiKeyboard(composer.current);
 */

/** What this needs from the message box. */
type Focusable = { focus: () => void } | null | undefined;

/** How long after focusing the box to check it opened on emoji (ms). */
const SETTLE_AFTER = 150;

export function openSystemEmojiKeyboard(box: Focusable): void {
  const native = Platform.OS === 'ios' ? emojiKeyboardModule() : null;
  if (!native) {
    box?.focus();
    return;
  }
  native.show().then(
    (switched) => {
      if (switched) return;
      // No box was focused: the module is armed for the next one to open.
      box?.focus();
      setTimeout(() => { native.settle().catch(() => {}); }, SETTLE_AFTER);
    },
    () => box?.focus(),
  );
}
