import { createContext, use, useCallback, useSyncExternalStore } from 'react';
// The router's own focus context and navigation hook, read below exactly the way its useIsFocused reads them.
import { IsFocusedContext } from 'expo-router/build/react-navigation/core/useIsFocused';
import { useNavigation } from 'expo-router/build/react-navigation/core/useNavigation';

/**
 * Inside the tab row: whether this tab is the one on show (its slot on screen,
 * and no page opened over the tabs), worked out once per tab by TabFocus.
 * Undefined anywhere else.
 */
export const TabOnShowContext = createContext<boolean | undefined>(undefined);

const always = () => true;
const quiet = () => () => undefined;

/**
 * Whether this screen is the one on top.
 *
 * Replaces @react-navigation/native's hook of the same name. That package was
 * never a dependency of this project — it came along under expo-router, and
 * expo-router dropped it in SDK 57 when it moved to a different navigation
 * core. expo-router now carries its own copy, built on that core.
 *
 * It asks the router at the very first render rather than assuming "on top"
 * until told otherwise: a screen that opens already covered (the feed under
 * a page opened from a notification at launch) knows it from the start, so a
 * clip on it never starts behind the page you are looking at.
 *
 * Inside the tab row the answer is the tab's own (TabFocus): "the route is on
 * top, and this is the tab on screen", the same answer as before, but read
 * from one place. Asking the router here as well made every part of all four
 * tabs that asks redraw each time any page opened or closed over the tabs,
 * before that page could slide in (Oct 10, owner: "the buttons like the
 * settings. msg notifications, etc respond too slow"). Now only the tab on
 * show redraws, and only when its answer changes. Anywhere else it is the
 * router's own answer, read the way the router's useIsFocused reads it.
 */
export function useIsFocused(): boolean {
  const onShow = use(TabOnShowContext);
  const inRow = onShow !== undefined;
  // `use` may be skipped (unlike the other hooks): in the row the router's focus is never read, so it never redraws this.
  // Whether a part is in the row never changes while it is mounted.
  const routerSays = inRow ? undefined : use(IsFocusedContext);
  const navigation = useNavigation();
  // The router's fallback, for a screen it gives no focus context: its focus and blur events.
  const listen = !inRow && routerSays === undefined;
  const subscribe = useCallback((onChange: () => void) => {
    if (!listen) return quiet();
    const offFocus = navigation.addListener('focus', onChange);
    const offBlur = navigation.addListener('blur', onChange);
    return () => { offFocus(); offBlur(); };
  }, [listen, navigation]);
  const read = inRow ? always : navigation.isFocused;
  const fallback = useSyncExternalStore(subscribe, read, read);
  return inRow ? onShow : routerSays ?? fallback;
}
