import { useTheme } from '@/theme/ThemeProvider';
import React from 'react';
import { Linking, Pressable, Text } from 'react-native';
import { colors } from '@/theme';

export function ReelVideo({ uri }: { uri: string; poster?: string }) {
  useTheme();
  return <Pressable accessibilityRole="link" onPress={() => Linking.openURL(uri)} style={{ padding: 32, backgroundColor: colors.brandDim }}><Text style={{ color: colors.brand }}>Open reel video</Text></Pressable>;
}
