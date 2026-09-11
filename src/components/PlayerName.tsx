import React from 'react';
import { Text, type TextProps } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/store/AppContext';
export function PlayerName({ userId, children, ...props }: TextProps & { userId?: string }) {
  const { currentUserId } = useApp();
  // With no userId there is nothing to open, so the tap must fall through to
  // whatever row this sits in rather than being swallowed.
  if (!userId) return <Text {...props}>{children}</Text>;
  return <Text {...props} accessibilityRole="link" onPress={event => {
    event.stopPropagation();
    router.push(userId === currentUserId ? '/profile' : `/user/${userId}`);
  }}>{children}</Text>;
}
