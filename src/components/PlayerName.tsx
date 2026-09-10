import React from 'react';
import { Text, type TextProps } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/store/AppContext';
export function PlayerName({ userId, children, ...props }: TextProps & { userId?: string }) {
  const { currentUserId } = useApp();
  return <Text {...props} accessibilityRole={userId ? 'link' : undefined} onPress={event => {
    event.stopPropagation();
    if (userId) router.push(userId === currentUserId ? '/profile' : `/user/${userId}`);
  }}>{children}</Text>;
}
