import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui';
import { railEntries } from '@/features/stories/stories';
import { timeLeft } from '@/lib/format';
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
  // Only players with a live hit: no empty circles, no "take a hit" tile.
  // Your own comes first when you have one up.
  const entries = railEntries(stories, users, currentUserId, [...blockedIds, ...mutedIds]).filter((e) => e.stories.length > 0);
  // Ticks once a minute so the countdown under each tile stays honest.
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(id); }, []);
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
        // The newest hit sets the clock: when it goes, the tile goes.
        const left = timeLeft(list[list.length - 1].expiresAt);
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
              {mine ? 'Your hit' : user.name.split(' ')[0]}
            </Text>
            <Text numberOfLines={1} style={[styles.left, onVideo && styles.nameOnVideo]}>{left}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { paddingHorizontal: 14, gap: 12 },
  tile: { width: 66, alignItems: 'center', gap: 4 },
  ring: { padding: 2.5, borderRadius: radius.pill, borderWidth: 2.5, borderColor: colors.brand, backgroundColor: colors.bg },
  ringSeen: { borderColor: colors.borderStrong },
  ringEmpty: { borderColor: 'transparent' },
  avatar: { borderWidth: 0 },
  plus: {
    position: 'absolute', right: -1, bottom: -1, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 11, fontWeight: '600', color: colors.text, maxWidth: 66 },
  left: { fontSize: 10, fontWeight: '500', color: colors.textMuted, maxWidth: 66, marginTop: -3 },
  nameOnVideo: { color: '#FFFFFF', textShadowColor: '#0009', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
