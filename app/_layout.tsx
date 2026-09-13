import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '@/store/AppContext';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <ThemeProvider><SafeAreaProvider>
      <AppProvider>
        <ThemedStatusBar/>
        <AppShell><Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          {/* Splash, sign-in and the feed fade into one another; only pages
              opened from inside the app slide. */}
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="compose" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="ask" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen
            name="share"
            options={{
              presentation: 'transparentModal',
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="ask-coach" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack></AppShell>
      </AppProvider>
    </SafeAreaProvider></ThemeProvider>
  );
}

function ThemedStatusBar() { const { night } = useTheme(); return <StatusBar style={night ? "light" : "dark"}/>; }
