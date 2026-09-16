import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Redirect, router, usePathname } from 'expo-router';
import { NavBar } from './NavBar';
import { UploadBar } from '@/components/UploadBar';
import { WarmCurtain } from '@/components/WarmCurtain';
import { Toast } from './Toast';
import { RouteTransition } from './RouteTransition';
import { useResponsive } from '@/lib/useResponsive';
import { getPendingTab, setPendingTab, subscribePendingTab } from '@/features/navigation/pendingTab';
import { requestScrollToTop } from '@/features/navigation/scrollToTop';
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
    if (!pending) return;
    if (pending === pathname) { setPendingTab(null); return; }
    // A hint the route never confirms (the swipe was cancelled) must not
    // leave the bar pointing at the wrong tab.
    const timer = setTimeout(() => setPendingTab(null), 900);
    return () => clearTimeout(timer);
  }, [pending, pathname]);
  const shown = pending ?? pathname;
  const { currentUserId, ready, authResolved } = useApp();
  const { isPhone } = useResponsive();
  const selected = useRef(0);
  if (shown === '/') selected.current = 0;
  else if (shown === '/discuss' || shown.startsWith('/question/') || shown.startsWith('/user/')) selected.current = 1;
  else if (shown === '/coaches' || shown.startsWith('/coach/')) selected.current = 2;
  else if (shown === '/profile' || ['/settings', '/edit-profile', '/profile-details'].includes(shown)) selected.current = 3;
  const showNav = !!currentUserId && !['/sign-in', '/onboarding'].includes(pathname);
  // A shared link opened while signed out goes to sign-in, not to an empty page.
  const mustSignIn = ready && authResolved && !currentUserId && !['/', '/index', '/sign-in', '/onboarding'].includes(pathname);
  const nav = <NavBar state={{ index: selected.current, routes }} navigation={{ navigate: name => {
    const destination = paths[name as keyof typeof paths];
    if (!destination) return;
    // Already here: a second tap on the same icon takes the page back to the top.
    if (destination === pathname) requestScrollToTop(destination);
    // From a page pushed on top (settings, edit profile…), go back down to the
    // tab the way the back button would — a pop with its slide, not a jump.
    else if (!Object.values(paths).includes(pathname as (typeof paths)[keyof typeof paths])) {
      const r = router as unknown as { dismissTo?: (href: string) => void; canGoBack?: () => boolean };
      // Home's address is also the splash screen's, so it cannot be dismissed
      // to directly: step back to the tabs first, then glide across to Home.
      if (destination === '/') {
        if (r.canGoBack?.()) { router.back(); setTimeout(() => router.navigate('/'), 30); }
        else router.navigate('/');
      } else if (r.dismissTo) r.dismissTo(destination);
      else router.navigate(destination);
    }
    else router.navigate(destination);
  } }} />;
  if (mustSignIn) return <Redirect href="/sign-in" />;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, flexDirection: isPhone ? 'column' : 'row' }}>
    {showNav && !isPhone && nav}
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}><RouteTransition>{children}</RouteTransition><Toast /><UploadBar /></View>
    {showNav && isPhone && nav}
    {showNav && (pathname === '/' || pathname === '/index') ? <WarmCurtain /> : null}
  </View>;
}
