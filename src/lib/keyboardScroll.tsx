import React, { createContext, useCallback, useContext, useRef } from 'react';
import { Dimensions, Keyboard, Platform, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

/** Something that can be measured on screen — a TextInput, a View. */
export interface Measurable {
  measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
  scrollIntoView?: (options?: unknown) => void;
}

/**
 * "Bring this box above the keyboard." A scrolling page provides it; a text
 * box calls it when it gains focus. Without this, iOS only pads the page for
 * the keyboard and leaves the box you tapped sitting under it.
 */
export const KeyboardScrollContext = createContext<((node: Measurable | null) => void) | null>(null);

export function useRevealOnFocus() {
  const reveal = useContext(KeyboardScrollContext);
  return (node: Measurable | null) => {
    if (!node) return;
    if (Platform.OS === 'web') {
      // The browser can do this itself once the keyboard (or nothing) is up.
      setTimeout(() => node.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 80);
      return;
    }
    if (reveal) reveal(node);
  };
}

/** The keyboard's height once it is up, or 0 if it is not — read at call time. */
let keyboardHeight = 0;
if (Platform.OS !== 'web') {
  Keyboard.addListener('keyboardDidShow', (e) => { keyboardHeight = e.endCoordinates.height; });
  Keyboard.addListener('keyboardDidHide', () => { keyboardHeight = 0; });
}
export const currentKeyboardHeight = () => keyboardHeight;

/** Runs `work` once the keyboard has finished rising, or straight away if it is already up. */
export function afterKeyboard(work: () => void) {
  if (Platform.OS === 'web' || keyboardHeight > 0) { setTimeout(work, 30); return; }
  const sub = Keyboard.addListener('keyboardDidShow', () => { sub.remove(); setTimeout(work, 30); });
  // A hardware keyboard shows nothing; do not wait forever.
  setTimeout(() => { sub.remove(); work(); }, 600);
}

/**
 * The same "bring the box you tapped above the keyboard" that every Screen
 * gives its pages, for a page that scrolls on its own instead: sign-in and
 * the reset-password page. Wrap the page in
 * <KeyboardScrollContext.Provider value={reveal}> and hand its ScrollView
 * `ref={scroller}` and `onScroll={onScroll}`; each text box inside then asks
 * for it as it gains focus. Once the keyboard is up, the box is measured and
 * the page scrolls just far enough to clear it.
 */
export function useKeyboardReveal() {
  const scroller = useRef<ScrollView | null>(null);
  const offset = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = e.nativeEvent.contentOffset.y; }, []);
  const reveal = useCallback((node: Measurable | null) => {
    if (!node?.measureInWindow || !scroller.current) return;
    afterKeyboard(() => {
      node.measureInWindow?.((_x, y, _w, h) => {
        const visibleBottom = Dimensions.get('window').height - keyboardHeight - 24;
        const overflow = y + h - visibleBottom;
        if (overflow <= 0) return;
        scroller.current?.scrollTo({ y: offset.current + overflow, animated: true });
      });
    });
  }, []);
  return { scroller, onScroll, reveal };
}
