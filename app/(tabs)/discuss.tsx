import { PRESS_DIM } from '@/theme/press';
import { asTabRoute, useOnShowNow } from '@/features/navigation/tabFocus';
import { SectionPager } from '@/components/SectionPager';
import { PULL_GAP } from '@/lib/pullRefresh';
import Reanimated, { Easing, FadeIn, FadeOut, interpolateColor, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Fold, FoldList, Pop } from '@/components/ui/Fold';
import { useRestKey } from '@/components/ui/restMotion';
import * as haptics from '@/lib/haptics';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { PaneScroller } from '@/components/ui/PaneScroller';
import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { useTabUnderline } from '@/features/navigation/useTabUnderline';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { slidePagesTo } from '@/features/navigation/pageSlide';
import { pressV2On } from '@/features/navigation/pressV2';
import { Platform, ScrollView, TextInput, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TextBox } from '@/components/ui/TextBox';
import { router } from 'expo-router';

import Ionicons from '@expo/vector-icons/Ionicons';
import { InboxButton, NotificationButton } from '@/components/InboxButton';

import { LevelPill } from '@/components/LevelPill';
import { NearbyMap } from '@/components/NearbyMap';
import { GuestFindPlayers } from '@/features/guest/GuestFindPlayers';
import { GuestSignIn } from '@/features/guest/GuestSignIn';
import { UpToday, useUpToday } from '@/components/UpToday';
import { PostHitField } from '@/components/PostHitField';
import { useCheckIn, useLocationToggle, useOpenToHitToggle } from '@/features/players/useLocationToggle';
import { QuestionCard, TOPIC_META } from '@/components/QuestionCard';
import { QUESTION_OF_WEEK_MS } from '@/data/api';
import { HitCard } from '@/components/HitCard';
import { Avatar, Chip, EmptyState, Screen } from '@/components/ui';
import { QuestionListSkeleton } from '@/components/Skeleton';
import { Highlighted } from '@/components/CourtSearch';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { SurfaceLine, surfaceSaid } from '@/components/place/SurfaceTag';
import { CourtsNear, useNearCourts, usePeekLook } from '@/components/place/CourtsNear';
import { CARD_HEIGHT } from '@/components/map/cardFit';
import { CourtsNearSnapshots } from '@/components/place/CourtsNearPeek';
import { YourCourts } from '@/components/place/YourCourts';
import { EarlyInvite } from '@/components/EarlyInvite';
import { MutualsInline, MutualsSheet } from '@/features/mutuals/MutualsCard';
import { mutualsMock } from '@/features/mutuals/mutualsMock';
import { FollowBackBanner, FollowBackMeet, FollowBackRow, MutualsEmptyCard, MutualsSheetCalm } from '@/features/mutuals/MutualsV2';
import { CityBoardPreview } from '@/components/CityBoardPreview';
import { useCityBoard, useCityPage } from '@/features/cityBoard/useCityBoard';
import { useCityFill } from '@/features/cityBoard/fill';
import { FollowPill } from '@/components/FollowPill';
import { takeInviteCourt } from '@/features/invite/referral';
import { useInviteCourt } from '@/features/invite/useInviteCourt';
import { notKnownAdult } from '@/features/players/age';
import { canChooseVisibility, onTeenMap } from '@/features/players/mapPrivacy';
import { isTourOpen, useTourOpen, useTourTarget } from '@/features/tour/tourStore';
import { setMapLead, type MapLead } from '@/features/tour/mapLead';
import { IN_TOWN_MILES, measureFrom } from '@/features/players/mapModel';
import { agoLabel } from '@/components/map/markers';
import { confirmUnfollow } from '@/lib/confirm';
import { NEAR_HIT_MILES, canSeeHitAt, hitSpot, openHits as openHitsOf } from '@/features/hits/visible';
import { hitArea } from '@/features/hits/flexible';
import { hitListOrder, isMyHit } from '@/features/hits/order';
import { hitTipCard, useJustPosted } from '@/features/hits/hitTips';
import { labelOf, looksPublic } from '@/features/places/courtName';
import { useCourtSearch } from '@/features/places/useCourtSearch';
import { handPlace, type FoundPlace } from '@/features/places/geocode';
import { usePlaceSearch } from '@/features/places/usePlaceSearch';
import { openCourt, playHere } from '@/features/players/courtLink';
import { formatMiles, formatSpotMiles, milesBetween, spotMilesKey } from '@/features/players/geo';
import { isRoughSpot, placeFor } from '@/features/players/positions';
import { nearestPlace } from '@/data/locations';
import { useMyCity } from '@/features/players/useMyCity';
import { useTownPlayers } from '@/features/players/nearMe';
import { useFindable } from '@/features/people/findable';
import { isOpenToHit as isOpenToHitNow } from '@/features/players/openToHit';
import { plain } from '@/features/search/words';
import { askedSection, reportSection, subscribeSectionRequest, takeAskedSection } from '@/features/navigation/swipeOrder';
import { START_SECTION, START_TAB } from '@/features/navigation/startTab';
import { setStartDrawn, useOpenSettled } from '@/features/feed/warmup';
import { FirstReveal } from '@/features/feed/FirstReveal';
import { useApp } from '@/store/AppContext';
import { useAndroidBack } from '@/lib/androidBack';
import type { QuestionTopic } from '@/data/types';
import { TextScale, colors, oneLine, radius, spacing, typography, font, lift, useLargeText, buttonShape } from '@/theme';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { isSupabaseConfigured } from '@/lib/supabase';
import { LESS_AI, LESS_AI_ROUND2, LESS_AI_DISCUSS, LESS_AI_COURTS, corner, inputCorner } from '@/theme/look';

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
/**
 * "Further away" stops here (Oct 5): a player in Boise was offered a hit in
 * Raleigh, about 2,000 miles off. Beyond it a hit is still on the full map,
 * for anyone who goes looking there.
 */
const FURTHER_MILES = 100;
/** "New on CourtSide": joined this recently. */
const NEW_DAYS = 14;
/** New players shown before "Show more". */
const NEW_SHOWN = 6;
/** Keys for the folding lists (FoldList): a hit by its id, a player by theirs. */
const hitKey = (x: { hit: { id: string } }) => x.hit.id;
const userKey = (u: { id: string }) => u.id;
/** A Near you row listed by its town (nearMe), keyed by the player. */
const townRowKey = (t: { user: { id: string } }) => t.user.id;
const NO_HITS: never[] = [];
const SORT_HINT = { new: 'Newest first', hot: 'Busiest right now', top: 'Most upvoted', unanswered: 'Nobody has replied yet' } as const;
/** "Joined 3 days ago", for New on CourtSide. */
const joinedLabel = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'Joined today' : days === 1 ? 'Joined yesterday' : `Joined ${days} days ago`;
};

function Discuss({ previewSection }: { previewSection?: string } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  const { questions, users, currentUserId, currentUser, blockedIds, mutedIds, followingIds, saved, actions, detectedCoords, locationEnabled, hitRequests, lastSeen, lastSeenLoaded, onboardingComplete, mapLive, newOnCourtside, mapVisibility, teenMap, seeing, ageSaysAdult, isGuest, guestLoaded, pinnedQuestion, remoteLoaded } = useApp();
  // The section lives here, not in the address: listening to the address made
  // this whole tab re-render on every route change anywhere in the app.
  // Other pages ask for a section through requestSection before navigating;
  // the bar asks for Find Players whenever it brings you here from somewhere
  // else (askForCommunityMap), and a swipe from the Feed for Discussions.
  // It starts on Find Players: the app opens here, on the map (see startTab).
  // Unless a page asked for a section before this tab was built (a thread
  // opened from a link, then swiped back): that ask was kept for it.
  // Design mock (?mutuals=a|b, demo build only): the rare "Add your friends" card. Shown every time
  // here so it can be looked at; the rule for how often it may come up is in mutualsMock.ts.
  const mutualsLook = previewSection ? null : mutualsMock();
  const mutualsSheet = mutualsLook === 'a' || mutualsLook === 'a1';
  const [mutualsOpen, setMutualsOpen] = useState(!!mutualsLook && !mutualsSheet);
  useEffect(() => {
    if (!mutualsSheet) return;
    const t = setTimeout(() => setMutualsOpen(true), 1200);
    return () => clearTimeout(t);
  }, [mutualsSheet]);
  const [localSection, setLocalSection] = useState<Section>(() => asSection((!previewSection && askedSection('/discuss')) || START_SECTION));
  const section = previewSection ? asSection(previewSection) : localSection;
  // A section asked for out of sight whose redraw is still on its way (background work, below):
  // the row and the line are already on it, so a tap reads it as the section on show.
  const comingSection = useRef<Section | null>(null);
  if (comingSection.current === localSection) comingSection.current = null;
  // Held locally only: pushing it into the address on every swipe made the
  // whole app re-render mid-gesture.
  const setSection = (value: string) => { comingSection.current = null; setLocalSection(asSection(value)); };
  // A tab tapped in the row. In a phone-width browser it plays the swipe's own
  // slide, the pages gliding sideways with the line, as the phone's pager does
  // (the browser's pager otherwise flips at once); on a computer it flips.
  const tapSection = (value: Section) => {
    if (value === (comingSection.current ?? section)) return;
    if (Platform.OS === 'web' && isPhone && !previewSection) { slidePagesTo('/discuss', { pathname: '/discuss', section: value }); return; }
    setSection(value);
  };
  // Each section is a page of its own, with its own scroller and its own place
  // (Oct 4, owner: leaving the map halfway down no longer drops you halfway
  // down the threads), side by side under a row that stays put. A swipe or a
  // tab tap moves only the two pages sideways and the line under the row:
  // nothing is held, moved or clipped on landing (Oct 22, owner: "It should be
  // a smooth swipe. Nothing framing in or out").
  const playersRef = useRef<ScrollView | null>(null);
  const threadsRef = useRef<ScrollView | null>(null);
  const playersY = useSharedValue(0);
  const threadsY = useSharedValue(0);
  // Whether each section sits in its pull strip (a pull held open): no section swipe starts then.
  const playersStrip = useSharedValue(false);
  const threadsStrip = useSharedValue(false);
  const shownIndex = useSharedValue(section === 'players' ? 0 : 1);
  const swipeBlocked = useSharedValue(false);
  useAnimatedReaction(() => (shownIndex.value === 0 ? playersStrip.value : threadsStrip.value), (held) => { swipeBlocked.value = held; });
  // Pull down on either section to refresh (never in a picture of this tab, nor on a computer).
  const { loadPinnedQuestion, refresh: refreshApp } = actions;
  const refreshPage = useCallback(() => { void loadPinnedQuestion(); return refreshApp(); }, [loadPinnedQuestion, refreshApp]);
  const refresh = previewSection === undefined && !isDesktopBrowser() ? refreshPage : undefined;
  // The page's top is below 0 by the pull strip on the phone; scrolling to 0 opened the strip and set a refresh going (Oct 4).
  const pageTop = Platform.OS !== 'web' && refresh ? PULL_GAP : 0;
  const { isPhone } = useResponsive();
  // The real tab takes each ask as it hears it, so an old one can't come back
  // if the tab is rebuilt later. A picture of the tab sliding in (previewSection)
  // leaves the ask for the real one.
  const onShowNow = useOnShowNow();
  // Filled in below, once the line and the pager are made.
  const jumpLine = useRef<((pane: number) => void) | null>(null);
  const jumpPages = useRef<((pane: number) => void) | null>(null);
  useEffect(() => {
    const off = subscribeSectionRequest('/discuss', (value, background) => {
      if (!previewSection) takeAskedSection('/discuss');
      const next = asSection(value);
      // Asked while this tab is out of sight (put back on Discussions once left, or the bar asking
      // for Find Players on its way here): the line and the pages are set straight there, so they
      // are in place as the page shows, never gliding across after Community has slid in (Oct 25
      // audit: every bar tap to Community slid the line from Discussions to Find Players).
      const outOfSight = !previewSection && !onShowNow();
      if (outOfSight) {
        jumpLine.current?.(next === 'players' ? 0 : 1);
        jumpPages.current?.(next === 'players' ? 0 : 1);
      }
      // This whole tab is redrawn for it. Out of sight, as background work, so a tap goes first: the
      // bar's tab lights and the row sets off without waiting for all of Community (Oct 25 audit:
      // 94-258 ms). On the phone the row and the line are already there (above); a browser draws
      // its pages by the section itself, so there only the put-back waits. A later ask still wins.
      // With the quicker press feel only (pressV2: admins first); otherwise at once, as before.
      if ((background || (outOfSight && Platform.OS !== 'web')) && pressV2On()) {
        comingSection.current = next;
        startTransition(() => setLocalSection(next));
      } else {
        comingSection.current = null;
        setLocalSection(next);
      }
    });
    if (!previewSection) { const late = takeAskedSection('/discuss'); if (late) setLocalSection(asSection(late)); }
    return off;
  }, [previewSection]);
  if (!previewSection) reportSection('/discuss', section);
  useEffect(() => { shownIndex.value = section === 'players' ? 0 : 1; }, [section, shownIndex]);
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
  jumpLine.current = underline.jump;
  // The two words take their colour from where the line is, so they change with it as it moves
  // rather than snapping on landing. The theme's own two tones only (every court theme).
  // Any of Find Players in view: where the row actually is (under a finger, mid-glide), not the section
  // picked, which only changes once a swipe has landed. Asked by the map card as its map finishes drawing.
  const { base: lineBase, progress: lineProgress } = underline;
  const mapInView = useCallback(() => lineBase.value + lineProgress.value < 0.99, [lineBase, lineProgress]);
  const textOn = colors.text;
  const textOff = colors.textMuted;
  const playersWord = useAnimatedStyle(() => {
    const at = Math.max(0, Math.min(1, lineBase.value + lineProgress.value));
    return { color: interpolateColor(at, [0, 1], [textOn, textOff]) };
  });
  const threadsWord = useAnimatedStyle(() => {
    const at = Math.max(0, Math.min(1, lineBase.value + lineProgress.value));
    return { color: interpolateColor(at, [0, 1], [textOff, textOn]) };
  });
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<TextInput | null>(null);
  // At a large phone text size the full example would be cut off in the box: a shorter one then.
  const largeText = useLargeText();
  /** Out of the search: the box cleared, the keyboard away, the page back at the top (the map). */
  const cancelSearch = () => {
    setSearch('');
    searchInput.current?.blur();
    setSearching(false);
    // To the top of the page, never into the pull strip above it (that started a refresh).
    playersRef.current?.scrollTo({ y: pageTop, animated: true });
  };
  const location = useLocationToggle();
  // Check in (migration 189), for the Open to hit row's note: your ring is on the map only for friends, and only once you check in.
  const checkIn = useCheckIn();
  // (No ask on opening any more, migration 189: "Who can see you on the map?" comes only when you tap Check in.)
  const tourOpen = useTourOpen();
  // The account that threads are pulled in under (Reddit) is not a player.
  const myCity = (currentUser?.location ?? '').split(',')[0].trim().toLowerCase();
  const sameCity = (u: (typeof users)[number]) => !!myCity && (u.location ?? '').toLowerCase().startsWith(myCity);
  // Your own city first — the people you could actually hit with this week.
  // The map's list (it shows only with the search box empty). Kept while
  // nothing it is made from changes: a new list each time this tab drew made
  // the map work out and send every pin again (Oct 10, owner: "the buttons
  // like the settings. msg notifications, etc respond too slow").
  const players = useMemo(() => users
    .filter(u => u.id !== currentUserId && !blockedIds.includes(u.id) && `${u.name} ${u.handle} ${u.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(sameCity(b)) - Number(sameCity(a))),
  [users, currentUserId, blockedIds, search, myCity]); // eslint-disable-line react-hooks/exhaustive-deps
  // The players a search lists: search's own rule for every account (teens
  // like anyone; never someone blocked either way or a suspended account),
  // found by name or @handle only, never by town, and never sorted or
  // labelled by where they live: a search says nothing about where anyone
  // is. A town typed here still finds places and courts (below). The map
  // keeps its own list above, and its own server rules.
  const { findable } = useFindable();
  // Handles are kept without their '@', so '@miraplays' looks for 'miraplays'.
  const who = search.trim().replace(/^@/, '').toLowerCase();
  const foundPlayers = who
    ? users.filter((u) => findable(u) && `${u.name} ${u.handle}`.toLowerCase().includes(who))
    : [];
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
  // The topic and order the list below is drawn with. A new pick dips the list out for a moment and
  // brings the new one up, rather than swapping every thread in one frame (Oct 22 sweep, item 12).
  // The chip and the Sort button answer at once; only the list follows a beat later.
  const [listView, setListView] = useState({ topic, sort });
  const still = useReducedMotion();
  const listShown = useSharedValue(1);
  // The latest pick: the dip lands on whatever is picked when it ends, not what was picked when it began,
  // so a quick B-then-back-to-A never leaves B's threads under the A chip.
  const pick = useRef({ topic, sort });
  pick.current = { topic, sort };
  const applyPick = useCallback(() => setListView({ ...pick.current }), []);
  useEffect(() => {
    if (listView.topic === topic && listView.sort === sort) {
      // Back to what is drawn while the list dips: call the dip off and bring the list back up.
      listShown.value = withTiming(1, { duration: 200, easing: SETTLE });
      return;
    }
    // Not on show (a picture of this tab, or Find Players in front): simply the new list.
    if (previewSection || section !== 'discussions') { applyPick(); return; }
    listShown.value = withTiming(0, { duration: 90, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(applyPick)(); });
  }, [topic, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listShown.value = withTiming(1, { duration: 200, easing: SETTLE }); }, [listView, listShown]);
  const listStyle = useAnimatedStyle(() => ({
    opacity: listShown.value,
    transform: [{ translateY: still ? 0 : (1 - listShown.value) * 6 }],
  }));
  // One spot for every distance on Find Players (Courts near you, which hits
  // are near and how far, Your courts, the court search): where you are
  // (this phone's fix with Location on, else the spot you last shared from
  // any device), else your profile's city (measureFrom). The same chain as
  // Near you, Who's up today and the full map's cards, so a hit never says
  // 9.5 mi while its poster, a row above, says 1.6. The map card above may
  // be centred on the big city you are near, but "1.6 mi" here always means
  // 1.6 miles from you; the card's "open hits nearby" counts from this same
  // spot, so the two agree.
  const { city: myCityAt } = useMyCity(currentUser);
  const mineSeen = currentUserId ? lastSeen[currentUserId] : undefined;
  const ownLastLat = mineSeen?.lat;
  const ownLastLng = mineSeen?.lng;
  const ownLastSpot = useMemo(() => (ownLastLat === undefined || ownLastLng === undefined ? null : { lat: ownLastLat, lng: ownLastLng }), [ownLastLat, ownLastLng]);
  const youAt = measureFrom((location.locationOn ? detectedCoords : null) ?? ownLastSpot, myCityAt);
  const nearCourts = useNearCourts(youAt);
  // Hits still ahead (or just started), not called off, not from anyone blocked
  // or muted, and only those the teen rule lets you see (as on court pages and the map).
  const seenHits = useMemo(() => {
    const usersById = new Map(users.map((u) => [u.id, u]));
    return openHitsOf(hitRequests, { blockedIds, mutedIds }).filter((h) => canSeeHitAt(h, { usersById, followingIds, currentUserId, seeing }));
  }, [hitRequests, users, blockedIds, mutedIds, followingIds, currentUserId, seeing]);
  // Near first (within 25 km, the reach of hit matches), soonest first, with how far:
  // everything that close is near, so today's game beats next week's a mile closer.
  // A place only typed has no spot, so it follows by time when its poster is near (their shared spot,
  // else their profile's town within 30 miles of you, else the same city on their profile; yours always);
  // a typed place from another city waits under "Further away". Measured from you, so a player away
  // from home with Location on sees the local players' hits near, not their home town's.
  const { openHits, furtherHits } = useMemo(() => {
    // Yours, one you joined, or one by someone you follow: kept wherever it is.
    const keep = (hit: (typeof seenHits)[number]) => hit.authorId === currentUserId || hit.joinedIds.includes(currentUserId ?? '') || followingIds.includes(hit.authorId);
    // Nowhere to measure from (no city, no spot): only those, never a list
    // from every city with no distances. The "Where do you play?" card above
    // is the way to the rest.
    if (!youAt) return { openHits: seenHits.filter(keep).map((hit) => ({ hit, miles: undefined as number | undefined })), furtherHits: [] };
    const near: { hit: (typeof seenHits)[number]; miles: number | undefined }[] = [];
    const typed: typeof near = [];
    const far: typeof near = [];
    const farTyped: typeof near = [];
    const usersById = new Map(users.map((u) => [u.id, u]));
    for (const hit of seenHits) {
      // A flexible hit (no court yet) is measured to its rough area, the same way: near, further, or too far.
      const spot = hitSpot(hit) ?? hitArea(hit);
      if (!spot) {
        const seen = lastSeen[hit.authorId];
        const author = usersById.get(hit.authorId);
        // Their profile's town as a spot (picked from the search, or a city the app knows by name): a town, never where they are.
        const known = author && !author.cityAt && author.location?.trim() ? placeFor(author.location) : undefined;
        const town = author?.cityAt ?? (known ? { lat: known.lat, lng: known.lng } : null);
        // Nothing to tell by (no shared spot, no city on either profile): kept with the near ones, as before.
        const local = hit.authorId === currentUserId
          || (seen ? milesBetween(youAt, seen) <= NEAR_HIT_MILES
            : town ? milesBetween(youAt, town) <= IN_TOWN_MILES
              : !author || !myCity || !author.location?.trim() || sameCity(author));
        // Known to be in another part of the country: not "further away", just elsewhere (unless it is one to keep).
        const away = seen ? milesBetween(youAt, seen) : town ? milesBetween(youAt, town) : undefined;
        if (!local && away !== undefined && away > FURTHER_MILES && !keep(hit)) continue;
        (local ? typed : farTyped).push({ hit, miles: undefined });
        continue;
      }
      const miles = milesBetween(youAt, spot);
      // Yours, one you joined, or a friend's stays, wherever it is.
      if (miles > FURTHER_MILES && !keep(hit)) continue;
      (miles <= NEAR_HIT_MILES ? near : far).push({ hit, miles });
    }
    return { openHits: [...near, ...typed], furtherHits: [...far, ...farTyped] };
  }, [seenHits, youAt?.lat, youAt?.lng, lastSeen, users, currentUserId, myCity, followingIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // The order the list shows them in (Oct 7, audit items 18 and 19): the hits you posted or are in
  // first, wherever they are (one far off no longer waits folded under "Further away"), then the
  // ones with a spot, then the full ones. Only the order: which hits show, and the map's count of
  // them, are worked out above as before.
  const { listedHits, listedFurther } = useMemo(() => {
    const hitOf = (item: (typeof openHits)[number]) => item.hit;
    return {
      listedHits: hitListOrder([...openHits, ...furtherHits.filter((x) => isMyHit(x.hit, currentUserId))], hitOf, currentUserId),
      listedFurther: hitListOrder(furtherHits.filter((x) => !isMyHit(x.hit, currentUserId)), hitOf, currentUserId),
    };
  }, [openHits, furtherHits, currentUserId]);
  const [furtherOpen, setFurtherOpen] = useState(false);
  const [moreHitsOpen, setMoreHitsOpen] = useState(false);
  const moreHits = Math.max(0, listedHits.length - HITS_SHOWN);
  const shownHits = moreHitsOpen ? listedHits : listedHits.slice(0, HITS_SHOWN);
  // The hit tips (Oct 7, audit item 3): one card in the list carries one, once it is in view, and
  // only while this page is on show with no tutorial or search over it (see HitCard's tip).
  // "On show" is asked by the tip itself (tipAt), not here: the address changes with every page
  // opened anywhere, and asking here redrew this whole tab each time, before that page could slide
  // in (Oct 10, owner: "the buttons like the settings. msg notifications, etc respond too slow").
  const justPosted = useJustPosted();
  const hitTip = hitTipCard(shownHits.map((x) => x.hit), currentUserId, justPosted, { teen: !!currentUser && notKnownAdult(currentUser), followingIds });
  // Never in the page's first moment after the app opens (OPEN_QUIET_MS): it arrives whole first.
  const openSettled = useOpenSettled();
  // Only once the page has rested a moment after any swipe (a section's or a tab's): a tip that
  // joins the list makes room for itself, and that must never land on the frames right after a swipe.
  // The card carrying the tip waits for that itself (restKey, usePaneRested), so a swipe anywhere
  // never redraws this whole tab. (Off to the side, on Discussions, its card is not in view, so it waits: see useOnScreen.)
  const hitTipReady = !previewSection && !tourOpen && !search && openSettled;
  // With nothing open, name a court only when the nearest one reads as public and is close: never just because it is nearest.
  const promptCourt = nearCourts.nearest && looksPublic(nearCourts.nearest.c.name) && nearCourts.nearest.miles <= 5 ? nearCourts.nearest.c : null;
  // "Near you" is one thing on this tab and on the map: people who shared a
  // spot within 30 miles of you (where the phone is, your own last spot, or
  // your profile's city), nearest first, never placed by a typed city.
  const nearFrom = detectedCoords ?? ownLastSpot ?? myCityAt ?? null;
  const nearPlayers = useMemo(() => {
    if (!nearFrom) return [];
    return users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id))
      .flatMap((user) => { const seen = lastSeen[user.id]; if (!seen) return []; const miles = milesBetween(nearFrom, seen); return miles <= IN_TOWN_MILES ? [{ user, miles, seenAt: seen.seenAt, rough: isRoughSpot(seen) }] : []; })
      // In the order the distances read: a rough "~1 mi" never after "1.1 mi".
      .sort((a, b) => spotMilesKey(a.miles, a.rough) - spotMilesKey(b.miles, b.rough) || a.miles - b.miles);
  }, [users, lastSeen, currentUserId, blockedIds, nearFrom?.lat, nearFrom?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  // And, under them, the players whose own profile town is yours (Oct 27, owner: "Near me should show people
  // that have their location set in the area, like the city"): the same list as the map's Near me (nearMe,
  // migration 190), most recently active first, by their town only, never a spot or a distance. The server
  // says who (a teen never to a stranger). Not counted as anyone on the map: "You're early" still means no
  // friend checked in.
  const townPlayers = useTownPlayers();
  const townNear = useMemo(() => {
    const listed = new Set(nearPlayers.map((p) => p.user.id));
    return townPlayers.filter((t) => !listed.has(t.user.id));
  }, [nearPlayers, townPlayers]);
  const [nearOpen, setNearOpen] = useState(false);
  // "New on CourtSide": who joined in the last two weeks, newest first. With
  // the map's round 2 on the database (migration 63) the server decides who
  // (new_on_courtside): known adults (to a known adult), and anyone you
  // already follow; since migration 122 never a teen to an adult who does
  // not follow them, and never under 16. Before 63, the
  // phone works it out the old way: known adults and people you follow, so a
  // teen is never put in front of adult strangers with a one-tap Follow; a
  // teen viewer sees only the people they follow. Either way, nobody already
  // listed under Near you.
  const [newOpen, setNewOpen] = useState(false);
  const { loadNewOnCourtside } = actions;
  const usersIn = users.length > 0;
  useEffect(() => { if (currentUserId && usersIn) void loadNewOnCourtside(); }, [currentUserId, mapLive, usersIn, followingIds.length, loadNewOnCourtside]);
  const newPlayers = useMemo(() => {
    const near = new Set([...nearPlayers, ...townNear].map((p) => p.user.id));
    // Your own town first (Oct 5): in Boise, the newest player in Raleigh is not who to follow first.
    const townFirst = (list: typeof users) => [...list].sort((a, b) => Number(sameCity(b)) - Number(sameCity(a)));
    if (newOnCourtside) {
      const byId = new Map(users.map((u) => [u.id, u]));
      return townFirst(newOnCourtside.flatMap((r) => { const u = byId.get(r.userId); return u && !near.has(u.id) && !blockedIds.includes(u.id) ? [u] : []; }));
    }
    const viewerAdult = !!currentUser && !notKnownAdult(currentUser);
    const since = Date.now() - NEW_DAYS * 86_400_000;
    return townFirst(users
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id) && !near.has(u.id) && Date.parse(u.joinedAt) >= since)
      // (Since migration 64 nobody's age but your own reaches the phone: then only people you follow.)
      .filter((u) => followingIds.includes(u.id) || (viewerAdult && ageSaysAdult(u)))
      .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)));
  }, [users, currentUser, currentUserId, blockedIds, followingIds, nearPlayers, townNear, newOnCourtside, ageSaysAdult, myCity]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nobody new in your own town: the list says these are from other cities, rather than looking like your neighbours.
  const newElsewhere = !!myCity && newPlayers.length > 0 && !newPlayers.some(sameCity);
  // And with players near you already listed above, those from other cities wait behind one quiet link
  // (a second column of Follow buttons for strangers far away helps nobody). In an empty town they are
  // the only people there are, so they show in full.
  const [elsewhereOpen, setElsewhereOpen] = useState(false);
  const newTucked = newElsewhere && nearPlayers.length + townNear.length > 0 && !elsewhereOpen;
  // "Open to hit" (was "Who's up today"): from the map's own pins only (nobody is placed by
  // their profile's city), measured from the same spot as Near you below: where you are (the
  // phone's fix, or your own last spot), else your profile's city. With Location off the row
  // and Near you used to disagree (Oct 5): the row said nobody was up while Near you, a few
  // rows down, marked five people "open to hit".
  const ownSpot = detectedCoords ?? ownLastSpot;
  const upToday = useUpToday({ users, lastSeen, me: currentUserId, from: nearFrom, blockedIds, myTown: (currentUser?.location ?? '').split(',')[0], friendsOnly: onTeenMap(currentUser, teenMap) || (!!currentUser && notKnownAdult(currentUser)) });
  // A teen (migration 78) has it too: only friends who follow each other with
  // them are in it, and only those friends see theirs. Under 16s too (migration 119), the same way.
  const teen = onTeenMap(currentUser, teenMap);
  const showUpToday = !!currentUser && (!notKnownAdult(currentUser) || teen);
  const toggleOpen = useOpenToHitToggle();
  // Nobody sharing a spot within 30 miles (once the spots have come down): the map fills up with the people you already play with.
  // Only somewhere we know: with no spot and no city, "early here" would be a guess.
  // Only for a known adult: a teen sees only friends who follow each other
  // with them (migration 78; before it, nobody), so an empty list says nothing
  // about the town for them.
  // City boards (migration 196; owner, Oct 28: "New rank city sessions is good"), admins first
  // (CITY_BOARD_FOR_EVERYONE): this month's board takes the invite card's place, fading into Open to hit,
  // while there is a board to show (on its way, or your city on it or waiting for players). Off, not open
  // to you, or not loaded: the page is exactly as before.
  const cityBoard = useCityBoard();
  const boardShown = cityBoard.status === 'loading' || (cityBoard.status === 'ready' && (cityBoard.cities.length > 0 || !!cityBoard.board?.me.cityId));
  const early = !boardShown && !!currentUser && !notKnownAdult(currentUser) && !!nearFrom && (lastSeenLoaded || !isSupabaseConfigured) && nearPlayers.length === 0;
  // Round 3 (owner, Oct 28: "fill the rest with more circles without the ring"): after who is up, your home
  // city's regulars (by the town on their profile, never where they are), as the server picked them for you.
  const homeCityId = boardShown ? cityBoard.board?.me.cityId ?? null : null;
  const homeCityName = homeCityId ? cityBoard.board?.me.cityName ?? null : null;
  const homePage = useCityPage(homeCityId, cityBoard.month).page;
  const upFill = useCityFill(homeCityId ? homePage : null, upToday.map((p) => p.user.id));
  // The same moment for a teen, or anyone not known to be an adult (Oct 5,
  // owner: "Do all"): no friend on their map yet, which for them says only
  // that their friends are not here yet. "Bring your friends" takes the
  // invite card's place: their link, carrying no court, and a friend found
  // by @handle. No city needed, and no rule about who sees whom changes.
  // A friend on the map is one anywhere (map_players sends friends who follow each other from
  // anywhere in the world, migration 98), not just within 30 miles, and needs no city of your own.
  const friendOnMap = Object.entries(lastSeen).some(([id, seen]) => id !== currentUserId && !!seen.mutual && !blockedIds.includes(id));
  const friendsEarly = !!currentUser && notKnownAdult(currentUser) && (lastSeenLoaded || !isSupabaseConfigured) && nearPlayers.length === 0 && !friendOnMap;
  // The one thing this page leads with, for the tutorial's first tip to light (mapLead.ts).
  const lead: MapLead | null = early ? 'invite' : friendsEarly ? 'friends' : showUpToday ? (teen ? 'free-friends' : 'free') : null;
  useEffect(() => { if (!previewSection) setMapLead(lead); }, [lead, previewSection]);
  // A picture of this tab sliding in never stands in for the real one.
  const tourLead = useTourTarget('map-lead');
  const leadRef = previewSection ? undefined : tourLead;
  // A hit posted by a teen (or anyone not known to be an adult) reaches only their followers (hits/visible), so the prompt says so.
  const hitsForFriends = !!currentUser && notKnownAdult(currentUser);
  const myCityName = (currentUser?.location ?? '').split(',')[0].trim() || null;
  // "You're early in …" names where "early" was judged from (nearFrom): your profile's
  // city when that is where you are (or all we know), else the big city you are near,
  // the way the map card names it; far from any the app knows, just "here".
  const earlyCity = useMemo(() => {
    const spot = detectedCoords ?? ownLastSpot;
    if (!spot || (myCityAt && milesBetween(spot, myCityAt) <= IN_TOWN_MILES)) return myCityName;
    const known = nearestPlace(spot.lat, spot.lng);
    return milesBetween(spot, known) <= IN_TOWN_MILES ? known.name.split(',')[0] : null;
  }, [detectedCoords, ownLastSpot, myCityAt, myCityName]);
  // The court the invite carries (useInviteCourt, shared with the first-move
  // page): one you follow in town, else a public one near you. Never for a teen.
  const inviteCourt = useInviteCourt(youAt, nearCourts);
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
  const courtMatches = useCourtSearch(search.trim().startsWith('@') ? '' : search, youAt, nearCourts.all, 4);
  // And places (a city, a neighbourhood, an address, a park), leaning toward
  // your town (only ever a rough area is sent): a tap opens the full map
  // there, with that place's courts listed best first.
  // Held while the next letter's answer comes, so Places never empties and fills again on every letter (Oct 22 sweep, item 6).
  const placeSearch = usePlaceSearch(search, youAt, 3, { hold: true });
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
  // The sort menu never stays open over the other page.
  useEffect(() => { setSortOpen(false); }, [section]);
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
  const { visible, anyInTopic } = useMemo(() => {
    // Nobody you have blocked or muted shows up here, the same as in the feed.
    // Nor does a thread an admin took down (migration 108): its author finds it from their notification.
    let list = questions.filter((q) => !q.removed && !blockedIds.includes(q.authorId) && !mutedIds.includes(q.authorId));
    const { topic: shownTopic, sort: shownSort } = listView;
    if (shownTopic !== 'all') list = list.filter((q) => q.topic === shownTopic);
    // Whether the topic has any thread at all, before Unanswered narrows it.
    const any = list.length > 0;

    const newest = (a: typeof list[number], b: typeof list[number]) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (shownSort === 'unanswered') list = list.filter((q) => q.answerIds.length === 0);
    if (shownSort === 'top') list.sort((a, b) => b.votes - a.votes || b.answerIds.length - a.answerIds.length || newest(a, b));
    else if (shownSort === 'hot') {
      // Votes and replies, pulled down by age: a lively thread from today beats a quiet one from last month.
      const heat = (q: typeof list[number]) => (q.votes + 2 * q.answerIds.length + 1) / Math.pow((Date.now() - Date.parse(q.createdAt)) / 3_600_000 + 2, 1.5);
      list.sort((a, b) => heat(b) - heat(a));
    } else list.sort(newest);
    return { visible: list, anyInTopic: any };
  }, [questions, listView, blockedIds, mutedIds]);
  // The Question of the week (Oct 20 sweep, R5: "0 new threads in 7 days ... Answering a set question is
  // far easier than starting a new one"): the thread an admin pinned sits on top, with a small "This week"
  // label, under All and under its own topic. Only for 7 days from the pin; nobody you blocked or muted.
  // A guest's comes with guest mode's page (only when its author passes the guest rule).
  useEffect(() => {
    if (previewSection || !currentUserId || isGuest) return;
    void actions.loadPinnedQuestion();
  }, [previewSection, currentUserId, isGuest, remoteLoaded, actions]);
  const pinned = useMemo(() => {
    if (!pinnedQuestion || Date.now() - Date.parse(pinnedQuestion.pinnedAt) >= QUESTION_OF_WEEK_MS) return undefined;
    const q = questions.find((x) => x.id === pinnedQuestion.id);
    if (!q || q.removed || blockedIds.includes(q.authorId) || mutedIds.includes(q.authorId)) return undefined;
    // It keeps to what the list is showing: under Unanswered, only while it has no replies (review fix).
    if (listView.sort === 'unanswered' && q.answerIds.length > 0) return undefined;
    return listView.topic === 'all' || q.topic === listView.topic ? q : undefined;
  }, [pinnedQuestion, questions, blockedIds, mutedIds, listView]);
  // A long list is drawn in slices: the first screenfuls at once, the rest on request.
  // The pinned thread is drawn once, on top, not again in its place in the list.
  const slice = visible.slice(0, shownCount).filter((q) => q.id !== pinned?.id);
  // A guest's Discussions (guest mode, Oct 17; found in review: one page of 30, and the topics only
  // filtered those) come a page at a time from the server: a topic's own newest threads when it is
  // picked, and older ones as they scroll to the end. Signed in, every thread is already here.
  const [guestMore, setGuestMore] = useState<Partial<Record<QuestionTopic | 'all', boolean>>>({});
  // A topic whose first page never came (offline, say): 'Try again', not 'be the first to ask'.
  const [guestFailed, setGuestFailed] = useState<Partial<Record<QuestionTopic | 'all', boolean>>>({});
  const [guestRetry, setGuestRetry] = useState(0);
  useEffect(() => {
    if (!isGuest || !guestLoaded) return;
    let on = true;
    void actions.loadThreads(topic, false).then((more) => {
      if (!on) return;
      if (more === null) { setGuestFailed((m) => ({ ...m, [topic]: true })); return; }
      setGuestFailed((m) => ({ ...m, [topic]: undefined }));
      setGuestMore((m) => ({ ...m, [topic]: more }));
    });
    return () => { on = false; };
  }, [isGuest, guestLoaded, topic, actions, guestRetry]);
  // Still asking the server for this topic's threads: their outline, never a flash of 'No questions here'.
  const guestWaiting = isGuest && (!guestLoaded || guestMore[topic] === undefined) && !guestFailed[topic];
  const serverHasMore = isGuest && !!guestMore[topic];
  const showMore = () => {
    if (visible.length > slice.length) { setShownCount((n) => n + 25); return; }
    if (!serverHasMore) return;
    const asked = topic;
    void actions.loadThreads(asked, true).then((more) => {
      setGuestMore((m) => ({ ...m, [asked]: !!more }));
      setShownCount((n) => n + 25);
    });
  };
  // Near the end of the list (within a screen of it), the next page comes on its own.
  const { height: screenHeight } = useWindowDimensions();
  const listEnd = useRef<View>(null);
  const nearEndRef = useRef(() => {});
  nearEndRef.current = () => {
    if (section !== 'discussions' || !serverHasMore) return;
    listEnd.current?.measureInWindow((_x, y) => { if (y > 0 && y < screenHeight * 2) showMore(); });
  };
  const watchEnd = useSharedValue(false);
  useEffect(() => { watchEnd.value = isGuest; }, [isGuest, watchEnd]);
  const onNearEnd = () => nearEndRef.current();
  useAnimatedReaction(
    () => (watchEnd.value ? Math.floor(threadsY.value / 240) : -1),
    (now, before) => { if (now >= 0 && now !== before) runOnJS(onNearEnd)(); },
  );
  // The sort row goes with an empty topic: so does its menu, if it was open.
  useEffect(() => { if (!anyInTopic) setSortOpen(false); }, [anyInTopic]);

  // Where to play: the courts you follow, with what is new at each, then the others in town, each a tap from its page.
  // Each with its place in the first showing's stagger (FirstReveal), which depends on what comes first.
  // Keyed, so open hits coming or going moves them in the list rather than building them again.
  const yourCourts = (order: number) => <YourCourts key="your-courts" from={youAt} revealOrder={order} />;
  const peekLook = usePeekLook();
  const courtsBlock = (order: number) => <CourtsNear key="courts-near" center={youAt} revealOrder={order} foldGap={16} pictures={!previewSection} />;
  // Your courts and Courts near you sit above Open hits in a quiet area and under them once there are
  // hits. When that changes (the last hit called off, the first one posted), they fold shut in one place
  // as they unfold in the other, rather than the whole page jumping (Oct 22 sweep, item 7).
  // (A search takes them down at once, as it does the rest of the page, so nothing folds above the results.)
  const courtsAt = (above: boolean) => (search ? null :
    <Fold key={above ? 'courts-above' : 'courts-below'} open={above ? !openHits.length : !!openHits.length} gap={16}>
      <View style={styles.courtsPair}>{yourCourts(above ? 1 : 2)}{courtsBlock(above ? 2 : 3)}</View>
    </Fold>
  );
  // A guest (guest mode, Oct 17): open hits and courts near them, never the players map or people.
  const content = (pane:string) => (pane === 'players' && isGuest ? <GuestFindPlayers /> : pane === 'players' ? <View style={{ gap: 12 }}>
        {/* Cancel beside the box while you search, the way iPhone search boxes do: one tap clears it, puts the keyboard away and brings the map back (Oct 5, owner: "there should be an easier way to exit here"). */}
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={17} color={colors.textFaint} style={styles.searchIcon} />
            <TextBox maxFontSizeMultiplier={TextScale.TITLE} ref={searchInput} accessibilityLabel="Search players, courts or places" placeholder={largeText ? 'Search players or courts' : 'Search players, courts or places'} placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} returnKeyType="search" style={[styles.search, search ? styles.searchWithClear : null]} />
            {/* The (x) fades in and out rather than snapping (Oct 22 sweep, item 46). */}
            {search ? (
              <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.searchClear}>
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              </Reanimated.View>
            ) : null}
          </View>
          {/* Cancel slides in beside the box as the box narrows, and out again (Oct 22 sweep, item 46: it popped in and the box jumped). */}
          <SearchCancel shown={searching || !!search} onPress={cancelSearch} />
        </View>
        {currentUser ? (pane === 'players'
          // Live while the tab is on show, beside Discussions too, so it is already drawn when it slides in.
          // Kept (hidden, not taken down) while you search, so clearing the search finds it already drawn
          // instead of building a new map in front of you (Oct 22, owner: "The map blips in").
          // Its own view always (collapsable), so hiding it only changes how it looks, never where it is mounted.
          ? <View collapsable={false} pointerEvents={search ? 'none' : 'auto'} accessibilityElementsHidden={!!search} importantForAccessibility={search ? 'no-hide-descendants' : 'auto'} style={search ? styles.mapHidden : null}><NearbyMap visible={(!previewSection || section === 'players') && !search} inView={mapInView} me={currentUser} players={players} at={detectedCoords} locationOn={location.locationOn} locating={location.locating} onToggleLocation={location.toggle} onOpen={id => router.push(`/user/${id}`)} onExpand={() => router.push('/map')} hitCount={openHits.length} inviting={early} /></View>
          // The same footprint, empty: keeps the list from jumping when the map mounts on arrival.
          : search ? null : <View style={styles.mapStandIn} />) : null}
        {/* Nobody sharing a spot within 30 miles: the way to fill the map,
            right under it, so its button shows without scrolling (Oct 5: it
            sat under the bar, below Open to hit). For a teen with no friend
            on their map yet, the same card as "Bring your friends". */}
        {/* Under the map (whose frame is there at once), the sections arrive in a short, quiet
            stagger as the opening curtain lifts, the first time only (FirstReveal, Oct 21). */}
        {/* City boards (admins first): the month's board in the invite card's place, fading into Open to hit. */}
        {/* Design mock (?mutuals=b, demo build only): "Follow back to see each other on the map". */}
        {/* Round 2 (?mutuals=b1|b2|b2open|b3|a2): the same card in three new looks, and "Add your friends" as a card here. */}
        {!search && mutualsLook && mutualsOpen && ['b', 'b1', 'b2', 'b2open', 'b3', 'a2'].includes(mutualsLook) ? (
          <View style={{ marginTop: spacing.lg }}>
            {mutualsLook === 'b' ? <MutualsInline onClose={() => setMutualsOpen(false)} />
              : mutualsLook === 'b1' ? <FollowBackRow onClose={() => setMutualsOpen(false)} />
              : mutualsLook === 'b3' ? <FollowBackMeet onClose={() => setMutualsOpen(false)} />
              : mutualsLook === 'a2' ? <MutualsEmptyCard onClose={() => setMutualsOpen(false)} />
              : <FollowBackBanner startOpen={mutualsLook === 'b2open'} onClose={() => setMutualsOpen(false)} />}
          </View>
        ) : null}
        {!search && boardShown ? <FirstReveal order={0}><CityBoardPreview /></FirstReveal> : null}
        {!search && early ? <FirstReveal order={0}><EarlyInvite city={earlyCity} court={inviteCourt} leadRef={leadRef} /></FirstReveal> : null}
        {!search && friendsEarly ? <FirstReveal order={0}><EarlyInvite friends city={myCityName} court={null} leadRef={leadRef} /></FirstReveal> : null}
        {/* Open to hit: you first (one tap, never Location; hold to pick until when and how far), then who near you is open. */}
        {currentUser && !search && showUpToday ? (
          // Never folded away by the phone's renderer: with players around, the tutorial's first tip lights this row.
          <FirstReveal order={0}><View ref={early || friendsEarly ? undefined : leadRef} collapsable={false}>
            {/* "Turn on Location" only while it is off: with it on and no spot yet, the row waits for one (the switch would have turned it off). */}
            <UpToday me={currentUser} people={upToday} fill={upFill} fillTitle={homeCityName ? `Most active in ${homeCityName}` : undefined} teen={teen} locationOn={location.locationOn} checkedIn={checkIn.on} finding={location.locationOn && !ownSpot} onLocation={ownSpot || location.locationOn ? undefined : location.toggle} onCheckIn={checkIn.on ? undefined : checkIn.press} onToggle={toggleOpen} />
          </View></FirstReveal>
        ) : null}
        {/* A quiet area leads with where to play (your courts, then the others
            near you); once it has open hits, they come first, and Your courts
            follows them, since its "Hit today" badges repeat those cards. */}
        {courtsAt(true)}
        {/* Hits: someone wants a game, yours first, then near you. Posting one is right here. */}
        {!search ? (
          <FirstReveal order={openHits.length ? 1 : 3}><View style={styles.hits}>
            <View style={styles.hitsHead}>
              <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.playersTitle}>Open hits</Text>
              {/* Nothing open: the section says so in one muted line under its title, the way a section opens. */}
              {listedHits.length ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{hitsForFriends ? 'None from your friends yet.' : 'None at courts near you yet.'}</Text>}
            </View>
            {/* The way to post one (Oct 7): a field at the top of the list, not a small link beside
                the title. With nothing open and a public court close by, it starts the hit at that
                court; then the note under it says what happens next ("Pick a time" when the court
                is already picked). "Post a hit", not just "Post", for a screen reader: a post
                elsewhere is a photo or clip. */}
            {(() => {
              const court = !listedHits.length ? promptCourt : null;
              const who = hitsForFriends ? 'Friends who follow you' : 'Players';
              return (
                <PostHitField
                  label={court ? `Play at ${labelOf(court)}?` : 'Looking for a hit?'}
                  accessibilityLabel={court ? `Post a hit at ${labelOf(court)}` : 'Post a hit'}
                  onPress={() => (court ? playHere({ id: court.id, name: labelOf(court), lat: court.lat, lng: court.lng }) : router.push('/hit-request/new'))}
                  note={listedHits.length || LESS_AI ? null : `${court ? 'Pick a time' : 'Post a time and place'}. ${who} can tap I’m in, and a chat opens to sort out the rest.`}
                />
              );
            })()}
            {/* Cards fold in and out (a hit posted or called off, More open hits) and the rest glide (Oct 22 sweep, item 7). */}
            <FoldList items={shownHits} keyOf={hitKey} gap={spacing.md} render={({ hit, miles }) => <HitCard hit={hit} miles={miles} {...(hitTip?.hitId === hit.id ? { tip: hitTip.tip, tipReady: hitTipReady, tipAt: '/discuss', restKey: section } : {})} />} />
            {moreHits ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreHitsOpen }} onPress={() => setMoreHitsOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: PRESS_DIM }]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.furtherText}>{moreHitsOpen ? 'Fewer open hits' : `More open hits (${moreHits})`}</Text>
                <Ionicons name={moreHitsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
            {listedFurther.length ? (
              <>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: furtherOpen }} onPress={() => setFurtherOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: PRESS_DIM }]}>
                  <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.furtherText}>Further away ({listedFurther.length})</Text>
                  <Ionicons name={furtherOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </Pressable>
                <FoldList items={furtherOpen ? listedFurther : NO_HITS} keyOf={hitKey} gap={spacing.md} render={({ hit, miles }) => <HitCard hit={hit} miles={miles} />} />
              </>
            ) : null}
          </View></FirstReveal>
        ) : null}
        {courtsAt(false)}
        {search && (foundPlayers.length || courtMatches.length || placeMatches.length) ? <View style={styles.playersHead}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersTitle}>Players</Text>
          {/* Players first (Oct 22 sweep, item 6): they are known the moment you type, so nothing that arrives later lands above them. A court matched but no one did: one quiet line, not a big empty state under the court that was found. */}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{foundPlayers.length ? `${foundPlayers.length} ${foundPlayers.length === 1 ? 'match' : 'matches'}` : `No players named “${search.trim()}”`}</Text>
        </View> : null}
        {search ? foundPlayers.map((user, index) => <Pressable key={user.id} accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
          <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
          <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
            <View style={styles.playerTop}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>@{user.handle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
        </Pressable>) : null}
        {/* Courts by name, under the players, once two letters are typed. Courts from further away come a beat
            later: below the players, they only ever add rows under the one you were about to tap (Oct 22 sweep, item 6). */}
        <Fold open={!!search && courtMatches.length > 0} appear gap={16}>
          <View>
            <View style={styles.playersHead}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersTitle}>Courts</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{`${courtMatches.length} ${courtMatches.length === 1 ? 'match' : 'matches'}`}</Text>
            </View>
            {courtMatches.map(({ c, miles }, index) => {
              const meta = [youAt ? formatMiles(miles) : null, c.count > 1 ? `${c.count} courts` : null, c.lit ? 'lights' : null].filter(Boolean).join(' · ');
              return (
                <Pressable key={c.id} accessibilityRole="link" accessibilityLabel={`${labelOf(c)}${meta ? `, ${meta}` : ''}${LESS_AI_COURTS && surfaceSaid(c.surface, c.count) ? `, ${surfaceSaid(c.surface, c.count)}` : ''}, open the court`} onPress={() => openCourt({ id: c.id, name: labelOf(c), lat: c.lat, lng: c.lng })} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                  {LESS_AI_COURTS ? null : <View style={styles.courtTile}><CourtGlyph size={20} color={colors.brand} /></View>}
                  <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
                    <Highlighted text={labelOf(c)} words={searchWords} style={styles.playerName} strong={styles.courtNameMatch} lines={2} wordStart />
                    {LESS_AI_COURTS ? <SurfaceLine surface={c.surface} rest={meta} style={styles.playerMeta} /> : meta ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>{meta}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
                </Pressable>
              );
            })}
          </View>
        </Fold>
        {/* Places by name, last: a city, an address or a park, each opening the map there. The world's answer comes
            a moment after typing stops, so it only ever unfolds at the end of the list (Oct 22 sweep, item 6). */}
        <Fold open={!!search.trim() && placeMatches.length > 0} appear gap={16}>
          <View>
            <View style={styles.playersHead}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersTitle}>Places</Text>
              {placeSearch.failed || !LESS_AI ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{placeSearch.failed ? 'Search isn’t working right now' : 'See the courts there on the map'}</Text> : null}
            </View>
            {placeMatches.map((p, index) => (
              <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={`${p.title}${p.sub ? `, ${p.sub}` : ''}, see its courts on the map`} onPress={() => openPlace(p)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                {LESS_AI ? null : <View style={styles.placeTile}><Ionicons name={p.kind === 'area' ? 'map-outline' : 'location-outline'} size={20} color={colors.textMuted} /></View>}
                <View style={[styles.playerBody, index > 0 && styles.playerLine]}>
                  <Highlighted text={p.title} words={searchWords} style={styles.playerName} strong={styles.courtNameMatch} lines={1} wordStart />
                  {p.sub ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>{p.sub}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.playerChevron} />
              </Pressable>
            ))}
          </View>
        </Fold>
        {search && !foundPlayers.length && !courtMatches.length && !placeMatches.length && !placeSearch.searching ? <EmptyState title={`Nothing matches “${search.trim()}”`} body={placeSearch.failed ? 'Places can’t be searched right now. Try a player’s or a court’s name.' : 'No players, courts or places found. Try a name, a city or a park.'} /> : null}
        {/* Near you: friends checked in within 30 miles (only friends since migration 189), with how far, then the players
            whose profile town is yours (migration 190), by their town only: the same "near" as the map's Near me. */}
        {!search && (nearPlayers.length || townNear.length) ? (
          <View>
            <View style={styles.playersHead}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersTitle}>Near you</Text>
              {LESS_AI ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{townNear.length && myCityName ? (nearPlayers.length ? `Friends up to hit, and players in ${myCityName}` : `Players in ${myCityName}`) : 'Friends up to hit within 30 miles'}</Text>}
            </View>
            {nearPlayers.map(({ user, miles, seenAt, rough }, index) => (
              <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, ${formatSpotMiles(miles, rough)}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
                <View style={[styles.playerBody, styles.playerFollowBody, index > 0 && styles.playerLine]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.playerTop}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>{[formatSpotMiles(miles, rough), seenAt ? agoLabel(seenAt) : null, isOpenToHitNow(user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <FollowPill small soft={LESS_AI_ROUND2} following={followingIds.includes(user.id)} userId={user.id} onPress={() => followRow(user.id)} name={user.name.split(' ')[0]} />
                </View>
              </Pressable>
            ))}
            {/* In your town by their profile: the town where a friend's row says how far; Show all unfolds the rest. */}
            <FoldList items={nearOpen ? townNear : townNear.slice(0, NEW_SHOWN)} keyOf={townRowKey} render={({ user, town }, index) => (
              <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, ${town}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
                <View style={[styles.playerBody, styles.playerFollowBody, (index > 0 || nearPlayers.length > 0) && styles.playerLine]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.playerTop}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>{[town, isOpenToHitNow(user) ? 'open to hit' : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <FollowPill small soft={LESS_AI_ROUND2} following={followingIds.includes(user.id)} userId={user.id} onPress={() => followRow(user.id)} name={user.name.split(' ')[0]} />
                </View>
              </Pressable>
            )} />
            {townNear.length > NEW_SHOWN ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: nearOpen }} onPress={() => setNearOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: PRESS_DIM }]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.furtherText}>{nearOpen ? 'Fewer' : `Show all (${townNear.length})`}</Text>
                <Ionicons name={nearOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {/* New on CourtSide: who joined in the last two weeks (adults, and people you already follow), with Follow in one tap. */}
        {/* New players in other cities: the link folds away as the list unfolds in its place (Oct 22 sweep, item 7). */}
        {search ? null : <Fold open={newPlayers.length > 0 && newTucked} gap={16}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setElsewhereOpen(true)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: PRESS_DIM }]}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.furtherText}>New players in other cities</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
        </Fold>}
        {search ? null : <Fold open={newPlayers.length > 0 && !newTucked} gap={16}>
          <View>
            <View style={styles.playersHead}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersTitle}>New on CourtSide</Text>
              {LESS_AI && !newElsewhere ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playersBody}>{newElsewhere ? (LESS_AI ? 'In other cities' : 'Joined in the last two weeks, in other cities') : 'Joined in the last two weeks'}</Text>}
            </View>
            {/* Show all unfolds the rest, Fewer folds them away (Oct 22 sweep, item 7). */}
            <FoldList items={newOpen ? newPlayers : newPlayers.slice(0, NEW_SHOWN)} keyOf={userKey} render={(user, index) => (
              <Pressable accessibilityRole="link" accessibilityLabel={`${user.name}, ${joinedLabel(user.joinedAt).toLowerCase()}, open profile`} onPress={() => router.push(`/user/${user.id}`)} style={({ pressed }) => [styles.player, pressed && styles.playerPressed]}>
                <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={52} ring={user.isCoach} />
                <View style={[styles.playerBody, styles.playerFollowBody, index > 0 && styles.playerLine]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={styles.playerTop}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerName} numberOfLines={1}>{user.name}</Text><LevelPill profile={user.profile} small /></View>
                    <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.playerMeta} numberOfLines={1}>{[joinedLabel(user.joinedAt), user.location.split(',')[0] || null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <FollowPill small soft={LESS_AI_ROUND2} following={followingIds.includes(user.id)} userId={user.id} onPress={() => followRow(user.id)} name={user.name.split(' ')[0]} />
                </View>
              </Pressable>
            )} />
            {newPlayers.length > NEW_SHOWN ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: newOpen }} onPress={() => setNewOpen((o) => !o)} hitSlop={6} style={({ pressed }) => [styles.further, pressed && { opacity: PRESS_DIM }]}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.furtherText}>{newOpen ? 'Fewer' : `Show all (${newPlayers.length})`}</Text>
                <Ionicons name={newOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </Fold>}
      </View> : <>
      {/* A tap anywhere outside the open sort menu closes it (under the controls, over the threads). */}
      {sortOpen ? <Pressable accessibilityLabel="Close sort menu" onPress={() => setSortOpen(false)} style={[StyleSheet.absoluteFill, { zIndex: 4, elevation: 4 }]} /> : null}
      <View style={styles.controls}>
        <ScrollView ref={topicStrip} nativeID="topic-filter-strip" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
          {TOPICS.map((t) => (
            // The picked topic is filled in the section's own colour, so it is plain which one is on.
            <View key={t} onLayout={(e) => { chipX.current[t] = e.nativeEvent.layout.x; }}>
              <Chip
                label={t === 'all' ? 'All' : TOPIC_META[t].label}
                selected={topic === t}
                tint={colors.text}
                ink={colors.brandInk}
                onPress={() => { if (t !== topic) haptics.tick(); setTopic(t); setSortOpen(false); }}
                small
              />
            </View>
          ))}
        </ScrollView>
        {/* One quiet line under the topics: how many threads, and a single Sort button, the way Reddit does it.
            A topic with no threads at all has nothing to sort, so no row (the empty state says the rest);
            one that Unanswered emptied keeps it, beside "All caught up". */}
        {anyInTopic ? (
        <View style={styles.sortRow}>
          {/* Nothing here: the empty state below says so, not "0 threads" over it. */}
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sortCount}>{visible.length === 0 ? '' : visible.length === 1 ? '1 thread' : `${visible.length} threads`}</Text>
          <View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${SORT_LABEL[sort]}`} accessibilityState={{ expanded: sortOpen }} onPress={() => setSortOpen((o) => !o)} hitSlop={8} style={({ pressed }) => [styles.sortButton, pressed && { opacity: PRESS_DIM }]}>
              <Ionicons name="swap-vertical" size={14} color={colors.textMuted} />
              <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.sortButtonText}>{SORT_LABEL[sort]}</Text>
              <Ionicons name={sortOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
            </Pressable>
            {/* It grows out of the Sort button and shrinks back into it (Oct 22 sweep, item 12). */}
            <Pop open={sortOpen} style={styles.sortMenu}>
                {(['new', 'hot', 'top', 'unanswered'] as const).map((key, i) => (
                  <Pressable key={key} accessibilityRole="menuitem" accessibilityState={{ selected: sort === key }} onPress={() => { if (key !== sort) haptics.tick(); setSort(key); setSortOpen(false); }} style={({ pressed }) => [styles.sortItem, i > 0 && styles.sortItemLine, pressed && { backgroundColor: colors.bgElevated }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.sortItemTitle, sort === key && { color: colors.brand }]}>{SORT_LABEL[key]}</Text>
                      {LESS_AI_DISCUSS ? null : <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sortItemBody}>{SORT_HINT[key]}</Text>}
                    </View>
                    {sort === key ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
                  </Pressable>
                ))}
            </Pop>
          </View>
        </View>
        ) : null}
      </View>

      <Reanimated.View style={listStyle}>
      {visible.length === 0 && listView.sort === 'unanswered' && anyInTopic ? (
        // Sorted to Unanswered and every question here has a reply: the topic is not empty, so never "be the first".
        <EmptyState
          icon="checkmark-circle-outline"
          title="All caught up"
          body="Every question here has a reply."
          action={{ label: 'Show all', onPress: () => setSort('new') }}
        />
      ) : visible.length === 0 && !pinned && guestWaiting ? (
        <QuestionListSkeleton />
      ) : visible.length === 0 && !pinned && isGuest && guestFailed[topic] ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load threads"
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => { setGuestFailed((m) => ({ ...m, [topic]: undefined })); setGuestRetry((n) => n + 1); } }}
        />
      ) : visible.length === 0 && !pinned ? (
        <EmptyState
          icon="help-circle-outline"
          title="No questions here"
          body={LESS_AI_DISCUSS ? undefined : 'Be the first to ask. Specific questions get specific answers.'}
          // Never a dead end (Oct 5): asking opens with this topic picked.
          action={{ label: 'Ask a question', onPress: () => router.push(topic === 'all' ? '/ask' : { pathname: '/ask', params: { topic } }) }}
        />
      ) : (
        <View style={styles.list}>
          {pinned ? (
            <View style={styles.pinned}>
              <View style={styles.pinnedLabel} accessible accessibilityLabel={LESS_AI_DISCUSS ? 'Question of the week' : 'Question of the week, this week'}>
                <Ionicons name="pin" size={13} color={colors.brand} />
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.pinnedTitle}>Question of the week</Text>
                {LESS_AI_DISCUSS ? null : <View style={styles.weekPill}><Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.weekPillText}>This week</Text></View>}
              </View>
              <QuestionCard
                question={pinned}
                author={users.find((u) => u.id === pinned.authorId)}
                answered={Boolean(pinned.acceptedAnswerId)}
                saved={saved.questionIds.includes(pinned.id)}
                onToggleSave={() => actions.toggleSaveQuestion(pinned.id)}
                onShare={() => router.push(`/share?kind=question&id=${pinned.id}`)}
                onPress={() => router.push(`/question/${pinned.id}`)}
              />
            </View>
          ) : null}
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
          {/* The count sits once, above the list; the end of the list is just its end. */}
          {visible.length > slice.length || serverHasMore ? (
            <Pressable ref={listEnd} accessibilityRole="button" onPress={showMore} style={({ pressed }) => [styles.more, pressed && { opacity: PRESS_DIM }]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.moreText}>Show more threads</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      </Reanimated.View>
      </>);

  // On a computer the row and each section's words keep to the page's column; the sections still scroll across the whole window.
  const column = isPhone ? undefined : LAYOUT.soloColumn;
  return (<>
    {mutualsLook === 'a' ? <MutualsSheet visible={mutualsOpen} onClose={() => setMutualsOpen(false)} /> : null}
    {mutualsLook === 'a1' ? <MutualsSheetCalm visible={mutualsOpen} onClose={() => setMutualsOpen(false)} /> : null}
    <Screen memoryKey="discuss" wash scroll={false} scrollsInside padded={false} unconstrained
      title="Community"
      right={isGuest ? <GuestSignIn /> :
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
      {/* First, so everything else covers it: where a phone draws Courts near you's little maps, one at a time, while this page is on show (the chat's own way). */}
      {previewSection || peekLook !== 'N' ? null : <CourtsNearSnapshots />}
      {/* Under the header and out of every scroller, so it stays exactly where it is while
          either section scrolls or the two slide past each other. */}
      <View style={[styles.sectionsColumn, column ? { maxWidth: column } : null]}>
        <View style={styles.sections} onLayout={e => { setTabWidth(e.nativeEvent.layout.width / 2); }}>
          {(['players', 'discussions'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => tapSection(value)} style={styles.section}><Reanimated.Text {...oneLine(TextScale.TITLE, 0.75)} style={[styles.sectionWord, value === 'players' ? playersWord : threadsWord]}>{value === 'discussions' ? 'Discussions' : 'Find Players'}</Reanimated.Text></Pressable>)}
          {tabWidth > 0 && <Reanimated.View pointerEvents="none" style={[styles.sectionUnderline, { width: tabWidth }, underline.style]} />}
        </View>
      </View>
      {/* Find Players on the left, Discussions on the right, each its own page. Community is the
          strip's first tab, so a swipe right from Find Players only gives a little at the edge; a
          swipe left from Discussions goes on to Home. */}
      <SectionPager
        fill
        // Both stay built and drawn, in a browser too: Find Players' map is never torn down and
        // made again on a trip to Discussions and back (owner, Oct 19: "push 2").
        keepMounted
        index={sectionIndex}
        panes={[
          <PaneScroller key="players" memoryKey="discuss:players" active={section === 'players'} scrollRef={playersRef} offsetY={playersY} inStrip={playersStrip} onRefresh={refresh} column={column}>{content('players')}</PaneScroller>,
          <PaneScroller key="discussions" memoryKey="discuss:discussions" active={section === 'discussions'} scrollRef={threadsRef} offsetY={threadsY} inStrip={threadsStrip} onRefresh={refresh} column={column}>{content('discussions')}</PaneScroller>,
        ]}
        progress={underline.progress}
        jumpRef={previewSection ? undefined : jumpPages}
        depth={1}
        delegateLeft
        delegateRight
        // A pull held open on the section on show: the page stays put until it lets go.
        blocked={swipeBlocked}
        // The tutorial's slide from the map to the threads plays here, as this pager's own swipe.
        slideChannel={previewSection ? undefined : '/discuss'}
        onIndex={(i) => setSection(i === 0 ? 'players' : 'discussions')}
      />
    </Screen>
  </>);
}

/** The app's ease-out for things settling into place (the same curve as Fold and Collapse). */
const SETTLE = Easing.bezier(0.22, 0.61, 0.36, 1);

/**
 * "Cancel" beside the Find Players search box (Oct 22 sweep, item 46): it
 * slides in from the right edge as the box narrows to make room, and back
 * out as the box widens again, instead of popping in with the box jumping
 * narrower in one frame. Always built, so its width is known before it is
 * first needed; while away it takes no room, no taps and no screen reader.
 */
function SearchCancel({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const still = useReducedMotion();
  const progress = useSharedValue(shown ? 1 : 0);
  const width = useSharedValue(0);
  // Where it is headed (1 in, 0 out), for the animation thread: a rebuilt copy's first frame reads it as it is now.
  const goal = useSharedValue(shown ? 1 : 0);
  // Built afresh each time it lands in or out, on a phone, so an iPhone that drops a settled animation
  // value can never shrink Cancel away while the search is open (or bring it back once closed) on a
  // later re-render. Its width is kept here (a shared value), so the new copy starts at the right size.
  const [restKey, landed] = useRestKey();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    goal.value = shown ? 1 : 0;
    progress.value = withTiming(shown ? 1 : 0, { duration: shown ? 240 : 200, easing: SETTLE }, (done) => { 'worklet'; if (done) runOnJS(landed)(); });
  }, [shown, progress, goal, landed]);
  const style = useAnimatedStyle(() => ({
    // With Reduce Motion on, the room changes at once and only the word fades.
    width: still ? (goal.value ? width.value : 0) : width.value * progress.value,
    opacity: progress.value,
  }));
  return (
    <Reanimated.View key={restKey} style={[styles.cancelWrap, style]} pointerEvents={shown ? 'box-none' : 'none'} accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'} aria-hidden={!shown}>
      <View style={styles.cancelInner} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel search" hitSlop={8} onPress={onPress} focusable={shown} onLayout={(e) => { width.value = e.nativeEvent.layout.width; }} style={styles.cancelButton}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.searchCancel} numberOfLines={1}>Cancel</Text>
        </Pressable>
      </View>
    </Reanimated.View>
  );
}

const styleDefinitions = StyleSheet.create({
  hits: { gap: spacing.md },
  courtsPair: { gap: 16 },
  hitsHead: { gap: 3, paddingTop: spacing.sm },
  // One quiet line that opens more hits: the rest of the near ones, or those beyond 25 km.
  further: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  furtherText: { ...typography.smallStrong, color: colors.textMuted },
  // A court found by the search: the same tile as Search's court rows, in the players' row frame.
  courtTile: { width: 52, height: 52, borderRadius: corner(14), backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  // A place found by the search: the court tile's frame, in the quiet surface colour, so places and courts read apart.
  placeTile: { width: 52, height: 52, borderRadius: corner(14), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  courtNameMatch: { ...font('700'), color: colors.text },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 5 },
  sortCount: { ...typography.small, color: colors.textFaint },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  sortButtonText: { ...typography.smallStrong, color: colors.textMuted },
  sortMenu: { ...lift, position: 'absolute', top: 36, right: 0, width: 240, borderRadius: corner(16), backgroundColor: colors.surface, overflow: 'hidden', zIndex: 10 },
  sortItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 14, paddingVertical: 11 },
  sortItemLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sortItemTitle: { ...typography.smallStrong, color: colors.text },
  sortItemBody: { ...typography.caption, letterSpacing: 0, color: colors.textMuted },
  // The row's frame: the page's side margins, and on a computer the page's column.
  sectionsColumn: { alignSelf: 'center', width: '100%', paddingHorizontal: spacing.lg },
  sections: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionWord: { ...typography.bodyStrong, fontSize: 16 },
  more: { alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: buttonShape.smallRadius, ...buttonShape.curve, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
  moreText: { ...typography.smallStrong, color: colors.text },
  // Closer under the title (Oct 24, owner: "a bit too much space above Find Players and Discussions"); the underline keeps its room below.
  section: { flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 16 },
  sectionUnderline: { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: colors.brand, borderRadius: 1 },
  // No gap: Cancel brings its own room in as it slides in (SearchCancel).
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  cancelWrap: { alignSelf: 'stretch', overflow: 'hidden' },
  // Wider than Cancel ever is, so its word is measured whole; the wrap shows only what has slid in.
  cancelInner: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 200, justifyContent: 'center', alignItems: 'flex-start' },
  cancelButton: { paddingLeft: spacing.md },
  searchWrap: { flex: 1, position: 'relative', justifyContent: 'center' },
  searchWithClear: { paddingRight: 40 },
  searchClear: { position: 'absolute', right: 14 },
  searchCancel: { fontSize: 16, ...font('600'), color: colors.brand },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: { ...typography.body, fontSize: 16, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: inputCorner(radius.pill), paddingLeft: 42, paddingRight: spacing.lg, minHeight: 40, paddingVertical: 7, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  // The map card while a search is up: kept, out of the layout. In a browser `display: none` keeps it.
  // On a phone it would not: the phone takes a view with display none off the screen entirely, its map's
  // web view with it, so clearing the search loaded the map afresh (blank, then popping in, and on the
  // place the page first opened on). There it stays put, laid over nothing, unseen and untouchable.
  mapHidden: Platform.OS === 'web' ? { display: 'none' } : { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
  // The map card's own height, so nothing jumps when the card takes its place.
  mapStandIn: { height: CARD_HEIGHT, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  playersHead: { gap: 3, paddingTop: spacing.sm },
  playersTitle: { ...typography.title, color: colors.text },
  playersBody: { ...typography.small, color: colors.textMuted },
  player: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: -spacing.lg, paddingLeft: spacing.lg },
  playerPressed: { backgroundColor: colors.surfaceAlt },
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
  // No room of its own under the sort line (Oct 25, owner: "Too much dead space here"): the first thread's own top air is the gap.
  controls: { gap: spacing.md, zIndex: 10, elevation: 10 },
  topicRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8 },
  list: { gap: spacing.md },
  pinned: { gap: spacing.sm },
  pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.xs },
  pinnedTitle: { ...typography.smallStrong, color: colors.text },
  weekPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  weekPillText: { ...typography.caption, letterSpacing: 0, color: colors.brand },
});

export default asTabRoute<{ previewSection?: string }>(Discuss, '/discuss');
