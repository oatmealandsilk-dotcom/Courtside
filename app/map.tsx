import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useWhoSeesYouUp } from '@/features/players/mapPrivacy';
import { useCourtOpen } from '@/features/players/courtLink';
import { EmptyState } from '@/components/ui';
import { takeHandedPlace } from '@/features/places/geocode';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';
import { takeGrowPlan } from '@/features/players/mapGrow';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, detectedCoords, mapLive } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle();
  // Nothing is asked on opening the map any more (migration 189, Apple 5.1.2(i)): the map opens
  // on your town, and "Who can see you on the map?" and Apple's prompt come only with Check in.
  // Opened from a post's tagged court: the map goes there, with the courts showing.
  // Opened on an open hit (?hit=…): the map goes there with its card up.
  // From an alert: on a player (?user=…, their card once their pin is in) or a spot (?lat=…&lng=…).
  // From Find Players' search: on a place (?place=1), with its courts listed. The place itself
  // is handed over in memory (handPlace), so an address searched for never sits in the page's address or history.
  const params = useLocalSearchParams<{ court?: string; lat?: string; lng?: string; name?: string; hit?: string; user?: string; place?: string; grow?: string }>();
  // Opened by the Community card growing into it (the check-in zoom, mapGrow): it opened with no slide, starting
  // exactly where the grown card shows, and (in a browser) see-through over the page pushing in until it has drawn.
  // Once it has taken over it is the ordinary full map again: Back (and the edge swipe) slide it away as always.
  const [growFrom] = useState(() => (params.grow ? takeGrowPlan() : null));
  const [grown, setGrown] = useState(!growFrom);
  const navigation = useNavigation();
  useEffect(() => {
    if (!params.grow || !grown) return;
    navigation.setOptions(Platform.OS === 'web'
      ? { presentation: 'card', animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }
      : { animation: 'slide_from_right' });
  }, [grown]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The map's first pins wait while "Who can see you on the map?" is up, so their wave is seen, not
  // played behind the sheet. Until it is known whether the map's rules are on the database (a
  // moment, at most 2.5 s) they wait too.
  const sheetUp = useWhoSeesYouUp();
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  const holdPins = sheetUp || (mapLive === null && !waited);
  return (
    <View style={{ flex: 1, backgroundColor: grown ? colors.bgElevated : 'transparent' }}>
      {currentUser ? (
        <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={back} onOpen={(id) => router.push(`/user/${id}`)} focusCourt={focusCourt} focusHit={params.hit ?? null} focusUser={params.user ?? null} focusSpot={focusSpot} focusPlace={focusPlace} holdPins={holdPins} growFrom={growFrom} onGrown={() => setGrown(true)} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </View>
  );
}
