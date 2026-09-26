import React, { useEffect } from 'react';
import { usePauseWhenHidden } from '@/features/feed/pauseWhenHidden';
import { Pressable, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';

import { AppProvider } from '@/store/AppContext';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';
import { BrandMark } from '@/components/BrandMark';
import { installCrashReporting, reportError } from '@/lib/crashReporting';

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
  // Inter ships in the bundle, so on a phone this resolves before the splash
  // has gone; in a browser it is one small fetch, kept after that.
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
            animation: 'slide_from_right',
          }}
        >
          {/* Splash and sign-in fade; the feed opens behind a curtain that is
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
          <Stack.Screen name="edit-post" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen
            name="share"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="ask-coach" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="pick-location" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="hit" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        </Stack></AppShell>
      </AppProvider>
    </SafeAreaProvider></ThemeProvider></GestureHandlerRootView>
  );
}

function ThemedStatusBar() { const { night } = useTheme(); return <StatusBar style={night ? "light" : "dark"}/>; }
