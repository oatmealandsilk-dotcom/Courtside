import { useTheme } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { router } from 'expo-router';

import { useApp } from '@/store/AppContext';
import { colors, font } from '@/theme';

const MENTION = /(@[a-z0-9_.]{2,30})/gi;
/** Mentions and, when asked for, #hashtags: what a reel's caption lights up. */
const MENTION_OR_TAG = /(@[a-z0-9_.]{2,30}|#[a-z0-9_]{1,40})/gi;

/**
 * Body text that lights up @handles the way Instagram does. A handle that
 * belongs to a real member takes the theme's brand colour and opens their
 * profile on tap; anything else stays plain, so a typo does not glow.
 */
export function RichText({ children, mentionStyle, hashtagStyle, after, ...props }: TextProps & {
  children: string;
  mentionStyle?: StyleProp<TextStyle>;
  /** Set to light up #hashtags too (bold, opening the search for that tag). */
  hashtagStyle?: StyleProp<TextStyle>;
  /** Something set right after the words, on the same line: a caption's "more". */
  after?: React.ReactNode;
}) {
  const { users, currentUserId } = useApp();
  const parts = children.split(hashtagStyle ? MENTION_OR_TAG : MENTION);
  if (parts.length === 1) return <Text {...props}>{children}{after}</Text>;
  return (
    <Text {...props}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (part.startsWith('#')) {
          return <Text key={`${i}-${part}`} accessibilityRole="link" style={hashtagStyle} suppressHighlighting onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/search', params: { q: part } }); }}>{part}</Text>;
        }
        const user = users.find((u) => u.handle.toLowerCase() === part.slice(1).toLowerCase());
        if (!user) return part;
        return <Mention key={`${i}-${part}`} label={part} name={user.name} mentionStyle={mentionStyle} onPress={() => router.push(user.id === currentUserId ? '/profile' : `/user/${user.id}`)} />;
      })}
      {after}
    </Text>
  );
}

/** One @handle in the text: it dims for a beat when tapped, a small sign the tap took. */
function Mention({ label, name, mentionStyle, onPress }: { label: string; name: string; mentionStyle?: StyleProp<TextStyle>; onPress: () => void }) {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const [down, setDown] = useState(false);
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}'s profile`}
      style={[{ color: colors.brand, ...font('600') }, mentionStyle, down && { opacity: 0.5 }]}
      suppressHighlighting
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={(event) => { event.stopPropagation(); onPress(); }}
    >
      {label}
    </Text>
  );
}
