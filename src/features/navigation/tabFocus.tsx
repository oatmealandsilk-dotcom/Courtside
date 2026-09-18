import React, { createContext, useContext } from 'react';
import { Platform } from 'react-native';

/**
 * Whether the tab a component sits in is the one on screen.
 *
 * The four main tabs all stay mounted side by side so a swipe can slide
 * between them; this is how a tab that has slid off screen knows to pause its
 * video and stop counting views. Outside the pager it is undefined, which
 * reads as "focused".
 */
const TabFocusContext = createContext<boolean | undefined>(undefined);

export function TabFocus({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <TabFocusContext.Provider value={active}>{children}</TabFocusContext.Provider>;
}

export function useTabActive(): boolean {
  return useContext(TabFocusContext) ?? true;
}

/**
 * Wraps a tab's screen so the route itself draws nothing on the phone. The
 * router still owns the four addresses (so links and the bottom bar work),
 * but the pager is what renders the screens; without this the router would
 * quietly mount a second, hidden copy of whichever tab is current. A preview
 * (rendered with props) and the web build render as normal.
 */
export function asTabRoute<P extends object>(Screen: React.ComponentType<P>) {
  return function TabRoute(props: P) {
    const inPager = useContext(TabFocusContext) !== undefined;
    // The router hands every screen a `segment` prop of its own, so "no
    // props" never held and the hidden copy was fully alive: a second Home
    // feed, with its own player on the first clip, fighting the visible one.
    // Only props a caller passed (a preview, one person's feed) count.
    const own = Object.keys(props).filter((key) => key !== 'segment');
    if (Platform.OS !== 'web' && !inPager && own.length === 0) return null;
    return <Screen {...props} />;
  };
}
