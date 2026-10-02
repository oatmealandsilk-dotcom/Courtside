import { useTheme } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';

import { NearbyMap } from '@/components/NearbyMap';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useWhoSeesYouUp } from '@/features/players/mapPrivacy';
import { useCourtOpen } from '@/features/players/courtLink';
import { EmptyState } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/** The community map as the whole page: tiles edge to edge, the controls laid over them. */
export default function MapScreen() {
  // Hears a theme change, so its own colours never lag the page's.
  useTheme();
  const { users, currentUser, currentUserId, blockedIds, locationEnabled, locationAsked, detectedCoords, actions, mapLive } = useApp();
  const players = users.filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id));
  const location = useLocationToggle('map');
  // Opening the map is the moment to ask where you are: once, and only if you
  // have never chosen. Off, once chosen, stays off however the map is opened.
  // Never said who can see you on the map (migration 63)? That comes first,
  // with Location on already or never asked: then the device's own prompt
  // (if it was never asked), then the tip by the location button.
  const asked = useRef(false);
  const { mustChoose, chooseFirst } = location;
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    // Only once it is known whether there is a choice to make: who you are, and whether the database has it.
    if (asked.current || !currentUser || mapLive === null) return;
    if (mustChoose && (locationEnabled || locationAsked === false)) {
      asked.current = true;
      setAsking(true);
      void chooseFirst(locationAsked === false).finally(() => setAsking(false));
      return;
    }
    if (locationEnabled || locationAsked !== false) return;
    asked.current = true;
    void actions.setLocationEnabled(true);
  }, [locationEnabled, locationAsked, actions, mustChoose, chooseFirst, currentUser, mapLive]);
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
  // The map's first pins wait while "Who can see you on the map?" is up (or
  // about to be), so their wave is seen, not played behind the sheet. Until
  // it is known whether there is anything to ask (a moment, at most 2.5 s)
  // they wait too.
  const sheetUp = useWhoSeesYouUp();
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  const willAsk = !asked.current && mustChoose && (locationEnabled || locationAsked === false);
  const holdPins = sheetUp || asking || willAsk || (mapLive === null && !waited);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgElevated }}>
      {currentUser ? (
        <NearbyMap expanded fullscreen me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onBack={back} onOpen={(id) => router.push(`/user/${id}`)} focusCourt={focusCourt} focusHit={params.hit ?? null} focusUser={params.user ?? null} focusSpot={focusSpot} holdPins={holdPins} />
      ) : (
        <EmptyState title="Sign in to see who is around" />
      )}
    </View>
  );
}
