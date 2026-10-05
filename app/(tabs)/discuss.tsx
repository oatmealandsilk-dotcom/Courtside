import { asTabRoute } from '@/features/navigation/tabFocus';
import { SectionPager } from '@/components/SectionPager';
import { PULL_GAP } from '@/lib/pullRefresh';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, TextInput, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import Ionicons from '@expo/vector-icons/Ionicons';
import { InboxButton, NotificationButton } from '@/components/InboxButton';

import { LevelPill } from '@/components/LevelPill';
import { NearbyMap } from '@/components/NearbyMap';
import { UpToday, useUpToday } from '@/components/UpToday';
import { HitGlyph } from '@/components/HitGlyph';
import { useLocationToggle, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { QuestionCard, TOPIC_META } from '@/components/QuestionCard';
import { HitCard } from '@/components/HitCard';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { Highlighted } from '@/components/CourtSearch';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CourtsNear, useNearCourts } from '@/components/place/CourtsNear';
import { YourCourts } from '@/components/place/YourCourts';
import { EarlyInvite } from '@/components/EarlyInvite';
import { FollowPill } from '@/components/FollowPill';
import { takeInviteCourt } from '@/features/invite/referral';
import { notKnownAdult } from '@/features/players/age';
import { askWhoSeesYouOnLaunch, canChooseVisibility, onTeenMap } from '@/features/players/mapPrivacy';
import { isTourOpen, useTourOpen } from '@/features/tour/tourStore';
import { IN_TOWN_MILES, liveCentre } from '@/features/players/mapModel';
import { isClosedCourt } from '@/features/players/courts';
import { agoLabel } from '@/components/map/markers';
import { confirmUnfollow } from '@/lib/confirm';
import { NEAR_HIT_MILES, canSeeHitAt, hitSpot, openHits as openHitsOf } from '@/features/hits/visible';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { handPlace, type FoundPlace } from '@/features/places/geocode';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';
import { openCourt, playHere } from '@/features/players/courtLink';
import { formatMiles, formatSpotMiles, milesBetween } from '@/features/players/geo';
import { isRoughSpot } from '@/features/players/positions';
import { useMyCity } from '@/features/players/useMyCity';
import { isOpenToHit as isOpenToHitNow } from '@/features/players/openToHit';
import { plain } from '@/features/search/words';
import { askedSection, reportSection, subscribeSectionRequest, takeAskedSection } from '@/features/navigation/swipeOrder';
import { START_SECTION, START_TAB } from '@/features/navigation/startTab';
import { setStartDrawn } from '@/features/feed/warmup';
import { useApp } from '@/store/AppContext';
import { useAndroidBack } from '@/lib/androidBack';
import type { QuestionTopic } from '@/data/types';
import { colors, radius, spacing, typography, font, lift } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { isSupabaseConfigured } from '@/lib/supabase';

const TOPICS: (QuestionTopic | 'all')[] = [
  'all',
  'gear',
  'technique',
  'strategy',
  'injury',
  'fitness',
  'rules',
  'mental',
];

/** The two sections, left to right. Anything that is not Discussions means Find Players, the first. */
type Section = 'players' | 'discussions';
const asSection = (value: string): Section => (value === 'discussions' ? 'discussions' : 'players');
/** A topic asked for by name; anything unknown is all of them. */
const asTopic = (value: string | undefined): QuestionTopic | 'all' => (value && value in TOPIC_META ? (value as QuestionTopic) : 'all');

const SORT_LABEL = { new: 'New', hot: 'Hot', top: 'Top', unanswered: 'Unanswered' } as const;
/** Open hits shown before "More open hits": the rest are a tap away, never dropped. */
const HITS_SHOWN = 5;
/** "New on CourtSide": joined this recently. */
const NEW_DAYS = 14;
/** New players shown before "Show more". */
const NEW_SHOWN = 6;
const SORT_HINT = { new: 'Newest first', hot: 'Busiest right now', top: 'Most upvoted', unanswered: 'Nobody has replied yet' } as const;
/** "Joined 3 days ago", for New on CourtSide. */
const joinedLabel = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'Joined today' : days === 1 ? 'Joined yesterday' : `Joined ${days} days ago`;
};

function Discuss({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, currentUser, blockedIds, mutedIds, followingIds, saved, actions, detectedCoords, locationEnabled, hitRequests, lastSeen, lastSeenLoaded, followedCourts, onboardingComplete, mapLive, newOnCourtside, mapVisibility, teenMap, seeing, ageSaysAdult } = useApp();
  // The section lives here, not in the address: listening to the address made
  // this whole tab re-render on every route change anywhere in the app.
  // Other pages ask for a section through requestSection before navigating;
  // the bar asks for Find Players whenever it brings you here from somewhere
  // else (askForCommunityMap), and a swipe from the Feed for Discussions.
  // It starts on Find Players: the app opens here, on the map (see startTab).
  // Unless a page asked for a section before this tab was built (a thread
  // opened from a link, then swiped back): that ask was kept for it.
  const [localSection, setLocalSection] = useState<Section>(() => asSection((!previewSection && askedSection('/discuss')) || START_SECTION));
  const section = previewSection ? asSection(previewSection) : localSection;
  // Held locally only: pushing it into the address on every swipe made the
  // whole app re-render mid-gesture.
  const setSection = (value: string) => setLocalSection(asSection(value));
  // Each section keeps its own place on the page (Oct 4, owner): leaving the map
  // halfway down no longer drops you halfway down the threads. One you have not
  // opened yet starts at the top.
  const pageRef = useRef<ScrollView | null>(null);
  const offsetY = useSharedValue(0);
  // The pane not on show is held at its own spot while it slides in (shifted by
  // the difference), so the swipe shows it where you left it and nothing snaps after.
  // The page's top is below 0 by the pull-to-refresh strip (Screen hides it there); scrolling
  // to 0 opened the strip and set a refresh going (Oct 4).
  const pageTop = Platform.OS !== 'web' && previewSection === undefined ? PULL_GAP : 0;
  const spotPlayers = useSharedValue(pageTop);
  const spotThreads = useSharedValue(pageTop);
  const onShow = useSharedValue(section === 'players' ? 0 : 1);
  const shownSection = useRef(section);
  useEffect(() => {
    const was = shownSection.current;
    if (was === section) return;
    (was === 'players' ? spotPlayers : spotThreads).value = Math.max(pageTop, offsetY.value);
    shownSection.current = section;
    onShow.value = section === 'players' ? 0 : 1;
    pageRef.current?.scrollTo({ y: (section === 'players' ? spotPlayers : spotThreads).value, animated: false });
  }, [section, offsetY, spotPlayers, spotThreads, onShow, pageTop]);
  const playersHold = useAnimatedStyle(() => ({ transform: [{ translateY: onShow.value === 0 ? 0 : Math.max(0, offsetY.value - spotPlayers.value) }] }));
  const threadsHold = useAnimatedStyle(() => ({ transform: [{ translateY: onShow.value === 1 ? 0 : Math.max(0, offsetY.value - spotThreads.value) }] }));
  // The real tab takes each ask as it hears it, so an old one can't come back
  // if the tab is rebuilt later. A picture of the tab sliding in (previewSection)
  // leaves the ask for the real one.
  useEffect(() => {
    const off = subscribeSectionRequest('/discuss', (value) => {
      if (!previewSection) takeAskedSection('/discuss');
      setLocalSection(asSection(value));
    });
    if (!previewSection) { const late = takeAskedSection('/discuss'); if (late) setLocalSection(asSection(late)); }
    return off;
  }, [previewSection]);
  if (!previewSection) reportSection('/discuss', section);
  // The app opens here: the splash curtain stays up over a fresh open until
  // this page has drawn once, then fades (see warmup). A frame after it is
  // built, so the curtain lifts onto the page and never onto a blank.
  useEffect(() => {
    if (previewSection || START_TAB !== '/discuss') return undefined;
    const frame = requestAnimationFrame(() => setStartDrawn(true));
    return () => { cancelAnimationFrame(frame); setStartDrawn(false); };
  }, [previewSection]);
  // The underline under Find Players / Discussions follows the finger.
  const sectionIndex = section === 'players' ? 0 : 1;
  const [tabWidth, setTabWidth] = useState(0);
  const underline = useTabUnderline(sectionIndex, 2, tabWidth);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<TextInput | null>(null);
  /** Out of the search: the box cleared, the keyboard away, the page back at the top (the map). */
  const cancelSearch = () => {
    setSearch('');
    searchInput.current?.blur();
    setSearching(false);
    pageRef.current?.scrollTo({ y: 0, animated: true });
  };
  const location = useLocationToggle();
  // Already sharing your location but never asked who can see you on the
  // map (migration 63; from before it, or an older version of the app): the
  // question comes here, where the app opens, a moment after the page has
  // drawn, once per launch until answered (never over the tutorial). Until
  // then the server shows you to about a kilometre for everyone, as before.
  // Never for a teen (migration 78): they are asked only when they turn
  // Location or "up today" on themselves, and stay hidden until they answer.
  const tourOpen = useTourOpen();
  const askOnLaunch = !previewSection && section === 'players' && !!onboardingComplete && !tourOpen && locationEnabled
    && mapVisibility === null && canChooseVisibility(mapLive, currentUser, teenMap) && !!currentUser && !notKnownAdult(currentUser);
  useEffect(() => {
    if (!askOnLaunch) return undefined;
    const t = setTimeout(() => { if (!isTourOpen()) void askWhoSeesYouOnLaunch('card'); }, 1200);
    return () => clearTimeout(t);
  }, [askOnLaunch]);
  // The account that threads are pulled in under (Reddit) is not a player.
  const myCity = (currentUser?.location ?? '').split(',')[0].trim().toLowerCase();
  const sameCity = (u: (typeof users)[number]) => !!myCity && (u.location ?? '').toLowerCase().startsWith(myCity);
  // Your own city first — the people you could actually hit with this week.
  const players = users
    .filter(u => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle} ${u.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(sameCity(b)) - Number(sameCity(a)));
  // A topic asked for before this tab was built is kept for it, the same as the section.
  const [topic, setTopic] = useState<QuestionTopic | 'all'>(() => asTopic(previewSection ? undefined : askedSection('/discuss#topic')));
  // A topic picked from a thread's label may sit off the end of the strip: the strip slides it into view.
  const topicStrip = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  useEffect(() => { const x = chipX.current[topic]; if (x !== undefined) topicStrip.current?.scrollTo({ x: Math.max(0, x - 16), animated: true }); }, [topic]);
  // A post's category label asks for its topic before opening this tab.
  useEffect(() => {
    const off = subscribeSectionRequest('/discuss#topic', (value) => {
      if (!previewSection) takeAskedSection('/discuss#topic');
      setTopic(asTopic(value));
    });
    if (!previewSection) { const late = takeAskedSection('/discuss#topic'); if (late) setTopic(asTopic(late)); }
    return off;
  }, [previewSection]);


  // How the list is ordered, the way Reddit offers it. New stays the default.
  const [sort, setSort] = useState<'new' | 'hot' | 'top' | 'unanswered'>('new');
  // One centre for everything on Find Players (the map card's dots and count,
  // Courts near you, which hits are near, the court search), so their numbers
  // agree and courts load once: the card's own (liveCentre) with Location on,
  // else your profile's city, else where the phone is.
  const { city: myCityAt } = useMyCity(currentUser);
  const liveLat = location.locationOn ? detectedCoords?.lat : undefined;
  const liveLng = location.locationOn ? detectedCoords?.lng : undefined;
  const liveAt = useMemo(() => (liveLat === undefined || liveLng === undefined ? null : liveCentre({ lat: liveLat, lng: liveLng })), [liveLat, liveLng]);
  const firstCentre = liveAt ?? myCityAt ?? detectedCoords ?? null;
  const nearCourts = useNearCourts(firstCentre);
  // Hits still ahead (or just started), not called off, not from anyone blocked
  // or muted, and only those the teen rule lets you see (as on court pages and the map).
  const seenHits = useMemo(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    return openHitsOf(hitRequests, { blockedIds, mutedIds }).filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId, seeing }));
  }, [hitRequests, users, blockedIds, mutedIds, followingIds, currentUserId, seeing]);
  // Near first (within 25 km, the reach of hit matches), soonest first, with how far:
  // everything that close is near, so today's game beats next week's a mile closer.
  // A place only typed has no spot, so it follows by time when its poster is near (their shared spot,
  // else the same city on their profile; yours always); a typed place from another city waits under "Further away".
  const { openHits, furtherHits } = useMemo(() => {
    if (!firstCentre) return { openHits: seenHits.map((hit) => ({ hit, miles: undefined as number | undefined })), furtherHits: [] };
    const near: { hit: (typeof seenHits)[number]; miles: number | undefined }[] = [];
    const typed: typeof near = [];
    const far: typeof near = [];
    const farTyped: typeof near = [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    for (const hit of seenHits) {
      const spot = hitSpot(hit);
      if (!spot) {
        const seen = lastSeen[hit.authorId];
        const author = usersById.get(hit.authorId);
        // Nothing to tell by (no shared spot, no city on either profile): kept with the near ones, as before.
        const local = hit.authorId === currentUserId
          || (seen ? milesBetween(firstCentre, seen) <= NEAR_HIT_MILES : !author || !myCity || !author.location?.trim() || sameCity(author));
        (local ? typed : farTyped).push({ hit, miles: undefined });
        continue;
      }
      const miles = milesBetween(firstCentre, spot);
      (miles <= NEAR_HIT_MILES ? near : far).push({ hit, miles });
    }
    return { openHits: [...near, ...typed], furtherHits: [...far, ...farTyped] };
  }, [seenHits, firstCentre?.lat, firstCentre?.lng, lastSeen, users, currentUserId, myCity]); // eslint-disable-line react-hooks/exhaustive-deps
  const [furtherOpen, setFurtherOpen] = useState(false);
  const [moreHitsOpen, setMoreHitsOpen] = useState(false);
  const moreHits = Math.max(0, openHits.length - HITS_SHOWN);
  // With nothing open, name a court only when the nearest one reads as public and is close: never just because it is nearest.
  const promptCourt = nearCourts.nearest && looksPublic(nearCourts.nearest.c.name) && nearCourts.nearest.miles <= 5 ? nearCourts.nearest.c : null;
  // "Near you" is one thing on this tab and on the map: people who shared a
  // spot within 30 miles of you (where the phone is, your own last spot, or
  // your profile's city), nearest first, never placed by a typed city.
  const nearFrom = detectedCoords ?? (currentUserId && lastSeen[currentUserId] ? { lat: lastSeen[currentUserId].lat, lng: lastSeen[currentUserId].lng } : null) ?? myCityAt ?? null;
  const nearPlayers = useMemo(() => {
    if (!nearFrom) return [];
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id))
      .flatMap((user) => { const seen = lastSeen[user.id]; if (!seen) return []; const miles = milesBetween(nearFrom, seen); return miles <= IN_TOWN_MILES ? [{ user, miles, seenAt: seen.seenAt, rough: isRoughSpot(seen) }] : []; })
      .sort((a, b) => a.miles - b.miles);
  }, [users, lastSeen, currentUserId, blockedIds, nearFrom?.lat, nearFrom?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  // "New on CourtSide": who joined in the last two weeks, newest first. With
  // the map's round 2 on the database (migration 63) the server decides who
  // (new_on_courtside): known adults, 16 and 17 year olds with public
  // accounts, and anyone you already follow; never under 16. Before it, the
  // phone works it out the old way: known adults and people you follow, so a
  // teen is never put in front of adult strangers with a one-tap Follow; a
  // teen viewer sees only the people they follow. Either way, nobody already
  // listed under Near you.
  const [newOpen, setNewOpen] = useState(false);
  const { loadNewOnCourtside } = actions;
  const usersIn = users.length > 0;
  useEffect(() => { if (currentUserId && usersIn) void loadNewOnCourtside(); }, [currentUserId, mapLive, usersIn, followingIds.length, loadNewOnCourtside]);
  const newPlayers = useMemo(() => {
    const near = new Set(nearPlayers.map((p) => p.user.id));
    if (newOnCourtside) {
      const byId = new Map(users.map((u) => [u.id, u]));
      return newOnCourtside.flatMap((r) => { const u = byId.get(r.userId); return u && !near.has(u.id) && !blockedIds.includes(u.id) ? [u] : []; });
    }
    const viewerAdult = !!currentUser && !notKnownAdult(currentUser);
    const since = Date.now() - NEW_DAYS * 86_400_000;
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && !near.has(u.id) && Date.parse(u.joinedAt) >= since)
      // (Since migration 64 nobody's age but your own reaches the phone: then only people you follow.)
      .filter((u) => followingIds.includes(u.id) || (viewerAdult && ageSaysAdult(u)))
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  }, [users, currentUser, currentUserId, blockedIds, followingIds, nearPlayers, newOnCourtside, ageSaysAdult]);
  // "Who's up today": from the map's own pins only, measured from where you
  // are (the phone's fix, or your own last spot), never from a profile's city.
  const ownSpot = detectedCoords ?? (currentUserId && lastSeen[currentUserId] ? { lat: lastSeen[currentUserId].lat, lng: lastSeen[currentUserId].lng } : null);
  const upToday = useUpToday({ users, lastSeen, me: currentUserId, from: ownSpot, blockedIds });
  // A teen (migration 78) has it too: only friends who follow each other with
  // them are in it, and only those friends see theirs. Never under 16.
  const teen = onTeenMap(currentUser, teenMap);
  const showUpToday = !!currentUser && (!notKnownAdult(currentUser) || teen);
  const toggleOpen = useOpenToHitToggle();
  // Nobody sharing a spot within 30 miles (once the spots have come down): the map fills up with the people you already play with.
  // Only somewhere we know: with no spot and no city, "early here" would be a guess.
  // Only for a known adult: a teen sees only friends who follow each other
  // with them (migration 78; before it, nobody), so an empty list says nothing
  // about the town for them.
  const early = !!currentUser && !notKnownAdult(currentUser) && !!nearFrom && (lastSeenLoaded || !isSupabaseConfigured) && nearPlayers.length === 0;
  const myCityName = (currentUser?.location ?? '').split(',')[0].trim() || null;
  // The court the invite carries: one you follow in town, else the nearest
  // that reads as public, else the first public one Courts near you lists
  // (a bigger park when two are about as near; never a club or someone's
  // own court, and none that is members only). Never for a teen: a poster or link naming where
  // a teen plays would put their court in front of strangers.
  const inviteCourt = useMemo(() => {
    if (!currentUser || notKnownAdult(currentUser)) return null;
    // A court with a name only: "Hit with me at Tennis courts" tells a friend nothing.
    const mine = followedCourts?.find((c) => !isClosedCourt(c) && !!c.name && c.name !== 'Tennis courts' && (!firstCentre || milesBetween(firstCentre, c) <= IN_TOWN_MILES));
    if (mine?.name) return { id: mine.courtId, name: mine.name, lat: mine.lat, lng: mine.lng };
    const c = promptCourt ?? nearCourts.rows.find((r) => looksPublic(r.c.name) && r.miles <= IN_TOWN_MILES)?.c ?? null;
    return c ? { id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng } : null;
  }, [currentUser, followedCourts, promptCourt, nearCourts.rows, firstCentre?.lat, firstCentre?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  // Joined through a link that carried a court: its page, once, as soon as you are in.
  useEffect(() => {
    if (previewSection || !currentUserId || !onboardingComplete) return;
    let on = true;
    void takeInviteCourt().then((court) => { if (on && court) openCourt(court); });
    return () => { on = false; };
  }, [previewSection, currentUserId, onboardingComplete]);
  const followRow = (id: string) => {
    const who = users.find((u) => u.id === id);
    if (who && followingIds.includes(id)) confirmUnfollow(who, () => actions.toggleFollow(id));
    else actions.toggleFollow(id);
  };
  // Typing two letters or more finds courts too, above the players.
  const courtMatches = useCourtSearch(search, firstCentre, nearCourts.all, 4);
  // And places (a city, a neighbourhood, an address, a park), leaning toward
  // your town (only ever a rough area is sent): a tap opens the full map
  // there, with that place's courts listed best first.
  const placeSearch = usePlaceSearch(search, firstCentre, 3);
  const placeMatches = useMemo(() => {
    // A place that is one of the courts listed is already there, as the court.
    const courtNames = new Set(courtMatches.map(({ c }) => plain(labelOf(c))));
    return placeSearch.places.filter((p) => !courtNames.has(plain(p.title)));
  }, [placeSearch.places, courtMatches]);
  const openPlace = (p: FoundPlace) => {
    handPlace(p);
    router.push({ pathname: '/map', params: { place: '1' } });
  };
  const searchWords = useMemo(() => plain(search).split(' ').filter(Boolean), [search]);
  const [sortOpen, setSortOpen] = useState(false);
  // Android's Back on the page the app opens on: out of a search first (the
  // keyboard goes on the first Back by itself, the search on the next, as
  // Cancel does), then the sort menu, then from Discussions to Find Players.
  // Only then does it leave the app. Not for a picture of this tab sliding in.
  useAndroidBack(() => {
    if (search || searching) { cancelSearch(); return true; }
    if (sortOpen) { setSortOpen(false); return true; }
    if (section !== 'players') { setSection('players'); return true; }
    return false;
  }, !previewSection);
  const [shownCount, setShownCount] = useState(25);
  const visible = useMemo(() => {
    // Nobody you have blocked or muted shows up here, the same as in the feed.
    let list = questions.filter((q) => !blockedIds.includes(q.authorId) && !mutedIds.includes(q.authorId));
    if (topic !== 'all') list = list.filter((q) => q.topic === topic);

    const newest = (a: typeof list[number], b: typeof list[number]) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (sort === 'unanswered') list = list.filter((q) => q.answerIds.length === 0);
    if (sort === 'top') list.sort((a, b) => b.votes - a.votes || b.answerIds.length - a.answerIds.length || newest(a, b));
    else if (sort === 'hot') {
      // Votes and replies, pulled down by age: a lively thread from today beats a quiet one from last month.
      const heat = (q: typeof list[number]) => (q.votes + 2 * q.answerIds.length + 1) / Math.pow((Date.now() - Date.parse(q.createdAt)) / 3_600_000 + 2, 1.5);
      list.sort((a, b) => heat(b) - heat(a));
    } else list.sort(newest);
    return list;
  }, [questions, topic, blockedIds, mutedIds, sort]);
  // A long list is drawn in slices: the first screenfuls at once, the rest on request.
  const slice = visible.slice(0, shownCount);

  // Where to play: the courts you follow, with what is new at each, then the others in town, each a tap from its page.
  const yourCourts = <YourCourts from={firstCentre} />;
  const courtsBlock = <CourtsNear center={firstCentre} />;
  const content = (section:string) => (section === 'players' ? <View style={{ gap: 16 }}>
        {/* Cancel beside the box while you search, the way iPhone search boxes do: one tap clears it, puts the keyboard away and brings the map back (Oct 5, owner: "there should be an easier way to exit here"). */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={17} color={colors.textFaint} style={styles.searchIcon} />
            <TextInput ref={searchInput} accessibilityLabel="Search players, courts or places" placeholder="Search players, courts or places" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} returnKeyType="search" style={[styles.search, search ? styles.searchWithClear : null]} />
            {search ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setSearch('')} style={styles.searchClear}>
                <Ionicons name="close-circle" size={18} color={colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
          {searching || search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel search" hitSlop={8} onPress={cancelSearch}>
              <Text style={styles.searchCancel}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
        {currentUser && !search ? (section === 'players'
          ? <NearbyMap me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onOpen={id => router.push(`/user/${id}`)} onExpand={() => router.push('/map')} />
          // The same footprint, empty: keeps the list from jumping when the map mounts on arrival.
          : <View style={styles.mapStandIn} />) : null}
        {/* Who's up today: you first (one tap, never Location), then who near you is up for a hit. */}
        {currentUser && !search && showUpToday ? <UpToday me={currentUser} people={upToday} teen={teen} locationOn={location.locationOn} onLocation={ownSpot ? undefined : location.toggle} onToggle={(on) => { void toggleOpen(on); }} /> : null}
        {/* Nobody sharing a spot within 30 miles: the way to fill the map, right under it. */}
        {!search && early ? <EarlyInvite city={myCityName} court={inviteCourt} /> : null}
        {/* A quiet area leads with where to play (your courts, then the others
            near you); once it has open hits, they come first, and Your courts
            follows them, since its "Hit today" badges repeat those cards. */}
        {!search && !openHits.length ? yourCourts : null}
        {!search && !openHits.length ? courtsBlock : null}
        {/* Hits: someone wants a game, near you first. Posting one is right here. */}
        {!search ? (
          <View style={styles.hits}>
            <View style={styles.hitsHead}>
              <Text style={styles.playersTitle}>Open hits</Text>
              <View style={styles.hitsLinks}>
                {/* "Post a hit", not just "Post": a post elsewhere is a photo or clip. */}
                <Pressable accessibilityRole="button" onPress={() => router.push('/hit-request/new')} hitSlop={8}><Text style={styles.postHit}>Post a hit</Text></Pressable>
              </View>
            </View>
            {openHits.length ? (moreHitsOpen ? openHits : openHits.slice(0, HITS_SHOWN)).map(({ hit, miles }) => <HitCard key={hit.id} hit={hit} miles={miles} />) : promptCourt ? (
              <Pressable accessibilityRole="button" onPress={() => playHere({ id: promptCourt.id, name: labelOf(promptCourt), lat: promptCourt.lat, lng: promptCourt.lng })} style={styles.hitPrompt}>
                <View style={styles.hitPromptTile}><HitGlyph size={24} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hitPromptTitle}>Post the first hit at {labelOf(promptCourt)}</Text>
                  <Text style={styles.hitPromptBody}>Say when. Players nearby can join.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => router.push('/hit-request/new')} style={styles.hitPrompt}>
                <View style={styles.hitPromptTile}><HitGlyph size={24} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hitPromptTitle}>Looking for someone to play?</Text>
                  <Text style={styles.hitPromptBody}>Say when and where. Players nearby can join.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </Pressable>
            )}
            {moreHits ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreHitsOpen }} onPress={() => setMoreHitsOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: 0.6 }]}>
                <Text style={styles.furtherText}>{moreHitsOpen ? 'Fewer open hits' : `More open hits (${moreHits})`}</Text>
                <Ionicons name={moreHitsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {furtherHits.length ? (
              <>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: furtherOpen }} onPress={() => setFurtherOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: 0.6 }]}>
                  <Text style={styles.furtherText}>Further away ({furtherHits.length})</Text>
                  <Ionicons name={furtherOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </Pressable>
                {furtherOpen ? furtherHits.map(({ hit, miles }) => <HitCard key={hit.id} hit={hit} miles={miles} />) : null}
              </>
            ) : null}
          </View>
        ) : null}
        {!search && openHits.length ? yourCourts : null}
        {!search && openHits.length ? courtsBlock : null}
        {/* Courts by name, above the players, once two letters are typed. */}
        {search && courtMatches.length ? (
          <View>
            <View style={styles.playersHead}>
              <Text style={styles.playersTitle}>Courts</Text>
              <Text style={styles.playersBody}>{`${courtMatches.length} ${courtMatches.length === 1 ? 'match' : 'matches'}`}</Text>
            </View>
            {courtMatches.map(({ c, miles }, index) => {
              const meta = [firstCentre ? formatMiles(miles) : null, c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
              return (
                <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`${labelOf(c)}${meta ? `, ${meta}` : ''}, open the court`} onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                  <View style={styles.courtTile}><CourtGlyph size={20} color={colors.brand} /></View>
                  <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
                    <Highlighted text={labelOf(c)} words={searchWords} style={styles.playerName} strong={styles.courtNameMatch} lines={2} wordStart />
                    {meta ? <Text style={styles.playerMeta} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {/* Places by name, under the courts: a city, an address or a park, each opening the map there. */}
        {search.trim() && placeMatches.length ? (
          <View>
            <View style={styles.playersHead}>
              <Text style={styles.playersTitle}>Places</Text>
              <Text style={styles.playersBody}>{placeSearch.failed ? 'Search isn’t working right now' : 'See the courts there on the map'}</Text>
            </View>
            {placeMatches.map((p, index) => (
              <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`${p.title}${p.sub ? `, ${p.sub}` : ''}, see its courts on the map`} onPress={() => openPlace(p)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <View style={styles.placeTile}><Ionicons name={p.kind === 'area' ? 'map-outline' : 'location-outline'} size={20} color={colors.textMuted} /></View>
                <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
                  <Highlighted text={p.title} words={searchWords} style={styles.playerName} strong={styles.courtNameMatch} lines={1} wordStart />
                  {p.sub ? <Text style={styles.playerMeta} numberOfLines={1}>{p.sub}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {search && (players.length || courtMatches.length || placeMatches.length) ? <View style={styles.playersHead}>
          <Text style={styles.playersTitle}>Players</Text>
          {/* A court matched but no one did: one quiet line, not a big empty state under the court that was found. */}
          <Text style={styles.playersBody}>{players.length ? `${players.length} ${players.length === 1 ? 'match' : 'matches'}` : `No players named “${search.trim()}”`}</Text>
        </View> : null}
        {search ? players.map((user, index) => <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
          <Avatar name={user.name} seed={user.avatarSeed} size={52} ring={user.isCoach} />
          <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
            <View style={styles.playerTop}><Text style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
            <Text style={styles.playerMeta} numberOfLines={1}>@{user.handle} · {user.location}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
        </Pressable>) : null}
        {search && !players.length && !courtMatches.length && !placeMatches.length && !placeSearch.searching ? <EmptyState title={`Nothing matches “${search.trim()}”`} body={placeSearch.failed ? 'Places can’t be searched right now. Try a player’s or a court’s name.' : 'No players, courts or places found. Try a name, a city or a park.'} /> : null}
        {/* Near you: who shared a spot within 30 miles, the same "near" as the map. */}
        {!search && nearPlayers.length ? (
          <View>
            <View style={styles.playersHead}>
              <Text style={styles.playersTitle}>Near you</Text>
              <Text style={styles.playersBody}>Shared their spot within 30 miles</Text>
            </View>
            {nearPlayers.map(({ user, miles, seenAt, rough }, index) => (
              <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, ${formatSpotMiles(miles, rough)}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
                <View style={[styles.playerBody, styles.playerFollowBody, index > 0 && styles.playerLine]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.playerTop}><Text style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text style={styles.playerMeta} numberOfLines={1}>{[formatSpotMiles(miles, rough), seenAt ? agoLabel(seenAt) : null, isOpenToHitNow(user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => followRow(user.id)} name={user.name.split(' ')[0]} />
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {/* New on CourtSide: who joined in the last two weeks (adults, and people you already follow), with Follow in one tap. */}
        {!search && newPlayers.length ? (
          <View>
            <View style={styles.playersHead}>
              <Text style={styles.playersTitle}>New on CourtSide</Text>
              <Text style={styles.playersBody}>Joined in the last two weeks</Text>
            </View>
            {(newOpen ? newPlayers : newPlayers.slice(0, NEW_SHOWN)).map((user, index) => (
              <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, ${joinedLabel(user.joinedAt).toLowerCase()}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
                <View style={[styles.playerBody, styles.playerFollowBody, index > 0 && styles.playerLine]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.playerTop}><Text style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text style={styles.playerMeta} numberOfLines={1}>{[joinedLabel(user.joinedAt), user.location.split(',')[0] || null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <FollowPill small following={followingIds.includes(user.id)} userId={user.id} onPress={() => followRow(user.id)} name={user.name.split(' ')[0]} />
                </View>
              </Pressable>
            ))}
            {newPlayers.length > NEW_SHOWN ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: newOpen }} onPress={() => setNewOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: 0.6 }]}>
                <Text style={styles.furtherText}>{newOpen ? 'Fewer' : `Show all (${newPlayers.length})`}</Text>
                <Ionicons name={newOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View> : <>
      <View style={styles.controls}>
        <ScrollView ref={topicStrip} nativeID="topic-filter-strip" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
          {TOPICS.map((t) => (
            // The picked topic is filled in the section's own colour, so it is plain which one is on.
            <View key={t} onLayout={(e) => { chipX.current[t] = e.nativeEvent.layout.x; }}>
              <Chip
                label={t === 'all' ? 'All' : t === 'injury' ? 'Injuries' : t.charAt(0).toUpperCase() + t.slice(1)}
                selected={topic === t}
                tint={colors.text}
                ink={colors.brandInk}
                onPress={() => setTopic(t)}
                small
              />
            </View>
          ))}
        </ScrollView>
        {/* One quiet line under the topics: how many threads, and a single Sort button, the way Reddit does it. */}
        <View style={styles.sortRow}>
          <Text style={styles.sortCount}>{visible.length === 1 ? '1 thread' : `${visible.length} threads`}</Text>
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`} accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen((o) => !o)} hitSlop={8} style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.7 }]}>
              <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
              <Text style={styles.sortButtonText}>{SORT_LABEL[sort]}</Text>
              <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
            </Pressable>
            {sortOpen ? (
              <View style={styles.sortMenu}>
                {(['new', 'hot', 'top', 'unanswered'] as const).map((key, i) => (
                  <Pressable key={key} accessibilityRole="menuitem" accessibilityState={{ selected: sort === key }} onPress={() => { setSort(key); setSortOpen(false); }} style={({ pressed }) => [styles.sortItem, i > 0 && styles.sortItemLine, pressed && { backgroundColor: colors.bgElevated }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[styles.sortItemTitle, sort === key && { color: colors.brand }]}>{SORT_LABEL[key]}</Text>
                      <Text style={styles.sortItemBody}>{SORT_HINT[key]}</Text>
                    </View>
                    {sort === key ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="help-circle-outline"
          title="No questions here"
          body="Be the first to ask. Specific questions get specific answers."
        />
      ) : (
        <View style={styles.list}>
          {slice.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              author={users.find((u) => u.id === q.authorId)}
              answered={Boolean(q.acceptedAnswerId)}
              saved={saved.questionIds.includes(q.id)}
              onToggleSave={() => actions.toggleSaveQuestion(q.id)}
              onShare={() => router.push(`/share?kind=question&id=${q.id}`)}
              onPress={() => router.push(`/question/${q.id}`)}
            />
          ))}
          {visible.length > slice.length ? (
            <Pressable accessibilityRole="button" onPress={() => setShownCount((n) => n + 25)} style={styles.more}>
              <Text style={styles.moreText}>Show more threads</Text>
            </Pressable>
          ) : null}
          <Text style={styles.end}>
            {visible.length} {visible.length === 1 ? 'thread' : 'threads'}
          </Text>
        </View>
      )}
      </>);

  return (
    <Screen memoryKey="discuss" scrollRef={pageRef} offsetY={offsetY} wash onRefresh={previewSection === undefined && !isDesktopBrowser() ? actions.refresh : undefined}
      title="Community"
      right={
        // Bell, chats, search: the same order as Profile (bell, chats, then the page's own button), so both pages match.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          {/* What's new for you (likes, follows, replies), on the page the app opens on. */}
          <NotificationButton size={25} />
          {/* Your chats. Pulled out by its padding so the icons sit evenly spaced. */}
          <InboxButton size={27} />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Search discussions and players"
            // From Find Players the search opens on players; from Discussions on everything.
            onPress={() => router.push(section === 'players' ? { pathname: '/search', params: { scope: 'players' } } : '/search')}
            hitSlop={8}
          >
            <Ionicons name="search" size={23} color={colors.text} />
          </Pressable>
        </View>
      }
    >
      <View style={styles.sections} onLayout={e => setTabWidth(e.nativeEvent.layout.width / 2)}>
        {(['players', 'discussions'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)} style={styles.section}><Text style={{ ...typography.bodyStrong, fontSize: 16, color: section === value ? colors.text : colors.textMuted }}>{value === 'discussions' ? 'Discussions' : 'Find Players'}</Text></Pressable>)}
        {tabWidth > 0 && <Reanimated.View pointerEvents="none" style={[styles.sectionUnderline, { width: tabWidth }, underline.style]} />}
      </View>
      {/* Find Players on the left, Discussions on the right. Community is the
          strip's first tab, so a swipe right from Find Players only gives a
          little at the edge; a swipe left from Discussions goes on to Home. */}
      <SectionPager
        index={sectionIndex}
        panes={[<Reanimated.View key="players" style={playersHold}>{content('players')}</Reanimated.View>, <Reanimated.View key="discussions" style={threadsHold}>{content('discussions')}</Reanimated.View>]}
        progress={underline.progress}
        depth={1}
        delegateLeft
        delegateRight
        // Out to the screen's edges, so a pane slides off the edge of the screen.
        bleed={spacing.lg}
        // The tutorial's slide from the map to the threads plays here, as this pager's own swipe.
        slideChannel={previewSection ? undefined : '/discuss'}
        onIndex={(i) => setSection(i === 0 ? 'players' : 'discussions')}
      />
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  hits: { gap: spacing.md },
  hitsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  hitsLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  // One quiet line that opens more hits: the rest of the near ones, or those beyond 25 km.
  further: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  furtherText: { ...typography.smallStrong, color: colors.textMuted },
  // A court found by the search: the same tile as Search's court rows, in the players' row frame.
  courtTile: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // A place found by the search: the court tile's frame, in the quiet surface colour, so places and courts read apart.
  placeTile: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  courtNameMatch: { ...font('700'), color: colors.text },
  postHit: { ...typography.smallStrong, color: colors.brand },
  hitPrompt: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  // The empty state's tile: the icon on Dim Green, the way the app's feature cards hold the mark.
  hitPromptTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  hitPromptTitle: { ...typography.bodyStrong, color: colors.text },
  hitPromptBody: { ...typography.small, color: colors.textMuted },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 },
  sortCount: { ...typography.small, color: colors.textFaint },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  sortButtonText: { ...typography.smallStrong, color: colors.textMuted },
  sortMenu: { ...lift, position: 'absolute', top: 36, right: 0, width: 240, borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', zIndex: 10 },
  sortItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 11 },
  sortItemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sortItemTitle: { ...typography.smallStrong, color: colors.text },
  sortItemBody: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  sections: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 16 },
  more: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  moreText: { ...typography.smallStrong, color: colors.text },
  section: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  sectionUnderline: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.brand, borderRadius: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  searchWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchWithClear: { paddingRight: 40 },
  searchClear: { position: 'absolute', right: 14 },
  searchCancel: { fontSize: 16, ...font('600'), color: colors.brand },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: { ...typography.body, fontSize: 16, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingLeft: 42, paddingRight: spacing.lg, paddingVertical: 12, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  mapStandIn: { height: 330, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  playersHead: { gap: 3, paddingTop: spacing.sm },
  playersTitle: { ...typography.title, color: colors.text },
  playersBody: { ...typography.small, color: colors.textMuted },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: -spacing.lg, paddingLeft: spacing.lg },
  playerPressed: { backgroundColor: colors.bgElevated },
  playerBody: { flex: 1, gap: 4, minWidth: 0, paddingVertical: 14 },
  playerLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  playerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playerName: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  playerMeta: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  near: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  nearText: { ...typography.caption, fontSize: 11, color: colors.brand, letterSpacing: 0 },
  playerChevron: { marginRight: spacing.lg },
  // A row with Follow at its end: the words take the room, the pill keeps the page's right margin.
  playerFollowBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.lg },
  // Above the list, so the Sort menu opens over the threads rather than under them.
  controls: { gap: spacing.md, paddingBottom: spacing.lg, zIndex: 10, elevation: 10 },
  topicRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8 },
  list: { gap: spacing.md },
  end: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
});

export default asTabRoute<{ previewSection?: string }>(Discuss);
