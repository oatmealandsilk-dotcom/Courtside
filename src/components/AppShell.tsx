import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { NavBar } from './NavBar';
import { RouteTransition } from './RouteTransition';
import { useResponsive } from '@/lib/useResponsive';
import { getPendingTab, setPendingTab, subscribePendingTab } from '@/features/navigation/pendingTab';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

const paths = { index: '/', discuss: '/discuss', coaches: '/coaches', profile: '/profile' } as const;
const routes = Object.keys(paths).map(name => ({ key: name, name }));
export function AppShell({ children }: { children: React.ReactNode }) {
  useTheme();
  const pathname = usePathname();
  // A swipe publishes where it is going before the router knows, so the bar
  // moves with the gesture. Once the route agrees, the hint is dropped.
  const pending = useSyncExternalStore(subscribePendingTab, getPendingTab, getPendingTab);
  useEffect(() => {
    if (pending && pending === pathname) setPendingTab(null);
  }, [pending, pathname]);
  const shown = pending ?? pathname;
  const { currentUserId } = useApp();
  const { isPhone } = useResponsive();
  const selected = useRef(0);
  if (shown === '/') selected.current = 0;
  else if (shown === '/discuss' || shown.startsWith('/question/') || shown.startsWith('/user/')) selected.current = 1;
  else if (shown === '/coaches' || shown.startsWith('/coach/')) selected.current = 2;
  else if (shown === '/profile' || ['/settings', '/edit-profile', '/profile-details'].includes(shown)) selected.current = 3;
  const showNav = !!currentUserId && !['/sign-in', '/onboarding'].includes(pathname);
  const nav = <NavBar state={{ index: selected.current, routes }} navigation={{ navigate: name => {
    const destination = paths[name as keyof typeof paths];
    if (destination) router.navigate(destination);
  } }} />;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, flexDirection: isPhone ? 'column' : 'row' }}>
    {showNav && !isPhone && nav}
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}><RouteTransition>{children}</RouteTransition></View>
    {showNav && isPhone && nav}
  </View>;
}
