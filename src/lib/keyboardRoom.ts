import { Platform, type ViewStyle } from 'react-native';
import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

/**
 * Room for the keyboard, on Android (Oct 5).
 *
 * The app is drawn edge to edge there (always, from this Expo version on):
 * under the status bar, the navigation bar and the keyboard. Android no
 * longer shrinks the window when the keyboard opens, so a page has to make
 * the room itself, or its lowest boxes and buttons sit under the keys. This
 * is that room: an empty box's style, as tall as the keyboard (the
 * navigation bar under it included), following it frame by frame on the
 * animation thread, 0 with the keyboard down.
 *
 * `less` is room the page already keeps at its bottom (a tab bar's, a
 * home-strip's), which the keyboard covers anyway and so is not added twice.
 *
 * An iPhone already has its own (the scrollers' automatic keyboard insets and
 * KeyboardAvoidingView), and a browser has none to make, so there this is
 * always 0 and changes nothing. Which version runs is fixed per platform, so
 * the hooks inside never change between draws.
 */
function useAndroidKeyboardRoom(less = 0): ViewStyle {
  const keyboard = useAnimatedKeyboard();
  return useAnimatedStyle(() => ({ height: Math.max(0, keyboard.height.value - less) })) as ViewStyle;
}

const NONE: ViewStyle = { height: 0 };
function useNoKeyboardRoom(_less = 0): ViewStyle {
  return NONE;
}

export const useKeyboardRoom: (less?: number) => ViewStyle = Platform.OS === 'android' ? useAndroidKeyboardRoom : useNoKeyboardRoom;

/** Whether this phone needs the room above (Android only). */
export const KEYBOARD_ROOM = Platform.OS === 'android';
