import { useTheme } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { router } from 'expo-router';

import { useApp } from '@/store/AppContext';
import { domainOf, openLink, splitLinks } from '@/lib/links';
import { colors, font } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';

const MENTION = /(@[a-z0-9_.]{2,30})/gi;
/** Mentions and, when asked for, #hashtags: what a reel's caption lights up. */
const MENTION_OR_TAG = /(@[a-z0-9_.]{2,30}|#[a-z0-9_]{1,40})/gi;

/** How links in the words look and answer: given, addresses light up and open on a tap. */
export interface LinkLook {
  style?: StyleProp<TextStyle>;
  /** A hold on a link: what a hold anywhere else on the message does (its menu). */
  onLongPress?: () => void;
}

/**
 * Body text that lights up @handles the way Instagram does. A handle that
 * belongs to a real member takes the theme's brand colour and opens their
 * profile on tap; anything else stays plain, so a typo does not glow.
 * With `links`, web addresses light up too and open in the in-app browser
 * (a chat's messages ask for this; captions and comments do not yet).
 */
export function RichText({ children, mentionStyle, hashtagStyle, links, after, ...props }: TextProps & {
  children: string;
  mentionStyle?: StyleProp<TextStyle>;
  /** Set to light up #hashtags too (bold, opening the search for that tag). */
  hashtagStyle?: StyleProp<TextStyle>;
  /** Set to make web addresses tappable. */
  links?: LinkLook;
  /** Something set right after the words, on the same line: a caption's "more". */
  after?: React.ReactNode;
}) {
  const { users, currentUserId } = useApp();
  // Found once per message, not on every draw (a chat redraws its bubbles on each key typed in the box).
  const runs = useMemo(() => (links ? splitLinks(children) : null), [links ? 1 : 0, children]); // eslint-disable-line react-hooks/exhaustive-deps
  const pattern = hashtagStyle ? MENTION_OR_TAG : MENTION;
  const lit = (words: string, key: string): React.ReactNode[] => {
    const parts = words.split(pattern);
    return parts.map((part, i) => {
      if (i % 2 === 0) return part;
      if (part.startsWith('#')) {
        return <Text key={`${key}-${i}-${part}`} accessibilityRole="link" style={hashtagStyle} suppressHighlighting onPress={(event) => { event.stopPropagation(); router.push({ pathname: '/search', params: { q: part } }); }}>{part}</Text>;
      }
      const user = users.find((u) => u.handle.toLowerCase() === part.slice(1).toLowerCase());
      if (!user) return part;
      return <Mention key={`${key}-${i}-${part}`} label={part} name={user.name} mentionStyle={mentionStyle} onPress={() => openPlayer(user.id, currentUserId)} />;
    });
  };
  if (links && runs) {
    if (runs.some((r) => r.url)) {
      return (
        <Text {...props}>
          {runs.map((run, i) => (run.url
            ? <LinkSpan key={`l${i}`} label={run.text} url={run.url} look={links} />
            : <React.Fragment key={`t${i}`}>{lit(run.text, `t${i}`)}</React.Fragment>))}
          {after}
        </Text>
      );
    }
  }
  const parts = children.split(pattern);
  if (parts.length === 1) return <Text {...props}>{children}{after}</Text>;
  return (
    <Text {...props}>
      {lit(children, 'm')}
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

/**
 * One web address in the text: the link colour, no underline until it is
 * pressed (then it underlines and dims, the sign the tap took). A tap opens
 * it in the in-app browser; a hold does what a hold on the message does.
 */
function LinkSpan({ label, url, look }: { label: string; url: string; look: LinkLook }) {
  useTheme();
  const [down, setDown] = useState(false);
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`Link: ${domainOf(url)}`}
      accessibilityHint="Opens in the browser"
      style={[{ color: colors.link, ...font('500') }, look.style, down && { textDecorationLine: 'underline', opacity: 0.7 }]}
      suppressHighlighting
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={(event) => { event.stopPropagation(); openLink(url); }}
      onLongPress={look.onLongPress ? (event) => { event.stopPropagation(); setDown(false); look.onLongPress?.(); } : undefined}
    >
      {label}
    </Text>
  );
}
