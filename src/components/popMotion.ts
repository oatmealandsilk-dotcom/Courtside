import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * How the app's centred pop-up card comes and goes: every "are you sure?"
 * (ConfirmHost), and the first "Let friends see you're up to hit?" (design
 * C, app/map-visibility). One motion, the one phones already run: the dim
 * fades in, the card fades in as it grows the last few percent on a spring;
 * on an answer both fade away. With Reduce Motion on, only the fades.
 *
 * Only ever the card and its own dim: never a parent of the glass tab bar or
 * of any blur (those went see-through when faded, Oct 17).
 *
 * Timed by hand, so Reduce Motion is honoured by the caller (fade only)
 * rather than by skipping the fade too.
 */
const NEVER = ReduceMotion.Never;
/** The card grows the last few percent on a spring: quick, with the faintest settle. */
export const POP_FROM_SCALE = 0.92;
export const POP_SPRING = { damping: 20, stiffness: 320, mass: 0.8, reduceMotion: NEVER } as const;
export const POP_IN = { duration: 180, easing: Easing.out(Easing.quad), reduceMotion: NEVER } as const;
export const POP_OUT = { duration: 140, easing: Easing.in(Easing.quad), reduceMotion: NEVER } as const;
/**
 * A touch this soon after the card comes up is the second half of a double
 * tap on whatever asked, not an answer, so it is ignored (the phone's own
 * alert does the same while it appears). 300 ms is Android's double-tap window.
 */
export const POP_SETTLE_MS = 300;
