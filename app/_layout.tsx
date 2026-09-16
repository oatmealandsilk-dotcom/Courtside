import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/store/AppContext';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { colors } from '@/theme';

export default function RootLayout() {
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
          <Stack.Screen name="compose" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="ask" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="comments" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="post-menu" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
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
          <Stack.Screen name="story/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="hit" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        </Stack></AppShell>
      </AppProvider>
    </SafeAreaProvider></ThemeProvider></GestureHandlerRootView>
  );
}

function ThemedStatusBar() { const { night } = useTheme(); return <StatusBar style={night ? "light" : "dark"}/>; }
