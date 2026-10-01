import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Post } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { colors, font, typography } from '@/theme';

/**
 * Who is tagged in a post, the way Instagram shows it on a reel: a small
 * person mark and "with Mira", "with Mira and Dev", "with Mira and 3 others".
 * One person opens their profile; several open the list of everyone tagged.
 * `onMedia` is the white version laid over a photo or clip.
 */
export function TaggedLine({ post, onMedia = false }: { post: Post; onMedia?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, blockedIds } = useApp();
  const people = (post.taggedUserIds ?? [])
    .filter((id) => !blockedIds.includes(id))
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  if (!people.length) return null;
  const first = (name: string) => name.split(' ')[0];
  const names = people.length === 1
    ? first(people[0].name)
    : people.length === 2
      ? `${first(people[0].name)} and ${first(people[1].name)}`
      : `${first(people[0].name)} and ${people.length - 1} others`;
  const open = () => {
    if (people.length === 1) router.push(`/user/${people[0].id}`);
    else router.push({ pathname: '/likes', params: { id: post.id, set: 'tagged' } });
  };
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Tagged: ${people.map((p) => p.name).join(', ')}`}
      hitSlop={6}
      onPress={(e) => { e?.stopPropagation?.(); open(); }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="person-outline" size={12} color={onMedia ? '#fff' : colors.textMuted} style={onMedia ? styles.shadow : undefined} />
      <Text style={[styles.text, onMedia && styles.onMedia]} numberOfLines={1}>
        with <Text style={[styles.names, onMedia && styles.onMedia]}>{names}</Text>
      </Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%' },
  text: { ...typography.small, color: colors.textMuted },
  names: { ...font('600'), color: colors.text },
  // Over a picture: white, with the same soft shadow as the rest of the caption.
  onMedia: { color: '#fff', textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  shadow: { textShadowColor: 'rgba(0, 0, 0, 0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
