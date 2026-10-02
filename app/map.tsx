import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useCourtOpen } from '@/features/players/courtLink';
import { EmptyState } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, locationEnabled, locationAsked, detectedCoords, actions } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle();
  // Opening the map is the moment to ask where you are: once, and only if you
  // have never chosen. Off, once chosen, stays off however the map is opened.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || locationEnabled || locationAsked !== false) return;
    asked.current = true;
    void actions.setLocationEnabled(true);
  }, [locationEnabled, locationAsked, actions]);
  // Opened from a post's tagged court: the map goes there, with the courts showing.
  // Opened on an open hit (?hit=…): the map goes there with its card up.
  // From an alert: on a player (?user=…, their card once their pin is in) or a spot (?lat=…&lng=…).
  const params = useLocalSearchParams<{ court?: string; lat?: string; lng?: string; name?: string; hit?: string; user?: string }>();
  const lat = Number(params.lat); const lng = Number(params.lng);
  const spotKnown = !!params.lat && !!params.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const focusCourt = useMemo(
    () => (params.court && params.name && spotKnown ? { id: params.court, name: params.name, lat, lng } : null),
    [params.court, params.name, lat, lng, spotKnown],
  );
  const focusSpot = useMemo(() => (!focusCourt && spotKnown ? { lat, lng } : null), [focusCourt, spotKnown, lat, lng]);
  // A court page's map button, or See all on this court's card, comes back here rather than stacking another copy.
  const ownHref = useMemo(() => ({ pathname: '/map' as const, params: { court: params.court, lat: params.lat, lng: params.lng, name: params.name } }), [params.court, params.lat, params.lng, params.name]);
  useCourtOpen('map', focusCourt, focusCourt ? ownHref : null);
  const back = () => goBack(focusCourt ? '/' : '/discuss?section=players');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgElevated }}>
      {currentUser ? (
        <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={back} onOpen={(id) => router.push(`/user/${id}`)} focusCourt={focusCourt} focusHit={params.hit ?? null} focusUser={params.user ?? null} focusSpot={focusSpot} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </View>
  );
}
