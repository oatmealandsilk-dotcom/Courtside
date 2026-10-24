import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';

import { TabsPager } from '@/components/TabsPager';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/store/AppContext';
import { warmConnectOffer } from '@/features/activity/autoLog';

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
  // Profile's "Log your hits automatically" card, decided before Profile is first opened.
  useEffect(() => { if (currentUserId) warmConnectOffer(currentUserId); }, [currentUserId]);
  // Both built once (the row only when the address changes): this layout hears every change in the
  // app, for the two values above, and each one redrew the row and the hidden navigator with it
  // (Oct 10, owner: "the buttons like the settings. msg notifications, etc respond too slow").
  const hidden = useMemo(() => (
    <View style={{ width: 0, height: 0, overflow: 'hidden' }} pointerEvents="none">
      {/* In the strip's order, Community first. '/(tabs)' still means Home: an
          address picks its screen by name, never by this order. What the order
          does set is the "first tab" that Android's Back returns to. */}
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
        <Tabs.Screen name="discuss" options={{ title: 'Community' }} />
        <Tabs.Screen name="index" options={{ title: 'Feed' }} />
        <Tabs.Screen name="coaches" options={{ title: 'Coaching' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  ), []);
  const row = useMemo(() => <TabsPager pathname={pathname} />, [pathname]);
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <View style={{ flex: 1 }}>
      {row}
      {hidden}
    </View>
  );
}
