import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

export type { DragDismiss, KeyboardLift, KeyboardLiftOptions } from './keyboardLiftTypes';

/*
 * The room under a chat's typing bar. With the keyboard down, the bar rests a
 * little above the home indicator; with it up, the bar sits right on the
 * keyboard. On an iPhone the room follows the keyboard frame by frame (read
 * on the animation thread, so nothing in React draws while it moves): the
 * bar rides up with the keyboard and, when the messages are dragged down
 * (iMessage's way of putting the keyboard away), back down under the
 * finger. The chat's list is upside down (its newest message is its start),
 * so as the room grows the newest message rides up with the bar by itself,
 * with no scrolling to do. The browser's version is keyboardLift.web.ts.
 */

/** On an iPhone: the keyboard's own position, every frame. */
function useIosLift({ rest, focused, typing, emojiRoom }: KeyboardLiftOptions): KeyboardLift {
  const keyboard = useAnimatedKeyboard();
  const restRoom = useSharedValue(rest);
  const front = useSharedValue(focused);
  const emoji = useSharedValue(emojiRoom);
  // Off the page in front, the room only ever shrinks (a sheet's own keyboard
  // must not lift the bar under the sheet); it follows the keyboard again
  // once the chat is in front with the keyboard down.
  const follow = useSharedValue(focused);
  // While switching from the emoji keyboard back to typing: the least room, until the keyboard reaches it.
  const floor = useSharedValue(0);
  const room = useSharedValue(rest);
  useEffect(() => { restRoom.value = rest; }, [rest, restRoom]);
  useEffect(() => { emoji.value = emojiRoom; }, [emojiRoom, emoji]);
  useEffect(() => {
    front.value = focused;
    if (!focused) follow.value = false;
  }, [focused, front, follow]);
  // Typing in the chat's own box: the keyboard is the chat's, whatever was up before.
  useEffect(() => { if (typing && focused) follow.value = true; }, [typing, focused, follow]);
  useAnimatedReaction(
    () => [keyboard.height.value, restRoom.value, front.value ? 1 : 0, emoji.value, floor.value] as const,
    ([height, restAt, inFront, emojiAt, held]) => {
      if (!follow.value && inFront && height <= 0) follow.value = true;
      if (held > 0 && height >= held - 1) floor.value = 0;
      // The emoji keyboard lies over the bottom of the page at the keyboard's height, so
      // swapping one keyboard for the other leaves the bar exactly where it was.
      const want = Math.max(restAt, height, held, emojiAt);
      room.value = follow.value ? want : Math.min(room.value, want);
    },
  );
  const spacer = useAnimatedStyle(() => ({ height: room.value }));
  const holdUntilKeyboard = useCallback((height: number) => {
    floor.value = height;
    // A keyboard that never comes up (a hardware keyboard) lets go after a moment.
    setTimeout(() => { floor.value = 0; }, 700);
  }, [floor]);
  return { spacer, holdUntilKeyboard };
}

/**
 * On Android the window itself shrinks above the keyboard, so the room is
 * the rest room, taken away while the keyboard is up (left there, it was a
 * band between the bar and the keyboard).
 */
function useAndroidLift({ rest, emojiRoom }: KeyboardLiftOptions): KeyboardLift {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setUp(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setUp(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const holdUntilKeyboard = useCallback((_height: number) => undefined, []);
  return { spacer: { height: emojiRoom || (up ? 0 : rest) }, holdUntilKeyboard };
}

/** The room under the bar (see above). Which version is fixed per platform, so the hooks inside never change between draws. */
export const useKeyboardLift: (options: KeyboardLiftOptions) => KeyboardLift = Platform.OS === 'ios' ? useIosLift : useAndroidLift;

/**
 * A drag down the messages puts the keyboard away. On an iPhone the list
 * does it itself, the keyboard following the finger (keyboardDismissMode
 * "interactive"), and the bar rides on it (above); the app's own emoji
 * keyboard, which is not the phone's, is closed by the same drag here. On
 * Android a drag down lets go of the box: noticed from the finger itself
 * (a short chat, or one already at its top, does not scroll at all) and
 * from the list scrolling down; a drag up to read on, or sideways for the
 * times, does not.
 *
 * `blur` lets go of the box (and closes the emoji keyboard); `closePanel`
 * closes only the emoji keyboard (the iPhone's keyboard is left to follow
 * the finger).
 */
export function useDragDownDismiss(blur: () => void, closePanel: () => void = blur): DragDismiss {
  const from = useRef<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ blur, closePanel });
  latest.current = { blur, closePanel };
  return useMemo<DragDismiss>(() => {
    const done = () => (Platform.OS === 'ios' ? latest.current.closePanel() : latest.current.blur());
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
