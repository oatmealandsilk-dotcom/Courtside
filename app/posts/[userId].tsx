import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import Home from '../(tabs)/index';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

type Set = 'own' | 'clips' | 'tagged';

/**
 * A grid tile opens here: the same full-screen feed as Home, scoped to that
 * person's clips, posts or tagged posts, starting on the one that was tapped
 * and ending when they run out.
 */
export default function PlayerPosts() {
  const { userId, post: start, set = 'own' } = useLocalSearchParams<{ userId: string; post?: string; set?: Set }>();
  const { users } = useApp();
  if (!users.some((u) => u.id === userId)) {
    return (
      <Screen title="Posts" compactTitle onBack={() => goBack()}>
        <EmptyState icon="person-outline" title="No such player" />
      </Screen>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      <Home scope={{ userId, set, start }} />
    </View>
  );
}
