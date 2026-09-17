import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { router } from 'expo-router';

import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

const MENTION = /(@[a-z0-9_.]{2,30})/gi;

/**
 * Body text that lights up @handles the way Instagram does. A handle that
 * belongs to a real member takes the theme's brand colour and opens their
 * profile on tap; anything else stays plain, so a typo does not glow.
 */
export function RichText({ children, mentionStyle, ...props }: TextProps & { children: string; mentionStyle?: StyleProp<TextStyle> }) {
  const { users, currentUserId } = useApp();
  const parts = children.split(MENTION);
  if (parts.length === 1) return <Text {...props}>{children}</Text>;
  return (
    <Text {...props}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const user = users.find((u) => u.handle.toLowerCase() === part.slice(1).toLowerCase());
        if (!user) return part;
        return (
          <Text
            key={`${i}-${part}`}
            accessibilityRole="link"
            accessibilityLabel={`Open ${user.name}'s profile`}
            style={[{ color: colors.brand, fontWeight: '600' }, mentionStyle]}
            suppressHighlighting
            onPress={(event) => {
              event.stopPropagation();
              router.push(user.id === currentUserId ? '/profile' : `/user/${user.id}`);
            }}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}
