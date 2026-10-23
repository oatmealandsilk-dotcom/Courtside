import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

export type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

/*
 * The room under a chat's typing bar. With the keyboard down, the bar rests a
 * little above the home indicator; with it up, the bar sits right on the
 * keyboard. The room follows the keyboard frame by frame (read on the
 * animation thread, so nothing in React draws while it moves): the bar rides
 * up with the keyboard and, on an iPhone, when the messages are dragged down
 * (iMessage's way of putting the keyboard away), back down under the
 * finger. The chat's list is upside down (its newest message is its start),
 * so as the room grows the newest message rides up with the bar by itself,
 * with no scrolling to do. The browser's version is keyboardLift.web.ts.
 *
 * Android works the same way (Oct 5). The app there is always drawn edge to
 * edge, under the status bar, the navigation bar and the keyboard: Android
 * no longer shrinks the window when the keyboard opens, so without this room
 * the bar would sit under the keys. The keyboard's height read here is the
 * whole of it from the bottom of the screen, the navigation bar included.
 */

/**
 * On a phone (iPhone and Android): the keyboard's own position, every frame.
 * A phone has no emoji panel of the app's own (Oct 22, "clicking emoji should
 * open the iPhone's emoji thing"): the emoji button brings up the phone's own
 * keyboard, with its emoji key, so the emoji options are not used here.
 */
function useNativeLift({ rest, focused, typing }: KeyboardLiftOptions): KeyboardLift {
  const keyboard = useAnimatedKeyboard();
  const restRoom = useSharedValue(rest);
  const front = useSharedValue(focused);
  // Off the page in front, the room only ever shrinks (a sheet's own keyboard
  // must not lift the bar under the sheet); it follows the keyboard again
  // once the chat is in front with the keyboard down.
  const follow = useSharedValue(focused);
  const room = useSharedValue(rest);
  useEffect(() => { restRoom.value = rest; }, [rest, restRoom]);
  useEffect(() => {
    front.value = focused;
    if (!focused) follow.value = false;
  }, [focused, front, follow]);
  // Typing in the chat's own box: the keyboard is the chat's, whatever was up before.
  useEffect(() => { if (typing && focused) follow.value = true; }, [typing, focused, follow]);
  useAnimatedReaction(
    () => [keyboard.height.value, restRoom.value, front.value ? 1 : 0] as const,
    ([height, restAt, inFront]) => {
      if (!follow.value && inFront && height <= 0) follow.value = true;
      const want = Math.max(restAt, height);
      room.value = follow.value ? want : Math.min(room.value, want);
    },
  );
  const spacer = useAnimatedStyle(() => ({ height: room.value }));
  // Nothing to slide: the app's emoji keyboard is never drawn on a phone.
  const panel = useAnimatedStyle(() => ({}));
  return { spacer, panel };
}

/** The room under the bar (see above). The browser has its own version (keyboardLift.web.ts). */
export const useKeyboardLift: (options: KeyboardLiftOptions) => KeyboardLift = useNativeLift;

/**
 * A drag down the messages puts the keyboard away. On an iPhone the list
 * does it itself, the keyboard following the finger (keyboardDismissMode
 * "interactive"), and the bar rides on it (above). On Android a drag down
 * lets go of the box (`blur`): noticed from the finger itself (a short chat,
 * or one already at its top, does not scroll at all) and from the list
 * scrolling down; a drag up to read on, or sideways for the times, does not.
 */
export function useDragDownDismiss(blur: () => void): DragDismiss {
  const from = useRef<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(blur);
  latest.current = blur;
  return useMemo<DragDismiss>(() => {
    const done = () => { if (Platform.OS !== 'ios') latest.current(); };
    return {
      props: {
        keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' : 'none',
        onScrollBeginDrag: (e) => { from.current = e.nativeEvent.contentOffset.y; },
        onScrollEndDrag: () => { from.current = null; },
        onTouchStart: (e) => {
          const t = e.nativeEvent.touches[0];
          touch.current = t ? { x: t.pageX, y: t.pageY } : null;
        },
        onTouchMove: (e) => {
          const t = e.nativeEvent.touches[0];
          const start = touch.current;
          if (!t || !start) return;
          const dy = t.pageY - start.y;
          if (dy > 28 && dy > Math.abs(t.pageX - start.x) * 1.4) { touch.current = null; done(); }
        },
        onTouchEnd: () => { touch.current = null; },
      },
      // The list is upside down: dragging the messages down (back through the chat) scrolls it further from its start.
      onScrollY: (y) => {
        if (from.current !== null && y > from.current + 16) { from.current = null; done(); }
      },
    };
  }, []);
}
