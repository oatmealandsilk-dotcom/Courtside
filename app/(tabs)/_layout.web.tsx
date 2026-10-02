import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import Discuss from './discuss';
import Home from './index';
import Coaches from './coaches';
import Profile from './profile';
import { Redirect, Tabs, router, usePathname, useGlobalSearchParams } from 'expo-router';
import { SwipeSurface } from '@/components/SwipeSurface';
import { setPendingTab } from '@/features/navigation/pendingTab';
import { requestSection, shownSection, swipeDestination } from '@/features/navigation/swipeOrder';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
import { TabFocus } from '@/features/navigation/tabFocus';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/** The strip, left to right, the same as the phone's TabsPager: Community, Home, Coaching, Profile. */
const TAB_PATHS = ['/discuss', '/', '/coaches', '/profile'];

export default function TabsLayout() {
  useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ section?: string }>();
  const swipe = (direction: 1 | -1) => {
    const next = swipeDestination(pathname, pathname === "/discuss" || pathname === "/profile" ? shownSection(pathname) ?? params.section : params.section, direction);
    if (next) { requestSection(next.pathname, next.section); router.navigate(next.pathname); }
  };
  const { ready, currentUserId } = useApp();
  const { isPhone } = useResponsive();
  // Community opens at its top whenever you come to it from another tab (the
  // tabs stay mounted, so it used to sit wherever you last left it). Coming
  // back from a thread is not a tab change, so your place is kept. Same rule
  // as the phone's TabsPager.
  const lastTab = useRef(pathname);
  useEffect(() => {
    if (!TAB_PATHS.includes(pathname)) return;
    if (pathname === '/discuss' && TAB_PATHS.includes(lastTab.current) && lastTab.current !== '/discuss') requestScrollToTop('/discuss', true);
    lastTab.current = pathname;
  }, [pathname]);
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <SwipeSurface onSwipe={swipe} onCommit={direction => {
      const next = swipeDestination(pathname, pathname === "/discuss" || pathname === "/profile" ? shownSection(pathname) ?? params.section : params.section, direction);
      if (next) setPendingTab(next.pathname);
    }} onDragTo={direction => {
      if (direction === null) return setPendingTab(null);
      const next = swipeDestination(pathname, pathname === "/discuss" || pathname === "/profile" ? shownSection(pathname) ?? params.section : params.section, direction);
      setPendingTab(next ? next.pathname : null);
    }} delegateLeft={pathname === "/profile"} settledKey={`${pathname}:${shownSection(pathname) ?? params.section ?? ''}`} renderPreview={direction => {
      const next = swipeDestination(pathname, pathname === "/discuss" || pathname === "/profile" ? shownSection(pathname) ?? params.section : params.section, direction);
      if (!next) return null;
      // Home slid in under a finger is a picture of the feed, not the feed:
      // its clip shows its cover and starts only once you have arrived (a
      // second, live copy played with sound before you got there).
      if (next.pathname === '/') return <TabFocus active={false}><Home/></TabFocus>;
      if (next.pathname === '/discuss') return <Discuss previewSection={next.section}/>;
      if (next.pathname === '/coaches') return <Coaches/>;
      return <Profile previewSection={next.section}/>;
    }}>
    <Tabs
      // The root shell keeps navigation visible across both tabs and detail pages.
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        // The swipe is the transition. A fade on top of it plays second and
        // reads as a hitch once the page has already landed.
        animation: 'none',
        tabBarPosition: isPhone ? 'bottom' : 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* In the strip's order, Community first. '/(tabs)' still means Home: an
          address picks its screen by name, never by this order. */}
      <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
    </SwipeSurface>
  );
}
