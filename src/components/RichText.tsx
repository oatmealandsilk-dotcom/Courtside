import React, { useState } from 'react';
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
        return <Mention key={`${i}-${part}`} label={part} name={user.name} mentionStyle={mentionStyle} onPress={() => router.push(user.id === currentUserId ? '/profile' : `/user/${user.id}`)} />;
      })}
    </Text>
  );
}

/** One @handle in the text: it dims for a beat when tapped, a small sign the tap took. */
function Mention({ label, name, mentionStyle, onPress }: { label: string; name: string; mentionStyle?: StyleProp<TextStyle>; onPress: () => void }) {
  const [down, setDown] = useState(false);
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}'s profile`}
      style={[{ color: colors.brand, fontWeight: '600' }, mentionStyle, down && { opacity: 0.5 }]}
      suppressHighlighting
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={(event) => { event.stopPropagation(); onPress(); }}
    >
      {label}
    </Text>
  );
}
