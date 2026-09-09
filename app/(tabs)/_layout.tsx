import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { NavBar, type NavBarProps } from '@/components/NavBar';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { ready, currentUserId } = useApp();
  const { isPhone } = useResponsive();
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <Tabs
      // Phone keeps the familiar bottom bar; anything wider gets a left sidebar.
      tabBar={(props: NavBarProps) => <NavBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: isPhone ? 'bottom' : 'left',
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="discuss" options={{ title: 'Discuss' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="coaches" options={{ title: 'Coaches' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
