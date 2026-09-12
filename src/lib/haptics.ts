import { Platform, Vibration } from 'react-native';

/**
 * Small, deliberately quiet haptics.
 *
 * Built on React Native's own Vibration API and the browser's navigator.vibrate
 * rather than expo-haptics, so it adds no dependency and cannot break the build.
 * The trade-off is coarser control — these are plain durations, not iOS's
 * weighted impact styles. Swapping the four bodies below for expo-haptics calls
 * is a ten-line change if that ever becomes worth a dependency.
 *
 * Rule of thumb for using these: fire on a commitment, never on navigation.
 * A like, a save, a vote, a sent message. Not scrolling, not opening a screen.
 * Haptics stop reading as feedback the moment they become constant.
 */

const supported =
  Platform.OS === 'web'
    ? typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    : Platform.OS === 'android' || Platform.OS === 'ios';

function buzz(pattern: number | number[]) {
  if (!supported) return;
  try {
    if (Platform.OS === 'web') {
      navigator.vibrate(pattern as number | number[]);
      return;
    }
    // iOS ignores durations and plays a fixed short tap, which is the effect we
    // want anyway; Android honours them.
    Vibration.vibrate(pattern as number, false);
  } catch {
    // A device that refuses to vibrate is never worth an error.
  }
}

/** Something was toggled on: a like, a save, an upvote. */
export const tap = () => buzz(12);

/** Something was toggled back off. Softer than its counterpart. */
export const untap = () => buzz(8);

/** Something left the device: a message sent, a post published. */
export const commit = () => buzz([0, 14, 40, 22]);

/**
 * A like landing, or a send going through. Two beats, the first heavier — it
 * reads as "got it" where a single long buzz reads as an error.
 */
export const reward = () => buzz([0, 20, 45, 14]);

/** Something went wrong and the user needs to notice. */
export const reject = () => buzz([0, 26, 60, 26]);
