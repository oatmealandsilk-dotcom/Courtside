import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { NearbyMap } from '@/components/NearbyMap';
import { CARD_HEIGHT } from '@/components/map/cardFit';
import { milesBetween } from '@/features/players/geo';
import { IN_TOWN_MILES } from '@/features/players/mapModel';
import { nearbyLock } from '@/features/players/mapPrivacy';
import { useLocationToggle } from '@/features/players/useLocationToggle';
import { useMyCity } from '@/features/players/useMyCity';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/*
 * Community's Find Players map card, in the room a short post leaves on its
 * page in For you (owner, Oct 6: "for short post we put the find players near
 * you thing there"). The same still card, the same players, the same tap (the
 * full map); only under the first short post of a visit with room for it, so
 * it never reads as an ad on every page. Every other short post just has its
 * "Add a comment…" line pulled up under it (PostCard).
 */

/** Its line of words at its tallest (the words grow with large text to 1.2× at most). */
const LABEL = 27;
/** The room over the card: the gap under the comment line, the words, and the gap under them. */
const OVER = spacing.xl + LABEL + spacing.sm;
/** The shortest the card is drawn: still plainly the map, with the city, its count and its corners clear of each other. */
const MIN_CARD = 220;
/** The least room a short post must leave for the card to go under it. */
export const FIND_PLAYERS_ROOM = OVER + MIN_CARD;

/**
 * Whether the card has something to show: a city to centre on (where you are
 * with Location on, else your profile's) and someone near you on the map
 * (Community's own "near you": a spot shared within 30 miles of where you
 * are, your own last spot, or your city). No city, or nobody there, and the
 * post keeps the pulled-up comment line instead.
 */
export function useFindPlayersShown(): boolean {
  const { users, currentUser, currentUserId, blockedIds, lastSeen, detectedCoords, locationEnabled, mapLive, mapVisibility } = useApp();
  const { city, pending } = useMyCity(currentUser);
  const mine = currentUserId ? lastSeen[currentUserId] : undefined;
  const fix = locationEnabled ? detectedCoords : null;
  return useMemo(() => {
    if (!currentUser || !currentUserId) return false;
    // The card centres on where you are (Location on) or your profile's city; without either it asks for a city.
    if (!fix && (!city || pending)) return false;
    // "Turn on Location to see players nearby" is not something to put under a post.
    if (nearbyLock({ mapLive, me: currentUser, mapVisibility, locationOn: locationEnabled, hasSpot: !!mine })) return false;
    const from = detectedCoords ?? (mine ? { lat: mine.lat, lng: mine.lng } : null) ?? city;
    if (!from) return false;
    return users.some((u) => {
      if (u.id === currentUserId || blockedIds.includes(u.id)) return false;
      const seen = lastSeen[u.id];
      return !!seen && milesBetween(from, seen) <= IN_TOWN_MILES;
    });
  }, [users, currentUser, currentUserId, blockedIds, lastSeen, detectedCoords, fix, city, pending, mine, locationEnabled, mapLive, mapVisibility]);
}

/**
 * The card itself, with its line of words: built as Find Players builds it,
 * as tall as on Find Players when there is the room (`room`, what the post
 * leaves under its comment line), otherwise just as tall as fits.
 */
export function FeedFindPlayers({ room }: { room: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUser, currentUserId, blockedIds, detectedCoords } = useApp();
  const location = useLocationToggle();
  // Find Players' own list for its map: everyone but you and anyone blocked, your own city first.
  const players = useMemo(() => {
    const myCity = (currentUser?.location ?? '').split(',')[0].trim().toLowerCase();
    const sameCity = (u: (typeof users)[number]) => !!myCity && (u.location ?? '').toLowerCase().startsWith(myCity);
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id))
      .sort((a, b) => Number(sameCity(b)) - Number(sameCity(a)));
  }, [users, currentUser?.location, currentUserId, blockedIds]);
  if (!currentUser) return null;
  const cardHeight = Math.max(MIN_CARD, Math.min(CARD_HEIGHT, room - OVER));
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.2}>Find players near you</Text>
      <NearbyMap
        cardHeight={cardHeight}
        me={currentUser}
        players={players}
        at={detectedCoords}
        locationOn={location.locationOn}
        locating={location.locating}
        onToggleLocation={location.toggle}
        onOpen={(id) => router.push(`/user/${id}`)}
        onExpand={() => router.push('/map')}
      />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { paddingTop: spacing.xl, gap: spacing.sm },
  // As "Players you might know" is set on its page in For you.
  title: { ...typography.heading, fontSize: 16, lineHeight: 22, color: colors.text },
});
