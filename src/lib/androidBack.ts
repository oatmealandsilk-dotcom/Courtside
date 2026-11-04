import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Android's Back button (or its back swipe from the screen's edge) while this
 * page is the one in front (Oct 5).
 *
 * Android sends Back to the app, and without this the page simply closes (or,
 * on the first page, the app does). A page with steps or panels of its own
 * hands it here instead: `handle` is asked first and does what the page's
 * own back button would (a step back, a panel closed, the "Discard?"
 * question), returning true when it dealt with it. Returning false lets Back
 * carry on as usual: the page closes.
 *
 * Only while the page is in front: a page opened over it gets Back first.
 * `handle` is always the latest one, so it may read the page's current state.
 * An iPhone and a browser have no Back button, so this does nothing there.
 */
function useAndroidBackHere(handle: () => boolean, enabled = true) {
  const latest = useRef(handle);
  latest.current = handle;
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android' || !enabled) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => latest.current());
    return () => sub.remove();
  }, [enabled]));
}

/**
 * Nothing at all on an iPhone or in a browser (no Back button there), not even the router's focus hook: that hook
 * waits a draw for the navigation to load, so every page and sheet using this drew itself a second time as it
 * opened, before it could slide in (Nov 4, owner: "EVERY FUCKING THING TAKES WAY TOO LONG TO RESPOND"). The phone's
 * kind never changes while the app runs, so which one is used never changes either.
 */
export const useAndroidBack: (handle: () => boolean, enabled?: boolean) => void =
  Platform.OS === 'android' ? useAndroidBackHere : () => undefined;
