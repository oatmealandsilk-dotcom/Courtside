import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui';
import { railEntries } from '@/features/stories/stories';
import { useApp } from '@/store/AppContext';
import { colors, radius } from '@/theme';

/**
 * Hit tiles across the top of the feed — one photo each, taken after a session. Your own tile comes first and doubles
 * as the way to add one; a ring means there is something you have not watched.
 * Sits over the first clip, so everything is drawn to read against video.
 */
export function StoriesRail({ onVideo = false }: { onVideo?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { stories, users, currentUserId, blockedIds, mutedIds } = useApp();
  const entries = railEntries(stories, users, currentUserId, [...blockedIds, ...mutedIds]);
  if (!entries.length) return null;
  return (
    <ScrollView
      horizontal
      nativeID="stories-rail"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.row}
      accessibilityLabel="Hits"
    >
      {entries.map(({ user, stories: list, seen }) => {
        const mine = user.id === currentUserId;
        const empty = !list.length;
        const open = () => router.push(mine && empty ? '/hit' : `/story/${user.id}`);
        return (
          <Pressable
            key={user.id}
            accessibilityRole="button"
            accessibilityLabel={mine ? (empty ? 'Take a hit' : 'Your hit') : `${user.name}'s hit${seen ? ', seen' : ''}`}
            onPress={open}
            onLongPress={mine ? () => router.push('/hit') : undefined}
            style={styles.tile}
          >
            <View style={[styles.ring, empty ? styles.ringEmpty : seen ? styles.ringSeen : null]}>
              <Avatar name={user.name} seed={user.avatarSeed} size={54} style={styles.avatar} />
              {mine ? (
                <View style={styles.plus}>
                  <Ionicons name="add" size={14} color={colors.brandInk} />
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[styles.name, onVideo && styles.nameOnVideo]}>
              {mine ? (empty ? 'Take a hit' : 'Your hit') : user.name.split(' ')[0]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { paddingHorizontal: 14, gap: 12 },
  tile: { width: 66, alignItems: 'center', gap: 5 },
  ring: { padding: 2.5, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.brand, backgroundColor: colors.bg },
  ringSeen: { borderColor: colors.borderStrong },
  ringEmpty: { borderColor: 'transparent' },
  avatar: { borderWidth: 0 },
  plus: {
    position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 11, fontWeight: '600', color: colors.text, maxWidth: 66 },
  nameOnVideo: { color: '#FFFFFF', textShadowColor: '#0009', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
