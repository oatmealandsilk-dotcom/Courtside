import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { CourtDisc } from '@/components/place/CourtDisc';
import { CourtGrid } from '@/components/place/CourtGrid';
import { CourtHits } from '@/components/place/CourtHits';
import { CourtSays } from '@/components/place/CourtSays';
import { Avatar, Button, DottedRule, EmptyState, Screen } from '@/components/ui';
import type { Post, User } from '@/data/types';
import { countLabel, isClip, parseCourtParams, sameCourt } from '@/features/places/court';
import { areaOf } from '@/features/places/search';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { summarizeCourt } from '@/features/players/courtSummary';
import { fetchCourts, type Court } from '@/features/players/courts';
import { openCourtReel, postFromCourt, sendCourtToChat, showCourtOnMap, useCourtOpen } from '@/features/players/courtLink';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { directionsTo } from '@/features/players/openInMaps';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

type Params = { id: string; name?: string; lat?: string; lng?: string };

/**
 * A court's own page, the way a place has a page of its own on Snapchat or
 * Instagram: its name, town and distance; a clip in a ring, how fresh the
 * posts are, Watch all, and who has played here; the open hits here, with
 * Play here; what players say about it, once anyone has; then everything
 * posted there as a grid, newest first. A tile opens the court's reel on
 * that post.
 */
export default function CourtPage() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<Params>();
  const { posts, users, currentUser, currentUserId, detectedCoords, courtNotes, actions } = useApp();
  const stillLoading = useStillLoading();
  const parsed = parseCourtParams(params, posts);
  // One place object per court, however often the posts change (a like, a new page).
  const place = useMemo(() => parsed, [parsed?.id, parsed?.name, parsed?.lat, parsed?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const court = useCourtPosts(place);

  // What OpenStreetMap knows (how many courts, lit, surface), from the map's own
  // courts: the same id, or one within 0.15 mi. Nothing found, nothing said.
  const [mapCourt, setMapCourt] = useState<Court | null>(null);
  useEffect(() => {
    if (!place) return undefined;
    let on = true;
    fetchCourts({ lat: place.lat, lng: place.lng }, 2000)
      .then((list) => { if (on) setMapCourt(list.find((c) => !!place.id && c.id === place.id) ?? list.find((c) => sameCourt(c, { lat: place.lat, lng: place.lng })) ?? null); })
      .catch(() => undefined);
    return () => { on = false; };
  }, [place]);

  // The town it is in. Nothing found, the distance stands alone.
  const [area, setArea] = useState<string | null>(null);
  // Until the first answer, the subtitle keeps its line, so the title does not jump when the town lands.
  const [areaDone, setAreaDone] = useState(false);
  const askArea = useCallback(async () => {
    if (!place) return;
    try { const town = await areaOf(place); setArea((was) => town ?? was); } catch { /* the distance stands alone */ } finally { setAreaDone(true); }
  }, [place]);
  useEffect(() => { void askArea(); }, [askArea]);

  // Notes are kept by the map's id for the court; a place with no court found has none.
  const noteId = mapCourt?.id ?? place?.id;
  useEffect(() => { if (noteId) void actions.loadCourtNotes(noteId).catch(() => undefined); }, [noteId, actions]);
  // What players say takes room only once someone has said something; until then, a quiet link.
  const notes = noteId ? courtNotes[noteId] ?? [] : [];
  const says = noteId ? summarizeCourt(notes) : null;
  // A note with only a photo counts: the photo is what it says.
  const showSays = !!says && (says.facts.length > 0 || !!says.latest || says.photos.length > 0);
  const saidMine = notes.some((n) => n.userId === currentUserId);
  const name = params.name?.trim() || (mapCourt && mapCourt.name !== 'Tennis courts' ? mapCourt.name : null) || place?.name || 'Court';
  // Only from somewhere real: where the phone says you are, or the city on your profile. Never a guess.
  const viewer = detectedCoords ?? currentUser?.cityAt ?? null;
  const distance = place && viewer ? formatMiles(milesBetween(viewer, place)) : null;
  const subtitle = [area, distance].filter(Boolean).join(' · ') || undefined;
  const facts = mapCourt ? [mapCourt.count > 1 ? `${mapCourt.count} courts` : '1 court', mapCourt.surface ? mapCourt.surface.replace(/_/g, ' ') : null, mapCourt.lit ? 'lit at night' : null].filter(Boolean).join(' · ') : '';

  // This page's own address, so a tap that would open it again comes back here instead.
  const ownHref = useMemo(() => ({ pathname: '/court/[id]' as const, params: Object.fromEntries(Object.entries({ id: params.id, name: params.name, lat: params.lat, lng: params.lng }).filter(([, v]) => v !== undefined)) }), [params.id, params.name, params.lat, params.lng]);
  useCourtOpen('page', place ? { id: noteId, lat: place.lat, lng: place.lng } : null, ownHref);

  const refresh = useCallback(async () => {
    await Promise.all([court.refresh(), noteId ? actions.loadCourtNotes(noteId).catch(() => undefined) : undefined, askArea()]);
  }, [court.refresh, noteId, actions, askArea]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!place) {
    return (
      <Screen title="Court" compactTitle onBack={() => goBack()}>
        {stillLoading
          ? <View style={styles.wait}><CourtSpinner size={28} /></View>
          : <EmptyState icon="location-outline" title="This court isn’t available" body="The link is missing where it is." />}
      </Screen>
    );
  }

  // The reel is the same list as the grid, so tile N is page N.
  const spot = { id: place.id, name, lat: place.lat, lng: place.lng };
  const openReel = (post: Post) => openCourtReel(spot, post.id);
  const list = court.posts;
  const newest = list[0] ?? null;
  const cover = list.find((p) => p.thumbnailUrl || p.imageUrl) ?? null;
  // The ring shows a clip when there is one, and the ring and Watch all open the
  // post it shows; the reel still holds every post, so the newer ones are a swipe away.
  const lead = list.find((p) => isClip(p) && (p.thumbnailUrl || p.imageUrl)) ?? cover ?? newest;
  const allClips = list.length > 0 && list.every(isClip);
  const counting = court.status !== 'ready' && !list.length;
  // How fresh the court is, the way a place's story says "2h".
  const when = newest ? relativeTime(newest.createdAt) : null;
  const lastPost = !when ? null : /^\d+[mh]$/.test(when) ? `Last post ${when} ago` : when === 'just now' ? 'Last post just now' : `Last post ${when}`;
  const freshness = [lastPost, facts].filter(Boolean).join(' · ');
  const addWhatYouKnow = () => { if (noteId) router.push({ pathname: '/court-report', params: { id: noteId, name } }); };
  // Posting needs the court's map id to tag it; a place without one has no Post from here.
  const postHere = noteId ? () => postFromCourt({ id: noteId, name, lat: place.lat, lng: place.lng }) : undefined;
  // The court as the rest of the app should know it: the map's id even for a
  // page opened by spot (from a hit or a chat), so hits and sends land on it.
  const here = { id: noteId, name, lat: place.lat, lng: place.lng };
  // Who has played here: the people behind the posts, newest first, you aside.
  const players: User[] = [];
  for (const p of list) {
    if (p.authorId === currentUserId || players.some((u) => u.id === p.authorId)) continue;
    const who = users.find((u) => u.id === p.authorId);
    if (who) players.push(who);
  }
  const first = (u: User) => u.name.split(' ')[0];
  const playedBy = players.length === 0 ? ''
    : players.length === 1 ? first(players[0])
      : players.length === 2 ? `${first(players[0])} and ${first(players[1])}`
        : players.length === 3 ? `${first(players[0])}, ${first(players[1])} and ${first(players[2])}`
          : `${first(players[0])}, ${first(players[1])} and ${players.length - 2} others`;

  return (
    <Screen
      title={name}
      subtitle={subtitle ?? (areaDone ? undefined : '\u00A0')}
      compactTitle
      onBack={() => goBack()}
      onRefresh={isDesktopBrowser() ? undefined : refresh}
      right={
        <View style={styles.icons}>
          <Pressable accessibilityRole="button" accessibilityLabel={`See ${name} on the map`} hitSlop={8} onPress={() => showCourtOnMap({ id: noteId, name, lat: place.lat, lng: place.lng })} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
            <Ionicons name="map-outline" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Send ${name} to a chat`} hitSlop={8} onPress={() => sendCourtToChat(here)} style={({ pressed }) => [styles.icon, pressed && styles.pressed]}>
            <Ionicons name="paper-plane-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.hero}>
        <CourtDisc cover={lead} label={`Watch ${list.length} ${allClips ? (list.length === 1 ? 'clip' : 'clips') : list.length === 1 ? 'post' : 'posts'} from ${name}`} onPress={() => { if (lead) openReel(lead); }} />
        <View style={styles.heroWords}>
          {counting ? null : <Text style={styles.count}>{countLabel(list, court.more)}</Text>}
          {freshness ? <Text style={styles.facts} numberOfLines={2}>{freshness}</Text> : null}
          {players.length ? (
            <View style={styles.playedBy}>
              <View style={styles.faces}>
                {players.slice(0, 4).map((u, i) => (
                  <Pressable key={u.id} accessibilityRole="link" accessibilityLabel={`${u.name}, open profile`} hitSlop={4} onPress={() => router.push(`/user/${u.id}`)} style={({ pressed }) => [i > 0 && styles.faceOver, pressed && styles.pressed]}>
                    <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={26} style={styles.face} />
                  </Pressable>
                ))}
              </View>
              <Text style={styles.playedByText} numberOfLines={1}>Played here by {playedBy}</Text>
            </View>
          ) : null}
          {!showSays && noteId ? (
            <Pressable accessibilityRole="link" accessibilityLabel={saidMine ? `Update what you said about ${name}` : `Add what you know about ${name}`} hitSlop={8} onPress={addWhatYouKnow} style={({ pressed }) => [styles.addLink, pressed && styles.pressed]}>
              <Text style={styles.add}>{saidMine ? 'Update yours' : 'Add what you know'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.pills}>
        {lead ? <View style={styles.pill}><Button full label="Watch all" onPress={() => openReel(lead)} /></View>
          : postHere && !counting ? <View style={styles.pill}><Button full label="Post from here" onPress={postHere} /></View>
          : null}
        <View style={styles.pill}><Button full label="Directions" variant="secondary" onPress={() => directionsTo({ name, lat: place.lat, lng: place.lng })} /></View>
        {/* Directions alone (still loading, or nowhere to post) stays pill-sized, not a bar across the page. */}
        {!lead && (!postHere || counting) ? <View style={styles.pill} /> : null}
      </View>
      <DottedRule />
      <CourtHits place={here} />
      <DottedRule />
      {showSays && noteId ? (
        <>
          <CourtSays courtId={noteId} name={name} />
          <DottedRule />
        </>
      ) : null}
      <CourtGrid
        posts={list}
        users={users}
        status={court.status}
        more={court.more}
        loadingOlder={court.loadingOlder}
        courtName={name}
        onOpen={openReel}
        onOlder={() => { void court.loadOlder(); }}
        onPost={postHere}
        onRetry={() => { void court.refresh(); }}
      />
      {facts ? <Text style={styles.credit}>Court details from OpenStreetMap</Text> : null}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  icons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xs },
  heroWords: { flex: 1, gap: 2 },
  count: { ...typography.bodyStrong, color: colors.text },
  facts: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  addLink: { alignSelf: 'flex-start' },
  playedBy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  faceOver: { marginLeft: -8 },
  face: { borderWidth: 2, borderColor: colors.bg, borderRadius: 15 },
  playedByText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  add: { ...typography.smallStrong, color: colors.brand },
  credit: { ...typography.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
  wait: { paddingVertical: 60, alignItems: 'center' },
  // Two pills, never wider together than a phone's row: on a computer they stay pill-sized.
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, maxWidth: 440 },
  pill: { flex: 1 },
});
