// First, before any text is drawn: text follows the phone's size setting, with a ceiling.
import '@/lib/textScale';
import '@/lib/launchSplash';
import React, { useEffect } from 'react';
import { usePauseWhenHidden } from '@/features/feed/pauseWhenHidden';
import { Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useInstantExit } from '@/features/navigation/instantExit';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { AppProvider } from '@/store/AppContext';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { Platform } from 'react-native';
import { noteThemedStatusStyle } from '@/lib/statusBarStyle';
import { colors, font, lightColors } from '@/theme';
import { BrandMark } from '@/components/BrandMark';
import { installCrashReporting, reportError } from '@/lib/crashReporting';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { SignOutCurtainHost } from '@/components/SignOutCurtain';
import { ConfirmHost } from '@/components/ConfirmHost';
import { useInstantUpdates } from '@/lib/instantUpdates';

// Any error the app does not catch itself is filed as a crash report.
installCrashReporting();

/**
 * If a screen breaks, this shows in its place instead of a blank or a red
 * error page: the fault is filed as a crash report, and Try again rebuilds
 * the screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { void reportError(error, { fatal: true, where: 'screen' }); }, [error]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, backgroundColor: colors.bg }}>
      <BrandMark size={52} />
      <Text style={{ fontSize: 20, ...font('700'), color: colors.text, textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, color: colors.textMuted, textAlign: 'center', maxWidth: 320 }}>It has been reported, so we can fix it. Nothing you saved is lost.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={{ marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.brand }}>
        <Text style={{ color: colors.brandInk, ...font('700') }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  // A browser tab in the background carries on playing; this stops it.
  usePauseWhenHidden();
  // Fixes reach the iPhone app without a new build.
  useInstantUpdates();
  // Inter ships in the bundle, so on a phone this resolves before the splash
  // has gone; in a browser it is one small fetch, kept after that.
  const desktop = isDesktopBrowser();
  const instantExit = useInstantExit();
  const [fontsReady] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, ...Ionicons.font });
  // While the fonts load, the launch picture's cream (not the theme's colour), so nothing changes colour under the logo.
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: lightColors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Every phone gets the same motion, Reduce Motion or not (Oct 5, owner; see src/lib/useReducedMotion.ts). */}
      <ReducedMotionConfig mode={ReduceMotion.Never} />
      <ThemeProvider><SafeAreaProvider>
      <AppProvider>
        <ThemedStatusBar/>
        <AppShell><Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            // A tab tapped from a page that belongs to another tab: the page just goes (see instantExit).
            animation: instantExit ? 'none' : 'slide_from_right',
          }}
        >
          {/* Splash and sign-in fade; the app opens behind a curtain that is
              the splash again, so it cuts straight in — a fade between two
              identical screens only ever reads as a flicker. Pages opened
              from inside the app slide. */}
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          {/* Edit Profile always slides away to the right, however you leave it (Oct 5, owner: it sometimes just vanished
              when a tab was tapped, and slid when Back or Save was used). */}
          <Stack.Screen name="edit-profile" options={{ animation: 'slide_from_right' }} />
          {/* The Create box brings its own entrance (see compose.tsx); the page itself just fades. */}
          <Stack.Screen name="compose" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="ask" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="comments" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* A session's stats: the comments' stage from a clip's pill, the plain sheet from a post (session-stats.tsx). */}
          <Stack.Screen name="session-stats" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Who you played", from the composer of a session's post: a sheet over it. */}
          <Stack.Screen name="who-played" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Share health data" → Choose, from the composer of a session's post: a sheet over it. */}
          <Stack.Screen name="health-share" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="post-menu" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="invite" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="log-session" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="session-tag" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="court-report" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="court-now" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="map-visibility" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* Holding your own ring in Community's Open to hit row: until when, and how far (DragSheet). */}
          <Stack.Screen name="open-to-hit" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="hit-request/new" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="edit-post" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen
            name="share"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          {/* "Add to a group" from a profile or the map: a sheet that brings its own rise (DragSheet). */}
          <Stack.Screen name="pick-group" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* The Feed's "+": find a group to join, or start one; a sheet over the feed (DragSheet). */}
          <Stack.Screen name="find-groups" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Start a group" (three steps) and a group's "Edit": a tall sheet over the feed, the Groups list or the group's page (DragSheet). */}
          <Stack.Screen name="group-form" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Invite" on a group's page or its empty feed: the link and people you follow, a sheet (DragSheet). */}
          <Stack.Screen name="group-invite" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Send a court" from a chat: a sheet over the chat, so the chat (and its message bar) never moves under it. */}
          <Stack.Screen name="pick-court" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* "Add session stats" from a new Post or Clip: a sheet over the post, with its own rise (DragSheet). */}
          <Stack.Screen name="pick-session" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* The question page grows out of the Coaching tab's box itself (see ask-coach), so no stock animation. */}
          <Stack.Screen name="ask-coach" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          {/* On a computer, New message is a box over the inbox (Instagram's way); on a phone it is a page. */}
          {desktop ? <Stack.Screen name="messages/new" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} /> : null}
          <Stack.Screen name="pick-location" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="hit" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        </Stack></AppShell>
        <SignOutCurtainHost />
        {/* "Delete post?" and the like: the app's own card, last so it sits above every sheet, menu and the tab bar. */}
        <ConfirmHost />
      </AppProvider>
    </SafeAreaProvider></ThemeProvider></GestureHandlerRootView>
  );
}

/**
 * The status bar's icons follow the page: light on the dark pages (Night and,
 * from Oct 5, New York's navy, where dark icons were lost), dark elsewhere.
 * On Android the window behind the app takes the theme's ground too, so
 * nothing cream shows round the edges in a dark theme.
 */
function ThemedStatusBar() {
  const { dark, theme } = useTheme();
  const style = dark ? 'light' : 'dark';
  noteThemedStatusStyle(style);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Loaded here, on Android only, never at the top of the file: iPhone
    // builds 7 to 11 share this update channel but were made before
    // expo-system-ui was installed, and loading it there would stop them at
    // launch. Every Android build has it.
    try {
      const SystemUI = require('expo-system-ui') as typeof import('expo-system-ui');
      void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
    } catch {
      // Not in this build: the window keeps its launch colour.
    }
  }, [theme]);
  return <StatusBar style={style} />;
}
