import { useCallback, useEffect, useState } from 'react';
import { Platform, StatusBar } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useModalOpenWhile } from '@/lib/modalOpen';

/**
 * Light status-bar icons (the clock, the battery) while a black page or a
 * full-screen photo or video is up (Oct 5). In the six light themes the icons
 * are dark, and on black they all but vanished, on both platforms.
 *
 * The theme's own choice is kept up to date by ThemedStatusBar (app/_layout),
 * and comes back once the last black view has gone.
 */
let themed: 'light' | 'dark' = 'dark';
let holds = 0;

const apply = (style: 'light' | 'dark') => {
  if (Platform.OS === 'web') return;
  try { StatusBar.setBarStyle(style === 'light' ? 'light-content' : 'dark-content', true); } catch { /* no status bar to set */ }
};

/** Told by ThemedStatusBar whenever the theme's own style changes. */
export function noteThemedStatusStyle(style: 'light' | 'dark') {
  themed = style;
}

/** Light icons until the returned function is called (safe to call twice). */
export function holdLightStatusBar(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  holds += 1;
  apply('light');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds = Math.max(0, holds - 1);
    if (holds === 0) apply(themed);
  };
}

/** For a black page of its own (the camera, a story): light icons while it is the page in front. */
export function useLightStatusWhileFocused() {
  useFocusEffect(useCallback(() => holdLightStatusBar(), []));
}

/**
 * For a full-screen viewer drawn in a React Native Modal: light icons while
 * `open`, and the value to give the Modal's `visible`.
 *
 * On Android a Modal is a window of its own that copies the app's status-bar
 * look once, as it opens, so the icons have to turn light first: there it
 * opens one frame later. An iPhone opens it at once, as before.
 */
export function useLightStatusWhile(open: boolean): boolean {
  // It is a Modal: on Android the message banner stands aside while it is up (see modalOpen).
  useModalOpenWhile(open);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) { setReady(false); return undefined; }
    const release = holdLightStatusBar();
    if (Platform.OS !== 'android') return release;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); release(); };
  }, [open]);
  return Platform.OS === 'android' ? open && ready : open;
}
