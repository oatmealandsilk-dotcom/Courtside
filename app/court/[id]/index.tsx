import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { CourtDisc } from '@/components/place/CourtDisc';
import { CourtGrid } from '@/components/place/CourtGrid';
import { CourtHits } from '@/components/place/CourtHits';
import { CourtKing } from '@/components/place/CourtKing';
import { CourtSays } from '@/components/place/CourtSays';
import { AccessTag, FollowHeart, NowTags } from '@/components/place/CourtLife';
import { Avatar, Button, DottedRule, EmptyState, Screen } from '@/components/ui';
import type { Post, User } from '@/data/types';
import { countLabel, isClip, parseCourtParams, sameCourt } from '@/features/places/court';
import { areaOf } from '@/features/places/search';
import { useCourtPosts } from '@/features/places/useCourtPosts';
import { fetchCourts, isClosedCourt, type Court } from '@/features/players/courts';
import { isMapCourtId } from '@/features/places/courtName';
import { openCourtReel, postFromCourt, sendCourtToChat, showCourtOnMap, startSessionHere, useCourtOpen } from '@/features/players/courtLink';
import { formatMiles, milesBetween } from '@/features/players/geo';
import { directionsTo } from '@/features/players/openInMaps';
import { finishLive } from '@/features/activity/finishLive';
import { liveState } from '@/features/activity/liveSession';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { relativeTime } from '@/lib/format';
import { goBack } from '@/lib/goBack';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';
import { publicRoute } from '@/features/share/publicRoute';

type Params = { id: string; name?: string; lat?: string; lng?: string };

/**
 * A court's own page, the way a place has a page of its own on Snapchat or
 * Instagram: its name, town and distance; a clip in a ring, how fresh the
 * posts are, who has played here and how many follow it; who may play
 * there and how it is right now; Watch all; what players say about it
 * (lights, busy times, the surface), with Add what you know; the open hits
 * here, with Play here; then everything posted there as a grid, newest
 * first. A tile opens the court's reel on that post. The heart up top
 * follows it. Under Watch all and Directions, Start a session here: the
 * clock, with this court already chosen (or the session already going).
 */
function CourtPage() {
  const styles = useThemedStyles(styleDefinitions);
  const params = useLocalSearchParams<Params>();
  const { posts, users, currentUser, currentUserId, detectedCoords, courtFacts, courtFollows, courtExtras, actions, liveSession } = useApp();
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

  // Facts, follows and right now are kept by the map's id for the court; a place with no court found has none.
  const noteId = mapCourt?.id ?? place?.id;
  const factsId = isMapCourtId(noteId) ? noteId : undefined;
  // Asked again once you are signed in: a link opened cold can draw the page a moment before.
  useEffect(() => { if (factsId && currentUserId) void actions.loadCourtInfo([factsId]).catch(() => undefined); }, [factsId, currentUserId, actions]);
  // The court's own life (migration 60), shown once a read has said the
  // database has it: on one without it, nothing appears that cannot work.
  const extras = !!factsId && courtExtras === true;
  const said = factsId ? courtFacts[factsId] : undefined;
  const access = said && said.access !== 'unknown' ? said.access : mapCourt?.access ?? 'unknown';
  const bookUrl = said?.bookUrl ?? mapCourt?.bookUrl;
  const closed = isClosedCourt({ access });
  const followers = factsId ? courtFollows[factsId]?.followers ?? 0 : 0;
  const name = params.name?.trim() || (mapCourt && mapCourt.name !== 'Tennis courts' ? mapCourt.name : null) || place?.name || 'Court';
  // Only from somewhere real: where the phone says you are, or the city on your profile. Never a guess.
  const viewer = detectedCoords ?? currentUser?.cityAt ?? null;
  const distance = place && viewer ? formatMiles(milesBetween(viewer, place)) : null;
  const subtitle = [area, distance].filter(Boolean).join(' · ') || undefined;
  // Lights from the map only while no player has said: then "What players
  // say" is the one place lights are mentioned, and the two never disagree.
  const playersOnLights = !!said && said.lights.yes + said.lights.no > 0;
  const facts = mapCourt ? [mapCourt.count > 1 ? `${mapCourt.count} courts` : '1 court', mapCourt.surface ? mapCourt.surface.replace(/_/g, ' ') : null, mapCourt.lit && !playersOnLights ? 'lit at night' : null].filter(Boolean).join(' · ') : '';

  // This page's own address, so a tap that would open it again comes back here instead.
  const ownHref = useMemo(() => ({ pathname: '/court/[id]' as const, params: Object.fromEntries(Object.entries({ id: params.id, name: params.name, lat: params.lat, lng: params.lng }).filter(([, v]) => v !== undefined)) }), [params.id, params.name, params.lat, params.lng]);
  useCourtOpen('page', place ? { id: noteId, lat: place.lat, lng: place.lng } : null, ownHref);

  // King of the Court asks again on a pull, with the rest of the page.
  const [kingTick, setKingTick] = useState(0);
  const refresh = useCallback(async () => {
    setKingTick((n) => n + 1);
    await Promise.all([court.refresh(), factsId ? actions.loadCourtInfo([factsId]).catch(() => undefined) : undefined, askArea()]);
  }, [court.refresh, factsId, actions, askArea]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Posting needs the court's map id to tag it; a place without one has no Post from here.
  const postHere = noteId ? () => postFromCourt({ id: noteId, name, lat: place.lat, lng: place.lng }) : undefined;
  // The court as the rest of the app should know it: the map's id even for a
  // page opened by spot (from a hit or a chat), so hits and sends land on it.
  const here = { id: noteId, name, lat: place.lat, lng: place.lng };
  const liveNow = liveSession ? liveState(liveSession) : null;
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
      // A long name ("Bellwood Recreation Center") ran to three lines beside the icons on a small
      // phone: held to two, and a step smaller only when it would wrap at the usual size, so
      // "Alder Park" and a longer name that still fits on one line read the same size.
      titleLines={2}
      onBack={() => goBack()}
      onRefresh={isDesktopBrowser() ? undefined : refresh}
      right={
        <View style={styles.icons}>
          {extras && factsId ? <FollowHeart court={{ id: factsId, name, lat: place.lat, lng: place.lng, access }} style={styles.icon} size={20} /> : null}
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
          {/* A count, never names: who follows a court is theirs to know. */}
          {extras && followers ? <Text style={styles.followers}>{followers === 1 ? '1 player follows this court' : `${followers} players follow this court`}</Text> : null}
        </View>
      </View>
      {access !== 'unknown' || bookUrl || extras ? (
        <View style={styles.tags}>
          <AccessTag access={access} bookUrl={bookUrl} />
          {extras && factsId ? <NowTags courtId={factsId} name={name} access={access} /> : null}
        </View>
      ) : null}
      <View style={styles.pills}>
        {lead ? <View style={styles.pill}><Button full label="Watch all" onPress={() => openReel(lead)} /></View>
          : postHere && !counting ? <View style={styles.pill}><Button full label="Post from here" onPress={postHere} /></View>
          : null}
        <View style={styles.pill}><Button full label="Directions" variant="secondary" onPress={() => directionsTo({ name, lat: place.lat, lng: place.lng })} /></View>
        {/* Directions alone (still loading, or nowhere to post) stays pill-sized, not a bar across the page. */}
        {!lead && (!postHere || counting) ? <View style={styles.pill} /> : null}
      </View>
      {/* Start a session here (Oct 6, owner chose "A"): starting is "I'm at this court", so the start step opens
          with this court chosen; it checks you in by the court sheet's rules, and a teen, or anyone at a club's or
          someone's home court, gets the timer alone. A session already going: that one, never a second. */}
      <View style={styles.startRow}>
        <Button
          full
          variant="secondary"
          label={!liveNow ? 'Start a session here' : liveNow === 'finished' ? 'Log your session' : 'Session in progress'}
          onPress={() => (!liveNow ? startSessionHere(here, access) : liveNow === 'finished' && liveSession ? finishLive(liveSession, actions) : router.push('/live-session'))}
        />
      </View>
      <DottedRule />
      {/* King of the Court (migration 130): signed in, at a court on the map, never at someone's home court, and only while its switch is on for you (migration 140; admins for now). Brings its own rule below. */}
      {factsId && currentUserId && access !== 'private' ? <CourtKing courtId={factsId} name={name} refresh={kingTick} /> : null}
      {extras && factsId ? (
        <>
          <CourtSays courtId={factsId} name={name} />
          <DottedRule />
        </>
      ) : null}
      <CourtHits place={here} closed={closed} />
      <DottedRule />
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
  followers: { ...typography.small, color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.lg },
  playedBy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  faces: { flexDirection: 'row', alignItems: 'center' },
  faceOver: { marginLeft: -8 },
  face: { borderWidth: 2, borderColor: colors.bg, borderRadius: 15 },
  playedByText: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  credit: { ...typography.caption, color: colors.textFaint, textAlign: 'center', marginTop: spacing.xl },
  wait: { paddingVertical: 60, alignItems: 'center' },
  // Two pills, never wider together than a phone's row: on a computer they stay pill-sized.
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, maxWidth: 440 },
  pill: { flex: 1 },
  startRow: { marginTop: spacing.sm, maxWidth: 440 },
});

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('court', CourtPage);
