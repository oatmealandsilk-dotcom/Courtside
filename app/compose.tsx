import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { show as showToast } from '@/lib/toast';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import { whenLanded } from '@/lib/uploads';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import Reanimated, { Easing, FadeInDown, FadeOut, LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { MediaPicker, type PickedMedia } from '@/components/MediaPicker';
import { askMediaSource, fromSource, type MediaSource } from '@/features/compose/mediaSource';
import { MediaEditor, type EditedMedia } from '@/components/MediaEditor';
import { takePendingShot } from '@/features/compose/pendingShot';
import { registerCreateClose } from '@/features/compose/createMenu';
import { SheetBackdrop } from '@/components/SheetBackdrop';
import { MenuSheet } from '@/components/MenuSheet';
import { Button, Chip, Field, Screen, Toggle } from '@/components/ui';
import { alsoShowsIn } from '@/features/groups/groupFeed';
import { openGroupFeed } from '@/features/groups/openGroupFeed';
import { FormRow } from '@/components/FormRow';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { openPlacePicker } from '@/features/places/picker';
import { PreparingRing } from '@/components/PreparingRing';
import { TagPlayers } from '@/components/TagPlayers';
import { AttachSessionStats } from '@/components/AttachSessionStats';
import { pickCaption, statsOf, type SessionPick } from '@/features/activity/recent';
import { openSessionPicker } from '@/features/activity/sessionPicker';
import { firstName, isActive, nextRole, tagsOnSession } from '@/features/activity/sessionTags';
import { addToBank, getBank } from '@/features/compose/mediaBank';
import { Avatar } from '@/components/ui';
import { Chips } from '@/components/sheet/SheetForm';
import { trackerName } from '@/features/activity/lengths';
import { TrackedLength } from '@/components/session/TrackedLength';
import { LogComposerTop, LogDock, DOCK_ROOM } from '@/components/session/LogComposer';
import { AddScore, ScoreField } from '@/components/session/ScoreField';
import { canScore, readScore, scoreText, setsWinner, tookScoreNotKept } from '@/features/activity/score';
import { ZoneGlyph } from '@/components/session/ZoneGlyph';
import { HealthShareRow } from '@/components/session/HealthShareRow';
import { availableShare, chosenShare, loggedNumbers, type HealthNumbers } from '@/features/activity/healthShare';
import { keptAvgHr, keptKcal, readManualStats, wholeNumber, type ManualRead } from '@/features/activity/manualStats';
import { ManualStats } from '@/components/session/ManualStats';
import { useHealthChoice } from '@/features/activity/useHealthChoice';
import type { CardPerson } from '@/components/session/SessionCard';
import { KIND_LABEL, activityDay, fromWho, loggedLabel } from '@/features/activity/format';
import { inSentence, isTennisActivity, workoutName } from '@/features/activity/workouts';
import { canTagKind } from '@/features/activity/sessionTags';
import { shareAction, showLogged, useTrackerSession } from '@/features/activity/useTrackerSession';
import { openWhoPlayed } from '@/features/activity/whoPlayedPicker';
import { hitPrefill, prefillFor } from '@/features/hits/followUp';
import { beatenBy, recordToast } from '@/features/records/records';
import { flybyAfter } from '@/features/flyby/flyby';
import { isMapCourtId } from '@/features/places/courtName';
import { confirm } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import type { ID, PracticeSession, SessionDetail, SessionPlayer, SessionTagStatus } from '@/data/types';
import { useApp } from '@/store/AppContext';
import { courtRows, fetchCourts, peekCourts, type Court } from '@/features/players/courts';
import { labelOf } from '@/features/places/courtName';
import { notKnownAdult } from '@/features/players/age';
import { INSTANT_MAX, POST_MAX } from '@/features/feed/limits';
import { homeFor, type LatLng } from '@/features/players/positions';
import { getPosition } from '@/lib/geo';
import type { TaggedCourt } from '@/data/types';
import { colors, radius, spacing, typography, font } from '@/theme';
import { challengeFor } from '@/features/challenge/weekly';
import { goHome } from '@/lib/goBack';
import { liveDay, liveMinutes, livePlace, liveState, liveTracker, startClock } from '@/features/activity/liveSession';
import { finishLive, openLiveLog } from '@/features/activity/finishLive';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { knownTennisFlags, tennisFlags } from '@/features/activity/flags';
import { useRevealOnFocus } from '@/lib/keyboardScroll';
import { useAndroidBack } from '@/lib/androidBack';

type Mode = 'clip' | 'post' | 'story' | 'hit';
/** What a session was, the log sheet's three. */
const KINDS: { value: PracticeSession['kind']; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'match', label: 'Match' },
  { value: 'fitness', label: 'Fitness' },
];
/**
 * Drills is folded into Practice (Oct 7, owner: "drills and practice are the
 * same thing"). A session that is already Drills (started live before, or
 * one being finished now) keeps its chip, so its choice is never blank.
 */
const WITH_DRILLS: typeof KINDS = [...KINDS.slice(0, 2), { value: 'drills', label: 'Drills' }, KINDS[2]];

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
/**
 * Closing without posting: back to the page underneath, or, when this is the
 * first page open (a lock-screen alert, a link, a reload), to the tabs; a
 * plain back has nowhere to go then and leaves a blank screen.
 */
const goBackNow = () => { if (router.canGoBack()) router.back(); else landOnFeed(); };
/** Each choice in the Create box arrives a moment after the one above it. */
const arrive = (index: number) => FadeInDown.delay(90 + index * 55).duration(260).easing(Easing.out(Easing.cubic));
/** choose → library → form, with back always stepping one page left. */
type Stage = 'choose' | 'library' | 'edit' | 'form';
/**
 * How long a session's "Log it" page stays once saved, so the moment is
 * seen (Oct 7, owner: logging "has to feel more rewarding"): the tick on the
 * button, the streak rolling up. Posting goes on to the feed a little sooner.
 */
const CELEBRATE_MS = 1150;
const CELEBRATE_SHARE_MS = 900;

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
 *
 * Opened from Finish on a live session (?live=1, Oct 7), it is the same
 * "Log it" page, filled in from the clock: see `fromLive` below.
 */
export default function ComposeRoute() {
  const { live } = useLocalSearchParams<{ live?: string }>();
  const { liveSessionRead, liveSession, currentUserId } = useApp();
  // Which trackers' sessions count are known first (kept from the app's start, as a rule), so your
  // tracker's copy of the same game is found and logged as it, never logged twice (liveTracker).
  const [flagsIn, setFlagsIn] = useState(() => live !== '1' || !!knownTennisFlags(currentUserId));
  useEffect(() => {
    if (flagsIn) return undefined;
    let on = true;
    void tennisFlags(currentUserId).finally(() => { if (on) setFlagsIn(true); });
    return () => { on = false; };
  }, [flagsIn]); // eslint-disable-line react-hooks/exhaustive-deps
  // From Finish: decided once, as the page opens (saving ends the live session, and the page must stay put meanwhile).
  const decided = useRef<null | 'log' | 'gone'>(null);
  if (live === '1' && !decided.current) {
    // Opened cold (a reload on the page): the live session is read from the phone first.
    if (!liveSessionRead || !flagsIn) return null;
    decided.current = liveSession && liveSession.userId === currentUserId && liveState(liveSession) === 'finished' ? 'log' : 'gone';
  }
  // Logged or thrown away since (a reload after Save): the plain log sheet instead.
  if (decided.current === 'gone') return <ToLogSheet />;
  return <Compose />;
}

function ToLogSheet() {
  useEffect(() => { router.replace('/log-session'); }, []);
  return null;
}

function Compose() {
  const styles = useThemedStyles(styleDefinitions);
  const { actions, posts, stories, currentUserId, currentUser, detectedCoords, lastSeen, locationEnabled, detectedActivities, sessions, sessionTags, users, hitRequests, blockedIds, feedGroups, feedGroupsOn, liveSession, manualStatsReady } = useApp();

  // The story rail opens this straight at the library with ?mode=story.
  const params = useLocalSearchParams<{ mode?: string; shot?: string; challenge?: string; courtId?: string; courtName?: string; lat?: string; lng?: string; activity?: string; session?: string; hit?: string; group?: string; trim?: string; live?: string }>();
  /*
   * From Finish on a live session (?live=1, Oct 7, owner: "This should
   * function exactly like how our current sessions are logged once you click
   * finish"): this same "Log it" page, filled in from the session, held from
   * the moment the page opened: what it was, the clock's time (pauses left
   * out), the day it started and, for someone known to be an adult, its
   * court as the post's place (the court goes in your private log for
   * anyone, as from a hit). A photo or a clip goes on as for a tracker's
   * session; Post session posts it, Save privately puts it in your log and
   * your streak only. Saved either way, the live session is done with (its
   * bar goes); closed without saving, it waits ("Finished · Log it").
   *
   * One game, logged once (Oct 6, owner): when your tracker timed the same
   * game and nobody has logged it yet (liveTracker), the page is that
   * session's own "Log it", with the clock's time, the kind and the court
   * filled in, so the workout counts as logged and is never offered again.
   * One already in your log is said, since saving again would count it twice.
   */
  const [fromLive] = useState(() => (params.live === '1' && !params.activity && liveSession && liveSession.userId === currentUserId && liveState(liveSession) === 'finished' ? liveSession : null));
  const flagsOn = useTennisFlags();
  const [liveTwins] = useState(() => (fromLive && currentUserId ? liveTracker(fromLive, detectedActivities, { me: currentUserId, flags: flagsOn }) : {}));
  // The live session with no tracker copy waiting: logged from here by hand, with the clock's time.
  const liveOnly = !!fromLive && !liveTwins.waiting;
  const liveMins = fromLive ? liveMinutes(fromLive) : 0;
  // A tracker's session (?activity=, from "Log it", or the tracker's copy of a
  // live session): found among yours, or waited for when the app was opened
  // cold from an alert (useTrackerSession).
  const trackerId = params.activity ?? liveTwins.waiting?.id;
  const tracker = useTrackerSession(trackerId);
  // Share to: everyone (the default, which also shows in each of your groups'
  // feeds, migration 74) or one group only (migration 67). Opened with
  // ?group=<id>, that group only is picked to start with.
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
  // The session being posted, held from the moment it is known so a
  // refresh of your sessions in the meantime cannot change what is posted.
  const [opened, setOpened] = useState<SessionPick | undefined>(() => {
    const activity = tracker.activity;
    if (activity) return { type: 'tracker', activity, session: sessions.find((x) => x.activityId === activity.id) };
    const logged = params.session ? sessions.find((x) => x.id === params.session) : undefined;
    return logged ? { type: 'logged', session: logged } : undefined;
  });
  // Arriving late (opened cold): taken the moment it lands, then held.
  useEffect(() => {
    const activity = tracker.activity;
    if (opened || !activity) return;
    setOpened({ type: 'tracker', activity, session: sessions.find((x) => x.activityId === activity.id) });
    setAttached(true);
  }, [tracker.activity?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The log entry being posted, as your log has it now: a score added from here ("Add score", Oct 6)
  // goes on the card straight away. Only its score and result follow; which session it is stays held.
  const heldLog = opened?.session;
  const liveLog = heldLog ? sessions.find((x) => x.id === heldLog.id) : undefined;
  useEffect(() => {
    if (!liveLog) return;
    setOpened((o) => {
      if (!o?.session || o.session.id !== liveLog.id) return o;
      if (scoreText(o.session.sets) === scoreText(liveLog.sets) && o.session.won === liveLog.won) return o;
      const { sets: _s, won: _w, ...rest } = o.session;
      const session: PracticeSession = { ...rest, ...(liveLog.won !== undefined ? { won: liveLog.won } : {}), ...(liveLog.sets?.length ? { sets: liveLog.sets } : {}) };
      return o.type === 'tracker' ? { ...o, session } : { type: 'logged', session };
    });
  }, [liveLog?.id, scoreText(liveLog?.sets), liveLog?.won]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tennis session of yours with no score yet: a quiet "Add score" by its card (Oct 6), as on Share.
  const addScoreTo = liveLog && liveLog.userId === currentUserId && canScore(liveLog.kind) && !liveLog.fromSessionId && !liveLog.sets?.length ? liveLog.id : undefined;
  // "Share health data" starts on for someone known to be an adult, off for
  // everyone else; anyone can switch it on (owner, Oct 3; migration 72).
  const adult = !!currentUser && !notKnownAdult(currentUser);
  const [attached, setAttached] = useState(!!opened);
  // One session, one post: whether this one is on a post of yours already.
  // The app may hold only the newest few of your posts, so they are asked
  // for fresh first; Share waits for that answer (or for it to fail).
  const [postsChecked, setPostsChecked] = useState(!opened && !trackerId);
  useEffect(() => {
    if (!opened) return undefined;
    let on = true;
    void actions.loadMySessionPosts().finally(() => { if (on) setPostsChecked(true); });
    return () => { on = false; };
  }, [!!opened]); // eslint-disable-line react-hooks/exhaustive-deps
  const openedPosted = !!opened && posts.some((p) => p.authorId === currentUserId && (opened.type === 'tracker' ? p.session?.activityId === opened.activity.id : p.session?.sessionId === opened.session.id));
  // Already posted: the stats come off, and this can only be a plain post.
  useEffect(() => { if (openedPosted) setAttached(false); }, [openedPosted]);
  // Opened on a session that is already posted (an old notification, a second tap): show that post
  // rather than a blank composer (Oct 3, owner). Not after Share here, which posts it on purpose.
  const postedId = openedPosted && opened ? posts.find((p) => p.authorId === currentUserId && (opened.type === 'tracker' ? p.session?.activityId === opened.activity.id : p.session?.sessionId === opened.session.id))?.id : undefined;
  useEffect(() => {
    if (!params.activity || !postedId || sent.current) return;
    showToast({ title: 'You already posted this session', icon: 'checkmark-circle-outline' });
    router.replace(`/post/${postedId}`);
  }, [postedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const withStats = attached && !openedPosted;
  // A session attached to a normal Post or Clip from "Add session stats".
  const [statsPick, setStatsPick] = useState<SessionPick | null>(null);
  // Attaching it logged it on the way (a tracker's session nobody had logged).
  const [justLogged, setJustLogged] = useState(false);
  // "Share health data": remembered on this phone for the next post, one choice per account.
  const [health, setHealth] = useHealthChoice(currentUserId, adult);
  // The numbers a session's post shares: only those chosen that it has, a tracker's or (Oct 8) the ones typed into your log.
  const shareFor = (pick: SessionPick) => chosenShare(health, availableShare(pick.type === 'tracker' ? pick.activity : loggedNumbers(pick.session)));
  // Opened from the weekly challenge: its tag starts the caption, which is what makes the clip an entry.
  // A challenge takes a clip and nothing else: no Post, Instant or Thread here,
  // the phone's videos open straight away, and a photo is never taken.
  const challenge = useMemo(() => challengeFor(), []);
  const entering = params.challenge === challenge.tag;
  // From "Trim to under a minute" on the posting strip (a clip too big to send): straight into Apple's trimmer.
  const trimming = params.trim === '1' && Platform.OS === 'ios';
  useEffect(() => { if (params.mode === 'story') router.replace('/hit'); }, [params.mode]);
  // A hit arrives here with its photo already taken: straight to the form.
  // The camera's photo travels in memory; the address only says one is waiting.
  const shotUri = params.shot === 'pending' ? takePendingShot() : params.shot;
  // Only while Instants are on (features/stories/instantsSwitch): otherwise an old or made-up
  // /compose?mode=hit link opens the Create menu rather than an Instant's form.
  const isHit = params.mode === 'hit' && !!shotUri && knownTennisFlags(currentUserId)?.instants === true;
  // A session being posted goes straight to the form too: the photo is optional.
  const [stage, setStage] = useState<Stage>(isHit ? 'form' : opened || trackerId || params.session || fromLive ? 'form' : 'choose');
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
  // The form leaves the same way (Save privately): fading, sinking a little, a touch smaller.
  const formLeave = useAnimatedStyle(() => ({ opacity: 1 - leave.value, transform: [{ translateY: leave.value * 16 }, { scale: 1 - 0.05 * leave.value }] }));
  // The Create box never runs off a short screen: it is held to the screen's
  // height (inside the notch and home bar), its title and × stay put, and
  // the choices under them scroll if they still don't fit. On a short
  // screen (an iPhone SE) the cards are a little tighter, and on a shorter
  // one (a small Android) tighter again, with smaller icons, so they all fit.
  // Since Session joined them as a fifth card (Oct 6), "short" means anything
  // shorter than a big iPhone's screen (an everyday iPhone, 844 to 874 tall,
  // is a little short of room for five full-size cards), so all five show
  // without scrolling there; a big iPhone gets them full size.
  // A challenge entry's one card is left exactly as it was.
  const { height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuMaxH = Math.max(320, windowH - insets.top - insets.bottom - 40);
  const tight = windowH < 900 && !entering;
  const tighter = windowH < 760 && !entering;
  // The Session card's small menu: Start now, or Log a past one.
  const [sessionChoice, setSessionChoice] = useState(false);
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
  // Android's Back does what each stage's own back does (set just before each
  // stage draws, below): the Create box closes the way its ✕ does, the editor
  // goes back to your photos, the caption back to the editor, a session's post
  // asks "Discard post?". Without it Back threw the whole post away at once.
  const stageBack = useRef<() => boolean>(() => false);
  useAndroidBack(() => stageBack.current());
  const [mode, setMode] = useState<Mode>(isHit ? 'hit' : params.mode === 'story' ? 'story' : entering || trimming ? 'clip' : 'post');
  const [media, setMedia] = useState<PickedMedia | null>(isHit ? { uri: shotUri as string, label: 'Instant', kind: 'photo', thumbnailUrl: shotUri as string, orientation: 'portrait' } : null);
  // A session's post goes where its picture goes (owner, Oct 2): with a video
  // it is a Clip (under Clips, in the reel), otherwise a Post.
  const openedClip = (!!opened || liveOnly) && media?.kind === 'video';
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
  // From Finish, where the session was started, for someone known to be an
  // adult only (a place on a post says where a minor plays: owner decision 7).
  const [location, setLocation] = useState(params.courtName?.trim() || (fromLive && adult ? livePlace(fromLive) : ''));
  // The court it was played on, when the location was picked from the courts list.
  // Only ever put on the post for someone known to be an adult (owner decision
  // 7, below): for anyone else the place goes on as words, without the court.
  const [court, setCourt] = useState<TaggedCourt | null>(() => {
    const lat = Number(params.lat); const lng = Number(params.lng); const name = params.courtName?.trim();
    if (params.courtId && name && params.lat && params.lng && Number.isFinite(lat) && Number.isFinite(lng)) return { id: params.courtId, name, lat, lng };
    return fromLive?.court && adult ? fromLive.court : null;
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
  const canSubmit = liveOnly || (opened ? (withStats && postsChecked) || !!media?.uri : !!media?.uri && (mode !== 'clip' || media.kind === 'video'));
  // "Add session stats" is for a Post or a Clip, never a challenge entry (the
  // weekly clip stays exactly as it was) and never a story or an instant.
  const statsRow = !opened && !entering && !inChallenge && (mode === 'post' || mode === 'clip');
  const pickStats = () => openSessionPicker((pick, logged) => { setStatsPick(pick); setJustLogged(logged); });

  /*
   * "Log it" (Oct 2): a tracker's session opens here, the normal composer,
   * with the session's card at the top. What is added decides what it is: a
   * photo makes it a Post, a clip a Clip, nothing at all a Post that is the
   * session's card. "Save privately" (Oct 7; was "Just log it") puts it in
   * your log and your streak and posts nothing; "Post session" (was Share)
   * logs it and posts it. A session logged already ("Post it", "Try again")
   * has nothing left to choose: Post session alone. A live session's Finish
   * opens this same page (`fromLive`, above).
   */
  const fromHit = useState(() => {
    if (!params.hit) return null;
    const known = hitPrefill(params.hit);
    if (known) return known;
    const h = hitRequests.find((x) => x.id === params.hit);
    return h && currentUserId ? prefillFor(h, currentUserId, users) : null;
  })[0];
  const logNow = liveOnly || (!!trackerId && !openedPosted && (opened?.type === 'tracker' || (!opened && tracker.waiting)));
  // Once the session has opened here, this stays the "Log it" page: Share
  // posts it, which would otherwise turn it into the plain composer (stats
  // taken off) for the moment it takes to close.
  const wasLog = useRef(false);
  if (logNow && opened) wasLog.current = true;
  const logMode = logNow || wasLog.current;
  // Logged before this page opened: what it was is already said.
  const openedLog = opened?.type === 'tracker' ? opened.session : undefined;
  // A workout other than tennis (a run, a lift: Oct 5) logs as fitness, with
  // what it was kept on the log; it has no Practice/Match/Drills choice, no
  // result and nobody to tag. Tennis is exactly as it was.
  const workoutLog = opened?.type === 'tracker' && !isTennisActivity(opened.activity);
  const workoutSport = opened?.type === 'tracker' && !isTennisActivity(opened.activity) ? opened.activity.sport : undefined;
  const [kind, setKind] = useState<PracticeSession['kind']>(() => (workoutLog ? 'fitness' : fromHit?.kind ?? fromLive?.kind ?? 'practice'));
  const [kinds] = useState(() => (kind === 'drills' ? WITH_DRILLS : KINDS));
  // Opened cold, the workout can arrive after the page: fitness from then on.
  useEffect(() => { if (workoutLog) setKind('fitness'); }, [workoutLog]);
  const [won, setWon] = useState<'won' | 'lost' | null>(null);
  // The score (Oct 4, migration 91), your games first, on any tennis session (Oct 6): on a match, when one side took more sets it decides the result.
  const [score, setScore] = useState('');
  const scored = readScore(score);
  const scoreSets = canScore(kind) ? scored.sets : undefined;
  const decided = kind === 'match' ? setsWinner(scoreSets) : undefined;
  const pickedWon = decided !== undefined ? decided : kind === 'match' && won ? won === 'won' : undefined;
  // How long, in your log (Oct 3): simply the tracker's time, shown as one
  // line; a small Edit opens hours and minutes steppers, for a break taken off.
  // The post keeps the tracker's own time (the server writes it, migration 65).
  // From Finish: the clock's time (as the log sheet had it, Oct 6), on the
  // tracker's copy too; with no copy, the time the log and the post both take.
  const [logMinutes, setLogMinutes] = useState<number | null>(() => (liveTwins.waiting && liveMins !== liveTwins.waiting.minutes ? liveMins : null));
  const [editLength, setEditLength] = useState(false);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [opponentText, setOpponentText] = useState('');
  const [busy, setBusy] = useState<null | 'log' | 'share'>(null);
  // Saved, and by which button: the moment plays on that button (a tick, the streak rolling up) before the page goes.
  const [ticked, setTicked] = useState<false | 'log' | 'share'>(false);
  const [logError, setLogError] = useState('');
  /*
   * "+ Add calories & heart rate" (Oct 8, owner: "yes add it"): on a timed
   * session with no tracker only (a tracker's own numbers win), folded away
   * until asked for, and only once the server keeps them (migration 154).
   * They go in your private log; the post shows them as "Share health data"
   * says, the same switch and rules as a tracker's. Not when your tracker's
   * copy of this same game is in your log already (liveTwins.logged): its
   * numbers are the ones that count.
   */
  const canType = manualStatsReady && liveOnly && !liveTwins.logged;
  const [statsOpen, setStatsOpen] = useState(false);
  const [kcalText, setKcalText] = useState('');
  const [hrText, setHrText] = useState('');
  // How many times Save met a number out of range since the boxes last changed: says why, and puts the caret there.
  const [statsAsked, setStatsAsked] = useState(0);
  const typedRead: ManualRead = canType && statsOpen ? readManualStats(kcalText, hrText) : {};
  // Each number on the card as soon as it is a good one (a heart rate half typed never takes the calories off with it).
  const typedNumbers: HealthNumbers | undefined = (() => {
    if (!canType || !statsOpen) return undefined;
    const k = keptKcal(wholeNumber(kcalText));
    const h = keptAvgHr(wholeNumber(hrText));
    return k || h ? { ...(k ? { kcal: k } : {}), ...(h ? { avgHr: h } : {}) } : undefined;
  })();
  const typedShare = chosenShare(health, availableShare(typedNumbers));
  const keysUp = useKeysUp();
  const shownKind = openedLog?.kind ?? kind;
  const shownWon = openedLog ? (openedLog.kind === 'match' ? openedLog.won : undefined) : pickedWon;
  const shownSets = openedLog ? (canScore(openedLog.kind) ? openedLog.sets : undefined) : scoreSets;
  // What the workout was, while it is logged (or about to be) as fitness: "Run".
  const shownWorkout = shownKind === 'fitness' ? openedLog?.workout ?? workoutSport : undefined;
  const sessionFor = (logId?: string): SessionDetail | null => (opened?.type === 'tracker' ? {
    ...(({ workout: _w, ...rest }) => rest)(statsOf(opened, shareFor(opened))),
    kind: shownKind,
    focus: loggedLabel({ kind: shownKind, won: shownWon, workout: shownWorkout }),
    ...(shownWorkout ? { workout: shownWorkout } : {}),
    ...(shownWon !== undefined ? { won: shownWon } : {}),
    ...(shownSets?.length ? { sets: shownSets } : {}),
    ...(logId ? { sessionId: logId } : {}),
  } : liveOnly && fromLive ? {
    // A live session with no tracker: what a session logged by hand carries (sessionFromLogged), its time the log's.
    focus: loggedLabel({ kind: shownKind, won: shownWon }),
    minutes: logMinutes ?? liveMins,
    drills: [],
    kind: shownKind,
    day: liveDay(fromLive),
    ...(shownWon !== undefined ? { won: shownWon } : {}),
    ...(shownSets?.length ? { sets: shownSets } : {}),
    ...(logId ? { sessionId: logId } : {}),
    // Typed in (Oct 8): only the chosen ones, with the list, as sessionFromLogged puts them; the server reads them from the log.
    ...(typedNumbers ? { share: typedShare } : {}),
    ...(typedShare.includes('hr') && typedNumbers?.avgHr ? { avgHr: typedNumbers.avgHr } : {}),
    ...(typedShare.includes('kcal') && typedNumbers?.kcal ? { kcal: typedNumbers.kcal } : {}),
  } : null);
  // The day the session counts for (streak, hours, the week): the tracker's, or the live session's start.
  const logDay = opened?.type === 'tracker' ? activityDay(opened.activity) : liveOnly && fromLive ? liveDay(fromLive) : null;
  // The time it goes in your log when it isn't edited: the tracker's, or the clock's.
  const baseMinutes = opened?.type === 'tracker' ? opened.activity.minutes : liveMins;
  const cardSession = logMode ? sessionFor() : null;
  // "Practice — how did it go?": the hint follows what it was, never a time
  // of day. Left empty, the post says the day instead ("Saturday match").
  // A workout: "Run — how did it go?", and "Saturday run".
  const shownWhat = shownWorkout ? workoutName(shownWorkout) : KIND_LABEL[shownKind];
  const logHint = logDay ? shownWhat : '';
  const logCaption = logDay
    ? `${new Date(`${logDay}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} ${inSentence(shownWhat)}`
    : '';
  const logInput = () => ({
    kind,
    won: pickedWon,
    ...(scoreSets ? { sets: scoreSets } : {}),
    players: canTagKind(kind) ? players : [],
    // From a hit with nobody tagged and nothing typed, its people's names are kept as private words, as before.
    opponent: canTagKind(kind) ? (opponentText.trim() || (fromHit && !players.length ? fromHit.who : '')) : '',
    // Where it was, as the note ("At Alder Park"): the hit's place, else the court tagged here, so Your sessions names it.
    // From Finish, the place typed at Start when there was no court.
    note: fromHit ? `At ${fromHit.place}` : loggedCourt() ? `At ${loggedCourt()!.name}` : fromLive?.place ? `At ${fromLive.place}` : undefined,
    ...(opened?.type === 'tracker' && logMinutes && logMinutes !== opened.activity.minutes ? { minutes: logMinutes } : {}),
    // A live session with no tracker: the clock's time, or the one picked under Edit.
    ...(liveOnly ? { minutes: logMinutes ?? liveMins } : {}),
    // Where it was played, kept in your log (migration 130): the court on the post, else the hit's.
    ...(loggedCourt() ? { courtId: loggedCourt()!.id } : {}),
    // Typed in by hand (Oct 8), a timed session with no tracker only.
    ...(typedRead.kcal ? { kcal: typedRead.kcal } : {}),
    ...(typedRead.avgHr ? { avgHr: typedRead.avgHr } : {}),
  });
  /** The court a session logged here was played at: the one tagged on the post, or the hit (or live session) it came from. */
  const loggedCourt = (): { id: string; name: string } | null => {
    if (location.trim() && court && isMapCourtId(court.id)) return { id: court.id, name: court.name };
    if (fromHit?.placeId && isMapCourtId(fromHit.placeId)) return { id: fromHit.placeId, name: fromHit.place };
    // Kept in your private log for anyone, as from a hit, even with no place on the post.
    if (fromLive?.court && isMapCourtId(fromLive.court.id)) return { id: fromLive.court.id, name: fromLive.court.name };
    return null;
  };
  /**
   * What a session logged here does next (Oct 5, owner: personal records and
   * Flyby): the "New record!" words when it beat one of your records, and,
   * a few seconds after, who else was at that court that day.
   */
  const afterLog = (logId: string | undefined, input: ReturnType<typeof logInput>, day: string, minutes: number) => {
    const me = currentUserId;
    if (!me) return { record: null as { title: string; body: string } | null, flyby: () => undefined };
    const sets = canScore(input.kind) ? input.sets : undefined;
    const added: PracticeSession = {
      id: logId ?? '__new', userId: me, day, minutes, kind: input.kind,
      won: input.kind === 'match' ? setsWinner(sets) ?? input.won : undefined, ...(sets ? { sets } : {}), createdAt: new Date().toISOString(),
    };
    const before = sessions.filter((x) => x.id !== logId);
    const record = recordToast(beatenBy(me, before, added, posts, stories), [added, ...before]);
    const at = loggedCourt();
    const people = users;
    return {
      record,
      flyby: (delayMs?: number) => flybyAfter({ courtId: at?.id, courtName: at?.name, day, ask: actions.flyby, users: () => people, skip: input.players?.map((x) => x.id), delayMs }),
    };
  };
  /*
   * Who was there (owner, Oct 3: "on a session the tag functions more like a
   * group thing"). A Post or a Clip with no session has one people row, Tag
   * people: Instagram's tags, nobody asked. Once the post carries a match or
   * a practice of yours (Log it, Post it, Add session stats) that row becomes
   * "Who was there", one list with one search: everyone in it is tagged on
   * the session (migration 62), asked to accept, and named on the post once
   * they do (the post updates itself; until then they read "Asked"). The
   * people are kept on the session, so they stay when a post fails. Anyone
   * tagged before the session went on moves into the list, and back out if
   * it comes off. A session someone else logged and tagged you in (your copy)
   * is theirs to tag: its list shows who logged it, and the server names the
   * whole group on your post (migration 77).
   */
  const peoplePick = logMode || withStats ? opened : statsRow ? statsPick ?? undefined : undefined;
  const logOf = (pick: SessionPick | undefined) => !pick ? undefined
    : pick.type === 'tracker' ? sessions.find((x) => x.userId === currentUserId && x.activityId === pick.activity.id) ?? pick.session
    : sessions.find((x) => x.id === pick.session.id) ?? pick.session;
  // "Log it" holds the log entry it opened with (none until Share logs it).
  const peopleLog = logMode ? openedLog : logOf(peoplePick);
  const peopleKind = logMode ? shownKind : peopleLog?.kind;
  const copyLog = peopleLog?.fromSessionId ? peopleLog : undefined;
  const groupMode = (!!peoplePick || liveOnly) && !copyLog && canTagKind(peopleKind) && (logMode || !!peopleLog);
  const peopleTags = groupMode && peopleLog && currentUserId ? tagsOnSession(sessionTags, peopleLog.id, currentUserId) : [];
  const standing = peopleTags.filter(isActive);
  const tagStatus: Record<ID, SessionTagStatus> = Object.fromEntries(peopleTags.map((t) => [t.taggedId, t.status]));
  // On a session already logged, what is changed here waits for Share; untouched, the list is the session's own.
  const [draft, setDraft] = useState<{ logId: ID; players: SessionPlayer[]; text: string } | null>(null);
  const drafted = !!peopleLog && draft?.logId === peopleLog.id ? draft : null;
  const whoPlayers: SessionPlayer[] = !groupMode ? [] : peopleLog ? drafted?.players ?? standing.map((t) => ({ id: t.taggedId, role: t.role })) : players;
  const whoText = !groupMode ? '' : peopleLog ? drafted?.text ?? peopleLog.opponent ?? '' : opponentText;
  const setWho = (next: SessionPlayer[], text: string) => {
    if (peopleLog) setDraft({ logId: peopleLog.id, players: next, text });
    else { setPlayers(next); setOpponentText(text); }
  };
  // Post tags move into the list as the session goes on, and the people added here move back out if it comes off.
  const addedHere = whoPlayers.filter((p) => !standing.some((t) => t.taggedId === p.id)).map((p) => p.id);
  const addedRef = useRef<ID[]>(addedHere);
  addedRef.current = addedHere;
  const groupKey = groupMode ? peopleLog?.id ?? 'new' : '';
  const lastGroup = useRef(groupKey);
  useEffect(() => {
    const was = lastGroup.current;
    lastGroup.current = groupKey;
    if (groupKey && tagged.length) {
      const have = new Set(whoPlayers.map((p) => p.id));
      const next = [...whoPlayers];
      for (const id of tagged) if (!have.has(id) && id !== currentUserId) next.push({ id, role: nextRole(peopleKind ?? 'practice', next) });
      setWho(next, whoText);
      setTagged([]);
    } else if (!groupKey && was) {
      const back = addedRef.current;
      if (back.length) setTagged((now) => Array.from(new Set([...now, ...back])));
      setDraft(null);
      setPlayers([]);
    }
  }, [groupKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The card in "Log it" shows them as the post will: anyone not accepted yet, faded.
  const cardPeople: CardPerson[] | undefined = !logMode ? undefined : whoPlayers.flatMap((p) => {
    const u = users.find((x) => x.id === p.id);
    return u ? [{ id: u.id, handle: u.handle, name: u.name, role: p.role, pending: tagStatus[p.id] !== 'accepted' }] : [];
  });
  // "Mira +1" with Mira's face, and "Asked" while anyone has still to answer.
  const whoFirst = whoPlayers.length ? users.find((u) => u.id === whoPlayers[0].id) : undefined;
  const whoValue = (() => {
    if (!whoPlayers.length) return whoText.trim() || undefined;
    const name = whoFirst ? firstName(whoFirst.name) || `@${whoFirst.handle}` : 'Someone';
    return whoPlayers.length > 1 ? `${name} +${whoPlayers.length - 1}` : name;
  })();
  const whoAsked = whoPlayers.some((p) => tagStatus[p.id] === 'pending');
  const whoAccessory = whoPlayers.length && whoValue ? (
    <View pointerEvents="none" style={styles.who} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {whoFirst ? <Avatar name={whoFirst.name} seed={whoFirst.avatarSeed} uri={whoFirst.avatarUrl} size={24} /> : null}
      <Text style={styles.whoName} numberOfLines={1}>{whoValue}</Text>
      {whoAsked ? <Text style={styles.whoAsked}>Asked</Text> : null}
    </View>
  ) : null;
  const pickWho = () => openWhoPlayed({
    kind: peopleKind ?? 'practice',
    players: whoPlayers,
    text: whoText,
    suggested: fromHit?.playerIds ?? [],
    status: tagStatus,
    declined: peopleTags.filter((t) => !isActive(t)).map((t) => ({ id: t.taggedId, status: t.status })),
    closed: peopleLog && currentUserId ? tagsOnSession(sessionTags, peopleLog.id, currentUserId, true).filter((t) => !isActive(t)).map((t) => t.taggedId) : [],
    onDone: setWho,
  });
  const whoRow = groupMode ? (
    <FormRow
      icon="people-outline"
      label="Who was there"
      value={whoAccessory ? undefined : whoValue}
      accessory={whoAccessory}
      accessibilityLabel={whoValue ? `Who was there, ${whoValue}${whoAsked ? ', asked to accept' : ''}` : 'Who was there'}
      chevron
      onPress={pickWho}
    />
  ) : null;
  // Your copy of someone's session: who logged it (the server names everyone who accepted).
  const copyTag = copyLog ? sessionTags.find((t) => t.taggedId === currentUserId && (t.mirroredSessionId === copyLog.id || t.sessionId === copyLog.fromSessionId)) : undefined;
  const copyBy = copyTag ? users.find((u) => u.id === copyTag.taggerId) : undefined;
  const copyRow = copyLog && peoplePick ? (
    <FormRow
      icon="people-outline"
      label="Who was there"
      value={copyBy ? `with ${firstName(copyBy.name)}` : undefined}
      accessibilityLabel={`Who was there: ${copyBy ? `${copyBy.name}, who logged it, ` : ''}and everyone who accepted. ${copyBy ? firstName(copyBy.name) : 'They'} can add people.`}
    />
  ) : null;
  // A session's people are tagged on the session, never as post tags; a post without one keeps its Instagram tags.
  const postTags = groupMode || copyRow ? undefined : tagged.length ? tagged : undefined;
  // On Share: what was changed in the list goes on the session (asking anyone new); a name typed goes in your log.
  const applyWho = () => {
    if (!groupMode || !peopleLog || !drafted) return;
    if (drafted.text.trim() !== (peopleLog.opponent ?? '').trim()) void actions.setSessionOpponent(peopleLog.id, drafted.text.trim()).catch(() => undefined);
    const same = drafted.players.length === standing.length && drafted.players.every((p) => standing.some((t) => t.taggedId === p.id && t.role === p.role));
    if (same) return;
    const first = (id: ID) => { const u = users.find((x) => x.id === id); return u ? firstName(u.name) : 'They'; };
    void actions.setSessionPlayers(peopleLog.id, drafted.players).then((refused) => {
      for (const r of refused) showToast({ title: `${first(r.id)} wasn’t tagged`, body: r.why, icon: 'pricetag-outline' });
    }).catch(() => undefined);
  };
  const added = !!body.trim() || !!media;
  // One of Save privately and Post session at a time, held from the first tap
  // (the `busy` state is a frame behind a quick second tap).
  const acting = useRef(false);
  /*
   * The streak this session makes, over the two buttons ("Day 6 streak", with
   * the flame): your log's own count (computeStats) with this session's day
   * in it. Held at the moment it saves, so the number can roll up from what
   * it was (the log, refreshed, would otherwise already have it).
   */
  const streakPreview = useMemo(() => (logMode && logDay ? tracker.streakWith(logDay) : null), [logMode, logDay, sessions, posts, stories]); // eslint-disable-line react-hooks/exhaustive-deps
  const [savedStreak, setSavedStreak] = useState<{ now: number; before: number } | null>(null);
  /** Saved: the tick on the button that did it, a reward tap, the streak rolling up. The page leaves a moment later. */
  const celebrate = (by: 'log' | 'share') => {
    setSavedStreak(streakPreview);
    setTicked(by);
    haptics.reward();
  };
  // The way out once saved, held while that moment plays. × (or Android's back) meanwhile takes it
  // straight away, and it runs once only: never the page's own way out and then a second back after it.
  const exitHeld = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const leaveAfter = (run: () => void, ms: number) => {
    const timer = setTimeout(() => { exitHeld.current = null; run(); }, ms);
    exitHeld.current = { timer, run };
  };
  const leaveNow = () => {
    const held = exitHeld.current;
    if (!held) return;
    exitHeld.current = null;
    clearTimeout(held.timer);
    held.run();
  };
  // A live session with no tracker, once logged here: a second try (Post session after a post that
  // didn't go up) uses that log, never a second one.
  const liveLogId = useRef<ID | null>(null);
  /** Logs the session this page is for: the tracker's (tracker.save), or a live session's by hand. Returns the log's id; throws if it did not save. */
  const saveLog = async (input: ReturnType<typeof logInput>): Promise<ID> => {
    if (!liveOnly || !fromLive) return tracker.save(input);
    if (liveLogId.current) return liveLogId.current;
    const id = await actions.logSession({
      minutes: input.minutes ?? liveMins,
      kind: input.kind,
      won: input.kind === 'match' ? input.won : undefined,
      ...(canScore(input.kind) && input.sets?.length ? { sets: input.sets } : {}),
      opponent: canTagKind(input.kind) ? input.opponent : '',
      day: liveDay(fromLive),
      ...(input.note ? { note: input.note } : {}),
      ...(input.courtId ? { courtId: input.courtId } : {}),
      ...(input.kcal ? { kcal: input.kcal } : {}),
      ...(input.avgHr ? { avgHr: input.avgHr } : {}),
    });
    liveLogId.current = id;
    // Each person tagged is asked to accept; anyone the server turns away is said after.
    const tagging = canTagKind(input.kind) ? input.players : [];
    if (tagging.length) {
      const refused = await actions.setSessionPlayers(id, tagging).catch(() => []);
      for (const r of refused) showToast({ title: `${firstName(users.find((u) => u.id === r.id)?.name ?? '') || 'They'} wasn’t tagged`, body: r.why, icon: 'pricetag-outline' });
    }
    return id;
  };
  /** Logged (here or elsewhere): a live session it came from is done with, and its bar goes. */
  const liveLogged = () => { if (fromLive) actions.endLiveSession(); };
  // Save privately: into your log and your streak, nothing posted. A tick, a reward tap, the streak rolling up, and the page sinks away.
  const runJustLog = async () => {
    if (acting.current || ticked || !logDay) return;
    // A score that isn't one yet says why, and nothing is logged.
    if (!openedLog && canScore(kind) && scored.problem) { setLogError(scored.problem); return; }
    // A typed number out of range says why, by its box, and nothing is logged.
    if (typedRead.problem && !liveLogId.current) { setStatsAsked((n) => n + 1); return; }
    acting.current = true;
    const day = logDay;
    setBusy('log');
    setLogError('');
    const input = logInput();
    let logId: string | undefined;
    try {
      try { logId = await saveLog(input); } catch (e) {
        // Logged already (on another phone, say): that is what was asked for.
        if (!(e instanceof Error && e.message === 'Already logged.')) throw e;
      }
      liveLogged();
      setBusy(null);
      celebrate('log');
      const streak = streakPreview ?? tracker.streakWith(day);
      const minutes = input.minutes ?? baseMinutes;
      const next = afterLog(logId, input, day, minutes);
      leaveAfter(() => {
        closeMenu();
        // With an Instagram button on it: the session as a story picture. A beaten record is the moment instead.
        showLogged(minutes, { kind: input.kind, won: input.won, sets: input.sets, workout: input.kind === 'fitness' ? workoutSport : undefined }, streak, logId, next.record);
        // Then who else was at that court today, once the first note has been read.
        next.flyby(next.record ? 5500 : undefined);
      }, CELEBRATE_MS);
    } catch {
      acting.current = false;
      setBusy(null);
      setLogError('That session didn’t save. Try again.');
    }
  };
  const justLog = () => {
    if (!added) { void runJustLog(); return; }
    confirm({
      title: 'Save privately?',
      message: media?.kind === 'video' ? 'Your caption and clip won’t be posted.' : media ? 'Your caption and photo won’t be posted.' : 'Your caption won’t be posted.',
      confirmLabel: 'Save',
      onConfirm: () => { void runJustLog(); },
    });
  };
  // × logs nothing: the session stays "Not logged yet" (a live one, "Finished · Log it" on its bar). Anything written or added is asked about first.
  const leaveLog = () => {
    // Saved, and on its way out: now rather than in a moment (and only once).
    if (ticked) { leaveNow(); return; }
    if (!added) { goBackNow(); return; }
    confirm({ title: 'Discard post?', confirmLabel: 'Discard', destructive: true, onConfirm: goBackNow });
  };
  const hideIt = () => {
    // From Finish: the live session thrown away, asked first (a tracker's copy of it stays waiting, as it was).
    if (fromLive) {
      confirm({ title: 'Discard this session?', message: 'The time won’t be logged.', confirmLabel: 'Discard', destructive: true, onConfirm: () => { actions.discardLiveSession(); goBackNow(); } });
      return;
    }
    if (opened?.type !== 'tracker') return;
    const id = opened.activity.id;
    confirm({ title: workoutLog ? 'Hide this workout?' : 'Hide this session?', message: 'It won’t count toward your streak.', confirmLabel: 'Hide', destructive: true, onConfirm: () => { actions.dismissActivity(id); goBackNow(); } });
  };

  // A quick second tap on Share would post it twice.
  const sent = useRef(false);
  const submit = () => {
    if (!canSubmit || groupWaiting || groupGone || sent.current) return;
    sent.current = true;
    // Words CourtSide refuses (migration 117) are said here, before a photo or
    // clip starts going up, and the draft stays as it is.
    void actions.wordsRefused([body, location]).then((refused) => {
      if (!refused) { submitNow(); return; }
      sent.current = false;
      haptics.reject();
      showToast({ title: BLOCKED_WORDS_NOTE, body: 'Change them and share again.', icon: 'alert-circle-outline', long: true });
    });
  };
  const submitNow = () => {
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

    if ((opened || liveOnly) && logMode) { void shareFromLog(); return; }

    if (opened) {
      // The stats go on only while attached (and never twice: once your posts
      // were checked, one already carrying it takes them off), and such a
      // post is never offered for CourtSide's Instagram (the server holds
      // that rule too). Not a post type of its own: a Clip with a video, a
      // Post otherwise, as from "Add session stats".
      const stats = withStats && postsChecked;
      applyWho();
      const postId = actions.addPost({
        kind: openedClip ? 'clip' : 'note',
        orientation,
        trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
        body: body.trim() || (stats ? pickCaption(opened) : ''),
        tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
        taggedUserIds: postTags,
        location: location.trim() || undefined,
        court: adult && location.trim() && court && !groupPost ? court : undefined,
        featureOk: stats || groupPost ? false : featureOk ? undefined : false,
        groupId: shareTo ?? undefined,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
        session: stats ? statsOf(opened, shareFor(opened)) : undefined,
      });
      const firstPost = !posts.some((p) => p.authorId === currentUserId);
      if (shareTo) openGroupFeed(shareTo); else landOnFeed();
      // Said once the post has actually landed, never while it is still going up (or if it fails).
      if (firstPost) whenLanded(postId, () => setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite?first=1' }), 1800));
      // A session posted at a court: who else was there that day, once it has landed (Flyby, migration 130).
      if (stats) flybyForPost(postId, opened, firstPost);
      return;
    }

    const onCourt = Number(minutes);
    // A session from "Add session stats" rides on the Post or Clip, which stays
    // a Post or a Clip (and lands under Posts or Clips on the profile). Like a
    // post made from a session, it is never offered for CourtSide's Instagram.
    const stats = statsRow && statsPick ? statsOf(statsPick, shareFor(statsPick)) : undefined;
    applyWho();
    const postId = actions.addPost({
      kind: mode === 'clip' ? 'clip' : 'note',
      orientation,
      // The cover's moment is the editor's own bookmark, not part of the post.
      trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
      body: body.trim(),
      tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map(tag=>tag.slice(1).toLowerCase()))),
      taggedUserIds: postTags,
      location: location.trim() || undefined,
      court: adult && location.trim() && court && !groupPost ? court : undefined,
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
    if (firstPost) whenLanded(postId, () => setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite?first=1' }), 1800));
    if (stats && statsPick) flybyForPost(postId, statsPick, firstPost);
  };

  /** A post carrying a session, at a court (not a group's): Flyby for that session's day, once the post has landed. */
  const flybyForPost = (postId: string | undefined, pick: SessionPick, firstPost: boolean) => {
    if (!location.trim() || !court || groupPost || !isMapCourtId(court.id)) return;
    const day = pick.type === 'tracker' ? activityDay(pick.activity) : pick.session.day;
    const at = court;
    const people = users;
    whenLanded(postId, () => flybyAfter({ courtId: at.id, courtName: at.name, day, ask: actions.flyby, users: () => people, delayMs: firstPost ? 5400 : 1500 }));
  };

  // Share from "Log it": log it first (unless it already is), then post it with the log's
  // kind and result for the first draw; the server writes them again from the log (migration 65).
  const shareFromLog = async () => {
    if ((opened?.type !== 'tracker' && !liveOnly) || !logDay || acting.current) { sent.current = false; return; }
    if (!openedLog && !tracker.logged && canScore(kind) && scored.problem) { setLogError(scored.problem); sent.current = false; return; }
    if (typedRead.problem && !liveLogId.current) { setStatsAsked((n) => n + 1); sent.current = false; return; }
    acting.current = true;
    const day = logDay;
    const trackerActivity = opened?.type === 'tracker' ? opened.activity : null;
    setBusy('share');
    setLogError('');
    let logId = openedLog?.id ?? tracker.logged?.id ?? liveLogId.current ?? undefined;
    // Logged here and now (not before this page opened): it can beat a record.
    const freshLog = !logId;
    const shareInput = logInput();
    if (openedLog) applyWho();
    // Logged already from here (a Save privately that came back, say): the people picked go on it now.
    else if (logId && canTagKind(kind) && players.length) {
      const id = logId;
      void actions.setSessionPlayers(id, players).catch(() => undefined);
    }
    if (!logId) {
      try { logId = await saveLog(shareInput); } catch (e) {
        // Logged already on another phone: post it all the same; the server
        // finds that log and puts what it says on the post (migration 65).
        if (!(e instanceof Error && e.message === 'Already logged.')) {
          setBusy(null);
          setLogError('That session didn’t save. Try again.');
          sent.current = false;
          acting.current = false;
          return;
        }
      }
    }
    liveLogged();
    const firstPost = !posts.some((p) => p.authorId === currentUserId);
    // Logged, but the server didn't keep the score (a practice's, before migration 136): the post goes
    // up without it, as the server will show it, and the note after says so.
    const scoreGone = freshLog && tookScoreNotKept(logId);
    const postSession = sessionFor(logId);
    if (postSession && scoreGone) delete postSession.sets;
    let postId: string | undefined;
    try {
      postId = actions.addPost({
        kind: openedClip ? 'clip' : 'note',
        orientation,
        trimStart: edit.trimStart, trimEnd: edit.trimEnd, muted: edit.muted, volume: edit.volume, speed: edit.speed, crop: edit.crop,
        body: body.trim() || logCaption,
        tags: Array.from(new Set((body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase()))),
        taggedUserIds: postTags,
        location: location.trim() || undefined,
        court: adult && location.trim() && court ? court : undefined,
        featureOk: false,
        imageUrl: media?.kind === 'photo' ? media.uri : undefined,
        videoUrl: media?.kind === 'video' ? media.uri : undefined,
        mediaLabel: media?.label,
        thumbnailUrl: media?.thumbnailUrl ?? (media?.kind === 'photo' ? media.uri : undefined),
        session: postSession ?? undefined,
      });
    } catch {
      // Logged, but the post did not go: the session waits in Your sessions, ready to post.
      landOnFeed();
      const again = trackerActivity ? { activity: trackerActivity.id } : logId ? { session: logId } : null;
      showToast({ title: 'Logged. The post didn’t go up.', icon: 'alert-circle-outline', ...(again ? { action: { label: 'Try again', onPress: () => router.push({ pathname: '/compose', params: again }) } } : {}) });
      return;
    }
    // Posted: the tick on Post session and the streak rolling up, then on to the feed, where it goes up.
    celebrate('share');
    leaveAfter(landOnFeed, CELEBRATE_SHARE_MS);
    const next = afterLog(freshLog ? logId : undefined, shareInput, day, shareInput.minutes ?? baseMinutes);
    const record = freshLog ? next.record : null;
    // Said once the post has actually landed, never while it is still going up (or if it fails).
    if (firstPost) whenLanded(postId, () => setTimeout(() => showToast({ title: 'Your first post is up', body: 'Tap to invite the people you hit with.', icon: 'people-outline', href: '/invite?first=1' }), 1800));
    else if (scoreGone) whenLanded(postId, () => setTimeout(() => showToast({ title: 'Posted without the score', body: 'Scores aren’t ready yet. Add it later from Your sessions.', icon: 'alert-circle-outline', long: true }), 600));
    // A beaten record is the moment: "New record!" on gold, with the same Instagram button.
    else if (record) whenLanded(postId, () => setTimeout(() => { haptics.reward(); showToast({ title: record.title, body: record.body, glyph: 'record', action: shareAction({ post: postId, session: logId }) }); }, 600));
    // Otherwise "Posted" with an Instagram button: the session as a story
    // picture, from the post once it has landed, from your log until then.
    else whenLanded(postId, () => setTimeout(() => showToast({ title: 'Posted', body: 'Share it to your story too.', icon: 'checkmark', action: shareAction({ post: postId, session: logId }) }), 600));
    // Then who else was at that court today (the post, landed, is how the server knows you were there too).
    whenLanded(postId, () => next.flyby(600 + (firstPost ? 4800 : record ? 5500 : 3000)));
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
    // Back from the editor, "Log it" shows the length as its one line again.
    setEditLength(false);
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
  // Where from first: "Take photo", "Record video" or "Choose from library" (see askMediaSource).
  const openDevice = (selection: 'video' | 'all') => askMediaSource(selection, (source) => { void fetchMedia(selection, source); });
  const fetchMedia = async (selection: 'video' | 'all', source: MediaSource = 'library') => {
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
      chosen = await fromSource(source, selection);
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

  // Entering the challenge on a phone (or trimming a clip that was too big):
  // no menu, straight into your videos, once the box has finished arriving (the phone will not open its library
  // over a page still on its way in). A browser opens its file box only from
  // a tap, so there the one clip button waits for that tap.
  useEffect(() => {
    if ((!entering && !trimming) || isHit || Platform.OS === 'web') return undefined;
    let opened = false;
    const open = () => { if (opened) return; opened = true; void fetchMedia('video', trimming ? 'trim' : 'library'); };
    const events = navigation as unknown as { addListener: (name: string, fn: (e?: { data?: { closing?: boolean } }) => void) => () => void };
    const stop = events.addListener('transitionEnd', (e) => { if (!e?.data?.closing) open(); });
    // In case the page never says it has arrived.
    const fallback = setTimeout(open, 700);
    return () => { opened = true; clearTimeout(fallback); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Where it was: "Played at …?" when you are standing at a court, or Add location.
  const placeRows = (
    <>
                  {/* Never for a workout away from a court (a run, a lift): "Played at" is for tennis. */}
                  {!location && nearCourt && !nearWaved && !workoutLog && (mode === 'post' || mode === 'clip' || logMode) ? (
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
                      lead={court && adult ? <CourtGlyph size={16} color={colors.brand} /> : <Ionicons name="location" size={20} color={colors.brand} />}
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
    </>
  );

  if (stage === 'choose') stageBack.current = () => { closeMenu(); return true; };
  if (stage === 'choose') return <View style={styles.choiceBackdrop}>
    <Reanimated.View pointerEvents="none" style={[StyleSheet.absoluteFill, dimStyle]}><SheetBackdrop /></Reanimated.View>
    <Pressable accessibilityRole="button" accessibilityLabel="Close create menu" onPress={closeMenu} style={StyleSheet.absoluteFill}/>
    <Reanimated.View style={[styles.choiceSheet, tight && styles.choiceSheetTight, { maxHeight: menuMaxH }, popStyle]}>
      <View style={styles.choiceHeader}><Text style={styles.choiceTitle}>{entering ? challenge.title : 'Create'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeMenu} hitSlop={10}><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
      <ScrollView style={styles.choiceScroll} contentContainerStyle={[styles.choiceList, tight && styles.choiceListTight]} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Session (Oct 6, owner chose "A": one card for both, so the menu stays five cards): a card like the
          others. Tapped, a small menu asks Start now (the clock, and a check-in at your court) or Log a past
          one (the log sheet: private, for the streak). While one is going it opens that one instead; finished
          and not logged yet, its log. Someone not known to be an adult never checks in (mapPrivacy.canCheckIn),
          so theirs promises only the timer. */}
      {entering ? null : <Reanimated.View entering={arrive(0)}><Pressable
        accessibilityRole="button"
        accessibilityLabel={!liveSession ? 'Session. Start one now, or log one you’ve played' : liveState(liveSession) === 'finished' ? 'Log your finished session' : 'Session in progress. Open it'}
        onPress={() => (!liveSession ? setSessionChoice(true) : liveState(liveSession) === 'finished' ? finishLive(liveSession, actions, { open: () => openLiveLog('replace') }) : router.replace('/live-session'))}
        style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}
      >
        <Ionicons name={liveSession ? 'radio-button-on' : 'stopwatch-outline'} size={choiceIcon} color={liveSession ? colors.open : colors.textMuted}/>
        <Text style={styles.choiceLabel}>{!liveSession ? 'Session' : liveState(liveSession) === 'finished' ? 'Log your session' : 'Session in progress'}</Text>
        <Text style={styles.note}>{!liveSession ? 'Start one now, or log one you’ve played.' : [liveState(liveSession) === 'finished' ? 'Finished' : `Started ${startClock(liveSession)}`, livePlace(liveSession)].filter(Boolean).join(' · ')}</Text>
      </Pressable></Reanimated.View>}
      <Reanimated.View entering={arrive(entering ? 0 : 1)}><Pressable accessibilityRole="button" accessibilityLabel={entering ? `Choose your clip for the ${challenge.title} challenge` : 'Create a clip'} onPress={() => { setMode('clip'); void openDevice('video'); }} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter, entering && styles.choiceChallenge]}>
        {preparing === 'video' ? <PreparingRing size={choiceIcon} done={prepDone} /> : <Ionicons name={entering ? 'trophy-outline' : 'videocam-outline'} size={choiceIcon} color={entering ? colors.brand : colors.textMuted}/>}<Text style={styles.choiceLabel}>{entering ? 'Choose your clip' : 'Clip'}</Text><Text style={styles.note}>{preparing === 'video' ? 'Getting your video ready — shrinking it so it posts fast.' : entering ? `A video from your phone. #${challenge.tag} is already in the caption.` : 'Share a video from your device.'}</Text>
      </Pressable></Reanimated.View>
      {/* Entering the challenge: the clip is the only way in, so nothing else is offered. */}
      {entering ? null : <Reanimated.View entering={arrive(2)}><Pressable accessibilityRole="button" accessibilityLabel="Create a post" onPress={() => { setMode('post'); void openDevice('all'); }} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        {preparing === 'all' ? <PreparingRing size={choiceIcon} done={prepDone} /> : <Ionicons name="images-outline" size={choiceIcon} color={colors.textMuted}/>}<Text style={styles.choiceLabel}>Post</Text><Text style={styles.note}>{preparing === 'all' ? 'Getting it ready…' : 'Choose from your photos and videos.'}</Text>
      </Pressable></Reanimated.View>}
      {pickError ? <Text style={styles.pickError}>{pickError}</Text> : null}
      {/* Order (Oct 7, owner): what we most want people to post first — a session, then a clip; then a post, a thread, an Instant. */}
      {entering ? null : <Reanimated.View entering={arrive(3)}><Pressable accessibilityRole="button" accessibilityLabel="Create a thread or question" onPress={() => router.replace('/ask')} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        <Ionicons name="chatbubbles-outline" size={choiceIcon} color={colors.textMuted}/><Text style={styles.choiceLabel}>Thread or question</Text><Text style={styles.note}>Ask the community or start a conversation.</Text>
      </Pressable></Reanimated.View>}
      {/* Instants are held back until the server's flag:instants says so (features/stories/instantsSwitch, owner Oct 8): no card, and no gap where it was. */}
      {entering || !flagsOn.instants ? null : <Reanimated.View entering={arrive(4)}><Pressable accessibilityRole="button" accessibilityLabel="Take an Instant" onPress={() => router.replace('/hit')} style={[styles.choiceOption, tight && styles.choiceOptionTight, tighter && styles.choiceOptionTighter]}>
        <Ionicons name="camera-outline" size={choiceIcon} color={colors.textMuted}/><Text style={styles.choiceLabel}>Instant</Text><Text style={styles.note}>A photo after you play. Up on the feed for a day.</Text>
      </Pressable></Reanimated.View>}
      </ScrollView>
    </Reanimated.View>
    <MenuSheet
      visible={sessionChoice}
      onClose={() => setSessionChoice(false)}
      title="Session"
      items={[
        { icon: 'stopwatch-outline', label: 'Start now', note: adult ? 'A timer, and a check-in at your court.' : 'A timer, from Start to Finish.', onPress: () => router.replace('/start-session') },
        { icon: 'add-circle-outline', label: 'Log a past one', note: 'Private · counts toward your streak', onPress: () => router.replace('/log-session') },
      ]}
    />
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
    // Back means "wrong one": straight back into your photos to pick again,
    // not out to the menu. Stories go back to their own library.
    const editBack = () => {
      // A session's photo is optional: back drops a fresh pick and returns to the post. Back from
      // "Trim or edit" on one already chosen (returning) keeps it as it was.
      if (opened || liveOnly) { if (!returning) { setMedia(null); setPicked(null); } setStage('form'); return; }
      if (params.mode === 'story') { setStage('library'); return; }
      setStage('choose');
      void openDevice(mode === 'clip' ? 'video' : 'all');
    };
    stageBack.current = () => { editBack(); return true; };
    return (
      <View style={[styles.backdrop, { backgroundColor: '#000' }]}>
        <MediaEditor
          media={source}
          portraitRatio={portraitRatio}
          initial={initial}
          onBack={editBack}
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
    const libraryBack = () => (params.mode === 'story' ? router.back() : setStage('choose'));
    stageBack.current = () => { libraryBack(); return true; };

    return (
      <View style={styles.backdrop}>
        <SheetBackdrop />
        <View style={styles.sheet}>
          <Screen
            title={mode === 'clip' ? 'Your videos' : 'Your library'}
            compactTitle
            onBack={libraryBack}
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

  if (logMode) {
    stageBack.current = () => { leaveLog(); return true; };
    return (
      <View style={styles.backdrop}>
        <SheetBackdrop />
        <Reanimated.View style={[styles.sheet, formLeave]}>
          <Screen
            // Still "New post" with a clip on it (owner, Oct 3): the page stays the same page.
            title="New post"
            compactTitle
            bar={false}
            onBack={leaveLog}
            // The dock has Post session; while the keyboard hides the dock, Post is up here.
            right={keysUp ? <Button label="Post" variant="secondary" onPress={submit} disabled={!(opened || liveOnly) || !postsChecked || !!busy || !!ticked} /> : undefined}
          >
            <View style={styles.logTop}>
              <LogComposerTop
                session={cardSession}
                people={cardPeople}
                hidden={blockedIds}
                waiting={!opened && !liveOnly}
                media={media}
                replay={ticked ? 1 : 0}
                preparing={preparing}
                prepDone={prepDone}
                onPhoto={() => { void openDevice('all'); }}
                onClip={() => { void openDevice('video'); }}
                onEdit={() => setStage('edit')}
                onRemove={() => { setMedia(null); setPicked(null); setEdit({}); }}
                error={pickError}
                // With a photo or clip, the top is the post as the feed will show it, caption and all.
                preview={{ orientation, edit, author: currentUser ?? undefined, caption: body.trim() || logCaption, captionIsDefault: !body.trim(), location: location.trim() || undefined }}
              />
            </View>
            <View style={styles.logCaption}>
              {currentUser ? <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={30} style={styles.logAvatar} /> : null}
              <View style={styles.flex}>
                <Field bare accessibilityLabel="Caption" value={body} onChangeText={setBody} placeholder={`${logHint} — how did it go?`} multiline minHeight={44} mentions maxLength={POST_MAX} />
              </View>
            </View>
            {openedLog || workoutLog ? (
              // Logged already ("Post it"): what it was is said; a tennis session with no score can still get one.
              addScoreTo ? <AddScore sessionId={addScoreTo} style={styles.addScore} /> : null
            ) : (
              <Reanimated.View layout={LinearTransition.duration(220)} style={styles.logChips}>
                <Chips value={kind} onChange={(k) => { if (!k) return; setKind(k); if (k !== 'match') setWon(null); }} options={kinds} />
                {kind === 'match' ? (
                  <Reanimated.View entering={FadeInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1))} exiting={FadeOut.duration(160)}>
                    {/* A score that says who won decides it; the chips are for a match with no score, or one level on sets. */}
                    {decided === undefined ? (
                      <Chips brand clearable value={won ?? undefined} onChange={(v) => setWon(v ?? null)} options={[{ value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }]} />
                    ) : null}
                    <View style={styles.scoreBox}><ScoreField value={score} onChange={setScore} /></View>
                  </Reanimated.View>
                ) : canScore(kind) ? (
                  // A practice or drills can carry its sets too (Oct 6, owner): optional, no result.
                  <Reanimated.View entering={FadeInDown.duration(220).easing(Easing.bezier(0.32, 0.72, 0, 1))} exiting={FadeOut.duration(160)}>
                    <View style={styles.scoreBox}><ScoreField kind={kind} label="Score (optional)" value={score} onChange={setScore} /></View>
                  </Reanimated.View>
                ) : null}
              </Reanimated.View>
            )}
            {opened?.type === 'tracker' && !openedLog ? (
              <Reanimated.View layout={LinearTransition.duration(220)} style={styles.lengthBox}>
                <TrackedLength
                  minutes={logMinutes ?? opened.activity.minutes}
                  // From Finish (your tracker's copy of the live session): the clock's time is what goes in, "from your timer", not "edited".
                  trackerMinutes={fromLive && liveMins ? liveMins : opened.activity.minutes}
                  tracker={fromLive && liveMins ? 'your timer' : trackerName(opened.activity)}
                  open={editLength}
                  onOpen={setEditLength}
                  onChange={(m) => setLogMinutes(m === opened.activity.minutes ? null : m)}
                  hint={`Change it if you took a break. Your post keeps ${trackerName(opened.activity)}’s time.`}
                />
              </Reanimated.View>
            ) : liveOnly && liveMins ? (
              // From Finish with no tracker: the clock's time, one line, with Edit (pauses are already left out).
              <Reanimated.View layout={LinearTransition.duration(220)} style={styles.lengthBox}>
                <TrackedLength
                  minutes={logMinutes ?? liveMins}
                  trackerMinutes={liveMins}
                  tracker="your timer"
                  open={editLength}
                  onOpen={setEditLength}
                  onChange={(m) => setLogMinutes(m === liveMins ? null : m)}
                  hint="Paused time isn’t counted. Change it if you need to."
                />
              </Reanimated.View>
            ) : null}
            {/* Optional, folded away (Oct 8, owner): calories and average heart rate, a timed session with no tracker only. */}
            {canType ? (
              <Reanimated.View layout={LinearTransition.duration(220)} style={styles.manualStats}>
                <ManualStats
                  open={statsOpen}
                  onOpen={(next) => { setStatsOpen(next); setStatsAsked(0); }}
                  kcal={kcalText}
                  avgHr={hrText}
                  onKcal={(t) => { setKcalText(t); setStatsAsked(0); }}
                  onAvgHr={(t) => { setHrText(t); setStatsAsked(0); }}
                  asked={statsAsked}
                />
              </Reanimated.View>
            ) : null}
            {/* Your tracker's copy of this live session is in your log already: saving this too would count the game twice. */}
            {liveOnly && liveTwins.logged ? <Text style={styles.twiceNote}>{`This session is already in your log, from ${fromWho(liveTwins.logged)}. Saving it again counts it twice.`}</Text> : null}
            <Reanimated.View layout={LinearTransition.duration(220)} style={styles.logRows}>
              {whoRow}
              {opened?.type === 'tracker' ? (
                <HealthShareRow line={!!whoRow} activity={opened.activity} choice={health} onChoice={setHealth} />
              ) : typedNumbers ? (
                // The numbers typed in above, by the same switch and rules as a tracker's (Oct 8).
                <HealthShareRow line={!!whoRow} activity={typedNumbers} choice={health} onChoice={setHealth} />
              ) : null}
              {placeRows}
              {/* One people row: "Who was there" on a match or a practice; on drills or fitness, Tag people once there is a photo or a clip to tag them in. */}
              {!whoRow && (media || tagged.length) ? <TagPlayers variant="row" line label="Tag people" tagged={tagged} onChange={setTagged} /> : null}
            </Reanimated.View>
            {fromLive ? (
              // From Finish: thrown away, asked first (the log sheet's own "Discard session").
              <Pressable accessibilityRole="button" accessibilityLabel="Discard session" hitSlop={8} onPress={hideIt} style={({ pressed }) => [styles.hideIt, pressed && { opacity: 0.6 }]}>
                <Text style={styles.hideItText}>Discard session</Text>
              </Pressable>
            ) : opened?.type === 'tracker' && !openedLog && opened.activity.status === 'new' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={workoutLog ? 'Hide this workout' : 'Not tennis? Hide this session'} hitSlop={8} onPress={hideIt} style={({ pressed }) => [styles.hideIt, pressed && { opacity: 0.6 }]}>
                <Text style={styles.hideItText}>{workoutLog ? 'Hide this workout' : 'Not tennis? Hide it'}</Text>
              </Pressable>
            ) : null}
            <View style={{ height: DOCK_ROOM + insets.bottom }} />
          </Screen>
          {keysUp ? null : (
            <LogDock
              canJustLog={!openedLog}
              busy={busy}
              ticked={ticked}
              error={logError}
              onJustLog={justLog}
              onShare={submit}
              shareDisabled={!(opened || liveOnly) || !postsChecked}
              label="Post session"
              quietLabel="Save privately"
              streak={savedStreak ?? streakPreview}
            />
          )}
        </Reanimated.View>
      </View>
    );
  }

  const formBack = () => (mode === 'hit' ? router.navigate('/hit') : opened && !media ? goBackNow() : setStage('edit'));
  stageBack.current = () => { formBack(); return true; };
  // Share is the big green button along the foot, as on a session's post ("Log it"): one look on every
  // posting screen (owner, Oct 6). While the phone's keyboard covers the foot, it is up in the corner, still green.
  const shareLabel = mode === 'story' || mode === 'hit' ? 'Post Instant' : 'Share';
  const shareOff = !canSubmit || groupWaiting || groupGone;
  // The picture, small, beside the caption (Instagram's), so Share to, the people, the place and the
  // stats show without scrolling: about 68 wide at the post's own shape, a landscape one a touch wider.
  const thumb = orientation === 'landscape'
    ? { width: 72, height: Math.round(72 * 9 / 16) }
    : { width: 68, height: Math.round(68 / portraitRatio) };
  const withThumb = mode !== 'hit' && mode !== 'story' && !!media?.uri;
  // The minutes box: "90 min" at rest, just the number while typing. Under Add session stats, or a challenge entry's own row.
  const minutesBox = (
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
  );
  return (
    <View style={[styles.backdrop, mode === 'hit' && { backgroundColor: colors.bg }]}>
      {mode === 'hit' ? null : <SheetBackdrop />}
      <View style={styles.sheet}>
        <Screen
          title={mode === 'clip' || openedClip ? 'New clip' : mode === 'post' ? 'New post' : mode === 'story' ? 'New story' : 'New Instant'}
          compactTitle
          onBack={formBack}
          right={keysUp ? <Button label={shareLabel} size="sm" onPress={submit} disabled={shareOff} /> : undefined}
        >
          <View style={mode === 'story' || mode === 'hit' ? styles.form : null}>
            {/* Opened for a tracker's session that never came (hidden, gone after 30 days): a plain new post. */}
            {params.activity && !opened && !tracker.waiting ? <Text style={styles.goneNote}>That session is no longer here.</Text> : null}
            {opened ? (
              <AttachSessionStats
                pick={opened}
                attached={withStats}
                onAttach={setAttached}
                health={health}
                onHealth={setHealth}
                posted={openedPosted}
                loggedMinutes={opened.type === 'tracker' ? sessions.find((x) => x.activityId === opened.activity.id)?.minutes : undefined}
              />
            ) : null}
            {opened && withStats && addScoreTo ? <AddScore sessionId={addScoreTo} style={styles.addScoreStats} /> : null}
            {withThumb ? null : <View style={styles.stage}>
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
                  <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your Instant" />
                </View>
              ) : (
                <MediaPicker bare orientation={orientation} portraitRatio={portraitRatio} selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} trim={edit} onCoverAt={(at) => setEdit((was) => ({ ...was, coverAt: at }))} />
              )}
            </View>}
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
                maxLength={INSTANT_MAX}
              />
            ) : (
              <>
                {/* The caption, with no label over it: the box says what it is. With a photo or clip, the
                    picture sits small at its left, the words beside it, the way Instagram's share screen has them.
                    Tapping the picture opens the larger preview, and Edit cover the Cover page, as before. */}
                {withThumb ? (
                  <View style={styles.captionRow}>
                    <MediaPicker bare thumb={thumb} orientation={orientation} portraitRatio={portraitRatio} selection={mode === 'clip' ? 'video' : 'all'} value={media} onChange={setMedia} trim={edit} onCoverAt={(at) => setEdit((was) => ({ ...was, coverAt: at }))} />
                    <View style={styles.flex}>
                      <Field bare accessibilityLabel="Caption" value={body} onChangeText={setBody} placeholder={opened && !openedPosted ? `${pickCaption(opened)} — how did it go?` : 'Write a caption…'} multiline minHeight={Math.max(64, thumb.height)} mentions maxLength={POST_MAX} />
                    </View>
                  </View>
                ) : (
                  <View style={styles.caption}>
                    <Field accessibilityLabel="Caption" value={body} onChangeText={setBody} placeholder={opened && !openedPosted ? `${pickCaption(opened)} — how did it go?` : 'Write a caption…'} multiline minHeight={88} mentions maxLength={POST_MAX} />
                  </View>
                )}
                {inChallenge ? (
                  <View style={styles.challengeChip} accessible accessibilityLabel={`Entering this week's challenge: ${challenge.title}`}>
                    <Ionicons name="trophy-outline" size={14} color={colors.brand} />
                    <Text style={styles.challengeChipText}>Entering {challenge.title}</Text>
                  </View>
                ) : null}
                {/* Share to: shown once you are in a group. Everyone is the default, and it reaches your groups too; "Only <group>" is the private choice. */}
                {(feedGroups.length || shareTo) && !inChallenge ? (
                  <View style={styles.shareTo} accessibilityRole="radiogroup" accessibilityLabel="Share to">
                    <Text style={styles.shareToLabel}>Share to</Text>
                    <View style={styles.shareToChips}>
                      <Chip label="Everyone" selected={!shareTo} onPress={() => setShareTo(null)} />
                      {feedGroups.map((g) => <Chip key={g.id} label={`Only ${g.name}`} selected={shareTo === g.id} onPress={() => setShareTo(g.id)} />)}
                    </View>
                    {groupWaiting ? <Text style={styles.shareToNote}>Checking your groups…</Text>
                      : groupGone ? <Text style={styles.shareToNote}>You're not in that group any more. Pick Everyone or one of your groups to share.</Text>
                      : shareTo ? <Text style={styles.shareToNote}>Only people in {feedGroups.find((g) => g.id === shareTo)?.name ?? 'the group'} will see this.</Text>
                      : feedGroups.length ? <Text style={styles.shareToNote}>{`Everyone · also shows in ${alsoShowsIn(feedGroups)}`}</Text> : null}
                  </View>
                ) : null}
                {/* One list of rows, the Settings rows' size without their card. */}
                <View style={styles.rows}>
                  {/* One people row: "Who was there" with a session (its people asked to accept), Tag people without. */}
                  {whoRow ?? copyRow ?? <TagPlayers variant="row" label="Tag people" tagged={tagged} onChange={setTagged} />}
                  {placeRows}
                  {/* A Post or a Clip can carry one of your sessions: a row to pick it, then its stats in the row's place.
                      How long you played is asked once, here in session stats (owner, Oct 6): a session picked from your
                      log brings its own time; with none to pick, just the minutes, which go on the post as they always did. */}
                  {statsRow && !statsPick ? (
                    <View ref={minutesRow}>
                      <FormRow line icon="stopwatch-outline" label="Add session stats" chevron onPress={pickStats} />
                      {/* The words are the box's label (a tap on them goes to the box); the box is what a screen reader lands on. */}
                      <View style={styles.minutesLine}>
                        <Text style={styles.minutesWords} numberOfLines={1} onPress={() => minutesInput.current?.focus()} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">Or just your minutes on court</Text>
                        {minutesBox}
                      </View>
                    </View>
                  ) : null}
                  {statsRow && statsPick ? (
                    <View style={styles.statsCard}>
                      <View style={styles.statsRule} />
                      <AttachSessionStats
                        pick={statsPick}
                        attached
                        onAttach={(on) => { if (!on) { setStatsPick(null); setJustLogged(false); } }}
                        onChange={pickStats}
                        health={health}
                        onHealth={setHealth}
                        posted={false}
                        loggedMinutes={statsPick.type === 'tracker' ? statsPick.session?.minutes : undefined}
                        justLogged={justLogged}
                      />
                    </View>
                  ) : null}
                  {/* A session already knows its time on court. A challenge entry (no session stats) keeps its own row. */}
                  {opened || statsRow ? null : <FormRow
                    ref={minutesRow}
                    line
                    icon="time-outline"
                    label="Minutes on court"
                    // The box itself is what a screen reader lands on; the row is its label.
                    accessible={false}
                    accessibilityRole="none"
                    onPress={() => minutesInput.current?.focus()}
                    control={minutesBox}
                  />}
                  {/* A post with session stats is never offered for CourtSide's Instagram. On for everyone by default (owner, Oct 5);
                      the Terms' "When CourtSide features your post" and the privacy policy quote this label, so change them together. */}
                  {(opened && withStats) || (statsRow && statsPick) || groupPost ? null : <FormRow
                    line
                    icon="megaphone-outline"
                    label="Let CourtSide feature this on its Instagram"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: featureOk }}
                    accessibilityLabel="Let CourtSide feature this on its Instagram"
                    onPress={() => setFeatureOk((on) => !on)}
                    // The row is the switch: the toggle only shows its state, so one tap flips it once.
                    accessory={<View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Toggle value={featureOk} onChange={setFeatureOk} /></View>}
                  />}
                </View>
              </>
            )}
          </View>
          <View style={{ height: DOCK_ROOM + insets.bottom }} />
        </Screen>
        {keysUp ? null : (
          <LogDock canJustLog={false} busy={null} ticked={false} error="" onJustLog={() => undefined} onShare={submit} shareDisabled={shareOff} label={shareLabel} />
        )}
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
  // The picture small at the left, the caption beside it, tops level, a thin line under both.
  captionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  shareTo: { gap: spacing.sm, marginTop: spacing.md },
  shareToLabel: { ...typography.smallStrong, color: colors.textMuted },
  shareToChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shareToNote: { ...typography.small, color: colors.textMuted },
  challengeChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: spacing.sm, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.brandDim },
  challengeChipText: { ...typography.smallStrong, color: colors.brand },
  rows: { marginTop: spacing.lg },
  // "Or just your minutes on court": under Add session stats, starting where its words start (FormRow's 26 icon plus its gap).
  minutesLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 26 + spacing.md, marginTop: -6, paddingBottom: 10, minHeight: 32 },
  minutesWords: { ...typography.small, color: colors.textMuted, flex: 1 },
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
  // "Log it": the card and its tiles, the caption beside your picture, the chips, the rows.
  logTop: { marginTop: spacing.sm },
  goneNote: { ...typography.smallStrong, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.md },
  logCaption: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.xl, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  logAvatar: { marginTop: 6 },
  flex: { flex: 1 },
  logChips: { gap: spacing.md, marginTop: spacing.lg },
  scoreBox: { marginTop: spacing.md },
  addScore: { alignSelf: 'flex-start', marginTop: spacing.lg },
  addScoreStats: { alignSelf: 'flex-start', marginTop: -spacing.sm, marginBottom: spacing.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 170 },
  whoName: { ...font('600'), fontSize: 15, color: colors.text, flexShrink: 1 },
  whoAsked: { ...typography.small, color: colors.textFaint },
  logRows: { marginTop: spacing.md },
  // How long: the tracker's time on one line, with a small Edit (TrackedLength, as Log your tennis has it).
  lengthBox: { marginTop: spacing.lg },
  manualStats: { marginTop: spacing.lg },
  hideIt: { alignSelf: 'center', paddingVertical: spacing.lg },
  twiceNote: { ...typography.smallStrong, color: colors.text, marginTop: spacing.md },
  hideItText: { ...font('600'), fontSize: 13, color: colors.textMuted },
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

/** Whether the phone's keyboard is up (never, in a browser): the composer's dock steps aside for it. */
function useKeysUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const ios = Platform.OS === 'ios';
    const a = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const b = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return up;
}
