import React from 'react';
import { router } from 'expo-router';

import { NearbyMap } from '@/components/NearbyMap';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';

/** The community map on its own page, big enough to actually look at. */
export default function MapScreen() {
  const { users, currentUser, currentUserId, blockedIds } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  return (
    <Screen title="Players near you" compactTitle onBack={() => router.back()}>
      {currentUser ? (
        <NearbyMap expanded me={currentUser} players={players} onOpen={(id) => router.push(`/user/${id}`)} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </Screen>
  );
}
