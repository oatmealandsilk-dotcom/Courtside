import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Small, deliberately quiet haptics, on the phone's own engine.
 *
 * iOS shapes these — a light tap, a soft double-beat — rather than running
 * the motor for a set time, which is what made the old ones feel like a
 * phone call. The browser has only a plain buzz; it gets the shortest one.
 *
 * Rule of thumb: fire on a commitment, never on navigation. A like, a save,
 * a vote, a sent message. Not scrolling, not opening a screen. Haptics stop
 * reading as feedback the moment they become constant.
 */
const web = Platform.OS === 'web';
const canBuzz = web && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function run(work: () => Promise<void>, fallback: number | number[]) {
  try {
    if (web) { if (canBuzz) navigator.vibrate(fallback); return; }
    void work().catch(() => undefined);
  } catch {
    // A device that refuses to vibrate is never worth an error.
  }
}

/** Something was toggled on: a like, a save, an upvote. One light tap — crisper than soft, nowhere near a buzz. */
export const tap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 9);

/** Something was toggled back off. The faintest tick there is. */
export const untap = () => run(() => Haptics.selectionAsync(), 5);

/** Something left the device: a message sent, a post published. A gentle thud. */
export const commit = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft), 10);

/**
 * A like landing, a send going through. One soft tap — the rounded one, not
 * the sharp one — which is what Instagram's like actually is. The two-beat
 * "success" pattern read as a buzz, so it is gone.
 */
export const reward = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 9);

/**
 * Something arrived for you while the app is open: a message banner dropping
 * in. The soft tap the phone gives its own banners. A browser stays still: a
 * buzz out of nowhere on a web page reads as a fault.
 */
export const arrive = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft), 0);

/** Something went wrong and the person needs to notice. */
export const reject = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning), [0, 18, 50, 18]);

/**
 * An "are you sure?" card appearing (see ConfirmHost). A light tap; the
 * phone's warning beat when a yes would delete something or cut someone off,
 * so the hand feels the difference before the eye reads it.
 */
export const asking = (serious: boolean) => run(
  () => (serious ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  serious ? [0, 12, 40, 12] : 9,
);
