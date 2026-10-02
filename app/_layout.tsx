// First, before any text is drawn: text follows the phone's size setting, with a ceiling.
import '@/lib/textScale';
import React, { useEffect } from 'react';
import { usePauseWhenHidden } from '@/features/feed/pauseWhenHidden';
import { Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useInstantExit } from '@/features/navigation/instantExit';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { AppProvider } from '@/store/AppContext';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';
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
  if (!fontsReady) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}><ThemeProvider><SafeAreaProvider>
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
          {/* The Create box brings its own entrance (see compose.tsx); the page itself just fades. */}
          <Stack.Screen name="compose" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="ask" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="comments" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="post-menu" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="invite" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="log-session" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="court-report" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
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

function ThemedStatusBar() { const { night } = useTheme(); return <StatusBar style={night ? "light" : "dark"}/>; }
