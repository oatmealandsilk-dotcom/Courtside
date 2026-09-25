import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { EmptyState } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, locationEnabled, detectedCoords, actions } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle();
  // Opening the map is the moment to ask where you are, once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || locationEnabled) return;
    asked.current = true;
    void actions.setLocationEnabled(true);
  }, [locationEnabled, actions]);
  const back = () => goBack('/discuss?section=players');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgElevated }}>
      {currentUser ? (
        <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={back} onOpen={(id) => router.push(`/user/${id}`)} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </View>
  );
}
