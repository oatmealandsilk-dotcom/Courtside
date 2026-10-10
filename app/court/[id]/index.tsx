import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { CourtSpinner } from '@/components/CourtSpinner';
import { PlaceCard } from '@/components/place/courtPage/PlaceCard';
import type { CourtView } from '@/components/place/courtPage/view';
import { EmptyState, Screen } from '@/components/ui';
import type { Post, User } from '@/data/types';
import { isClip, parseCourtParams, sameCourt } from '@/features/places/court';
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
import { publicRoute } from '@/features/share/publicRoute';

type Params = { id: string; name?: string; lat?: string; lng?: string };

/**
 * A court's own page, laid out the way Apple Maps shows a place (owner,
 * Oct 10: "Do b."; the place card, components/place/courtPage/PlaceCard):
 * its map at the top, the page rising over it as a sheet with the name,
 * town, distance and followers, who has played here, how it is right now,
 * Start a session here, the round actions (Directions, Follow, Play here,
 * Post, Share) and the court's facts; then its posts as a grid, the open
 * hits, King of the Court and what players say.
 *
 * This works out everything the page shows, by the court's own rules (what
 * the map knows, who may play, lights said once, who has played here, the
 * session's state), and hands it to the place card as one CourtView, which
 * only lays it out.
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
  // Until the first answer, the town keeps its line, so the name does not jump when it lands.
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
  // Watch all opens on a clip when there is one; the reel still holds every
  // post, so the newer ones are a swipe away.
  const lead = list.find((p) => isClip(p) && (p.thumbnailUrl || p.imageUrl)) ?? cover ?? newest;
  // How fresh the court is, the way a place's story says "2h".
  const when = newest ? relativeTime(newest.createdAt) : null;
  const lastPost = !when ? null : /^\d+[mh]$/.test(when) ? `Last post ${when} ago` : when === 'just now' ? 'Last post just now' : `Last post ${when}`;
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

  const view: CourtView = {
    name,
    area,
    distance,
    areaPending: !areaDone,
    here,
    factsId,
    extras,
    access,
    bookUrl,
    closed,
    // A count, never names: who follows a court is theirs to know.
    followers: extras ? followers : 0,
    map: mapCourt ? { count: mapCourt.count, surface: mapCourt.surface, lit: !!mapCourt.lit } : null,
    playersOnLights,
    factsLine: facts,
    posts: list,
    users,
    status: court.status,
    more: court.more,
    loadingOlder: court.loadingOlder,
    lead,
    players,
    playedBy,
    lastPost,
    currentUserId,
    kingTick,
    // Start a session here (Oct 6, owner chose "A"): starting is "I'm at this court", so the start step opens
    // with this court chosen; it checks you in by the court sheet's rules, and a teen, or anyone at a club's or
    // someone's home court, gets the timer alone. A session already going: that one, never a second.
    session: {
      state: !liveNow ? 'start' : liveNow === 'finished' ? 'finished' : 'live',
      onPress: () => (!liveNow ? startSessionHere(here, access) : liveNow === 'finished' && liveSession ? finishLive(liveSession, actions) : router.push('/live-session')),
    },
    onDirections: () => directionsTo({ name, lat: place.lat, lng: place.lng }),
    onMap: () => showCourtOnMap({ id: noteId, name, lat: place.lat, lng: place.lng }),
    onShare: () => sendCourtToChat(here),
    onPost: postHere,
    onRefresh: isDesktopBrowser() ? undefined : refresh,
    onOpenReel: openReel,
    onOlder: () => { void court.loadOlder(); },
    onRetry: () => { void court.refresh(); },
  };
  return <PlaceCard view={view} />;
}

const styleDefinitions = StyleSheet.create({
  wait: { paddingVertical: 60, alignItems: 'center' },
});

// A link shared outside the app opens here for anyone; signed out, it shows the public look (see SharedPage).
export default publicRoute('court', CourtPage);
