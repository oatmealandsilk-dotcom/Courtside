import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { show as showToast } from '@/lib/toast';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Reanimated, { Easing, FadeInDown, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { MediaPicker, pickFromDevice, type PickedMedia } from '@/components/MediaPicker';
import { MediaEditor, type EditedMedia } from '@/components/MediaEditor';
import { takePendingShot } from '@/features/compose/pendingShot';
import { registerCreateClose } from '@/features/compose/createMenu';
import { SheetBackdrop } from '@/components/SheetBackdrop';
import { Button, Chip, Field, Screen, Toggle } from '@/components/ui';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import { FormRow } from '@/components/FormRow';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { openPlacePicker } from '@/features/places/picker';
import { PreparingRing } from '@/components/PreparingRing';
import { TagPlayers } from '@/components/TagPlayers';
import { AttachSessionStats } from '@/components/AttachSessionStats';
import { pickCaption, statsOf, type SessionPick } from '@/features/activity/recent';
import { openSessionPicker } from '@/features/activity/sessionPicker';
import { isActive, tagsOnSession } from '@/features/activity/sessionTags';
import { addToBank, getBank } from '@/features/compose/mediaBank';
import { useApp } from '@/store/AppContext';
import { courtRows, fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { labelOf } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { homeFor, type LatLng } from '@/features/players/positions';
import { getPosition } from '@/lib/geo';
import type { TaggedCourt } from '@/data/types';
import { colors, radius, spacing, typography, font } from '@/theme';
import { challengeFor } from '@/features/challenge/weekly';
import { goHome } from '@/lib/goBack';
import { useRevealOnFocus } from '@/lib/keyboardScroll';

type Mode = 'clip' | 'post' | 'story' | 'hit';

const goBackNow = () => router.back();
/**
 * Posting lands you on the feed, whichever tab (or challenge page) the Create
 * box was opened over, the way Instagram does. The strip across the top
 * counts the upload up; once your post has landed it goes to the very top of
 * the feed. Every page over the tabs closes on the way (goHome), from any
 * depth; never by '/', the splash screen's address too, which opened a second
 * copy of the whole app on top.
 */
// A Create box opened as the very first page (a browser refreshed on it) has
// nothing to close down to: it is swapped for the tabs rather than left under them.
const landOnFeed = () => { if (router.canDismiss()) goHome(); else router.replace('/(tabs)'); };
/** Each choice in the Create box arrives a moment after the one above it. */
const arrive = (index: number) => FadeInDown.delay(90 + index * 55).duration(260).easing(Easing.out(Easing.cubic));
/**
 * "Show heart rate" is remembered on this phone for the next session posted,
 * one choice per account: switching accounts on a shared phone must not
 * switch someone else's heart rate on for them.
 */
const showHrKey = (userId: string) => `courtside-activity-show-hr:${userId}`;
/** choose → library → form, with back always stepping one page left. */
type Stage = 'choose' | 'library' | 'edit' | 'form';

/**
 * Instagram-shaped composer: pick media, write a caption, post.
 * A post carries a caption and how long you were on court — nothing else.
 * Questions are asked from their own sheet (app/ask.tsx), not from here.
 *
 * Opened from a logged session (?activity= for a tracker's, ?session= for
 * one logged by hand: "Save and post", "Post it"), it starts on the form
 * with the session's stats at the top; a photo or video is optional then.
 * That path lives in its own `opened` branches below. A normal Post or Clip
 * can carry a session too, picked from "Add session stats" (`statsPick`):
 * the post stays a Post or a Clip, with the stats on it. A challenge entry
 * is untouched by either.
 */
export default function Compose() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, posts, currentUserId, currentUser, detectedCoords, lastSeen, locationEnabled, detectedActivities, sessions, sessionTags, feedGroups, feedGroupsOn } = useApp();

  // The story rail opens this straight at the library with ?mode=story.
  const params = useLocalSearchParams<{ mode?: string; shot?: string; challenge?: string; courtId?: string; courtName?: string; lat?: string; lng?: string; activity?: string; session?: string; group?: string }>();
  // Share to: everyone (the default) or one group you are in (migration 67). A group's feed opens this with ?group=<id>.
  const [shareTo, setShareTo] = useState<string | null>(params.group ?? null);
  // Never falls back to Everyone on its own: a group that is not (or no
  // longer) yours stops Share instead, so nothing goes public by accident.
  // Opened from a group's feed, the groups are read first.
  const [groupsRead, setGroupsRead] = useState(feedGroupsOn !== null);
  useEffect(() => {
    if (!params.group || groupsRead) return;
    let on = true;
    void actions.loadFeedGroups().catch(() => undefined).finally(() => { if (on) setGroupsRead(true); });
    return () => { on = false; };
  }, [params.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const groupWaiting = !!shareTo && !groupsRead;
  const groupGone = !!shareTo && groupsRead && !feedGroups.some((g) => g.id === shareTo);
  // A group post stays out of everything public: no map court, never offered for CourtSide's Instagram.
  const groupPost = !!shareTo;
  // The session being posted, held from the moment the page opens so a
  // refresh of your sessions in the meantime cannot change what is posted.
  const [opened] = useState<SessionPick | undefined>(() => {
    const activity = params.activity ? detectedActivities.find((x) => x.id === params.activity) : undefined;
    if (activity) return { type: 'tracker', activity, session: sessions.find((x) => x.activityId === activity.id) };
    const logged = params.session ? sessions.find((x) => x.id === params.session) : undefined;
    return logged ? { type: 'logged', session: logged } : undefined;
  });
  // Heart rate only ever goes on a confirmed adult's post.
  const adult = currentUser?.ageGroup === 'adult';
  const [attached, setAttached] = useState(!!opened);
  // One session, one post: whether this one is on a post of yours already.
  // The app may hold only the newest few of your posts, so they are asked
  // for fresh first; Share waits for that answer (or for it to fail).
  const [postsChecked, setPostsChecked] = useState(!opened);
  useEffect(() => {
    if (!opened) return undefined;
    let on = true;
    void actions.loadMySessionPosts().finally(() => { if (on) setPostsChecked(true); });
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openedPosted = !!opened && posts.some((p) => p.authorId === currentUserId && (opened.type === 'tracker' ? p.session?.activityId === opened.activity.id : p.session?.sessionId === opened.session.id));
  // Already posted: the stats come off, and this can only be a plain post.
  useEffect(() => { if (openedPosted) setAttached(false); }, [openedPosted]);
  const withStats = attached && !openedPosted;
  // A session attached to a normal Post or Clip from "Add session stats".
  const [statsPick, setStatsPick] = useState<SessionPick | null>(null);
  // Attaching it logged it on the way (a tracker's session nobody had logged).
  const [justLogged, setJustLogged] = useState(false);
  const [showHr, setShowHr] = useState(false);
  const hrTouched = useRef(false);
  // Read once the page opens, whichever way a tracker's session gets attached.
  useEffect(() => {
    if (!currentUserId) return;
    let live = true;
    try {
      void AsyncStorage.getItem(showHrKey(currentUserId)).then((v) => { if (live && !hrTouched.current) setShowHr(v === '1'); }).catch(() => undefined);
    } catch { /* storage unavailable: it starts off */ }
    return () => { live = false; };
  }, [currentUserId]);
  const flipHr = (on: boolean) => {
    hrTouched.current = true;
    setShowHr(on);
    if (!currentUserId) return;
    try { void AsyncStorage.setItem(showHrKey(currentUserId), on ? '1' : '0').catch(() => undefined); } catch { /* not remembered, still applied */ }
  };
  // Opened from the weekly challenge: its tag starts the caption, which is what makes the clip an entry.
  // A challenge takes a clip and nothing else: no Post, Instant or Thread here,
  // the phone's videos open straight away, and a photo is never taken.
  const challenge = useMemo(() => challengeFor(), []);
  const entering = params.challenge === challenge.tag;
  useEffect(() => { if (params.mode === 'story') router.replace('/hit'); }, [params.mode]);
  // A hit arrives here with its photo already taken: straight to the form.
  // The camera's photo travels in memory; the address only says one is waiting.
  const shotUri = params.shot === 'pending' ? takePendingShot() : params.shot;
  const isHit = params.mode === 'hit' && !!shotUri;
  // A session being posted goes straight to the form too: the photo is optional.
  const [stage, setStage] = useState<Stage>(isHit ? 'form' : opened ? 'form' : 'choose');
  // The courts around you start loading while you pick and edit, so Add
  // location opens on a full list (it asks for the same spot, from the same cache).
  useEffect(() => {
    if (!currentUser) return;
    const mine = lastSeen[currentUser.id];
    const near = homeFor(currentUser, detectedCoords ?? (mine ? { lat: mine.lat, lng: mine.lng } : null));
    if (!near) return;
    void fetchCourts(near).catch(() => undefined);
    void fetchCourts(near, 25000).catch(() => undefined);
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Create box rises and grows into place with a small spring when it
  // opens, and plays that backwards when it closes, instead of only fading.
  const pop = useSharedValue(0);
  useEffect(() => { pop.value = withSpring(1, { damping: 15, stiffness: 190, mass: 0.8 }); }, [pop]);
  // Closing is its own motion, not the opening played backwards: from the
  // first frame the box starts fading, sinks a little and shrinks slightly,
  // and the dimmed page behind it fades with it, so everything leaves as one.
  const leave = useSharedValue(0);
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.6) * (1 - leave.value),
    transform: [
      { translateY: (1 - pop.value) * 28 + leave.value * 16 },
      { scale: (0.94 + 0.06 * pop.value) * (1 - 0.05 * leave.value) },
    ],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value }));
  // The Create box never runs off a short screen: it is held to the screen's
  // height (inside the notch and home bar), its title and × stay put, and
  // the choices under them scroll if they still don't fit. On a short
  // screen (an iPhone SE) the cards are a little tighter, and on a shorter
  // one (a small Android) tighter again, with smaller icons, so they all fit.
  // A challenge entry's one card is left exactly as it was.
  const { height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuMaxH = Math.max(320, windowH - insets.top - insets.bottom - 40);
  const tight = windowH < 760 && !entering;
  const tighter = windowH < 700 && !entering;
  const choiceIcon = tighter ? 24 : 28;
  const navigation = useNavigation();
  const closing = useRef(false);
  const closeMenu = () => {
    if (closing.current) return;
    closing.current = true;
    // The page's own fade would run after the box has already gone, leaving
    // an invisible layer that swallows taps for a moment; it is switched off
    // now, well before the page leaves.
    navigation.setOptions({ animation: 'none' });
    leave.value = withTiming(1, { duration: 210, easing: Easing.out(Easing.cubic) }, (done) => { if (done) runOnJS(goBackNow)(); });
  };
  // While the box is up, the + in the tab bar can close it the same way.
  const closeRef = useRef(closeMenu);
  closeRef.current = closeMenu;
  useEffect(() => (stage === 'choose' ? registerCreateClose(() => closeRef.current()) : undefined), [stage]);
  const [mode, setMode] = useState<Mode>(isHit ? 'hit' : params.mode === 'story' ? 'story' : entering ? 'clip' : 'post');
  const [media, setMedia] = useState<PickedMedia | null>(isHit ? { uri: shotUri as string, label: 'Instant', kind: 'photo', thumbnailUrl: shotUri as string, orientation: 'portrait' } : null);
  // A session's post goes where its picture goes (owner, Oct 2): with a video
  // it is a Clip (under Clips, in the reel), otherwise a Post.
  const openedClip = !!opened && media?.kind === 'video';
  // A post is 4:5 upright, the way the feed shows it; a clip and a story fill a phone screen (9:16).
  const portraitRatio = mode === 'post' && !openedClip ? 4 / 5 : 9 / 16;
  // The pick as it came off the device. The editor always opens on this, so
  // a cut photo is never cut twice and a clip's edits can be revisited.
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  // What the edit step decided: where a clip starts and stops, how fast and how loud it plays, and its crop.
  const [edit, setEdit] = useState<Pick<EditedMedia, 'trimStart' | 'trimEnd' | 'muted' | 'volume' | 'speed' | 'crop' | 'coverAt'>>({});
  const [body, setBody] = useState(entering ? `#${challenge.tag} ` : '');
  const inChallenge = mode === 'clip' && new RegExp(`#${challenge.tag}\\b`, 'i').test(body);
  const [minutes, setMinutes] = useState('');
  // The minutes box shows "90 min" at rest and just the number while typing.
  const [minutesFocused, setMinutesFocused] = useState(false);
  const minutesInput = useRef<TextInput>(null);
  const minutesRow = useRef<View>(null);
  const reveal = useRevealOnFocus();
  // People tagged in the post: chips under the caption, added from a short search.
  const [tagged, setTagged] = useState<string[]>([]);
  // Opened from a court's page ("Post from here"): that court is already the place.
  const [location, setLocation] = useState(params.courtName?.trim() ?? '');
  // The court it was played on, when the location was picked from the courts list.
  const [court, setCourt] = useState<TaggedCourt | null>(() => {
    const lat = Number(params.lat); const lng = Number(params.lng); const name = params.courtName?.trim();
    return params.courtId && name && params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng) ? { id: params.courtId, name, lat, lng } : null;
  });
  const [featureOk, setFeatureOk] = useState(true);
  // "Played at …?": the named court you are standing at right now (within
  // about 500 feet of where the phone says you are, with Location on), offered
  // once above Add location so a post lands on that court's page. Only the
  // phone's position at this moment: never your last shared spot, your
  // profile's city or a guess. Never for someone not known to be an adult: a
  // court tag says where a minor regularly plays (owner decision 7).
  const [nearCourt, setNearCourt] = useState<TaggedCourt | null>(null);
  const [nearWaved, setNearWaved] = useState(false);
  const canSuggest = !!currentUser && !notKnownAdult(currentUser) && locationEnabled;
  // Asked fresh as compose opens, not the spot the app noted when it started:
  // an app left open for days would otherwise offer Monday's court on
  // Wednesday. No answer within a few minutes' age, no suggestion.
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!canSuggest) { setHere(null); return undefined; }
    let on = true;
    getPosition({ recentMs: 3 * 60_000 }).then((r) => { if (on) setHere(r.ok ? { lat: r.lat, lng: r.lng } : null); }).catch(() => undefined);
    return () => { on = false; };
  }, [canSuggest]);
  const hereLat = here?.lat;
  const hereLng = here?.lng;
  useEffect(() => {
    if (!canSuggest || hereLat === undefined || hereLng === undefined) { setNearCourt(null); return undefined; }
    const at = { lat: hereLat, lng: hereLng };
    let on = true;
    const pick = (list: Court[]) => {
      if (!on) return;
      const nearest = courtRows(list, at).find((r) => r.c.name !== 'Tennis courts');
      setNearCourt(nearest && nearest.miles <= 0.1 ? { id: nearest.c.id, name: labelOf(nearest.c), lat: nearest.c.lat, lng: nearest.c.lng } : null);
    };
    const kept = peekCourts(at);
    if (kept) pick(kept);
    else fetchCourts(at).then(pick).catch(() => undefined);
    return () => { on = false; };
  }, [canSuggest, hereLat, hereLng]);

  // A session's post needs its stats or a picture; anything else needs a picture.
  const canSubmit = opened ? (withStats && postsChecked) || !!media?.uri : !!media?.uri && (mode !== 'clip' || media.kind === 'video');
  // "Add session stats" is for a Post or a Clip, never a challenge entry (the
  // weekly clip stays exactly as it was) and never a story or an instant.
  const statsRow = !opened && !entering && !inChallenge && (mode === 'post' || mode === 'clip');
  // The players tagged in the session on this post (migration 62): asked to
  // accept there, so Tag players lists them apart and never tags them
  // straight onto the post; anyone tagged here before the session went on
  // moves to that list.
  const statsSession = (withStats ? opened : statsRow ? statsPick : null)?.session;
  const fromSession = statsSession && currentUserId
    ? tagsOnSession(sessionTags, statsSession.id, currentUserId).filter(isActive).map((t) => ({ id: t.taggedId, accepted: t.status === 'accepted' }))
    : [];
  const fromSessionKey = fromSession.map((f) => f.id).join(',');
  useEffect(() => {
    if (!fromSessionKey) return;
    const ids = new Set(fromSessionKey.split(','));
    setTagged((was) => (was.some((id) => ids.has(id)) ? was.filter((id) => !ids.has(id)) : was));
  }, [fromSessionKey]);
  const pickStats = () => openSessionPicker((pick, logged) => { setStatsPick(pick); setJustLogged(logged); });

  // A quick second tap on Share would post it twice.
  const sent = useRef(false);
  const submit = () => {
    if (!canSubmit || groupWaiting || groupGone || sent.current) return;
    sent.current = true;

    if (mode === 'story' || mode === 'hit') {
      actions.addStory({
        caption: body.trim() || undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: mode === 'hit' ? 'Instant' : media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      });
      landOnFeed();
      return;
    }

    if (opened) {
      // The stats go on only while attached (and never twice: once your posts
      // were checked, one already carrying it takes them off), and such a
      // post is never offered for CourtSide's Instagram (the server holds
      // that rule too). Not a post type of its own: a Clip with a video, a
      // Post otherwise, as from "Add session stats".
      const stats = withStats && postsChecked;
      actions.addPost({
        kind: openedClip ? 'clip' : 'note',
        orientation,
        trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
        body: body.trim() || (stats ? pickCaption(opened) : ''),
        tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
        taggedUserIds: tagged.length ? tagged : undefined,
        location: location.trim() || undefined,
        court: location.trim() && court && !groupPost ? court : undefined,
        featureOk: stats || groupPost ? false : featureOk ? undefined : false,
        groupId: shareTo ?? undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
        session: stats ? statsOf(opened, showHr, adult) : undefined,
      });
      const firstPost = !posts.some((p) => p.authorId === currentUserId);
      if (shareTo) openGroupFeed(shareTo); else landOnFeed();
      if (firstPost) setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite' }), 1800);
      return;
    }

    const onCourt = Number(minutes);
    // A session from "Add session stats" rides on the Post or Clip, which stays
    // a Post or a Clip (and lands under Posts or Clips on the profile). Like a
    // post made from a session, it is never offered for CourtSide's Instagram.
    const stats = statsRow && statsPick ? statsOf(statsPick, showHr, adult) : undefined;
    actions.addPost({
      kind: mode === 'clip' ? 'clip' : 'note',
      orientation,
      // The cover's moment is the editor's own bookmark, not part of the post.
      trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
      body: body.trim(),
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      taggedUserIds: tagged.length ? tagged : undefined,
      location: location.trim() || undefined,
      court: location.trim() && court && !groupPost ? court : undefined,
      featureOk: stats || groupPost ? false : featureOk ? undefined : false,
      groupId: shareTo ?? undefined,
      imageUrl: media?.kind === 'photo' ? media.uri : undefined,
      videoUrl: media?.kind === 'video' ? media.uri : undefined,
      mediaLabel: media?.label,
      thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
      session:
        stats ?? (onCourt > 0
          ? { focus: 'On court', minutes: onCourt, drills: [] }
          : undefined),
    });
    // The first post is the moment to ask who they hit with, but only after
    // they have seen it go up: a light nudge on the feed, not a whole screen.
    const firstPost = !posts.some((p) => p.authorId === currentUserId);
    if (shareTo) openGroupFeed(shareTo); else landOnFeed();
    if (firstPost) setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite' }), 1800);
  };

  const pick = (next: PickedMedia | null) => {
    if (!next) return;
    // A challenge entry is a clip. The phone's library shows only videos for
    // it; a browser's file box can still offer a photo, which is turned away.
    if (entering && next.kind !== 'video') { setPickError(`The ${challenge.title.toLowerCase()} challenge takes a clip. Pick a video.`); return; }
    addToBank(next);
    setPicked(next);
    setMedia(next);
    setOrientation(next.orientation ?? 'portrait');
    setEdit({});
    // A clip or photo goes through the edit step first; a hit already has its shot.
    setStage(mode === 'hit' ? 'form' : 'edit');
  };

  // Straight to the phone's library from the + menu; a cancel leaves the menu up.
  const [pickError, setPickError] = useState('');
  // While a video is being picked and converted (a few seconds on iPhone), the box says so.
  const [preparing, setPreparing] = useState<null | 'video' | 'all'>(null);
  // The ring closes fully before the note goes, so it is seen to finish.
  const [prepDone, setPrepDone] = useState(false);
  // One library at a time: a tap on the clip button in the moment before the
  // challenge opens the library by itself would otherwise ask for a second.
  const picking = useRef(false);
  const openDevice = async (selection: 'video' | 'all') => {
    if (picking.current) return;
    picking.current = true;
    setPickError('');
    // The phone never says when the library closes and the converting starts,
    // so the note waits out the library's own slide-up rather than flashing
    // under it. A browser converts nothing, so it says nothing there.
    const hold = Platform.OS === 'web' ? null : setTimeout(() => setPreparing(selection), 600);
    let chosen: PickedMedia | null = null;
    let failed = false;
    try {
      chosen = await pickFromDevice(selection);
      if (chosen) pick(chosen);
    } catch (err) {
      failed = true;
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      picking.current = false;
      if (hold) clearTimeout(hold);
      setPrepDone(true);
      setTimeout(() => { setPreparing(null); setPrepDone(false); }, 300);
    }
    // Entering the challenge, this box is only the way to your videos:
    // closing them without a pick closes it too, back to the challenge.
    // (A pick that failed stays, with the reason and a way to try again.)
    if (entering && !chosen && !failed) closeMenu();
  };

  // Entering the challenge on a phone: no menu, straight into your videos,
  // once the box has finished arriving (the phone will not open its library
  // over a page still on its way in). A browser opens its file box only from
  // a tap, so there the one clip button waits for that tap.
  useEffect(() => {
    if (!entering || isHit || Platform.OS === 'web') return undefined;
    let opened = false;
    const open = () => { if (opened) return; opened = true; void openDevice('video'); };
    const events = navigation as unknown as { addListener: (name: string, fn: (e?: { data?: { closing?: boolean } }) => void) => () => void };
    const stop = events.addListener('transitionEnd', (e) => { if (!e?.data?.closing) open(); });
    // In case the page never says it has arrived.
    const fallback = setTimeout(open, 700);
    return () => { opened = true; clearTimeout(fallback); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (stage === 'choose') return <View style={styles.choiceBackdrop}>
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}><SheetBackdrop /></Reanimated.View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close create menu" onPress={closeMenu} style={StyleSheet.absoluteFill}/>
    <Reanimated.View style={[styles.choiceSheet, tight && styles.choiceSheetTight, { maxHeight: menuMaxH }, popStyle]}>
      <View style={styles.choiceHeader}><Text style={styles.choiceTitle}>{entering ? challenge.title : 'Create'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeMenu} hitSlop={10}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
      <ScrollView style={styles.choiceScroll} contentContainerStyle={[styles.choiceList, tight && styles.choiceListTight]} bounces={false} showsVerticalScrollIndicator={false}>
      <Reanimated.View entering={arrive(0)}><Pressable accessibilityRole="button" accessibilityLabel={entering ? `Choose your clip for the ${challenge.title} challenge` : 'Create a clip'} onPress={() => { setMode('clip'); void openDevice('video'); }} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter, entering && styles.choiceChallenge]}>
        {preparing === 'video' ? <PreparingRing size={choiceIcon} done={prepDone} /> : <Ionicons name={entering ? 'trophy-outline' : 'videocam-outline'} size={choiceIcon} color={entering ? colors.brand : colors.textMuted}/>}<Text style={styles.choiceLabel}>{entering ? 'Choose your clip' : 'Clip'}</Text><Text style={styles.note}>{preparing === 'video' ? 'Getting your video ready — shrinking it so it posts fast.' : entering ? `A video from your phone. #${challenge.tag} is already in the caption.` : 'Share a video from your device.'}</Text>
      </Pressable></Reanimated.View>
      {/* Entering the challenge: the clip is the only way in, so nothing else is offered. */}
      {entering ? null : <Reanimated.View entering={arrive(1)}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => { setMode('post'); void openDevice('all'); }} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        {preparing === 'all' ? <PreparingRing size={choiceIcon} done={prepDone} /> : <Ionicons name="images-outline" size={choiceIcon} color={colors.textMuted}/>}<Text style={styles.choiceLabel}>Post</Text><Text style={styles.note}>{preparing === 'all' ? 'Getting it ready…' : 'Choose from your photos and videos.'}</Text>
      </Pressable></Reanimated.View>}
      {pickError ? <Text style={styles.pickError}>{pickError}</Text> : null}
      {entering ? null : <Reanimated.View entering={arrive(2)}><Pressable accessibilityRole="button" accessibilityLabel="Take an instant" onPress={() => router.replace('/hit')} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        <Ionicons name="camera-outline" size={choiceIcon} color={colors.textMuted}/><Text style={styles.choiceLabel}>Instant</Text><Text style={styles.note}>A photo after you play. Up on the feed for a day.</Text>
      </Pressable></Reanimated.View>}
      {entering ? null : <Reanimated.View entering={arrive(3)}><Pressable accessibilityRole="button" accessibilityLabel="Create a thread or question" onPress={() => router.replace('/ask')} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        <Ionicons name="chatbubbles-outline" size={choiceIcon} color={colors.textMuted}/><Text style={styles.choiceLabel}>Thread or question</Text><Text style={styles.note}>Ask the community or start a conversation.</Text>
      </Pressable></Reanimated.View>}
      {/* Logging is not posting: a quiet line under the four ways to post, private, for the streak. */}
      {entering ? null : <Reanimated.View entering={arrive(4)}><Pressable accessibilityRole="button" accessibilityLabel="Log a session. Private, counts toward your streak" onPress={() => router.replace('/log-session')} style={({ pressed }) => [styles.choiceQuiet, pressed && { opacity: 0.6 }]}>
        <Ionicons name="add-circle-outline" size={20} color={colors.textMuted}/>
        <View style={styles.choiceQuietWords}><Text style={styles.choiceQuietLabel}>Log a session</Text><Text style={styles.note}>Private · counts toward your streak</Text></View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint}/>
      </Pressable></Reanimated.View>}
      </ScrollView>
    </Reanimated.View>
  </View>;

  if (stage === 'edit' && media) {
    // Back from the caption, the editor reopens on the original pick with
    // everything it decided last time still in place. A photo's zoom, turn
    // and drag are not carried back (it reopens uncut); its frame choice is.
    const source = picked ?? media;
    const returning = media !== source;
    const initial = source.kind === 'video'
      ? { ...edit, orientation: returning ? orientation : undefined, cover: media.thumbnailUrl }
      : { orientation: returning ? orientation : undefined };
    return (
      <View style={[styles.backdrop, { backgroundColor: '#000' }]}>
        <MediaEditor
          media={source}
          portraitRatio={portraitRatio}
          initial={initial}
          // Back means "wrong one": straight back into your photos to pick again,
          // not out to the menu. Stories go back to their own library.
          onBack={() => {
            // A session's photo is optional: back drops it and returns to the post.
            if (opened) { setMedia(null); setPicked(null); setStage('form'); return; }
            if (params.mode === 'story') { setStage('library'); return; }
            setStage('choose');
            void openDevice(mode === 'clip' ? 'video' : 'all');
          }}
          onDone={(result) => {
            setMedia(result.media);
            setOrientation(result.orientation);
            setEdit({ trimStart: result.trimStart, trimEnd: result.trimEnd, muted: result.muted, volume: result.volume, speed: result.speed, crop: result.crop, coverAt: result.coverAt });
            setStage('form');
          }}
        />
      </View>
    );
  }

  if (stage === 'library') {
    // Everything picked this session plus anything you have already posted,
    // so a clip can be reused without another trip through the file dialog.
    const posted: PickedMedia[] = posts
      .filter((p) => p.authorId === currentUserId && (p.videoUrl || p.imageUrl))
      .map((p) => ({
        uri: p.videoUrl ?? p.imageUrl,
        label: p.mediaLabel ?? (p.videoUrl ? 'Video' : 'Photo'),
        kind: p.videoUrl ? 'video' as const : 'photo' as const,
        thumbnailUrl: p.thumbnailUrl ?? p.imageUrl,
      }));
    const seen = new Set<string>();
    const bank = [...getBank(), ...posted].filter((item) => {
      if (!item.uri || seen.has(item.uri)) return false;
      if (mode === 'clip' && item.kind !== 'video') return false;
      seen.add(item.uri);
      return true;
    });

    return (
      <View style={styles.backdrop}>
        <SheetBackdrop />
        <View style={styles.sheet}>
          <Screen
            title={mode === 'clip' ? 'Your videos' : 'Your library'}
            compactTitle
            onBack={() => (params.mode === 'story' ? router.back() : setStage('choose'))}
          >
            <MediaPicker compact selection={mode === 'clip' ? 'video' : 'all'} label={mode === 'clip' ? 'New video from your device' : 'New from your device'} value={null} onChange={pick} />
            <Text style={styles.libraryTitle}>{bank.length ? 'Recent' : 'Nothing here yet'}</Text>
            {bank.length ? (
              <ScrollView contentContainerStyle={styles.grid}>
                {bank.map((item) => (
                  <Pressable
                    key={item.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${item.label}`}
                    onPress={() => pick(item)}
                    style={styles.tile}
                  >
                    {item.thumbnailUrl ? (
                      <Image accessibilityIgnoresInvertColors source={{ uri: item.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="videocam" size={26} color={colors.textFaint} />
                      </View>
                    )}
                    {item.kind === 'video' ? <Ionicons name="play" size={16} color="white" style={styles.tileBadge} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.note}>Videos and photos you pick show up here so you can use them again.</Text>
            )}
          </Screen>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.backdrop, mode === 'hit' && { backgroundColor: colors.bg }]}>
      {mode === 'hit' ? null : <SheetBackdrop />}
      <View style={styles.sheet}>
        <Screen
          title={mode === 'clip' || openedClip ? 'New clip' : mode === 'post' ? 'New post' : mode === 'story' ? 'New story' : 'New instant'}
          compactTitle
          onBack={() => (mode === 'hit' ? router.navigate('/hit') : opened && !media ? router.back() : setStage('edit'))}
          right={<Button label={mode === 'story' || mode === 'hit' ? 'Post instant' : 'Share'} variant="secondary" onPress={submit} disabled={!canSubmit || groupWaiting || groupGone} />}
        >
          <View style={mode === 'story' || mode === 'hit' ? styles.form : null}>
            {opened ? (
              <AttachSessionStats
                pick={opened}
                attached={withStats}
                onAttach={setAttached}
                adult={adult}
                showHr={showHr}
                onShowHr={flipHr}
                posted={openedPosted}
                loggedMinutes={opened.type === 'tracker' ? sessions.find((x) => x.activityId === opened.activity.id)?.minutes : undefined}
              />
            ) : null}
            <View style={styles.stage}>
              {opened && !media ? (
                // No picture yet: an invitation to add one, not an empty frame to fill.
                // It is optional only while the stats are on: without them, the picture is the post.
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={withStats ? 'Add a photo or video (optional)' : 'Add a photo or video'}
                    onPress={() => { void openDevice('all'); }}
                    style={({ pressed }) => [styles.addMedia, pressed && { opacity: 0.6 }]}
                  >
                    {preparing ? <PreparingRing size={22} done={prepDone} /> : <Ionicons name="images-outline" size={22} color={colors.textMuted} />}
                    <Text style={styles.addMediaText}>{preparing ? 'Getting it ready…' : withStats ? 'Add a photo or video (optional)' : 'Add a photo or video'}</Text>
                  </Pressable>
                  {pickError ? <Text style={[styles.pickError, styles.addMediaError]}>{pickError}</Text> : null}
                </>
              ) : mode === 'hit' && media?.uri ? (
                // The hit is what the camera took, full stop: shown plainly, nothing to click.
                <View style={styles.hitFrame}>
                  <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your instant" />
                </View>
              ) : (
                <MediaPicker bare orientation={orientation} portraitRatio={portraitRatio} selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} trim={edit} onCoverAt={(at) => setEdit((was) => ({ ...was, coverAt: at }))} />
              )}
            </View>
            {mode === 'hit' ? (
              <View style={styles.hitMeta}>
                <View style={styles.hitPill}><Ionicons name="time-outline" size={13} color={colors.brand} /><Text style={styles.hitPillText}>24 hours</Text></View>
                <Text style={styles.hitMetaText}>On the feed for a day, then kept in your archive.</Text>
              </View>
            ) : null}
            {mode === 'story' || mode === 'hit' ? (
              <Field
                value={body}
                onChangeText={setBody}
                placeholder={mode === 'story' ? 'Add a line (optional)' : 'How did it go? (optional)'}
                multiline
                minHeight={64}
                mentions
              />
            ) : (
              <>
                {/* The caption, with no label over it: the box says what it is. */}
                <View style={styles.caption}>
                  <Field accessibilityLabel="Caption" value={body} onChangeText={setBody} placeholder={opened && !openedPosted ? `${pickCaption(opened)} — how did it go?` : 'Write a caption…'} multiline minHeight={88} mentions />
                </View>
                {inChallenge ? (
                  <View style={styles.challengeChip} accessible accessibilityLabel={`Entering this week's challenge: ${challenge.title}`}>
                    <Ionicons name="trophy-outline" size={14} color={colors.brand} />
                    <Text style={styles.challengeChipText}>Entering {challenge.title}</Text>
                  </View>
                ) : null}
                {/* Share to: shown once you are in a group. Everyone is the default. */}
                {(feedGroups.length || shareTo) && !inChallenge ? (
                  <View style={styles.shareTo} accessibilityRole="radiogroup" accessibilityLabel="Share to">
                    <Text style={styles.shareToLabel}>Share to</Text>
                    <View style={styles.shareToChips}>
                      <Chip label="Everyone" selected={!shareTo} onPress={() => setShareTo(null)} />
                      {feedGroups.map((g) => <Chip key={g.id} label={g.name} selected={shareTo === g.id} onPress={() => setShareTo(g.id)} />)}
                    </View>
                    {groupWaiting ? <Text style={styles.shareToNote}>Checking your groups…</Text>
                      : groupGone ? <Text style={styles.shareToNote}>You're not in that group any more. Pick Everyone or one of your groups to share.</Text>
                      : shareTo ? <Text style={styles.shareToNote}>Only people in {feedGroups.find((g) => g.id === shareTo)?.name ?? 'the group'} will see this.</Text> : null}
                  </View>
                ) : null}
                {/* One list of rows, the Settings rows' size without their card. */}
                <View style={styles.rows}>
                  <TagPlayers variant="row" tagged={tagged} onChange={setTagged} fromSession={fromSession} />
                  {!location && nearCourt && !nearWaved && (mode === 'post' || mode === 'clip') ? (
                    <FormRow
                      line
                      lead={<CourtGlyph size={16} color={colors.brand} />}
                      label={`Played at ${nearCourt.name}?`}
                      accessibilityLabel={`Played at ${nearCourt.name}? Tap to tag it`}
                      onPress={() => { setLocation(nearCourt.name); setCourt(nearCourt); }}
                      control={
                        <Pressable accessibilityRole="button" accessibilityLabel="Not this court" hitSlop={12} onPress={() => setNearWaved(true)}>
                          <Ionicons name="close" size={18} color={colors.textFaint} />
                        </Pressable>
                      }
                    />
                  ) : null}
                  {location ? (
                    <FormRow
                      line
                      lead={court ? <CourtGlyph size={16} color={colors.brand} /> : <Ionicons name="location" size={20} color={colors.brand} />}
                      label={location}
                      accessibilityLabel={`Location: ${location}. Tap to change it`}
                      onPress={() => openPlacePicker((value, picked) => { setLocation(value); setCourt(picked ?? null); }, location)}
                      control={
                        <Pressable accessibilityRole="button" accessibilityLabel="Remove location" hitSlop={12} onPress={() => { setLocation(''); setCourt(null); }}>
                          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                        </Pressable>
                      }
                    />
                  ) : (
                    <FormRow line icon="location-outline" label="Add location" chevron onPress={() => openPlacePicker((value, picked) => { setLocation(value); setCourt(picked ?? null); }, location)} />
                  )}
                  {/* A Post or a Clip can carry one of your sessions: a row to pick it, then its stats in the row's place. */}
                  {statsRow && !statsPick ? (
                    <FormRow line icon="stopwatch-outline" label="Add session stats" chevron onPress={pickStats} />
                  ) : null}
                  {statsRow && statsPick ? (
                    <View style={styles.statsCard}>
                      <View style={styles.statsRule} />
                      <AttachSessionStats
                        pick={statsPick}
                        attached
                        onAttach={(on) => { if (!on) { setStatsPick(null); setJustLogged(false); } }}
                        onChange={pickStats}
                        adult={adult}
                        showHr={showHr}
                        onShowHr={flipHr}
                        posted={false}
                        loggedMinutes={statsPick.type === 'tracker' ? statsPick.session?.minutes : undefined}
                        justLogged={justLogged}
                      />
                    </View>
                  ) : null}
                  {/* A session already knows its time on court. */}
                  {opened || (statsRow && statsPick) ? null : <FormRow
                    ref={minutesRow}
                    line
                    icon="time-outline"
                    label="Minutes on court"
                    // The box itself is what a screen reader lands on; the row is its label.
                    accessible={false}
                    accessibilityRole="none"
                    onPress={() => minutesInput.current?.focus()}
                    control={
                      <TextInput
                        ref={minutesInput}
                        value={minutesFocused || !minutes ? minutes : `${minutes} min`}
                        onChangeText={(text) => setMinutes(text.replace(/\D/g, '').slice(0, 3))}
                        placeholder="Add"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="number-pad"
                        accessibilityLabel="Minutes on court"
                        onFocus={() => { setMinutesFocused(true); reveal(minutesRow.current); }}
                        onBlur={() => setMinutesFocused(false)}
                        style={styles.minutesInput}
                      />
                    }
                  />}
                  {/* A post with session stats is never offered for CourtSide's Instagram. */}
                  {(opened && withStats) || (statsRow && statsPick) || groupPost ? null : <FormRow
                    line
                    icon="megaphone-outline"
                    label="Feature on CourtSide's Instagram"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: featureOk }}
                    accessibilityLabel="Feature on CourtSide's Instagram"
                    onPress={() => setFeatureOk((on) => !on)}
                    // The row is the switch: the toggle only shows its state, so one tap flips it once.
                    accessory={<View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Toggle value={featureOk} onChange={setFeatureOk} /></View>}
                  />}
                </View>
              </>
            )}
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  choiceBackdrop: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', padding: 20 },
  choiceSheet: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 20, gap: 12, backgroundColor: colors.bg },
  choiceSheetTight: { padding: 16, gap: 10 },
  // Only the choices scroll, and only when the box is held shorter than they are.
  choiceScroll: { flexGrow: 0, flexShrink: 1 },
  choiceList: { gap: 12 },
  choiceListTight: { gap: 8 },
  choiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  choiceTitle: { fontSize: 22, ...font('700'), color: colors.text },
  choiceOption: { padding: 20, gap: 8, borderRadius: 18, backgroundColor: colors.surface },
  choiceOptionTight: { paddingVertical: 14, paddingHorizontal: 16, gap: 5 },
  choiceOptionTighter: { paddingVertical: 12, gap: 4 },
  choiceChallenge: { borderWidth: 1, borderColor: colors.brand },
  choiceLabel: { fontSize: 16, ...font('600'), color: colors.text },
  // "Log a session": a plain line under the cards, no card of its own, so it reads as the quieter choice.
  choiceQuiet: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, paddingTop: 14, paddingBottom: 2, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  choiceQuietWords: { flex: 1, gap: 2 },
  choiceQuietLabel: { fontSize: 15, ...font('600'), color: colors.text },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
  sheet: {
    height: '100%',
    maxWidth: 700,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  form: { gap: spacing.md, paddingTop: 0 },
  // Bleed past the screen's own padding so the media runs edge to edge.
  // A little room under the header, so the preview's rounded top corners show.
  stage: { marginTop: spacing.xs },
  // A clip or post: the caption 24 under the preview, the challenge chip 8
  // under that, and the rows 16 under whichever is last.
  caption: { marginTop: spacing.xl },
  shareTo: { gap: spacing.sm, marginTop: spacing.md },
  shareToLabel: { ...typography.smallStrong, color: colors.textMuted },
  shareToChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shareToNote: { ...typography.small, color: colors.textMuted },
  challengeChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing.sm, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  challengeChipText: { ...typography.smallStrong, color: colors.brand },
  rows: { marginTop: spacing.lg },
  minutesInput: { ...typography.body, color: colors.text, textAlign: 'right', width: 88, alignSelf: 'stretch', paddingVertical: 0, paddingHorizontal: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  pickError: { ...typography.small, color: colors.danger, lineHeight: 18 },
  // A session's stats among a Post's or Clip's rows: the thin line above, like the rows either side.
  statsCard: { gap: spacing.md },
  // Starts where the rows' words start (FormRow's 26 icon plus its gap), as theirs does.
  statsRule: { height: StyleSheet.hairlineWidth, marginLeft: 26 + spacing.md, backgroundColor: colors.border },
  // A session's optional picture: a dashed space to add one.
  addMedia: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  addMediaText: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  addMediaError: { marginTop: spacing.sm },
  hitFrame: { width: '100%', aspectRatio: 4 / 3, maxHeight: 520, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center' },
  hitMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hitPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.brandDim },
  hitPillText: { color: colors.brand, fontSize: 12, ...font('600') },
  hitMetaText: { ...typography.small, color: colors.textMuted, flex: 1 },
  libraryTitle: { ...typography.smallStrong, color: colors.textMuted, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tile: { width: '32.5%', aspectRatio: 9 / 12, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  tileBadge: { position: 'absolute', right: 6, bottom: 6, textShadowColor: '#0008', textShadowRadius: 3 },
});
