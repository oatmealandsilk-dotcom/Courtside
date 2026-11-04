import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';

import { TAB_PATHS, TabsPager } from '@/components/TabsPager';
import { useTheme } from '@/theme/ThemeProvider';
import { useApp } from '@/store/AppContext';
import { warmConnectOffer } from '@/features/activity/autoLog';
import { useAfterLogConnectWatch } from '@/features/activity/afterLogConnect';

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
  // Profile's "Connect your watch" card, decided before Profile is first opened.
  useEffect(() => { if (currentUserId) warmConnectOffer(currentUserId); }, [currentUserId]);
  // Whether "Want this to log itself next time?" may follow a session logged by hand (afterLogConnect).
  useAfterLogConnectWatch();
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
  // The row hears only the four tabs' own addresses: a page opened over the tabs (a player, a chat, Settings) or
  // closed again leaves it as it was, where it used to be drawn again (all four slots and their gestures) in the
  // same go that puts the new page on screen, so every page waited for it before it could slide in (Nov 4, owner:
  // "EVERY FUCKING THING TAKES WAY TOO LONG TO RESPOND"). The row only ever acts on a tab's address.
  const lastTab = useRef<string>(pathname);
  if ((TAB_PATHS as readonly string[]).includes(pathname)) lastTab.current = pathname;
  const tabPath = lastTab.current;
  const row = useMemo(() => <TabsPager pathname={tabPath} />, [tabPath]);
  if (ready && !currentUserId) return <Redirect href="/sign-in" />;
  return (
    <View style={{ flex: 1 }}>
      {row}
      {hidden}
    </View>
  );
}
