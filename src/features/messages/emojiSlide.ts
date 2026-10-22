import { Easing } from 'react-native-reanimated';

/** How the emoji keyboard and the typing bar slide up and down together with the phone keyboard down (keyboardLift). */
export const EMOJI_SLIDE = { duration: 280, easing: Easing.bezier(0.32, 0.72, 0, 1) };
