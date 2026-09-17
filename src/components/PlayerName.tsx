import React, { useState } from 'react';
import { Text, type TextProps } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/store/AppContext';
export function PlayerName({ userId, children, ...props }: TextProps & { userId?: string }) {
  const { currentUserId } = useApp();
  // With no userId there is nothing to open, so the tap must fall through to
  // whatever row this sits in rather than being swallowed.
  // A tap dims the name for a beat, a small sign it took, in place of the phone's grey box.
  const [down, setDown] = useState(false);
  if (!userId) return <Text {...props}>{children}</Text>;
  return <Text {...props} style={[props.style, down && { opacity: 0.5 }]} suppressHighlighting accessibilityRole="link" onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} onPress={event => {
    event.stopPropagation();
    router.push(userId === currentUserId ? '/profile' : `/user/${userId}`);
  }}>{children}</Text>;
}
