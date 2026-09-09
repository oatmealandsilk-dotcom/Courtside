import React from 'react';
import { Redirect, Tabs, router, usePathname, useGlobalSearchParams } from 'expo-router';
import { SwipeSurface } from '@/components/SwipeSurface';
import { swipeDestination } from '@/features/navigation/swipeOrder';
import { NavBar, type NavBarProps } from '@/components/NavBar';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function TabsLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ section?: string }>();
  const swipe = (direction: 1 | -1) => {
    const next = swipeDestination(pathname, params.section, direction);
    if (next) router.navigate({ pathname: next.pathname, params: { section: next.section } });
  };
  const { ready, currentUserId } = useApp();
  const { isPhone } = useResponsive();
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <SwipeSurface onSwipe={swipe}>
    <Tabs
      // Phone keeps the familiar bottom bar; anything wider gets a left sidebar.
      tabBar={(props: NavBarProps) => <NavBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isPhone ? 'bottom' : 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
      <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
    </Tabs>
    </SwipeSurface>
  );
}
