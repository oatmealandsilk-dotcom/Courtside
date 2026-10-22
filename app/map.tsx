import { useTheme } from '@/theme/ThemeProvider';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useMapOpenEffects } from '@/features/players/useMapOpenEffects';
import { useCourtOpen } from '@/features/players/courtLink';
import { EmptyState } from '@/components/ui';
import { takeHandedPlace } from '@/features/places/geocode';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TipBubble } from '@/components/TipBubble';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, detectedCoords } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle('map');
  // Asking where you are and who sees you, the tip by the location button (shared with the map window).
  const { holdPins, whoTip } = useMapOpenEffects(location, true);
  // Opened from a post's tagged court: the map goes there, with the courts showing.
  // Opened on an open hit (?hit=…): the map goes there with its card up.
  // From an alert: on a player (?user=…, their card once their pin is in) or a spot (?lat=…&lng=…).
  // From Find Players' search: on a place (?place=1), with its courts listed. The place itself
  // is handed over in memory (handPlace), so an address searched for never sits in the page's address or history.
  const params = useLocalSearchParams<{ court?: string; lat?: string; lng?: string; name?: string; hit?: string; user?: string; place?: string }>();
  const lat = Number(params.lat); const lng = Number(params.lng);
  const spotKnown = !!params.lat && !!params.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const focusCourt = useMemo(
    () => (params.court && params.name && spotKnown ? { id: params.court, name: params.name, lat, lng } : null),
    [params.court, params.name, lat, lng, spotKnown],
  );
  const [focusPlace] = useState(() => (params.place && !focusCourt ? takeHandedPlace() : null));
  const focusSpot = useMemo(() => (!focusCourt && !focusPlace && spotKnown ? { lat, lng } : null), [focusCourt, focusPlace, spotKnown, lat, lng]);
  // A court page's map button, or See all on this court's card, comes back here rather than stacking another copy.
  const ownHref = useMemo(() => ({ pathname: '/map' as const, params: { court: params.court, lat: params.lat, lng: params.lng, name: params.name } }), [params.court, params.lat, params.lng, params.name]);
  useCourtOpen('map', focusCourt, focusCourt ? ownHref : null);
  const back = () => goBack(focusCourt ? '/' : '/discuss?section=players');
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgElevated }}>
      {currentUser ? (
        <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={back} onOpen={(id) => router.push(`/user/${id}`)} focusCourt={focusCourt} focusHit={params.hit ?? null} focusUser={params.user ?? null} focusSpot={focusSpot} focusPlace={focusPlace} holdPins={holdPins} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
      <TipBubble tip="map-who-sees" shown={whoTip.shown} onClose={whoTip.close} pointer="up" style={{ top: insets.top + 62, right: 10, left: 40, alignItems: 'flex-end' }} />
    </View>
  );
}
