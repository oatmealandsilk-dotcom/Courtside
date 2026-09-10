import { useTheme } from '@/theme/ThemeProvider';
import React, { useRef } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { NavBar } from './NavBar';
import { RouteTransition } from './RouteTransition';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

const paths = { index: '/', discuss: '/discuss', coaches: '/coaches', profile: '/profile' } as const;
const routes = Object.keys(paths).map(name => ({ key: name, name }));
export function AppShell({ children }: { children: React.ReactNode }) {
  useTheme();
  const pathname = usePathname();
  const { currentUserId } = useApp();
  const { isPhone } = useResponsive();
  const selected = useRef(0);
  if (pathname === '/') selected.current = 0;
  else if (pathname === '/discuss' || pathname.startsWith('/question/') || pathname.startsWith('/user/')) selected.current = 1;
  else if (pathname === '/coaches' || pathname.startsWith('/coach/')) selected.current = 2;
  else if (pathname === '/profile' || ['/settings', '/edit-profile', '/profile-details'].includes(pathname)) selected.current = 3;
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
