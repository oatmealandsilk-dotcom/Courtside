import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import Home from './index';
import Discuss from './discuss';
import Coaches from './coaches';
import Profile from './profile';
import { Redirect, Tabs, router, usePathname, useGlobalSearchParams } from 'expo-router';
import { SwipeSurface } from '@/components/SwipeSurface';
import { setPendingTab } from '@/features/navigation/pendingTab';
import { swipeDestination } from '@/features/navigation/swipeOrder';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function TabsLayout() {
  useTheme();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ section?: string }>();
  const swipe = (direction: 1 | -1) => {
    const next = swipeDestination(pathname, pathname === "/discuss" ? (direction === 1 ? "players" : "discussions") : params.section, direction);
    if (next) router.navigate({ pathname: next.pathname, params: { section: next.section } });
  };
  const { ready, currentUserId } = useApp();
  const { isPhone } = useResponsive();
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <SwipeSurface onSwipe={swipe} onCommit={direction => {
      const next = swipeDestination(pathname, pathname === "/discuss" ? (direction === 1 ? "players" : "discussions") : params.section, direction);
      if (next) setPendingTab(next.pathname);
    }} enabled={pathname !== "/profile"} renderPreview={direction => {
      const next = swipeDestination(pathname, pathname === "/discuss" ? (direction === 1 ? "players" : "discussions") : params.section, direction);
      if (!next) return null;
      if (next.pathname === '/') return <Home/>;
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
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
      <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
    </SwipeSurface>
  );
}
