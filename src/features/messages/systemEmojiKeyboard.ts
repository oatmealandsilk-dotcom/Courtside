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
 * Called from app/messages/[id].tsx's toggleEmoji, on a phone, with the
 * composer (the chat screen's only text box, which matters: the module puts
 * emoji on whichever React Native text box is focused).
 */

/** What this needs from the message box. */
type Focusable = { focus: () => void } | null | undefined;

/**
 * When, after focusing the box, to check it opened on emoji (ms). The second
 * look is for a slow phone or a busy app, where the box can take longer than
 * the first to be focused; the module stays armed for a second meanwhile.
 */
const SETTLE_AFTER = [150, 450];

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
      const look = (at: number) => {
        setTimeout(() => {
          native.settle().then(
            (done) => { if (!done && at + 1 < SETTLE_AFTER.length) look(at + 1); },
            () => {},
          );
        }, SETTLE_AFTER[at] - (at > 0 ? SETTLE_AFTER[at - 1] : 0));
      };
      look(0);
    },
    () => box?.focus(),
  );
}
