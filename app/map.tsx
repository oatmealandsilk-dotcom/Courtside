import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';

/** The community map on its own page, big enough to actually look at. */
export default function MapScreen() {
  const { users, currentUser, currentUserId, blockedIds, locationEnabled, detectedCoords, actions } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  // Opening the map is the moment to ask where you are, once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || locationEnabled) return;
    asked.current = true;
    void actions.setLocationEnabled(true);
  }, [locationEnabled, actions]);
  return (
    // No page scroll here: every drag and pinch belongs to the map itself.
    <Screen title="Players near you" compactTitle scroll={false} padded={false} onBack={() => goBack('/discuss?section=players')}>
      {currentUser ? (
        <View style={{ flex: 1 }}>
          <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} onLocate={() => { void actions.setLocationEnabled(true); }} onOpen={(id) => router.push(`/user/${id}`)} />
        </View>
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </Screen>
  );
}
