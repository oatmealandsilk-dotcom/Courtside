import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '@/store/AppContext';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
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
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
