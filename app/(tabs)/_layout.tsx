import React from 'react';
import { View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';

import { TabsPager } from '@/components/TabsPager';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/store/AppContext';

/**
 * On the phone the four tabs are one sliding row (see TabsPager). The Tabs
 * navigator still exists underneath so the four addresses stay real routes —
 * for links, the bottom bar and history — but it is boxed to nothing and its
 * screens draw nothing (see asTabRoute); the pager is what you see.
 */
export default function TabsLayout() {
  useTheme();
  const pathname = usePathname();
  const { ready, currentUserId } = useApp();
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <View style={{ flex: 1 }}>
      <TabsPager pathname={pathname} />
      <View style={{ width: 0, height: 0, overflow: 'hidden' }} pointerEvents="none">
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
          <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </View>
    </View>
  );
}
