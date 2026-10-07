import React, {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as DeviceState, Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { computeStats, localDay, publicStreak, streakAtRisk } from '@/features/practice/stats';
import { streakSeen } from '@/features/practice/streakFlame';
import { planStreakReminder } from '@/features/practice/reminder';
import { isMapCourtId } from '@/features/places/courtName';
import { TERMS_VERSION } from '@/lib/legal';

import { fetchBootstrap, searchPosts as apiSearchPosts, signIn as apiSignIn, type Bootstrap } from '@/data/api';
import * as demoApi from '@/data/api';
import { BLOCKED_WORDS_NOTE, CHAT_PHOTO_UNREADABLE, REVIEW_NOTE_MAX, auth as remoteAuth, fetchRemote, isLocalMedia, onWordsRefused, queueFeedSignal, remote, uploadChatPhoto, uploadMedia, emptyProfile, type GroupRefusal, type AdminReport, type ModerationResult, type ReviewAskResult, type ReportedChat, type ReportedItem, type ReportedItemKind, type ReportEvidence, type FeedSignal, type SiteFeedback, type WaitlistEntry, type BetaInviteStatus, type FirstDayStats, type FirstMove, type HandleStatus, type InviteCodeResult, type MyInviter, type RemoteData, type UserState } from '@/data/remote';
import { clearSnapshot, markSnapshotOpened, markSnapshotOpening, readSnapshot, saveSnapshot, snapshotFailedBefore } from '@/data/snapshot';
import { forgetAccount, listSavedAccounts, rememberAccount, type SavedAccount } from '@/features/accounts/savedAccounts';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { isSupabaseConfigured, storedLoginId, supabase } from '@/lib/supabase';
import { markMessagesOpened } from '@/features/messaging/readReceipts';
import { GROUP_CAP, MAX_PINNED_CHATS, chatLockNote, eventText, findDirectChat, groupName, isDirectChat, isGroupAdmin, isGroupChat, named } from '@/features/messages/groupRules';
import { heardMessage, heardUnsent } from '@/features/messages/incoming';
import { MAX_CHAT_PHOTOS, clearSendProgress, keepLocalCopy, setSendProgress } from '@/features/messages/chatPhotos';
import { readReceiptPreference, saveReceiptPreference } from '@/features/messaging/preferences';
import { connectProvider, disconnectProvider, withCatalog } from '@/lib/integrations';
import { appleHealthAvailable, connectAppleHealth, readAppleHealth, readAppleNutrition } from '@/features/health/appleHealth';
import { isTracker, tennisFlags, TRACKERS } from '@/features/activity/flags';
import { checkForTennis, reportFromAlert } from '@/features/activity/check';
import { pickSource } from '@/features/activity/recent';
import { isTennisActivity, workoutLine, workoutName } from '@/features/activity/workouts';
import { detectedNote } from '@/features/activity/format';
import { FOLD_OVER, allTennis as allTennisFound, foundBursts, foundHref, foundLine, foundTitle } from '@/features/activity/found';
import { mergePast, readOneWithHeartRate, readPastHealth, type PastWorkout } from '@/features/activity/pastWorkouts';
import { postShare, reshare, sameShare } from '@/features/activity/healthShare';
import { OPPONENT_MAX, REFUSALS, maxTagsFor, canTagKind, firstName, isActive, localRefusal, mirrorCopy, nameFor, patchWith, reconcileWith, refusalWords, roleOn, tagsOnSession, withEntry, withOnNewPost } from '@/features/activity/sessionTags';
import { duration } from '@/lib/format';
import { forgetReferrer, isWaitlistCode, peekReferrer } from '@/features/invite/referral';
import { asHitMiles, endOfToday } from '@/features/players/openToHit';
import { pickNutritionExport } from '@/features/health/cronometer';
import { nearestPlace } from '@/data/locations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPosition } from '@/lib/geo';
import { shrinkPhoto } from '@/features/compose/shrinkPhoto';
import { canBeFeatured } from '@/features/compose/featuring';
import * as haptics from '@/lib/haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as toast from '@/lib/toast';
import { anyUploading, cancelUpload, finishUpload, holdQuietUpload, setUploadProgress, simulateUpload, startUpload } from '@/lib/uploads';
import { requestFeedRefresh } from '@/features/feed/feedBus';
import { loadFeedScores } from '@/features/feed/feedScores';
import { blockDevice, groupFor, isDeviceBlocked, rememberAnswered, yearsOld, type AgeGroup } from '@/features/age/ageCheck';
import { knownOpen, notKnownAdult, type AgeSource, type Openness, type OpennessMap } from '@/features/players/age';
import type { TeenMap } from '@/features/players/mapPrivacy';
import { placeFor } from '@/features/players/positions';
import { markFirstMoveDone } from '@/features/onboarding/firstMoveDone';
import { show as showToast } from '@/lib/toast';
import { opensAtFor } from '@/features/hits/audience';
import { keepUnsentThread } from '@/features/community/unsentThread';
import { keepUnsentCoachQuestion } from '@/features/coaching/unsentQuestion';
import { forgetPushToken, registerForPush } from '@/features/push/push';
import { stopWorkoutWatch } from '@/features/health/workoutWatch';
import { framesAt } from '@/features/compose/frames';
import { noteStep, reportError } from '@/lib/crashReporting';
import { noteAppOpen } from '@/features/usage/appOpens';
import { noteTimeZone } from '@/features/recap/timeZone';
import { learned as learnedTip } from '@/features/tips/tips';
import { emptyCourtLife, useCourtLife, type CourtLifeActions, type CourtLifeState } from '@/store/courtLife';
import { forgetLinkPreviews } from '@/features/messages/linkPreview';
import { groupInviteText } from '@/features/groups/inviteMessage';
import { KIND_WORD } from '@/features/moderation/reasons';
import { emptyFeedGroups, useFeedGroups, type FeedGroupsActions, type FeedGroupsState } from '@/store/feedGroups';
import type {
  DailyHealth,
  DetectedActivity,
  IntegrationProvider,
  Answer,
  Coach,
  CoachApplication,
  CoachingRequest,
  CoachQuestion,
  CoachReply,
  CoachResult,
  CoachService,
  CoachReview,
  CoachSpecialty,
  Comment,
  Conversation,
  ID,
  Integration,
  MatchResult,
  Message,
  Notification,
  NotificationTarget,
  PaymentKind,
  PaymentMethod,
  Post,
  PostKind,
  Question,
  QuestionTopic,
  SavedItems,
  SessionDetail,
  PracticeSession,
  SessionPlayer,
  SessionTag,
  SessionTagRefusal,
  LastSeen,
  MapVisibility,
  HitRequest,
  ChatEvent,
  ChatPhoto,
  ShareItem,
  Story,
  User,
  PlayerProfile,
  MediaCrop, Tip, TaggedCourt, TrackerId, Invitee, ContactMatch, HealthShareKey, HeadToHead, CourtKings, FlybyPerson, FriendStreak, MatchSet, Removed, RemovedItem, ReviewRequest, ReviewStatus, TakedownKind, TakedownReason, TournamentEntry, HiddenWords, HiddenWordsKind } from '@/data/types';
import { HIDDEN_WORDS_MAX, HIDDEN_WORD_LENGTH, cleanWords, defaultHiddenWords } from '@/features/hiddenWords/hiddenWords';
import { canScore, scoreNotKept, setsWinner } from '@/features/activity/score';

interface NewStoryInput {
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  mediaLabel?: string;
  caption?: string;
}

interface NewPostInput {
  kind: PostKind;
  /** Shared to one group you are in, not everyone (migration 67). */
  groupId?: ID;
  /** Where it was, if they said. */
  location?: string;
  /** The court it was played on, picked from the map's courts. */
  court?: TaggedCourt;
  /** Off when the author would rather CourtSide did not feature it. */
  featureOk?: boolean;
  /** People tagged in it; each gets a notification. */
  taggedUserIds?: ID[];
  orientation?: 'portrait' | 'landscape';
  trimStart?: number;
  trimEnd?: number;
  crop?: MediaCrop;
  muted?: boolean;
  speed?: number;
  volume?: number;
  body: string;
  tags: string[];
  match?: MatchResult;
  session?: SessionDetail;
  mediaLabel?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

interface NewCoachQuestionInput {
  title: string;
  body: string;
  specialty: CoachSpecialty;
  videoUrl?: string;
  mediaLabel?: string;
}


/** Said when the day's limit of new people to message is used up (migration 109). */
const LIMIT_NOTE = 'You have messaged a lot of new people today. Try again tomorrow.';
export type CoachApplicationInput = Omit<CoachApplication, 'id' | 'userId' | 'status' | 'createdAt'>;

/**
 * How putting people in a group went: in (with the group's id), or why not.
 * 'teen': someone not known to be an adult does not follow you; 'blocked':
 * a block between someone being added and someone else in it; 'full': past
 * GROUP_CAP people; 'failed': anything else (no connection, say). `who` is
 * the people it was about when the app can tell (the server never says): for
 * 'teen', the picked people who don't follow you, re-checked just now; for
 * 'blocked', the one person being added. Empty when it can't tell.
 */
export type GroupOutcome = { ok: true; id: ID } | { ok: false; why: 'teen' | 'blocked' | 'full' | 'words' | 'failed'; who: ID[] };

interface NewQuestionInput {
  title: string;
  body: string;
  topic: QuestionTopic;
  tags: string[];
  /** 2 to 4 poll options, when the thread asks the room to vote. */
  poll?: string[];
}

/**
 * Files a notification, unless you caused it yourself — nobody wants to be told
 * they liked their own post. Pure, so it composes inside a setState updater.
 */
/** Everyone written as @handle in a text is told, once each — never the writer, never someone already told (one person, or several). */
function notifyMentions(state: AppState, text: string, actorId: ID, targetId: ID, targetKind: NotificationTarget, alreadyTold?: ID | (ID | undefined)[]): AppState {
  const handles = new Set((text.match(/@([a-z0-9_]+)/gi) ?? []).map((h) => h.slice(1).toLowerCase()));
  const told = new Set(Array.isArray(alreadyTold) ? alreadyTold : [alreadyTold]);
  let next = state;
  for (const handle of handles) {
    const who = state.users.find((u) => u.handle.toLowerCase() === handle);
    if (!who || who.id === actorId || told.has(who.id)) continue;
    next = withNotification(next, { userId: who.id, actorId, kind: 'tag', targetId, targetKind, preview: snippet(text) });
  }
  return next;
}

function withNotification(
  state: AppState,
  entry: {
    userId: ID;
    actorId: ID;
    kind: Notification['kind'];
    targetId: ID;
    targetKind: NotificationTarget;
    preview?: string;
  },
  /** A row from yourself to yourself: a tracker's session waiting to be logged ("Tennis detected"), as the server files it. */
  opts: { toSelf?: boolean } = {},
): AppState {
  if (!entry.userId || (entry.userId === entry.actorId && !opts.toSelf)) return state;
  const notification: Notification = {
    ...entry,
    id: nextId('n'),
    createdAt: new Date().toISOString(),
    read: false,
  };
  return { ...state, notifications: [notification, ...state.notifications] };
}

/**
 * The moment something of yours goes live: a heavier buzz, a banner from the
 * top, and a line in your notifications so the record of it survives the
 * banner. This is the one notification that is allowed to be from yourself.
 */
function celebratePosted(
  state: AppState,
  entry: { userId: ID; targetId: ID; targetKind: NotificationTarget; preview: string; title: string; body: string; href: string; icon: string; quiet?: boolean },
): AppState {
  haptics.reward();
  // The posting strip has already said it landed; no banner on top of that.
  if (!entry.quiet) toast.show({ title: entry.title, body: entry.body, href: entry.href, icon: entry.icon });
  const notification: Notification = {
    id: nextId('n'),
    userId: entry.userId,
    actorId: entry.userId,
    kind: 'posted',
    targetId: entry.targetId,
    targetKind: entry.targetKind,
    preview: entry.preview,
    createdAt: new Date().toISOString(),
    read: false,
  };
  return { ...state, notifications: [notification, ...state.notifications] };
}

/** First line of a body, trimmed to something that fits one row. */
function snippet(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** What a double tap leaves, remembered on this device. */
const DEFAULT_REACTION_KEY = 'courtside-default-reaction';
/** At start: a browser has it at once; a phone reads it a moment later (see the effect in the provider). */
function readDefaultReaction(): string {
  try {
    if (Platform.OS !== 'web') return '❤️';
    return localStorage.getItem(DEFAULT_REACTION_KEY) || '❤️';
  } catch {
    return '❤️';
  }
}

/** Demo wallet. A real build gets these from the payment provider. */
const STARTER_PAYMENTS: PaymentMethod[] = [
  { id: 'pm-visa', kind: 'card', label: 'Visa', detail: '•••• 4242 · exp 09/28' },
  { id: 'pm-apple', kind: 'apple-pay', label: 'Apple Pay' },
];

function readFlag(key: string): boolean {
  try {
    return Platform.OS === 'web' && localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

/**
 * Whether you have ever chosen Location on or off. The browser knows at once;
 * the phone reads it a moment after start (null until then). Storage that
 * cannot be read counts as chosen, so it never sets off an ask by itself.
 */
function readAsked(key: string): boolean | null {
  if (Platform.OS !== 'web') return null;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
}

/**
 * A Location off that has not reached the server yet: the account whose spot
 * still needs forgetting, kept on this device until a forget goes through.
 */
const FORGET_KEY = 'courtside-location-forget';
async function readForgetPending(): Promise<string | null> {
  try {
    return Platform.OS === 'web' ? localStorage.getItem(FORGET_KEY) : await AsyncStorage.getItem(FORGET_KEY);
  } catch {
    return null;
  }
}
function writeForgetPending(who: ID | null) {
  try {
    if (Platform.OS === 'web') { if (who) localStorage.setItem(FORGET_KEY, who); else localStorage.removeItem(FORGET_KEY); }
    else void (who ? AsyncStorage.setItem(FORGET_KEY, who) : AsyncStorage.removeItem(FORGET_KEY)).catch(() => {});
  } catch {}
}

function readDefaultPayment(): ID {
  try {
    if (Platform.OS !== 'web') return 'pm-visa';
    return localStorage.getItem('courtside-default-payment') || 'pm-visa';
  } catch {
    return 'pm-visa';
  }
}

/** The demo's answer to "Who can see you on the map?", kept in the browser; null until chosen. */
const DEMO_VISIBILITY_KEY = 'courtside-demo-map-visibility';
function readDemoVisibility(): MapVisibility | null {
  try {
    if (Platform.OS !== 'web') return null;
    const v = localStorage.getItem(DEMO_VISIBILITY_KEY);
    return v === 'nearby' || v === 'mutuals' || v === 'none' ? v : null;
  } catch {
    return null;
  }
}

/** The switches in Settings, kept with the account. */
export interface Prefs {
  showActivity: boolean; pushLikes: boolean; pushCoach: boolean; pushMessages: boolean; pushActivity: boolean;
  /** The four map alerts (migration 60): a friend up for a hit, new hits near you, new players near you, courts you follow. */
  pushMapFriends: boolean; pushMapHits: boolean; pushMapPlayers: boolean; pushCourts: boolean;
  /** "Let people find me from their contacts" (migration 89): off, you never come up when someone checks their contacts. */
  contactsFindable: boolean;
  /** The weekly recap's phone alert, Mondays at 8am (migration 130). Off, the row still lands in Notifications. */
  pushRecap: boolean;
  /** "Sam just joined CourtSide near you" as a phone alert (migration 146). Off, the row still lands in Notifications. */
  pushJoined: boolean;
  /** The 7pm "Keep your streak" reminder, set on the phone itself (kept with the account by migration 146). */
  pushStreak: boolean;
}
export type PrefKey = keyof Prefs;
const DEFAULT_PREFS: Prefs = { showActivity: true, pushLikes: true, pushCoach: true, pushMessages: true, pushActivity: true, pushMapFriends: true, pushMapHits: true, pushMapPlayers: true, pushCourts: true, contactsFindable: true, pushRecap: true, pushJoined: true, pushStreak: true };

interface AppState extends Bootstrap, CourtLifeState, FeedGroupsState {
  ready: boolean;
  /** Health came from this account's own connections, not the demo; a reload must keep it. */
  healthIsReal?: boolean;
  /** The stored session has been checked, so a redirect to sign-in is not premature. */
  authResolved: boolean;
  /** What a double tap leaves on a message. */
  defaultReaction: string;
  currentUserId: ID | null;
  onboardingComplete: boolean;
  error: string | null;
  saved: SavedItems;
  /** People you follow. */
  followingIds: ID[];
  /** True once the signed-in account's data has come down from Supabase. */
  remoteLoaded: boolean;
  /** The saved copy from last time is on screen (see data/snapshot) while the fresh load is on its way. */
  snapshotShown: boolean;
  /**
   * Which terms the signed-in account has agreed to: a version, null when it
   * has agreed to none, or undefined while that is not known yet (so nobody
   * is sent to agree before their account has even been read).
   */
  termsVersion: string | null | undefined;
  /** Logins remembered on this device, newest first. */
  savedAccounts: SavedAccount[];
  /** Every follow the app knows about, for followers and following lists. */
  followEdges: { followerId: ID; followingId: ID }[];
  /**
   * Where the feed has got to: the moment of the oldest post it has asked
   * for, and whether older ones may still be waiting. The feed asks for the
   * next page as it nears the end, rather than loading everything at once.
   */
  feed: { cursor: string | null; more: boolean };
  /** Pending asks to follow a private account — yours, and the ones waiting on you. */
  followRequests: { fromId: ID; toId: ID; createdAt: string }[];
  /** People whose posts you have muted — still followed, just quiet. */
  mutedIds: ID[];
  /** Posts, hits, threads, replies, comments and coach questions you have reported: gone from everything you see (Oct 3, Oct 5). */
  reportedIds: ID[];
  /** People you have blocked. Their posts and messages are hidden. */
  blockedIds: ID[];
  /**
   * People who have blocked you, as the server says (migration 118; empty
   * without it). Search, the @ list and suggestions leave them out, the way
   * they leave out people you blocked.
   */
  blockedMeIds: ID[];
  /** People whose new posts you have asked to be told about. */
  alertIds: ID[];
  /** Ways to pay a coach, and which one is used unless you say otherwise. */
  paymentMethods: PaymentMethod[];
  defaultPaymentId: ID | null;
  /** Early users' suggestions, votes and all. */
  tips: Tip[];
  /** Your own practice log: where streaks, hours and win rate come from. */
  sessions: PracticeSession[];
  /**
   * People tagged in sessions (migration 62): every tag you made and every tag
   * of you, as my_session_tags() returns them. Only the two people on a tag
   * ever see it.
   */
  sessionTags: SessionTag[];
  /**
   * Whether the server can tag players on sessions yet (migration 62 has
   * run). Until it says so, "Who you played" is a free-text box only.
   * Always on in the demo.
   */
  sessionTagsReady: boolean;
  /**
   * What the server has said about people (migration 64, open_to_you):
   * whether you may start a chat with them. Nobody's age but your own
   * reaches the app, so this is how it knows. Asked only about the people it
   * is about to show or act on, kept for this session and account.
   */
  openness: OpennessMap;
  /**
   * Of the posts with a court that the app asked about (migration 64,
   * shown_at_court), which may show on a court's page for you: the teen
   * rule, which needs ages the app no longer has.
   */
  courtShown: Record<ID, boolean>;
  /**
   * Whether the last load found everyone's age on the profiles: true before
   * migration 64, false since. Null until a load from the server says
   * (treated like true: with no ages on the profiles, nobody counts as an
   * adult, so nothing is opened or shown that should not be).
   */
  agesOnProfiles: boolean | null;
  /** Last spots for the map, by id, your own included (migration 46). */
  lastSeen: Record<ID, LastSeen>;
  /** Whether the last spots have come down once since signing in, so an empty map is known to be empty, not still loading. */
  lastSeenLoaded: boolean;
  /**
   * Whether the database has the map's round 2 (migration 63: exact pins at
   * courts and for people who follow each other, "Who can see you on the
   * map?", New on CourtSide decided by the server). Null until it is known;
   * always true in the demo, which plays the server's part.
   */
  mapLive: boolean | null;
  /** Your answer to "Who can see you on the map?": null never chosen; undefined not known (or a database before 63). */
  mapVisibility: MapVisibility | null | undefined;
  /**
   * The map's teen rule (migration 78), for an account not known to be an
   * adult: 'off' until the database has it (on the map only adults, as
   * before), or 'on' (shared only between friends who follow each other;
   * under 16s too since migration 119).
   */
  teenMap: TeenMap;
  /** New on CourtSide as the server lists it for you (migration 63), newest first; null until asked, or before 63. */
  newOnCourtside: { userId: ID; joinedAt: string }[] | null;
  /** Open "Looking for a hit" posts. */
  hitRequests: HitRequest[];
  /** Small switches from Settings, kept with the account. */
  prefs: Prefs;
  /**
   * Whether the database has "Let people find me from their contacts"
   * (migration 89), from the settings row's own key (with no row yet, from a
   * question of its own at load). Until it is known the
   * switch is not shown: it would do nothing, and come back on at the next start.
   */
  contactsFindableLive: boolean;
  /** The database has the "Players joining near you" switch (migration 146); before that it would do nothing, so it is not shown. */
  joinAlertsLive: boolean;
  /**
   * Your Hidden words (Settings → Hidden words, migration 117): null until
   * the page has asked for them. The demo keeps its own on this phone.
   */
  hiddenWords: HiddenWords | null;
  /**
   * Your own asks for a review of something taken down (migration
   * 20261006000139): null until something removed of yours first shows and
   * asks for them. The demo keeps its own on this phone.
   */
  reviewRequests: ReviewRequest[] | null;
  /**
   * Asking for a review is not on this database yet (no migration
   * 20261006000139): "Ask for a review" stays hidden, and "Why? See the
   * rules" shows alone. Read again on the next full refresh.
   */
  reviewsOff: boolean;
  /**
   * The last read of your asks did not come back (no signal, say). "Ask for
   * a review" still works meanwhile (the server turns a second ask away) and
   * the read is tried again in the background.
   */
  reviewsFailed: boolean;
  /** Whether the app may ask the device where you are, and the city it found. */
  locationEnabled: boolean;
  /**
   * Whether Location was ever turned on or off here: null while the phone
   * reads it, false only when never. The map asks by itself only then, so
   * an Off you chose stays off (and your pin stays gone).
   */
  locationAsked: boolean | null;
  detectedLocation: string | null;
  /** The actual fix, for the map; the city name above is for text. */
  detectedCoords: { lat: number; lng: number } | null;
}

/** Your own settings as they are saved to the account (see the settings sync in AppProvider), for telling a change apart. */
const settingsJson = (s: Pick<AppState, 'mutedIds' | 'blockedIds' | 'saved' | 'paymentMethods' | 'defaultPaymentId' | 'prefs'>) =>
  JSON.stringify({ m: s.mutedIds, b: s.blockedIds, s: s.saved.questionIds, p: s.paymentMethods, d: s.defaultPaymentId, f: s.prefs });

/**
 * Your settings as the server has them (`got`), with what was changed on
 * this phone since `base` (what it had before, as settingsJson wrote it) put
 * back on top: someone blocked, muted or saved here, or taken off here, a
 * switch flipped here, a card added here. Everything else is the server's.
 * No row on the server (null): what is here is all there is.
 */
function withServerSettings(s: AppState, base: string, got: UserState | null): Pick<AppState, 'mutedIds' | 'blockedIds' | 'saved' | 'paymentMethods' | 'defaultPaymentId' | 'prefs'> {
  const here = { mutedIds: s.mutedIds, blockedIds: s.blockedIds, saved: s.saved, paymentMethods: s.paymentMethods, defaultPaymentId: s.defaultPaymentId, prefs: s.prefs };
  if (!got) return here;
  const was = JSON.parse(base) as { m: ID[]; b: ID[]; s: ID[]; p: PaymentMethod[]; d: ID | null; f: Prefs };
  // The server's list, less what was taken off here, plus what was added here.
  const list = (theirs: ID[], mine: ID[], before: ID[]) => [...theirs.filter((id) => mine.includes(id) || !before.includes(id)), ...mine.filter((id) => !before.includes(id) && !theirs.includes(id))];
  const prefs: Prefs = {
    showActivity: got.showActivity, pushLikes: got.pushLikes, pushCoach: got.pushCoach, pushMessages: got.pushMessages ?? true, pushActivity: got.pushActivity ?? true,
    pushMapFriends: got.pushMapFriends ?? true, pushMapHits: got.pushMapHits ?? true, pushMapPlayers: got.pushMapPlayers ?? true, pushCourts: got.pushCourts ?? true,
    contactsFindable: got.contactsFindable ?? true,
    pushRecap: got.pushRecap ?? true,
    // Migration 146: a database without them keeps what this phone has.
    pushJoined: got.pushJoined ?? s.prefs.pushJoined, pushStreak: got.pushStreak ?? s.prefs.pushStreak,
  };
  for (const k of Object.keys(prefs) as PrefKey[]) if (s.prefs[k] !== was.f[k]) prefs[k] = s.prefs[k];
  const cardsChanged = JSON.stringify(s.paymentMethods) !== JSON.stringify(was.p);
  return {
    mutedIds: list(got.mutedIds, s.mutedIds, was.m),
    blockedIds: list(got.blockedIds, s.blockedIds, was.b),
    saved: { ...s.saved, questionIds: list(got.savedQuestionIds, s.saved.questionIds, was.s) },
    paymentMethods: cardsChanged || !got.paymentMethods.length ? s.paymentMethods : got.paymentMethods,
    defaultPaymentId: s.defaultPaymentId !== was.d ? s.defaultPaymentId : got.defaultPaymentId ?? s.defaultPaymentId,
    prefs,
  };
}

/**
 * An account's own settings as a new account starts with them: what logging
 * out, deleting the account or switching leaves on this device, so the next
 * account signed in here never starts with the last one's blocks, mutes,
 * reports, alert switches or saved threads, nor saves them to itself. The
 * demo, which has no accounts, keeps its own.
 */
function freshAccountSettings(): Partial<AppState> {
  if (!isSupabaseConfigured) return {};
  return {
    mutedIds: [], blockedIds: [], blockedMeIds: [], reportedIds: [], alertIds: [], saved: { postIds: [], questionIds: [] },
    paymentMethods: [], defaultPaymentId: null, prefs: DEFAULT_PREFS, hiddenWords: null,
  };
}

/**
 * What an account leaving this device (logged out, logged out everywhere,
 * deleted) leaves on screen: nothing of its own for whoever signs in next.
 * Its health (its tracker sessions too), its courts (who it follows, what it
 * said, where it checked in), its groups and map settings, and its own
 * settings all go with it.
 */
function signedOut(prev: AppState): AppState {
  return {
    ...prev, currentUserId: null, onboardingComplete: false, healthIsReal: false, healthHistory: [], detectedActivities: [],
    ...emptyCourtLife, ...emptyFeedGroups, lastSeenLoaded: false, sessionTags: [], newOnCourtside: null, reviewRequests: null, reviewsOff: false, reviewsFailed: false,
    mapVisibility: isSupabaseConfigured ? undefined : prev.mapVisibility, teenMap: isSupabaseConfigured ? 'off' : prev.teenMap,
    ...freshAccountSettings(),
  };
}

interface AppActions extends CourtLifeActions, FeedGroupsActions {
  /* Location */
  setLocationEnabled: (enabled: boolean) => Promise<string | null>;
  /** "Who can see you on the map?": takes effect at once. Resolves false when it could not be saved. */
  setMapVisibility: (v: MapVisibility) => Promise<boolean>;
  /** Asks who is new on CourtSide for you (migration 63); before it, the screen works the list out itself. */
  loadNewOnCourtside: () => Promise<void>;
  /**
   * Asks again whose tournament plans you may see (migration 123: only
   * friends who follow each other), so a follow-back since the app opened
   * shows theirs and an unfollow hides them. Does nothing before 123.
   */
  loadTournamentPlans: () => Promise<void>;

  /* Payments */
  setDefaultPayment: (id: ID) => void;
  addPaymentMethod: (kind: PaymentKind) => void;
  removePaymentMethod: (id: ID) => void;

  /* People */
  /** `quiet`: no Undo toast. An Undo passes it, so taking a change back does not offer to take that back too. */
  toggleFollow: (userId: ID, quiet?: boolean) => void;
  /** A private account's owner saying yes or no to someone's ask. */
  acceptFollowRequest: (requesterId: ID) => void;
  declineFollowRequest: (requesterId: ID) => void;
  setPrivateAccount: (enabled: boolean) => void;
  /** Up for a hit today: a green ring around you on the map until midnight. */
  setOpenToHit: (on: boolean) => void;
  /**
   * Holding your own ring (Oct 5, owner): open until a time you picked, and
   * how far you'd like to go for a hit (5, 10 or 25 miles; null: any). The
   * distance is shown to others, never a filter.
   */
  editOpenToHit: (until: string, miles: number | null) => void;
  /** Live check while typing a new handle: ok, yours, invalid, taken or held. Null if the check is not available. */
  checkHandle: (handle: string) => Promise<HandleStatus | null>;
  /** Changes your handle. Throws with a plain-English reason when it cannot. */
  changeHandle: (handle: string) => Promise<void>;
  setPref: (key: PrefKey, value: boolean) => void;
  /**
   * Whether some words (a caption, a place, a thread, an edit) would be
   * refused for slurs, sexual words about children, telling someone to kill
   * themselves or the gravest threats (migration 117), asked before anything
   * goes up so the draft stays. False in the demo, or when it cannot be
   * asked (the words are still checked when saved).
   */
  wordsRefused: (texts: string[]) => Promise<boolean>;
  /** Your Hidden words, asked for (migration 117). 'not_ready' on a database without them. */
  loadHiddenWords: () => Promise<'ok' | 'not_ready' | 'failed'>;
  /** Saves them at once on this phone; resolves with why it did not save on the server, or null. An under-18 account keeps both offensive filters on. */
  saveHiddenWords: (next: Omit<HiddenWords, 'locked'>) => Promise<string | null>;
  /** "Unhide" on a comment or reply your Hidden words hid: everyone sees it again. Nobody is told. */
  unhideByWords: (kind: HiddenWordsKind, id: ID) => void;
  /** The asker marks the answer that solved it. */
  acceptAnswer: (questionId: ID, answerId: ID) => void;
  /** The asker marks their coach question as answered. */
  resolveCoachQuestion: (questionId: ID) => void;
  toggleMute: (userId: ID, quiet?: boolean) => void;
  /** Blocking is asked first, so only unblocking offers Undo. */
  toggleBlock: (userId: ID, quiet?: boolean) => void;
  /**
   * Whether you have blocked them, as of this moment. For a Block button
   * tapped well after it was drawn (a toast's, a question's): it checks again
   * first, so a Block never runs the toggle the other way and unblocks.
   */
  isBlocked: (userId: ID) => boolean;
  toggleAlerts: (userId: ID, quiet?: boolean) => void;
  /**
   * Reports someone to CourtSide, about one thing of theirs when `target`
   * names it ("post:<id>", "hit:<id>", "question:<id>", "answer:<id>",
   * "comment:<id>", "coach-question:<id>", "coach-reply:<id>", "tip:<id>",
   * "coach-review:<id>", "court-note:<court>:<key>"), or an account
   * ("profile:<id>"), a group ("group:<id>") or a coach's page
   * ("coach:<id>"). That thing leaves your screens at once; the server works
   * out whose it is. `userId` is whose it is, when the app knows (a group
   * seen from outside, or a court note, names nobody). `note` is what the
   * admin's card says about it (a group's name, a note's words).
   *
   * Resolves whether the report reached CourtSide, so the thanks shows only
   * then. When it didn't (no connection), what was hidden comes back.
   */
  reportUser: (userId: ID | null | undefined, target: string, note?: string) => Promise<boolean>;
  /** A suggestion from an early user, on the board for everyone to vote on. */
  submitTip: (body: string) => Promise<void>;
  voteTip: (tipId: ID, direction: 1 | -1) => void;
  /** Your own tip, off the board for everyone. It comes back, with a toast, if the server says no. */
  deleteTip: (tipId: ID) => void;
  /** Try the account load again after it failed. */
  retryLoad: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;

  setReadReceiptsEnabled: (enabled: boolean) => void;
  /** With Supabase: email and password. Without it: the demo handle. */
  signIn: (identity: string, password?: string) => Promise<void>;
  /** Creates the account. Resolves 'confirm' when the project wants the email verified first. */
  /** With the sign-up form's birthday, which is saved as the account is made. */
  signUp: (email: string, password: string, name: string, handle: string, birthDate?: string) => Promise<'session' | 'confirm'>;
  /** Resolves once the account is loaded, or false if the person backed out. */
  signInWithGoogle: () => Promise<boolean>;
  signInWithApple: () => Promise<boolean>;
  /**
   * Logs out. In a browser this also forgets the login on this computer and
   * ends it on the server, so the next person cannot pick it up with a tap;
   * `keepLogin` (Add account) keeps it, so switching back stays a tap. A
   * phone keeps its logins in its keychain either way.
   */
  signOut: (options?: { keepLogin?: boolean }) => void;
  /* Account centre */
  accountInfo: () => Promise<{ email: string; providers: string[]; createdAt: string; lastSignInAt: string | null; emailConfirmed: boolean } | null>;
  changePassword: (password: string) => Promise<void>;
  /** Agree to the current terms, for an account that has not yet (a Google sign-up, or one made before). */
  acceptTerms: () => Promise<void>;
  changeEmail: (email: string) => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  /** Signs in as an account remembered on this device, without a password. */
  switchAccount: (id: ID) => Promise<void>;
  forgetSavedAccount: (id: ID) => Promise<void>;
  linkGoogle: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Everything of yours, as one object, for "download your data". */
  exportData: () => Record<string, unknown>;
  completeOnboarding: (profile: PlayerProfile) => void;
  /** Only the fields given change: a new photo on its own leaves the name, bio and city as they are. */
  updateIdentity: (patch: Partial<Pick<User, 'name' | 'bio' | 'location'>> & { avatarUrl?: string; cityAt?: { lat: number; lng: number } | null }) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;
  /** Log a session you played (today unless a day is given). Throws a plain sentence when it cannot be saved. */
  /**
   * Fetches the spots the map may show: round where you are (each time the
   * map opens), or, with `view`, the part of the full map in view as it
   * moves (migration 63 answers for one part of the map at a time).
   */
  /** Resolves false when the answer did not land (failed, or overtaken by a newer view), so the map can ask again. */
  loadLastSeen: (view?: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null) => Promise<boolean>;
  /**
   * `activityId`: the tracker session it was logged from, which then counts as logged.
   * `sets`: the score, your side first (migration 91; any tennis session since Oct 6); on a match, when one side took more sets, the result follows it.
   */
  logSession: (input: { minutes: number; kind: PracticeSession['kind']; won?: boolean; sets?: MatchSet[]; opponent?: string; note?: string; day?: string; activityId?: ID; workout?: string; courtId?: string }) => Promise<ID>;
  /**
   * King of the Court at one court (migration 130): the server's board for
   * you, or the demo's. Null when it could not be asked (or the database has
   * no board yet), so the card stays away.
   */
  courtKings: (courtId: string) => Promise<CourtKings | null>;
  /**
   * Who else was at a court on one of your days (Flyby, migration 130): only
   * when you were there yourself, only people you may see. Asked again at
   * most once a minute for the same court and day. Null when it could not be asked.
   */
  flyby: (courtId: string, day: string) => Promise<FlybyPerson[] | null>;
  /**
   * "Friends on a streak" for the weekly recap (migration 20261006000137): up
   * to 5 people you follow on a streak, longest first, as the server allows
   * (a teen only when they follow you back, never anyone whose activity
   * status is off). Before the database has it, or when it cannot be asked,
   * friends who follow each other with you only, from the streaks already
   * loaded (the flames beside their names): an answer that says nothing
   * about anyone's age. Never anyone blocked either way, muted or suspended.
   */
  friendsOnStreak: () => Promise<FriendStreak[]>;
  deleteSession: (id: ID) => void;
  /** Post a "Looking for a hit". Throws a plain sentence if it cannot be posted. */
  /**
   * Post a "Looking for a hit". Throws a plain sentence if it cannot be posted.
   * Invite first or invite only (migration 76): `invitedIds` are invited once
   * it is up (and told); the card in each chat is the caller's to send.
   */
  postHit: (input: Omit<HitRequest, 'id' | 'authorId' | 'createdAt' | 'joinedIds' | 'conversationId' | 'cancelled' | 'opensAt'>) => Promise<ID>;
  /** "Open to everyone now" on your own invite-first hit. */
  openHitNow: (hitId: ID) => Promise<void>;
  /** "I'm in": joins, and resolves the group chat to open (or a sentence saying why not). */
  joinHit: (hitId: ID) => Promise<{ conversationId?: ID; error?: string }>;
  leaveHit: (hitId: ID) => void;
  cancelHit: (hitId: ID) => Promise<void>;
  /** Your hits, posted or joined, from the last two days, called-off ones included: for "How was the hit?". The demo's are already loaded. */
  recentHits: () => Promise<HitRequest[]>;
  /**
   * Your posts that carry a session, fresh from the server and kept with the
   * rest, so "Already posted" is right however few of your posts the app
   * holds (one session, one post). False when they could not be read. The
   * demo's are already loaded.
   */
  loadMySessionPosts: () => Promise<boolean>;
  /**
   * Recent sessions anyone posted to everyone (the last few weeks), kept
   * with the rest, so Activities can show a new player sessions from players
   * near them (features/activity/nearYou decides whose). The server only
   * sends what this account may read; the demo's are already loaded.
   */
  loadRecentSessionPosts: () => Promise<boolean>;

  /* Session tags (migration 62) */
  /**
   * Who you played, on a session of yours: tags the CourtSide players newly
   * picked (each is told once and asked to accept), takes off the ones taken
   * out, and changes anyone's side of the net. Someone who said no stays
   * off. Resolves with anyone who could not be tagged and why, in words.
   */
  setSessionPlayers: (sessionId: ID, players: SessionPlayer[]) => Promise<{ id: ID; why: string }[]>;
  /** A tag of you: Accept (with your own copy of the session unless addToMine is false) or Decline. Throws a plain sentence. */
  respondSessionTag: (tagId: ID, accept: boolean, addToMine?: boolean) => Promise<void>;
  /**
   * "Remove tag". The tagger takes it off (a no, or a tag the other person
   * took back off, leaves your log but stays on the server, so that person is
   * never asked again); the one tagged takes their name back off (final: a
   * waiting tag becomes a no, an accepted one 'removed'), and with dropMine
   * their own copy of the session goes too. Their name leaves every post at once.
   */
  removeSessionTag: (tagId: ID, dropMine?: boolean) => Promise<void>;
  /** Your session tags, fetched afresh (Your sessions, an alert opened). False when the server could not be asked or did not answer. */
  refreshSessionTags: () => Promise<boolean>;
  /** Why you may not tag someone, or null when you may: the server's answer on a real account, this phone's guess in the demo. */
  sessionTagRefusal: (userId: ID) => Promise<SessionTagRefusal | null>;
  /** The private name typed for who you played, changed on a session already in your log. */
  setSessionOpponent: (sessionId: ID, opponent: string) => Promise<void>;
  /**
   * A score on a session already in your log (migration 91; any tennis
   * session since Oct 6): set, changed, or cleared with null. On a match the
   * result follows the sets when one side took more, and anyone who accepted
   * a tag on it is asked again (the server does the same); a practice's or
   * drills' score is only the sets. Throws a plain sentence.
   */
  setSessionScore: (sessionId: ID, sets: MatchSet[] | null) => Promise<void>;
  /**
   * The day and length of a session already in your log, changed (Oct 6,
   * Log a session's edit): your streak, hours and week follow at once. Anyone
   * who accepted a tag on it is asked again, as the server does whenever a
   * session's day or length changes (migration 62), and your posts carrying
   * it say the new day and length (migration 65). Throws a plain sentence.
   */
  setSessionTime: (sessionId: ID, time: { day: string; minutes: number }) => Promise<void>;
  /**
   * Your record against one player (migration 91): only scored matches across
   * the net from each other that you are both confirmed on. Null when it could
   * not be asked, for yourself, or with someone blocked either way.
   */
  headToHead: (userId: ID) => Promise<HeadToHead | null>;

  /** `wantOn` says which way (a double tap only ever likes); without it, the other way from the last tap. */
  toggleLike: (postId: ID, wantOn?: boolean) => void;
  addPost: (input: NewPostInput) => ID;
  /** Puts one of your posts away, or brings it back. */
  toggleArchivePost: (postId: ID, quiet?: boolean) => void;
  togglePinPost: (postId: ID, quiet?: boolean) => void;
  /**
   * Change your own post's words, tags, who is in it, and where it was; and,
   * on a tracker session's post, which health numbers it shares (`share`,
   * "Share health data"). The numbers come back off if the server refuses.
   * `featureOk` is the "Let CourtSide feature this on its Instagram" switch,
   * only on a post that can be featured (canBeFeatured); changed on its own,
   * the post is not marked "Edited".
   */
  editPost: (postId: ID, patch: { body: string; taggedUserIds: ID[]; location?: string; court?: TaggedCourt | null; share?: HealthShareKey[]; featureOk?: boolean }) => void;
  /** Change your own thread's question and details. */
  editQuestion: (questionId: ID, patch: { title: string; body: string }) => void;
  /** Pull-to-refresh: fetches everything again from the server. */
  /** Fetches what is new. False when it could not (no connection, a failed load), so a page does not say "Updated". */
  refresh: () => Promise<boolean>;
  deletePost: (postId: ID) => void;
  /** Deletes a comment (on a post or an Instant) and its replies: your own, or anyone's under something of yours (migration 125). */
  deleteComment: (commentId: ID) => void;
  /** Deletes your own Instant for good, with its likes and comments. */
  deleteStory: (storyId: ID) => void;
  /**
   * A comment on a post; `photo` is a picture picked on this device, shrunk and uploaded here.
   * `replyTo` makes it a reply to that comment: it goes under the thread's top comment
   * (one level, as on Instagram) and tells that comment's writer.
   * Resolves 'blocked' when its words were refused (migration 117), 'failed'
   * when it did not save at all (a toast says so): either way it comes off
   * the list again, so the box can have the words back.
   */
  addComment: (postId: ID, body: string, photo?: string, replyTo?: ID) => Promise<'blocked' | 'failed' | undefined>;
  toggleLikeStory: (storyId: ID) => void;
  toggleLikeComment: (commentId: ID) => void;
  /** A comment on an Instant; `replyTo` and what it resolves as for addComment. */
  addStoryComment: (storyId: ID, body: string, replyTo?: ID) => Promise<'blocked' | 'failed' | undefined>;
  /** New and deleted comments on one post or Instant arrive live while its comments are open. Returns the way to stop. */
  watchComments: (targetId: ID, kind: 'post' | 'hit') => () => void;

  /* Stories */
  addStory: (input: NewStoryInput) => ID;
  toggleArchiveStory: (storyId: ID, quiet?: boolean) => void;
  markStoryViewed: (storyId: ID) => void;

  addQuestion: (input: NewQuestionInput) => ID;
  voteQuestion: (questionId: ID, direction: 1 | -1) => void;
  /** Pick an option in a thread's poll (again to change it). */
  votePoll: (questionId: ID, option: number) => void;
  /**
   * A reply to a thread, or to a reply in it; `media` is a photo or clip picked on this device, uploaded here.
   * Resolves 'blocked' when its words were refused (migration 117), as addComment does, and 'failed' when it did not save at all (it is taken back off the thread).
   */
  addAnswer: (questionId: ID, body: string, parentAnswerId?: ID, media?: Answer['media']) => Promise<'blocked' | 'failed' | undefined>;
  voteAnswer: (answerId: ID, direction: 1 | -1) => void;

  submitCoachingRequest: (coachId: ID, serviceId: ID, question: string, videoLabel?: string) => ID;
  /**
   * Connects or disconnects a source. `tennis`: the screen has explained
   * tennis sessions and the person said Continue, so connecting may ask for
   * workouts too (only while that source's switch is on). `workouts`: what
   * it explained was every workout ("Workouts from Apple Health"), so every
   * workout is switched on too, not only tennis (migration 107).
   */
  toggleIntegration: (provider: Integration['provider'], opts?: { tennis?: boolean; workouts?: boolean }) => Promise<void>;
  /** Pull the latest from a connected source (Apple Health reads the phone; WHOOP asks the server; Cronometer asks for a fresh export). */
  syncHealth: (provider: Integration['provider']) => Promise<void>;
  /* Tennis sessions from trackers (migration 58) */
  /** Your tracker sessions fetched afresh (a log sheet opened from an alert before they had loaded). */
  refreshActivities: () => Promise<void>;
  /**
   * One of your tracker sessions by its id: the one held here, or read from
   * the server for a post older than the two weeks held (Edit post's "Share
   * health data"). Not added to your sessions list. Null once it has gone.
   */
  fetchActivity: (id: ID) => Promise<DetectedActivity | null>;
  /**
   * Looks for new tennis sessions and (Oct 5) other workouts (Apple Health
   * on this phone, WHOOP on the server) when the app opens, while it is open
   * and when it comes back, and says so when one is found. Does nothing
   * unless a source has sessions on and its switch is on. `tick`: one of
   * the looks every couple of minutes while the app stays open, which reads
   * your sessions and Notifications again only when something new came in.
   */
  checkForActivities: (force?: boolean, tick?: boolean) => Promise<void>;
  /** "Not tennis": hides a session you have not logged, and its notification. */
  dismissActivity: (id: ID) => void;
  /**
   * Past workouts (Oct 5): the last 30 days, from the server and, on an
   * iPhone, the Health app, newest first. Handed back, never stored here.
   * Null when the server could not be read.
   */
  pastWorkouts: () => Promise<PastWorkout[] | null>;
  /** Log it on a past workout: hands one the server does not have yet to it (with its heart rate), and gives the id to open. Throws a plain sentence. */
  logPastWorkout: (w: PastWorkout) => Promise<ID>;
  /**
   * A tap on this iPhone's own "Workout detected" alert (from build 15,
   * features/health/workoutWatch): the workout is read from Health and
   * handed to the server as the check hands one over, so it gets its row in
   * Notifications too; your sessions and Notifications are read again. The
   * id to open Log it on, or null when it can't be (Health no longer has
   * it, the server turned it away, or it did not get through).
   */
  reportWorkoutFromAlert: (w: { id: string; startedAt: string; endedAt: string }) => Promise<ID | null>;
  /**
   * A tap on this iPhone's one "4 workouts found" alert (more than three
   * saved to Health at once; modules/workout-watch): each is read from
   * Health and handed to the server as reportWorkoutFromAlert hands one
   * over, then your sessions and Notifications are read once. The ids to
   * list (app/workouts-found), newest first; empty when none could be.
   */
  reportWorkoutsFromAlert: (list: { id: string; startedAt: string; endedAt: string }[]) => Promise<ID[]>;
  /**
   * Asks the source for workouts (Apple Health's sheet, or WHOOP's, Fitbit's,
   * Oura's or Polar's sign-in again), then turns tennis sessions on for it.
   * `workouts` (Apple Health or WHOOP; the person said yes to "Workouts from
   * Apple Health" or "from WHOOP"): every other workout as well (migrations
   * 107 and 135). WHOOP already reading tennis needs no second sign-in: the
   * yes is saved, and its past week of workouts is picked up at once.
   */
  turnOnTennis: (provider: 'apple-health' | 'whoop' | TrackerId, opts?: { workouts?: boolean }) => Promise<void>;
  turnOffTennis: (provider: 'apple-health' | 'whoop' | TrackerId) => Promise<void>;
  /** If this person arrived through an invite link, it is claimed now: the two follow each other. */
  claimPendingReferral: () => Promise<void>;
  countReferrals: () => Promise<number>;
  fetchMyInvitees: () => Promise<Invitee[] | null>;
  /** Find friends from contacts (migration 88): which of these numbers and emails are players. */
  matchContacts: (phones: string[], emails: string[]) => Promise<ContactMatch[] | 'limit' | null>;
  /** Your linked phone number, confirmed by text, or null. */
  myPhone: () => Promise<string | null>;
  startPhoneLink: (phone: string) => Promise<void>;
  confirmPhoneLink: (phone: string, code: string) => Promise<void>;
  unlinkPhone: () => Promise<void>;
  /** Who invited me (after any invite link has been claimed), or null offline / in the demo. */
  myInviter: () => Promise<MyInviter | null>;
  /** "Invited by?" at setup: the inviter's @handle. Set once, never changed. */
  claimInviteCode: (code: string) => Promise<InviteCodeResult>;

  /* Ask a coach */
  askCoach: (input: NewCoachQuestionInput) => ID;
  /** Resolves 'blocked' when its words were refused (migration 117), as addComment does, and 'failed' when it did not save for any other reason; either way it comes off the question. */
  replyToCoachQuestion: (questionId: ID, body: string) => Promise<'blocked' | 'failed' | undefined>;
  toggleReplyHelpful: (replyId: ID) => void;
  /** The asker deletes their question, and the coaches' answers with it. Puts it back with a toast if the server refuses. */
  deleteCoachQuestion: (questionId: ID) => void;
  deleteAnswer: (answerId: ID) => void;

  /* Become a coach */
  /** Files a coach application (and its résumé file, if any). Rejects with a readable message when it could not be sent. */
  submitCoachApplication: (input: CoachApplicationInput, resume?: { uri: string; name: string; mimeType?: string }) => Promise<ID>;

  /* A coach's page */
  addCoachResult: (input: Omit<CoachResult, 'id' | 'coachId'>) => void;
  addCoachReview: (coachId: ID, rating: number, body: string) => void;
  /**
   * Books a coach's service. On a real account the player pays through
   * Stripe first: paid, cancelled, pending (Stripe has not said yet), closed
   * (the player shut the pay sheet and Stripe has no payment), or left (in a
   * browser the page itself went to Stripe and comes back later).
   */
  bookCoach: (serviceId: ID, question: string, video?: { uri?: string } | null) => Promise<{ outcome: 'paid' | 'cancelled' | 'pending' | 'closed' | 'left'; requestId?: ID }>;
  /** Reloads coaches, services, reviews and bookings. */
  refreshCoaching: () => Promise<void>;
  /** Asks Stripe directly whether a booking has been paid for. */
  confirmBooking: (requestId: ID) => Promise<boolean>;
  answerBooking: (requestId: ID, response: string) => Promise<void>;
  /** The coach has opened a booking: the player sees it is being looked at. */
  startBooking: (requestId: ID) => void;
  /** Coach declines, or player is past the deadline: the money goes back. */
  refundBooking: (requestId: ID) => Promise<void>;
  saveCoachListing: (patch: Partial<Pick<Coach, 'headline' | 'credentials' | 'specialties' | 'yearsCoaching' | 'responseTimeHours' | 'listed'>>) => Promise<void>;
  saveCoachService: (service: CoachService & { active?: boolean }) => Promise<void>;
  removeCoachService: (serviceId: ID) => Promise<void>;
  /** Opens Stripe's payout setup for a coach, and checks it on return. */
  setupPayouts: () => Promise<boolean>;
  checkPayouts: () => Promise<boolean>;
  openPayoutDashboard: () => Promise<void>;
  /** Admin: every coach application, and the two answers to one. */
  loadAllApplications: () => Promise<CoachApplication[]>;
  approveCoachApplication: (applicationId: ID, note?: string) => Promise<void>;
  rejectCoachApplication: (applicationId: ID, note?: string) => Promise<void>;

  /* Saved */
  toggleSavePost: (postId: ID, quiet?: boolean) => void;
  toggleSaveQuestion: (questionId: ID, quiet?: boolean) => void;

  /* Reactions */
  reactToMessage: (messageId: ID, emoji?: string) => void;
  setDefaultReaction: (emoji: string) => void;

  /* Notifications */
  /** Fetches what came into Notifications since the newest one held (a like, a follow, "Tennis detected" filed by the server). */
  catchUpNotifications: () => Promise<void>;
  markNotificationsRead: () => void;
  markNotificationRead: (notificationId: ID) => void;
  /** The "Tennis detected" and "Activity detected" rows of these workouts, read together (Workouts found opened them all). */
  markActivityNotesRead: (activityIds: ID[]) => void;

  /* Counting */
  recordView: (targetKind: 'post' | 'question', targetId: ID) => void;
  /** What you did with a post in the feed (saw it, how long, skipped, tapped its author), saved for a smarter feed later. */
  noteFeedSignal: (signal: FeedSignal) => void;
  /**
   * The next older page of a chat, for scrolling up. Resolves to how many
   * older messages came and whether there are older ones still (null: no
   * answer, which says nothing either way). A page can come short and still
   * not be the last: messages you deleted for yourself are left out of it.
   */
  loadOlderMessages: (conversationId: ID) => Promise<{ added: number; more: boolean | null }>;
  /** One chat fetched fresh as it opens, so it never shows an old copy for long. */
  syncConversation: (conversationId: ID) => Promise<void>;
  /** "Typing…" in a chat: `ping` while you type; `onTyping` hears the others. No-op in the demo. */
  watchTyping: (conversationId: ID, onTyping: (userId: ID, stopped?: boolean) => void) => { ping: () => void; stop: () => void; off: () => void };
  watchInboxTyping: (onTyping: (conversationId: ID, userId: ID, stopped?: boolean) => void) => () => void;
  /** Every reply in a thread, loaded when it is opened. */
  loadThread: (questionId: ID) => Promise<void>;
  /** The next page of older feed posts. Resolves with the ones that were added. */
  loadMorePosts: () => Promise<Post[]>;
  /** One player's own posts, loaded when their profile is opened. */
  loadPostsOf: (userId: ID) => Promise<void>;
  /** Search reaching past what is loaded: posts matching the words, fetched and kept. Each term is asked once per session. */
  searchPosts: (term: string) => Promise<void>;
  /** Brings one post into memory (a page opened from a link). Resolves true when it exists. */
  loadPost: (postId: ID) => Promise<boolean>;
  /** Everything bookmarked, loaded when Saved is opened. */
  loadSavedPosts: () => Promise<void>;
  /** Whether a chat is with someone you are blocked with, either way. */
  isChatBlocked: (conversationId: ID) => Promise<boolean>;
  /** Someone's followers and following, loaded when their list is opened. */
  loadFollowsOf: (userId: ID) => Promise<void>;
  /** Admins only: every report, the reported post or hit, and a decision on one. Null when they could not be loaded. */
  loadReports: () => Promise<AdminReport[] | null>;
  /** Admins only: how many reports are open, counted by the database (no rows fetched), for Settings' Reports row. Null when it could not say. */
  countOpenReports: () => Promise<number | null>;
  /** Admins only: the waitlist and the waitlist page's feedback. */
  loadWaitlist: () => Promise<WaitlistEntry[]>;
  /** The pictures of posts the app has not loaded (older ones a notification is about). */
  loadPostThumbs: (ids: ID[]) => Promise<Record<ID, { thumb?: string; kind: PostKind }>>;
  /** Posts tagged at a court (within a few hundred feet), newest first, for its card on the map. */
  loadCourtPosts: (at: { lat: number; lng: number }) => Promise<Post[]>;
  /** A court's page: its posts into the app a page at a time ('first' once per 5 minutes, 'fresh' on a pull, 'older' for the next page). Throws when it fails. */
  loadCourtPage: (at: { lat: number; lng: number }, how?: 'first' | 'older' | 'fresh') => Promise<{ more: boolean }>;
  /** The beta invite email: counts, or send it to everyone on the waitlist still waiting. Admins only. */
  betaInvites: (send: boolean) => Promise<BetaInviteStatus | null>;
  /** Everyone's first post from the last month, for the founder to welcome. */
  loadFirstPosts: () => Promise<Post[]>;
  loadFirstDayStats: () => Promise<FirstDayStats | null>;
  /** Which first move a new player chose, for the numbers behind the setup step. Kept once, the first time. */
  noteFirstMove: (move: FirstMove) => void;
  loadSiteFeedback: () => Promise<SiteFeedback[]>;
  /** Admins only: take someone off the waitlist (they asked), or clear a feedback note. */
  removeFromWaitlistPage: (table: 'waitlist' | 'site_feedback', id: ID) => Promise<boolean>;
  loadReportedItem: (kind: ReportedItemKind, id: ID) => Promise<ReportedItem | null>;
  /**
   * Admins only: suspends someone seen in a reported chat (a group has no one
   * person behind its report). Files it as the admin's own report about them,
   * decided at once, so it shows under Done with an Unsuspend button.
   */
  suspendFromChat: (userId: ID, conversationId: ID) => Promise<boolean>;
  /** Admins only: a reported chat's name, people and last 30 messages (admins cannot otherwise read a chat they are not in). */
  loadReportedChat: (conversationId: ID) => Promise<ReportedChat | null>;
  /** Admins only: the copy of a reported chat kept for its report, unsent and edited messages included (migration 115). */
  loadReportEvidence: (reportId: ID) => Promise<ReportEvidence[]>;
  decideReport: (reportId: ID, decision: 'remove' | 'restore' | 'suspend' | 'unsuspend' | 'dismiss') => Promise<boolean>;
  /** Admins only: takes one message (a photo, say) out of a reported chat, for everyone in it, and its photos off the shelf. */
  removeReportedMessage: (messageId: ID) => Promise<boolean>;
  /**
   * Admins only (the database refuses anyone else, migration 108): takes a
   * post, Instant, comment, thread, reply or coach question down. It is
   * marked removed here at once (the feeds drop it; its author and admins
   * see it marked), the author is told why, and "Taken down · Undo" shows.
   * If the server says no it comes back as it was and a toast says why.
   * `note`: the admin's own words for "Something else" (admins only see it).
   * `quiet`: no toast on success (an Undo passes it). `reportId`: taken down
   * from that report; on a database without migration 108 yet it is removed
   * the Reports screen's old way instead (moderate_report), so nothing stops
   * working in between.
   */
  takeDown: (kind: TakedownKind, id: ID, reason: TakedownReason, options?: { note?: string; quiet?: boolean; reportId?: ID }) => Promise<ModerationResult>;
  /**
   * Admins only: puts something taken down back exactly as it was. The same
   * marking, rollback and toasts as takeDown. `quiet`: no toast on success.
   * `reportId`: put back from that report; on a database without migration
   * 108 yet it goes back the Reports screen's old way (moderate_report).
   */
  restoreContent: (kind: TakedownKind, id: ID, options?: { quiet?: boolean; reportId?: ID }) => Promise<ModerationResult>;
  /** Admins only: Settings → Admin → Removed. 'not_ready' before migration 108; null when it could not load. */
  loadRemoved: () => Promise<RemovedItem[] | 'not_ready' | null>;
  /**
   * Your own asks for a review (migration 20261006000139), into
   * `reviewRequests`. Asked once, the first time something removed of yours
   * shows; a database without the migration counts as none asked.
   */
  loadReviewRequests: () => Promise<void>;
  /**
   * "Ask for a review" on something of yours taken down: once per take-down,
   * with an optional note (up to 300 characters) only admins read. The
   * admins are told; the answer comes back as a notification.
   */
  askForReview: (kind: TakedownKind, id: ID, note?: string) => Promise<ReviewAskResult>;
  /** Admins only: every ask still waiting, for Settings → Admin → Removed. 'not_ready' before the migration; null when it could not load. */
  loadOpenReviews: () => Promise<ReviewRequest[] | 'not_ready' | null>;
  /**
   * Admins only: looked again, and it stays down. Closes the ask and its
   * author is told "We looked again and your post stays removed." (Restore
   * closes an ask by itself, and tells its author it was restored.)
   */
  keepRemoved: (kind: TakedownKind, id: ID) => Promise<'done' | 'no_request' | ModerationResult>;

  /* Messaging */
  /**
   * Your one-to-one chat with someone, or a new one that lives only on this
   * phone until its first message (Instagram's way): opening a chat and
   * backing out puts nothing in their inbox.
   */
  openConversationWith: (userId: ID) => ID;
  /**
   * The id a chat goes by now. A chat started on this phone takes the
   * server's id when the server already had one with that person, so a chat
   * screen opened on the old id follows it here. Any other id comes back as it is.
   */
  resolveChatId: (conversationId: ID) => ID;
  /** True while a one-to-one chat is only on this phone (nothing sent in it yet): the server can't mute or take a report on it. */
  isDraftChat: (conversationId: ID) => boolean;
  /** Sends words in a chat; `replyToId` answers one of its messages (quoted above the new one). */
  /** Resolves 'blocked' when its words were refused (migration 117): it is taken back, so the chat can put the words back in the box. */
  sendMessage: (conversationId: ID, body: string, replyToId?: ID) => Promise<'blocked' | undefined>;
  /**
   * Your inbox settings for a chat, only ever seen by you: pin it to the top
   * (up to 3; false if that would be a fourth), mark it unread or read, or
   * delete it from your inbox until someone writes in it again.
   */
  pinChat: (conversationId: ID, pinned: boolean) => boolean;
  markChatUnread: (conversationId: ID, unread: boolean) => void;
  hideChat: (conversationId: ID) => void;
  /** A message from further back than a chat has loaded (a reply's original), fetched into the store; resolves whether it came. */
  loadMessage: (messageId: ID) => Promise<boolean>;
  /**
   * A group chat with the people picked (two or more others, GROUP_CAP people
   * in all) and an optional name; you are its admin. A real one shows once
   * the server has said yes, so a no leaves the picker as it was. Resolves
   * with how it went (the screen that asked says why not; nothing else does),
   * or null when the picks make no group (fewer than two others).
   */
  createGroup: (memberIds: ID[], title?: string) => Promise<GroupOutcome | null>;
  /**
   * Adds people to a group you are in; anyone in it can. Resolves once the
   * server has answered: in, or why not (the screen that asked says so).
   */
  addGroupMembers: (conversationId: ID, memberIds: ID[]) => Promise<GroupOutcome>;
  /** An admin takes someone out of a group. */
  removeGroupMember: (conversationId: ID, memberId: ID) => void;
  /** Anyone in a group can rename it; an empty name takes the name off. */
  renameGroup: (conversationId: ID, title: string) => void;
  /** A group photo picked on this device (uploaded first), or null to take it off. */
  setGroupPhoto: (conversationId: ID, uri: string | null) => void;
  /** An admin makes someone an admin (true) or takes it away (false). */
  setGroupAdmin: (conversationId: ID, memberId: ID, admin: boolean) => void;
  leaveGroup: (conversationId: ID) => void;
  /**
   * A group someone took you out of, as it stood when you last had it (its
   * messages too), so a chat open on screen can stay readable with "You're
   * no longer in this group" instead of vanishing. Undefined for any other chat.
   */
  removedChat: (conversationId: ID) => { conversation: Conversation; messages: Message[] } | undefined;
  /**
   * Mutes a chat (group or one-to-one) until a moment — MUTED_FOREVER for
   * "until I turn it back on" — or unmutes it with null. No alerts unless
   * someone @mentions you, and off the unread badge. `quiet`: no Undo toast.
   */
  muteChat: (conversationId: ID, until: string | null, quiet?: boolean) => void;
  /**
   * This chat's own Read receipts switch, for you (its Details page): on
   * unless you turn it off. Your reading shows here only with both it and
   * your Privacy switch on; the server holds it back otherwise (migration 141).
   */
  setChatReadReceipts: (conversationId: ID, on: boolean) => void;
  /**
   * Reports a chat to CourtSide for a person to review: the admin can then
   * read it. `aboutUserId` is the person reported (the other person in a
   * one-to-one chat, or a message's sender); `messageId`, one message in it.
   * Resolves whether the report was filed, so the thanks shows only then.
   */
  reportChat: (conversationId: ID, reason: string, aboutUserId?: ID, messageId?: ID) => Promise<boolean>;
  /** Send a court in a chat: where to meet (with how many courts stand there, when known). */
  sendCourt: (conversationId: ID, place: { id?: string; name: string; lat: number; lng: number; count?: number }, replyToId?: ID) => void;
  /** Send a voice note recorded on this device (uploaded first). */
  sendVoice: (conversationId: ID, recording: { uri: string; ms: number }, replyToId?: ID) => void;
  /**
   * Send photos from the camera roll in a chat (up to 10), with an optional
   * caption. They show at once; each is shrunk on the phone and put on the
   * chat's private shelf, then the message is saved. One that fails offers a
   * retry, which sends only what has not gone up yet. Resolves 'blocked'
   * when the caption's words were refused (migration 117): the message comes
   * out of the chat, so the chat can put the photos and the words back.
   */
  sendPhotos: (conversationId: ID, photos: { uri: string; width: number; height: number }[], caption?: string, replyToId?: ID) => Promise<'blocked' | undefined>;
  /**
   * The age check: records a date of birth ("2009-04-17") once. Under 13 the
   * account is removed and this phone will not ask again; 13 to 17 becomes a
   * teen account, private to start with.
   */
  confirmBirthDate: (birthDate: string) => Promise<AgeGroup | 'under13'>;
  /**
   * The birthday page on a phone that has had an under-13 answer, with an
   * account signed in that has no age on file: one made in the last half
   * hour (Apple or Google, which take no birthday first) is removed, the
   * same as an under-13 answer removes one. True when it was removed.
   */
  removeNewAccountOnBlockedPhone: () => Promise<boolean>;
  /**
   * Whether you may message someone one-to-one: always in a chat you already
   * have; otherwise someone not known to be an adult (a teen, or no birthday
   * given yet) only gets new chats from people they follow.
   */
  canMessage: (userId: ID) => boolean;
  /**
   * Whether you may put someone in a group (a new one or one you are in):
   * someone known to be an adult, or anyone who follows you. Unlike
   * canMessage, a one-to-one chat you already have with them does not count;
   * the server's rule for groups has no such exception.
   */
  canAddToGroup: (userId: ID) => boolean;
  /**
   * Asks the server again which of these people follow you, and keeps the
   * answer, so a lock lifts as soon as they do. The app's copy of who follows
   * you is from when it opened; nothing updates it live. Resolves with those
   * of them who follow you now. The demo, with no server, answers from what
   * it has.
   */
  recheckFollows: (userIds: ID[]) => Promise<ID[]>;
  /**
   * Whether you may message this person, or put them in a group, right now:
   * asks the server again (whom they follow, and what it says about them)
   * rather than trusting the app's copy. For a lock about to be shown as final.
   */
  reachNow: (userId: ID) => Promise<boolean>;
  /**
   * Of these people, the ones the app already has as locked for a group (see
   * canAddToGroup), without asking the server about anyone new: for a page
   * that re-checks its locks as it opens, so it never asks about everyone.
   */
  lockedNow: (userIds: ID[]) => ID[];
  /**
   * This phone's quick answer for the tag picker (Who you played): why this
   * person cannot be tagged, or null. Asks the server about them in the
   * background (migration 64), so a lock shows a moment later; the server's
   * own check after each pick has the last word.
   */
  tagHint: (userId: ID) => SessionTagRefusal | null;
  /**
   * Before opening a one-to-one chat from a button: null when you may
   * message them (asking the server again first if the app's copy says no);
   * otherwise why not, naming them, ready to show in a long note.
   */
  messageLock: (userId: ID) => Promise<string | null>;
  /**
   * New words for a message of yours; it then shows as edited. Resolves
   * 'blocked' when they were refused (migration 117): the message goes back
   * to what it said, so the chat can put the new words back in the box.
   */
  editMessage: (messageId: ID, body: string) => Promise<'blocked' | undefined>;
  /** Sends a message that did not go through, again. */
  retryMessage: (messageId: ID) => void;
  /** Takes a message of yours back, for everyone in the chat. */
  unsendMessage: (messageId: ID) => void;
  /** Hides a message from your own view only. */
  deleteMessageForMe: (messageId: ID) => void;
  /**
   * Sends a post, thread, profile, hit, court or forwarded message into
   * chats: groups and one-to-one chats by id, and people (into your
   * one-to-one with each, started if need be), with an optional note.
   */
  shareToChats: (targets: { conversationIds?: ID[]; userIds?: ID[] }, item: ShareItem, note?: string) => void;
  markConversationRead: (conversationId: ID) => void;
  /**
   * The demo only (no database): messages "arrive" from the demo's people,
   * the way a real one comes in live, so the banner at the top can be seen
   * without a second phone. 'one' is a message in a one-to-one chat,
   * 'group' one in a group, 'pile' several chats at once. Does nothing with
   * a real database.
   */
  demoIncoming: (kind: 'one' | 'group' | 'pile') => void;
}

interface AppContextValue extends AppState {
  currentUser: User | null;
  actions: AppActions;
  /**
   * Whether the teen rule lets someone's open hits show to you (leaving
   * aside whether you follow them, which shows them anyway). Since migration
   * 64 the server sends only the hits you may see, so every hit it sent may
   * show; before it, by the author's age.
   */
  seeing: (u: Pick<User, 'id' | 'ageGroup'>) => boolean;
  /**
   * Whether this post may show on a court's page, its reel, the map's card
   * and Courts near you under the teen rule (leaving aside you and people you
   * follow, who show anyway): since migration 64 the server's answer about
   * the post (asked in the background; not answered yet is not shown yet),
   * before it the author's age.
   */
  shownAtCourt: (postId: ID, author: Pick<User, 'id' | 'ageGroup'>) => boolean;
  /**
   * Whether the age the app holds says this person is an adult. Only ever
   * true for someone else on a database from before migration 64, or in the
   * demo; for the few lists that still fall back on it (New on CourtSide,
   * if the server's list cannot be had).
   */
  ageSaysAdult: (u: Pick<User, 'id' | 'ageGroup'>) => boolean;
}


/**
 * Messages fetched afresh (a catch-up after the phone slept, a chat just
 * opened) laid over what the app holds: new ones added in time order, ones
 * already here updated in place (an edit, a reaction), each chat's list and
 * its last-active time brought up to date, and anything new from someone
 * else counted as unread unless that chat is open.
 */
function mergeFetchedMessages(prev: AppState, fetched: Message[], me: ID, openChat?: ID): AppState {
  if (!fetched.length) return prev;
  const byId = new Map(prev.messages.map((m) => [m.id, m]));
  let changed = false;
  const added: Message[] = [];
  for (const m of fetched) {
    const had = byId.get(m.id);
    if (!had) { added.push(m); byId.set(m.id, m); changed = true; continue; }
    if (had.body !== m.body || had.editedAt !== m.editedAt || JSON.stringify(had.reactions ?? {}) !== JSON.stringify(m.reactions ?? {})) {
      byId.set(m.id, { ...had, body: m.body, editedAt: m.editedAt, reactions: m.reactions });
      changed = true;
    }
  }
  // Each chat's share of what came. One already here only for a reply's
  // quote, and in this run of messages, joins its chat now too.
  const cameIn = new Map<ID, ID[]>();
  for (const m of fetched) cameIn.set(m.conversationId, [...(cameIn.get(m.conversationId) ?? []), m.id]);
  const touched = new Set(added.map((m) => m.conversationId));
  for (const c of prev.conversations) if (cameIn.get(c.id)?.some((id) => !c.messageIds.includes(id))) touched.add(c.id);
  if (!changed && !touched.size) return prev;
  const messages = prev.messages.map((m) => byId.get(m.id)!).concat(added);
  const conversations = prev.conversations.map((c) => {
    if (!touched.has(c.id)) return c;
    // What the chat had loaded and what just came (a run with no gaps): never
    // a message that is here only for a reply's quote from further back,
    // outside that run (it would leave a gap above it).
    const inChat = inOrder([...c.messageIds, ...(cameIn.get(c.id) ?? [])], byId);
    // An event line ("Mira added Dev") is news, but never unread; nor is one your Hidden words hid (migration 117).
    const newFromOthers = added.filter((m) => m.conversationId === c.id && m.senderId !== me && m.kind !== 'system' && !m.hiddenByWords).length;
    const last = inChat[inChat.length - 1];
    return { ...c, messageIds: inChat.map((m) => m.id), updatedAt: last && last.createdAt > c.updatedAt ? last.createdAt : c.updatedAt, unreadCount: c.id === openChat ? c.unreadCount : c.unreadCount + newFromOthers };
  });
  return { ...prev, messages, conversations };
}

/** A chat's messages by these ids, once each, oldest first (ids with no message here are left out). */
function inOrder(ids: ID[], byId: Map<ID, Message>): Message[] {
  return [...new Set(ids)].map((id) => byId.get(id)).filter((m): m is Message => !!m).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** The parts of a chat that change without a message of their own: who is in it, its name, photo, admins, and your mute. */
const chatDetails = (c: Conversation) => ({
  participantIds: c.participantIds, isGroup: c.isGroup, title: c.title, createdBy: c.createdBy,
  adminIds: c.adminIds, photoUrl: c.photoUrl, mutedUntil: c.mutedUntil,
});

/**
 * A chat fetched afresh laid over what the app holds. One already here takes
 * the server's word on its details (someone else may have added people,
 * renamed it or changed its photo) and its new messages merge in; one not
 * here yet is added whole.
 */
function applyFetchedChat(prev: AppState, got: { conversation: Conversation; messages: Message[] }, me: ID, openChat?: ID): AppState {
  const fresh = got.conversation;
  const had = prev.conversations.find((c) => c.id === fresh.id);
  if (!had) {
    const known = new Set(prev.messages.map((m) => m.id));
    return { ...prev, conversations: [fresh, ...prev.conversations], messages: [...prev.messages, ...got.messages.filter((m) => !known.has(m.id))] };
  }
  const details = chatDetails(fresh);
  const same = JSON.stringify(chatDetails(had)) === JSON.stringify(details);
  const next = same ? prev : { ...prev, conversations: prev.conversations.map((c) => (c.id === fresh.id ? { ...c, ...details } : c)) };
  return mergeFetchedMessages(next, got.messages, me, openChat);
}

/**
 * A chat made on this phone that the server keeps under another id (it
 * already had one with that person): its messages move over, and it folds
 * into the one already here, or simply takes the server's id.
 */
function foldChatInto(prev: AppState, from: ID, to: ID): AppState {
  if (from === to) return prev;
  const moving = prev.conversations.find((c) => c.id === from);
  const target = prev.conversations.find((c) => c.id === to);
  const messages = prev.messages.map((m) => (m.conversationId === from ? { ...m, conversationId: to } : m));
  if (!target) {
    return { ...prev, messages, conversations: prev.conversations.map((c) => (c.id === from ? { ...c, id: to } : c)) };
  }
  const inChat = inOrder([...target.messageIds, ...(moving?.messageIds ?? [])], new Map(messages.map((m) => [m.id, m])));
  const updatedAt = moving && moving.updatedAt > target.updatedAt ? moving.updatedAt : target.updatedAt;
  return {
    ...prev,
    messages,
    conversations: prev.conversations
      .filter((c) => c.id !== from)
      .map((c) => (c.id === to ? { ...c, messageIds: inChat.map((m) => m.id), updatedAt } : c)),
  };
}

/** A group name as the server keeps it (clean_chat_title, migration 54): one line, trimmed, at most 60 characters. Empty means no name. */
const cleanTitle = (title?: string) => (title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60).trim() || undefined;

/** A group function's answer that is a refusal rather than the chat's id. */
/**
 * "Up for a hit today" as the map told it (map_players' open_until) laid
 * onto the people it is about. A teen's ring is never on their public
 * profile (migration 78): the map, which shows it only to friends who
 * follow each other with them, is the one place it comes from, so the pin,
 * the card and Who's up today all light up from here. Unchanged people keep
 * their objects (and nothing redraws when nobody changed).
 *
 * `fresh`: the rows map_players just answered with. Its open_until is the
 * whole answer (profile and settings row together, null when off), so for
 * anyone in it a ring turned off goes too. The old table never says, so
 * then a ring is only ever added. People it did not answer for keep theirs.
 */
function withMapRings(users: User[], seen: Record<ID, LastSeen>, me: ID | null, fresh: Record<ID, LastSeen> | null = null): User[] {
  let changed = false;
  const next = users.map((u) => {
    // How far they'd like to go for a hit (migration 120) comes with the ring, and goes with it.
    const now = u.id === me ? undefined : fresh?.[u.id];
    if (now) {
      if (u.openToHitUntil === now.openUntil && u.openToHitMiles === now.openMiles) return u;
      changed = true;
      return { ...u, openToHitUntil: now.openUntil, openToHitMiles: now.openMiles };
    }
    const row = u.id === me ? undefined : seen[u.id];
    const until = row?.openUntil;
    if (!until) return u;
    if (u.openToHitUntil && u.openToHitUntil > until) return u;
    if (u.openToHitUntil === until && (row?.openMiles === undefined || u.openToHitMiles === row.openMiles)) return u;
    changed = true;
    return { ...u, openToHitUntil: until, openToHitMiles: row?.openMiles ?? u.openToHitMiles };
  });
  return changed ? next : users;
}

const isRefusal = (result: string): result is GroupRefusal | 'failed' => ['blocked', 'teen', 'full', 'not-admin', 'words', 'failed'].includes(result);

// In a browser, WHOOP's tennis sign-in (and Fitbit's, Oura's or Polar's) comes
// back in its own small window (?whoop=pending, ?tracker=pending): that window
// hands the address to the one that opened it, which collects the sign-in
// (connectWhoop, connectTracker). Every other page load: nothing.
if (Platform.OS === 'web' && typeof window !== 'undefined' && /[?&](whoop|tracker)=pending/.test(window.location?.search ?? '')) {
  try { WebBrowser.maybeCompleteAuthSession(); } catch { /* the opener has gone; trying again starts afresh */ }
}

/**
 * The server's rule for who you may reach (migration 54: group_fits for
 * groups, open_conversation for a new one-to-one chat): someone known to be
 * an adult, or anyone who follows you. Everyone else, a teen or an account
 * with no birthday given yet, waits until they follow you. The demo has no
 * server and its fixtures carry no ages, so there only someone marked as a
 * teen is closed; otherwise the whole demo would be locked.
 */
function openToYou(userId: ID, them: User | undefined, me: ID, edges: { followerId: ID; followingId: ID }[], source: AgeSource, told: OpennessMap, ask?: (id: ID) => void): boolean {
  if (edges.some((e) => e.followerId === userId && e.followingId === me)) return true;
  // Before migration 64 every profile carried its age; since, only the server's answer says.
  return knownOpen(them, userId, source, told, ask);
}

/** Why a new one-to-one chat was refused, naming who when the app knows them (see chatLockNote). */
function chatLockNoteFor(users: User[], userId: ID): string {
  const them = users.find((u) => u.id === userId);
  return chatLockNote(them ? named(them, users) : undefined);
}

const AppContext = createContext<AppContextValue | null>(null);
const NO_USERS: User[] = [];
/**
 * Just the people, on their own: a part that only needs someone's photo or
 * name (Avatar) reads this, so a like, a view or a message elsewhere in the
 * app does not redraw it. The very same list as the app state's `users`.
 */
const UsersContext = createContext<User[]>(NO_USERS);

const emptyBootstrap: Bootstrap = {
  users: [],
  posts: [],
  stories: [],
  comments: [],
  questions: [],
  answers: [],
  coaches: [],
  coachingRequests: [],
  // Every source, none connected, from the first frame: a real account that opens
  // from its saved copy never gets the demo's list, and the Health screen needs one.
  integrations: withCatalog([]),
  healthHistory: [],
  achievements: [],
  coachQuestions: [],
  coachReplies: [],
  coachApplications: [],
  coachResults: [],
  coachReviews: [],
  conversations: [],
  messages: [],
  notifications: [],
  detectedActivities: [],
};

let idCounter = 0;
/** Real rows need real UUIDs; the fixtures keep their readable ids. */
const nextId = (prefix: string): string => {
  if (isSupabaseConfigured) return randomUUID();
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * A report about one thing: what it is and its id. The same list the server reads (stamp_report, migration 115; an open hit, 'hit-request', since 126; a tip since 128),
 * plus a coach review, a court note (its court and a key for its words) and a group (migration 145), each kept out of your sight on the screens that show them.
 */
const REPORTED_TARGET = /^(?:post|hit|hit-request|question|answer|comment|coach-question|coach-reply|tip|coach-review|court-note|group):(.+)$/;

/**
 * The made-up players, posts and threads the app ships with so a demo is
 * never empty — Dev Sharma, @junevolley and the rest.
 *
 * Once a real account is signed in they are dropped. A stranger cannot tell a
 * fixture from a person; a coaching request sent to a coach who does not exist
 * goes nowhere; and Apple rejects apps that present invented content as real.
 * Anything the database hands back carries a proper id and anything made on
 * this phone in a real session is given one, so the id is what tells them
 * apart. With no database configured nothing is dropped and the demo stands.
 */
function dropFixtures(state: AppState): AppState {
  if (!isSupabaseConfigured) return state;
  const real = <T extends { id: ID }>(rows: T[]) => rows.filter((row) => UUID.test(row.id));
  const users = state.users.filter((u) => UUID.test(u.id));
  const posts = real(state.posts);
  const questions = state.questions.filter((q) => UUID.test(q.id));
  const threads = new Set(questions.map((q) => q.id));
  const keep = new Set<ID>([...posts.map((p) => p.id), ...threads]);
  return {
    ...state,
    users,
    posts,
    questions,
    stories: real(state.stories),
    comments: real(state.comments),
    answers: state.answers.filter((a) => UUID.test(a.id) || threads.has(a.questionId)),
    coaches: real(state.coaches),
    coachingRequests: real(state.coachingRequests),
    coachQuestions: real(state.coachQuestions),
    coachReplies: real(state.coachReplies),
    coachApplications: real(state.coachApplications),
    coachResults: real(state.coachResults),
    coachReviews: real(state.coachReviews),
    conversations: real(state.conversations),
    messages: real(state.messages),
    notifications: real(state.notifications),
    detectedActivities: real(state.detectedActivities),
    sessionTags: real(state.sessionTags),
    tips: real(state.tips),
    // The lists that only hold ids follow the things they point at.
    followingIds: state.followingIds.filter((id) => UUID.test(id)),
    followEdges: state.followEdges.filter((e) => UUID.test(e.followerId) && UUID.test(e.followingId)),
    mutedIds: state.mutedIds.filter((id) => UUID.test(id)),
    blockedIds: state.blockedIds.filter((id) => UUID.test(id)),
    alertIds: state.alertIds.filter((id) => UUID.test(id)),
    saved: {
      postIds: state.saved.postIds.filter((id) => keep.has(id)),
      questionIds: state.saved.questionIds.filter((id) => keep.has(id)),
    },
    // Invented sleep, recovery and calories — not this person's, and health
    // numbers read as fact. They go, and the Health screen simply shows
    // nothing until something real is connected.
    // (Once this account's own health has loaded, it stays through every reload.)
    healthHistory: state.healthIsReal ? state.healthHistory : [],
    // The list of what can be connected stays; the demo's "already connected,
    // synced two hours ago" does not.
    integrations: state.healthIsReal ? state.integrations : state.integrations.map((i) => (i.connected || i.readsWorkouts ? { ...i, connected: false, lastSyncedAt: undefined, readsWorkouts: undefined, readsAllWorkouts: undefined } : i)),
    // The demo's card on file. Nobody should open Payments and find a Visa
    // they never added.
    paymentMethods: [],
    defaultPaymentId: null,
  };
}

/** The terms version an account agreed to, from what is written on the account itself. */
const termsOf = (user: { user_metadata?: Record<string, unknown> }): string | null => {
  const version = user.user_metadata?.terms_version;
  return typeof version === 'string' ? version : null;
};

/**
 * Whether two lists of remembered logins are the same as far as anything
 * shows or uses them (when each was last saved is never shown). The list is
 * saved again at every open and every hourly token refresh; handing the app
 * an unchanged copy redrew every screen for nothing.
 */
const sameAccounts = (a: SavedAccount[], b: SavedAccount[]) => a.length === b.length && a.every((x, i) => {
  const y = b[i];
  return x.id === y.id && x.handle === y.handle && x.name === y.name && x.email === y.email && x.avatarUrl === y.avatarUrl && x.refreshToken === y.refreshToken;
});
/** The remembered logins as just saved, laid into the state only if something in them changed. */
const withAccounts = (savedAccounts: SavedAccount[]) => (prev: AppState): AppState => (sameAccounts(prev.savedAccounts, savedAccounts) ? prev : { ...prev, savedAccounts });

/** Whether an id names a row in Supabase rather than a fixture. */
const live = (...ids: (ID | null | undefined)[]) => isSupabaseConfigured && ids.every((id) => !!id && UUID.test(id));

/** Where the app learns how the teen rules apply to `other` (see AgeSource). */
const ageSource = (s: Pick<AppState, 'currentUserId' | 'agesOnProfiles'>, other: ID | null | undefined): AgeSource =>
  !live(s.currentUserId, other) ? 'fixtures' : s.agesOnProfiles === false ? 'server' : 'ages';

/** How long what the server said about someone (migration 64) stands before it is asked again on their next showing: their follows change. */
const OPENNESS_KEPT = 10 * 60_000;
/** After a question that got no answer (no connection, say), how soon it may be asked again. */
const OPENNESS_RETRY = 30_000;

/** The moment of the oldest post in a batch: where the next page carries on from. */
const oldestOf = (posts: Post[]) => posts.reduce<string | null>((old, p) => (!old || p.createdAt < old ? p.createdAt : old), null);

/**
 * Posts and comments that have just come down, added to the ones already
 * held. A copy already in hand is kept as it is: it may carry a like or a
 * comment made on this phone a moment ago that the database has not caught
 * up with.
 */
/** What is on screen now, in the shape the saved copy keeps (see data/snapshot). */
function snapshotOf(s: AppState, me: ID): RemoteData {
  const self = s.users.find((u) => u.id === me);
  return {
    users: s.users, posts: s.posts, comments: s.comments, stories: s.stories,
    followingIds: s.followingIds, followEdges: s.followEdges, savedPostIds: s.saved.postIds, followRequests: s.followRequests,
    // A one-to-one chat with nothing in it is left out: one opened here and never
    // written in lives only on this phone until its first message (see openConversationWith).
    conversations: s.conversations.filter((c) => !isDirectChat(c) || c.messageIds.length > 0), messages: s.messages, questions: s.questions, answers: s.answers,
    coachQuestions: s.coachQuestions, coachReplies: s.coachReplies, coachingRequests: s.coachingRequests, notifications: s.notifications,
    userState: {
      mutedIds: s.mutedIds, blockedIds: s.blockedIds, savedQuestionIds: s.saved.questionIds, paymentMethods: s.paymentMethods,
      defaultPaymentId: s.defaultPaymentId, showActivity: s.prefs.showActivity, pushLikes: s.prefs.pushLikes, pushCoach: s.prefs.pushCoach,
      pushMessages: s.prefs.pushMessages,
      pushActivity: s.prefs.pushActivity,
      pushMapFriends: s.prefs.pushMapFriends, pushMapHits: s.prefs.pushMapHits, pushMapPlayers: s.prefs.pushMapPlayers, pushCourts: s.prefs.pushCourts,
      contactsFindable: s.contactsFindableLive ? s.prefs.contactsFindable : undefined,
      pushRecap: s.prefs.pushRecap,
      pushJoined: s.joinAlertsLive ? s.prefs.pushJoined : undefined,
      pushStreak: s.prefs.pushStreak,
      constraints: self?.profile.constraints,
    },
    tips: s.tips, coachApplications: s.coachApplications, coaches: s.coaches, coachReviews: s.coachReviews, coachResults: s.coachResults,
    sessions: s.sessions,
    hitRequests: s.hitRequests,
    // Who blocked you, so a cold start from this copy leaves them out of search before the fresh load.
    blockedMeIds: s.blockedMeIds,
    // Tracker sessions are left out: private health numbers stay off the saved copy on the device.
  };
}

/** Every id the saved copy put on screen. */
function idsIn(data: RemoteData): Set<string> {
  const ids = new Set<string>();
  const add = (list: { id: string }[]) => list.forEach((x) => ids.add(x.id));
  add(data.users); add(data.posts); add(data.comments); add(data.stories); add(data.questions); add(data.answers);
  add(data.notifications); add(data.tips);
  // A coach question its asker deleted on another phone comes off here too, answers and all.
  add(data.coachQuestions); add(data.coachReplies);
  return ids;
}

/**
 * The signed-in account's data laid over what is on screen. The same merge
 * serves the fresh load from the server and the saved copy shown before it
 * (fromSnapshot); `snap` is what that copy put up, so the fresh load can take
 * off anything the server no longer has.
 */
function mergeRemote(prev: AppState, data: RemoteData, me: ID, email: string | null | undefined, snap: Set<string> | null, fromSnapshot: boolean): AppState {
    const remoteUsers = new Set(data.users.map((u) => u.id));
    const remotePosts = new Set(data.posts.map((p) => p.id));
    const remoteStories = new Set(data.stories.map((s) => s.id));
    const remoteComments = new Set(data.comments.map((c) => c.id));
    // Whatever the saved copy put on screen that the server no longer has (a
    // deleted post, a thread gone) comes off now rather than lingering.
    const gone = (id: string) => !!snap?.has(id);
    // Posts and Instants come a page at a time: one of the copy's older than
    // the fresh page is simply not in this page, not deleted, so it stays
    // (it may be the very one on screen). Only inside the page does missing mean gone.
    const floor = (list: { createdAt: string }[]) => list.reduce((min, x) => (x.createdAt < min ? x.createdAt : min), '\uffff');
    const postFloor = floor(data.posts);
    const storyFloor = floor(data.stories);
    let users = [...data.users, ...prev.users.filter((u) => !remoteUsers.has(u.id) && !gone(u.id))];
    // What the coach works around is private: it comes from your own
    // settings row and goes back into your profile here, on your phone only.
    const ownConstraints = data.userState?.constraints;
    if (ownConstraints) users = users.map((u) => (u.id === me ? { ...u, profile: { ...u.profile, constraints: ownConstraints } } : u));
    // Your age, once known, never goes back to unknown on the server. A load
    // that set off just before your birthday was saved (sign-up starts one
    // the moment the account exists) must not wipe it here, or the age
    // check would ask again.
    const ownAge = prev.users.find((u) => u.id === me)?.ageGroup;
    if (ownAge) users = users.map((u) => (u.id === me && !u.ageGroup ? { ...u, ageGroup: ownAge } : u));
    // The profile row is created by a trigger; if it has not landed yet,
    // stand in for it so the screens have someone to show.
    if (!remoteUsers.has(me) && !fromSnapshot) {
      const handle = (email ?? 'player').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player';
      // And create the real row, so what you do next actually saves.
      remote.ensureProfile(me, handle, handle);
      users = [{
        id: me, handle, name: handle, bio: '', location: '', joinedAt: new Date().toISOString(), avatarSeed: me,
        isCoach: false, followers: 0, following: 0, profile: emptyProfile, achievementIds: [],
        stats: { sessionsLogged: 0, matchesPlayed: 0, matchesWon: 0, hoursOnCourt: 0, currentStreakDays: 0, longestStreakDays: 0 },
      }, ...users];
    }
    const self = users.find((u) => u.id === me);
    return dropFixtures({
      ...prev,
      users,
      posts: [...data.posts, ...prev.posts.filter((p) => !remotePosts.has(p.id) && !(gone(p.id) && p.createdAt >= postFloor))],
      comments: [...data.comments, ...prev.comments.filter((c) => !remoteComments.has(c.id) && !gone(c.id))],
      stories: [...data.stories, ...prev.stories.filter((st) => !remoteStories.has(st.id) && !(gone(st.id) && st.createdAt >= storyFloor))],
      followingIds: data.followingIds,
      followEdges: data.followEdges,
      followRequests: data.followRequests,
      // The feed carries on from the oldest post that came with the open.
      feed: { cursor: oldestOf(data.posts), more: data.posts.length > 0 },
      // Your real conversations replace the demo ones once the messages tables exist.
      conversations: data.conversations.length || data.messages.length ? data.conversations : prev.conversations.filter((c) => c.participantIds.includes(me)),
      messages: data.conversations.length || data.messages.length ? data.messages : prev.messages,
      // Saved discussions, coaching and notifications take the place of any local copy with the same id.
      questions: [...data.questions, ...prev.questions.filter((q) => !data.questions.some((r) => r.id === q.id) && !gone(q.id))],
      answers: [...data.answers, ...prev.answers.filter((a) => !data.answers.some((r) => r.id === a.id) && !gone(a.id))],
      coachQuestions: [...data.coachQuestions, ...prev.coachQuestions.filter((q) => !data.coachQuestions.some((r) => r.id === q.id) && !gone(q.id))],
      coachReplies: [...data.coachReplies, ...prev.coachReplies.filter((r) => !data.coachReplies.some((x) => x.id === r.id) && !gone(r.id))],
      coachingRequests: [...data.coachingRequests, ...prev.coachingRequests.filter((r) => !data.coachingRequests.some((x) => x.id === r.id))],
      // Real coaches, with their services, reviews and results.
      coaches: data.coaches,
      coachReviews: data.coachReviews,
      coachResults: data.coachResults,
      sessions: data.sessions ?? prev.sessions,
      hitRequests: data.hitRequests ?? prev.hitRequests,
      detectedActivities: data.activities ?? prev.detectedActivities,
      // Asked with the rest of the open (migration 62): names on posts and the people search follow it.
      sessionTagsReady: data.sessionTagsReady ?? prev.sessionTagsReady,
      // Which database this is (migration 64), from what the profiles came down with; a saved copy does not say.
      agesOnProfiles: !fromSnapshot && data.agesOnProfiles !== undefined ? data.agesOnProfiles : prev.agesOnProfiles,
      notifications: [...data.notifications, ...prev.notifications.filter((n) => !data.notifications.some((x) => x.id === n.id) && !gone(n.id))],
      // An answer to an ask for a review that came with this load (a pull to refresh, say), or reviews
      // not on the database at the last read: your asks are read again the next time one shows, so
      // "Review asked" turns to how it went (catchUpNotifications does the same for one that comes alone).
      reviewRequests: prev.reviewsOff || data.notifications.some((n) => n.kind === 'review' && !prev.notifications.some((x) => x.id === n.id)) ? null : prev.reviewRequests,
      tips: [...data.tips, ...prev.tips.filter((t) => !data.tips.some((x) => x.id === t.id) && !gone(t.id))],
      coachApplications: [...data.coachApplications, ...prev.coachApplications.filter((a) => !data.coachApplications.some((x) => x.id === a.id))],
      mutedIds: data.userState ? data.userState.mutedIds : prev.mutedIds,
      blockedIds: data.userState ? data.userState.blockedIds : prev.blockedIds,
      blockedMeIds: data.blockedMeIds ?? prev.blockedMeIds,
      paymentMethods: data.userState && data.userState.paymentMethods.length ? data.userState.paymentMethods : prev.paymentMethods,
      defaultPaymentId: data.userState?.defaultPaymentId ?? prev.defaultPaymentId,
      // The settings row carries map_visibility only once migration 63 has run: its key says the map's round 2 is live.
      mapVisibility: data.userState && data.userState.mapVisibility !== undefined ? data.userState.mapVisibility : prev.mapVisibility,
      mapLive: data.userState && data.userState.mapVisibility !== undefined ? true : prev.mapLive,
      // The settings row carries map_answered_at only once migration 78 has run.
      teenMap: data.userState?.teenMap ?? (data.userState ? 'off' : prev.teenMap),
      prefs: data.userState
        ? {
          showActivity: data.userState.showActivity, pushLikes: data.userState.pushLikes, pushCoach: data.userState.pushCoach, pushMessages: data.userState.pushMessages ?? true, pushActivity: data.userState.pushActivity ?? true,
          pushMapFriends: data.userState.pushMapFriends ?? true, pushMapHits: data.userState.pushMapHits ?? true, pushMapPlayers: data.userState.pushMapPlayers ?? true, pushCourts: data.userState.pushCourts ?? true,
          contactsFindable: data.userState.contactsFindable ?? true,
          pushRecap: data.userState.pushRecap ?? true,
          // Migration 146: a database without them keeps what this phone has.
          pushJoined: data.userState.pushJoined ?? prev.prefs.pushJoined,
          pushStreak: data.userState.pushStreak ?? prev.prefs.pushStreak,
        }
        : prev.prefs,
      // The settings row carries contacts_findable only once migration 89 has run (with no row yet, the load asks on its own).
      contactsFindableLive: data.userState?.contactsFindable !== undefined || data.contactsFindableReady ? true : prev.contactsFindableLive,
      joinAlertsLive: data.userState?.pushJoined !== undefined || data.alertSwitchesReady ? true : prev.joinAlertsLive,
      // The saved copy shows the app; only the server's answer counts as loaded (live updates, settings sync and retries wait for it).
      remoteLoaded: fromSnapshot ? prev.remoteLoaded : true,
      snapshotShown: fromSnapshot ? true : prev.snapshotShown,
      ready: true,
      saved: { ...prev.saved, postIds: data.savedPostIds, questionIds: data.userState ? data.userState.savedQuestionIds : prev.saved.questionIds },
      currentUserId: me,
      // Finished the quiz on any device, or (older accounts) set a goal in it.
      onboardingComplete: prev.onboardingComplete || !!self?.profile.onboardedAt || (self?.profile.goals.length ?? 0) > 0,
      authResolved: true,
      error: null,
    });
}

/** The thing a take-down is about, wherever the app holds it (a comment on an Instant sits with the post comments). */
function heldItem(s: Pick<AppState, 'posts' | 'stories' | 'comments' | 'questions' | 'answers' | 'coachQuestions' | 'coachReplies'>, kind: TakedownKind, id: ID): { removed?: Removed; authorId?: ID; coachUserId?: ID } | undefined {
  switch (kind) {
    case 'post': return s.posts.find((x) => x.id === id);
    case 'hit': return s.stories.find((x) => x.id === id);
    case 'comment': case 'hit-comment': return s.comments.find((x) => x.id === id);
    case 'question': return s.questions.find((x) => x.id === id);
    case 'answer': return s.answers.find((x) => x.id === id);
    case 'coach-question': return s.coachQuestions.find((x) => x.id === id);
    default: return s.coachReplies.find((x) => x.id === id);
  }
}

/**
 * One thing marked taken down (or, with no `removed`, put back) where the
 * app holds it. Nothing else moves: a feed leaves it out by the mark, and
 * its author's own pages show the mark. Pure, for a setState updater.
 */
function markRemoved(prev: AppState, kind: TakedownKind, id: ID, removed: Removed | undefined): AppState {
  const mark = <T extends { id: ID; removed?: Removed }>(list: T[]): T[] =>
    list.map((x) => {
      if (x.id !== id) return x;
      const next = { ...x };
      if (removed) next.removed = removed; else delete next.removed;
      return next;
    });
  // Not held here (a report's post that never loaded, say): nothing changes, nothing redraws.
  if (!heldItem(prev, kind, id)) return prev;
  switch (kind) {
    case 'post': return { ...prev, posts: mark(prev.posts) };
    case 'hit': return { ...prev, stories: mark(prev.stories) };
    case 'comment': case 'hit-comment': return { ...prev, comments: mark(prev.comments) };
    case 'question': return { ...prev, questions: mark(prev.questions) };
    case 'answer': return { ...prev, answers: mark(prev.answers) };
    case 'coach-question': return { ...prev, coachQuestions: mark(prev.coachQuestions) };
    default: return { ...prev, coachReplies: mark(prev.coachReplies) };
  }
}

/** The ask about one item closed here as it was closed on the server (the demo, and an admin's own copy). */
function closeReview(prev: AppState, kind: TakedownKind, id: ID, status: Exclude<ReviewStatus, 'open'>): AppState {
  if (!prev.reviewRequests?.some((r) => r.kind === kind && r.targetId === id && r.status === 'open')) return prev;
  const at = new Date().toISOString();
  return { ...prev, reviewRequests: prev.reviewRequests.map((r) => (r.kind === kind && r.targetId === id && r.status === 'open' ? { ...r, status, closedAt: at } : r)) };
}

/** Why a take-down or restore did not go through, for its toast. */
function moderationRefusal(result: ModerationResult, restoring: boolean): { title: string; body?: string } {
  if (result === 'refused') return { title: 'Only admins can do that' };
  if (result === 'not_ready') return { title: 'Taking things down isn’t switched on yet', body: 'Try again later.' };
  if (result === 'gone') return { title: 'It’s already gone', body: 'Whoever posted it has deleted it.' };
  return { title: restoring ? 'Couldn’t put it back. Try again.' : 'Couldn’t take it down. Try again.' };
}

function addPosts(prev: AppState, got: { posts: Post[]; comments: Comment[] }): AppState {
  const havePost = new Set(prev.posts.map((p) => p.id));
  const fresh = got.posts.filter((p) => !havePost.has(p.id));
  const haveComment = new Set(prev.comments.map((c) => c.id));
  const freshComments = got.comments.filter((c) => !haveComment.has(c.id));
  if (!fresh.length && !freshComments.length) return prev;
  return { ...prev, posts: [...prev.posts, ...fresh], comments: [...prev.comments, ...freshComments] };
}

/**
 * A profile's posts as fetched, onto the copies already held: any player on
 * a session's list there that the held copy lacks is added (never taken
 * off). Since migration 124 a player not known to be an adult is named on
 * someone else's post only for the people allowed to see them, through the
 * profile's own fetch, so the copy from the feed may not have them.
 */
function addSessionNames(prev: AppState, fetched: Post[]): AppState {
  const byId = new Map(fetched.filter((p) => p.session?.with?.length).map((p) => [p.id, p]));
  if (!byId.size) return prev;
  let changed = false;
  const posts = prev.posts.map((p) => {
    const got = byId.get(p.id);
    if (!got || !p.session || !got.session?.with) return p;
    const had = p.session.with ?? [];
    const extra = got.session.with.filter((w) => !had.some((h) => h.id === w.id));
    if (!extra.length) return p;
    changed = true;
    const list = [...had, ...extra];
    return { ...p, session: { ...p.session, with: [...list.filter((w) => w.role === 'opponent'), ...list.filter((w) => w.role !== 'opponent')] } };
  });
  return changed ? { ...prev, posts } : prev;
}

/**
 * Where a reply goes: under the top comment of the thread it answers (one
 * level, the way Instagram keeps it), answering the comment that was tapped.
 * Nothing when there is no such comment on this post or Instant.
 */
function replyFields(comments: Comment[], replyTo: ID | undefined, targetId: ID): Pick<Comment, 'parentId' | 'replyToId'> {
  const answered = replyTo ? comments.find((c) => c.id === replyTo && c.postId === targetId) : undefined;
  return answered ? { parentId: answered.parentId ?? answered.id, replyToId: answered.id } : {};
}

/**
 * Who a new comment tells, on this screen (the database files the real ones,
 * migration 56): the writer of the comment it answers hears "replied to your
 * comment"; the owner hears "commented" unless they were the one answered;
 * an @mention never tells either of them twice. Pure, for a setState updater.
 */
function notifyComment(state: AppState, comment: Comment, ownerId: ID | undefined, targetKind: 'post' | 'hit', mentions: boolean): AppState {
  const repliedTo = comment.replyToId ? state.comments.find((c) => c.id === comment.replyToId)?.authorId : undefined;
  const preview = snippet(comment.body);
  let next = state;
  if (repliedTo) next = withNotification(next, { userId: repliedTo, actorId: comment.authorId, kind: 'comment-reply', targetId: comment.postId, targetKind, preview });
  if (ownerId && ownerId !== repliedTo) next = withNotification(next, { userId: ownerId, actorId: comment.authorId, kind: 'comment', targetId: comment.postId, targetKind, preview });
  return mentions ? notifyMentions(next, comment.body, comment.authorId, comment.postId, targetKind, [ownerId, repliedTo]) : next;
}

/** Comments heard live (or caught up on), each added once, with its post's or Instant's count. */
function addLiveComments(prev: AppState, got: Comment[], kind: 'post' | 'hit'): AppState {
  const have = new Set(prev.comments.map((c) => c.id));
  const fresh = got.filter((c) => !have.has(c.id) && !prev.blockedIds.includes(c.authorId));
  // Each one shown is counted on its post or Instant, including any held but not yet counted.
  const shown = [...got.filter((c) => have.has(c.id)), ...fresh];
  // One your Hidden words hid (migration 117), or a reply under it, is not counted for you, its owner.
  const hiddenIds = new Set([...prev.comments, ...fresh].filter((c) => c.hiddenByWords).map((c) => c.id));
  const grow = <T extends { id: ID; commentIds: ID[] }>(x: T): T => {
    const missing = shown.filter((c) => c.postId === x.id && !hiddenIds.has(c.id) && !(c.parentId && hiddenIds.has(c.parentId)) && !x.commentIds.includes(c.id)).map((c) => c.id);
    return missing.length ? { ...x, commentIds: [...x.commentIds, ...missing] } : x;
  };
  const posts = kind === 'post' ? prev.posts.map(grow) : prev.posts;
  const stories = kind === 'hit' ? prev.stories.map(grow) : prev.stories;
  const same = posts.every((x, i) => x === prev.posts[i]) && stories.every((x, i) => x === prev.stories[i]);
  if (!fresh.length && same) return prev;
  return { ...prev, comments: [...prev.comments, ...fresh], posts, stories };
}

/**
 * Your posts carrying a tracker's session, kept in step with its log, as the
 * server keeps them (migration 65): once logged (`activityId`, `log`) a post
 * says what the log says, its time staying the tracker's; once the log is
 * deleted (`deletedId`) a tracker's post goes back to "Tennis", with no names. A post from
 * a session logged by hand keeps what it said.
 */
function postsFollowLog(posts: Post[], me: ID, activityId: ID | null, log: PracticeSession | null, deletedId?: ID): Post[] {
  let changed = false;
  const next = posts.map((p) => {
    const s = p.session;
    if (p.authorId !== me || !s || !s.activityId) return p;
    if (log && s.activityId === activityId) {
      changed = true;
      const won = log.kind === 'match' && log.won !== undefined ? log.won : undefined;
      // The log's score too, on any tennis session (the server puts it on, migration 91; a practice's too since Oct 6).
      const sets = canScore(log.kind) && log.sets?.length ? log.sets : undefined;
      // A fitness session logged from a workout says what it was ("Run"), as the server writes it (migration 107).
      const workout = log.kind === 'fitness' && log.workout ? log.workout : undefined;
      const { won: _w, sets: _s, workout: _wk, ...rest } = s;
      return { ...p, session: { ...rest, kind: log.kind, focus: log.kind === 'match' && won !== undefined ? `Match · ${won ? 'Won' : 'Lost'}` : workout ? workoutName(workout) : log.kind.charAt(0).toUpperCase() + log.kind.slice(1), sessionId: log.id, day: log.day, ...(won !== undefined ? { won } : {}), ...(sets ? { sets } : {}), ...(workout ? { workout } : {}) } };
    }
    if (deletedId && s.sessionId === deletedId) {
      changed = true;
      // The names go with the log too, as the server takes them off. A workout's post goes back to what the workout was.
      const { kind: _k, won: _w, sessionId: _s, with: _with, sets: _sets, ...rest } = s;
      return { ...p, session: rest.workout ? { ...rest, kind: 'fitness' as const, focus: workoutName(rest.workout) } : { ...rest, focus: 'Tennis' } };
    }
    return p;
  });
  return changed ? next : posts;
}

/** Someone in a list of ids, or not: the list as it is when it already says so. */
const withOrWithout = (ids: ID[], id: ID, on: boolean): ID[] => (on ? (ids.includes(id) ? ids : [...ids, id]) : ids.includes(id) ? ids.filter((x) => x !== id) : ids);

/** Comments a delete took off that did not go through, back on their post or Instant (any already back are left as they are). */
function putBackComments(prev: AppState, gone: Comment[]): AppState {
  const have = new Set(prev.comments.map((c) => c.id));
  const back = gone.filter((c) => !have.has(c.id));
  if (!back.length) return prev;
  const grow = <T extends { id: ID; commentIds: ID[] }>(x: T): T => {
    const add = back.filter((c) => c.postId === x.id && !x.commentIds.includes(c.id)).map((c) => c.id);
    return add.length ? { ...x, commentIds: [...x.commentIds, ...add] } : x;
  };
  return { ...prev, comments: [...prev.comments, ...back], posts: prev.posts.map(grow), stories: prev.stories.map(grow) };
}

/** A comment deleted elsewhere: gone here too, with its replies (the database removes them with it). */
function dropComment(prev: AppState, commentId: ID): AppState {
  if (!prev.comments.some((c) => c.id === commentId)) return prev;
  const gone = new Set(prev.comments.filter((c) => c.id === commentId || c.parentId === commentId).map((c) => c.id));
  const shrink = <T extends { commentIds: ID[] }>(x: T): T => (x.commentIds.some((i) => gone.has(i)) ? { ...x, commentIds: x.commentIds.filter((i) => !gone.has(i)) } : x);
  return { ...prev, comments: prev.comments.filter((c) => !gone.has(c.id)), posts: prev.posts.map(shrink), stories: prev.stories.map(shrink) };
}

/**
 * Demo build in a browser: `?as=handle` on any address signs that fixture in
 * and keeps it for the tab, so a screen can be opened straight from its
 * address — which is how the design checks take their pictures. Never with a
 * real database, never on a phone.
 */
const demoHandle: string | null = (() => {
  if (isSupabaseConfigured || Platform.OS !== 'web') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('as');
    if (asked) { window.sessionStorage.setItem('courtside-demo-as', asked); return asked; }
    return window.sessionStorage.getItem('courtside-demo-as');
  } catch { return null; }
})();

/**
 * Demo build in a browser: `?toast=tennis` puts up the "Tennis detected"
 * note for your waiting session, `?toast=workout` the "Activity detected"
 * one for your waiting run, so the Log it flow can be seen.
 */
const demoActivityToast: 'tennis' | 'workout' | null = (() => {
  if (isSupabaseConfigured || Platform.OS !== 'web') return null;
  try {
    const asked = new URLSearchParams(window.location.search).get('toast');
    return asked === 'tennis' || asked === 'workout' ? asked : null;
  } catch { return null; }
})();

/**
 * The note when a check files sessions. One: "Tennis detected" with its
 * time, heart rate and source, as always, or "Activity detected" ("Run · 32
 * min · 3.1 mi"; owner, Oct 5), each with Log it, which opens the composer
 * with it on (Oct 2): post it, or just log it. Two or three at once: how
 * many, and See them, which opens Notifications, where each one waits with
 * its own row. More than three (the past week, picked up once after the Oct
 * 5 update, or a watch or strap catching up; owner, Oct 5, "grouped noti"):
 * "5 workouts found", what they were and where from, and See them, which
 * opens their list (app/workouts-found), as their one row in Notifications
 * does. Your own numbers, for you only: the lock-screen push never carries
 * them (migration 58).
 */
function activityToast(count: number, newestFirst: DetectedActivity[], holdMs?: number) {
  if (count > FOLD_OVER) {
    const ids = newestFirst.map((a) => a.id);
    const href = ids.length ? foundHref(ids) : '/workouts-found';
    showToast({
      title: foundTitle(count, newestFirst.length === count && allTennisFound(ids, [], newestFirst)),
      body: ids.length ? `${foundLine(ids, [], newestFirst)}. Tap to log.` : 'Tap to log them.',
      glyph: 'session',
      href,
      action: { label: 'See them', onPress: () => router.push(href as never) },
      ...(holdMs ? { holdMs } : {}),
    });
    return;
  }
  if (count > 1) {
    const allTennis = newestFirst.length === count && newestFirst.every(isTennisActivity);
    showToast({
      title: `${count} ${allTennis ? 'tennis sessions' : 'workouts'} picked up`,
      body: 'Each one is in Notifications, ready to log.',
      glyph: 'session',
      href: '/notifications',
      action: { label: 'See them', onPress: () => router.push('/notifications') },
      ...(holdMs ? { holdMs } : {}),
    });
    return;
  }
  const a = newestFirst[0];
  if (!a) return;
  const href = `/compose?activity=${a.id}`;
  showToast({
    title: isTennisActivity(a) ? 'Tennis detected' : 'Activity detected',
    body: isTennisActivity(a)
      ? [duration(a.minutes), a.maxHr ? `${a.maxHr} max bpm` : null, pickSource({ type: 'tracker', activity: a })].filter(Boolean).join(' · ')
      : workoutLine(a),
    glyph: 'session',
    href,
    action: { label: 'Log it', onPress: () => router.push(href as never) },
    ...(holdMs ? { holdMs } : {}),
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ...emptyBootstrap,
    ready: false,
    // A demo handle on the address is signing in: the sign-in gate waits for it.
    authResolved: !isSupabaseConfigured && !demoHandle,
    currentUserId: null,
    onboardingComplete: false,
    error: null,
    saved: { postIds: [], questionIds: [] },
    defaultReaction: readDefaultReaction(),
    followingIds: [],
    followEdges: [],
    followRequests: [],
    feed: { cursor: null, more: false },
    remoteLoaded: false,
    snapshotShown: false,
    termsVersion: undefined,
    savedAccounts: [],
    mutedIds: [],
    reportedIds: [],
    blockedIds: [],
    blockedMeIds: [],
    alertIds: [],
    paymentMethods: STARTER_PAYMENTS,
    defaultPaymentId: readDefaultPayment(),
    prefs: DEFAULT_PREFS,
    contactsFindableLive: false,
    // The demo has no server to ask: its switches all show.
    joinAlertsLive: !isSupabaseConfigured,
    hiddenWords: null,
    reviewRequests: null,
    reviewsOff: false,
    reviewsFailed: false,
    tips: [],
    sessions: [],
    sessionTags: [],
    sessionTagsReady: !isSupabaseConfigured,
    openness: {},
    courtShown: {},
    agesOnProfiles: null,
    lastSeen: {},
    lastSeenLoaded: false,
    mapLive: isSupabaseConfigured ? null : true,
    mapVisibility: isSupabaseConfigured ? undefined : readDemoVisibility(),
    teenMap: isSupabaseConfigured ? 'off' : 'on',
    newOnCourtside: null,
    ...emptyCourtLife,
    ...emptyFeedGroups,
    hitRequests: [],
    locationEnabled: readFlag('courtside-location'),
    locationAsked: readAsked('courtside-location'),
    detectedLocation: null,
    detectedCoords: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchBootstrap()
      .then((data) => {
        if (cancelled) return;
        // The account may already be in — Supabase answers faster than the
        // fixtures' artificial delay — so the fixtures slot in underneath
        // whatever is there rather than replacing it.
        setState((prev) => {
          // A real account's saved copy or data is already up: the demo has no place under it.
          if (prev.snapshotShown || prev.remoteLoaded) return { ...prev, ready: true };
          const fixtures = { ...data, users: data.users.map(user => ({...user, readReceiptsEnabled: readReceiptPreference(user.id)})) };
          const merge = <T extends { id: string }>(existing: T[], incoming: T[]) => {
            const seen = new Set(existing.map((item) => item.id));
            return [...existing, ...incoming.filter((item) => !seen.has(item.id))];
          };
          return {
            ...prev,
            ...fixtures,
            users: merge(prev.users, fixtures.users),
            posts: merge(prev.posts, fixtures.posts),
            comments: merge(prev.comments, fixtures.comments),
            stories: merge(prev.stories, fixtures.stories),
            questions: merge(prev.questions, fixtures.questions),
            notifications: merge(prev.notifications, fixtures.notifications),
            ready: true,
          };
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          ready: true,
          error: err instanceof Error ? err.message : 'Something went wrong loading CourtSide.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Real data sits on top of the fixtures: profiles, posts, stories and the
   * edges between them come from Supabase once someone is signed in, and the
   * fixtures fill in everything that has no table yet.
   */
  // Messages from other people arrive as they are sent; a chat that someone
  // else just started is fetched whole the first time it is heard from.
  const remoteLoaded = state.remoteLoaded;
  const currentUserForLive = state.currentUserId;
  // Bumped to reconnect: after the connection drops, and whenever the app comes back to the front.
  const [liveEpoch, setLiveEpoch] = useState(0);
  const dropRetries = useRef(0);
  // Groups someone took you out of, as they last stood here, for a chat that
  // is open on screen when it happens (see removedChat). Kept with who you
  // were, so another account on this phone never sees them.
  const removedChats = useRef(new Map<ID, { me: ID; chat: { conversation: Conversation; messages: Message[] } }>());
  // Messages you deleted for yourself, by account: every later fetch (a chat
  // opened, a catch-up, a reply's original) leaves them out, not only the
  // first load. Filled by that load, and added to the moment you delete one,
  // before the server has it.
  const hiddenMessages = useRef(new Map<ID, Set<ID>>());
  const hiddenFor = (me: ID) => {
    let set = hiddenMessages.current.get(me);
    if (!set) { set = new Set(); hiddenMessages.current.set(me, set); }
    return set;
  };
  const isHidden = (me: ID, messageId: ID) => !!hiddenMessages.current.get(me)?.has(messageId);
  const unhidden = (me: ID, list: Message[]) => {
    const set = hiddenMessages.current.get(me);
    return set?.size ? list.filter((m) => !set.has(m.id)) : list;
  };
  const chatUnhidden = (me: ID, got: { conversation: Conversation; messages: Message[] }) => {
    const set = hiddenMessages.current.get(me);
    if (!set?.size) return got;
    return { conversation: { ...got.conversation, messageIds: got.conversation.messageIds.filter((id) => !set.has(id)) }, messages: got.messages.filter((m) => !set.has(m.id)) };
  };
  /**
   * One chat fetched as it stands now and laid over what is here: who is in
   * it, its name, photo, admins and your mute, and its newest messages. A
   * group the server no longer has for you (someone took you out, or
   * everyone left) goes, with a note saying so: that is how a removed person
   * finds out. `open`: the chat is on screen, so nothing in it counts as unread.
   */
  const refreshChat = useCallback(async (conversationId: ID, open = false) => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me, conversationId)) return;
    const got = await remote.fetchConversationState(me, conversationId).catch(() => null);
    if (!got || stateRef.current.currentUserId !== me) return;
    if (got === 'gone') {
      const had = stateRef.current.conversations.find((c) => c.id === conversationId);
      if (!had || !isGroupChat(had)) return;
      removedChats.current.set(conversationId, { me, chat: { conversation: had, messages: stateRef.current.messages.filter((m) => m.conversationId === conversationId) } });
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.filter((c) => c.id !== conversationId),
        messages: prev.messages.filter((m) => m.conversationId !== conversationId),
      }));
      showToast({ title: `You’re no longer in ${groupName(had, stateRef.current.users, me)}`, icon: 'people-outline' });
      return;
    }
    const kept = chatUnhidden(me, got);
    setState((prev) => applyFetchedChat(prev, kept, me, open ? conversationId : undefined));
  }, []);
  // The newest message time the server itself gave, from the first load, the
  // live updates and catch-ups (everything up to it is here), for catching up
  // from. Never a time this phone put on a message of its own ("Sending…",
  // "Not sent", or one sent while the live connection was down), which
  // would skip what others sent meanwhile.
  const serverNewest = useRef<{ me: ID; at: number } | null>(null);
  const heardUpTo = (me: ID, list: Message[]) => {
    let at = serverNewest.current?.me === me ? serverNewest.current.at : 0;
    for (const m of list) { const t = Date.parse(m.createdAt); if (t > at) at = t; }
    if (at) serverNewest.current = { me, at };
  };
  // Whatever was sent while the phone slept or the connection was down, in one small ask:
  // every message newer than the newest one the server has given.
  const catchUpMessages = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me || !UUID.test(me) || !isSupabaseConfigured) return;
    // Before any (only a saved copy shown): the newest from someone else, which the server dated.
    const newest = serverNewest.current?.me === me ? serverNewest.current.at
      : stateRef.current.messages.reduce((t, m) => (m.senderId !== me && !m.sending && !m.failed ? Math.max(t, Date.parse(m.createdAt) || 0) : t), 0);
    const since = new Date((newest || Date.now() - 86_400_000) - 5000).toISOString();
    const got = await remote.fetchMessagesSince(since).catch(() => [] as Message[]);
    heardUpTo(me, got);
    const fresh = unhidden(me, got);
    if (!fresh.length) return;
    const known = new Set(stateRef.current.conversations.map((c) => c.id));
    const strangers = [...new Set(fresh.map((m) => m.conversationId).filter((cid) => !known.has(cid)))];
    // A chat someone else started (or a group you were added to) while you were away arrives whole.
    const started = (await Promise.all(strangers.map((cid) => remote.fetchConversation(me, cid).catch(() => null)))).filter(Boolean).map((got) => chatUnhidden(me, got!));
    setState((prev) => {
      let next = started.reduce((acc, got) => (acc.conversations.some((c) => c.id === got.conversation.id) ? acc : { ...acc, conversations: [got.conversation, ...acc.conversations], messages: [...acc.messages, ...got.messages.filter((m) => !acc.messages.some((p) => p.id === m.id))] }), prev);
      next = mergeFetchedMessages(next, fresh.filter((m) => next.conversations.some((c) => c.id === m.conversationId)), me);
      return next;
    });
    // A group already here that changed meanwhile (people added or gone, a
    // new name or photo) says so with an event line: fetch it as it stands.
    const changed = new Set(fresh.filter((m) => m.kind === 'system' && known.has(m.conversationId)).map((m) => m.conversationId));
    changed.forEach((cid) => { void refreshChat(cid); });
  }, [refreshChat]);
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    // Back to the front (a phone woken, a browser tab looked at again): reconnect and catch up.
    const wake = () => setLiveEpoch((n) => n + 1);
    const sub = DeviceState.addEventListener('change', (st) => { if (st === 'active') wake(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') wake(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => { sub.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); };
  }, [remoteLoaded, currentUserForLive]);
  // "Opened the app today" (migration 110): once a day, on start and on coming
  // back to the front. Fire and forget; it never holds anything up.
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    const me = currentUserForLive;
    // And, once a day, the phone's time zone when it changed, for the Monday recap at 8am your time (migration 130).
    const opened = () => { noteAppOpen(me); noteTimeZone(me); };
    opened();
    const sub = DeviceState.addEventListener('change', (st) => { if (st === 'active') opened(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') opened(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => { sub.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); };
  }, [remoteLoaded, currentUserForLive]);
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    const me = currentUserForLive;
    let off: (() => void) | undefined;
    let offReads: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Closing it ourselves (leaving, reconnecting) also reports "closed"; that is not a drop.
    let disposed = false;
    try {
      off = remote.onMessages({
        connected: () => { dropRetries.current = 0; void catchUpMessages(); },
        // Dropped: try again after a moment, waiting a little longer each time (2s, 4s, 8s… up to 30s).
        dropped: () => {
          if (disposed || retry) return;
          const wait = Math.min(30_000, 2000 * 2 ** dropRetries.current);
          dropRetries.current += 1;
          retry = setTimeout(() => setLiveEpoch((n) => n + 1), wait);
        },
        added: (arrived) => {
          // From someone you don't follow: asked whether your Hidden words hid it (migration 117) before it shows.
          const ask = arrived.senderId !== me && arrived.kind !== 'system' && !!arrived.body.trim() && !stateRef.current.followingIds.includes(arrived.senderId);
          if (ask) { void remote.heldMessageIds([arrived.id]).catch(() => [] as ID[]).then((held) => take(held.includes(arrived.id) ? { ...arrived, hiddenByWords: true } : arrived)); return; }
          take(arrived);
        },
        // An edit, or a reaction, from the other phone: the words and reactions update in place.
        changed: (message) => {
          const was = stateRef.current.messages.find((m) => m.id === message.id);
          setState((prev) => prev.messages.some((m) => m.id === message.id)
            ? { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, body: message.body, editedAt: message.editedAt, reactions: message.reactions } : m)) }
            : prev);
          // New words from someone you don't follow: asked again whether your Hidden words hide them (migration 117).
          if (!was || was.body === message.body || message.senderId === me || stateRef.current.followingIds.includes(message.senderId)) return;
          void remote.heldMessageIds([message.id]).catch(() => null).then((held) => {
            if (!held) return;
            const hidden = held.includes(message.id) || undefined;
            setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === message.id && m.body === message.body ? { ...m, hiddenByWords: hidden } : m)) }));
          });
        },
        // Unsent by its sender: gone from this chat too, and from the banner if it is on one.
        removed: (messageId) => {
          heardUnsent(messageId);
          setState((prev) => prev.messages.some((m) => m.id === messageId) ? {
            ...prev,
            messages: prev.messages.filter((m) => m.id !== messageId),
            conversations: prev.conversations.map((c) => (c.messageIds.includes(messageId) ? { ...c, messageIds: c.messageIds.filter((x) => x !== messageId) } : c)),
          } : prev);
        },
      });
      function take(message: Message) {
        heardUpTo(me, [message]);
        if (stateRef.current.messages.some((m) => m.id === message.id) || isHidden(me, message.id)) return;
        const known = stateRef.current.conversations.some((c) => c.id === message.conversationId);
        if (known) {
          // An event line ("Mira added Dev", "Dev named the group…") is never unread.
          const system = message.kind === 'system';
          setState((prev) => prev.messages.some((m) => m.id === message.id) ? prev : {
            ...prev,
            messages: [...prev.messages, message],
            conversations: prev.conversations.map((c) => c.id === message.conversationId
              // Never one your Hidden words hid (migration 117): no alert came for it, and it raises no badge.
              // Nor does it move the chat up the inbox: nothing about it should call for you.
              ? { ...c, messageIds: [...c.messageIds, message.id], updatedAt: message.hiddenByWords ? c.updatedAt : message.createdAt, unreadCount: message.senderId === me || system || message.hiddenByWords ? c.unreadCount : c.unreadCount + 1 }
              : c),
          });
          // It also means the group itself changed (its people, name, photo
          // or admins): fetch it as it stands, so every screen shows it now.
          if (system) void refreshChat(message.conversationId);
          // Someone else's message drops in as a banner at the top (MessageBanner decides whether it shows);
          // never one your Hidden words hid (migration 117), as no alert came for it either.
          else if (message.senderId !== me && !message.hiddenByWords) heardMessage(message);
          return;
        }
        void remote.fetchConversation(me, message.conversationId).then((fetched) => {
          if (!fetched) return;
          const got = chatUnhidden(me, fetched);
          setState((prev) => prev.conversations.some((c) => c.id === got.conversation.id) ? prev : {
            ...prev,
            conversations: [got.conversation, ...prev.conversations],
            messages: [...prev.messages, ...got.messages.filter((m) => !prev.messages.some((p) => p.id === m.id))],
          });
          // A chat someone has just started with you: its first message gets a banner too (not one your Hidden words hid).
          if (message.senderId !== me && message.kind !== 'system' && !message.hiddenByWords) heardMessage(message);
        });
      }
      // Someone read your messages: "Read" shows under them straight away.
      offReads = remote.onReads((conversationId, userId, readAt, receipts) => {
        // Their Read receipts switch for this chat, when it changed (migration 141).
        if (receipts !== undefined) {
          setState((prev) => {
            const chat = prev.conversations.find((c) => c.id === conversationId);
            if (!chat || !chat.receiptsOffIds?.includes(userId) === receipts) return prev;
            const rest = (chat.receiptsOffIds ?? []).filter((id) => id !== userId);
            const next = receipts ? rest : [...rest, userId];
            return { ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, receiptsOffIds: next.length ? next : undefined } : c)) };
          });
        }
        if (!readAt) return;
        const upTo = Date.parse(readAt);
        // You read it on another device (the web app, say): what you read there stops counting as unread here.
        if (userId === me) {
          setState((prev) => {
            const chat = prev.conversations.find((c) => c.id === conversationId);
            if (!chat || !chat.unreadCount) return prev;
            const left = prev.messages.filter((m) => m.conversationId === conversationId && m.senderId !== me && m.kind !== 'system' && Date.parse(m.createdAt) > upTo).length;
            // Only ever lower: a late or out-of-order update never puts back a count already cleared here.
            if (left >= chat.unreadCount) return prev;
            return { ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, unreadCount: left } : c)) };
          });
          return;
        }
        setState((prev) => ({
          ...prev,
          // Event lines are never "read by" anyone.
          messages: prev.messages.map((m) => (m.conversationId === conversationId && m.kind !== 'system' && m.senderId !== userId && Date.parse(m.createdAt) <= upTo && !m.readAtBy?.[userId]
            ? { ...m, readAtBy: { ...(m.readAtBy ?? {}), [userId]: readAt }, openedAtBy: { ...(m.openedAtBy ?? {}), [userId]: readAt } }
            : m)),
        }));
      });
    } catch { /* live updates are a nicety */ }
    return () => { disposed = true; if (retry) clearTimeout(retry); off?.(); offReads?.(); };
  }, [remoteLoaded, currentUserForLive, liveEpoch, catchUpMessages, refreshChat]);

  // Open hits, live: one posted, joined or called off anywhere is on Find
  // Players within seconds, and the list catches up whenever the app comes
  // back to the front (the subscription reconnects with liveEpoch).
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let on = true;
    // A burst of changes (a join adds a row and touches the hit) is one ask.
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void remote.fetchHits(currentUserForLive).then((hits) => { if (on && hits) setState((prev) => ({ ...prev, hitRequests: hits })); }).catch(() => undefined);
      }, 400);
    };
    let off: (() => void) | undefined;
    try { off = remote.onHits(refetch); } catch { /* live updates are a nicety */ }
    return () => { on = false; if (timer) clearTimeout(timer); off?.(); };
  }, [remoteLoaded, currentUserForLive, liveEpoch]);

  // Session tags (migration 62): asked once per account whether the server
  // has them; until it does, "Who you played" stays free text. Once it does,
  // your tags load and stay live: a "Waiting" turns into the name within
  // seconds of the other player accepting, and the list catches up whenever
  // the app comes back to the front (the subscription reconnects with liveEpoch).
  const tagsReady = state.sessionTagsReady;
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive) || tagsReady) return;
    let on = true;
    void remote.sessionTagsReady().then((ready) => { if (on && ready) setState((prev) => (prev.currentUserId === currentUserForLive ? { ...prev, sessionTagsReady: true } : prev)); }).catch(() => undefined);
    return () => { on = false; };
  }, [remoteLoaded, currentUserForLive, tagsReady, liveEpoch]);
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive) || !tagsReady) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let on = true;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void remote.mySessionTags().then((got) => {
          if (on && got) setState((prev) => (prev.currentUserId === currentUserForLive ? { ...prev, sessionTags: got, posts: reconcileWith(prev.posts, currentUserForLive, prev.sessions, got, prev.users) } : prev));
        }).catch(() => undefined);
      }, 400);
    };
    let off: (() => void) | undefined;
    try { off = remote.onSessionTags(currentUserForLive, () => new Set(stateRef.current.sessionTags.map((t) => t.id)), refetch); } catch { refetch(); }
    return () => { on = false; if (timer) clearTimeout(timer); off?.(); };
  }, [remoteLoaded, currentUserForLive, tagsReady, liveEpoch]);

  // Notifications for other people are never sent from this phone: the
  // database files them itself when the real like, comment or follow is
  // saved (migration 18), so nobody can make one up. The ones filed in state
  // here (withNotification) only keep this screen up to date, and run the
  // demo, where there is no database.
  // Your own settings (mutes, blocks, saved threads, payment methods, switches) follow the account.
  const settingsNow = settingsJson(state);
  // Kept with whose they were: a different account signed in starts from what it loaded, never from the last one's.
  const settingsSeen = useRef<{ who: ID; json: string } | null>(null);
  // Changes made here, and how many of them have been saved: equal when nothing is on its way up.
  const settingsCount = useRef({ made: 0, saved: 0 });
  // The account whose settings row has been read from the server since it
  // signed in here. Until it has, the lists on screen may be empty only
  // because the read failed, so they are never sent up as they are: that
  // would wipe the account's blocks, mutes and saved threads on the server.
  const settingsRead = useRef<ID | null>(null);
  /**
   * Your settings row as just read (`got`; null: there is none), taken as
   * what the server has, with any change made here meanwhile kept on top
   * (and then sent up by the effect below).
   */
  const takeServerSettings = useCallback((me: ID, got: UserState | null) => {
    const s = stateRef.current;
    if (s.currentUserId !== me) return;
    const base = settingsSeen.current?.who === me && settingsSeen.current.json ? settingsSeen.current.json : settingsJson(s);
    const changedHere = settingsJson(s) !== base;
    const merged = withServerSettings(s, base, got);
    settingsRead.current = me;
    // Nothing changed here: taken as already saved. A change made here goes up, on top of the server's.
    settingsSeen.current = { who: me, json: changedHere ? '' : settingsJson({ ...s, ...merged }) };
    setState((prev) => (prev.currentUserId === me ? { ...prev, ...merged } : prev));
  }, []);
  useEffect(() => {
    // Signed out: whoever signs in next (the same account too) starts from what it loads, not from this.
    if (!currentUserForLive) { settingsSeen.current = null; settingsRead.current = null; return undefined; }
    if (!isSupabaseConfigured || !remoteLoaded || !UUID.test(currentUserForLive)) return undefined;
    if (settingsSeen.current?.who !== currentUserForLive) { settingsSeen.current = { who: currentUserForLive, json: settingsNow }; return undefined; }
    if (settingsSeen.current.json === settingsNow) return undefined;
    if (settingsRead.current !== currentUserForLive) {
      // A change made before your settings could be read: read them now,
      // and the change goes up on top of them (takeServerSettings).
      const me = currentUserForLive;
      let on = true;
      const t = setTimeout(() => {
        void remote.fetchUserState(me).then((got) => { if (on && settingsRead.current !== me) takeServerSettings(me, got); }).catch(() => undefined);
      }, 400);
      return () => { on = false; clearTimeout(t); };
    }
    settingsSeen.current = { who: currentUserForLive, json: settingsNow };
    const made = ++settingsCount.current.made;
    const settled = () => { settingsCount.current.saved = Math.max(settingsCount.current.saved, made); };
    let sent = false;
    const s = stateRef.current;
    const t = setTimeout(() => {
      sent = true;
      void remote.saveUserState(currentUserForLive, {
        mutedIds: s.mutedIds, blockedIds: s.blockedIds, savedQuestionIds: s.saved.questionIds, paymentMethods: s.paymentMethods,
        defaultPaymentId: s.defaultPaymentId, showActivity: s.prefs.showActivity, pushLikes: s.prefs.pushLikes, pushCoach: s.prefs.pushCoach,
        pushMessages: s.prefs.pushMessages, pushActivity: s.prefs.pushActivity,
        pushMapFriends: s.prefs.pushMapFriends, pushMapHits: s.prefs.pushMapHits, pushMapPlayers: s.prefs.pushMapPlayers, pushCourts: s.prefs.pushCourts,
        // Sent only once the database is known to have it (migration 89).
        contactsFindable: s.contactsFindableLive ? s.prefs.contactsFindable : undefined,
        // The weekly recap's alert (migration 130): a database without it leaves it out by itself.
        pushRecap: s.prefs.pushRecap,
        // Migration 146's two switches; the same.
        pushJoined: s.joinAlertsLive ? s.prefs.pushJoined : undefined,
        pushStreak: s.prefs.pushStreak,
      }).finally(settled);
    }, 400);
    // Never sent (a newer change took its place, or the account changed): nothing of it is on its way up.
    return () => { clearTimeout(t); if (!sent) settled(); };
  }, [settingsNow, remoteLoaded, currentUserForLive, takeServerSettings]);
  // Back to the front: your mutes, blocks and saved threads as the server has
  // them now. The save above sends whole lists, so a phone left open since
  // before a block made on another device would otherwise undo it with its
  // next change. A change made here and not saved yet is left to go up as it is.
  useEffect(() => {
    if (!liveEpoch || !isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return undefined;
    const me = currentUserForLive;
    // Read only once every change made here is saved, and used only if none was made meanwhile.
    const asked = settingsCount.current.made;
    if (settingsCount.current.saved !== asked) return undefined;
    let on = true;
    void remote.fetchUserState(me).then((got) => {
      const s = stateRef.current;
      if (!on || s.currentUserId !== me || settingsCount.current.made !== asked) return;
      // Not read since signing in (that read failed): this is the first good one.
      if (settingsRead.current !== me) { takeServerSettings(me, got); return; }
      if (!got) return;
      if (settingsSeen.current?.who !== me || settingsSeen.current.json !== settingsJson(s)) return;
      const lists = { mutedIds: got.mutedIds, blockedIds: got.blockedIds, saved: { ...s.saved, questionIds: got.savedQuestionIds } };
      // Taken as already saved, so it is not sent straight back.
      settingsSeen.current = { who: me, json: settingsJson({ ...s, ...lists }) };
      setState((prev) => (prev.currentUserId === me ? { ...prev, mutedIds: got.mutedIds, blockedIds: got.blockedIds, saved: { ...prev.saved, questionIds: got.savedQuestionIds } } : prev));
    }).catch(() => undefined);
    return () => { on = false; };
  }, [remoteLoaded, currentUserForLive, liveEpoch, takeServerSettings]);

  // The newest notification time the server itself gave (the open's load and
  // the catch-ups below), for catching up from. Never one this phone filed for
  // itself ("Your post is live", an ask to follow at the open): those carry
  // this phone's clock, which may run ahead and would skip what came meanwhile.
  const notesHeard = useRef<{ me: ID; at: string } | null>(null);
  const heardNotes = (me: ID, list: Notification[]) => {
    let at = notesHeard.current?.me === me ? notesHeard.current.at : '';
    for (const n of list) if (n.userId === me && n.createdAt > at) at = n.createdAt;
    if (at) notesHeard.current = { me, at };
  };
  // Notifications filed while the app was in the background (a like, a
  // follow, "Tennis detected" from WHOOP's own alert), in one small ask:
  // every one newer than the newest the server has given. Asked whenever the
  // app comes back to the front, and when Notifications opens.
  const catchUpNotifications = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me) || !stateRef.current.remoteLoaded) return;
    const newest = notesHeard.current?.me === me ? notesHeard.current.at : '';
    const since = new Date((newest ? Date.parse(newest) : Date.now() - 31 * 86_400_000) - 5000).toISOString();
    const fresh = await remote.fetchNotificationsSince(me!, since).catch(() => [] as Notification[]);
    heardNotes(me!, fresh);
    if (!fresh.length || stateRef.current.currentUserId !== me) return;
    setState((prev) => {
      const add = fresh.filter((n) => !prev.notifications.some((x) => x.id === n.id));
      if (!add.length) return prev;
      // An answer to an ask for a review: your asks are read again the next time one shows, so
      // "Review asked" turns to how it went without closing the app.
      const answered = add.some((n) => n.kind === 'review');
      return { ...prev, notifications: [...add, ...prev.notifications], ...(answered ? { reviewRequests: null } : {}) };
    });
  }, []);
  useEffect(() => {
    if (!liveEpoch || !isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    void catchUpNotifications();
  }, [remoteLoaded, currentUserForLive, liveEpoch, catchUpNotifications]);

  // What the saved copy put on screen, so the fresh load can take back off anything the server no longer has.
  const snapshotIds = React.useRef<Set<string> | null>(null);
  const showSnapshot = useCallback((me: ID, data: RemoteData) => {
    snapshotIds.current = idsIn(data);
    setState((prev) => (prev.remoteLoaded || (prev.currentUserId && prev.currentUserId !== me) ? prev : mergeRemote(prev, data, me, null, null, true)));
  }, []);

  const fetchAndMerge = useCallback(async (me: ID, email?: string | null) => {
    try {
      // The network can miss on a cold open; the load is tried a few times
      // before giving up, and giving up never means "start the quiz again".
      let data: Awaited<ReturnType<typeof fetchRemote>> | null = null;
      // How posts have been watched, for the feed's first deal: asked alongside the load, not after it.
      void loadFeedScores();
      for (let attempt = 0; ; attempt += 1) {
        try { data = await fetchRemote(me); break; } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 700 * 2 ** attempt));
        }
      }
      const snap = snapshotIds.current;
      snapshotIds.current = null;
      const hidden = hiddenFor(me);
      for (const id of data.hiddenMessageIds ?? []) hidden.add(id);
      heardUpTo(me, data.messages);
      heardNotes(me, data.notifications);
      // One deleted for yourself a moment ago, before the server had it, stays gone too.
      const shown = { ...data, messages: unhidden(me, data.messages) };
      setState((prev) => mergeRemote(prev, shown, me, email, snap, false));
      // Your settings row came down (or there is none): what is on screen may be saved from now on.
      if (!data.userStateFailed) settingsRead.current = me;
      // The next open starts from this, straight after the logo.
      setTimeout(() => { const s = stateRef.current; if (s.currentUserId === me && s.remoteLoaded) void saveSnapshot(me, snapshotOf(s, me)); }, 2500);
      // An ask that arrived while the app was closed gets its notification now.
      setState((prev) => data.followRequests
        .filter((r) => r.toId === me && !prev.notifications.some((n) => n.kind === 'follow-request' && n.actorId === r.fromId && n.userId === me))
        .reduce((acc, r) => withNotification(acc, { userId: me, actorId: r.fromId, kind: 'follow-request', targetId: r.fromId, targetKind: 'post' }), prev));
      // A post whose cover still points at a file on some phone (an upload
      // that never finished) gets a fresh cover from its hosted video.
      for (const post of data.posts) {
        if (post.authorId !== me || !isLocalMedia(post.thumbnailUrl) || !post.videoUrl || isLocalMedia(post.videoUrl)) continue;
        (async () => {
          try {
            const frame = (await framesAt(post.videoUrl!, [post.trimStart ?? 0], 1080))[0]?.uri;
            if (!frame) return;
            const hosted = await uploadMedia(me, frame, 'photo', undefined, { smallCover: true });
            await remote.updatePostThumbnail(post.id, hosted);
            setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === post.id ? { ...p, thumbnailUrl: hosted } : p)) }));
          } catch (error) { console.warn('[remote] cover repair failed', error); }
        })();
      }
      if (data.users.find((u) => u.id === me)?.suspended) {
        showToast({ title: 'Your account is suspended', body: 'You can still look around, but you cannot post, comment, reply or message.', icon: 'alert-circle-outline' });
      }
      // Then, without holding up the open: whom the people you follow follow,
      // so search can say "2 mutual" without the app downloading every follow.
      void remote.fetchFollowEdges(data.followingIds, false).then(mergeFollowEdges);
      // What you have reported stays out of sight on every device.
      void remote.fetchMyReported().then((ids) => { if (ids.length) setState((prev) => ({ ...prev, reportedIds: [...new Set([...prev.reportedIds, ...ids])] })); }).catch(() => undefined);
      // Now the profile is known, the saved login gets its name and picture.
      const who = data.users.find((u) => u.id === me);
      if (who) rememberAccount({ id: me, handle: who.handle, name: who.name, avatarUrl: who.avatarUrl }).then((savedAccounts) => setState(withAccounts(savedAccounts)));
      return true;
    } catch (err) {
      // A later load that fails (a pull-to-refresh on a weak signal) leaves a
      // working session exactly as it was: what is on screen stays, the live
      // updates keep running, and the next pull simply tries again. Marking
      // it "not loaded" here used to turn every later pull into a no-op.
      if (stateRef.current.remoteLoaded && stateRef.current.currentUserId === me) return false;
      // The account is signed in even if its data did not come down — usually
      // a token that expired while the tab slept and had not refreshed yet.
      // Stand in for the profile so the screens render, and the auth
      // listener retries the load once the token refreshes.
      setState((prev) => {
        const handle = (email ?? 'player').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '') || 'player';
        const users = prev.users.some((u) => u.id === me) ? prev.users : [{
          id: me, handle, name: handle, bio: '', location: '', joinedAt: new Date().toISOString(), avatarSeed: me,
          isCoach: false, followers: 0, following: 0, profile: emptyProfile, achievementIds: [],
          stats: { sessionsLogged: 0, matchesPlayed: 0, matchesWon: 0, hoursOnCourt: 0, currentStreakDays: 0, longestStreakDays: 0 },
        }, ...prev.users];
        // The demo's invented people and coaches never stand in for a real account's data, even when that data failed to load.
        return dropFixtures({ ...prev, users, currentUserId: me, authResolved: true, remoteLoaded: false, error: err instanceof Error ? err.message : 'Could not load your account.' });
      });
      // Opened on the saved copy with no connection: say so, rather than an error page.
      if (stateRef.current.snapshotShown) showToast({ title: 'Can’t refresh right now', body: 'Showing what you saw last. It updates once the connection is back.', icon: 'cloud-offline-outline' });
      return false;
    }
  }, []);
  // One load at a time per account at sign-in: an ask while one is running
  // gets that one's answer. At an open, the saved login is checked
  // (getSession) while the sign-in listener hears about it too (SIGNED_IN, or
  // TOKEN_REFRESHED when the login was renewed on the way in, as on a cold
  // open an hour or more after the last), and each fetched everything: the
  // whole opening load twice over the phone's connection, every screen redrawn
  // twice, and a broken cover repaired twice. Signing in did the same (the
  // sign-in itself and the listener). Those asks all come within a moment of
  // each other; a load older than that may be stuck on a dead connection, so
  // a later ask starts its own (coming back to the app after an offline open,
  // say). Someone asking to try again (a pull, Try again) always starts a
  // fresh one (`fresh`), as before.
  const loading = useRef<{ me: ID; run: Promise<boolean>; at: number } | null>(null);
  const loadRemote = useCallback((me: ID, email?: string | null, fresh = false): Promise<boolean> => {
    const running = loading.current;
    if (!fresh && running?.me === me && Date.now() - running.at < 5000) return running.run;
    const run: Promise<boolean> = fetchAndMerge(me, email).finally(() => { if (loading.current?.run === run) loading.current = null; });
    loading.current = { me, run, at: Date.now() };
    return run;
  }, [fetchAndMerge]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const remembered = listSavedAccounts();
    // The saved copy is read from the phone while the login is still being
    // checked, rather than only after: the two waits overlap. (The copy still
    // goes up once the check is done, which on an expired login means after
    // its renewal trip to the server.) The newest remembered login is the one
    // being checked almost every time; its copy is only used if it is.
    const earlyCopy = remembered
      .then((list) => list[0]?.id)
      .then((id) => (id ? Promise.all([snapshotFailedBefore(id), readSnapshot(id)]).then(([failed, copy]) => ({ id, failed, copy })) : null))
      .catch(() => null);
    // Instagram-style (Oct 6, owner: "on the loading screen too long"): when the login kept on this
    // device is the account the newest saved copy belongs to, the copy goes up at once, without
    // waiting for the login check, which after an hour away is a trip to the server to renew it.
    // The check still decides: no login after all, and the app signs out as it always would.
    // Not on the way back from a sign-in page (a ?code= or #access_token= on the address).
    let checked = false;
    let shownEarly: ID | null = null;
    const signingIn = Platform.OS === 'web' && /[?&#](code|access_token)=/.test(`${window.location.search}${window.location.hash}`);
    if (!signingIn) {
      void Promise.all([earlyCopy, storedLoginId()]).then(([early, kept]) => {
        if (cancelled || checked || !early || early.failed || !early.copy || early.id !== kept) return;
        shownEarly = early.id;
        showSnapshot(early.id, early.copy);
        void markSnapshotOpening(early.id);
        setTimeout(() => { void markSnapshotOpened(early.id); }, 8000);
      });
    }
    supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      checked = true;
      // Opened on the copy, and the check could not reach the server to renew the login (no signal at the
      // courts, an hour or more after the last open): the login is still kept on the phone, so this is not
      // a sign-out. The copy stays up, saying so, and the account loads once the login renews (the
      // listener's TOKEN_REFRESHED, below) or the app comes back to the front. Signing out here used to
      // flash your feed and then drop you on the sign-in page.
      if (shownEarly && !data.session && error && isAuthRetryableFetchError(error)) {
        setState((prev) => ({ ...prev, authResolved: true }));
        showToast({ title: 'Can’t refresh right now', body: 'Showing what you saw last. It updates once the connection is back.', icon: 'cloud-offline-outline' });
        return;
      }
      // Opened on the copy, and the login turned out not to be that account's after all: signed out, as before.
      if (shownEarly && data.session?.user.id !== shownEarly) {
        snapshotIds.current = null;
        setState((prev) => ({ ...signedOut(prev), snapshotShown: false }));
        shownEarly = null;
      }
      if (data.session) {
        // Known to be signed in: let the app open now and merge the feed in
        // when it lands, instead of holding the splash for the whole fetch.
        const me = data.session.user.id;
        setState((prev) => ({ ...prev, currentUserId: prev.currentUserId ?? me, authResolved: true, termsVersion: termsOf(data.session.user) }));
        // Last time's copy goes up straight after the logo, the fresh load lands on top of it.
        void (async () => {
          // Already up, before the check (above).
          if (shownEarly === me) return;
          const early = await earlyCopy;
          // Whether the last open on it got through, and the copy itself: read together.
          const [failed, snapshot] = early?.id === me ? [early.failed, early.copy] : await Promise.all([snapshotFailedBefore(me), readSnapshot(me)]);
          // The last open on the saved copy never finished: throw it away and open the old way.
          if (failed) { await clearSnapshot(me); await markSnapshotOpened(me); return; }
          if (!snapshot || cancelled) return;
          await markSnapshotOpening(me);
          showSnapshot(me, snapshot);
          setTimeout(() => { void markSnapshotOpened(me); }, 8000);
        })();
        loadRemote(me, data.session.user.email);
      } else setState((prev) => ({ ...prev, authResolved: true }));
    }).catch(() => setState((prev) => ({ ...prev, authResolved: true })));
    remembered.then((savedAccounts) => { if (!cancelled) setState(withAccounts(savedAccounts)); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Every fresh session (and every rotated token) is kept, so this login
      // can be picked again later without a password.
      if (session?.refresh_token) {
        rememberAccount({ id: session.user.id, email: session.user.email ?? undefined, refreshToken: session.refresh_token })
          .then((savedAccounts) => { if (!cancelled) setState(withAccounts(savedAccounts)); });
      }
      // The terms travel on the account, so every new look at it (signing in,
      // switching accounts, agreeing just now) carries the current answer.
      // The same answer again (every hourly token refresh) changes nothing.
      if (session) { const terms = termsOf(session.user); setState((prev) => (prev.termsVersion === terms ? prev : { ...prev, termsVersion: terms })); }
      if (event === 'SIGNED_IN' && session) loadRemote(session.user.id, session.user.email);
      // A refreshed token after a failed first load: try again with the new
      // one. A load already running shares its answer (see loadRemote); if
      // that one could not finish, one more try with the new token.
      if (event === 'TOKEN_REFRESHED' && session && !stateRef.current.remoteLoaded) {
        const { id, email } = session.user;
        void loadRemote(id, email).then((ok) => { if (!ok && !cancelled && !stateRef.current.remoteLoaded && stateRef.current.currentUserId === id) void loadRemote(id, email); });
      }
      if (event === 'SIGNED_OUT') {
        // Truly signed out (the session was ended, here or from another phone): this
        // iPhone's own "Workout detected" alerts stop too (build 15, workoutWatch).
        void stopWorkoutWatch();
        setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false, termsVersion: undefined, ...freshAccountSettings() }));
      }
    });
    // Tokens only refresh while the app is in front.
    const sub = DeviceState.addEventListener('change', (status) => {
      const s = stateRef.current;
      // Leaving the app: keep a copy of what is on screen for the next open.
      if (status !== 'active' && s.remoteLoaded && s.currentUserId && UUID.test(s.currentUserId)) void saveSnapshot(s.currentUserId, snapshotOf(s, s.currentUserId));
      // Back, after opening offline on the saved copy: try the real load again.
      if (status === 'active' && s.currentUserId && s.snapshotShown && !s.remoteLoaded) void loadRemote(s.currentUserId);
      if (Platform.OS === 'web') return;
      if (status === 'active') supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      sub.remove();
    };
  }, [loadRemote, showSnapshot]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );

  // Keep a ref so async actions read fresh state without re-creating callbacks.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  /** Unpaid bookings already re-checked with Stripe this run (see refreshCoaching). */
  const askedAboutPayment = useRef<Set<ID>>(new Set());

  /*
   * What the server says about people and posts (migration 64). Nobody's age
   * but your own reaches the app any more, so two things are asked:
   * open_to_you (may you message this person) and shown_at_court (may this
   * post show on a court's page). Only about what a screen is about to show
   * or act on (never everyone at once), a few at a time, and kept for this
   * session and account. Until an answer comes the careful one stands
   * (locked, not shown), the same as an account with no birthday on file.
   * The server sends only the open hits you may see, so hits need no asking.
   */
  type Book = { me: ID | null; at: Map<ID, number> };
  const opennessAsked = useRef<Book>({ me: null, at: new Map() });
  const opennessQueue = useRef<Set<ID>>(new Set());
  const opennessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const courtAsked = useRef<Book>({ me: null, at: new Map() });
  const courtQueue = useRef<Set<ID>>(new Set());
  const courtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A new account: nothing said about anyone yet.
  useEffect(() => {
    opennessAsked.current = { me: state.currentUserId, at: new Map() };
    opennessQueue.current.clear();
    courtAsked.current = { me: state.currentUserId, at: new Map() };
    courtQueue.current.clear();
    setState((prev) => (!Object.keys(prev.openness).length && !Object.keys(prev.courtShown).length ? prev : { ...prev, openness: {}, courtShown: {} }));
  }, [state.currentUserId]);
  /** Of these ids, the ones not asked about lately (all with `fresh`), marked as asked now. */
  const dueFrom = (book: Book, me: ID, ids: ID[], fresh: boolean): ID[] => {
    if (book.me !== me) { book.me = me; book.at = new Map(); }
    const now = Date.now();
    const due = Array.from(new Set(ids)).filter((id) => id !== me && live(id) && (fresh || !(now - (book.at.get(id) ?? -Infinity) < OPENNESS_KEPT)));
    for (const id of due) book.at.set(id, now);
    return due;
  };
  /** After a question that got no answer (no connection): asked again a little later, not on every redraw. */
  const retrySoon = (book: Book, ids: ID[]) => { const now = Date.now(); for (const id of ids) book.at.set(id, now - OPENNESS_KEPT + OPENNESS_RETRY); };
  /**
   * Asks the server about these people (all of them with `fresh`, otherwise
   * only those not asked in the last few minutes) and keeps the answers.
   * Resolves with every answer the app now has. Nothing is asked before the
   * first load has said this is a database with migration 64.
   */
  const askOpenness = useCallback(async (userIds: ID[], fresh = false): Promise<OpennessMap> => {
    const s0 = stateRef.current;
    const me = s0.currentUserId;
    if (!me || !live(me) || s0.agesOnProfiles !== false) return s0.openness;
    const want = dueFrom(opennessAsked.current, me, userIds, fresh);
    if (!want.length) return s0.openness;
    let got: Record<ID, Openness> | null;
    try {
      got = await remote.fetchOpenness(want);
    } catch {
      retrySoon(opennessAsked.current, want);
      return stateRef.current.openness;
    }
    // Someone the server left out (blocked either way, gone, past the day's
    // limit; or no such question at all): no answer, so nothing is locked on
    // it and the server decides when you act.
    const answers: Record<ID, Openness> = Object.fromEntries(want.map((id) => [id, got?.[id] ?? { chat: null }]));
    if (stateRef.current.currentUserId !== me) return stateRef.current.openness;
    setState((prev) => (prev.currentUserId === me ? { ...prev, openness: { ...prev.openness, ...answers } } : prev));
    return { ...stateRef.current.openness, ...answers };
  }, []);
  /** Someone a screen is showing: asked about a moment later, with whoever else came up meanwhile. Nothing if asked lately. */
  const wantOpenness = useCallback((userId: ID) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || userId === me || ageSource(s, userId) !== 'server') return;
    const book = opennessAsked.current;
    if (book.me === me && Date.now() - (book.at.get(userId) ?? -Infinity) < OPENNESS_KEPT) return;
    opennessQueue.current.add(userId);
    if (opennessTimer.current) return;
    opennessTimer.current = setTimeout(() => {
      opennessTimer.current = null;
      const ids = Array.from(opennessQueue.current);
      opennessQueue.current.clear();
      void askOpenness(ids);
    }, 40);
  }, [askOpenness]);
  /** Asks the server which of these posts may show on a court's page for you, and keeps the answers. */
  const askCourt = useCallback(async (postIds: ID[]) => {
    const s0 = stateRef.current;
    const me = s0.currentUserId;
    if (!me || !live(me) || s0.agesOnProfiles !== false) return;
    const want = dueFrom(courtAsked.current, me, postIds, false);
    if (!want.length) return;
    let got: Set<ID> | null;
    try {
      got = await remote.fetchShownAtCourt(want);
    } catch {
      retrySoon(courtAsked.current, want);
      return;
    }
    // No such question (a database without 64): nothing is shown on it until the next load says which database this is.
    if (got === null || stateRef.current.currentUserId !== me) return;
    const answers: Record<ID, boolean> = Object.fromEntries(want.map((id) => [id, got.has(id)]));
    setState((prev) => (prev.currentUserId === me ? { ...prev, courtShown: { ...prev.courtShown, ...answers } } : prev));
  }, []);
  /** A post a court's page is showing: asked about a moment later, with the rest of the page. */
  const wantCourt = useCallback((postId: ID) => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me, postId)) return;
    const book = courtAsked.current;
    if (book.me === me && Date.now() - (book.at.get(postId) ?? -Infinity) < OPENNESS_KEPT) return;
    courtQueue.current.add(postId);
    if (courtTimer.current) return;
    courtTimer.current = setTimeout(() => {
      courtTimer.current = null;
      const ids = Array.from(courtQueue.current);
      courtQueue.current.clear();
      void askCourt(ids);
    }, 40);
  }, [askCourt]);
  useEffect(() => () => {
    if (opennessTimer.current) clearTimeout(opennessTimer.current);
    if (courtTimer.current) clearTimeout(courtTimer.current);
  }, []);
  const seeing = useMemo(() => {
    const me = state.currentUserId;
    const agesOnProfiles = state.agesOnProfiles;
    return (u: Pick<User, 'id' | 'ageGroup'>): boolean => {
      if (me && u.id === me) return true;
      // Since 64 the server sent only the hits you may see; before it (and in the demo) the author's age says.
      return ageSource({ currentUserId: me, agesOnProfiles }, u.id) === 'server' || !notKnownAdult(u);
    };
  }, [state.currentUserId, state.agesOnProfiles]);
  const shownAtCourt = useMemo(() => {
    const me = state.currentUserId;
    const agesOnProfiles = state.agesOnProfiles;
    const told = state.courtShown;
    return (postId: ID, author: Pick<User, 'id' | 'ageGroup'>): boolean => {
      if (me && author.id === me) return true;
      if (ageSource({ currentUserId: me, agesOnProfiles }, author.id) !== 'server') return !notKnownAdult(author);
      if (!(postId in told)) wantCourt(postId);
      return told[postId] === true;
    };
  }, [state.currentUserId, state.agesOnProfiles, state.courtShown, wantCourt]);
  const ageSaysAdult = useMemo(() => {
    const me = state.currentUserId;
    const agesOnProfiles = state.agesOnProfiles;
    return (u: Pick<User, 'id' | 'ageGroup'>): boolean => (me !== null && u.id === me ? !notKnownAdult(u) : ageSource({ currentUserId: me, agesOnProfiles }, u.id) !== 'server' && !notKnownAdult(u));
  }, [state.currentUserId, state.agesOnProfiles]);

  // Your numbers come from what you logged and posted (features/practice/stats),
  // and a streak with nothing yet today gets its 7pm reminder on the phone.
  useEffect(() => {
    const me = state.currentUserId;
    if (!isSupabaseConfigured || !me || !UUID.test(me) || !(state.remoteLoaded || state.snapshotShown)) return;
    const stats = computeStats(me, state.sessions, state.posts, state.stories);
    const self = state.users.find((u) => u.id === me);
    if (self && JSON.stringify(self.stats) !== JSON.stringify(stats)) {
      setState((prev) => ({ ...prev, users: prev.users.map((u) => (u.id === me ? { ...u, stats } : u)) }));
    }
    if (!state.remoteLoaded) return;
    // Streak reminders off (Settings → Notifications): 0 takes away one already set.
    const t = setTimeout(() => { void planStreakReminder(state.prefs.pushStreak ? streakAtRisk(me, state.sessions, state.posts, state.stories) : 0); }, 1500);
    return () => clearTimeout(t);
  }, [state.currentUserId, state.sessions, state.posts, state.stories, state.users, state.remoteLoaded, state.snapshotShown, state.prefs.pushStreak]);

  // Your streak's number (never what is behind it) goes up for the flame
  // others see beside your name (migration 134): once the full load is in,
  // and again whenever logging, posting or deleting changes it. It is checked
  // against what the server holds as far as this phone knows: what the last
  // full load (or pull to refresh) brought down, then whatever each send that
  // went through put there. Skipped only when others would already see the
  // same: the same number and day, or no flame either way (under 3 days).
  // One send at a time. One that fails is tried again when the app comes
  // back to the front, or with the next change once a minute has passed; a
  // different number goes straight away.
  const streakHeld = useRef<{ me: ID; loaded: string; view: string } | null>(null);
  const streakWanted = useRef<{ me: ID; days: number; through: string | null } | null>(null);
  const streakSending = useRef(false);
  const streakFailed = useRef<{ view: string; at: number } | null>(null);
  const shareStreak = useCallback(async () => {
    if (streakSending.current) return; // the send in flight looks again when it lands
    streakSending.current = true;
    try {
      for (;;) {
        const want = streakWanted.current;
        const held = streakHeld.current;
        if (!want || !held || held.me !== want.me || stateRef.current.currentUserId !== want.me) return;
        const view = streakSeen(want);
        if (view === held.view) return;
        const failed = streakFailed.current;
        if (failed && failed.view === view && Date.now() - failed.at < 60_000) return;
        const ok = await remote.setMyStreak(want.days, want.through);
        if (!ok) {
          streakFailed.current = { view, at: Date.now() };
          // A newer number that came in meanwhile still gets its own try.
          const next = streakWanted.current;
          if (next && next.me === want.me && streakSeen(next) !== view) continue;
          return;
        }
        streakFailed.current = null;
        if (streakHeld.current?.me === want.me) streakHeld.current = { ...streakHeld.current, view };
      }
    } finally {
      streakSending.current = false;
    }
  }, []);
  useEffect(() => {
    const me = state.currentUserId;
    if (!isSupabaseConfigured || !me || !UUID.test(me) || !state.remoteLoaded) return;
    // A fresh load says what the server holds now (only a running streak of 3 or more comes down): start from that.
    const own = state.users.find((u) => u.id === me)?.streak;
    const loaded = own ? streakSeen(own) : '';
    if (streakHeld.current?.me !== me || streakHeld.current.loaded !== loaded) streakHeld.current = { me, loaded, view: loaded };
    streakWanted.current = { me, ...publicStreak(me, state.sessions, state.posts, state.stories) };
    void shareStreak();
  }, [state.currentUserId, state.sessions, state.posts, state.stories, state.users, state.remoteLoaded, shareStreak]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const sub = DeviceState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      streakFailed.current = null;
      void shareStreak();
    });
    return () => sub.remove();
  }, [shareStreak]);

  // Read from the ref, not from this render: an action started just before a
  // sign-in (sign-up's birthday, say) must see the account that now exists.
  const requireUser = useCallback((): ID => {
    const me = stateRef.current.currentUserId;
    if (!me) throw new Error('Not signed in');
    return me;
  }, []);

  /**
   * "Muted @sam · Undo", after a one-tap change that is easy to make by
   * accident (a mute, an unfollow, an unsave, an archive). Undo makes the same
   * change again, quietly, but only if nothing has moved since: the same
   * account still signed in, and the thing still the way this tap left it.
   * A late tap on an old toast then never undoes something done again
   * somewhere else in the meantime. Fired from inside each action, so every
   * screen that calls it gets the toast without doing anything.
   */
  const offerUndo = (title: string, stillAsLeft: () => boolean, undo: () => void, extra?: { body?: string; icon?: string }) => {
    const me = stateRef.current.currentUserId;
    toast.showUndo(title, () => { if (stateRef.current.currentUserId === me && stillAsLeft()) undo(); }, extra);
  };
  /** " @sam", for a toast's title; nothing if their account is not loaded. */
  const atHandle = (userId: ID) => {
    const handle = stateRef.current.users.find((u) => u.id === userId)?.handle;
    return handle ? ` @${handle}` : '';
  };

  const signIn = useCallback(async (identity: string, password?: string) => {
    if (isSupabaseConfigured && password !== undefined) {
      const session = await remoteAuth.signIn(identity, password);
      if (session) await loadRemote(session.user.id, session.user.email);
      return;
    }
    const user = await apiSignIn(identity);
    setState((prev) => ({
      ...prev,
      currentUserId: user.id,
      // The demo account arrives with a filled-in profile; treat that as onboarded.
      onboardingComplete: !!user.profile.onboardedAt || user.profile.goals.length > 0,
      error: null,
    }));
  }, [loadRemote]);

  useEffect(() => {
    if (!demoHandle) return;
    let live = true;
    signIn(demoHandle)
      .catch(() => { try { window.sessionStorage.removeItem('courtside-demo-as'); } catch {} })
      .finally(() => { if (live) setState((prev) => ({ ...prev, authResolved: true })); });
    return () => { live = false; };
  }, [signIn]);

  const signUp = useCallback(async (email: string, password: string, name: string, handle: string, birthDate?: string) => {
    const invitedBy = await peekReferrer().catch(() => null);
    const session = await remoteAuth.signUp(email, password, name, handle, birthDate, invitedBy);
    if (!session) return 'confirm' as const;
    // The birthday typed on the sign-up form is kept before the account
    // opens, so it is never asked for a second time.
    if (birthDate) {
      const answer = await remote.setBirthDate(birthDate).catch(() => null);
      if (answer === 'teen' || answer === 'adult') await rememberAnswered(session.user.id, answer);
      else if (answer === null) await rememberAnswered(session.user.id, groupFor(yearsOld(birthDate)));
    }
    await loadRemote(session.user.id, session.user.email);
    return 'session' as const;
  }, [loadRemote]);

  const signInWithGoogle = useCallback(async () => {
    const session = await remoteAuth.signInWithGoogle();
    // On the web the page has left for Google by now; the auth listener
    // finishes the job when it comes back.
    if (!session) return Platform.OS === 'web';
    await loadRemote(session.user.id, session.user.email);
    return true;
  }, [loadRemote]);

  const signInWithApple = useCallback(async () => {
    const session = await remoteAuth.signInWithApple();
    if (!session) return false;
    await loadRemote(session.user.id, session.user.email);
    return true;
  }, [loadRemote]);

  const accountInfo = useCallback(async () => (isSupabaseConfigured ? remoteAuth.account() : null), []);
  const changePassword = useCallback((password: string) => remoteAuth.updatePassword(password), []);
  const acceptTerms = useCallback(async () => {
    await remoteAuth.acceptTerms();
    setState((prev) => ({ ...prev, termsVersion: TERMS_VERSION }));
  }, []);
  const changeEmail = useCallback((email: string) => remoteAuth.updateEmail(email), []);
  const linkGoogle = useCallback(() => remoteAuth.linkGoogle(), []);
  const signOutEverywhere = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    void forgetLinkPreviews();
    if (isSupabaseConfigured) {
      // This phone stops getting the account's alerts while the session can still take its address off (as Log out does).
      await forgetPushToken();
      try { await remoteAuth.signOutEverywhere(); } catch (err) { void registerForPush(); throw err; }
    }
    // Nor this iPhone's own "Workout detected" alerts (build 15, workoutWatch).
    void stopWorkoutWatch();
    // Everywhere includes this device: the remembered login is gone too.
    const savedAccounts = me ? await forgetAccount(me) : stateRef.current.savedAccounts;
    // Nothing of the account stays on the device (see signOut), its saved copy included.
    setState((prev) => ({ ...signedOut(prev), savedAccounts }));
    if (me) void clearSnapshot(me);
  }, []);

  const switchAccount = useCallback(async (id: ID) => {
    const saved = stateRef.current.savedAccounts.find((a) => a.id === id);
    if (!saved) throw new Error('That account is not saved on this device.');
    let session;
    try {
      // The renewed login is saved the moment it exists, so a dropped connection after it can't leave a spent one in the list.
      session = await remoteAuth.resumeAccount(saved.refreshToken, (renewed) => rememberAccount({ id: renewed.userId, email: renewed.email, refreshToken: renewed.refreshToken }).then((savedAccounts) => setState((prev) => ({ ...prev, savedAccounts }))));
    } catch (err) {
      // Only a login that has really expired leaves the list; a dropped
      // connection leaves it there to try again (and you as you were).
      if ((err as { expired?: boolean } | null)?.expired) {
        const savedAccounts = await forgetAccount(id);
        setState((prev) => ({ ...prev, savedAccounts }));
      }
      throw err;
    }
    // One account's chat link cards never show for the next.
    void forgetLinkPreviews();
    setState((prev) => ({ ...prev, currentUserId: session.user.id, remoteLoaded: false, onboardingComplete: false, error: null, detectedActivities: [], sessionTags: [], ...freshAccountSettings() }));
    await loadRemote(session.user.id, session.user.email);
  }, [loadRemote]);

  const forgetSavedAccount = useCallback(async (id: ID) => {
    const savedAccounts = await forgetAccount(id);
    setState((prev) => ({ ...prev, savedAccounts }));
  }, []);
  const deleteAccount = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    void forgetLinkPreviews();
    // An account made with Apple: Apple's sheet confirms once more, so the server can revoke
    // the Sign in with Apple link too (best effort: closing the sheet still deletes the account).
    if (isSupabaseConfigured) await remoteAuth.deleteAccount(await remoteAuth.appleCodeForDelete());
    // Nor this iPhone's own "Workout detected" alerts for it (build 15, workoutWatch).
    void stopWorkoutWatch();
    // A deleted account has no business in the remembered-logins list.
    const savedAccounts = me ? await forgetAccount(me) : stateRef.current.savedAccounts;
    // Nor anything of it on the device (see signOut), its saved copy included.
    setState((prev) => ({ ...signedOut(prev), savedAccounts }));
    if (me) void clearSnapshot(me);
  }, []);
  const retryLoad = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me || !isSupabaseConfigured) return;
    setState((prev) => ({ ...prev, error: null }));
    const { data } = await supabase!.auth.getSession();
    await loadRemote(me, data.session?.user.email, true);
  }, [loadRemote]);
  /** Emails a link that signs the person in so they can set a new password. */
  const requestPasswordReset = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) return;
    await remoteAuth.requestPasswordReset(email);
  }, []);
  const exportData = useCallback(() => {
    const s = stateRef.current;
    const me = s.currentUserId;
    return {
      exportedAt: new Date().toISOString(),
      profile: s.users.find((u) => u.id === me) ?? null,
      posts: s.posts.filter((p) => p.authorId === me),
      comments: s.comments.filter((c) => c.authorId === me),
      questions: s.questions.filter((q) => q.authorId === me),
      answers: s.answers.filter((a) => a.authorId === me),
      hits: s.stories.filter((st) => st.authorId === me),
      following: s.followingIds,
      saved: s.saved,
      messages: s.messages.filter((m) => s.conversations.some((c) => c.id === m.conversationId && me && c.participantIds.includes(me))),
      coachingRequests: s.coachingRequests.filter((r) => r.userId === me),
      integrations: s.integrations.filter((i) => i.connected).map((i) => i.provider),
      // Courts: the ones you follow, and what you said about any (only those loaded on this device).
      followedCourts: (s.followedCourts ?? []).map((c) => ({ courtId: c.courtId, name: c.name, followedAt: c.followedAt })),
      courtReviews: Object.values(s.myCourtReviews),
    };
  }, []);

  const signOut = useCallback((options: { keepLogin?: boolean } = {}) => {
    // Nothing of this account stays on the device for the next person.
    const leaving = stateRef.current.currentUserId;
    if (leaving) void clearSnapshot(leaving);
    // Nor the cards of the links in its chats.
    void forgetLinkPreviews();
    // A computer can be shared: in a browser, Log out also forgets this login
    // here and ends it on the server, so the next person at the computer
    // cannot pick it from "Welcome back" with a tap. Add account keeps it
    // (keepLogin), so switching back stays a tap; a phone keeps its logins
    // in its keychain, as before.
    const endLogin = Platform.OS === 'web' && !options.keepLogin && !!leaving;
    // This phone stops getting the account's alerts before the session ends (the removal needs it).
    if (isSupabaseConfigured) void forgetPushToken().finally(() => (endLogin ? remoteAuth.endSession() : remoteAuth.signOut()));
    if (endLogin && leaving) void forgetAccount(leaving).catch(() => undefined);
    // Nor this iPhone's own "Workout detected" alerts (build 15, workoutWatch): only signing out
    // stops them, never an open that merely could not read the session (useWorkoutWatch).
    void stopWorkoutWatch();
    // One account's health, courts and settings never carry over to the next one signed in.
    setState((prev) => {
      const next = signedOut(prev);
      return endLogin ? { ...next, savedAccounts: prev.savedAccounts.filter((a) => a.id !== leaving) } : next;
    });
  }, []);

  const patchCurrentUser = useCallback(
    (updater: (user: User) => User) => {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === prev.currentUserId ? updater(u) : u)),
      }));
    },
    [],
  );

  const completeOnboarding = useCallback(
    (input: PlayerProfile) => {
      // Stamped and saved with the account, so no device asks again.
      const profile: PlayerProfile = { ...input, onboardedAt: input.onboardedAt ?? new Date().toISOString() };
      patchCurrentUser((u) => ({ ...u, profile }));
      setState((prev) => ({ ...prev, onboardingComplete: true }));
      const me = stateRef.current.currentUserId;
      if (live(me)) remote.updateProfile(me!, { profile });
    },
    [patchCurrentUser],
  );

  const updateIdentity = useCallback((patch: Partial<Pick<User, 'name' | 'bio' | 'location'>> & { avatarUrl?: string; cityAt?: { lat: number; lng: number } | null }) => {
    const self = stateRef.current.users.find((u) => u.id === stateRef.current.currentUserId);
    const before = self?.avatarUrl;
    // Words refused (migration 117): your name, bio and town go back to what they were (the toast says why).
    const putBack = (r: 'ok' | 'blocked' | 'failed') => {
      if (r !== 'blocked' || !self) return;
      patchCurrentUser((u) => ({ ...u, name: patch.name !== undefined && u.name === patch.name ? self.name : u.name, bio: patch.bio !== undefined && u.bio === patch.bio ? self.bio : u.bio, location: patch.location !== undefined && u.location === patch.location ? self.location : u.location }));
    };
    patchCurrentUser(u => ({ ...u, ...patch, cityAt: patch.cityAt === null ? undefined : patch.cityAt ?? u.cityAt }));
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    (async () => {
      let avatarUrl = patch.avatarUrl;
      if (isLocalMedia(patch.avatarUrl)) {
        // Any words in the same change go now, and the photo on its own once it is up: a slow
        // upload never carries older words over newer ones saved meanwhile (Save changes).
        const { avatarUrl: _photo, ...rest } = patch;
        if (Object.values(rest).some((v) => v !== undefined)) void remote.saveProfile(me!, rest).then(putBack, () => undefined);
        // A new photo is shown at once but only exists on this phone until it uploads. If the
        // upload fails, say so and put the old photo back: before, the failure was silent, the
        // owner kept seeing the new photo and everyone else saw their initials.
        // Counted as an upload, so an update never restarts the app halfway through it.
        const release = holdQuietUpload();
        try {
          avatarUrl = await uploadMedia(me!, patch.avatarUrl!, 'photo');
        } catch (err) {
          release();
          void reportError(err, { where: 'avatar upload' });
          patchCurrentUser(u => ({ ...u, avatarUrl: before }));
          showToast({ title: 'Couldn’t save your photo', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' });
          return;
        }
        release();
        if (avatarUrl && avatarUrl !== patch.avatarUrl) patchCurrentUser(u => ({ ...u, avatarUrl }));
        showToast({ title: 'Profile photo updated', icon: 'checkmark-circle-outline' });
        await remote.updateProfile(me!, { avatarUrl });
        return;
      }
      putBack(await remote.saveProfile(me!, patch));
    })();
  }, [patchCurrentUser]);
  const checkHandle = useCallback(async (raw: string): Promise<HandleStatus | null> => {
    const wanted = raw.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(wanted)) return 'invalid';
    const me = stateRef.current.currentUserId;
    if (live(me)) return remote.handleStatus(wanted);
    // The demo: free unless someone in it already has it.
    const owner = stateRef.current.users.find((u) => u.handle.toLowerCase() === wanted);
    return !owner ? 'ok' : owner.id === me ? 'yours' : 'taken';
  }, []);
  const changeHandle = useCallback(async (raw: string) => {
    const me = requireUser();
    const wanted = raw.trim().toLowerCase();
    const self = stateRef.current.users.find((u) => u.id === me);
    if (!self || self.handle === wanted) return;
    if (!live(me)) {
      // The demo keeps the same rules the database does.
      if (!/^[a-z0-9_]{3,24}$/.test(wanted)) throw new Error('Use 3 to 24 letters, numbers or underscores.');
      const since = self.handleChangedAt ? Date.now() - Date.parse(self.handleChangedAt) : Infinity;
      if (since < 30 * 86400000) throw new Error('You can change your handle once every 30 days.');
      if (stateRef.current.users.some((u) => u.id !== me && u.handle.toLowerCase() === wanted)) throw new Error(`@${wanted} is taken.`);
    }
    const saved = live(me) ? await remote.changeHandle(wanted) : wanted;
    haptics.commit();
    patchCurrentUser((u) => ({ ...u, handle: saved, handleChangedAt: new Date().toISOString() }));
    rememberAccount({ id: me, handle: saved }).then((savedAccounts) => setState((prev) => ({ ...prev, savedAccounts })));
  }, [requireUser, patchCurrentUser]);
  const setReadReceiptsEnabled = useCallback((enabled: boolean) => {
    const me = requireUser();
    saveReceiptPreference(me, enabled);
    patchCurrentUser(user => ({...user, readReceiptsEnabled: enabled}));
    // Kept with the account, so the people you chat with see the change too.
    if (live(me)) void remote.updateProfile(me, { readReceipts: enabled });
  }, [requireUser, patchCurrentUser]);

  const updateProfile = useCallback(
    (patch: Partial<PlayerProfile>) => {
      patchCurrentUser((u) => ({ ...u, profile: { ...u.profile, ...patch } }));
      const me = stateRef.current.currentUserId;
      const self = stateRef.current.users.find((u) => u.id === me);
      if (live(me) && self) remote.updateProfile(me!, { profile: { ...self.profile, ...patch } });
    },
    [patchCurrentUser],
  );

  const logSession = useCallback(async (input: { minutes: number; kind: PracticeSession['kind']; won?: boolean; sets?: MatchSet[]; opponent?: string; note?: string; day?: string; activityId?: ID; workout?: string; courtId?: string }) => {
    const me = requireUser();
    // A score (migration 91), on any tennis session since Oct 6: on a match the result follows the sets when one side took more, as the server makes it.
    const sets = canScore(input.kind) && input.sets?.length ? input.sets.slice(0, 5) : undefined;
    const session: PracticeSession = {
      id: nextId('ses'), userId: me, day: input.day ?? localDay(new Date()), minutes: input.minutes, kind: input.kind,
      won: input.kind === 'match' ? setsWinner(sets) ?? input.won : undefined, ...(sets ? { sets } : {}),
      // Within what the database keeps (60 characters, migration 39): a longer name never saved.
      opponent: input.opponent?.trim().slice(0, OPPONENT_MAX).trim() || undefined, note: input.note?.trim() || undefined,
      ...(input.activityId ? { activityId: input.activityId } : {}),
      // What a fitness session logged from a workout was ('run', migration 107).
      ...(input.kind === 'fitness' && input.workout ? { workout: input.workout } : {}),
      // Where it was played (migration 130): the map's id for the court, private like the rest of your log.
      ...(isMapCourtId(input.courtId) ? { courtId: input.courtId } : {}),
      createdAt: new Date().toISOString(),
    };
    // A tracker session logged here counts as logged straight away (the database marks it too, migration 58).
    const had = input.activityId ? stateRef.current.detectedActivities.find((a) => a.id === input.activityId) : undefined;
    const markActivity = (prev: AppState, patch: Pick<DetectedActivity, 'status' | 'sessionId'>) =>
      (had ? prev.detectedActivities.map((a) => (a.id === had.id ? { ...a, ...patch } : a)) : prev.detectedActivities);
    haptics.commit();
    // A tracker's session already on a post of yours: the post now says what the log says
    // (the server does the same, migration 65; this is the copy on this phone meanwhile).
    const before = stateRef.current.posts;
    setState((prev) => ({ ...prev, sessions: [session, ...prev.sessions], detectedActivities: markActivity(prev, { status: 'logged', sessionId: session.id }), posts: input.activityId ? postsFollowLog(prev.posts, me, input.activityId, session) : prev.posts }));
    if (!live(me)) return session.id;
    let saved: { scoreDropped: boolean };
    try { saved = await remote.insertSession(session); } catch (e) {
      setState((prev) => ({ ...prev, sessions: prev.sessions.filter((x) => x.id !== session.id), detectedActivities: markActivity(prev, { status: had?.status ?? 'new', sessionId: had?.sessionId }), posts: prev.posts.map((p) => (input.activityId && p.authorId === me && p.session?.activityId === input.activityId ? before.find((b) => b.id === p.id) ?? p : p)) }));
      throw e;
    }
    if (saved.scoreDropped) {
      // Saved, but the server didn't keep the score (a practice's, before migration 136): it comes off
      // here too, so it never shows as saved, and the "Logged" note says so once (showLogged).
      const { sets: _dropped, ...plain } = session;
      setState((prev) => ({ ...prev, sessions: prev.sessions.map((x) => (x.id === session.id ? plain : x)), posts: input.activityId ? postsFollowLog(prev.posts, me, input.activityId, plain) : prev.posts }));
      scoreNotKept(session.id);
    }
    return session.id;
  }, [requireUser]);

  const deleteSession = useCallback((id: ID) => {
    const me = stateRef.current.currentUserId;
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((x) => x.id !== id),
      // A tracker's post goes back to "Tennis"; one logged by hand keeps what it said (migration 65).
      posts: me ? postsFollowLog(prev.posts, me, null, null, id) : prev.posts,
      // A tracker session it was logged from is waiting to be logged again, as the database puts it back (migration 58).
      detectedActivities: prev.detectedActivities.map((a) => (a.sessionId === id && a.status === 'logged' ? { ...a, status: 'new', sessionId: undefined } : a)),
      // Its tags go with it (the database deletes them too, migration 62); a copy of someone else's session only loses its link.
      sessionTags: prev.sessionTags
        .filter((t) => !(t.sessionId === id && t.taggerId === me))
        .map((t) => (t.mirroredSessionId === id ? { ...t, mirroredSessionId: undefined } : t)),
    }));
    if (live(me)) void remote.deleteSession(id);
  }, []);

  // What the map's two kinds of load last brought (migration 63 answers for
  // one part of the map at a time): round where you are, which Find Players,
  // Near you and Who's up today read, and the part of the full map in view.
  // The map shows both; a new load of a kind replaces only its own. Since
  // migration 98 every load also carries all your friends who follow each
  // other with you, wherever they are (so a load of either kind keeps them),
  // and the server sends anyone else only near your own shared spot.
  const seenAround = useRef<Record<ID, LastSeen>>({});
  const seenInView = useRef<Record<ID, LastSeen>>({});
  const seenFor = useRef<ID | null>(null);
  // Goes up once the server has forgotten your spot (Location off): a load
  // asked for before then may still carry strangers near it, and is dropped.
  const spotGen = useRef(0);
  // Each view asked for gets the next number: only the newest view's answer is kept,
  // so a slow answer for where the map was cannot replace the one for where it is.
  const viewSeq = useRef(0);
  /**
   * The distances for the rings just loaded (migration 120), laid on in the
   * background so the pins never wait for them. Each lands only on a ring
   * still open until the same time it was asked about; a failed ask keeps
   * what was known.
   */
  const addOpenMiles = useCallback(async (loaded: Record<ID, LastSeen>, me: ID) => {
    const now = Date.now();
    const asked = new Map(Object.values(loaded).filter((r) => r.userId !== me && !!r.openUntil && Date.parse(r.openUntil) > now).map((r) => [r.userId, r.openUntil]));
    if (!asked.size) return;
    const miles = await remote.fetchOpenToHitMiles([...asked.keys()]);
    if (!miles || stateRef.current.currentUserId !== me) return;
    const withMiles = (rec: Record<ID, LastSeen>) => {
      let changed = false;
      const out = { ...rec };
      for (const [id, until] of asked) {
        const r = out[id];
        if (!r || r.openUntil !== until || r.openMiles === miles[id]) continue;
        const { openMiles: _was, ...rest } = r;
        out[id] = miles[id] ? { ...rest, openMiles: miles[id] } : rest;
        changed = true;
      }
      return changed ? out : rec;
    };
    const around = withMiles(seenAround.current);
    const inView = withMiles(seenInView.current);
    if (around === seenAround.current && inView === seenInView.current) return;
    seenAround.current = around;
    seenInView.current = inView;
    const merged = { ...around, ...inView };
    const fresh = Object.fromEntries([...asked.keys()].filter((id) => merged[id]).map((id) => [id, merged[id]]));
    setState((prev) => ({ ...prev, lastSeen: merged, users: withMapRings(prev.users, merged, me, fresh) }));
  }, []);
  const loadLastSeen = useCallback(async (view?: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return true;
    if (seenFor.current !== me) { seenFor.current = me; seenAround.current = {}; seenInView.current = {}; }
    // Location off that never reached the server: try the forget again first. Until it
    // goes through, your own row stays off your map, as the switch says.
    let stillShown = false;
    if (!stateRef.current.locationEnabled && (await readForgetPending()) === me) {
      if (await remote.forgetLastSeen().catch(() => false)) {
        writeForgetPending(null);
        spotGen.current += 1;
        seenInView.current = Object.fromEntries(Object.entries(seenInView.current).filter(([, r]) => r.mutual));
      } else stillShown = true;
      if (stateRef.current.currentUserId !== me) return false;
    }
    const gen = spotGen.current;
    const seq = view ? ++viewSeq.current : 0;
    // The map's own function first (migration 63): each pin where you may see
    // it. A database without it yet answers 'missing', and the map reads the
    // old table (everyone about a kilometre out) the way it always has.
    let rows: LastSeen[] | null = null;
    let mapLive = stateRef.current.mapLive;
    if (mapLive !== false) {
      // Round you: about 80 km each way (the tray lists people up to 50
      // miles out), from the phone's fix or else your own last spot, or else
      // (Oct 5) the city on your profile: a new player with Location off had
      // no spot at all, so the server answered only for them and their
      // friends, and a town with a dozen players on the map read "You're
      // early here". The server's own rules decide who comes back (since
      // migration 105 any part of the map shows its adults to an adult, the
      // way panning the full map there does; a teen only ever sees friends
      // who follow each other with them). Without any of the three, it
      // answers only for you and your friends, which still says whether it is there.
      const s = stateRef.current;
      const self = s.users.find((u) => u.id === me);
      const town = self?.cityAt ?? (self?.location ? placeFor(self.location) : undefined);
      const from = s.detectedCoords ?? (s.lastSeen[me!] ? { lat: s.lastSeen[me!].lat, lng: s.lastSeen[me!].lng } : null) ?? (town ? { lat: town.lat, lng: town.lng } : null);
      const around = from ? { minLat: from.lat - 0.75, maxLat: from.lat + 0.75, minLng: from.lng - Math.min(1, 0.75 / Math.max(0.2, Math.cos((from.lat * Math.PI) / 180))), maxLng: from.lng + Math.min(1, 0.75 / Math.max(0.2, Math.cos((from.lat * Math.PI) / 180))) } : null;
      const got = await remote.fetchMapPlayers(view ?? around);
      if (got === 'missing') mapLive = false;
      else { if (got) mapLive = true; rows = got; }
    }
    if (mapLive === false) rows = await remote.fetchLastSeen();
    if (stateRef.current.currentUserId !== me || spotGen.current !== gen || (view && seq !== viewSeq.current)) return false;
    // Live, and the settings row said nothing (an account with no settings saved yet): never chosen.
    if (mapLive !== stateRef.current.mapLive || (mapLive && stateRef.current.mapVisibility === undefined && stateRef.current.remoteLoaded)) {
      setState((prev) => ({ ...prev, mapLive, mapVisibility: mapLive && prev.mapVisibility === undefined && prev.remoteLoaded ? null : prev.mapVisibility }));
    }
    // A failed load keeps what was there and is not "loaded": an error must
    // never read as nobody near you (the "You're early" card waits on this).
    if (!rows) return false;
    // How far each ring would like to go for a hit (migration 120) is asked after
    // the pins are up, never before; until it answers, a ring that has not
    // changed keeps the distance it had, so a card never blinks its line.
    const known = stateRef.current.lastSeen;
    const loaded = Object.fromEntries(rows.filter((r) => !(stillShown && r.userId === me)).map((r) => {
      const was = known[r.userId];
      return [r.userId, r.openUntil && was?.openMiles && was.openUntil === r.openUntil ? { ...r, openMiles: was.openMiles } : r];
    }));
    // The old table answers for everywhere at once: it replaces both.
    if (mapLive === false) { seenAround.current = loaded; seenInView.current = {}; }
    else if (view) seenInView.current = loaded;
    else seenAround.current = loaded;
    const merged = { ...seenAround.current, ...seenInView.current };
    setState((prev) => ({ ...prev, lastSeen: merged, lastSeenLoaded: true, users: withMapRings(prev.users, merged, me, mapLive === true ? loaded : null) }));
    if (mapLive === true && me) void addOpenMiles(loaded, me);
    return true;
  }, [addOpenMiles]);

  const setMapVisibility = useCallback(async (v: MapVisibility): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    const was = stateRef.current.mapVisibility;
    haptics.tap();
    setState((prev) => ({ ...prev, mapVisibility: v }));
    if (!live(me)) {
      // The demo keeps it in the browser, the way the server keeps it with the account.
      try { if (Platform.OS === 'web') localStorage.setItem(DEMO_VISIBILITY_KEY, v); } catch {}
      return true;
    }
    const ok = await remote.setMapVisibility(v);
    if (!ok && stateRef.current.currentUserId === me) setState((prev) => ({ ...prev, mapVisibility: was }));
    if (ok) {
      // Your spot again at once, so the choice takes effect now: the server
      // keeps your exact spot only for Players nearby or follow-back only.
      const s = stateRef.current;
      if (s.locationEnabled && s.detectedCoords) {
        markedAt.current = { lat: s.detectedCoords.lat, lng: s.detectedCoords.lng, at: Date.now() };
        await remote.markLastSeen(s.detectedCoords.lat, s.detectedCoords.lng, s.detectedLocation ?? undefined);
      }
      // Who you see does not change, but your own row's look does: fetch again.
      void loadLastSeen();
    }
    return ok;
  }, [loadLastSeen]);

  const loadTournamentPlans = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    const plans = await remote.fetchTournamentPlans().catch(() => undefined);
    if (!plans || stateRef.current.currentUserId !== me) return;
    // Your own come with your settings and your own edits: left as they are.
    const same = (a: TournamentEntry[], b: TournamentEntry[]) => JSON.stringify(a) === JSON.stringify(b);
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => {
        if (u.id === me) return u;
        const next = plans.get(u.id) ?? [];
        return same(u.profile.tournaments, next) ? u : { ...u, profile: { ...u.profile, tournaments: next } };
      }),
    }));
  }, []);

  const loadNewOnCourtside = useCallback(async () => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me) return;
    if (!live(me)) {
      setState((prev) => ({ ...prev, newOnCourtside: demoApi.newOnCourtside({ me, users: prev.users, followingIds: prev.followingIds, blockedIds: prev.blockedIds }) }));
      return;
    }
    if (s.mapLive === false) return;
    const rows = await remote.fetchNewOnCourtside(14);
    if (!rows || stateRef.current.currentUserId !== me) return;
    // (Every profile comes down with the app's first load, so each one listed is already on the phone.)
    setState((prev) => ({ ...prev, newOnCourtside: rows, mapLive: true }));
  }, []);

  const postHit = useCallback(async (input: Omit<HitRequest, 'id' | 'authorId' | 'createdAt' | 'joinedIds' | 'conversationId' | 'cancelled' | 'opensAt'>): Promise<ID> => {
    const me = requireUser();
    const { audience: chosen, includeGroups, invitedIds, ...rest } = input;
    // "Everyone" is the same as saying nothing, so a hit for everyone posts on a database without migration 76.
    const audience = chosen && chosen !== 'everyone' ? chosen : undefined;
    const invite = audience ? Array.from(new Set((invitedIds ?? []).filter((x) => x !== me))).slice(0, 20) : [];
    const now = new Date();
    const hit: HitRequest = {
      ...rest, id: nextId('hitreq'), authorId: me, createdAt: now.toISOString(), joinedIds: [],
      // When it opens is the server's; the same rule here, so the card can say so straight away.
      ...(audience ? { audience, includeGroups: !!includeGroups, invitedIds: invite, ...(audience === 'invite_first' ? { opensAt: opensAtFor(rest.startsAt, now.getTime()) } : {}) } : {}),
    };
    haptics.commit();
    setState((prev) => ({ ...prev, hitRequests: [...prev.hitRequests, hit].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
    if (live(me)) {
      try { await remote.insertHit(hit); } catch (e) {
        setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.filter((h) => h.id !== hit.id) }));
        throw e;
      }
      if (invite.length) {
        // Who the server took (never someone blocked, or a teen you don't follow both ways).
        const took = await remote.inviteToHit(hit.id, invite).catch(() => null);
        if (took) setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hit.id ? { ...h, invitedIds: took } : h)) }));
        else showToast({ title: 'Your hit is up, but the invites didn’t go', body: 'Only you can see it for now. Call it off and post it again.', icon: 'alert-circle-outline' });
      }
    }
    return hit.id;
  }, [requireUser]);

  const openHitNow = useCallback(async (hitId: ID) => {
    const me = requireUser();
    const had = stateRef.current.hitRequests.find((h) => h.id === hitId);
    if (!had || had.authorId !== me || had.audience !== 'invite_first') return;
    haptics.commit();
    const opened = { audience: undefined, opensAt: undefined };
    setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, ...opened } : h)) }));
    if (!live(me, hitId)) return;
    try { await remote.openHitNow(hitId); } catch (e) {
      setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, audience: had.audience, opensAt: had.opensAt } : h)) }));
      showToast({ title: e instanceof Error ? e.message : 'That didn’t go through. Try again.', icon: 'alert-circle-outline' });
    }
  }, [requireUser]);

  const joinHit = useCallback(async (hitId: ID) => {
    const me = requireUser();
    haptics.commit();
    setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId && !h.joinedIds.includes(me) ? { ...h, joinedIds: [...h.joinedIds, me] } : h)) }));
    if (!live(me, hitId)) {
      // The demo has no server to make the hit's chat, so it is made here the
      // way join_hit makes it (migrations 43 and 54): a group called
      // "Hit · <court>", started by the poster, with everyone who is in, and
      // a line saying you are in. A later "I'm in" joins the same chat.
      const s = stateRef.current;
      const hit = s.hitRequests.find((h) => h.id === hitId);
      if (!hit || hit.authorId === me) return {};
      const had = hit.conversationId ? s.conversations.find((c) => c.id === hit.conversationId) : undefined;
      const conversationId = had?.id ?? nextId('cv');
      const now = new Date().toISOString();
      const line: Message = { id: nextId('m'), conversationId, senderId: me, body: '', createdAt: now, kind: 'system', event: { type: 'joined' } };
      line.body = eventText(line, s.users, null);
      const people = Array.from(new Set([hit.authorId, ...hit.joinedIds, me]));
      setState((prev) => {
        const exists = prev.conversations.some((c) => c.id === conversationId);
        const chat: Conversation = {
          id: conversationId, participantIds: people, isGroup: true, title: `Hit · ${hit.place.name || 'Court'}`,
          createdBy: hit.authorId, adminIds: [hit.authorId], messageIds: [], updatedAt: now, unreadCount: 0,
        };
        return {
          ...prev,
          hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, conversationId } : h)),
          messages: [...prev.messages, line],
          conversations: exists
            ? prev.conversations.map((c) => (c.id === conversationId
              ? { ...c, participantIds: c.participantIds.includes(me) ? c.participantIds : [...c.participantIds, me], messageIds: [...c.messageIds, line.id], updatedAt: now }
              : c))
            : [{ ...chat, messageIds: [line.id] }, ...prev.conversations],
        };
      });
      return { conversationId };
    }
    const result = await remote.joinHit(hitId);
    if (result.error) {
      setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, joinedIds: h.joinedIds.filter((x) => x !== me) } : h)) }));
      return result;
    }
    const conversationId = result.conversationId;
    if (conversationId) {
      setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, conversationId } : h)) }));
      // The hit's chat was just made (or joined) on the server: bring it in so it can open.
      const fetched = await remote.fetchConversation(me, conversationId);
      const got = fetched && chatUnhidden(me, fetched);
      if (got) setState((prev) => ({
        ...prev,
        conversations: [got.conversation, ...prev.conversations.filter((c) => c.id !== conversationId)],
        messages: [...prev.messages.filter((m) => m.conversationId !== conversationId), ...got.messages],
      }));
    }
    return result;
  }, [requireUser]);

  const leaveHit = useCallback((hitId: ID) => {
    const me = requireUser();
    setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.map((h) => (h.id === hitId ? { ...h, joinedIds: h.joinedIds.filter((x) => x !== me) } : h)) }));
    if (live(me, hitId)) void remote.leaveHit(hitId);
  }, [requireUser]);

  const recentHits = useCallback(async (): Promise<HitRequest[]> => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return stateRef.current.hitRequests;
    return remote.fetchMyRecentHits(me!).catch(() => []);
  }, []);

  const loadMySessionPosts = useCallback(async (): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return true;
    const got = await remote.fetchMySessionPosts(me!).catch(() => null);
    if (!got) return false;
    setState((prev) => addPosts(prev, got));
    return true;
  }, []);

  const loadRecentSessionPosts = useCallback(async (): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return true;
    const got = await remote.fetchRecentSessionPosts().catch(() => null);
    if (!got || stateRef.current.currentUserId !== me) return false;
    setState((prev) => addPosts(prev, got));
    return true;
  }, []);

  /* ------------------------------------------------ session tags (migration 62) */

  /** Your tags, fetched afresh. Nothing to ask in the demo, or before the server can tag. */
  const refreshSessionTags = useCallback(async (): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    // The demo holds its tags already: nothing to ask.
    if (!live(me)) return true;
    if (!stateRef.current.sessionTagsReady) {
      // Not known yet whether this server can tag (the first look had no answer): asked once more.
      const ready = await remote.sessionTagsReady().catch(() => null);
      if (!ready) return false;
      setState((prev) => (prev.currentUserId === me ? { ...prev, sessionTagsReady: true } : prev));
    }
    const got = await remote.mySessionTags().catch(() => null);
    if (!got || stateRef.current.currentUserId !== me) return false;
    // A tag answered or taken off elsewhere changes the names on posts here too.
    setState((prev) => ({ ...prev, sessionTags: got, posts: reconcileWith(prev.posts, me!, prev.sessions, got, prev.users) }));
    return true;
  }, []);

  /** A refusal word in plain English, naming the person when the app knows them. */
  const tagWords = useCallback((code: string, userId?: ID) => {
    const users = stateRef.current.users;
    return refusalWords(REFUSALS.has(code) ? code : 'other', nameFor(users.find((u) => u.id === userId), users));
  }, []);

  const sessionTagRefusal = useCallback(async (userId: ID): Promise<SessionTagRefusal | null> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    const guess = s.blockedIds.includes(userId) ? 'blocked' : localRefusal({ me, who: s.users.find((u) => u.id === userId), follows: s.followEdges, source: ageSource(s, userId), told: s.openness });
    if (!live(me, userId) || !s.sessionTagsReady) return guess;
    // The server's answer counts; without one, this phone's guess.
    return remote.sessionTagRefusal(userId).catch(() => guess);
  }, []);

  const setSessionPlayers = useCallback(async (sessionId: ID, players: SessionPlayer[]): Promise<{ id: ID; why: string }[]> => {
    const me = requireUser();
    const s = stateRef.current;
    const session = s.sessions.find((x) => x.id === sessionId && x.userId === me);
    if (!session || !canTagKind(session.kind)) return players.map((p) => ({ id: p.id, why: tagWords('not_a_match_or_practice') }));
    // Before the server can tag (migration 62 not run), nobody is tagged: the screens offer only the free-text box then.
    if (live(me) && !s.sessionTagsReady) return players.map((p) => ({ id: p.id, why: tagWords('other') }));
    if (session.fromSessionId) return players.map((p) => ({ id: p.id, why: tagWords('copy') }));
    const mine = tagsOnSession(s.sessionTags, sessionId, me, true);
    const room = maxTagsFor(session.kind);
    const wanted = new Map(players.slice(0, room).map((p) => [p.id, roleOn(session.kind, p.role)]));
    const refused: { id: ID; why: string }[] = players.slice(room).map((p) => ({ id: p.id, why: tagWords('too_many') }));
    // Taken out first, so there is room; then sides changed; then the new people.
    const drop = mine.filter((t) => isActive(t) && !wanted.has(t.taggedId));
    // Someone switched to the other side of the net after saying yes is asked again (the server does the same).
    const turn = mine.filter((t) => isActive(t) && wanted.has(t.taggedId) && wanted.get(t.taggedId) !== t.role);
    const add: SessionPlayer[] = [];
    for (const [id, role] of wanted) {
      const had = mine.find((t) => t.taggedId === id);
      // Someone who said no to this session (or took their name off it) is not asked again: the server refuses it too.
      if (had && !isActive(had)) refused.push({ id, why: tagWords('declined', id) });
      else if (!had) add.push({ id, role });
    }
    if (!drop.length && !turn.length && !add.length) return refused;
    const now = new Date().toISOString();
    const fresh: SessionTag[] = add.map((p) => ({
      id: nextId('stag'), sessionId, taggerId: me, taggedId: p.id, role: p.role, status: 'pending', createdAt: now,
      // A tag carries a match's score only: a practice's stays the logger's own (my_session_tags, migration 91).
      kind: session.kind, day: session.day, minutes: session.minutes, won: session.won, ...(session.kind === 'match' && session.sets ? { sets: session.sets } : {}),
    }));
    const dropped = new Set(drop.map((t) => t.id));
    const turned = new Map(turn.map((t) => [t.id, wanted.get(t.taggedId)!]));
    // Shown at once: the new ones waiting, the dropped ones gone (and off your posts), the sides changed.
    setState((prev) => {
      let posts = prev.posts;
      for (const t of drop) if (t.status === 'accepted') posts = patchWith(posts, me, sessionId, t.taggedId, null);
      // A side switched after a yes: off the posts until they say yes to the new side.
      for (const t of turn) if (t.status === 'accepted') posts = patchWith(posts, me, sessionId, t.taggedId, null);
      // Each new person hears about it once (the database files the real alert, migration 62).
      const told = fresh.reduce((acc, t) => withNotification(acc, { userId: t.taggedId, actorId: me, kind: 'session-tag', targetId: sessionId, targetKind: 'session-tag', preview: session.kind === 'match' ? 'match' : 'practice' }), prev);
      return {
        ...told,
        posts,
        sessionTags: [
          ...fresh,
          ...prev.sessionTags.filter((t) => !dropped.has(t.id)).map((t) => (turned.has(t.id) ? { ...t, role: turned.get(t.id)!, status: t.status === 'accepted' ? 'pending' as const : t.status, respondedAt: t.status === 'accepted' ? undefined : t.respondedAt } : t)),
        ],
      };
    });
    const undoAdd = (tagId: ID) => setState((prev) => ({ ...prev, sessionTags: prev.sessionTags.filter((t) => t.id !== tagId) }));
    if (!live(me, sessionId)) {
      // The demo answers as the server would, refusals and all.
      for (const t of fresh) {
        try {
          const refusal = await sessionTagRefusal(t.taggedId);
          await demoApi.tagSession({ me, session, who: t.taggedId, role: t.role, tags: s.sessionTags, refusal, newId: t.id });
        } catch (e) {
          undoAdd(t.id);
          refused.push({ id: t.taggedId, why: tagWords(e instanceof Error ? e.message : '', t.taggedId) });
        }
      }
      return refused;
    }
    for (const t of drop) await remote.untagSession(t.id).catch(() => undefined);
    for (const t of turn) await remote.tagSession(sessionId, t.taggedId, turned.get(t.id)).catch(() => undefined);
    for (const t of fresh) {
      try {
        await remote.tagSession(sessionId, t.taggedId, t.role);
      } catch (e) {
        undoAdd(t.id);
        refused.push({ id: t.taggedId, why: tagWords(e instanceof Error ? e.message : '', t.taggedId) });
      }
    }
    // The server's own rows (their real ids) replace the ones made here.
    await refreshSessionTags();
    return refused;
  }, [requireUser, tagWords, sessionTagRefusal, refreshSessionTags]);

  const respondSessionTag = useCallback(async (tagId: ID, accept: boolean, addToMine = true) => {
    const me = requireUser();
    const s = stateRef.current;
    const tag = s.sessionTags.find((t) => t.id === tagId && t.taggedId === me);
    if (!tag) throw new Error('That tag is no longer here.');
    const tagger = s.users.find((u) => u.id === tag.taggerId);
    const self = s.users.find((u) => u.id === me);
    const taggerName = firstName(tagger?.name.trim() || tagger?.handle || 'Someone').slice(0, 60);
    // A no to a tag you had said yes to is taking your name back off: final, as on the server.
    const after = accept ? 'accepted' as const : tag.status === 'accepted' ? 'removed' as const : tag.status === 'pending' ? 'declined' as const : tag.status;
    accept ? haptics.commit() : haptics.tap();
    // Answered here and now: the alert reads as seen, the post names you (or doesn't), and your copy is in your log.
    const markRead = (list: Notification[]) => list.map((n) => (n.userId === me && n.kind === 'session-tag' && n.targetId === tag.sessionId && !n.read ? { ...n, read: true } : n));
    const apply = (copy: PracticeSession | null) => setState((prev) => ({
      ...prev,
      notifications: markRead(prev.notifications),
      sessionTags: prev.sessionTags.map((t) => (t.id === tagId ? { ...t, status: after, respondedAt: new Date().toISOString(), mirroredSessionId: copy?.id ?? t.mirroredSessionId } : t)),
      sessions: copy && !prev.sessions.some((x) => x.id === copy.id) ? [copy, ...prev.sessions] : prev.sessions,
      posts: patchWith(prev.posts, tag.taggerId, tag.sessionId, me, accept && self ? withEntry(self, tag.role) : null),
    }));
    const undo = (copyId?: ID) => setState((prev) => ({
      ...prev,
      sessionTags: prev.sessionTags.map((t) => (t.id === tagId ? tag : t)),
      sessions: copyId && copyId !== tag.mirroredSessionId ? prev.sessions.filter((x) => x.id !== copyId) : prev.sessions,
      posts: patchWith(prev.posts, tag.taggerId, tag.sessionId, me, tag.status === 'accepted' && self ? withEntry(self, tag.role) : null),
    }));
    // The copy the server would make, shown straight away and swapped for the server's own.
    const hasCopy = s.sessions.some((x) => x.userId === me && (x.id === tag.mirroredSessionId || x.fromSessionId === tag.sessionId));
    const guess = accept && (addToMine || hasCopy) ? mirrorCopy({ me, tag, sessions: s.sessions, taggerName, newId: nextId('ses') }) : null;
    apply(guess);
    if (!live(me, tagId)) {
      try { await demoApi.respondSessionTag({ me, tag, accept, addToMine, sessions: s.sessions, tags: s.sessionTags, taggerName, newId: guess?.id ?? nextId('ses') }); } catch (e) {
        undo(guess?.id);
        throw new Error(tagWords(e instanceof Error ? e.message : ''));
      }
      return;
    }
    try {
      const copy = await remote.respondSessionTag(tagId, accept, addToMine);
      if (guess && copy && guess.id !== copy.id) {
        setState((prev) => ({
          ...prev,
          sessions: [copy, ...prev.sessions.filter((x) => x.id !== guess.id && x.id !== copy.id)],
          sessionTags: prev.sessionTags.map((t) => (t.id === tagId ? { ...t, mirroredSessionId: copy.id } : t)),
        }));
      } else if (guess && !copy) {
        setState((prev) => ({ ...prev, sessions: prev.sessions.filter((x) => x.id !== guess.id || guess.id === tag.mirroredSessionId) }));
      }
    } catch (e) {
      undo(guess?.id);
      throw new Error(tagWords(e instanceof Error ? e.message : ''));
    }
  }, [requireUser, tagWords]);

  const removeSessionTag = useCallback(async (tagId: ID, dropMine = false) => {
    const me = requireUser();
    const tag = stateRef.current.sessionTags.find((t) => t.id === tagId);
    if (!tag || (tag.taggerId !== me && tag.taggedId !== me)) return;
    const before = stateRef.current;
    haptics.tap();
    setState((prev) => {
      const posts = tag.status === 'accepted' ? patchWith(prev.posts, tag.taggerId, tag.sessionId, tag.taggedId, null) : prev.posts;
      // The tagger: gone; a no (or a tag taken back off) only leaves your log, so they are not asked again.
      if (tag.taggerId === me) {
        return { ...prev, posts, sessionTags: isActive(tag) ? prev.sessionTags.filter((t) => t.id !== tagId) : prev.sessionTags.map((t) => (t.id === tagId ? { ...t, dropped: true } : t)) };
      }
      // The one tagged: a waiting tag becomes a no, an accepted one is taken back off for good; their copy goes only if they asked.
      const after = tag.status === 'pending' ? 'declined' as const : tag.status === 'accepted' ? 'removed' as const : tag.status;
      return {
        ...prev,
        posts,
        sessionTags: prev.sessionTags.map((t) => (t.id === tagId ? { ...t, status: after, respondedAt: isActive(tag) ? new Date().toISOString() : t.respondedAt, mirroredSessionId: dropMine ? undefined : t.mirroredSessionId } : t)),
        sessions: dropMine && tag.mirroredSessionId ? prev.sessions.filter((x) => x.id !== tag.mirroredSessionId) : prev.sessions,
        notifications: prev.notifications.map((n) => (n.userId === me && n.kind === 'session-tag' && n.targetId === tag.sessionId ? { ...n, read: true } : n)),
      };
    });
    try {
      if (live(me, tagId)) await remote.untagSession(tagId, dropMine);
      else await demoApi.untagSession({ me, tag });
    } catch (e) {
      setState((prev) => ({ ...prev, posts: before.posts, sessionTags: before.sessionTags, sessions: before.sessions }));
      throw new Error(tagWords(e instanceof Error ? e.message : ''));
    }
  }, [requireUser, tagWords]);

  const setSessionOpponent = useCallback(async (sessionId: ID, opponent: string) => {
    const me = requireUser();
    const text = opponent.trim().slice(0, OPPONENT_MAX).trim() || undefined;
    const had = stateRef.current.sessions.find((x) => x.id === sessionId && x.userId === me);
    if (!had || had.opponent === text) return;
    setState((prev) => ({ ...prev, sessions: prev.sessions.map((x) => (x.id === sessionId ? { ...x, opponent: text } : x)) }));
    if (!live(me, sessionId)) return;
    try { await remote.updateSessionOpponent(sessionId, text ?? null); } catch (e) {
      setState((prev) => ({ ...prev, sessions: prev.sessions.map((x) => (x.id === sessionId ? { ...x, opponent: had.opponent } : x)) }));
      throw e;
    }
  }, [requireUser]);

  const setSessionScore = useCallback(async (sessionId: ID, sets: MatchSet[] | null) => {
    const me = requireUser();
    const had = stateRef.current.sessions.find((x) => x.id === sessionId && x.userId === me);
    // Any tennis session can carry a score (Oct 6); a workout never does.
    if (!had || !canScore(had.kind)) return;
    const match = had.kind === 'match';
    const next = sets?.length ? sets.slice(0, 5) : undefined;
    const same = JSON.stringify(had.sets ?? null) === JSON.stringify(next ?? null);
    if (same) return;
    // An even count (a match stopped at one set all) keeps the result you chose. A practice has no result.
    const won = match ? setsWinner(next) ?? had.won : had.won;
    const before = stateRef.current;
    const patch = (x: PracticeSession): PracticeSession => {
      const { sets: _old, ...rest } = x;
      return { ...rest, won, ...(next ? { sets: next } : {}) };
    };
    haptics.commit();
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((x) => (x.id === sessionId ? patch(x) : x)),
      // Your posts carrying it show the new score straight away (the server does the same, migration 91).
      posts: prev.posts.map((p) => {
        if (p.authorId !== me || !p.session || p.session.sessionId !== sessionId) return p;
        const { sets: _old, won: _won, ...rest } = p.session;
        return { ...p, session: { ...rest, ...(won !== undefined ? { won } : {}), ...(next ? { sets: next } : {}) } };
      }),
      // On a match, anyone who said yes is asked again, as on the server: what they accepted has changed.
      // A practice's score is the logger's own: their tags never show it, so nobody is asked again (Oct 6).
      sessionTags: match ? prev.sessionTags.map((t) => (t.sessionId === sessionId && t.taggerId === me
        ? { ...t, won, sets: next, ...(t.status === 'accepted' ? { status: 'pending' as const, respondedAt: undefined } : {}) }
        : t)) : prev.sessionTags,
    }));
    if (!live(me, sessionId)) return;
    try { await remote.updateSessionScore(sessionId, next ?? null, match ? won ?? null : undefined); } catch (e) {
      // Only this session, its posts and its tags go back: anything else changed meanwhile stays.
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((x) => (x.id === sessionId ? had : x)),
        posts: prev.posts.map((p) => before.posts.find((b) => b.id === p.id && p.session?.sessionId === sessionId) ?? p),
        sessionTags: prev.sessionTags.map((t) => (t.sessionId === sessionId ? before.sessionTags.find((b) => b.id === t.id) ?? t : t)),
      }));
      throw e;
    }
    // The server's word on who is waiting now.
    if (match) void refreshSessionTags();
  }, [requireUser, refreshSessionTags]);

  const setSessionTime = useCallback(async (sessionId: ID, time: { day: string; minutes: number }) => {
    const me = requireUser();
    const had = stateRef.current.sessions.find((x) => x.id === sessionId && x.userId === me);
    // Within what the database keeps (5 to 600 minutes, migration 39), on a real day.
    const minutes = Math.max(5, Math.min(600, Math.round(time.minutes)));
    if (!had || !/^\d{4}-\d{2}-\d{2}$/.test(time.day)) return;
    if (had.day === time.day && had.minutes === minutes) return;
    const before = stateRef.current;
    // Who said yes is asked again (migration 62): what they accepted has changed. Their names come off your posts meanwhile.
    const reasked = new Set(before.sessionTags.filter((t) => t.sessionId === sessionId && t.taggerId === me && t.status === 'accepted').map((t) => t.taggedId));
    haptics.commit();
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.map((x) => (x.id === sessionId ? { ...x, day: time.day, minutes } : x)),
      // Your posts carrying it say the new day and length straight away (the server does the same, migration 65).
      posts: prev.posts.map((p) => {
        if (p.authorId !== me || !p.session || p.session.sessionId !== sessionId) return p;
        const kept = p.session.with?.filter((w) => !reasked.has(w.id));
        const { with: _with, ...rest } = p.session;
        return { ...p, session: { ...rest, day: time.day, minutes, ...(kept?.length ? { with: kept } : {}) } };
      }),
      sessionTags: prev.sessionTags.map((t) => (t.sessionId === sessionId && t.taggerId === me
        ? { ...t, day: time.day, minutes, ...(t.status === 'accepted' ? { status: 'pending' as const, respondedAt: undefined } : {}) }
        : t)),
    }));
    if (!live(me, sessionId)) return;
    try { await remote.updateSessionTime(sessionId, time.day, minutes); } catch (e) {
      // Only this session, its posts and its tags go back: anything else changed meanwhile stays.
      setState((prev) => ({
        ...prev,
        sessions: prev.sessions.map((x) => (x.id === sessionId ? had : x)),
        posts: prev.posts.map((p) => before.posts.find((b) => b.id === p.id && p.session?.sessionId === sessionId) ?? p),
        sessionTags: prev.sessionTags.map((t) => (t.sessionId === sessionId ? before.sessionTags.find((b) => b.id === t.id) ?? t : t)),
      }));
      throw e;
    }
    // The server's word on who is waiting now.
    if (reasked.size) void refreshSessionTags();
  }, [requireUser, refreshSessionTags]);

  const headToHead = useCallback(async (userId: ID): Promise<HeadToHead | null> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || userId === me || s.blockedIds.includes(userId)) return null;
    if (live(me, userId)) return remote.headToHead(userId);
    return demoApi.headToHead({ me, other: userId, sessions: s.sessions, tags: s.sessionTags });
  }, []);

  const courtKings = useCallback(async (courtId: string): Promise<CourtKings | null> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || !isMapCourtId(courtId)) return null;
    if (live(me)) return remote.fetchCourtKings(courtId);
    const self = s.users.find((u) => u.id === me);
    return demoApi.courtKings({ courtId, me, sessions: s.sessions, ranked: !self?.isPrivate });
  }, []);

  // The same court and day asked again within a minute (the toast, the pill, the sheet) is answered from here.
  const flybyAsked = useRef(new Map<string, { at: number; ask: Promise<FlybyPerson[] | null> }>());
  const flyby = useCallback(async (courtId: string, day: string): Promise<FlybyPerson[] | null> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || !isMapCourtId(courtId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const key = `${me}|${courtId}|${day}`;
    const had = flybyAsked.current.get(key);
    if (had && Date.now() - had.at < 60_000) return had.ask;
    // Your clock's minutes ahead of UTC (-420 in Los Angeles in summer): the server says morning, afternoon or evening in your time.
    const offset = -new Date(`${day}T12:00:00`).getTimezoneOffset();
    const ask = (live(me) ? remote.fetchFlyby(courtId, day, offset) : demoApi.flyby({ courtId, day, me, sessions: s.sessions, tags: s.sessionTags }))
      .then((list) => (list ? list.filter((p) => !s.blockedIds.includes(p.userId)) : list))
      .catch(() => null);
    flybyAsked.current.set(key, { at: Date.now(), ask });
    const got = await ask;
    if (got === null) flybyAsked.current.delete(key);
    return got;
  }, []);

  const friendsOnStreak = useCallback(async (): Promise<FriendStreak[]> => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me) return [];
    const hiddenIds = [...s.blockedIds, ...s.blockedMeIds, ...s.mutedIds];
    const keep = (list: FriendStreak[]) => {
      const now = stateRef.current;
      const hidden = new Set([...now.blockedIds, ...now.blockedMeIds, ...now.mutedIds]);
      return list.filter((f) => f.userId !== me && now.followingIds.includes(f.userId) && !hidden.has(f.userId)
        && !now.users.find((u) => u.id === f.userId)?.suspended);
    };
    if (!live(me)) {
      return keep(await demoApi.friendsOnStreak({ me, users: s.users, followingIds: s.followingIds, followEdges: s.followEdges, hiddenIds }).catch(() => []));
    }
    const got = await remote.fetchFriendsOnStreak(localDay(new Date())).catch(() => null);
    if (got) return keep(got);
    // Friends who follow each other with you, from the streaks the open brought (migration 134).
    const now = stateRef.current;
    const back = new Set(now.followEdges.filter((e) => e.followingId === me).map((e) => e.followerId));
    return keep(now.users.flatMap((u) => (u.streak && back.has(u.id) ? [{ userId: u.id, ...u.streak }] : [])));
  }, []);

  const cancelHit = useCallback(async (hitId: ID) => {
    const me = requireUser();
    const had = stateRef.current.hitRequests.find((h) => h.id === hitId);
    setState((prev) => ({ ...prev, hitRequests: prev.hitRequests.filter((h) => h.id !== hitId) }));
    if (!live(me, hitId)) return;
    try {
      await remote.cancelHit(hitId);
    } catch {
      // Still on for everyone else: it comes back here too, and says so (unless a refetch already brought it back).
      if (stateRef.current.currentUserId !== me) return;
      if (had) setState((prev) => (prev.hitRequests.some((h) => h.id === hitId) ? prev : { ...prev, hitRequests: [...prev.hitRequests, had].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) }));
      showToast({ title: 'That didn’t go through. Your hit is still on.', icon: 'alert-circle-outline' });
    }
  }, [requireUser]);

  // What the last tap on a heart or a bookmark asked for, until the store's
  // own redraw has it: a second tap quicker than that redraw reads this,
  // not the store a beat behind (two quick taps used to send "like" twice
  // and leave the server liked under an empty heart). Held a few seconds at
  // most, so a refresh in between is never overruled for long.
  const asked = useRef(new Map<string, { on: boolean; at: number }>());
  const intended = (key: string, stored: boolean) => {
    const a = asked.current.get(key);
    if (!a || a.on === stored || Date.now() - a.at > 4000) { asked.current.delete(key); return stored; }
    return a.on;
  };
  // The writes for one heart or bookmark go one at a time, in the order they
  // were tapped, so the last tap is what the server keeps. One that does not
  // go through, with nothing tapped after it, is put back on screen.
  const writes = useRef(new Map<string, Promise<void>>());
  const inTurn = (key: string, write: () => Promise<boolean>, failed: () => void) => {
    const run: Promise<void> = (writes.current.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(write)
      .then((ok) => { if (!ok && writes.current.get(key) === run) failed(); }, () => { if (writes.current.get(key) === run) failed(); });
    writes.current.set(key, run);
    void run.finally(() => { if (writes.current.get(key) === run) writes.current.delete(key); });
  };

  const toggleLike = useCallback(
    (postId: ID, wantOn?: boolean) => {
      learnedTip('double-tap');
      const me = requireUser();
      const now = stateRef.current.posts.find((p) => p.id === postId);
      const key = `like:${postId}`;
      const liking = wantOn ?? !intended(key, !!now && now.likedBy.includes(me));
      asked.current.set(key, { on: liking, at: Date.now() });
      // The buzz answers the tap itself. Inside the update it waited for
      // React to get round to redrawing the whole feed, which read as lag.
      if (now) liking ? haptics.reward() : haptics.untap();
      if (live(me, postId) && now) {
        inTurn(key, () => remote.setLike(postId, me, liking), () => {
          asked.current.delete(key);
          setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId ? { ...p, likedBy: withOrWithout(p.likedBy, me, !liking) } : p)) }));
        });
      }
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        // Set to what was asked, never flipped: two taps queued before a redraw end where the last one said.
        if (!post || post.likedBy.includes(me) === liking) return prev;
        const next: AppState = {
          ...prev,
          posts: prev.posts.map((p) => (p.id === postId ? { ...p, likedBy: withOrWithout(p.likedBy, me, liking) } : p)),
        };
        // Only the like fires a notification; taking it back should not.
        return liking
          ? withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'like',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(post.body),
            })
          : next;
      });
    },
    [requireUser],
  );

  // Each picked file on its way up, and the post it belongs to. A second
  // Share of the same file while the first is still going (a tap that got
  // through twice, a second Create box) is that same post, never a new one.
  const sending = useRef(new Map<string, ID>());

  const addPost = useCallback(
    (input: NewPostInput): ID => {
      const me = requireUser();
      const source = [input.videoUrl, input.imageUrl].find((uri) => isLocalMedia(uri));
      const already = source ? sending.current.get(source) : undefined;
      if (already) return already;
      haptics.commit();
      const now = stateRef.current;
      const post: Post = {
        id: nextId('p'),
        authorId: me,
        createdAt: new Date().toISOString(),
        likedBy: [],
        commentIds: [],
        ...input,
        // Who accepted a tag on the session shows straight away; the server works it out again and keeps its own (migration 62).
        session: withOnNewPost(input.session, me, now.sessions, now.sessionTags, now.users),
        // The server marks it too; this shows the tag before the round trip.
        isFirst: !stateRef.current.posts.some((p) => p.authorId === me) || undefined,
      };
      const celebration = {
        userId: me, targetId: post.id, targetKind: 'post' as const, preview: snippet(post.body || (post.kind === 'clip' ? 'Clip' : 'Post')),
        title: post.kind === 'clip' ? 'Clip posted' : 'Posted',
        body: post.groupId ? 'It is in the group’s feed.' : post.kind === 'clip' ? 'It is in the feed and on your profile.' : 'It is live in the feed.',
        href: '/', icon: post.kind === 'clip' ? 'play' : 'checkmark',
      };
      const uploading = live(me) && (isLocalMedia(post.imageUrl) || isLocalMedia(post.videoUrl) || isLocalMedia(post.thumbnailUrl));
      const label = post.body ? snippet(post.body, 60) : post.kind === 'clip' ? 'Your clip' : 'Your post';
      // Everyone tagged hears about it.
      const tell = (state: AppState) => (post.taggedUserIds ?? []).reduce(
        (acc, id) => withNotification(acc, { userId: id, actorId: me, kind: 'tag', targetId: post.id, targetKind: 'post', preview: snippet(post.body || 'a post') }),
        state,
      );
      const tellAll = (state: AppState) => notifyMentions(tell(state), post.body, me, post.id, 'post');
      if (uploading) {
        // The strip across the top counts the upload up. The post is not in
        // the store, or the feed, until it has actually landed (a like or a
        // comment before then would have nothing to attach to); then it goes
        // to the very top of Home, playing from the internet, never from the
        // file still being shrunk and sent here.
        startUpload(post.id, label, post.thumbnailUrl ?? post.imageUrl, post.tags);
        if (source) sending.current.set(source, post.id);
      } else {
        if (post.videoUrl || post.imageUrl) simulateUpload(post.id, label, post.thumbnailUrl ?? post.imageUrl, post.tags);
        setState((prev) => tellAll(celebratePosted({ ...prev, posts: [post, ...prev.posts] }, { ...celebration, quiet: !!(post.videoUrl || post.imageUrl) })));
        // Nothing to send first (words only, or media already online): it is at the top of Home straight away.
        requestFeedRefresh(`p:${post.id}`);
      }
      if (live(me)) {
        (async () => {
          try {
            // Media picked on the device goes up first so the row points at the
            // bucket. The video is nearly all of the bytes, so it owns nearly
            // all of the bar; the cover picture gets the last sliver.
            const local = [isLocalMedia(post.imageUrl), isLocalMedia(post.videoUrl), isLocalMedia(post.thumbnailUrl) && post.thumbnailUrl !== post.imageUrl];
            const weights = [local[0] ? 0.85 : 0, local[1] ? 0.9 : 0, local[2] ? 0.1 : 0];
            const total = weights.reduce((a, b) => a + b, 0) || 1;
            const before = (i: number) => weights.slice(0, i).reduce((a, b) => a + b, 0) / total;
            const report = (i: number) => (f: number) => setUploadProgress(post.id, before(i) + (weights[i] / total) * f);
            // Whichever picture is the cover also gets a small copy for grid tiles (see smallCover.ts).
            const photoIsCover = !post.thumbnailUrl || post.thumbnailUrl === post.imageUrl;
            const imageUrl = local[0] ? await uploadMedia(me, post.imageUrl!, 'photo', report(0), { smallCover: photoIsCover }) : post.imageUrl;
            const videoUrl = local[1] ? await uploadMedia(me, post.videoUrl!, 'video', report(1)) : post.videoUrl;
            const thumbnailUrl = post.thumbnailUrl === post.imageUrl ? imageUrl
              : local[2] ? await uploadMedia(me, post.thumbnailUrl!, 'photo', report(2), { smallCover: true }) : post.thumbnailUrl;
            const hosted = { ...post, imageUrl, videoUrl, thumbnailUrl };
            // Saved under the id made on this phone when Share was tapped:
            // sent twice, it is still one post (see remote.insertPost).
            await noteStep('saving the post');
            await remote.insertPost(hosted);
            // Kept in the note a few seconds more: Home rebuilds its pages around the new post now.
            void noteStep('post saved, Home moving it to the top');
            if (uploading) {
              // Landed: into the store, and to the very top of Home.
              finishUpload(post.id);
              setState((prev) => tellAll(celebratePosted({ ...prev, posts: [hosted, ...prev.posts.filter((p) => p.id !== post.id)] }, { ...celebration, quiet: true })));
              requestFeedRefresh(`p:${post.id}`);
            } else {
              setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === post.id ? { ...p, imageUrl, videoUrl, thumbnailUrl } : p)) }));
            }
          } catch (error) {
            console.warn('[remote] post did not land', error);
            void reportError(error, { where: uploading ? 'post upload' : 'post save' });
            const reason = error instanceof Error ? error.message : 'Something went wrong.';
            if (uploading) finishUpload(post.id, false, reason);
            else toast.show({ title: 'Could not post', body: reason, icon: 'alert' });
            // The post never reached the server; leaving it in the feed would
            // show something nobody else can see.
            setState((prev) => ({ ...prev, posts: prev.posts.filter((p) => p.id !== post.id) }));
            haptics.reject();
          } finally {
            if (source && sending.current.get(source) === post.id) sending.current.delete(source);
            // Cleared a few seconds on, unless another post is still going up (its own steps stay).
            setTimeout(() => { if (!anyUploading()) void noteStep(''); }, 5000);
          }
        })();
      }
      return post.id;
    },
    [requireUser],
  );

  /**
   * Gone for good: the post, its comments, likes and saves. Only the author
   * can. If the server does not take it (no connection), it comes back and
   * says so, rather than looking deleted here while everyone else still sees it.
   */
  const deletePost = useCallback((postId: ID) => {
    const me = requireUser();
    const was = stateRef.current;
    const post = was.posts.find((p) => p.id === postId);
    if (!post || post.authorId !== me) return;
    haptics.commit();
    const at = was.posts.indexOf(post);
    const itsComments = was.comments.filter((c) => c.postId === postId);
    const wasSaved = was.saved.postIds.includes(postId);
    setState((prev) => ({
      ...prev,
      posts: prev.posts.filter((p) => p.id !== postId),
      comments: prev.comments.filter((c) => c.postId !== postId),
      saved: { ...prev.saved, postIds: prev.saved.postIds.filter((id) => id !== postId) },
    }));
    if (!live(me, postId)) return;
    void remote.deletePost(postId).then((ok) => {
      if (ok || stateRef.current.currentUserId !== me) return;
      setState((prev) => {
        if (prev.posts.some((p) => p.id === postId)) return prev;
        const posts = [...prev.posts];
        posts.splice(Math.min(at, posts.length), 0, post);
        const have = new Set(prev.comments.map((c) => c.id));
        return {
          ...prev,
          posts,
          comments: [...prev.comments, ...itsComments.filter((c) => !have.has(c.id))],
          saved: wasSaved && !prev.saved.postIds.includes(postId) ? { ...prev.saved, postIds: [postId, ...prev.saved.postIds] } : prev.saved,
        };
      });
      showToast({ title: 'Couldn’t delete your post', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  const toggleArchivePost = useCallback((postId: ID, quiet?: boolean) => {
    const me = requireUser();
    haptics.commit();
    const post = stateRef.current.posts.find((p) => p.id === postId);
    const archiving = !post?.archived;
    if (live(me, postId) && post?.authorId === me) {
      void remote.setPostArchived(postId, archiving).then((ok) => {
        if (ok) return;
        // It didn't go through: back as it was (unless it has changed again since), and said.
        setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId && !!p.archived === archiving ? { ...p, archived: !archiving } : p)) }));
        showToast({ title: archiving ? 'Couldn’t archive your post' : 'Couldn’t unarchive your post', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
      });
    }
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => (p.id === postId && p.authorId === me ? { ...p, archived: archiving } : p)),
    }));
    if (quiet || post?.authorId !== me) return;
    offerUndo(
      archiving ? 'Archived' : 'Back on your profile',
      () => { const p = stateRef.current.posts.find((x) => x.id === postId); return !!p && !!p.archived === archiving; },
      () => toggleArchivePost(postId, true),
      { body: archiving ? 'Only you can see it now' : undefined, icon: 'archive-outline' },
    );
  }, [requireUser]);

  const togglePinPost = useCallback((postId: ID, quiet?: boolean) => {
    const me = requireUser();
    haptics.commit();
    const post = stateRef.current.posts.find((p) => p.id === postId);
    const pinning = !post?.pinned;
    if (live(me, postId) && post?.authorId === me) {
      void remote.setPostPinned(postId, pinning).then((ok) => {
        if (ok) return;
        setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId && !!p.pinned === pinning ? { ...p, pinned: !pinning } : p)) }));
        showToast({ title: pinning ? 'Couldn’t pin your post' : 'Couldn’t unpin your post', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
      });
    }
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => (p.id === postId && p.authorId === me ? { ...p, pinned: pinning } : p)),
    }));
    if (quiet || post?.authorId !== me) return;
    offerUndo(
      pinning ? 'Pinned to your profile' : 'Unpinned',
      () => { const p = stateRef.current.posts.find((x) => x.id === postId); return !!p && !!p.pinned === pinning; },
      () => togglePinPost(postId, true),
      { icon: 'pin-outline' },
    );
  }, [requireUser]);

  const editPost = useCallback((postId: ID, patch: { body: string; taggedUserIds: ID[]; location?: string; court?: TaggedCourt | null; share?: HealthShareKey[]; featureOk?: boolean }) => {
    const me = requireUser();
    const post = stateRef.current.posts.find((p) => p.id === postId);
    if (!post || post.authorId !== me) return;
    haptics.commit();
    const editedAt = new Date().toISOString();
    const tags = Array.from(new Set((patch.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase())));
    const location = patch.location?.trim() || undefined;
    // A court belongs with its name: no location, no court.
    const court = location ? patch.court : null;
    // "Share health data" changed (Oct 4, owner): only on a tracker session's
    // post, only when the list really changed. Shown at once from your own
    // tracker while it is held here; the server then writes the numbers from
    // its private copy (migration 72) and its answer replaces these.
    const healthWas = post.session;
    const tracker = healthWas?.activityId ? stateRef.current.detectedActivities.find((a) => a.id === healthWas.activityId && a.userId === me) : undefined;
    const healthNow = healthWas?.activityId && patch.share && !sameShare(postShare(healthWas), patch.share) ? reshare(healthWas, patch.share, tracker) : undefined;
    // "Let CourtSide feature this on its Instagram" switched after posting
    // (Oct 5, owner): only on a post that can be featured, only when it
    // really changed. Shown at once; the server's answer then counts (it
    // keeps a tracker session's post off), and a switch that did not save
    // goes back, with a toast, so nobody thinks it is off when it is not.
    const featureNow = patch.featureOk !== undefined && canBeFeatured(post) && patch.featureOk !== (post.featureOk !== false) ? patch.featureOk : undefined;
    const saveFeature = () => {
      if (featureNow === undefined) return;
      const shown = (p: Post) => p.featureOk !== false;
      setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId ? { ...p, featureOk: featureNow ? undefined : false } : p)) }));
      if (!live(me, postId)) return;
      void remote.setPostFeatureOk(postId, featureNow).catch(() => null).then((saved) => {
        if (saved === featureNow) return;
        // Not if it has been switched again since: that one counts.
        setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId && shown(p) === featureNow ? { ...p, featureOk: (saved ?? !featureNow) ? undefined : false } : p)) }));
        if (saved === null) showToast({ title: featureNow ? 'Featuring didn’t switch on' : 'Featuring didn’t switch off', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
      });
    };
    // Only the switch changed: saved on its own, and the post is not marked
    // "Edited" (nothing anyone sees on it changed).
    const sameTagged = patch.taggedUserIds.length === (post.taggedUserIds ?? []).length && patch.taggedUserIds.every((id) => (post.taggedUserIds ?? []).includes(id));
    const sameCourt = court === undefined || (court?.id ?? undefined) === post.court?.id;
    // Nothing anyone sees changed (only the switch, or nothing at all): never marked "Edited".
    if (patch.body === post.body && sameTagged && location === (post.location || undefined) && sameCourt && !healthNow) {
      saveFeature();
      return;
    }
    if (live(me, postId)) void remote.updatePost(postId, { body: patch.body, tags, taggedUserIds: patch.taggedUserIds, location, court, editedAt }).then((r) => {
      if (!r) return;
      // Refused for its words (migration 117; that toast says why), or not
      // saved at all: the post goes back to what it said.
      if (r === 'failed') showToast({ title: 'Your changes didn’t save', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
      if (r === 'too-many-tagged') showToast({ title: 'Your changes didn’t save', body: 'A post can tag up to 20 people. Take some off and save it again.', icon: 'alert-circle-outline' });
      setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId && p.editedAt === editedAt ? { ...p, body: post.body, tags: post.tags, taggedUserIds: post.taggedUserIds, location: post.location, court: post.court, editedAt: post.editedAt } : p)) }));
    });
    setState((prev) => {
      const before = prev.posts.find((p) => p.id === postId);
      const newlyTagged = patch.taggedUserIds.filter((id) => !(before?.taggedUserIds ?? []).includes(id));
      const next: AppState = {
        ...prev,
        posts: prev.posts.map((p) => (p.id === postId ? { ...p, body: patch.body, tags, taggedUserIds: patch.taggedUserIds.length ? patch.taggedUserIds : undefined, location, court: court === undefined ? p.court : court ?? undefined, editedAt, ...(healthNow ? { session: healthNow } : {}) } : p)),
      };
      return newlyTagged.reduce((acc, id) => withNotification(acc, { userId: id, actorId: me, kind: 'tag', targetId: postId, targetKind: 'post', preview: snippet(patch.body || 'a post') }), next);
    });
    saveFeature();
    if (!healthNow || !live(me, postId)) return;
    void remote.setPostHealthShare(postId, healthNow).catch(() => null).then((saved) => {
      // The server's numbers, or back to what the post had. Not if it has
      // changed again since (another edit, a refresh): that one counts.
      setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === postId && p.session === healthNow ? { ...p, session: saved ?? healthWas } : p)) }));
      if (!saved) showToast({ title: 'Your health numbers didn’t change', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  const editQuestion = useCallback((questionId: ID, patch: { title: string; body: string }) => {
    const me = requireUser();
    const was = stateRef.current.questions.find((q) => q.id === questionId && q.authorId === me);
    // Saved with nothing changed: left as it is, never marked "Edited".
    if (was && was.title === patch.title && (was.body ?? '') === patch.body) return;
    haptics.commit();
    const tags = Array.from(new Set((patch.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase())));
    setState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId && q.authorId === me ? { ...q, title: patch.title, body: patch.body, tags, editedAt: new Date().toISOString() } : q)),
    }));
    const saved = stateRef.current.questions.find((q) => q.id === questionId);
    if (saved && live(me, questionId)) void remote.updateQuestion({ ...saved, title: patch.title, body: patch.body, tags, editedAt: new Date().toISOString() }).then((r) => {
      if (!r || !was) return;
      // Refused for its words (migration 117; the toast says why) or not saved at all: the thread goes back to what it said.
      setState((prev) => ({ ...prev, questions: prev.questions.map((q) => (q.id === questionId && q.title === patch.title && q.body === patch.body ? { ...q, title: was.title, body: was.body, tags: was.tags, editedAt: was.editedAt } : q)) }));
      if (r === 'failed') showToast({ title: 'Your edit didn’t save', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);
  const acceptAnswer = useCallback((questionId: ID, answerId: ID) => {
    const me = requireUser();
    const question = stateRef.current.questions.find((q) => q.id === questionId);
    if (!question || question.authorId !== me) return;
    const next = question.acceptedAnswerId === answerId ? undefined : answerId;
    haptics.commit();
    setState((prev) => ({ ...prev, questions: prev.questions.map((q) => (q.id === questionId ? { ...q, acceptedAnswerId: next } : q)) }));
    if (live(me, questionId)) void remote.updateQuestion({ ...question, acceptedAnswerId: next });
  }, [requireUser]);

  // A caller that reads the store the moment an action resolves (the feed
  // deals its pages straight after a pull) waits here until the new data has
  // actually been drawn, not just handed to React. Capped, so it never hangs.
  const drawWaiters = useRef<{ ready: () => boolean; resolve: () => void }[]>([]);
  useEffect(() => {
    if (!drawWaiters.current.length) return;
    drawWaiters.current = drawWaiters.current.filter((w) => { if (!w.ready()) return true; w.resolve(); return false; });
  }, [state]);
  const drawn = useCallback((ready: () => boolean) => new Promise<void>((resolve) => {
    if (ready()) { resolve(); return; }
    const timer = setTimeout(() => { drawWaiters.current = drawWaiters.current.filter((w) => w !== waiter); resolve(); }, 2000);
    const waiter = { ready, resolve: () => { clearTimeout(timer); resolve(); } };
    drawWaiters.current.push(waiter);
  }), []);

  const refresh = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    // Any signed-in account fetches, one whose last load failed included: a
    // pull is exactly how someone asks it to try again.
    if (!me || !live(me)) { await new Promise((resolve) => setTimeout(resolve, 500)); return true; }
    const before = stateRef.current.feed;
    void refreshSessionTags();
    if (await loadRemote(me, undefined, true)) { await drawn(() => stateRef.current.feed !== before); return true; }
    // An open on the saved copy that could not refresh has already said so.
    if (stateRef.current.remoteLoaded || !stateRef.current.snapshotShown) showToast({ title: 'Can’t refresh right now', body: 'Check your connection, then pull down to try again.', icon: 'cloud-offline-outline' });
    return false;
  }, [loadRemote, drawn, refreshSessionTags]);

  const addStory = useCallback(
    (input: NewStoryInput): ID => {
      const me = requireUser();
      haptics.commit();
      const createdAt = new Date().toISOString();
      const story: Story = {
        id: nextId('s'),
        authorId: me,
        createdAt,
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        viewedBy: [],
        likedBy: [],
        commentIds: [],
        ...input,
      };
      const celebration = {
        userId: me, targetId: story.id, targetKind: 'post' as const, preview: `Instant${story.caption ? ` · ${snippet(story.caption, 60)}` : ''}`,
        title: 'Instant posted', body: 'Up for 24 hours, then kept in your archive.',
        href: '/', icon: 'camera' as const,
      };
      if (!live(me)) {
        setState((prev) => celebratePosted({ ...prev, stories: [story, ...prev.stories] }, celebration));
        requestFeedRefresh(`h:${story.id}`);
        return story.id;
      }
      // The hit is not in the store, or the feed, until it has landed: the
      // strip across the top counts the upload up, and a failure says so
      // instead of leaving a hit only this phone can see. Once it lands it
      // goes to the very top of Home.
      startUpload(story.id, 'Posting Instant', story.thumbnailUrl ?? story.imageUrl);
      (async () => {
        try {
          const local = [isLocalMedia(story.imageUrl), isLocalMedia(story.videoUrl), isLocalMedia(story.thumbnailUrl) && story.thumbnailUrl !== story.imageUrl];
          const weights = [local[0] ? 0.85 : 0, local[1] ? 0.9 : 0, local[2] ? 0.1 : 0];
          const total = weights.reduce((a, b) => a + b, 0) || 1;
          let done = 0;
          const report = (i: number) => (fraction: number) => setUploadProgress(story.id, (done + weights[i] * fraction) / total);
          // The cover gets a small copy too, for the archive's grid.
          const photoIsCover = !story.thumbnailUrl || story.thumbnailUrl === story.imageUrl;
          const imageUrl = local[0] ? await uploadMedia(me, story.imageUrl!, 'photo', report(0), { smallCover: photoIsCover }) : story.imageUrl;
          done += weights[0];
          const videoUrl = local[1] ? await uploadMedia(me, story.videoUrl!, 'video', report(1)) : story.videoUrl;
          done += weights[1];
          const thumbnailUrl = story.thumbnailUrl === story.imageUrl ? imageUrl
            : local[2] ? await uploadMedia(me, story.thumbnailUrl!, 'photo', report(2), { smallCover: true }) : story.thumbnailUrl;
          const hosted = { ...story, imageUrl, videoUrl, thumbnailUrl };
          await remote.insertStory(hosted);
          finishUpload(story.id);
          setState((prev) => celebratePosted({ ...prev, stories: [hosted, ...prev.stories.filter((st) => st.id !== story.id)] }, { ...celebration, quiet: true }));
          requestFeedRefresh(`h:${story.id}`);
        } catch (error) {
          console.warn('[remote] hit did not land', error);
          void reportError(error, { where: 'instant upload' });
          finishUpload(story.id, false, error instanceof Error ? error.message : 'Something went wrong.');
          haptics.reject();
        }
      })();
      return story.id;
    },
    [requireUser],
  );

  const toggleArchiveStory = useCallback((storyId: ID, quiet?: boolean) => {
    const me = requireUser();
    haptics.commit();
    const story = stateRef.current.stories.find((st) => st.id === storyId);
    const archiving = !story?.archived;
    if (live(me, storyId) && story?.authorId === me) {
      void remote.setStoryArchived(storyId, archiving).then((ok) => {
        if (ok || stateRef.current.currentUserId !== me) return;
        // It didn't go through: back as it was (unless it has changed again since), and said, as a post's archive does.
        setState((prev) => ({ ...prev, stories: prev.stories.map((st) => (st.id === storyId && !!st.archived === archiving ? { ...st, archived: !archiving } : st)) }));
        showToast({ title: archiving ? 'Couldn’t archive your Instant' : 'Couldn’t unarchive your Instant', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
      });
    }
    setState((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => (s.id === storyId && s.authorId === me ? { ...s, archived: archiving } : s)),
    }));
    if (quiet || story?.authorId !== me) return;
    offerUndo(
      archiving ? 'Archived' : 'Unarchived',
      () => { const st = stateRef.current.stories.find((x) => x.id === storyId); return !!st && !!st.archived === archiving; },
      () => toggleArchiveStory(storyId, true),
      { icon: 'archive-outline' },
    );
  }, [requireUser]);

  const markStoryViewed = useCallback((storyId: ID) => {
    const me = stateRef.current.currentUserId;
    const story = stateRef.current.stories.find((st) => st.id === storyId);
    if (live(me, storyId) && story && !story.viewedBy.includes(me!)) remote.recordStoryView(storyId, me!);
    // Background work, like a like: this lands as the feed turns a page, and
    // done at once it redrew every screen in the middle of the swipe.
    startTransition(() => setState((prev) => {
      const me = prev.currentUserId;
      const story = prev.stories.find((s) => s.id === storyId);
      if (!me || !story || story.viewedBy.includes(me)) return prev;
      return { ...prev, stories: prev.stories.map((s) => (s.id === storyId ? { ...s, viewedBy: [...s.viewedBy, me] } : s)) };
    }));
  }, []);

  const toggleLikeStory = useCallback(
    (storyId: ID) => {
      const me = requireUser();
      const now = stateRef.current.stories.find((st) => st.id === storyId);
      if (now) now.likedBy.includes(me) ? haptics.untap() : haptics.reward();
      if (live(me, storyId) && now) remote.setStoryLike(storyId, me, !now.likedBy.includes(me));
      setState((prev) => {
        const story = prev.stories.find((st) => st.id === storyId);
        const liking = !!story && !story.likedBy.includes(me);
        const next: AppState = {
          ...prev,
          stories: prev.stories.map((st) =>
            st.id === storyId
              ? { ...st, likedBy: st.likedBy.includes(me) ? st.likedBy.filter((id) => id !== me) : [...st.likedBy, me] }
              : st,
          ),
        };
        return liking && story && story.authorId !== me
          ? withNotification(next, { userId: story.authorId, actorId: me, kind: 'like', targetId: story.id, targetKind: 'hit', preview: story.caption ? snippet(story.caption) : undefined })
          : next;
      });
    },
    [requireUser],
  );

  const toggleLikeComment = useCallback(
    (commentId: ID) => {
      const me = requireUser();
      const comment = stateRef.current.comments.find((c) => c.id === commentId);
      if (!comment) return;
      const liking = !comment.likedBy.includes(me);
      liking ? haptics.reward() : haptics.untap();
      if (live(me, commentId)) {
        const onHit = stateRef.current.stories.some((st) => st.id === comment.postId);
        remote.setCommentLike(commentId, me, liking, onHit);
      }
      setState((prev) => {
        const next: AppState = {
          ...prev,
          comments: prev.comments.map((c) => (c.id === commentId ? { ...c, likedBy: liking ? [...c.likedBy, me] : c.likedBy.filter((id) => id !== me) } : c)),
        };
        if (!liking) return next;
        const onHit = prev.stories.some((st) => st.id === comment.postId);
        return withNotification(next, { userId: comment.authorId, actorId: me, kind: 'like', targetId: comment.postId, targetKind: onHit ? 'hit' : 'post', preview: snippet(comment.body) });
      });
    },
    [requireUser],
  );

  /**
   * Photo comments still on their way up (the photo uploads first, then the
   * comment is saved), and any of those deleted meanwhile: a delete during the
   * upload is remembered, so the upload finishing never puts the comment back.
   */
  const uploadingComments = useRef(new Set<ID>()).current;
  const withdrawnComments = useRef(new Set<ID>()).current;

  /**
   * A comment refused for its words (migration 117), or not saved at all,
   * comes off the list again; says which, so the box can have the words back.
   * Not saved is said here (the refusal says itself). `photoOnly`: a photo
   * with no words, which the database refuses until migration 125 runs.
   */
  const takeBackComment = (commentId: ID, result: 'blocked' | 'failed' | undefined, photoOnly = false): 'blocked' | 'failed' | undefined => {
    if (!result) return undefined;
    setState((prev) => dropComment(prev, commentId));
    if (result === 'failed') showToast({ title: 'Your comment wasn’t posted', body: photoOnly ? 'Add a few words with the photo, or try again in a moment.' : 'Check your connection and try again.', icon: 'alert-circle-outline' });
    return result;
  };

  const addStoryComment = useCallback(
    (storyId: ID, body: string, replyTo?: ID): Promise<'blocked' | 'failed' | undefined> => {
      const me = requireUser();
      const comment: Comment = {
        id: nextId('c'), postId: storyId, authorId: me, body, createdAt: new Date().toISOString(), likedBy: [],
        ...replyFields(stateRef.current.comments, replyTo, storyId),
      };
      haptics.commit();
      // A plain comment has no parent; only a reply needs its parent to be a saved row.
      // Refused for its words (migration 117): it comes off the list again (the toast says why), and the box gets the words back.
      const saved = live(me, storyId) && (!comment.parentId || live(comment.parentId))
        ? remote.insertStoryComment(comment).then((r) => takeBackComment(comment.id, r), () => undefined)
        : Promise.resolve<'blocked' | 'failed' | undefined>(undefined);
      setState((prev) => {
        const story = prev.stories.find((st) => st.id === storyId);
        const next: AppState = {
          ...prev,
          comments: [...prev.comments, comment],
          stories: prev.stories.map((st) => (st.id === storyId ? { ...st, commentIds: [...st.commentIds, comment.id] } : st)),
        };
        return notifyComment(next, comment, story?.authorId, 'hit', false);
      });
      return saved;
    },
    [requireUser],
  );

  const addComment = useCallback(
    (postId: ID, body: string, photo?: string, replyTo?: ID): Promise<'blocked' | 'failed' | undefined> => {
      const me = requireUser();
      const comment: Comment = {
        id: nextId('c'),
        postId,
        authorId: me,
        body,
        createdAt: new Date().toISOString(),
        likedBy: [],
        // Shows straight away from the phone; the web address replaces it once uploaded.
        ...(photo ? { imageUrl: photo } : {}),
        // A reply sits under its thread's top comment and answers the one tapped.
        ...replyFields(stateRef.current.comments, replyTo, postId),
      };
      haptics.commit();
      let saved: Promise<'blocked' | 'failed' | undefined> = Promise.resolve(undefined);
      // A plain comment has no parent; only a reply needs its parent to be a saved row.
      if (live(me, postId) && (!comment.parentId || live(comment.parentId))) {
        // Refused for its words (migration 117): it comes off the list again (the toast says why), and the box gets the words back.
        if (!photo) saved = remote.insertComment(comment).then((r) => takeBackComment(comment.id, r), () => undefined);
        else {
          uploadingComments.add(comment.id);
          saved = (async (): Promise<'blocked' | 'failed' | undefined> => {
            // Shrunk first (about 1080 px, a couple of hundred KB), then uploaded, then saved with its address.
            let imageUrl: string | undefined;
            // The words beyond the "@them" a reply starts with: a reply that was only a photo has none.
            const said = (comment.parentId ? body.replace(/^@[A-Za-z0-9_]+\s*/, '') : body).trim();
            try { imageUrl = await uploadMedia(me, await shrinkPhoto(photo), 'photo'); }
            catch {
              if (!withdrawnComments.has(comment.id)) showToast({ title: 'The photo didn’t upload', body: said ? 'Your comment was posted without it.' : 'Your comment wasn’t posted. Try again in a moment.', icon: 'alert-circle-outline' });
            }
            // Deleted while its photo was uploading: never saved.
            if (withdrawnComments.has(comment.id)) return undefined;
            // A comment that was only a photo, which did not upload, is not saved
            // empty: it leaves the thread rather than staying as a blank row, and
            // its photo goes back into the box ('failed') to try again.
            if (!imageUrl && !said) { setState((prev) => dropComment(prev, comment.id)); return 'failed'; }
            setState((prev) => ({ ...prev, comments: imageUrl ? prev.comments.map((c) => (c.id === comment.id ? { ...c, imageUrl } : c)) : prev.comments.map((c) => (c.id === comment.id ? { ...c, imageUrl: undefined } : c)) }));
            const result = await remote.insertComment({ ...comment, imageUrl });
            // Deleted while it was being saved: taken off the server again once it is there.
            if (withdrawnComments.has(comment.id)) { if (!result) void remote.deleteComment(comment.id, false); return undefined; }
            return takeBackComment(comment.id, result, !said);
          })().catch(() => undefined).finally(() => { uploadingComments.delete(comment.id); withdrawnComments.delete(comment.id); });
        }
      }
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        const next: AppState = {
          ...prev,
          comments: [...prev.comments, comment],
          posts: prev.posts.map((p) =>
            p.id === postId ? { ...p, commentIds: [...p.commentIds, comment.id] } : p,
          ),
        };
        return notifyComment(next, comment, post?.authorId, 'post', true);
      });
      return saved;
    },
    [requireUser],
  );

  /**
   * Deletes a comment (on a post or an Instant) with its replies: your own,
   * or anyone's under something of yours (migration 125). Gone at once; if
   * the server does not take it, it comes back and says so.
   */
  const deleteComment = useCallback((commentId: ID) => {
    const me = requireUser();
    const s = stateRef.current;
    const comment = s.comments.find((c) => c.id === commentId);
    if (!comment) return;
    const onHit = s.stories.some((st) => st.id === comment.postId);
    const owner = onHit ? s.stories.find((st) => st.id === comment.postId)?.authorId : s.posts.find((p) => p.id === comment.postId)?.authorId;
    if (comment.authorId !== me && owner !== me) return;
    haptics.commit();
    const gone = s.comments.filter((c) => c.id === commentId || c.parentId === commentId);
    setState((prev) => dropComment(prev, commentId));
    // Still uploading its photo: there is nothing on the server yet, and the upload is told to stop short (addComment).
    if (uploadingComments.has(commentId)) { withdrawnComments.add(commentId); return; }
    if (!live(me, commentId)) return;
    void remote.deleteComment(commentId, onHit).then((ok) => {
      if (ok || stateRef.current.currentUserId !== me) return;
      setState((prev) => putBackComments(prev, gone));
      showToast({ title: 'Couldn’t delete the comment', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  /** Your own Instant, gone for good with its likes and comments. If the server does not take it, it comes back and says so. */
  const deleteStory = useCallback((storyId: ID) => {
    const me = requireUser();
    const s = stateRef.current;
    const story = s.stories.find((st) => st.id === storyId);
    if (!story || story.authorId !== me) return;
    haptics.commit();
    const at = s.stories.indexOf(story);
    const itsComments = s.comments.filter((c) => c.postId === storyId);
    setState((prev) => ({ ...prev, stories: prev.stories.filter((st) => st.id !== storyId), comments: prev.comments.filter((c) => c.postId !== storyId) }));
    if (!live(me, storyId)) return;
    void remote.deleteStory(storyId).then((ok) => {
      if (ok || stateRef.current.currentUserId !== me) return;
      setState((prev) => {
        if (prev.stories.some((st) => st.id === storyId)) return prev;
        const stories = [...prev.stories];
        stories.splice(Math.min(at, stories.length), 0, story);
        const have = new Set(prev.comments.map((c) => c.id));
        return { ...prev, stories, comments: [...prev.comments, ...itsComments.filter((c) => !have.has(c.id))] };
      });
      showToast({ title: 'Couldn’t delete your Instant', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  // An open comment sheet (or Instant page) hears new and deleted comments on
  // what it shows, and catches up on any it missed each time it connects.
  const watchComments = useCallback((targetId: ID, kind: 'post' | 'hit') => {
    if (!live(stateRef.current.currentUserId, targetId)) return () => undefined;
    try {
      const me = stateRef.current.currentUserId;
      const ownerId = kind === 'hit' ? stateRef.current.stories.find((st) => st.id === targetId)?.authorId : stateRef.current.posts.find((p) => p.id === targetId)?.authorId;
      return remote.onComments({ id: targetId, kind, mine: !!me && ownerId === me }, {
        added: (comment) => setState((prev) => addLiveComments(prev, [comment], kind)),
        removed: (commentId) => setState((prev) => dropComment(prev, commentId)),
        connected: () => {
          if (kind !== 'post') return;
          void remote.fetchPost(targetId).then((got) => { if (got) setState((prev) => addLiveComments(prev, got.comments, 'post')); }).catch(() => undefined);
        },
      });
    } catch { return () => undefined; /* live updates are a nicety */ }
  }, []);

  const addQuestion = useCallback(
    (input: NewQuestionInput): ID => {
      haptics.commit();
      const me = requireUser();
      const { poll, ...rest } = input;
      const options = poll?.map((o) => o.trim()).filter(Boolean).slice(0, 4);
      const question: Question = {
        id: nextId('q'),
        authorId: me,
        createdAt: new Date().toISOString(),
        votes: 0,
        votedBy: {},
        answerIds: [],
        ...rest,
        poll: options && options.length >= 2 ? { options, counts: options.map(() => 0) } : undefined,
      };
      setState((prev) => celebratePosted({ ...prev, questions: [question, ...prev.questions] }, {
        userId: me, targetId: question.id, targetKind: 'question', preview: snippet(question.title),
        title: 'Question posted', body: 'The community can see it now.',
        href: `/question/${question.id}`, icon: 'chatbubbles',
      }));
      // The poll is saved once its thread is, since it hangs off the thread.
      if (live(me, question.id)) void remote.upsertQuestion(question).then((r) => {
        // Refused for its words (migration 117): it comes down again (the toast says why).
        if (r === 'blocked') { setState((prev) => ({ ...prev, questions: prev.questions.filter((q) => q.id !== question.id) })); return; }
        // Not saved for any other reason (offline, say): it comes down too, with its
        // "posted" note, rather than looking posted and vanishing on the next open.
        if (r === 'failed') {
          setState((prev) => ({
            ...prev,
            questions: prev.questions.filter((q) => q.id !== question.id),
            notifications: prev.notifications.filter((n) => !(n.kind === 'posted' && n.targetId === question.id)),
          }));
          // What was typed is kept: "Post again" opens Ask the room with it filled in.
          keepUnsentThread({ title: question.title, body: question.body, topic: question.topic, poll: options && options.length >= 2 ? options : undefined });
          showToast({ title: 'Your thread didn’t post', body: 'Your words are kept. Check your connection, then post it again.', icon: 'alert-circle-outline', action: { label: 'Post again', onPress: () => router.push('/ask') } });
          return;
        }
        if (question.poll) void remote.insertPoll(question.id, question.poll.options);
      });
      return question.id;
    },
    [requireUser],
  );

  const votePoll = useCallback((questionId: ID, option: number) => {
    const me = requireUser();
    haptics.tap();
    setState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId || !q.poll || q.poll.myVote === option) return q;
        const counts = [...q.poll.counts];
        if (q.poll.myVote !== undefined) counts[q.poll.myVote] = Math.max(0, (counts[q.poll.myVote] ?? 0) - 1);
        counts[option] = (counts[option] ?? 0) + 1;
        return { ...q, poll: { ...q.poll, counts, myVote: option } };
      }),
    }));
    if (live(me, questionId)) void remote.votePoll(questionId, option);
  }, [requireUser]);

  const voteQuestion = useCallback(
    (questionId: ID, direction: 1 | -1) => {
      haptics.tap();
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === questionId ? applyVote(q, me, direction) : q)),
      }));
      if (live(me, questionId)) void remote.voteQuestion(questionId, direction);
    },
    [requireUser],
  );

  const voteAnswer = useCallback(
    (answerId: ID, direction: 1 | -1) => {
      haptics.tap();
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        answers: prev.answers.map((a) => (a.id === answerId ? applyVote(a, me, direction) : a)),
      }));
      if (live(me, answerId)) void remote.voteAnswer(answerId, direction);
    },
    [requireUser],
  );

  // A reply is saved in the background, its picture or clip going up first.
  // These let it be deleted meanwhile: the delete waits for that save (true
  // once it reached the server), and one deleted before then is never saved.
  const answerSaves = useRef(new Map<ID, Promise<boolean>>());
  const answersDeleted = useRef(new Set<ID>());

  const addAnswer = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID, media?: Answer['media']): Promise<'blocked' | 'failed' | undefined> => {
      haptics.commit();
      const me = requireUser();
      let made: Answer | null = null;
      setState((prev) => {
        const author = prev.users.find((u) => u.id === me);
        const answer: Answer = {
          id: nextId('a'),
          parentAnswerId: prev.answers.some(a => a.id === parentAnswerId && a.questionId === questionId) ? parentAnswerId : undefined,
          questionId,
          authorId: me,
          body,
          createdAt: new Date().toISOString(),
          votes: 0,
          votedBy: {},
          fromCoach: Boolean(author?.isCoach),
          media,
        };
        made = answer;
        const question = prev.questions.find((q) => q.id === questionId);
        const parent = prev.answers.find((a) => a.id === answer.parentAnswerId);
        let next: AppState = {
          ...prev,
          answers: [...prev.answers, answer],
          questions: prev.questions.map((q) =>
            q.id === questionId ? { ...q, answerIds: [...q.answerIds, answer.id] } : q,
          ),
        };
        if (question) {
          next = withNotification(next, {
            userId: question.authorId,
            actorId: me,
            kind: 'answer',
            targetId: question.id,
            targetKind: 'question',
            preview: snippet(body),
          });
        }
        // A reply under someone else's answer should reach them too.
        if (parent && parent.authorId !== question?.authorId) {
          next = withNotification(next, {
            userId: parent.authorId,
            actorId: me,
            kind: 'answer',
            targetId: questionId,
            targetKind: 'question',
            preview: snippet(body),
          });
        }
        return next;
      });
      let result: Promise<'blocked' | 'failed' | undefined> = Promise.resolve(undefined);
      if (made && live(me, questionId)) {
        const answer: Answer = made;
        const deleted = () => answersDeleted.current.has(answer.id);
        let refused: 'blocked' | 'failed' | undefined;
        // A reply that did not save comes off the thread again, so it never looks posted and then vanishes.
        const takeBack = () => setState((prev) => ({
          ...prev,
          answers: prev.answers.filter((a) => a.id !== answer.id),
          questions: prev.questions.map((q) => (q.id === answer.questionId ? { ...q, answerIds: q.answerIds.filter((id) => id !== answer.id) } : q)),
        }));
        const didntPost = () => showToast({ title: 'Your reply didn’t post', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
        const saving = (async () => {
          // A picture or clip from this device goes up first; the reply is saved with its web address.
          let hosted = answer.media;
          if (hosted && isLocalMedia(hosted.url)) {
            try {
              const url = await uploadMedia(me, hosted.url, hosted.kind);
              const thumb = hosted.thumb && isLocalMedia(hosted.thumb) ? (hosted.kind === 'photo' ? url : await uploadMedia(me, hosted.thumb, 'photo')) : hosted.thumb;
              hosted = { ...hosted, url, thumb };
            } catch {
              hosted = undefined;
              // A reply that was only a picture, which did not upload, is not saved empty, nor left on the thread empty.
              if (!answer.body.trim()) {
                if (!deleted()) { takeBack(); didntPost(); refused = 'failed'; }
                return false;
              }
              if (!deleted()) showToast({ title: 'The photo or video didn’t upload', body: 'Your reply was posted without it.', icon: 'alert-circle-outline' });
            }
            const settled = hosted;
            if (!deleted()) setState((prev) => ({ ...prev, answers: prev.answers.map((a) => (a.id === answer.id ? { ...a, media: settled } : a)) }));
          }
          // Deleted while it went up: never saved.
          if (deleted()) return false;
          if (!hosted && !answer.body.trim()) return false;
          const r = await remote.upsertAnswer({ ...answer, media: hosted });
          if (r) {
            // Refused for its words (migration 117; the toast says why), or not saved at all
            // (offline, say): it comes off the thread again, and the box gets the words back.
            refused = r;
            if (!deleted()) { takeBack(); if (r === 'failed') didntPost(); }
            return false;
          }
          return true;
        })().catch(() => false);
        answerSaves.current.set(answer.id, saving);
        void saving.then(() => answerSaves.current.delete(answer.id));
        result = saving.then(() => refused);
      }
      setState((prev) => notifyMentions(prev, body, me, questionId, 'question', prev.questions.find((q) => q.id === questionId)?.authorId));
      return result;
    },
    [requireUser],
  );

  const submitCoachingRequest = useCallback(
    (coachId: ID, serviceId: ID, question: string, videoLabel?: string): ID => {
      const me = requireUser();
      const request: CoachingRequest = {
        id: nextId('cr'),
        coachId,
        userId: me,
        serviceId,
        question,
        videoLabel,
        status: 'submitted',
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, coachingRequests: [request, ...prev.coachingRequests] }));
      if (live(me, request.id)) void remote.insertCoachingRequest(request);
      return request.id;
    },
    [requireUser],
  );

  /* ------------------------------ Ask a coach ----------------------------- */

  // A question with a clip is only saved once the clip has uploaded. These
  // two let one be deleted in the meantime: nothing to delete on the server
  // yet, and the upload, when it finishes, must not save it after all.
  const coachClipsUploading = useRef(new Set<ID>());
  const coachQuestionsDeleted = useRef(new Set<ID>());

  const askCoach = useCallback(
    (input: NewCoachQuestionInput): ID => {
      const me = requireUser();
      const question: CoachQuestion = {
        id: nextId('cq'),
        authorId: me,
        createdAt: new Date().toISOString(),
        replyIds: [],
        resolved: false,
        ...input,
      };
      setState((prev) => ({ ...prev, coachQuestions: [question, ...prev.coachQuestions] }));
      // Refused for its words (migration 117), or not saved at all (no
      // connection, a rule that said no): it comes down again, rather than
      // wait for an answer to a question no coach can see. The words toast
      // says why for the first; this one for the rest.
      const saveQuestion = (q: CoachQuestion) => remote.upsertCoachQuestion(q).catch(() => 'failed' as const).then((r) => {
        if (r === 'blocked' || r === 'failed') setState((prev) => ({ ...prev, coachQuestions: prev.coachQuestions.filter((x) => x.id !== q.id) }));
        if (r === 'failed') {
          // What was typed is kept: "Ask again" opens Ask a coach with it filled in.
          keepUnsentCoachQuestion({ title: q.title, body: q.body, specialty: q.specialty });
          showToast({ title: 'Your question didn’t post', body: 'Your words are kept. Check your connection, then ask again.', icon: 'alert-circle-outline', action: { label: 'Ask again', onPress: () => router.push('/ask-coach') } });
        }
        return r;
      });
      if (live(me, question.id)) {
        // A clip still on this phone goes up first; the question is saved
        // pointing at the uploaded copy, so coaches can actually watch it.
        const local = question.videoUrl && isLocalMedia(question.videoUrl) ? question.videoUrl : null;
        if (!local) void saveQuestion(question);
        else {
          startUpload(question.id, 'Uploading your clip');
          coachClipsUploading.current.add(question.id);
          void uploadMedia(me, local, 'video', (f) => setUploadProgress(question.id, f))
            .then((videoUrl) => {
              coachClipsUploading.current.delete(question.id);
              // Deleted while it went up: the strip is already gone (see
              // deleteCoachQuestion), so no "Posted" for a question that isn't there.
              if (coachQuestionsDeleted.current.has(question.id)) return;
              finishUpload(question.id);
              const saved = { ...question, videoUrl };
              setState((prev) => ({ ...prev, coachQuestions: prev.coachQuestions.map((q) => (q.id === question.id ? saved : q)) }));
              return saveQuestion(saved);
            })
            .catch((e: Error) => {
              // The question still goes up, without the clip, rather than not at all.
              coachClipsUploading.current.delete(question.id);
              if (coachQuestionsDeleted.current.has(question.id)) return;
              finishUpload(question.id, false, e.message);
              const saved = { ...question, videoUrl: undefined, mediaLabel: undefined };
              setState((prev) => ({ ...prev, coachQuestions: prev.coachQuestions.map((q) => (q.id === question.id ? saved : q)) }));
              void saveQuestion(saved);
              showToast({ title: 'Your clip did not upload', body: `The question is up without it. ${e.message}`, icon: 'alert-circle-outline' });
            });
        }
      }
      return question.id;
    },
    [requireUser],
  );

  const replyToCoachQuestion = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID): Promise<'blocked' | 'failed' | undefined> => {
      const me = requireUser();
      const reply: CoachReply = {
        id: nextId('cr'),
        questionId,
        coachUserId: me,
        body,
        createdAt: new Date().toISOString(),
        helpfulBy: [],
      };
      haptics.commit();
      const saved = live(me, questionId) ? remote.insertCoachReply(reply).catch(() => 'failed' as const).then((r): 'blocked' | 'failed' | undefined => {
        if (r !== 'blocked' && r !== 'failed') return undefined;
        // Refused for its words (migration 117), or not saved at all (no
        // connection, or a block between you and the asker, migration 115):
        // it comes off the question again, a toast says why, and the box
        // gets the words back.
        setState((prev) => ({
          ...prev,
          coachReplies: prev.coachReplies.filter((x) => x.id !== reply.id),
          coachQuestions: prev.coachQuestions.map((q) => (q.id === questionId ? { ...q, replyIds: q.replyIds.filter((id) => id !== reply.id) } : q)),
        }));
        if (r === 'failed') showToast({ title: 'Your reply didn’t post', body: 'Check your connection and try again.', icon: 'alert-circle-outline' });
        return r;
      }) : Promise.resolve(undefined);
      setState((prev) => {
        const question = prev.coachQuestions.find((q) => q.id === questionId);
        const next: AppState = {
          ...prev,
          coachReplies: [...prev.coachReplies, reply],
          coachQuestions: prev.coachQuestions.map((q) =>
            q.id === questionId ? { ...q, replyIds: [...q.replyIds, reply.id] } : q,
          ),
        };
        return question
          ? withNotification(next, {
              userId: question.authorId,
              actorId: me,
              kind: 'coach-reply',
              targetId: question.id,
              targetKind: 'coach-question',
              preview: snippet(body),
            })
          : next;
      });
      return saved;
    },
    [requireUser],
  );

  const toggleReplyHelpful = useCallback(
    (replyId: ID) => {
      const me = requireUser();
      if (live(me, replyId)) void remote.toggleReplyHelpful(replyId);
      setState((prev) => {
        const reply = prev.coachReplies.find((r) => r.id === replyId);
        const marking = !!reply && !reply.helpfulBy.includes(me);
        marking ? haptics.tap() : haptics.untap();
        const next: AppState = {
          ...prev,
          coachReplies: prev.coachReplies.map((r) =>
            r.id === replyId
              ? {
                  ...r,
                  helpfulBy: r.helpfulBy.includes(me)
                    ? r.helpfulBy.filter((id) => id !== me)
                    : [...r.helpfulBy, me],
                }
              : r,
          ),
        };
        return marking && reply
          ? withNotification(next, {
              userId: reply.coachUserId,
              actorId: me,
              kind: 'helpful',
              targetId: reply.questionId,
              targetKind: 'coach-question',
              preview: snippet(reply.body),
            })
          : next;
      });
    },
    [requireUser],
  );

  /* --------------------------- Coach application -------------------------- */

  const submitCoachApplication = useCallback(
    async (input: CoachApplicationInput, resume?: { uri: string; name: string; mimeType?: string }): Promise<ID> => {
      const me = requireUser();
      const application: CoachApplication = {
        id: nextId('ca'),
        userId: me,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        ...input,
      };
      // Sent first: the form only says "received" once the application is really on file.
      if (live(me)) await remote.submitCoachApplication(me, application, resume);
      haptics.commit();
      setState((prev) => ({ ...prev, coachApplications: [application, ...prev.coachApplications] }));
      return application.id;
    },
    [requireUser],
  );

  /* --------------------------------- Saved -------------------------------- */

  /**
   * Toggles your reaction on a message. Passing no emoji uses the double-tap
   * default; reacting again with the same emoji takes it back off.
   */
  const reactToMessage = useCallback((messageId: ID, emoji?: string) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    const message = s.messages.find((m) => m.id === messageId);
    // Event lines ("Mira added Dev") take no reactions.
    if (!me || !message || message.kind === 'system') return;
    const mark = emoji ?? s.defaultReaction;
    const toggled = (had?: Record<ID, string>) => {
      const reactions = { ...(had ?? {}) };
      if (reactions[me] === mark) delete reactions[me];
      else reactions[me] = mark;
      return reactions;
    };
    message.reactions?.[me] === mark ? haptics.untap() : haptics.tap();
    const before = message.reactions?.[me];
    const after = toggled(message.reactions)[me];
    setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, reactions: toggled(m.reactions) } : m)) }));
    // Saved after it shows. The server changes only your own reaction, so one
    // someone else left a moment ago stays; the live update then brings
    // everyone's reactions as they stand.
    if (!live(me, messageId)) return;
    void remote.toggleReaction(messageId, mark, toggled(message.reactions)).catch(() => null).then((saved) => {
      if (saved) return;
      // Not saved: your reaction goes back to what it was, unless you have changed it again since.
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== messageId || m.reactions?.[me] !== after) return m;
          const reactions = { ...(m.reactions ?? {}) };
          if (before) reactions[me] = before;
          else delete reactions[me];
          return { ...m, reactions };
        }),
      }));
      showToast({ title: 'Your reaction didn’t save', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, []);

  const setDefaultReaction = useCallback((emoji: string) => {
    setState((prev) => ({ ...prev, defaultReaction: emoji }));
    try {
      if (Platform.OS === 'web') localStorage.setItem(DEFAULT_REACTION_KEY, emoji);
      else void AsyncStorage.setItem(DEFAULT_REACTION_KEY, emoji).catch(() => {});
    } catch {}
  }, []);
  // A phone keeps it too, read once at start (a browser's is read straight away, above).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(DEFAULT_REACTION_KEY)
      .then((emoji) => { if (emoji) setState((prev) => (prev.defaultReaction === emoji ? prev : { ...prev, defaultReaction: emoji })); })
      .catch(() => {});
  }, []);

  const markNotificationsRead = useCallback(() => {
    const me = stateRef.current.currentUserId;
    const unread = stateRef.current.notifications.filter((n) => !n.read && n.userId === me && UUID.test(n.id)).map((n) => n.id);
    if (me && live(me) && unread.length) void remote.markNotificationsRead(unread);
    setState((prev) =>
      prev.notifications.some((n) => !n.read)
        ? { ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }
        : prev,
    );
  }, []);

  const markNotificationRead = useCallback((notificationId: ID) => {
    const me = stateRef.current.currentUserId;
    if (me && live(me, notificationId)) void remote.markNotificationsRead([notificationId]);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  // Several workouts found at once, opened as their list: their rows read in one go, one ask of the server.
  // Every row of the go they were found in too (one about a copy, or a workout since taken back), so its one row is read.
  const markActivityNotesRead = useCallback((activityIds: ID[]) => {
    const me = stateRef.current.currentUserId;
    const theirs = stateRef.current.notifications.filter((n) => n.userId === me);
    const rows = new Set(theirs.filter((n) => n.kind === 'activity' && activityIds.includes(n.targetId)).map((n) => n.id));
    for (const b of foundBursts(theirs, stateRef.current.detectedActivities)) {
      if (b.activityIds.some((id) => activityIds.includes(id))) for (const id of b.rowIds) rows.add(id);
    }
    const ofThese = (n: Notification) => !n.read && n.userId === me && rows.has(n.id);
    const unread = stateRef.current.notifications.filter((n) => ofThese(n) && UUID.test(n.id)).map((n) => n.id);
    if (me && live(me) && unread.length) void remote.markNotificationsRead(unread);
    setState((prev) => (prev.notifications.some(ofThese) ? { ...prev, notifications: prev.notifications.map((n) => (ofThese(n) ? { ...n, read: true } : n)) } : prev));
  }, []);

  /**
   * Counts a view once per item per session. Without the guard, scrolling a clip
   * back into sight would inflate the number every time it passed.
   */
  const seenThisSession = useRef<Set<string>>(new Set());
  // Follows fetched on demand join the ones already here, once each.
  const mergeFollowEdges = useCallback((edges: { followerId: ID; followingId: ID }[]) => {
    if (!edges.length) return;
    setState((prev) => {
      const key = (e: { followerId: ID; followingId: ID }) => `${e.followerId}>${e.followingId}`;
      const have = new Set(prev.followEdges.map(key));
      const add = edges.filter((e) => !have.has(key(e)));
      return add.length ? { ...prev, followEdges: [...prev.followEdges, ...add] } : prev;
    });
  }, []);
  // One page of posts at a time (the one on its way, if any), and one ask per profile per session.
  const loadingMore = useRef<Promise<Post[]> | null>(null);
  const loadedProfiles = useRef(new Set<ID>());
  const searchedTerms = useRef(new Set<string>());
  const loadedSaved = useRef(false);
  // Reports, for admins. The database decides who may read and act on them.
  const loadReports = useCallback(async (): Promise<AdminReport[] | null> => (live(stateRef.current.currentUserId) ? remote.fetchReports().catch(() => null) : []), []);
  const countOpenReports = useCallback(async (): Promise<number | null> => (live(stateRef.current.currentUserId) ? remote.countOpenReports().catch(() => null) : 0), []);
  const loadWaitlist = useCallback(async () => (live(stateRef.current.currentUserId) ? remote.fetchWaitlist() : []), []);
  const loadPostThumbs = useCallback(async (ids: ID[]) => (live(stateRef.current.currentUserId) ? remote.fetchPostThumbs(ids).catch(() => ({})) : {}), []);
  const loadCourtPosts = useCallback(async (at: { lat: number; lng: number }) => {
    // The feed already has the newest; a court's card adds whatever the database has on top.
    const near = (p: Post) => !!p.court && !p.archived && Math.abs(p.court.lat - at.lat) <= 0.0025 && Math.abs(p.court.lng - at.lng) <= 0.003;
    const local = stateRef.current.posts.filter(near);
    const fetched = live(stateRef.current.currentUserId) ? await remote.fetchCourtPosts(at).catch(() => []) : [];
    const seen = new Set<ID>();
    return [...local, ...fetched].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 12);
  }, []);
  // A court's page: where its paging got to, per spot, and the asks under way,
  // so the map's card and the page asking at once share one request.
  const courtPages = useRef(new Map<string, { cursor: string | null; more: boolean; at: number }>());
  const courtAsks = useRef(new Map<string, Promise<{ more: boolean }>>());
  const loadCourtPage = useCallback(async (at: { lat: number; lng: number }, how: 'first' | 'older' | 'fresh' = 'first') => {
    // The demo has no database: the page shows the posts already here.
    const me = stateRef.current.currentUserId;
    if (!live(me)) return { more: false };
    // Per account, so a switch of account never reuses (or receives) another's answer.
    const key = `${me}|${at.lat.toFixed(4)},${at.lng.toFixed(4)}`;
    const asking = courtAsks.current.get(`${key}:${how}`);
    if (asking) return asking;
    const ask = (async () => {
      const page = courtPages.current.get(key);
      if (how === 'first' && page && Date.now() - page.at < 5 * 60_000) return { more: page.more };
      if (how === 'older' && (!page?.more || !page.cursor)) return { more: page?.more ?? false };
      const got = await remote.fetchCourtPage(at, how === 'older' ? page?.cursor ?? undefined : undefined);
      if (!got) throw new Error('court posts');
      if (stateRef.current.currentUserId !== me) return { more: false };
      setState((prev) => addPosts(prev, got));
      const now = courtPages.current.get(key);
      // A first page or a pull leaves a deeper "Show older" place where it was.
      const deeper = how !== 'older' && !!now?.cursor && !!got.oldest && now.cursor < got.oldest;
      const next = how === 'older'
        ? { cursor: got.oldest ?? now?.cursor ?? null, more: got.more, at: now?.at ?? Date.now() }
        : deeper && now ? { ...now, at: Date.now() } : { cursor: got.oldest, more: got.more, at: Date.now() };
      courtPages.current.set(key, next);
      return { more: next.more };
    })().finally(() => courtAsks.current.delete(`${key}:${how}`));
    courtAsks.current.set(`${key}:${how}`, ask);
    return ask;
  }, []);
  const betaInvites = useCallback(async (send: boolean) => (live(stateRef.current.currentUserId) ? remote.betaInvites(send) : null), []);
  const loadFirstDayStats = useCallback(async () => (live(stateRef.current.currentUserId) ? remote.fetchFirstDayStats() : null), []);
  const noteFirstMove = useCallback((move: FirstMove) => {
    const me = stateRef.current.currentUserId;
    // Kept on the phone too, so Profile stops asking for a first move once one is made (firstMoveDone).
    if (me && move !== 'later') markFirstMoveDone(me);
    if (live(me)) void remote.updateProfile(me!, { firstMove: move }).catch(() => undefined);
  }, []);
  const loadFirstPosts = useCallback(async () => {
    if (!live(stateRef.current.currentUserId)) return stateRef.current.posts.filter((p) => p.isFirst).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const got = await remote.fetchFirstPosts();
    if (!got) return [];
    setState((prev) => addPosts(prev, got));
    return got.posts;
  }, []);
  const loadSiteFeedback = useCallback(async () => (live(stateRef.current.currentUserId) ? remote.fetchSiteFeedback() : []), []);
  const removeFromWaitlistPage = useCallback(async (table: 'waitlist' | 'site_feedback', id: ID) => (live(stateRef.current.currentUserId, id) ? remote.removeFromWaitlistPage(table, id) : false), []);
  const loadReportedItem = useCallback(async (kind: ReportedItemKind, id: ID) => (live(stateRef.current.currentUserId, id) ? remote.fetchReportedItem(kind, id) : null), []);
  const suspendFromChat = useCallback(async (userId: ID, conversationId: ID) => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me, conversationId) || !UUID.test(userId)) return false;
    const reportId = await remote.insertReport(me, userId, 'profile', `from a reported chat (${conversationId})`, true).catch(() => null);
    if (!reportId) return false;
    const ok = await remote.moderateReport(reportId, 'suspend');
    if (ok) haptics.commit();
    return ok;
  }, []);
  const loadReportedChat = useCallback(async (conversationId: ID) => (live(stateRef.current.currentUserId, conversationId) ? remote.fetchReportedChat(conversationId).catch(() => null) : null), []);
  const loadReportEvidence = useCallback(async (reportId: ID) => (live(stateRef.current.currentUserId, reportId) ? remote.fetchReportEvidence(reportId).catch(() => []) : []), []);
  const decideReport = useCallback(async (reportId: ID, decision: 'remove' | 'restore' | 'suspend' | 'unsuspend' | 'dismiss') => {
    if (!live(stateRef.current.currentUserId, reportId)) return false;
    const ok = await remote.moderateReport(reportId, decision);
    if (ok) haptics.commit();
    return ok;
  }, []);
  const removeReportedMessage = useCallback(async (messageId: ID) => {
    if (!live(stateRef.current.currentUserId, messageId)) return false;
    const ok = await remote.removeReportedMessage(messageId);
    if (ok) haptics.commit();
    return ok;
  }, []);
  // Taking down and putting back (migration 108). Marked here first, then
  // the server; if it says no, the mark goes back to what it was, unless
  // something else has changed it meanwhile.
  const amAdmin = () => !!stateRef.current.users.find((u) => u.id === stateRef.current.currentUserId)?.isAdmin;
  const restoreRef = useRef<(kind: TakedownKind, id: ID, options?: { quiet?: boolean; reportId?: ID }) => Promise<ModerationResult>>(async () => 'failed');
  const takeDown = useCallback(async (kind: TakedownKind, id: ID, reason: TakedownReason, options: { note?: string; quiet?: boolean; reportId?: ID } = {}): Promise<ModerationResult> => {
    const { note, quiet = false, reportId } = options;
    const me = stateRef.current.currentUserId;
    if (!me || !amAdmin()) return 'refused';
    const before = heldItem(stateRef.current, kind, id)?.removed;
    const removed: Removed = { reason, at: new Date().toISOString() };
    haptics.commit();
    setState((prev) => markRemoved(prev, kind, id, removed));
    let result: ModerationResult = live(me, id) ? await remote.takeDown(kind, id, reason, note) : 'done';
    // Before migration 108, a reported post or Instant still comes down the old way (no reason kept, nobody told).
    const oldWay = result === 'not_ready' && !!reportId && (kind === 'post' || kind === 'hit') && live(reportId);
    if (oldWay) result = (await remote.moderateReport(reportId!, 'remove')) ? 'done' : 'failed';
    if (result !== 'done') {
      setState((prev) => (heldItem(prev, kind, id)?.removed === removed ? markRemoved(prev, kind, id, before) : prev));
      showToast({ ...moderationRefusal(result, false), icon: 'alert-circle-outline', long: true });
      return result;
    }
    const word = KIND_WORD[kind];
    const title = `${word.charAt(0).toUpperCase()}${word.slice(1)} taken down`;
    // The old way has no Restore of its own here: its report card has one.
    if (!quiet && oldWay) showToast({ title, body: 'Restore it from its report if you need to.', icon: 'eye-off-outline' });
    else if (!quiet) {
      // Its author has already been told (the notice and the phone alert go out
      // with the take-down), so the toast says so: Undo takes the notice back
      // out of their list, but an alert that reached their phone stays seen.
      const held = heldItem(stateRef.current, kind, id);
      const authorId = held?.authorId ?? held?.coachUserId;
      const author = authorId ? stateRef.current.users.find((u) => u.id === authorId) : undefined;
      const body = authorId === me ? 'Only admins can see it now.' : author ? `@${author.handle} was told why.` : 'Its author was told why.';
      offerUndo(title, () => {
        // Still down (or never here to see): Undo puts it back.
        const now = heldItem(stateRef.current, kind, id);
        return !now || !!now.removed;
      }, () => { void restoreRef.current(kind, id, { quiet: true, reportId }); }, { body, icon: 'eye-off-outline' });
    }
    return result;
  }, []);
  const restoreContent = useCallback(async (kind: TakedownKind, id: ID, options: { quiet?: boolean; reportId?: ID } = {}): Promise<ModerationResult> => {
    const { quiet = false, reportId } = options;
    const me = stateRef.current.currentUserId;
    if (!me || !amAdmin()) return 'refused';
    const before = heldItem(stateRef.current, kind, id)?.removed;
    haptics.commit();
    setState((prev) => markRemoved(prev, kind, id, undefined));
    let result: ModerationResult = live(me, id) ? await remote.restoreContent(kind, id) : 'done';
    // Before migration 108, a reported post or Instant still goes back the old way (its report opens again).
    if (result === 'not_ready' && !!reportId && (kind === 'post' || kind === 'hit') && live(reportId)) {
      result = (await remote.moderateReport(reportId, 'restore')) ? 'done' : 'failed';
    }
    if (result !== 'done') {
      setState((prev) => (before && !heldItem(prev, kind, id)?.removed ? markRemoved(prev, kind, id, before) : prev));
      showToast({ ...moderationRefusal(result, true), icon: 'alert-circle-outline', long: true });
      return result;
    }
    // An ask for a review about it is closed as restored (the server does the same, and tells its author).
    setState((prev) => closeReview(prev, kind, id, 'restored'));
    if (!quiet) showToast({ title: 'Put back', body: 'Everyone who could see it before can see it again.', icon: 'eye-outline' });
    return result;
  }, []);
  restoreRef.current = restoreContent;
  const loadRemoved = useCallback(async () => (live(stateRef.current.currentUserId) ? remote.fetchRemoved() : []), []);
  // Asking for a review (migration 20261006000139). Your own asks are read
  // once, the first time something removed of yours shows; the demo keeps
  // its asks on this phone. A read that fails is tried again a few times,
  // further apart each time, while "Ask for a review" works meanwhile.
  const reviewsAsking = useRef<Promise<void> | null>(null);
  const reviewsRetry = useRef<{ timer: ReturnType<typeof setTimeout> | null; tries: number; who: ID | null }>({ timer: null, tries: 0, who: null });
  const loadReviewRequests = useCallback(async (): Promise<void> => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    if (!live(me)) {
      setState((prev) => (prev.reviewRequests ? prev : { ...prev, reviewRequests: [] }));
      return;
    }
    if (reviewsAsking.current) return reviewsAsking.current;
    const retry = reviewsRetry.current;
    if (retry.timer) { clearTimeout(retry.timer); retry.timer = null; }
    if (retry.who !== me) { retry.who = me; retry.tries = 0; }
    const ask = (async () => {
      const got = await remote.fetchReviewRequests({ mine: me }).catch(() => null);
      if (stateRef.current.currentUserId !== me) return;
      if (got === null) {
        // Unknown for now: the ask still works (the server refuses a second one), and the read goes again
        // in 10, 30 and 90 seconds while it is still needed.
        setState((prev) => (prev.reviewsFailed ? prev : { ...prev, reviewsFailed: true }));
        if (retry.tries < 3) {
          const wait = [10, 30, 90][retry.tries] * 1000;
          retry.tries += 1;
          retry.timer = setTimeout(() => {
            retry.timer = null;
            if (stateRef.current.currentUserId === me && stateRef.current.reviewRequests === null) void loadReviewRequests();
          }, wait);
        }
        return;
      }
      retry.tries = 0;
      // A database without the migration: none asked, and the ask stays hidden until it is there.
      setState((prev) => ({ ...prev, reviewRequests: got === 'not_ready' ? [] : got, reviewsOff: got === 'not_ready', reviewsFailed: false }));
    })().finally(() => { reviewsAsking.current = null; });
    reviewsAsking.current = ask;
    return ask;
  }, []);
  useEffect(() => () => { const t = reviewsRetry.current.timer; if (t) clearTimeout(t); }, []);
  const askForReview = useCallback(async (kind: TakedownKind, id: ID, note?: string): Promise<ReviewAskResult> => {
    const me = stateRef.current.currentUserId;
    if (!me) return 'failed';
    const held = heldItem(stateRef.current, kind, id);
    const removedAt = held?.removed?.at;
    const words = note?.replace(/\s+/g, ' ').trim().slice(0, REVIEW_NOTE_MAX).trim() || undefined;
    // Kept here at once (the demo's only copy; for a real account, until the server's own row is read back).
    const keep = () => {
      if (!removedAt) return;
      const asked: ReviewRequest = { id: `review-${Date.now()}`, authorId: me, kind, targetId: id, note: words, status: 'open', removedAt, createdAt: new Date().toISOString() };
      setState((prev) => (prev.currentUserId !== me ? prev : { ...prev, reviewRequests: [asked, ...(prev.reviewRequests ?? []).filter((r) => !(r.kind === kind && r.targetId === id && r.status === 'open'))] }));
    };
    if (!live(me, id)) {
      if (!removedAt) return 'not_removed';
      if ((stateRef.current.reviewRequests ?? []).some((r) => r.kind === kind && r.targetId === id && (r.status === 'open' || r.removedAt === removedAt))) return 'already';
      keep();
      haptics.commit();
      return 'done';
    }
    const result = await remote.requestReview(kind, id, words);
    if (result === 'done') { haptics.commit(); keep(); }
    // Not on this database yet: the ask is hidden everywhere until a refresh finds it there.
    if (result === 'not_ready') setState((prev) => (prev.currentUserId !== me ? prev : { ...prev, reviewsOff: true, reviewRequests: prev.reviewRequests ?? [] }));
    if (result === 'done' || result === 'already') {
      // The server's own rows, so "Review asked" says what it holds.
      const got = await remote.fetchReviewRequests({ mine: me }).catch(() => null);
      if (Array.isArray(got) && stateRef.current.currentUserId === me) setState((prev) => ({ ...prev, reviewRequests: got, reviewsFailed: false }));
    }
    return result;
  }, []);
  const loadOpenReviews = useCallback(async (): Promise<ReviewRequest[] | 'not_ready' | null> => {
    const me = stateRef.current.currentUserId;
    if (!me || !amAdmin()) return [];
    if (!live(me)) return (stateRef.current.reviewRequests ?? []).filter((r) => r.status === 'open');
    return remote.fetchReviewRequests({ open: true }).catch(() => null);
  }, []);
  const keepRemoved = useCallback(async (kind: TakedownKind, id: ID): Promise<'done' | 'no_request' | ModerationResult> => {
    const me = stateRef.current.currentUserId;
    if (!me || !amAdmin()) return 'refused';
    const result = live(me, id) ? await remote.keepRemoved(kind, id).catch(() => 'failed' as const) : 'done';
    if (result === 'done' || result === 'no_request') {
      haptics.commit();
      setState((prev) => closeReview(prev, kind, id, 'kept'));
      return result;
    }
    showToast({
      title: result === 'refused' ? 'Only admins can do that' : result === 'not_ready' ? 'Reviews aren’t switched on yet' : result === 'gone' ? 'It’s already gone' : 'Couldn’t save that. Try again.',
      body: result === 'not_ready' ? 'It needs the database update (migration 20261006000139) first.' : undefined,
      icon: 'alert-circle-outline', long: true,
    });
    return result;
  }, []);
  // Opening someone's followers or following: their follows come in then.
  const loadFollowsOf = useCallback(async (userId: ID) => {
    if (!live(stateRef.current.currentUserId, userId)) return;
    mergeFollowEdges(await remote.fetchFollowEdges([userId], true));
  }, [mergeFollowEdges]);
  // Whether a chat is with someone you are blocked with (either way), so it cannot be written in.
  const isChatBlocked = useCallback(async (conversationId: ID) => {
    if (!live(stateRef.current.currentUserId, conversationId)) return false;
    return remote.isChatBlocked(conversationId);
  }, []);
  // A chat just opened: fetched as it stands (its people, name, photo and
  // admins as well as its messages), so it never shows an old copy for long.
  const syncConversation = useCallback((conversationId: ID) => refreshChat(conversationId, true), [refreshChat]);
  const watchTyping = useCallback((conversationId: ID, onTyping: (userId: ID, stopped?: boolean) => void) => {
    const me = stateRef.current.currentUserId;
    const none = { ping: () => undefined, stop: () => undefined, off: () => undefined };
    if (!me || !live(me, conversationId)) return none;
    const others = stateRef.current.conversations.find((c) => c.id === conversationId)?.participantIds ?? [];
    try { return remote.typing(conversationId, me, onTyping, others); } catch { return none; }
  }, []);
  // The chat list's "typing…": which of your chats someone is typing in. Returns the way to stop listening.
  const watchInboxTyping = useCallback((onTyping: (conversationId: ID, userId: ID, stopped?: boolean) => void) => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me)) return () => undefined;
    // Only a chat of yours, and only someone in it: anyone who shares any one
    // chat with you may send to this channel, and could otherwise claim to be
    // typing in a different chat, or to be someone else.
    const inChat = (conversationId: ID, userId: ID) =>
      !!stateRef.current.conversations.find((c) => c.id === conversationId)?.participantIds.includes(userId);
    try {
      return remote.inboxTyping(me, (conversationId, userId, stopped) => {
        if (inChat(conversationId, userId)) onTyping(conversationId, userId, stopped);
      });
    } catch { return () => undefined; }
  }, []);
  // Scrolling up in a chat: the page of messages before the oldest one here.
  const loadOlderMessages = useCallback(async (conversationId: ID) => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me, conversationId)) return { added: 0, more: false };
    // From the oldest the chat has loaded: a reply's original fetched from further back is not part of it.
    const byId = new Map(stateRef.current.messages.map((m) => [m.id, m]));
    const have = inOrder(stateRef.current.conversations.find((c) => c.id === conversationId)?.messageIds ?? [], byId);
    if (!have.length) return { added: 0, more: false };
    const oldest = have[0];
    const got = await remote.fetchOlderMessages(me, conversationId, oldest.createdAt).catch(() => null);
    if (!got) return { added: 0, more: null };
    const page = unhidden(me, got.messages);
    if (!page.length) return { added: 0, more: got.more };
    setState((prev) => {
      const known = new Set(prev.messages.map((m) => m.id));
      const fresh = page.filter((m) => !known.has(m.id));
      const chat = prev.conversations.find((c) => c.id === conversationId);
      // The whole page joins the chat, a reply's original already here among it too.
      if (!chat || page.every((m) => chat.messageIds.includes(m.id))) return prev;
      const messages = [...fresh, ...prev.messages];
      const inChat = inOrder([...page.map((m) => m.id), ...chat.messageIds], new Map(messages.map((m) => [m.id, m]))).map((m) => m.id);
      return { ...prev, messages, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, messageIds: inChat } : c)) };
    });
    return { added: page.length, more: got.more };
  }, []);
  /**
   * The feed nearing the end of what it holds: the page of posts older than
   * the last one asked for. Resolves with the posts that were added, so the
   * feed can put those pages on the end without re-ordering what you are
   * already looking at.
   */
  const loadMorePosts = useCallback((): Promise<Post[]> => {
    // Asked again while a page is on its way (the feed asks on every swipe,
    // and lets go of the earlier answer), it gets that same page, not nothing,
    // so the page is never skipped.
    if (loadingMore.current) return loadingMore.current;
    const { currentUserId: me, feed } = stateRef.current;
    if (!live(me) || !feed.more || !feed.cursor) return Promise.resolve([]);
    const cursor = feed.cursor;
    const run = (async () => {
      const got = await remote.fetchMorePosts(cursor);
      if (!got) { setState((prev) => ({ ...prev, feed: { ...prev.feed, more: false } })); return []; }
      const known = new Set(stateRef.current.posts.map((p) => p.id));
      const fresh = got.posts.filter((p) => !known.has(p.id));
      setState((prev) => ({
        ...addPosts(prev, got),
        // A page that came back empty of new posts still moves the cursor on,
        // so the next ask is for older ones and not the same page again.
        feed: { cursor: oldestOf(got.posts) ?? prev.feed.cursor, more: got.more },
      }));
      return fresh;
    })();
    loadingMore.current = run;
    const done = () => { if (loadingMore.current === run) loadingMore.current = null; };
    run.then(done, done);
    return run;
  }, []);
  /**
   * Opening a profile: that player's posts, however old, so their grid and
   * their counts are whole and not just whatever the feed happened to hold.
   * Asked once per player per session.
   */
  const loadPost = useCallback(async (postId: ID) => {
    if (stateRef.current.posts.some((p) => p.id === postId)) return true;
    if (!live(stateRef.current.currentUserId, postId)) return false;
    const got = await remote.fetchPost(postId);
    if (!got?.posts.length) return false;
    setState((prev) => addPosts(prev, got));
    return true;
  }, []);
  const loadPostsOf = useCallback(async (userId: ID) => {
    if (!live(stateRef.current.currentUserId, userId) || loadedProfiles.current.has(userId)) return;
    loadedProfiles.current.add(userId);
    const got = await remote.fetchUserPosts(userId);
    if (!got) return;
    setState((prev) => addSessionNames(addPosts(prev, got), got.posts));
  }, []);
  /**
   * Search looking past the posts the app happens to hold (the newest page,
   * plus feed pages scrolled and profiles opened): the matching posts are
   * fetched and kept like any others, so the search page finds them in place.
   */
  const searchPosts = useCallback(async (term: string) => {
    const key = term.trim().toLowerCase().replace(/\s+/g, ' ');
    if (key.length < 2 || searchedTerms.current.has(key)) return;
    searchedTerms.current.add(key);
    const got = live(stateRef.current.currentUserId) ? await remote.searchPosts(key).catch(() => null) : await apiSearchPosts(key);
    // A failed ask may be asked again on the next keystroke.
    if (!got) { searchedTerms.current.delete(key); return; }
    setState((prev) => addPosts(prev, got));
  }, []);
  /** Opening Saved: everything bookmarked, however far back, not only what the feed holds. */
  const loadSavedPosts = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me) || loadedSaved.current) return;
    loadedSaved.current = true;
    const got = await remote.fetchSavedPosts(me!);
    if (!got) return;
    setState((prev) => {
      const next = addPosts(prev, got);
      const ids = [...got.ids, ...prev.saved.postIds.filter((id) => !got.ids.includes(id))];
      return { ...next, saved: { ...next.saved, postIds: ids } };
    });
  }, []);
  // Opening a thread: all of its replies, not only the newest that came with the app.
  const loadThread = useCallback(async (questionId: ID) => {
    if (!live(stateRef.current.currentUserId, questionId)) return;
    // A thread older than the first load's 300 is fetched on its own first.
    if (!stateRef.current.questions.some((q) => q.id === questionId)) {
      const found = await remote.fetchQuestion(questionId);
      if (found) setState((prev) => (prev.questions.some((q) => q.id === questionId) ? prev : { ...prev, questions: [found, ...prev.questions] }));
    }
    // Replies of yours still being saved as this goes out may not be in what comes back.
    const saving = new Set(answerSaves.current.keys());
    const asked = Date.now();
    const replies = await remote.fetchThreadAnswers(questionId);
    if (!replies) return;
    setState((prev) => {
      // What the server sends is the thread now: its votes and pictures, and
      // no replies deleted since. Kept as well: replies of yours not saved
      // yet, or written after this went out. (Past the 1,000 a fetch brings,
      // the rest stay as they were.)
      const fresh = new Map(replies.map((r) => [r.id, r]));
      const whole = replies.length < 1000;
      const keep = (a: Answer) => !whole || saving.has(a.id) || answerSaves.current.has(a.id) || Date.parse(a.createdAt) >= asked;
      const kept = prev.answers.flatMap((a) => (a.questionId !== questionId ? [a] : fresh.has(a.id) ? [fresh.get(a.id)!] : keep(a) ? [a] : []));
      const known = new Set(kept.map((a) => a.id));
      const answers = [...kept, ...replies.filter((r) => !known.has(r.id))];
      const here = answers.filter((a) => a.questionId === questionId);
      // One your Hidden words hid (migration 117), or a reply under it, is not counted for you, the asker.
      const hiddenIds = new Set(here.filter((a) => a.hiddenByWords).map((a) => a.id));
      const inThread = here.filter((a) => !hiddenIds.has(a.id) && !(a.parentAnswerId && hiddenIds.has(a.parentAnswerId))).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((a) => a.id);
      return { ...prev, answers, questions: prev.questions.map((q) => (q.id === questionId ? { ...q, answerIds: inThread, acceptedAnswerId: q.acceptedAnswerId && !here.some((a) => a.id === q.acceptedAnswerId) ? undefined : q.acceptedAnswerId } : q)) };
    });
  }, []);
  // Only real accounts and real posts are recorded; the demo records nothing.
  const noteFeedSignal = useCallback((signal: FeedSignal) => {
    if (!live(stateRef.current.currentUserId, signal.id)) return;
    queueFeedSignal(signal);
  }, []);
  const recordView = useCallback((targetKind: 'post' | 'question', targetId: ID) => {
    const key = `${targetKind}:${targetId}`;
    if (seenThisSession.current.has(key)) return;
    seenThisSession.current.add(key);
    if (targetKind === 'post' && live(stateRef.current.currentUserId, targetId)) { remote.bumpViews(targetId); return; }
    // A view count is never what you are looking at: background work, so the
    // page turn that recorded it is not held up by every screen redrawing.
    startTransition(() => setState((prev) =>
      targetKind === 'post'
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === targetId ? { ...p, views: (p.views ?? 0) + 1 } : p,
            ),
          }
        : {
            ...prev,
            questions: prev.questions.map((q) =>
              q.id === targetId ? { ...q, views: (q.views ?? 0) + 1 } : q,
            ),
          },
    ));
  }, []);

  const toggleSavePost = useCallback((postId: ID, quiet?: boolean) => {
    // Which way from the last tap, not the store a beat behind (see `asked`).
    const key = `save:${postId}`;
    const saving = !intended(key, stateRef.current.saved.postIds.includes(postId));
    asked.current.set(key, { on: saving, at: Date.now() });
    {
      const me = stateRef.current.currentUserId;
      saving ? haptics.tap() : haptics.untap();
      if (live(me, postId)) {
        inTurn(key, () => remote.setSaved(postId, me!, saving), () => {
          asked.current.delete(key);
          setState((prev) => ({ ...prev, saved: { ...prev.saved, postIds: saving ? prev.saved.postIds.filter((id) => id !== postId) : prev.saved.postIds.includes(postId) ? prev.saved.postIds : [postId, ...prev.saved.postIds] } }));
        });
      }
      // Saving says so with the filled bookmark; taking one off can be a slip.
      if (!saving && !quiet) {
        offerUndo('Removed from saved', () => !stateRef.current.saved.postIds.includes(postId), () => toggleSavePost(postId, true), { icon: 'bookmark-outline' });
      }
    }
    setState((prev) => {
      const me = prev.currentUserId;
      // Set to what was asked, never flipped (see toggleLike).
      if (prev.saved.postIds.includes(postId) === saving) return prev;
      return {
        ...prev,
        saved: {
          ...prev.saved,
          postIds: saving
            ? [postId, ...prev.saved.postIds]
            : prev.saved.postIds.filter((id) => id !== postId),
        },
        // savedBy is the public tally; saved.postIds is just this user's shelf.
        posts: prev.posts.map((p) => {
          if (p.id !== postId || !me) return p;
          const savedBy = p.savedBy ?? [];
          return {
            ...p,
            savedBy: saving ? [...new Set([...savedBy, me])] : savedBy.filter((id) => id !== me),
          };
        }),
      };
    });
  }, []);

  const toggleSaveQuestion = useCallback((questionId: ID, quiet?: boolean) => {
    if (!quiet && stateRef.current.saved.questionIds.includes(questionId)) {
      offerUndo('Removed from saved', () => !stateRef.current.saved.questionIds.includes(questionId), () => toggleSaveQuestion(questionId, true), { icon: 'bookmark-outline' });
    }
    setState((prev) => {
      const me = prev.currentUserId;
      const saving = !prev.saved.questionIds.includes(questionId);
      saving ? haptics.tap() : haptics.untap();
      return {
        ...prev,
        saved: {
          ...prev.saved,
          questionIds: saving
            ? [questionId, ...prev.saved.questionIds]
            : prev.saved.questionIds.filter((id) => id !== questionId),
        },
        questions: prev.questions.map((q) => {
          if (q.id !== questionId || !me) return q;
          const savedBy = q.savedBy ?? [];
          return {
            ...q,
            savedBy: saving ? [...new Set([...savedBy, me])] : savedBy.filter((id) => id !== me),
          };
        }),
      };
    });
  }, []);

  /* ------------------------------- Messaging ------------------------------ */

  /*
   * A new one-to-one chat starts on this phone and reaches the server with
   * its first message (Instagram's way). Opening one and backing out leaves
   * nothing in the other person's inbox, and asks nothing of the server
   * (asking about someone who doesn't follow you counts towards the day's
   * limit, migration 109). The first message waits for the server to start
   * the chat (open_conversation) before it is saved: saved any sooner, the
   * database refused it as from someone not in the chat.
   */
  // Chats started here and not yet on the server: who each is with, by its id here.
  const draftChats = useRef(new Map<ID, ID>());
  // A chat being started right now, so two quick sends ask the server once.
  const startingChats = useRef(new Map<ID, Promise<ID | null | 'failed'>>());
  // Chats here the server keeps under another id (it already had one with
  // that person): the id each moved to, so a chat screen opened on the old one follows it.
  const foldedChats = useRef(new Map<ID, ID>());
  const resolveChatId = useCallback((conversationId: ID): ID => {
    let at = conversationId;
    for (let hops = 0; hops < 5 && foldedChats.current.has(at); hops += 1) at = foldedChats.current.get(at)!;
    return at;
  }, []);

  const isDraftChat = useCallback((conversationId: ID) => draftChats.current.has(resolveChatId(conversationId)), [resolveChatId]);

  /** Returns the existing 1:1 thread with a user, creating one if needed. A group with just the two of you is never it. */
  const openConversationWith = useCallback(
    (userId: ID): ID => {
      const me = requireUser();
      const existing = findDirectChat(stateRef.current.conversations, me, userId);
      if (existing) return existing.id;

      const conversation: Conversation = {
        id: nextId('cv'),
        participantIds: [me, userId],
        messageIds: [],
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
      };
      setState((prev) => ({ ...prev, conversations: [conversation, ...prev.conversations] }));
      // On this phone only, until its first message (startChat).
      if (live(me, userId)) draftChats.current.set(conversation.id, userId);
      return conversation.id;
    },
    [requireUser],
  );

  /**
   * Makes sure a chat is on the server before something is saved in it.
   * Any chat the server already has comes straight back. One started on this
   * phone is started there now (once, however many sends are waiting): the
   * server's id comes back, which is a different one when it already had a
   * chat with that person (this one folds into it). Null when the server
   * said no (blocked, past the day's limit, or someone not known to be an
   * adult who doesn't follow you): the chat and what was waiting in it go,
   * and a note says why. 'failed' when there was no answer: it stays on this
   * phone, and the next send (or a retry) asks again.
   */
  const startChat = useCallback((conversationId: ID): Promise<ID | null | 'failed'> => {
    const chatId = resolveChatId(conversationId);
    const other = draftChats.current.get(chatId);
    if (!other) return Promise.resolve(chatId);
    const asking = startingChats.current.get(chatId);
    if (asking) return asking;
    const me = stateRef.current.currentUserId;
    const ask = remote.openConversation(other, chatId).catch(() => 'failed' as const).then((standing): ID | null | 'failed' => {
      startingChats.current.delete(chatId);
      // Signed out or into another account meanwhile: nothing more to do here.
      if (standing === 'failed' || stateRef.current.currentUserId !== me) return 'failed';
      draftChats.current.delete(chatId);
      if (standing === null || standing === 'blocked' || standing === 'limit') {
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.filter((c) => c.id !== chatId),
          messages: prev.messages.filter((m) => m.conversationId !== chatId),
        }));
        showToast({ title: standing === 'blocked' ? "You can't message this account" : standing === 'limit' ? LIMIT_NOTE : chatLockNoteFor(stateRef.current.users, other), icon: 'lock-closed-outline', long: true });
        return null;
      }
      if (standing !== chatId) {
        // The database already had one: this one folds into it.
        foldedChats.current.set(chatId, standing);
        setState((prev) => foldChatInto(prev, chatId, standing));
      }
      return standing;
    });
    startingChats.current.set(chatId, ask);
    return ask;
  }, [resolveChatId]);

  /**
   * Saves one of your messages, starting its chat on the server first when
   * it is still only on this phone. 'gone' when the server would not start
   * the chat: the chat, this message with it, has already been taken away.
   */
  const saveMessage = useCallback(async (message: Message): Promise<'refused' | 'blocked' | 'failed' | 'gone' | void> => {
    const chatId = await startChat(message.conversationId);
    if (chatId === 'failed') return 'failed';
    if (chatId === null) return 'gone';
    return remote.insertMessage({ ...message, conversationId: chatId, sending: undefined, failed: undefined });
  }, [startChat]);

  const makeMessage = useCallback((conversationId: ID, senderId: ID, body: string, kind: Message['kind'] = 'text', sharedId?: ID): Message => ({
    id: nextId('m'), conversationId, senderId, body, createdAt: new Date().toISOString(), kind, sharedId,
  }), []);
  const appendMessage = useCallback(
    (prev: AppState, message: Message): AppState => {
      if (prev.messages.some((m) => m.id === message.id)) return prev;
      const { conversationId, senderId } = message;
      return {
        ...prev,
        messages: [...prev.messages, message],
        conversations: prev.conversations.map((c) =>
          c.id === conversationId
            // A message from the other person counts as unread until the thread is opened (an event line never does).
            ? { ...c, messageIds: [...c.messageIds, message.id], updatedAt: message.createdAt, unreadCount: senderId === prev.currentUserId || message.kind === 'system' ? c.unreadCount : (c.unreadCount ?? 0) + 1 }
            : c,
        ),
      };
    },
    [],
  );

  const demoIncoming = useCallback((kind: 'one' | 'group' | 'pile') => {
    const me = stateRef.current.currentUserId;
    if (isSupabaseConfigured || !me) return;
    const { conversations: chats, blockedIds: blocked } = stateRef.current;
    // Newest first, the way the inbox lists them; never a chat with someone you blocked.
    const open = chats
      .filter((c) => c.participantIds.includes(me) && c.participantIds.some((id) => id !== me && !blocked.includes(id)))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const direct = open.filter((c) => !isGroupChat(c));
    const groups = open.filter((c) => isGroupChat(c));
    // In a group, the reply comes from its last-listed member (June, in the demo's Saturday hitters).
    const sender = (c: Conversation) => c.participantIds.filter((id) => id !== me).pop()!;
    type Reply = { chat?: Conversation; body: string; court?: { name: string; lat: number; lng: number } };
    const plan: Reply[] = kind === 'group'
      ? [{ chat: groups[0], body: 'Running ten minutes late, but count me in.' }]
      : kind === 'pile'
        ? [
          { chat: direct[0], body: 'Running ten minutes late.' },
          { chat: direct[0], body: 'Save me a court?' },
          { chat: direct[1], body: 'Griffith Park Riverside Courts', court: { name: 'Griffith Park Riverside Courts', lat: 34.1105, lng: -118.2721 } },
          { chat: direct[2], body: 'Same time next week?' },
          { chat: groups[0], body: 'Who’s bringing balls?' },
        ]
        : [{ chat: direct[0], body: 'Running ten minutes late.' }];
    // A beat apart, the way real ones land, so the banner's queue can be seen working.
    plan.forEach(({ chat, body, court }, i) => {
      if (!chat) return;
      setTimeout(() => {
        const message: Message = court ? { ...makeMessage(chat.id, sender(chat), body), kind: 'court', place: court } : makeMessage(chat.id, sender(chat), body);
        setState((prev) => appendMessage(prev, message));
        heardMessage(message);
      }, i * 350);
    });
  }, [makeMessage, appendMessage]);

  // Your messages deleted while still "Sending…": the save already on its way
  // can't be stopped, so each is unsent the moment the server has it (see
  // calledBack), and it never reaches anyone.
  const withdrawn = useRef(new Set<ID>());
  /** Voice recordings this phone put up itself (deliverVoice): only these are ever taken down if their message never lands. */
  const voiceUploads = useRef(new Set<string>());
  /** After a message's save: true when it was deleted meanwhile, and it is then taken back off the server (its photos too). */
  const calledBack = (messageId: ID, result: 'refused' | 'blocked' | 'failed' | 'gone' | void, photos: ChatPhoto[] = []) => {
    if (!withdrawn.current.delete(messageId)) return false;
    // Refused (or its chat never started): it never got there. Failed: it may have got there all the same, so it is unsent anyway.
    if (result !== 'refused' && result !== 'blocked' && result !== 'gone') {
      const hosted = photos.map((p) => p.path).filter((path) => !isLocalMedia(path));
      void remote.unsendMessage(messageId).then(() => { if (hosted.length) void remote.removeChatPhotos(hosted); });
    }
    return true;
  };

  /**
   * A message refused for its words (migration 117): it would be refused on
   * every try, so it comes out of the chat rather than staying "Not sent",
   * and the toast says why. Its photos, already up, come down again.
   */
  const takeBackRefused = (message: Message, photos: ChatPhoto[] = []) => {
    // Found by the message, not its chat's id: a chat started with it may have taken the server's id meanwhile.
    setState((prev) => ({
      ...prev,
      messages: prev.messages.filter((m) => m.id !== message.id),
      conversations: prev.conversations.map((c) => (c.messageIds.includes(message.id) ? { ...c, messageIds: c.messageIds.filter((mid) => mid !== message.id) } : c)),
    }));
    const hosted = photos.map((p) => p.path).filter((path) => !isLocalMedia(path));
    if (hosted.length) void remote.removeChatPhotos(hosted);
    showToast({ title: 'Not sent', body: 'It has words that break CourtSide’s rules.', icon: 'alert-circle-outline', long: true });
  };

  const sendMessage = useCallback(
    (conversationId: ID, body: string, replyToId?: ID): Promise<'blocked' | undefined> => {
      haptics.commit();
      const me = requireUser();
      const trimmed = body.trim();
      if (!trimmed) return Promise.resolve(undefined);
      // A screen still on a new chat's first id: the id it goes by now.
      conversationId = resolveChatId(conversationId);
      const sending = live(me, conversationId);
      // "Sending…" under it until the server has it.
      const message: Message = { ...makeMessage(conversationId, me, trimmed), ...(replyToId ? { replyToId } : null), ...(sending ? { sending: true } : null) };
      setState((prev) => appendMessage(prev, message));
      if (!sending) return Promise.resolve(undefined);
      // A new chat's first message waits for the chat to start on the server (saveMessage).
      return saveMessage(message).catch(() => 'failed' as const).then((result): 'blocked' | undefined => {
        if (calledBack(message.id, result)) return undefined;
        // Its chat was refused: chat and message have gone, and the note said why.
        if (result === 'gone') return undefined;
        if (result === 'blocked') { takeBackRefused(message); return 'blocked'; }
        setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, sending: undefined, ...(result === 'failed' ? { failed: true } : null) } : m)) }));
        if (result === 'failed') return undefined;
        if (result !== 'refused') return undefined;
        // The id the chat goes by now (a new one may have taken the server's).
        const chatId = resolveChatId(conversationId);
        setState((prev) => ({
          ...prev,
          messages: prev.messages.filter((m) => m.id !== message.id),
          conversations: prev.conversations.map((c) => (c.id === chatId ? { ...c, messageIds: c.messageIds.filter((mid) => mid !== message.id) } : c)),
        }));
        // A block only locks one-to-one chats; in a group the likely reason is no longer being in it.
        const chat = stateRef.current.conversations.find((c) => c.id === chatId);
        // Re-read the group first: if you were taken out, that says so ("You’re no longer in …") and this note would be one too many.
        if (chat && isGroupChat(chat)) {
          void refreshChat(chatId).then(() => {
            if (stateRef.current.conversations.some((c) => c.id === chatId)) showToast({ title: 'You can’t send messages in this chat', icon: 'lock-closed-outline' });
          });
          return undefined;
        }
        showToast({ title: "You can't message this account", icon: 'lock-closed-outline' });
        return undefined;
      });
    },
    [requireUser, appendMessage, makeMessage, refreshChat, saveMessage, resolveChatId],
  );

  /** A message of yours changed in place (sent at last, failed, its recording now up), found by its id. */
  const patchMessage = useCallback((messageId: ID, patch: Partial<Message>) => {
    setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }));
  }, []);

  const sendCourt = useCallback((conversationId: ID, place: { id?: string; name: string; lat: number; lng: number; count?: number }, replyToId?: ID) => {
    haptics.commit();
    const me = requireUser();
    conversationId = resolveChatId(conversationId);
    const sending = live(me, conversationId);
    // "Sending…" under it until the server has it, as a message of words.
    const message: Message = { ...makeMessage(conversationId, me, place.name), kind: 'court', place, ...(replyToId ? { replyToId } : null), ...(sending ? { sending: true } : null) };
    setState((prev) => appendMessage(prev, message));
    if (sending) void saveMessage(message).catch(() => 'failed' as const).then((result) => {
      if (calledBack(message.id, result) || result === 'gone') return;
      if (result === 'blocked') { takeBackRefused(message); return; }
      patchMessage(message.id, { sending: undefined, ...(result === 'failed' || result === 'refused' ? { failed: true } : null) });
      if (result === 'refused') void refreshChat(resolveChatId(conversationId));
    });
  }, [requireUser, appendMessage, makeMessage, refreshChat, patchMessage, saveMessage, resolveChatId]);

  /**
   * Puts a voice note's recording up (when it is still only on this phone),
   * then saves the message. A retry goes through here too, so a recording
   * whose upload failed is uploaded again rather than saved with an address
   * only the sender's phone can play. "Sending…" until the server has it.
   */
  const deliverVoice = useCallback(async (message: Message) => {
    const me = stateRef.current.currentUserId;
    const audio = message.audio;
    if (!me || !audio) return;
    const stillThere = () => stateRef.current.messages.some((m) => m.id === message.id);
    let url = audio.url;
    if (!/^https?:/i.test(url)) {
      try { url = await uploadMedia(me, url, 'audio'); } catch {
        patchMessage(message.id, { sending: undefined, failed: true });
        return;
      }
      voiceUploads.current.add(url);
      // Kept on the message as soon as it is up, so a retry after this only saves it.
      patchMessage(message.id, { audio: { url, ms: audio.ms } });
    }
    // The recording comes down again only when this phone put it up for this
    // message and nothing else here plays it. A forward (or its retry) reuses
    // another message's recording, which must keep playing there.
    const dropRecording = () => {
      if (voiceUploads.current.has(url) && !stateRef.current.messages.some((m) => m.id !== message.id && m.audio?.url === url)) void remote.removeMedia(me, [url]);
    };
    // Unsent while it went up: nothing is saved, and the recording comes down again.
    if (!stillThere()) { withdrawn.current.delete(message.id); dropRecording(); return; }
    const result = await saveMessage({ ...message, audio: { url, ms: audio.ms } }).catch(() => 'failed' as const);
    // Deleted meanwhile (unsent as it lands), or its chat refused: the recording, already up, comes down again.
    if (calledBack(message.id, result) || result === 'gone') { dropRecording(); return; }
    if (result === 'blocked') { dropRecording(); takeBackRefused(message); return; }
    patchMessage(message.id, { sending: undefined, ...(result === 'failed' || result === 'refused' ? { failed: true } : null) });
    if (result === 'refused') void refreshChat(resolveChatId(message.conversationId));
  }, [refreshChat, patchMessage, saveMessage, resolveChatId]);

  const sendVoice = useCallback((conversationId: ID, recording: { uri: string; ms: number }, replyToId?: ID) => {
    haptics.commit();
    const me = requireUser();
    conversationId = resolveChatId(conversationId);
    const sending = live(me, conversationId);
    const message: Message = { ...makeMessage(conversationId, me, 'Voice note'), kind: 'voice', audio: { url: recording.uri, ms: recording.ms }, ...(replyToId ? { replyToId } : null), ...(sending ? { sending: true } : null) };
    setState((prev) => appendMessage(prev, message));
    if (sending) void deliverVoice(message);
  }, [requireUser, appendMessage, makeMessage, deliverVoice, resolveChatId]);

  /**
   * Puts a photo message's photos up, one after another (the bubble's ring
   * fills as they go), then saves the message. Photos already up (a retry
   * after a failure part way) are not sent again. If the message was
   * unsent while its photos were still going up, they are taken back down
   * and nothing is saved. Resolves 'blocked' when the caption's words were
   * refused (migration 117).
   */
  const deliverPhotos = useCallback(async (message: Message): Promise<'blocked' | undefined> => {
    const me = stateRef.current.currentUserId;
    const photos = message.photos ?? [];
    if (!me || !photos.length) return undefined;
    const setFailed = () => patchMessage(message.id, { sending: undefined, failed: true });
    const stillThere = () => stateRef.current.messages.some((m) => m.id === message.id);
    const sent: ChatPhoto[] = [];
    setSendProgress(message.id, 0);
    // A new chat starts on the server first: its photos' shelf is only open to the chat's people.
    const chatId = await startChat(message.conversationId).catch(() => 'failed' as const);
    if (chatId === 'failed' || chatId === null) {
      clearSendProgress(message.id);
      // Deleted meanwhile: nothing went up, so nothing more to do.
      const deleted = withdrawn.current.delete(message.id);
      // Refused: the chat, with this message, has gone (and the note said why).
      if (chatId === 'failed' && !deleted) setFailed();
      return undefined;
    }
    try {
      for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i];
        // Unsent part way: stop sending, and see to the ones already up below.
        if (!stillThere()) break;
        if (!isLocalMedia(photo.path)) { sent.push(photo); continue; }
        const up = await uploadChatPhoto(me, chatId, photo, (f) => setSendProgress(message.id, (i + f) / photos.length));
        keepLocalCopy(up.path, photo.path);
        sent.push(up);
        // Kept on the message as each lands, so a retry only sends the rest.
        const now = [...sent, ...photos.slice(i + 1)];
        setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, photos: now } : m)) }));
      }
    } catch (error) {
      clearSendProgress(message.id);
      setFailed();
      // A photo the phone could not re-draw will not go on a retry either: say so.
      if (error instanceof Error && error.message === CHAT_PHOTO_UNREADABLE) showToast({ title: 'Couldn’t send that photo', body: 'This photo couldn’t be prepared. Try another one.', icon: 'image-outline' });
      return undefined;
    }
    if (!stillThere()) {
      withdrawn.current.delete(message.id);
      clearSendProgress(message.id);
      const hosted = sent.map((p) => p.path).filter((path) => !isLocalMedia(path));
      if (hosted.length) void remote.removeChatPhotos(hosted);
      return undefined;
    }
    const hosted: Message = { ...message, conversationId: chatId, photos: sent, failed: undefined, sending: undefined };
    const result = await remote.insertMessage(hosted).catch(() => 'failed' as const);
    clearSendProgress(message.id);
    if (calledBack(message.id, result, sent)) return undefined;
    if (result === 'blocked') { takeBackRefused(message, sent); return 'blocked'; }
    if (result === 'failed' || result === 'refused') setFailed();
    else patchMessage(message.id, { sending: undefined });
    if (result === 'refused') void refreshChat(chatId);
    return undefined;
  }, [refreshChat, patchMessage, startChat]);

  const sendPhotos = useCallback((conversationId: ID, picked: { uri: string; width: number; height: number }[], caption = '', replyToId?: ID): Promise<'blocked' | undefined> => {
    const photos: ChatPhoto[] = picked.slice(0, MAX_CHAT_PHOTOS).map((p) => ({ path: p.uri, w: Math.max(1, p.width), h: Math.max(1, p.height) }));
    if (!photos.length) return Promise.resolve(undefined);
    haptics.commit();
    const me = requireUser();
    conversationId = resolveChatId(conversationId);
    const sending = live(me, conversationId);
    const message: Message = { ...makeMessage(conversationId, me, caption.trim(), 'photo'), photos, ...(replyToId ? { replyToId } : null), ...(sending ? { sending: true } : null) };
    setState((prev) => appendMessage(prev, message));
    // The demo has nowhere to put them: they stay as they are, on this device.
    return sending ? deliverPhotos(message).catch(() => undefined) : Promise.resolve(undefined);
  }, [requireUser, appendMessage, makeMessage, deliverPhotos, resolveChatId]);

  /* Group chats. Most changes show at once and are saved afterwards; when the
     server says no, it is put back and a note says why. Starting a group and
     adding people are the exceptions: they wait for the server, so a no
     leaves the picker as it was and the picker itself says why, naming who
     when the app can tell. A real account's event lines ("You added Dev")
     come from the server; the demo, with no server, writes its own. */

  /** A demo event line, worded the way the server writes one (the chat words it from `event` for whoever reads it). */
  const eventLine = useCallback((conversationId: ID, me: ID, event: ChatEvent): Message => {
    const line: Message = { ...makeMessage(conversationId, me, '', 'system'), event };
    return { ...line, body: eventText(line, stateRef.current.users, null) };
  }, [makeMessage]);

  /**
   * Who of these people follow you, asked of the server again (see
   * recheckFollows in AppActions). Their follows of you are swapped for the
   * fresh answer, so one taken back since the app opened goes and a new one
   * arrives; the state is only touched when something changed.
   */
  const recheckFollows = useCallback(async (userIds: ID[]): Promise<ID[]> => {
    const me = stateRef.current.currentUserId;
    if (!me) return [];
    const want = Array.from(new Set(userIds.filter((id) => !!id && id !== me)));
    const followingMe = (edges: { followerId: ID; followingId: ID }[]) => want.filter((id) => edges.some((e) => e.followerId === id && e.followingId === me));
    const asked = want.filter((id) => live(me, id));
    if (!asked.length) return followingMe(stateRef.current.followEdges);
    const fresh = await remote.fetchFollowersAmong(me, asked).catch(() => null);
    // No answer (no connection): what the app already had stands.
    if (!fresh || stateRef.current.currentUserId !== me) return followingMe(stateRef.current.followEdges);
    const askedSet = new Set(asked);
    const stale = (e: { followerId: ID; followingId: ID }) => askedSet.has(e.followerId) && e.followingId === me;
    const before = stateRef.current.followEdges.filter(stale).map((e) => e.followerId).sort().join();
    const toMe = Array.from(new Set(fresh)).map((id) => ({ followerId: id, followingId: me }));
    if (before !== toMe.map((e) => e.followerId).sort().join()) {
      setState((prev) => ({ ...prev, followEdges: [...prev.followEdges.filter((e) => !stale(e)), ...toMe] }));
    }
    return followingMe([...stateRef.current.followEdges.filter((e) => !stale(e)), ...toMe]);
  }, []);

  /**
   * After the server refused to put people in a group, who it was about, when
   * the app can tell. For 'teen' it first re-reads whom those people follow:
   * the likely reason it got past the picker is that one of them unfollowed
   * you since the app loaded, and the fresh follows also put the lock back
   * on them in the pickers. For 'blocked' it can only name the one person
   * being added (who they are blocked with stays private).
   */
  const whoCantJoin = useCallback(async (why: 'teen' | 'blocked' | 'full' | 'words' | 'failed', ids: ID[]): Promise<ID[]> => {
    const me = stateRef.current.currentUserId;
    if (!me) return [];
    if (why === 'blocked') return ids.length === 1 ? ids : [];
    if (why !== 'teen') return [];
    const following = await recheckFollows(ids);
    // The server's answer, asked again: the app's may be from before an unfollow.
    const told = await askOpenness(ids.filter((id) => !following.includes(id)), true);
    const users = stateRef.current.users;
    // Anyone who doesn't follow you and isn't known to be an adult.
    return ids.filter((id) => !following.includes(id) && !openToYou(id, users.find((u) => u.id === id), me, [], ageSource(stateRef.current, id), told));
  }, [recheckFollows, askOpenness]);

  /** A group with the people picked (two or more others) and an optional name. */
  const createGroup = useCallback(async (memberIds: ID[], title?: string): Promise<GroupOutcome | null> => {
    const me = requireUser();
    const others = Array.from(new Set(memberIds.filter((id) => !!id && id !== me)));
    if (others.length < 2) return null;
    if (others.length + 1 > GROUP_CAP) return { ok: false, why: 'full', who: [] };
    const groupTitle = cleanTitle(title);
    const wanted = nextId('cv');
    const made = (id: ID): Conversation => ({
      id, participantIds: [me, ...others], messageIds: [], updatedAt: new Date().toISOString(), unreadCount: 0,
      isGroup: true, title: groupTitle, createdBy: me, adminIds: [me],
    });
    // Once each: the server's own copy may have arrived first, live.
    const put = (id: ID) => setState((prev) => (prev.conversations.some((c) => c.id === id) ? prev : { ...prev, conversations: [made(id), ...prev.conversations] }));
    if (!live(me, wanted, ...others)) {
      haptics.commit();
      put(wanted);
      const line = eventLine(wanted, me, { type: 'created', title: groupTitle });
      setState((prev) => appendMessage(prev, line));
      return { ok: true, id: wanted };
    }
    // A real group waits for the server's yes before it shows. Opening it at
    // once and then taking it away on a no threw the picks away and left only
    // a toast that was gone before it could be read.
    const result = await remote.createGroup(others, groupTitle, wanted).catch(() => 'failed' as const);
    if (stateRef.current.currentUserId !== me) return { ok: false, why: 'failed', who: [] };
    if (isRefusal(result)) {
      const why = result === 'not-admin' ? 'failed' : result;
      return { ok: false, why, who: await whoCantJoin(why, others) };
    }
    haptics.commit();
    put(result);
    // Its "created" line and anything else the server added.
    void refreshChat(result);
    return { ok: true, id: result };
  }, [requireUser, appendMessage, eventLine, refreshChat, whoCantJoin]);

  /** Anyone in a group can add people, up to GROUP_CAP in all. Someone not known to be an adult must follow you (as for a one-to-one chat). */
  const addGroupMembers = useCallback(async (conversationId: ID, memberIds: ID[]): Promise<GroupOutcome> => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat || !isGroupChat(chat) || !chat.participantIds.includes(me)) return { ok: false, why: 'failed', who: [] };
    const newcomers = Array.from(new Set(memberIds.filter((id) => !!id && id !== me && !chat.participantIds.includes(id))));
    // Everyone picked is in already: nothing to do, and nothing went wrong.
    if (!newcomers.length) return { ok: true, id: conversationId };
    if (newcomers.length > GROUP_CAP - chat.participantIds.length) return { ok: false, why: 'full', who: [] };
    const put = (ids: ID[]) => setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, participantIds: [...c.participantIds, ...ids.filter((id) => !c.participantIds.includes(id))] } : c)),
    }));
    if (!live(me, conversationId, ...newcomers)) {
      haptics.commit();
      put(newcomers);
      const line = eventLine(conversationId, me, { type: 'added', targetIds: newcomers });
      setState((prev) => appendMessage(prev, line));
      return { ok: true, id: conversationId };
    }
    // Waits for the server, so a no leaves the picker open with the picks still ticked.
    const result = await remote.addGroupMembers(conversationId, newcomers).catch(() => 'failed' as const);
    // In: only those the server actually added show here (a database before
    // migration 54 stops at its first no); its "added" line then brings the
    // group fully up to date.
    if (Array.isArray(result)) { haptics.commit(); put(result); return { ok: true, id: conversationId }; }
    const why = result === 'not-admin' ? 'failed' : result;
    // Full by the server's count but not by this phone's: people were added
    // from somewhere else meanwhile. Re-read the group so the room left that
    // the picker shows is the real one.
    if (why === 'full') await refreshChat(conversationId);
    return { ok: false, why, who: await whoCantJoin(why, newcomers) };
  }, [requireUser, appendMessage, eventLine, refreshChat, whoCantJoin]);

  /** An admin takes someone out of a group. A hit chat's "I'm in" goes with them (the server does the same). */
  const removeGroupMember = useCallback((conversationId: ID, memberId: ID) => {
    const me = requireUser();
    const s = stateRef.current;
    const chat = s.conversations.find((c) => c.id === conversationId);
    if (!chat || !isGroupChat(chat) || memberId === me || !chat.participantIds.includes(memberId)) return;
    if (!isGroupAdmin(chat, me)) { showToast({ title: 'Only admins can remove people', icon: 'lock-closed-outline' }); return; }
    const wasAdmin = !!chat.adminIds?.includes(memberId);
    const hitsJoined = s.hitRequests.filter((h) => h.conversationId === conversationId && h.joinedIds.includes(memberId)).map((h) => h.id);
    haptics.commit();
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, participantIds: c.participantIds.filter((p) => p !== memberId), adminIds: c.adminIds?.filter((p) => p !== memberId) } : c)),
      hitRequests: hitsJoined.length ? prev.hitRequests.map((h) => (hitsJoined.includes(h.id) ? { ...h, joinedIds: h.joinedIds.filter((x) => x !== memberId) } : h)) : prev.hitRequests,
    }));
    if (!live(me, conversationId, memberId)) {
      const line = eventLine(conversationId, me, { type: 'removed', targetIds: [memberId] });
      setState((prev) => appendMessage(prev, line));
      return;
    }
    void remote.removeGroupMember(conversationId, memberId).catch(() => 'failed' as const).then((result) => {
      if (result === 'ok') return;
      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) => (c.id === conversationId && !c.participantIds.includes(memberId)
          ? { ...c, participantIds: [...c.participantIds, memberId], adminIds: wasAdmin && c.adminIds ? [...c.adminIds, memberId] : c.adminIds }
          : c)),
        hitRequests: hitsJoined.length ? prev.hitRequests.map((h) => (hitsJoined.includes(h.id) && !h.joinedIds.includes(memberId) ? { ...h, joinedIds: [...h.joinedIds, memberId] } : h)) : prev.hitRequests,
      }));
      const name = stateRef.current.users.find((u) => u.id === memberId)?.name.trim().split(/\s+/)[0];
      showToast({ title: result === 'not-admin' ? 'Only admins can remove people' : name ? `${name} wasn’t removed. Try again.` : 'They weren’t removed. Try again.', icon: 'lock-closed-outline', long: true });
    });
  }, [requireUser, appendMessage, eventLine]);

  /** Anyone in a group can rename it; an empty name takes the name off (it is then called by its people). */
  const renameGroup = useCallback((conversationId: ID, title: string) => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat || !isGroupChat(chat)) return;
    const before = chat.title;
    const next = cleanTitle(title);
    if ((before ?? '') === (next ?? '')) return;
    const put = (from: string | undefined, to: string | undefined) =>
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId && c.title === from ? { ...c, title: to } : c)) }));
    put(before, next);
    if (!live(me, conversationId)) {
      const line = eventLine(conversationId, me, { type: 'renamed', title: next });
      setState((prev) => appendMessage(prev, line));
      return;
    }
    void remote.renameGroup(conversationId, next ?? '').catch(() => false).then((ok) => {
      if (ok === true) return;
      // Put the old name back, unless someone has changed it again meanwhile.
      put(next, before);
      // Refused for its words (migration 117): saying so is the whole message.
      showToast(ok === 'blocked' ? { title: BLOCKED_WORDS_NOTE, icon: 'alert-circle-outline', long: true } : { title: 'The name didn’t change. Try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser, appendMessage, eventLine]);

  /** A group photo picked on this device (uploaded here, into your own folder), or null to take it off. Anyone in the group can. */
  const setGroupPhoto = useCallback((conversationId: ID, uri: string | null) => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat || !isGroupChat(chat)) return;
    const before = chat.photoUrl;
    const next = uri || undefined;
    if (before === next) return;
    haptics.commit();
    const put = (from: (string | undefined)[], to: string | undefined) =>
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId && from.includes(c.photoUrl) ? { ...c, photoUrl: to } : c)) }));
    // The picked photo shows straight away, from the phone itself.
    put([before], next);
    if (!live(me, conversationId)) {
      const line = eventLine(conversationId, me, { type: 'photo', on: !!next });
      setState((prev) => appendMessage(prev, line));
      return;
    }
    void (async () => {
      let hosted: string | undefined = next;
      if (next && isLocalMedia(next)) {
        try { hosted = await uploadMedia(me, next, 'photo'); } catch (e) {
          put([next], before);
          showToast({ title: 'The photo didn’t upload', body: e instanceof Error ? e.message : 'Try again.', icon: 'alert-circle-outline' });
          return;
        }
        put([next], hosted);
      }
      const ok = await remote.setGroupPhoto(conversationId, hosted ?? null).catch(() => false);
      if (ok) return;
      put([next, hosted], before);
      showToast({ title: 'The photo didn’t change. Try again.', icon: 'alert-circle-outline' });
    })();
  }, [requireUser, appendMessage, eventLine]);

  /** An admin makes someone an admin, or takes it away. A group always keeps one: the last admin cannot step down (they can leave instead). */
  const setGroupAdmin = useCallback((conversationId: ID, memberId: ID, admin: boolean) => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat || !isGroupChat(chat) || !chat.participantIds.includes(memberId)) return;
    if (!isGroupAdmin(chat, me)) { showToast({ title: 'Only admins can do that', icon: 'lock-closed-outline' }); return; }
    const before = chat.adminIds ?? (chat.createdBy ? [chat.createdBy] : []);
    if (before.includes(memberId) === admin) return;
    const after = admin ? [...before, memberId] : before.filter((id) => id !== memberId);
    if (!after.length) {
      showToast({ title: 'A group needs an admin', body: 'Make someone else an admin first, or leave the group.', icon: 'people-outline' });
      return;
    }
    haptics.commit();
    setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, adminIds: after } : c)) }));
    if (!live(me, conversationId, memberId)) {
      const line = eventLine(conversationId, me, { type: 'admin', targetIds: [memberId], on: admin });
      setState((prev) => appendMessage(prev, line));
      return;
    }
    void remote.setGroupAdmin(conversationId, memberId, admin).catch(() => 'failed' as const).then((result) => {
      if (result === 'ok') return;
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, adminIds: before } : c)) }));
      showToast({ title: result === 'not-admin' ? 'Only admins can do that' : 'That didn’t go through. Try again.', icon: 'lock-closed-outline', long: true });
    });
  }, [requireUser, appendMessage, eventLine]);

  /**
   * Leaving a group: it goes from this phone at once. In a hit's chat your
   * "I'm in" goes too (the server does the same). If the server says no, it
   * all comes back, with a note.
   */
  const leaveGroup = useCallback((conversationId: ID) => {
    const me = requireUser();
    const s = stateRef.current;
    const chat = s.conversations.find((c) => c.id === conversationId);
    if (!chat) return;
    const kept = s.messages.filter((m) => m.conversationId === conversationId);
    const hitsJoined = s.hitRequests.filter((h) => h.conversationId === conversationId && h.joinedIds.includes(me)).map((h) => h.id);
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.filter((c) => c.id !== conversationId),
      messages: prev.messages.filter((m) => m.conversationId !== conversationId),
      hitRequests: hitsJoined.length ? prev.hitRequests.map((h) => (hitsJoined.includes(h.id) ? { ...h, joinedIds: h.joinedIds.filter((x) => x !== me) } : h)) : prev.hitRequests,
    }));
    if (!live(me, conversationId)) return;
    void remote.leaveGroup(conversationId).catch(() => false).then((ok) => {
      if (ok) return;
      setState((prev) => (prev.conversations.some((c) => c.id === conversationId) ? prev : {
        ...prev,
        conversations: [chat, ...prev.conversations],
        messages: [...prev.messages, ...kept.filter((m) => !prev.messages.some((p) => p.id === m.id))],
        hitRequests: hitsJoined.length ? prev.hitRequests.map((h) => (hitsJoined.includes(h.id) && !h.joinedIds.includes(me) ? { ...h, joinedIds: [...h.joinedIds, me] } : h)) : prev.hitRequests,
      }));
      showToast({ title: 'You’re still in the group', body: 'Leaving didn’t go through. Try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  /** A group someone took you out of, as it last stood here (see refreshChat), for the chat screen to keep showing read-only. */
  const removedChat = useCallback((conversationId: ID) => {
    const kept = removedChats.current.get(conversationId);
    return kept && kept.me === stateRef.current.currentUserId ? kept.chat : undefined;
  }, []);

  /**
   * Mutes a chat, a group or a one-to-one, until a moment (MUTED_FOREVER for
   * "until I turn it back on"), or unmutes it with null. A muted chat sends
   * no alerts unless someone @mentions you, and stays off the unread badge.
   * Only you can see it. `quiet`: no Undo toast (an Undo passes it).
   */
  const muteChat = useCallback((conversationId: ID, until: string | null, quiet?: boolean) => {
    const me = requireUser();
    const find = () => stateRef.current.conversations.find((c) => c.id === conversationId);
    const chat = find();
    if (!chat) return;
    const before = chat.mutedUntil && Date.parse(chat.mutedUntil) > Date.now() ? chat.mutedUntil : null;
    const next = until && Date.parse(until) > Date.now() ? until : null;
    if (before === next) return;
    haptics.tap();
    const put = (value: string | null) =>
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, mutedUntil: value ?? undefined } : c)) }));
    put(next);
    if (!quiet) {
      offerUndo(
        next ? 'Chat muted' : 'Chat unmuted',
        () => (find()?.mutedUntil ?? null) === next,
        () => muteChat(conversationId, before, true),
        { body: next ? 'No alerts from it, unless someone @mentions you' : undefined, icon: next ? 'notifications-off-outline' : 'notifications-outline' },
      );
    }
    if (!live(me, conversationId)) return;
    void remote.setChatMute(conversationId, next).catch(() => false).then((ok) => {
      if (ok) return;
      if ((find()?.mutedUntil ?? null) === next) put(before);
      showToast({ title: next ? 'This chat wasn’t muted' : 'This chat wasn’t unmuted', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  const setChatReadReceipts = useCallback((conversationId: ID, on: boolean) => {
    const me = requireUser();
    const find = () => stateRef.current.conversations.find((c) => c.id === conversationId);
    const isOn = () => !find()?.receiptsOffIds?.includes(me);
    if (!find() || isOn() === on) return;
    haptics.tap();
    const put = (receipts: boolean) => setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => {
      if (c.id !== conversationId) return c;
      const rest = (c.receiptsOffIds ?? []).filter((id) => id !== me);
      const next = receipts ? rest : [...rest, me];
      return { ...c, receiptsOffIds: next.length ? next : undefined };
    }) }));
    put(on);
    if (!live(me, conversationId)) return;
    void remote.setChatReadReceipts(conversationId, on).catch(() => false).then((ok) => {
      if (ok) return;
      if (isOn() === on) put(!on);
      showToast({ title: on ? 'Read receipts didn’t turn on' : 'Read receipts didn’t turn off', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  /**
   * Reports a chat to CourtSide; a person reviews it. Always as the chat
   * ("conversation:<id>"), so the admin can read it (report_chat_context)
   * and act on it, with the person it is about when there is one: the other
   * person in a one-to-one chat, or a reported message's sender (the server
   * keeps that name only if they are in the chat). A single message goes in
   * the reason as "message:<id>", so the admin card can point at it.
   */
  const reportChat = useCallback((conversationId: ID, reason: string, aboutUserId?: ID, messageId?: ID): Promise<boolean> => {
    haptics.commit();
    const me = stateRef.current.currentUserId;
    // The demo has nobody to send it to: it simply says thanks.
    if (!me || !live(me, conversationId)) return Promise.resolve(true);
    const about = aboutUserId && aboutUserId !== me && UUID.test(aboutUserId) ? aboutUserId : null;
    const why = messageId && UUID.test(messageId) ? `message:${messageId}` : reason;
    return remote.fileReport(me, about, `conversation:${conversationId}`, why).catch(() => false);
  }, []);

  /** Sends a message that did not go through, again. */
  const retryMessage = useCallback((messageId: ID) => {
    const me = requireUser();
    const message = stateRef.current.messages.find((m) => m.id === messageId);
    if (!message?.failed || message.senderId !== me) return;
    haptics.tap();
    // "Sending…" again while it goes.
    patchMessage(messageId, { failed: undefined, sending: true });
    // Photos go up again first (only the ones that had not yet), then the message.
    if (message.kind === 'photo') { void deliverPhotos({ ...message, failed: undefined, sending: true }); return; }
    // A voice note's recording too, when it never got up.
    if (message.kind === 'voice') { void deliverVoice({ ...message, failed: undefined, sending: true }); return; }
    // A new chat whose start went unanswered is started again first (saveMessage).
    void saveMessage(message).catch(() => 'failed' as const).then((result) => {
      if (calledBack(messageId, result) || result === 'gone') return;
      if (result === 'blocked') { takeBackRefused(message); return; }
      patchMessage(messageId, { sending: undefined, ...(result === 'failed' || result === 'refused' ? { failed: true } : null) });
    });
  }, [requireUser, deliverPhotos, deliverVoice, patchMessage, saveMessage]);

  const editMessage = useCallback((messageId: ID, body: string): Promise<'blocked' | undefined> => {
    const me = requireUser();
    const words = body.trim();
    const message = stateRef.current.messages.find((m) => m.id === messageId);
    if (!words || !message || message.senderId !== me || message.body === words) return Promise.resolve(undefined);
    haptics.tap();
    const editedAt = new Date().toISOString();
    setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, body: words, editedAt } : m)) }));
    if (!live(me, messageId)) return Promise.resolve(undefined);
    return remote.editMessage(messageId, words).catch(() => false).then((saved): 'blocked' | undefined => {
      if (saved === true) return undefined;
      // Not saved: the words go back to what they were, unless they have been changed again since.
      setState((prev) => ({ ...prev, messages: prev.messages.map((m) => (m.id === messageId && m.body === words && m.editedAt === editedAt ? { ...m, body: message.body, editedAt: message.editedAt } : m)) }));
      // Refused for its words (migration 117): the toast says why, and the chat puts the new words back in the box.
      if (saved === 'blocked') { showToast({ title: 'Not saved', body: 'It has words that break CourtSide’s rules. Change them and try again.', icon: 'alert-circle-outline', long: true }); return 'blocked'; }
      showToast({ title: 'Your edit didn’t save', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
      return undefined;
    });
  }, [requireUser]);

  /** Out of this phone's chat either way; unsending also removes it from the database, so it leaves theirs. */
  const dropMessage = (prev: AppState, messageId: ID): AppState => ({
    ...prev,
    messages: prev.messages.filter((m) => m.id !== messageId),
    conversations: prev.conversations.map((c) => (c.messageIds.includes(messageId) ? { ...c, messageIds: c.messageIds.filter((x) => x !== messageId) } : c)),
  });
  /** A message back where it was in its chat: an unsend or delete the server did not take. */
  const restoreMessage = (prev: AppState, message: Message): AppState => {
    if (prev.messages.some((m) => m.id === message.id)) return prev;
    const messages = [...prev.messages, message];
    const byId = new Map(messages.map((m) => [m.id, m]));
    return {
      ...prev,
      messages,
      conversations: prev.conversations.map((c) => (c.id === message.conversationId ? { ...c, messageIds: inOrder([...c.messageIds, message.id], byId).map((m) => m.id) } : c)),
    };
  };
  const unsendMessage = useCallback((messageId: ID) => {
    const me = requireUser();
    const message = stateRef.current.messages.find((m) => m.id === messageId);
    if (!message || message.senderId !== me) return;
    haptics.untap();
    setState((prev) => dropMessage(prev, messageId));
    if (!live(me, messageId)) return;
    // A photo message's photos come down with it (any still on their way up are seen to by deliverPhotos).
    const hosted = (message.photos ?? []).map((p) => p.path).filter((path) => !isLocalMedia(path));
    // So does a voice note's recording, which sits on the public media shelf
    // (unless another message of yours here still plays it: one you forwarded).
    const audio = message.audio?.url;
    void remote.unsendMessage(messageId).catch(() => false).then((ok) => {
      if (!ok) {
        // The server still has it: it comes back here too, rather than turning up again on the next open.
        setState((prev) => restoreMessage(prev, message));
        showToast({ title: 'Your message wasn’t unsent', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
        return;
      }
      if (hosted.length) void remote.removeChatPhotos(hosted);
      if (audio && !stateRef.current.messages.some((m) => m.audio?.url === audio)) void remote.removeMedia(me, [audio]);
    });
  }, [requireUser]);

  const deleteMessageForMe = useCallback((messageId: ID) => {
    const me = requireUser();
    const message = stateRef.current.messages.find((m) => m.id === messageId);
    haptics.untap();
    // Kept out of every fetch from now on, even one that lands before the server has it.
    hiddenFor(me).add(messageId);
    setState((prev) => dropMessage(prev, messageId));
    if (!live(me, messageId)) return;
    // Your own message still "Sending…": nothing to hide yet. It is taken
    // back off the server as soon as it lands (see calledBack), so it is
    // simply removed, as the note says.
    if (message?.sending && message.senderId === me) {
      withdrawn.current.add(messageId);
      return;
    }
    // Your own photo message that never went (it shows "Not sent"): only this
    // phone has it, so its photos already up are simply taken back down.
    if (message?.failed && message.senderId === me && message.kind === 'photo') {
      const hosted = (message.photos ?? []).map((p) => p.path).filter((path) => !isLocalMedia(path));
      if (hosted.length) void remote.removeChatPhotos(hosted);
      return;
    }
    void remote.hideMessage(me, messageId).catch(() => false).then((ok) => {
      if (ok || !message) return;
      // Not saved: it would turn up again on the next open, so it comes back now, with a note.
      hiddenFor(me).delete(messageId);
      setState((prev) => restoreMessage(prev, message));
      showToast({ title: 'This message wasn’t deleted', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  // Nothing is kept for a child: the account goes, and this phone remembers the answer.
  const removeForAge = useCallback(async (me: ID) => {
    await blockDevice();
    try {
      if (isSupabaseConfigured) await remoteAuth.deleteAccount();
    } catch { /* the sign-out below still takes it off this phone */ }
    void stopWorkoutWatch();
    const savedAccounts = await forgetAccount(me).catch(() => stateRef.current.savedAccounts);
    setState((prev) => ({ ...signedOut(prev), savedAccounts }));
    void clearSnapshot(me);
  }, []);
  const confirmBirthDate = useCallback(async (birthDate: string): Promise<AgeGroup | 'under13'> => {
    const me = requireUser();
    const tooYoung = async () => {
      await removeForAge(me);
      return 'under13' as const;
    };
    const years = yearsOld(birthDate);
    let group: AgeGroup | null = null;
    if (live(me)) {
      // The database first: it keeps the first date ever given and answers
      // from that, so an account whose age is already on file (asked again
      // because the age could not be read, say) is never deleted over a
      // mistyped year here.
      const answer = await remote.setBirthDate(birthDate);
      if (answer === 'under_13') return tooYoung();
      // Not saved (no connection, say): nothing is counted as answered, here or on
      // this phone, so the page says to try again and asks again until it is saved.
      // Counting the typed date left the account with no age on the server for good.
      if (!answer) throw new Error('Could not save that');
      group = answer;
    }
    // Without the database (the demo), the typed date stands.
    if (!group) {
      if (years < 13) return tooYoung();
      group = groupFor(years);
    }
    const label: AgeGroup = group;
    setState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === me ? { ...u, ageGroup: label, isPrivate: label === 'teen' && !u.ageGroup ? true : u.isPrivate } : u)),
    }));
    await rememberAnswered(me, label);
    // An invite claimed before the age was on file made no follow; now it can.
    // The server follows only when both are adults or both are teens (migration 84).
    void followInviter();
    return label;
  }, [requireUser, removeForAge]);
  const removeNewAccountOnBlockedPhone = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!me || !isSupabaseConfigured) return false;
    // Only an account with no age on file, made in the last half hour: an
    // older one may be someone else's on a shared phone, and simply signs out.
    if (stateRef.current.users.find((u) => u.id === me)?.ageGroup) return false;
    if (!(await isDeviceBlocked())) return false;
    const who = await remoteAuth.signedInUser().catch(() => null);
    const made = Date.parse(who?.createdAt ?? '');
    if (who?.id !== me || !(Date.now() - made < 30 * 60 * 1000) || stateRef.current.currentUserId !== me) return false;
    await removeForAge(me);
    return true;
  }, [removeForAge]);

  const canMessage = useCallback((userId: ID) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me) return false;
    // A chat you already have carries on: the server hands it back before it checks anything (open_conversation).
    // Not one only opened on this phone: the server has not been asked about that one yet.
    const chat = findDirectChat(s.conversations, me, userId);
    if (chat && !draftChats.current.has(chat.id)) return true;
    return openToYou(userId, s.users.find((u) => u.id === userId), me, s.followEdges, ageSource(s, userId), s.openness, wantOpenness);
  }, [wantOpenness]);

  // The group rule has no "already chatting" exception: a teen you message
  // one-to-one still has to follow you before you can put them in a group.
  const canAddToGroup = useCallback((userId: ID) => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me || userId === me) return false;
    return openToYou(userId, s.users.find((u) => u.id === userId), me, s.followEdges, ageSource(s, userId), s.openness, wantOpenness);
  }, [wantOpenness]);

  const reachNow = useCallback(async (userId: ID): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    if (!me || userId === me) return false;
    const [following, told] = await Promise.all([recheckFollows([userId]), askOpenness([userId], true)]);
    if (following.includes(userId)) return true;
    const s = stateRef.current;
    return openToYou(userId, s.users.find((u) => u.id === userId), me, [], ageSource(s, userId), told);
  }, [recheckFollows, askOpenness]);

  const lockedNow = useCallback((userIds: ID[]): ID[] => {
    const s = stateRef.current;
    const me = s.currentUserId;
    if (!me) return [];
    // Not asked about yet is not "locked" here: only an answer already in (or, before migration 64, an age) counts.
    return userIds.filter((id) => id !== me && (ageSource(s, id) !== 'server' || !!s.openness[id])
      && !openToYou(id, s.users.find((u) => u.id === id), me, s.followEdges, ageSource(s, id), s.openness));
  }, []);

  const tagHint = useCallback((userId: ID): SessionTagRefusal | null => {
    const s = stateRef.current;
    const me = s.currentUserId;
    return localRefusal({ me, who: s.users.find((u) => u.id === userId), follows: s.followEdges, source: ageSource(s, userId), told: s.openness, ask: wantOpenness });
  }, [wantOpenness]);

  // A lock on a Message button is checked with the server before it is final.
  const messageLock = useCallback(async (userId: ID): Promise<string | null> => {
    if (canMessage(userId) || (await reachNow(userId))) return null;
    return chatLockNoteFor(stateRef.current.users, userId);
  }, [canMessage, reachNow]);

  /**
   * Sends something into chats, Instagram style: a post, thread, profile or
   * hit, a court, or a message forwarded as it is. `conversationIds` are
   * chats you are in (groups or one-to-one); each of `userIds` gets it in your
   * one-to-one chat with them, started if need be. Each chat gets the item
   * and then the note, if there is one.
   */
  const shareToChats = useCallback(
    (targets: { conversationIds?: ID[]; userIds?: ID[] }, item: ShareItem, note?: string) => {
      const me = requireUser();
      const s = stateRef.current;
      const original = item.kind === 'message' ? s.messages.find((m) => m.id === item.id) : undefined;
      if (item.kind === 'message') {
        // An event line is not a message anyone sent, and a voice note still
        // on this phone (its upload failed) cannot be heard anywhere else.
        // Photos sit on the chat's own private shelf, so they cannot be passed on to another chat (yet).
        if (!original || original.kind === 'system' || original.kind === 'photo' || (original.audio && isLocalMedia(original.audio.url))) {
          showToast({ title: 'That message can’t be forwarded', icon: 'alert-circle-outline' });
          return;
        }
      }
      const chats: Conversation[] = [];
      const fresh: Conversation[] = [];
      for (const id of targets.conversationIds ?? []) {
        const chat = s.conversations.find((c) => c.id === id && c.participantIds.includes(me));
        if (chat && !chats.includes(chat)) chats.push(chat);
      }
      for (const userId of targets.userIds ?? []) {
        if (userId === me) continue;
        let chat = findDirectChat([...fresh, ...s.conversations], me, userId);
        if (!chat) {
          chat = { id: nextId('cv'), participantIds: [me, userId], messageIds: [], updatedAt: new Date().toISOString(), unreadCount: 0 };
          fresh.push(chat);
        }
        if (!chats.includes(chat)) chats.push(chat);
      }
      if (!chats.length) return;

      // The item as it reads in one chat.
      const itemIn = (conversationId: ID): Message => {
        if (item.kind === 'court') return { ...makeMessage(conversationId, me, item.place.name, 'court'), place: item.place };
        if (item.kind === 'message') {
          // Forwarded as it is: the same kind, words, shared item, court or recording.
          return original
            ? { ...makeMessage(conversationId, me, original.body, original.kind, original.sharedId), place: original.place, audio: original.audio }
            : makeMessage(conversationId, me, '');
        }
        // A group invite is a plain message, its words and the group's link (see
        // features/groups/inviteMessage): an app from before invites, and the
        // phone's alert, read it as it is; this app draws it as the group's card.
        if (item.kind === 'group') return makeMessage(conversationId, me, groupInviteText(item.name, item.id));
        return makeMessage(conversationId, me, '', item.kind, item.id);
      };
      // "Sending…" under them until the server has them, as any message.
      const saving = isSupabaseConfigured && UUID.test(me);
      const pending = (m: Message): Message => (saving ? { ...m, sending: true } : m);
      const outgoing: Message[] = [];
      for (const chat of chats) {
        outgoing.push(pending(itemIn(chat.id)));
        if (note?.trim()) outgoing.push(pending(makeMessage(chat.id, me, note.trim())));
      }

      // A post or thread counts one share per chat it went to (a forward of one too).
      const sharedKind = item.kind === 'message' ? original?.kind : item.kind;
      const sharedId = item.kind === 'message' ? original?.sharedId : 'id' in item ? item.id : undefined;
      setState((prev) => {
        let next = fresh.length ? { ...prev, conversations: [...fresh, ...prev.conversations] } : prev;
        for (const message of outgoing) next = appendMessage(next, message);
        if (sharedKind === 'post' && sharedId) {
          const post = next.posts.find((p) => p.id === sharedId);
          next = { ...next, posts: next.posts.map((p) => (p.id === sharedId ? { ...p, shares: (p.shares ?? 0) + chats.length } : p)) };
          if (post) next = withNotification(next, { userId: post.authorId, actorId: me, kind: 'share', targetId: post.id, targetKind: 'post', preview: snippet(post.body) });
        } else if (sharedKind === 'question' && sharedId) {
          const question = next.questions.find((q) => q.id === sharedId);
          next = { ...next, questions: next.questions.map((q) => (q.id === sharedId ? { ...q, shares: (q.shares ?? 0) + chats.length } : q)) };
          if (question) next = withNotification(next, { userId: question.authorId, actorId: me, kind: 'share', targetId: question.id, targetKind: 'question', preview: snippet(question.title) });
        }
        return next;
      });

      // Saved after they show: new one-to-one chats (and any opened here and
      // not yet written in) are started on the server first (it may already
      // have one with that person, or say no: see startChat), then the
      // messages go up. One that does not go through shows its retry.
      if (!saving) return;
      for (const chat of fresh) {
        const other = chat.participantIds.find((p) => p !== me);
        if (other && UUID.test(other)) draftChats.current.set(chat.id, other);
      }
      void (async () => {
        const movedTo = new Map<ID, ID>();
        const refused = new Set<ID>();
        const unanswered = new Set<ID>();
        for (const chat of chats) {
          const standing = await startChat(chat.id).catch(() => 'failed' as const);
          // Refused: the chat, with what was waiting in it, has gone, and the note said why.
          if (standing === null) refused.add(chat.id);
          else if (standing === 'failed') unanswered.add(chat.id);
          else if (standing !== chat.id) movedTo.set(chat.id, standing);
        }
        for (const message of outgoing) {
          if (refused.has(message.conversationId)) continue;
          // No answer starting its chat: "Not sent", and its retry starts the chat again.
          if (unanswered.has(message.conversationId)) {
            if (!withdrawn.current.delete(message.id)) patchMessage(message.id, { sending: undefined, failed: true });
            continue;
          }
          const conversationId = movedTo.get(message.conversationId) ?? message.conversationId;
          if (!UUID.test(conversationId)) { patchMessage(message.id, { sending: undefined }); continue; }
          // Deleted before its turn came: it is simply not sent.
          if (withdrawn.current.delete(message.id)) continue;
          const result = await remote.insertMessage({ ...message, conversationId, sending: undefined }).catch(() => 'failed' as const);
          if (calledBack(message.id, result)) continue;
          if (result === 'blocked') { takeBackRefused({ ...message, conversationId }); continue; }
          patchMessage(message.id, { sending: undefined, ...(result === 'failed' || result === 'refused' ? { failed: true } : null) });
        }
      })();
    },
    [requireUser, appendMessage, makeMessage, patchMessage, startChat],
  );

  const markConversationRead = useCallback((conversationId: ID) => {
    const before = stateRef.current.conversations.find((c) => c.id === conversationId);
    const me = stateRef.current.currentUserId;
    // Something from someone else not yet opened here counts too: a message fetched
    // while the chat is open (opened from its notification, say) adds no unread count.
    const theirs = me ? stateRef.current.messages.filter((m) => m.conversationId === conversationId && m.senderId !== me && m.kind !== 'system') : [];
    const unseen = theirs.some((m) => !m.openedAtBy?.[me!]);
    const hadUnread = !!before && (before.unreadCount > 0 || unseen) && !!me && before.participantIds.includes(me);
    // Read up to their newest message at least, by the server's clock (theirs are dated by it), whatever this phone's says.
    const upTo = theirs.reduce<string | undefined>((t, m) => (!t || Date.parse(m.createdAt) > Date.parse(t) ? m.createdAt : t), undefined);
    if (hadUnread && live(me, conversationId)) void remote.markConversationRead(conversationId, me as ID, upTo);
    // Opening a chat you marked unread takes the mark off.
    if (before?.markedUnread) {
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, markedUnread: undefined } : c)) }));
      if (live(me, conversationId)) void remote.setChatUnread(conversationId, false).catch(() => null);
    }
    // Background work: the chat opening is what you are waiting for; the
    // unread dots and the badge clear a frame or two after it, not before it.
    const openedAt = new Date().toISOString();
    startTransition(() => setState(prev => {
      const conversation = prev.conversations.find(c => c.id === conversationId);
      const me = prev.currentUserId;
      if (!conversation || !me || !conversation.participantIds.includes(me)) return prev;
      const user = prev.users.find(u => u.id === me);
      const messages = markMessagesOpened(prev.messages, conversation, me, user?.readReceiptsEnabled !== false && !conversation.receiptsOffIds?.includes(me), openedAt);
      if (messages === prev.messages && conversation.unreadCount === 0) return prev;
      return {...prev, messages, conversations: prev.conversations.map(c => c.id === conversationId ? {...c, unreadCount: 0} : c)};
    }));
  }, []);

  /**
   * Pins a chat to the top of your inbox, or unpins it: at most three, like
   * iMessage. Shows at once; when the server says no (a fourth from another
   * phone), it goes back with a note. False when it would be a fourth here.
   */
  const pinChat = useCallback((conversationId: ID, pinned: boolean): boolean => {
    const me = requireUser();
    const { conversations: chats, blockedIds } = stateRef.current;
    const chat = chats.find((c) => c.id === conversationId);
    if (!chat || !!chat.pinnedAt === pinned) return true;
    // Pinned chats the inbox doesn't show (a one-to-one with someone you
    // blocked, or one with nothing in it) don't count, and can't be unpinned
    // there: pinning another takes them off, here and on the server, which counts every pin.
    const unseen = (c: Conversation) => isDirectChat(c) && (!c.messageIds.length || c.participantIds.some((p) => p !== me && blockedIds.includes(p)));
    const hiddenPins = pinned ? chats.filter((c) => c.pinnedAt && c.id !== conversationId && unseen(c)) : [];
    if (pinned && chats.filter((c) => c.pinnedAt && !unseen(c)).length >= MAX_PINNED_CHATS) {
      haptics.reject();
      showToast({ title: `You can pin up to ${MAX_PINNED_CHATS} chats`, body: 'Unpin one to make room.', icon: 'pin-outline' });
      return false;
    }
    haptics.tap();
    const put = (value: string | undefined) =>
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, pinnedAt: value } : c)) }));
    const before = chat.pinnedAt;
    put(pinned ? new Date().toISOString() : undefined);
    if (hiddenPins.length) {
      const off = new Set(hiddenPins.map((c) => c.id));
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (off.has(c.id) ? { ...c, pinnedAt: undefined } : c)) }));
    }
    const unpinHidden = Promise.all(hiddenPins.filter((c) => live(me, c.id)).map((c) => remote.setChatPin(c.id, false).catch(() => 'failed' as const)));
    if (live(me, conversationId)) void unpinHidden.then(() => remote.setChatPin(conversationId, pinned)).catch(() => 'failed' as const).then((result) => {
      if (result === 'ok' || result === 'missing') return;
      put(before);
      showToast(result === 'limit'
        ? { title: `You can pin up to ${MAX_PINNED_CHATS} chats`, body: 'Unpin one to make room.', icon: 'pin-outline' }
        : { title: pinned ? 'This chat wasn’t pinned' : 'This chat wasn’t unpinned', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
    return true;
  }, [requireUser]);

  /** Marks a chat unread (it shows as new until opened), or read again (which reads its messages too). */
  const markChatUnread = useCallback((conversationId: ID, unread: boolean) => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat) return;
    haptics.tap();
    if (!unread) {
      // Read: the same as opening it (its messages read, the mark off).
      markConversationRead(conversationId);
      return;
    }
    setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, markedUnread: true } : c)) }));
    if (live(me, conversationId)) void remote.setChatUnread(conversationId, true).catch(() => null);
  }, [requireUser, markConversationRead]);

  /**
   * Deletes a chat from your inbox (Instagram's Delete): it goes, read, and
   * what was said so far stays out of view, until someone writes in it again.
   * Nobody else's copy changes. The screen asks first.
   */
  const hideChat = useCallback((conversationId: ID) => {
    const me = requireUser();
    const chat = stateRef.current.conversations.find((c) => c.id === conversationId);
    if (!chat) return;
    haptics.commit();
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, hiddenAt: now, pinnedAt: undefined, markedUnread: undefined, unreadCount: 0 } : c)),
    }));
    if (live(me, conversationId)) void remote.hideChat(conversationId).catch(() => 'failed' as const).then((result) => {
      if (result !== 'failed') return;
      setState((prev) => ({ ...prev, conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, hiddenAt: chat.hiddenAt } : c)) }));
      showToast({ title: 'This chat wasn’t deleted', body: 'Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  /** Fetches one message from further back than its chat has loaded (a reply's original) into the store. */
  const loadMessage = useCallback(async (messageId: ID): Promise<boolean> => {
    const s = stateRef.current;
    if (s.messages.some((m) => m.id === messageId)) return true;
    const me = s.currentUserId;
    // One you deleted for yourself stays gone: its quote says it is no longer available.
    if (!me || !isSupabaseConfigured || !UUID.test(messageId) || isHidden(me, messageId)) return false;
    const got = await remote.fetchMessage(me, messageId).catch(() => null);
    if (!got) return false;
    setState((prev) => (prev.messages.some((m) => m.id === got.id) ? prev : { ...prev, messages: [...prev.messages, got] }));
    return true;
  }, []);

  /* ---------------------------- A coach's page ---------------------------- */

  /** Only the coach who owns the page can add to it; anyone else is ignored. */
  const addCoachResult = useCallback((input: Omit<CoachResult, 'id' | 'coachId'>) => {
    const me = stateRef.current.currentUserId;
    const coach = stateRef.current.coaches.find((c) => c.userId === me);
    if (!coach) return;
    haptics.commit();
    const result: CoachResult = { ...input, id: nextId('res'), coachId: coach.id };
    setState((prev) => ({ ...prev, coachResults: [result, ...prev.coachResults] }));
    if (live(me, coach.id)) {
      remote.insertCoachResult(result).catch((e: Error) => {
        setState((prev) => ({ ...prev, coachResults: prev.coachResults.filter((r) => r.id !== result.id) }));
        showToast({ title: 'That result did not save', body: e.message, icon: 'alert-circle-outline' });
      });
    }
  }, []);

  /** One review per player per coach; the coach's average moves with it. */
  const addCoachReview = useCallback((coachId: ID, rating: number, body: string) => {
    const prev = stateRef.current;
    const me = prev.currentUserId;
    const coach = prev.coaches.find((c) => c.id === coachId);
    if (!me || !coach || coach.userId === me) return;
    if (prev.coachReviews.some((r) => r.coachId === coachId && r.authorId === me)) return;
    haptics.commit();
    const stars = Math.max(1, Math.min(5, Math.round(rating)));
    const review: CoachReview = { id: nextId('rev'), coachId, authorId: me, rating: stars, body: body.trim(), createdAt: new Date().toISOString() };
    const before = { avg: coach.ratingAvg, count: coach.ratingCount };
    const total = coach.ratingAvg * coach.ratingCount + stars;
    const count = coach.ratingCount + 1;
    setState((p) => ({
      ...p,
      coachReviews: [review, ...p.coachReviews],
      coaches: p.coaches.map((c) => (c.id === coachId ? { ...c, ratingCount: count, ratingAvg: Math.round((total / count) * 10) / 10 } : c)),
    }));
    if (live(me, coachId)) {
      remote.insertCoachReview(review).catch((e: Error) => {
        setState((p) => ({
          ...p,
          coachReviews: p.coachReviews.filter((r) => r.id !== review.id),
          coaches: p.coaches.map((c) => (c.id === coachId ? { ...c, ratingAvg: before.avg, ratingCount: before.count } : c)),
        }));
        showToast({ title: 'That review did not post', body: e.message, icon: 'alert-circle-outline' });
      });
    }
  }, []);

  /* ------------------------------------------------------ coach marketplace */

  const refreshCoaching = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    const [coaching, requests] = await Promise.all([remote.fetchCoaching(me!), remote.fetchCoachingRequests()]);
    setState((p) => ({ ...p, ...coaching, coachingRequests: requests }));
    // A safety net: a booking of mine still "not paid" from the last day may
    // have been paid after all (the tab closed before Stripe sent me back).
    // Stripe is asked about each once per app run; any that turn out paid
    // show up straight away.
    const unsure = requests.filter((r) => r.userId === me && r.status === 'awaiting-payment' && !askedAboutPayment.current.has(r.id) && Date.now() - Date.parse(r.createdAt) < 24 * 3_600_000);
    if (!unsure.length) return;
    unsure.forEach((r) => askedAboutPayment.current.add(r.id));
    const paid = await Promise.all(unsure.map((r) => remote.confirmPayment(r.id).then((x) => x.paid).catch(() => false)));
    if (paid.some(Boolean)) {
      const fresh = await remote.fetchCoachingRequests();
      setState((p) => ({ ...p, coachingRequests: fresh }));
    }
  }, []);

  const confirmBooking = useCallback(async (requestId: ID) => {
    if (!live(stateRef.current.currentUserId, requestId)) return true;
    const paid = await remote.confirmPayment(requestId).then((r) => r.paid).catch(() => false);
    await refreshCoaching();
    return paid;
  }, [refreshCoaching]);

  const bookCoach = useCallback(async (serviceId: ID, question: string, video?: { uri?: string } | null) => {
    const me = requireUser();
    const coach = stateRef.current.coaches.find((c) => c.services.some((x) => x.id === serviceId));
    if (!coach) throw new Error('That coach is not taking bookings right now.');
    if (!live(me, coach.id)) {
      // The demo: no payment, the request just goes.
      const requestId = submitCoachingRequest(coach.id, serviceId, question, video?.uri ? 'Video attached' : undefined);
      return { outcome: 'paid' as const, requestId };
    }
    const videoUrl = video?.uri ? (isLocalMedia(video.uri) ? await uploadMedia(me, video.uri, 'video') : video.uri) : undefined;
    const back = Linking.createURL('booking-done');
    const { url, requestId } = await remote.checkout(serviceId, question, back, videoUrl);
    if (Platform.OS === 'web') {
      // The page goes to Stripe and comes back to /booking-done.
      window.location.assign(url);
      return { outcome: 'left' as const, requestId };
    }
    const result = await WebBrowser.openAuthSessionAsync(url, back, { preferEphemeralSession: true });
    const cameBack = result.type === 'success' ? result.url : '';
    if (/[?&]cancelled=1/.test(cameBack)) { await refreshCoaching(); return { outcome: 'cancelled' as const, requestId }; }
    // Paid on the way back, or closed early: Stripe itself is asked either way.
    let paid = /[?&]paid=1/.test(cameBack) || (await confirmBooking(requestId));
    // Closed by the player before Stripe sent them back: a payment may still
    // be settling, so Stripe is asked once more a moment later before the
    // form is kept for another go.
    if (!paid && result.type !== 'success') paid = await new Promise((r) => setTimeout(r, 3000)).then(() => confirmBooking(requestId));
    await refreshCoaching();
    if (paid) haptics.commit();
    // Not paid yet is not the same as cancelled: the sheet may have been
    // closed while Stripe was still taking the payment. Only Stripe's own
    // cancel link (handled above) means nothing was charged. The player
    // closing the sheet themselves stays on the coach's page with what they
    // wrote ("closed"); a return from Stripe without the paid mark goes to the
    // booking page, which keeps asking Stripe for a while.
    if (!paid && result.type !== 'success') return { outcome: 'closed' as const, requestId };
    return { outcome: paid ? ('paid' as const) : ('pending' as const), requestId };
  }, [requireUser, refreshCoaching, confirmBooking]);

  const answerBooking = useCallback(async (requestId: ID, response: string) => {
    const me = requireUser();
    const words = response.trim();
    if (live(me, requestId)) await remote.answerBooking(requestId, words);
    haptics.commit();
    setState((p) => ({ ...p, coachingRequests: p.coachingRequests.map((r) => (r.id === requestId ? { ...r, response: words, respondedAt: new Date().toISOString(), status: 'answered' } : r)) }));
  }, [requireUser]);

  const startBooking = useCallback((requestId: ID) => {
    const me = stateRef.current.currentUserId;
    const request = stateRef.current.coachingRequests.find((r) => r.id === requestId);
    if (!request || request.status !== 'submitted' || request.coachUserId !== me) return;
    setState((p) => ({ ...p, coachingRequests: p.coachingRequests.map((r) => (r.id === requestId ? { ...r, status: 'in-review' } : r)) }));
    if (live(me, requestId)) void remote.startBooking(requestId);
  }, []);

  const refundBooking = useCallback(async (requestId: ID) => {
    const me = requireUser();
    const request = stateRef.current.coachingRequests.find((r) => r.id === requestId);
    if (live(me, requestId)) await remote.refundBooking(requestId);
    haptics.commit();
    const byCoach = request?.coachUserId === me;
    setState((p) => ({ ...p, coachingRequests: p.coachingRequests.map((r) => (r.id === requestId ? { ...r, status: byCoach ? 'declined' : 'refunded', refundedAt: new Date().toISOString() } : r)) }));
  }, [requireUser]);

  const ownCoach = () => stateRef.current.coaches.find((c) => c.userId === stateRef.current.currentUserId);

  const saveCoachListing = useCallback(async (patch: Partial<Pick<Coach, 'headline' | 'credentials' | 'specialties' | 'yearsCoaching' | 'responseTimeHours' | 'listed'>>) => {
    const coach = ownCoach();
    if (!coach) throw new Error('Only approved coaches have a listing.');
    const before = coach;
    setState((p) => ({ ...p, coaches: p.coaches.map((c) => (c.id === coach.id ? { ...c, ...patch } : c)) }));
    if (!live(stateRef.current.currentUserId, coach.id)) return;
    try {
      await remote.updateCoach(coach.id, patch);
      if (patch.listed !== undefined) await refreshCoaching();
    } catch (e) {
      setState((p) => ({ ...p, coaches: p.coaches.map((c) => (c.id === coach.id ? before : c)) }));
      throw e;
    }
  }, [refreshCoaching]);

  const saveCoachService = useCallback(async (service: CoachService & { active?: boolean }) => {
    const coach = ownCoach();
    if (!coach) throw new Error('Only approved coaches can offer services.');
    const at = coach.services.findIndex((x) => x.id === service.id);
    const position = at >= 0 ? at : coach.services.length;
    const id = live(stateRef.current.currentUserId, coach.id) ? await remote.saveService(coach.id, service, position) : (at >= 0 ? service.id : nextId('svc'));
    const saved = { ...service, id };
    haptics.commit();
    setState((p) => ({
      ...p,
      coaches: p.coaches.map((c) => (c.id !== coach.id ? c : { ...c, services: at >= 0 ? c.services.map((x) => (x.id === service.id ? saved : x)) : [...c.services, saved] })),
    }));
  }, []);

  const removeCoachService = useCallback(async (serviceId: ID) => {
    const coach = ownCoach();
    if (!coach) return;
    if (live(stateRef.current.currentUserId, coach.id)) await remote.removeService(serviceId);
    setState((p) => ({ ...p, coaches: p.coaches.map((c) => (c.id !== coach.id ? c : { ...c, services: c.services.filter((x) => x.id !== serviceId) })) }));
  }, []);

  const checkPayouts = useCallback(async () => {
    const coach = ownCoach();
    if (!coach || !live(stateRef.current.currentUserId, coach.id)) return !!coach?.payoutsReady;
    const { ready } = await remote.checkPayouts();
    await refreshCoaching();
    return ready;
  }, [refreshCoaching]);

  const setupPayouts = useCallback(async () => {
    const coach = ownCoach();
    if (!coach) throw new Error('Only approved coaches can set up payouts.');
    if (!live(stateRef.current.currentUserId, coach.id)) {
      setState((p) => ({ ...p, coaches: p.coaches.map((c) => (c.id === coach.id ? { ...c, payoutsStarted: true, payoutsReady: true } : c)) }));
      return true;
    }
    const back = Linking.createURL('coach-studio');
    const { url } = await remote.connectPayouts(back);
    if (!url) return checkPayouts();
    if (Platform.OS === 'web') { window.location.assign(url); return false; }
    await WebBrowser.openAuthSessionAsync(url, back);
    return checkPayouts();
  }, [checkPayouts]);

  const openPayoutDashboard = useCallback(async () => {
    const { url } = await remote.payoutDashboard();
    // Same tab on the web: Safari blocks a new tab opened this long after the tap.
    if (Platform.OS === 'web') window.location.assign(url);
    else await WebBrowser.openBrowserAsync(url);
  }, []);

  const loadAllApplications = useCallback(() => remote.fetchAllApplications(), []);
  const approveCoachApplication = useCallback(async (applicationId: ID, note?: string) => {
    await remote.approveCoach(applicationId, note);
    haptics.commit();
    await refreshCoaching();
  }, [refreshCoaching]);
  const rejectCoachApplication = useCallback(async (applicationId: ID, note?: string) => {
    await remote.rejectCoach(applicationId, note);
    haptics.tap();
  }, []);

  /* ------------------------------- Location ------------------------------- */

  /**
   * Turning Location on asks the device once, through its own prompt, and
   * keeps only the nearest city name. Resolves with a message for the screen
   * to show, or null when everything went fine.
   */
  /** When and where your spot was last sent (see the effect below). */
  const markedAt = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const setLocationEnabled = useCallback(async (enabled: boolean): Promise<string | null> => {
    const remember = (on: boolean) => {
      try {
        if (Platform.OS === 'web') localStorage.setItem('courtside-location', on ? 'on' : 'off');
        else void AsyncStorage.setItem('courtside-location', on ? 'on' : 'off').catch(() => {});
      } catch {}
    };
    if (!enabled) {
      remember(false);
      // Location off means off: the spot others saw goes too, and with it any "I'm playing here" (the server drops both).
      // Your own pin goes from this phone's map at once as well.
      const self = stateRef.current.currentUserId;
      if (self) { delete seenAround.current[self]; delete seenInView.current[self]; }
      setState((prev) => ({
        ...prev, locationEnabled: false, locationAsked: true, detectedLocation: null, detectedCoords: null,
        lastSeen: self && prev.lastSeen[self] ? Object.fromEntries(Object.entries(prev.lastSeen).filter(([id]) => id !== self)) : prev.lastSeen,
        courtNow: Object.fromEntries(Object.entries(prev.courtNow).map(([id, row]) => [id, { ...row, youHere: false }])),
        followedCourts: prev.followedCourts?.map((c) => ({ ...c, youHere: false })) ?? null,
      }));
      if (live(self)) {
        // Since migration 98 nobody counts as near someone with no spot of
        // their own: once the server has forgotten yours, the map is asked
        // again (you and your friends), and what the full map last brought
        // for its view keeps only your friends, so strangers loaded a moment
        // ago do not stay on the pins and in the tray until the next pan. A
        // load asked for before the server forgot is dropped when it lands.
        // Kept on this device until the server has it, so a failed forget is tried again (loadLastSeen).
        writeForgetPending(self);
        void remote.forgetLastSeen().catch(() => false).then((ok) => {
          if (stateRef.current.currentUserId !== self || stateRef.current.locationEnabled) return;
          if (!ok) {
            showToast({ title: 'Couldn’t hide your spot yet', body: 'Others may still see it. We’ll keep trying.', icon: 'cloud-offline-outline' });
            return;
          }
          writeForgetPending(null);
          spotGen.current += 1;
          seenInView.current = Object.fromEntries(Object.entries(seenInView.current).filter(([, r]) => r.mutual));
          return loadLastSeen();
        }).catch(() => undefined);
      }
      markedAt.current = null;
      return null;
    }
    const result = await getPosition();
    if (!result.ok) {
      remember(false);
      setState((prev) => ({ ...prev, locationEnabled: false, locationAsked: true, detectedLocation: null, detectedCoords: null }));
      // Short on purpose: these sit under a settings row and in small notes.
      return result.reason === 'denied'
        ? (Platform.OS === 'web' ? 'Blocked by your browser' : 'Blocked in your phone’s Settings')
        : result.reason === 'unavailable'
          ? 'Not available on this device'
          : 'Couldn’t find you. Try again';
    }
    const place = nearestPlace(result.lat, result.lng);
    haptics.tap();
    remember(true);
    writeForgetPending(null);
    setState((prev) => ({ ...prev, locationEnabled: true, locationAsked: true, detectedLocation: place.name, detectedCoords: { lat: result.lat, lng: result.lng } }));
    return null;
  }, [loadLastSeen]);

  // Where you are, for other players' maps: the database keeps the exact spot
  // to itself and shows each player only what they may see (about a kilometre
  // out, on your court, or exact for people who follow each other with you;
  // migration 63). Sent again only after a real move or a quarter of an hour.
  useEffect(() => {
    const me = state.currentUserId;
    const at = state.detectedCoords;
    if (!state.locationEnabled || !at || !live(me)) return;
    const last = markedAt.current;
    // A real move: about a kilometre before migration 63 (the spot was kept no finer); since it,
    // about 150 m, the reach of "at a court", so arriving at one moves your pin onto it.
    const step = stateRef.current.mapLive ? 0.0015 : 0.01;
    const moved = !last || Math.abs(last.lat - at.lat) > step || Math.abs(last.lng - at.lng) > step;
    if (!moved && Date.now() - last!.at < 15 * 60 * 1000) return;
    // "Players nearby" are the ones near the spot the database has for you
    // (migration 98), so the first spot sent in a session, or one far from
    // the last (about 20 km, a trip to another town), asks the map again
    // once it is in: the first load may have run before it, from yesterday's
    // spot or from none at all (friends only).
    const refresh = !last || Math.abs(last.lat - at.lat) > 0.2 || Math.abs(last.lng - at.lng) > 0.2;
    markedAt.current = { lat: at.lat, lng: at.lng, at: Date.now() };
    const marked = remote.markLastSeen(at.lat, at.lng, state.detectedLocation ?? undefined);
    if (refresh) void marked.then(() => loadLastSeen()).catch(() => undefined);
  }, [state.currentUserId, state.detectedCoords, state.detectedLocation, state.locationEnabled, loadLastSeen]);

  // Back in the app (or signed in) with a Location off still to reach the server: try again.
  useEffect(() => {
    const me = stateRef.current.currentUserId;
    if (!state.remoteLoaded || !live(me)) return;
    void readForgetPending().then((who) => { if (who === me) void loadLastSeen(); });
  }, [state.remoteLoaded, liveEpoch, loadLastSeen]);

  // The phone keeps the Location switch too (the browser reads it at start),
  // so the map opens where you are instead of forgetting on every launch.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem('courtside-location')
      .then((flag) => { setState((prev) => ({ ...prev, locationAsked: flag !== null, locationEnabled: prev.locationEnabled || flag === 'on' })); })
      // Unreadable counts as chosen: never an ask set off by a storage hiccup.
      .catch(() => { setState((prev) => ({ ...prev, locationAsked: true })); });
  }, []);

  // Someone who left Location on last time gets the city refreshed quietly.
  useEffect(() => {
    if (!state.locationEnabled || state.detectedLocation) return;
    getPosition().then((result) => {
      if (result.ok) {
        const place = nearestPlace(result.lat, result.lng);
        setState((prev) => ({ ...prev, detectedLocation: place.name, detectedCoords: { lat: result.lat, lng: result.lng } }));
      } else if (result.reason === 'denied') {
        // Taken away in the device's settings since: the switch says so.
        setState((prev) => ({ ...prev, locationEnabled: false }));
      }
    });
  }, [state.locationEnabled, state.detectedLocation]);

  // Back to the front with Location on, where you are now (Oct 5): a phone
  // opened in Cary in the morning and picked up again in Durham measures
  // every "x mi" from Durham, not from where the app was opened. At most
  // every five minutes (or until a first fix comes, if the one at launch
  // never did), never with the device's own prompt (quiet), and only a real
  // move (about 150 m) changes anything; sending your spot on is the effect
  // above's, as for any fix. Location switched off meanwhile: the answer is dropped.
  const fixAskedAt = useRef(Date.now());
  const fixAsking = useRef(false);
  useEffect(() => {
    if (!state.locationEnabled) return undefined;
    const FRESH_MS = 5 * 60_000;
    const refresh = () => {
      if (fixAsking.current || (stateRef.current.detectedCoords && Date.now() - fixAskedAt.current < FRESH_MS)) return;
      fixAsking.current = true;
      fixAskedAt.current = Date.now();
      void getPosition({ recentMs: FRESH_MS, quiet: true }).then((result) => {
        if (!result.ok) return;
        setState((prev) => {
          if (!prev.locationEnabled) return prev;
          const was = prev.detectedCoords;
          if (was && Math.abs(was.lat - result.lat) < 0.0015 && Math.abs(was.lng - result.lng) < 0.0015) return prev;
          return { ...prev, detectedLocation: nearestPlace(result.lat, result.lng).name, detectedCoords: { lat: result.lat, lng: result.lng } };
        });
      }).finally(() => { fixAsking.current = false; });
    };
    const sub = DeviceState.addEventListener('change', (st) => { if (st === 'active') refresh(); });
    const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => { sub.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); };
  }, [state.locationEnabled]);

  /* ------------------------------- Payments ------------------------------- */

  const setDefaultPayment = useCallback((id: ID) => {
    haptics.tap();
    setState((prev) => (prev.paymentMethods.some((m) => m.id === id) ? { ...prev, defaultPaymentId: id } : prev));
    try {
      if (Platform.OS === 'web') localStorage.setItem('courtside-default-payment', id);
    } catch {}
  }, []);

  /**
   * Adds a wallet or PayPal. Cards are deliberately not addable here: card
   * numbers go straight to the payment provider's own form, never through us.
   */
  const addPaymentMethod = useCallback((kind: PaymentKind) => {
    setState((prev) => {
      if (kind === 'card' || prev.paymentMethods.some((m) => m.kind === kind)) return prev;
      haptics.commit();
      const label = kind === 'apple-pay' ? 'Apple Pay' : kind === 'google-pay' ? 'Google Pay' : 'PayPal';
      const me = prev.users.find((u) => u.id === prev.currentUserId);
      const method: PaymentMethod = {
        id: nextId('pm'),
        kind,
        label,
        detail: kind === 'paypal' && me ? `${me.handle}@example.com` : undefined,
      };
      return { ...prev, paymentMethods: [...prev.paymentMethods, method] };
    });
  }, []);

  const removePaymentMethod = useCallback((id: ID) => {
    setState((prev) => {
      const remaining = prev.paymentMethods.filter((m) => m.id !== id);
      if (remaining.length === prev.paymentMethods.length) return prev;
      haptics.untap();
      const defaultPaymentId = prev.defaultPaymentId === id ? remaining[0]?.id ?? null : prev.defaultPaymentId;
      return { ...prev, paymentMethods: remaining, defaultPaymentId };
    });
  }, []);

  /* -------------------------------- People -------------------------------- */

  const toggleIn = (list: ID[], id: ID) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  // The database would not take a follow or an ask (someone you are blocked
  // with): the button goes back, and a note says why.
  const toggleFollowRef = useRef<(userId: ID, quiet?: boolean) => void>(() => undefined);
  const followRefused = (userId: ID) => {
    showToast({ title: "You can't follow this account", icon: 'lock-closed-outline' });
    // Quiet: putting the button back is not an unfollow to offer to undo.
    toggleFollowRef.current(userId, true);
  };
  const toggleFollow = useCallback((userId: ID, quiet?: boolean) => {
    {
      const me = stateRef.current.currentUserId;
      const target = stateRef.current.users.find((u) => u.id === userId);
      const following = stateRef.current.followingIds.includes(userId);
      if (me && userId !== me && target?.isPrivate && !following) {
        // A private account: this is an ask, not a follow. Asking twice takes it back.
        const asked = stateRef.current.followRequests.some((r) => r.fromId === me && r.toId === userId);
        asked ? haptics.untap() : haptics.tap();
        if (live(me, userId)) {
          if (asked) void remote.cancelFollowRequest(me, userId);
          else void remote.sendFollowRequest(me, userId).then((r) => { if (r === 'refused') followRefused(userId); });
        }
        setState((prev) => {
          const next: AppState = {
            ...prev,
            followRequests: asked
              ? prev.followRequests.filter((r) => !(r.fromId === me && r.toId === userId))
              : [...prev.followRequests, { fromId: me, toId: userId, createdAt: new Date().toISOString() }],
            notifications: asked ? prev.notifications.filter((n) => !(n.kind === 'follow-request' && n.actorId === me && n.userId === userId)) : prev.notifications,
          };
          return asked ? next : withNotification(next, { userId, actorId: me, kind: 'follow-request', targetId: me, targetKind: 'post' });
        });
        return;
      }
      if (live(me, userId) && userId !== me) void remote.setFollow(me!, userId, !following).then((r) => { if (r === 'refused' && !following) followRefused(userId); });
      // The buzz answers the tap itself, not the redraw that follows it.
      if (me && userId !== me) following ? haptics.untap() : haptics.tap();
      // Unfollowing a public account is one tap, so one tap takes it back.
      // (A private one is asked about first: following again would be a new
      // request they have to approve, so there is nothing clean to undo.)
      if (me && userId !== me && following && !target?.isPrivate && !quiet) {
        offerUndo(`Unfollowed${atHandle(userId)}`, () => !stateRef.current.followingIds.includes(userId), () => toggleFollow(userId, true), { icon: 'person-remove-outline' });
      }
    }
    setState((prev) => {
      const me = prev.currentUserId;
      if (!me || userId === me) return prev;
      const following = !prev.followingIds.includes(userId);
      const delta = following ? 1 : -1;
      let next: AppState = {
        ...prev,
        followingIds: toggleIn(prev.followingIds, userId),
        followEdges: following
          ? [...prev.followEdges, { followerId: me, followingId: userId }]
          : prev.followEdges.filter((e) => !(e.followerId === me && e.followingId === userId)),
        users: prev.users.map((u) =>
          u.id === me ? { ...u, following: Math.max(0, u.following + delta) }
          : u.id === userId ? { ...u, followers: Math.max(0, u.followers + delta) }
          : u,
        ),
      };
      if (following) {
        next = withNotification(next, { userId, actorId: me, kind: 'follow', targetId: me, targetKind: 'post' });
      }
      return next;
    });
  }, []);
  toggleFollowRef.current = toggleFollow;

  const acceptFollowRequest = useCallback((requesterId: ID) => {
    const me = requireUser();
    haptics.commit();
    if (live(me, requesterId)) remote.acceptFollowRequest(requesterId);
    setState((prev) => {
      const next: AppState = {
        ...prev,
        followRequests: prev.followRequests.filter((r) => !(r.fromId === requesterId && r.toId === me)),
        followEdges: prev.followEdges.some((e) => e.followerId === requesterId && e.followingId === me) ? prev.followEdges : [...prev.followEdges, { followerId: requesterId, followingId: me }],
        users: prev.users.map((u) => (u.id === me ? { ...u, followers: u.followers + 1 } : u.id === requesterId ? { ...u, following: u.following + 1 } : u)),
        // The ask on your list becomes "started following you".
        notifications: prev.notifications.map((n) => (n.kind === 'follow-request' && n.actorId === requesterId && n.userId === me ? { ...n, kind: 'follow' as const, read: true } : n)),
      };
      return withNotification(next, { userId: requesterId, actorId: me, kind: 'follow-accepted', targetId: me, targetKind: 'post' });
    });
  }, [requireUser]);

  const declineFollowRequest = useCallback((requesterId: ID) => {
    const me = requireUser();
    haptics.untap();
    if (live(me, requesterId)) remote.declineFollowRequest(me, requesterId);
    setState((prev) => ({
      ...prev,
      followRequests: prev.followRequests.filter((r) => !(r.fromId === requesterId && r.toId === me)),
      notifications: prev.notifications.filter((n) => !(n.kind === 'follow-request' && n.actorId === requesterId && n.userId === me)),
    }));
  }, [requireUser]);

  const setPrivateAccount = useCallback((enabled: boolean) => {
    const me = requireUser();
    haptics.commit();
    patchCurrentUser((u) => ({ ...u, isPrivate: enabled || undefined }));
    if (live(me)) remote.updateProfile(me, { isPrivate: enabled });
    // Public now: everyone still waiting on a follow request is let in, the
    // way Instagram does it, rather than left on "Requested" with nothing to wait for.
    if (!enabled) {
      for (const r of stateRef.current.followRequests) if (r.toId === me) acceptFollowRequest(r.fromId);
    }
  }, [requireUser, patchCurrentUser, acceptFollowRequest]);

  const setOpenToHit = useCallback((on: boolean) => {
    const me = requireUser();
    const until = on ? endOfToday() : undefined;
    const was = stateRef.current.users.find((u) => u.id === me)?.openToHitUntil;
    // The switch that sets it gives the tap (Toggle's `haptic`), the moment it flips.
    patchCurrentUser((u) => ({ ...u, openToHitUntil: until }));
    if (!live(me)) return;
    void remote.updateProfile(me, { openToHitUntil: until ?? null }).catch(() => false).then((ok) => {
      // Not saved: nobody else sees it, so the switch goes back (unless a later tap has changed it since) and says so.
      if (ok || stateRef.current.currentUserId !== me) return;
      if (stateRef.current.users.find((u) => u.id === me)?.openToHitUntil !== until) return;
      patchCurrentUser((u) => (u.openToHitUntil === until ? { ...u, openToHitUntil: was } : u));
      haptics.untap();
      showToast({ title: on ? 'Couldn’t turn on Open to hit today' : 'Couldn’t turn off Open to hit today', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' });
    });
  }, [requireUser, patchCurrentUser]);

  const editOpenToHit = useCallback((until: string, miles: number | null) => {
    const me = requireUser();
    const before = stateRef.current.users.find((u) => u.id === me);
    const wasUntil = before?.openToHitUntil;
    const wasMiles = before?.openToHitMiles;
    const nextMiles = asHitMiles(miles);
    haptics.commit();
    patchCurrentUser((u) => ({ ...u, openToHitUntil: until, openToHitMiles: nextMiles }));
    if (!live(me)) return;
    const untilSaved = remote.updateProfile(me, { openToHitUntil: until }).catch(() => false);
    // The distance only when it changed. Before migration 120 ('missing') it stays on this phone, and others read any distance.
    const milesSaved: Promise<boolean | 'missing'> = nextMiles === wasMiles ? Promise.resolve(true) : remote.setOpenToHitMiles(nextMiles ?? null).catch(() => false);
    void Promise.all([untilSaved, milesSaved]).then(([okUntil, okMiles]) => {
      if ((okUntil && okMiles !== false) || stateRef.current.currentUserId !== me) return;
      // Not saved: put back what the server still has (unless a later change has replaced it since), and say so.
      const now = stateRef.current.users.find((u) => u.id === me);
      patchCurrentUser((u) => ({
        ...u,
        ...(!okUntil && now?.openToHitUntil === until ? { openToHitUntil: wasUntil } : {}),
        ...(okMiles === false && now?.openToHitMiles === nextMiles ? { openToHitMiles: wasMiles } : {}),
      }));
      haptics.untap();
      showToast({ title: 'Couldn’t save Open to hit', body: 'Check your connection and try again.', icon: 'cloud-offline-outline' });
    });
  }, [requireUser, patchCurrentUser]);

  const toggleMute = useCallback((userId: ID, quiet?: boolean) => {
    const muting = !stateRef.current.mutedIds.includes(userId);
    // You can't mute yourself (unmuting stays open, so a self-mute saved before this can be undone).
    if (muting && userId === stateRef.current.currentUserId) return;
    setState((prev) => {
      prev.mutedIds.includes(userId) ? haptics.untap() : haptics.tap();
      return { ...prev, mutedIds: toggleIn(prev.mutedIds, userId) };
    });
    if (quiet) return;
    offerUndo(
      `${muting ? 'Muted' : 'Unmuted'}${atHandle(userId)}`,
      () => stateRef.current.mutedIds.includes(userId) === muting,
      () => toggleMute(userId, true),
      { body: muting ? 'Their posts won’t show up for you' : undefined, icon: muting ? 'volume-mute-outline' : 'volume-high-outline' },
    );
  }, []);

  /**
   * Blocking also unfollows, both ways, and drops your one-to-one chat. A
   * group you are both in stays (Instagram's way): both can still write
   * there, and their messages fold away on your side.
   */
  const toggleBlock = useCallback((userId: ID, quiet?: boolean) => {
    // Blocking has already been asked about, so only unblocking offers Undo,
    // which blocks again (unblocking put nothing back that blocking took).
    const me = stateRef.current.currentUserId;
    if (!quiet && me && userId !== me && stateRef.current.blockedIds.includes(userId)) {
      offerUndo(`Unblocked${atHandle(userId)}`, () => !stateRef.current.blockedIds.includes(userId), () => toggleBlock(userId, true), { icon: 'checkmark-circle-outline' });
    }
    // Blocking: your one-to-one chat with them leaves the inbox, so its pin
    // comes off on the server too (it held one of your three pin places, out of sight).
    if (me && userId !== me && !stateRef.current.blockedIds.includes(userId)) {
      const pinnedWith = findDirectChat(stateRef.current.conversations, me, userId);
      if (pinnedWith?.pinnedAt && live(me, pinnedWith.id)) void remote.setChatPin(pinnedWith.id, false).catch(() => undefined);
    }
    setState((prev) => {
      const me = prev.currentUserId;
      if (!me || userId === me) return prev;
      const blocking = !prev.blockedIds.includes(userId);
      blocking ? haptics.commit() : haptics.untap();
      const wasFollowing = prev.followingIds.includes(userId);
      return {
        ...prev,
        blockedIds: toggleIn(prev.blockedIds, userId),
        followingIds: blocking ? prev.followingIds.filter((id) => id !== userId) : prev.followingIds,
        followEdges: blocking
          ? prev.followEdges.filter((e) => !((e.followerId === me && e.followingId === userId) || (e.followerId === userId && e.followingId === me)))
          : prev.followEdges,
        alertIds: blocking ? prev.alertIds.filter((id) => id !== userId) : prev.alertIds,
        users: blocking && wasFollowing
          ? prev.users.map((u) =>
              u.id === me ? { ...u, following: Math.max(0, u.following - 1) }
              : u.id === userId ? { ...u, followers: Math.max(0, u.followers - 1) }
              : u,
            )
          : prev.users,
        conversations: blocking
          ? prev.conversations.filter((c) => !(isDirectChat(c) && c.participantIds.includes(userId) && c.participantIds.includes(me)))
          : prev.conversations,
        // Session tags between the two end, either way round, and their name leaves your posts (the database does the same, migration 62).
        ...(blocking ? {
          sessionTags: prev.sessionTags.filter((t) => !((t.taggerId === me && t.taggedId === userId) || (t.taggerId === userId && t.taggedId === me))),
          posts: prev.sessionTags
            .filter((t) => t.taggerId === me && t.taggedId === userId && t.status === 'accepted')
            .reduce((list, t) => patchWith(list, me, t.sessionId, userId, null), prev.posts),
        } : {}),
      };
    });
  }, []);

  const isBlocked = useCallback((userId: ID) => stateRef.current.blockedIds.includes(userId), []);

  const toggleAlerts = useCallback((userId: ID, quiet?: boolean) => {
    const turningOn = !stateRef.current.alertIds.includes(userId);
    setState((prev) => {
      prev.alertIds.includes(userId) ? haptics.untap() : haptics.tap();
      return { ...prev, alertIds: toggleIn(prev.alertIds, userId) };
    });
    if (quiet) return;
    const handle = atHandle(userId);
    offerUndo(
      turningOn ? 'Notifications on' : 'Notifications off',
      () => stateRef.current.alertIds.includes(userId) === turningOn,
      () => toggleAlerts(userId, true),
      { body: handle ? `For new posts from${handle}` : undefined, icon: turningOn ? 'notifications-outline' : 'notifications-off-outline' },
    );
  }, []);

  /**
   * A tip on the board at once. Refused for its words (migration 117), or not
   * saved at all, it comes off again and this throws with why, so the box
   * keeps what was written and says so under it.
   */
  const submitTip = useCallback(async (body: string) => {
    const me = requireUser();
    const tip: Tip = { id: nextId('tip'), authorId: me, body, createdAt: new Date().toISOString(), votes: 0, votedBy: {} };
    setState((prev) => ({ ...prev, tips: [tip, ...prev.tips] }));
    const result = live(me, tip.id) ? await remote.insertTip(tip).catch(() => 'failed' as const) : undefined;
    if (!result) { haptics.commit(); return; }
    setState((prev) => ({ ...prev, tips: prev.tips.filter((t) => t.id !== tip.id) }));
    haptics.reject();
    throw new Error(result === 'blocked' ? 'It has words that break CourtSide’s rules. Change them and send it again.' : 'That didn’t send. Check your connection and try again.');
  }, [requireUser]);
  const voteTip = useCallback((tipId: ID, direction: 1 | -1) => {
    haptics.tap();
    const me = requireUser();
    setState((prev) => ({ ...prev, tips: prev.tips.map((t) => (t.id === tipId ? applyVote(t, me, direction) : t)) }));
    if (live(me, tipId)) void remote.voteTip(tipId, direction);
  }, [requireUser]);
  const deleteTip = useCallback((tipId: ID) => {
    const me = requireUser();
    const tip = stateRef.current.tips.find((t) => t.id === tipId);
    if (!tip || tip.authorId !== me) return;
    haptics.commit();
    setState((prev) => ({ ...prev, tips: prev.tips.filter((t) => t.id !== tipId) }));
    if (!live(me, tipId)) return;
    remote.deleteTip(tipId).catch((err: unknown) => {
      void reportError(err, { where: 'tip delete' });
      setState((prev) => (prev.tips.some((t) => t.id === tipId) ? prev : { ...prev, tips: [tip, ...prev.tips] }));
      showToast({ title: 'Couldn’t delete your tip. Try again.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  const reportUser = useCallback((userId: ID | null | undefined, target: string, note = ''): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    // Nobody reports themselves (toggleBlock has the same check).
    if (userId && userId === me) return Promise.resolve(false);
    haptics.commit();
    // What was reported leaves your screens at once: a post, hit, thread, reply, comment, coach question or reply, tip, review, court note or group.
    const hide = REPORTED_TARGET.exec(target)?.[1];
    const fresh = !!hide && !stateRef.current.reportedIds.includes(hide);
    if (fresh) setState((prev) => (prev.reportedIds.includes(hide!) ? prev : { ...prev, reportedIds: [...prev.reportedIds, hide!] }));
    // The demo has nobody to send it to: it simply says thanks (as reportChat does).
    if (!me || !live(me)) return Promise.resolve(true);
    const about = userId && UUID.test(userId) ? userId : null;
    return remote.fileReport(me, about, target, note).catch(() => false).then((filed) => {
      // Not sent: it comes back, so it can be reported again (the caller says it didn't send).
      if (!filed && fresh) setState((prev) => ({ ...prev, reportedIds: prev.reportedIds.filter((x) => x !== hide) }));
      return filed;
    });
  }, []);
  const resolveCoachQuestion = useCallback((questionId: ID) => {
    const me = requireUser();
    const question = stateRef.current.coachQuestions.find((q) => q.id === questionId);
    if (!question || question.authorId !== me) return;
    haptics.commit();
    setState((prev) => ({ ...prev, coachQuestions: prev.coachQuestions.map((q) => (q.id === questionId ? { ...q, resolved: !q.resolved } : q)) }));
    if (live(me, questionId)) void remote.setCoachQuestionResolved({ ...question, resolved: !question.resolved });
  }, [requireUser]);
  /**
   * Your own public coach question, gone for everyone along with the coaches'
   * answers to it. Only the asker can. It leaves the screen at once; if the
   * database says no (or the connection drops) it all comes back exactly as
   * it was and a toast says so, rather than vanishing here while it stays up
   * for everyone else.
   */
  // Your own thread reply. Replies under it stay and move up a level; it comes back if the server says no.
  const deleteAnswer = useCallback((answerId: ID) => {
    const me = requireUser();
    const answer = stateRef.current.answers.find((a) => a.id === answerId);
    if (!answer || answer.authorId !== me) return;
    const takeOff = (prev: AppState): AppState => ({
      ...prev,
      answers: prev.answers.filter((a) => a.id !== answerId),
      questions: prev.questions.map((q) => q.id === answer.questionId
        ? { ...q, answerIds: q.answerIds.filter((id) => id !== answerId), acceptedAnswerId: q.acceptedAnswerId === answerId ? undefined : q.acceptedAnswerId }
        : q),
    });
    haptics.commit();
    setState(takeOff);
    if (!live(me, answer.questionId)) return;
    // Still being saved (its picture or clip going up): the save stops, or,
    // if it gets there first, the delete follows it. Never saved: nothing to delete.
    const saving = answerSaves.current.get(answerId);
    if (saving) answersDeleted.current.add(answerId);
    void (saving ?? Promise.resolve(true)).then((saved) => {
      if (!saved) return;
      remote.deleteAnswer(answerId).then(
        // A thread refresh that went out before the delete may have brought it back meanwhile.
        () => setState((prev) => (prev.answers.some((a) => a.id === answerId) ? takeOff(prev) : prev)),
        (err: unknown) => {
          void reportError(err, { where: 'answer delete' });
          setState((prev) => prev.answers.some((a) => a.id === answerId) ? prev : {
            ...prev,
            answers: [...prev.answers, answer],
            questions: prev.questions.map((q) => q.id === answer.questionId && !q.answerIds.includes(answerId) ? { ...q, answerIds: [...q.answerIds, answerId] } : q),
          });
          showToast({ title: 'Couldn’t delete your reply. Try again.', icon: 'alert-circle-outline' });
        },
      );
    });
  }, [requireUser]);
  const deleteCoachQuestion = useCallback((questionId: ID) => {
    const me = requireUser();
    const s = stateRef.current;
    const question = s.coachQuestions.find((q) => q.id === questionId);
    if (!question || question.authorId !== me) return;
    const at = s.coachQuestions.indexOf(question);
    const replies = s.coachReplies.filter((r) => r.questionId === questionId);
    const takeOff = (prev: AppState): AppState => ({
      ...prev,
      coachQuestions: prev.coachQuestions.filter((q) => q.id !== questionId),
      coachReplies: prev.coachReplies.filter((r) => r.questionId !== questionId),
    });
    haptics.commit();
    setState(takeOff);
    // The demo, or a question whose clip is still uploading: not on the server
    // yet, so there is nothing more to do. The upload sees this and never
    // saves it, and its strip leaves now rather than ending on "Posted".
    if (!live(me, questionId) || coachClipsUploading.current.has(questionId)) {
      coachQuestionsDeleted.current.add(questionId);
      if (coachClipsUploading.current.has(questionId)) cancelUpload(questionId);
      return;
    }
    remote.deleteCoachQuestion(questionId).then(
      // A refresh that started before the delete may have brought it back meanwhile.
      () => setState((prev) => (prev.coachQuestions.some((q) => q.id === questionId) ? takeOff(prev) : prev)),
      (err: unknown) => {
        void reportError(err, { where: 'coach question delete' });
        setState((prev) => (prev.coachQuestions.some((q) => q.id === questionId) ? prev : {
          ...prev,
          // Back in its old place in the list, with every answer it had.
          coachQuestions: [...prev.coachQuestions.slice(0, at), question, ...prev.coachQuestions.slice(at)],
          coachReplies: [...prev.coachReplies, ...replies.filter((r) => !prev.coachReplies.some((x) => x.id === r.id))],
        }));
        showToast({ title: 'Couldn’t delete your question. Try again.', icon: 'alert-circle-outline' });
      },
    );
  }, [requireUser]);
  const setPref = useCallback((key: PrefKey, value: boolean) => {
    haptics.tap();
    setState((prev) => ({ ...prev, prefs: { ...prev.prefs, [key]: value } }));
  }, []);

  /* -------------------------------------------------------- hidden words */
  // Settings → Hidden words (migration 117). The server keeps them and does
  // all the hiding; the demo keeps them on this phone and hides nothing.
  const loadHiddenWords = useCallback(async (): Promise<'ok' | 'not_ready' | 'failed'> => {
    const me = stateRef.current.currentUserId;
    if (!me) return 'failed';
    if (!live(me)) {
      const self = stateRef.current.users.find((u) => u.id === me);
      setState((prev) => (prev.hiddenWords ? prev : { ...prev, hiddenWords: defaultHiddenWords(!self || notKnownAdult(self)) }));
      return 'ok';
    }
    const got = await remote.fetchHiddenWords().catch(() => null);
    if (got === 'not_ready') return 'not_ready';
    if (!got) return 'failed';
    if (stateRef.current.currentUserId === me) setState((prev) => ({ ...prev, hiddenWords: got }));
    return 'ok';
  }, []);

  const saveHiddenWords = useCallback(async (next: Omit<HiddenWords, 'locked'>): Promise<string | null> => {
    const me = stateRef.current.currentUserId;
    const before = stateRef.current.hiddenWords;
    if (!me || !before) return 'That didn’t save. Try again.';
    const customWords = cleanWords(next.customWords);
    if (customWords.length > HIDDEN_WORDS_MAX) return `You can hide up to ${HIDDEN_WORDS_MAX} words and phrases.`;
    if (customWords.some((w) => w.length > HIDDEN_WORD_LENGTH)) return `Each one can be up to ${HIDDEN_WORD_LENGTH} characters.`;
    // Under 18: both offensive filters stay on, whatever was tapped (the server holds to it too).
    const shown: HiddenWords = {
      ...next, customWords, locked: before.locked,
      hideOffensiveComments: before.locked || next.hideOffensiveComments,
      hideOffensiveRequests: before.locked || next.hideOffensiveRequests,
    };
    setState((prev) => ({ ...prev, hiddenWords: shown }));
    if (!live(me)) return null;
    const saved = await remote.saveHiddenWords(shown).catch(() => 'failed' as const);
    if (stateRef.current.currentUserId !== me) return null;
    if (typeof saved === 'object') {
      setState((prev) => (prev.hiddenWords === shown ? { ...prev, hiddenWords: saved } : prev));
      return null;
    }
    // Not saved: back to what it was, unless it has been changed again since.
    setState((prev) => (prev.hiddenWords === shown ? { ...prev, hiddenWords: before } : prev));
    return saved === 'too_many_words' ? `You can hide up to ${HIDDEN_WORDS_MAX} words and phrases.`
      : saved === 'word_too_long' ? `Each one can be up to ${HIDDEN_WORD_LENGTH} characters.`
      : saved === 'not_ready' ? 'Hidden words aren’t switched on yet.'
      : 'That didn’t save. Check your connection and try again.';
  }, []);

  const unhideByWords = useCallback((kind: HiddenWordsKind, id: ID) => {
    const me = requireUser();
    haptics.tap();
    // Shown (or, if the server says no, hidden again): the flag, and a post's or Instant's count.
    // With it go the replies under it (they were not shown or counted while it was hidden).
    const put = (hidden: boolean) => setState((prev) => {
      const recount = (ids: ID[], those: ID[]) => (hidden ? ids.filter((x) => !those.includes(x)) : [...ids, ...those.filter((x) => !ids.includes(x))]);
      if (kind === 'answer') {
        const answer = prev.answers.find((a) => a.id === id);
        if (!answer) return prev;
        const those = prev.answers.filter((a) => a.id === id || (a.parentAnswerId === id && !a.hiddenByWords)).map((a) => a.id);
        return {
          ...prev,
          answers: prev.answers.map((a) => (a.id === id ? { ...a, hiddenByWords: hidden || undefined } : a)),
          questions: prev.questions.map((q) => (q.id === answer.questionId ? { ...q, answerIds: recount(q.answerIds, those) } : q)),
        };
      }
      if (kind === 'coach-reply') {
        const reply = prev.coachReplies.find((r) => r.id === id);
        if (!reply) return prev;
        return {
          ...prev,
          coachReplies: prev.coachReplies.map((r) => (r.id === id ? { ...r, hiddenByWords: hidden || undefined } : r)),
          coachQuestions: prev.coachQuestions.map((q) => (q.id === reply.questionId ? { ...q, replyIds: recount(q.replyIds, [id]) } : q)),
        };
      }
      const comment = prev.comments.find((c) => c.id === id);
      if (!comment) return prev;
      const those = prev.comments.filter((c) => c.id === id || (c.parentId === id && !c.hiddenByWords)).map((c) => c.id);
      const count = <T extends { id: ID; commentIds: ID[] }>(x: T): T => (x.id !== comment.postId ? x : { ...x, commentIds: recount(x.commentIds, those) });
      return {
        ...prev,
        comments: prev.comments.map((c) => (c.id === id ? { ...c, hiddenByWords: hidden || undefined } : c)),
        posts: kind === 'comment' ? prev.posts.map(count) : prev.posts,
        stories: kind === 'hit-comment' ? prev.stories.map(count) : prev.stories,
      };
    });
    put(false);
    if (!live(me, id)) return;
    void remote.unhideWords(kind, id).catch(() => false).then((ok) => {
      if (ok) return;
      put(true);
      showToast({ title: 'That didn’t unhide. Try again in a moment.', icon: 'alert-circle-outline' });
    });
  }, [requireUser]);

  const wordsRefused = useCallback(async (texts: string[]): Promise<boolean> => {
    const me = stateRef.current.currentUserId;
    if (!me || !live(me)) return false;
    // Never holds a post up for long: no answer in 4 seconds counts as no (the server still checks it on saving).
    return Promise.race([remote.wordsRefused(texts).catch(() => false), new Promise<boolean>((done) => setTimeout(() => done(false), 4000))]);
  }, []);

  // Words refused anywhere they were written (migration 117): said once, in plain words.
  // Outcome first, then why and what to do; the same words for a comment, a reply or an edit.
  useEffect(() => onWordsRefused(() => showToast({ title: 'That didn’t go through', body: 'It has words that break CourtSide’s rules. Change them and try again.', icon: 'alert-circle-outline', long: true })), []);

  /* ------------------------------------------------------------- health */
  // The three real sources: Apple Health (read on the phone), WHOOP (through
  // the server, which holds the keys), Cronometer (an export file). Without
  // Supabase the demo simply flips the flag.
  const applyHealth = useCallback((got: { days: DailyHealth[]; connections: { provider: IntegrationProvider; lastSyncedAt?: string; readsWorkouts?: boolean; readsAllWorkouts?: boolean }[] }) => {
    setState((prev) => ({
      ...prev,
      healthHistory: got.days,
      healthIsReal: true,
      integrations: withCatalog(prev.integrations).map((i) => { const c = got.connections.find((x) => x.provider === i.provider); return { ...i, connected: !!c, lastSyncedAt: c?.lastSyncedAt, readsWorkouts: c?.readsWorkouts, readsAllWorkouts: c?.readsAllWorkouts }; }),
    }));
  }, []);
  /** Fetches your sources again; resolves with what came back (null when nothing did) for a step that cannot wait for the screen to redraw. */
  const reloadHealth = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return null;
    const got = await remote.fetchHealth(me!).catch(() => null);
    if (got) applyHealth(got);
    return got;
  }, [applyHealth]);
  useEffect(() => { if (live(state.currentUserId)) void reloadHealth(); }, [state.currentUserId, reloadHealth]);

  // The claim in flight, so "who invited me" waits for a link's claim to land.
  const referralClaim = useRef<Promise<void> | null>(null);
  const claimPendingReferral = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    const run = (async () => {
      const handle = await peekReferrer();
      if (!handle) return;
      // A friend's waitlist code (r=<code>, carried by the website's web-app
      // link): the friend it belongs to, the way "Invited by?" reads it. Kept
      // only while the answer is still out; a code with no account behind it
      // is let go, and setup's "Invited by?" still asks.
      if (isWaitlistCode(handle)) {
        const r = await remote.claimInviteCode(handle).catch((): InviteCodeResult => ({ error: 'offline' }));
        if (r.error === 'offline') return;
        await forgetReferrer();
        if (r.ok && r.followed) showInviterFollow(r.id, r.handle);
        return;
      }
      const answer = await remote.claimReferral(handle).catch(() => ({ ok: false as const }));
      // Not answered (offline, a server hiccup): the handle is kept, tried
      // again the next time the app opens signed in, and offered in setup's
      // "Invited by?" meanwhile.
      if (!answer.ok) return;
      await forgetReferrer();
      // Null when no follow was made: a teen, or someone whose age is not on
      // file yet, is never made to follow the sharer (followInviter makes it
      // once the birthday says adult).
      if (answer.followed) { showInviterFollow(answer.followed, handle); return; }
      // Already credited as the account was made (the link rode along with
      // the sign-up): the follow the claim would have made, by the same rules.
      void followInviter();
    })();
    referralClaim.current = run;
    try { await run; } finally { if (referralClaim.current === run) referralClaim.current = null; }
  }, []);
  const myInviter = useCallback(async (): Promise<MyInviter | null> => {
    if (!live(stateRef.current.currentUserId)) return null;
    await referralClaim.current?.catch(() => undefined);
    return remote.myInviter().catch(() => null);
  }, []);
  const claimInviteCode = useCallback(async (code: string): Promise<InviteCodeResult> => {
    if (!live(stateRef.current.currentUserId)) return { error: 'offline' };
    const r = await remote.claimInviteCode(code).catch((): InviteCodeResult => ({ error: 'offline' }));
    if (r.ok && r.followed) showInviterFollow(r.id, r.handle);
    return r;
  }, []);
  // You follow whoever invited you (or, if their account is private, ask
  // to); they are never made to follow you back without saying so.
  const showInviterFollow = (who: ID, handle?: string) => {
    const me = stateRef.current.currentUserId;
    const them = stateRef.current.users.find((u) => u.id === who);
    if (them?.isPrivate) {
      setState((prev) => ({ ...prev, followRequests: prev.followRequests.some((r) => r.fromId === me && r.toId === who) ? prev.followRequests : [...prev.followRequests, { fromId: me!, toId: who, createdAt: new Date().toISOString() }] }));
      showToast({ title: `Asked to follow @${them.handle}`, body: 'They invited you. Once they say yes, you will see their posts.', icon: 'people-outline' });
    } else {
      setState((prev) => ({ ...prev, followingIds: prev.followingIds.includes(who) ? prev.followingIds : [...prev.followingIds, who] }));
      showToast({ title: them?.handle ?? handle ? `You're following @${them?.handle ?? handle}` : "You're following who invited you", body: 'They invited you to CourtSide.', icon: 'people-outline' });
    }
  };
  const followInviter = async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    const who = await remote.followMyInviter().catch(() => null);
    if (!who) return;
    // Their @handle for the toast, when they are not loaded here yet (someone
    // credited as their account was made has never claimed a link on this phone).
    const known = stateRef.current.users.some((u) => u.id === who);
    const mine = known ? null : await remote.myInviter().catch(() => null);
    showInviterFollow(who, mine?.id === who ? mine.handle : undefined);
  };
  useEffect(() => { if (live(state.currentUserId)) void claimPendingReferral(); }, [state.currentUserId, claimPendingReferral]);
  const countReferrals = useCallback(async () => { const me = stateRef.current.currentUserId; return live(me) ? remote.countReferrals(me!) : 0; }, []);
  const matchContacts = useCallback(async (phones: string[], emails: string[]) => { const me = stateRef.current.currentUserId; return live(me) ? remote.matchContacts(phones, emails) : []; }, []);
  const myPhone = useCallback(async () => { const me = stateRef.current.currentUserId; return live(me) ? remote.myPhone() : null; }, []);
  const startPhoneLink = useCallback(async (phone: string) => { await remote.startPhoneLink(phone); }, []);
  const confirmPhoneLink = useCallback(async (phone: string, code: string) => { await remote.confirmPhoneLink(phone, code); }, []);
  const unlinkPhone = useCallback(async () => { await remote.unlinkPhone(); }, []);
  const fetchMyInvitees = useCallback(async () => { const me = stateRef.current.currentUserId; return live(me) ? remote.fetchMyInvitees() : []; }, []);

  const pullFrom = useCallback(async (me: ID, provider: Integration['provider']): Promise<boolean> => {
    if (provider === 'apple-health') {
      const days = await readAppleHealth(7);
      await remote.upsertHealthDays(me, days, 'apple-health');
      await remote.setHealthConnection(me, provider, true);
      return true;
    }
    if (provider === 'cronometer' || provider === 'myfitnesspal') {
      const app = provider === 'cronometer' ? 'Cronometer' : 'MyFitnessPal';
      // Through Health when this phone has it — the app writes its meals there — otherwise its export file.
      const days = appleHealthAvailable() ? await readAppleNutrition(14) : await pickNutritionExport(app);
      if (!days) return false;
      if (!days.length) throw new Error(`Nothing from ${app} in Health yet. In ${app}, turn on sharing with Apple Health, log a meal, then sync here.`);
      await remote.upsertHealthDays(me, days, provider);
      await remote.setHealthConnection(me, provider, true);
      return true;
    }
    if (provider === 'whoop') { await remote.whoop('sync'); return true; }
    // Fitbit, Oura, Polar: "Sync now" looks back a week for tennis.
    if (isTracker(provider)) { await remote.trackers('sync', { provider, days: 7 }); return true; }
    return false;
  }, []);

  /**
   * Fitbit's, Oura's or Polar's sign-in, through the server's trackers
   * function (migration 69), the same way as WHOOP's tennis sign-in: the
   * server sends the browser to the tracker, the tracker sends it back, and
   * the sign-in waits until this phone, signed in as you, collects it. So a
   * sign-in link sent to someone else can never put their tracker on the
   * sender's account. Connecting one turns its tennis sessions on.
   */
  const connectTracker = useCallback(async (provider: TrackerId) => {
    const label = stateRef.current.integrations.find((i) => i.provider === provider)?.label ?? 'That tracker';
    const back = Linking.createURL('health');
    const start = await remote.trackers<{ on?: boolean; url?: string }>('start', { provider, back });
    if (!start.on || !start.url) throw new Error(`${label} is coming soon.`);
    const result = await WebBrowser.openAuthSessionAsync(start.url, back);
    if (result.type !== 'success') throw new Error(`${label} was not connected.`);
    const n = /[?&]n=([0-9a-f-]{36})/i.exec(result.url)?.[1];
    if (!n) throw new Error(/tracker=expired/.test(result.url) ? 'That sign-in took too long. Try again.' : `${label} was not connected.`);
    await remote.trackers('finish', { n });
    // The sign-in itself looks back three days; this goes back a week (as Sync now does), so tennis from before connecting is there to log.
    // Waited for, so the check that follows connecting already finds those sessions.
    await remote.trackers('sync', { provider, days: 7 }).catch(() => undefined);
  }, []);

  /**
   * WHOOP's sign-in. The server sends the browser to WHOOP; WHOOP sends it
   * back to the server, which sends it back here. `tennis` also asks WHOOP
   * for workouts, and turns tennis sessions on once WHOOP says yes;
   * `workouts`, every other workout as well (migration 135). Resolves with
   * the past week's sessions the server just filed into Notifications.
   */
  const connectWhoop = useCallback(async (tennis: boolean, workouts = false): Promise<ID[]> => {
    const back = Linking.createURL('health');
    const { url } = await remote.whoop<{ url: string }>('start', tennis ? { back, tennis: true, ...(workouts ? { workouts: true } : {}) } : { back });
    const result = await WebBrowser.openAuthSessionAsync(url, back);
    if (result.type !== 'success') throw new Error('WHOOP was not connected.');
    // A sign-in waits on the server until this phone, signed in as you,
    // collects it, so a WHOOP link sent to someone else can never put their
    // WHOOP on the sender's account. Every sign-in since the security review
    // (Oct 5); before that, only a tennis one (a plain one came back done).
    const n = /[?&]n=([0-9a-f-]{36})/i.exec(result.url)?.[1];
    if (!n) {
      if (!tennis) return [];
      throw new Error('WHOOP was not connected.');
    }
    const done = await remote.whoop<{ fresh?: ID[] }>('finish', { n });
    return done?.fresh ?? [];
  }, []);

  /**
   * Looks for new tennis sessions and (Oct 5) other workouts, and says so
   * when one turns up. `rows` are the sources as just fetched, for a step
   * (turning sessions on) that cannot wait for the screen to catch up;
   * otherwise the ones on screen. `tick` (the look every couple of minutes
   * while the app stays open): your sessions and Notifications are read
   * again only when something new reached the server. `already`: sessions
   * filed just before (WHOOP's past week, as it was connected), said along
   * with whatever this look finds.
   */
  const checkWith = useCallback(async (force: boolean, rows: Pick<Integration, 'provider' | 'connected' | 'readsWorkouts' | 'readsAllWorkouts'>[], tick = false, already: ID[] = []) => {
    const me = stateRef.current.currentUserId;
    if (!live(me) || !stateRef.current.remoteLoaded) return;
    const on = (p: Integration['provider']) => rows.some((i) => i.provider === p && i.connected && i.readsWorkouts);
    // Nothing has tennis sessions on (always so on a database without
    // migration 58): no need to ask the server anything.
    if (!on('apple-health') && !on('whoop') && !TRACKERS.some(on)) return;
    const flags = await tennisFlags(me);
    // Every workout only on the person's own yes to it (readsAllWorkouts), never on the tennis one alone.
    const all = (p: Integration['provider']) => rows.some((i) => i.provider === p && i.connected && i.readsWorkouts && i.readsAllWorkouts);
    const whoopAll = flags.workoutsWhoop && all('whoop');
    const src = { apple: flags.apple && on('apple-health'), appleWorkouts: flags.workoutsApple && all('apple-health'),
      // WHOOP: tennis by its switch, every workout by its own (migration 135); the server keeps only what is on.
      whoop: flags.whoop && on('whoop'), whoopWorkouts: whoopAll,
      // None of WHOOP's sessions here at all: its look goes back a week (see check.ts).
      whoopEmpty: !stateRef.current.detectedActivities.some((a) => a.userId === me && a.source === 'whoop'),
      trackers: TRACKERS.filter((p) => flags[p] && on(p)),
      // The one-time look back over the past week (tennis too) only once 'flag:workouts-apple' is on for this
      // person: that switch exists only once migration 107 keeps a week-old session as news, and it is tried
      // on the owner's iPhone before everyone has it.
      weekBack: flags.workoutsApple };
    if (!src.apple && !src.appleWorkouts && !src.whoop && !src.whoopWorkouts && !src.trackers.length) return;
    const looked = await checkForTennis(me!, src, force);
    const filed = [...new Set([...already, ...looked.filed])];
    const { news } = looked;
    if (stateRef.current.currentUserId !== me) return;
    // A look while the app stays open that found nothing new: nothing to read again (the bell has its own small ask).
    if (tick && !force && !news && !filed.length) return;
    const list = await remote.fetchActivities(me!);
    if (stateRef.current.currentUserId !== me) return;
    if (list) setState((prev) => ({ ...prev, detectedActivities: list }));
    // The "Tennis detected" and "Workout detected" rows the server filed, into
    // Notifications: after every check, as some are filed quietly (WHOOP's own
    // alert, or while WHOOP was being connected) and never come back from the check itself.
    const notes = await remote.fetchActivityNotes(me!);
    if (stateRef.current.currentUserId !== me) return;
    if (notes.length) setState((prev) => ({ ...prev, notifications: [...notes.filter((n) => !prev.notifications.some((x) => x.id === n.id)), ...prev.notifications] }));
    if (!filed.length) return;
    activityToast(new Set(filed).size, (list ?? stateRef.current.detectedActivities).filter((x) => filed.includes(x.id)).sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1)));
  }, []);
  const checkForActivities = useCallback((force = false, tick = false) => checkWith(force, stateRef.current.integrations, tick), [checkWith]);
  // The demo's own "Tennis detected" or "Workout detected" (see demoActivityToast), once the app is up.
  const demoToastShown = useRef(false);
  useEffect(() => {
    if (!demoActivityToast || demoToastShown.current || !state.ready || !state.currentUserId) return undefined;
    const a = state.detectedActivities.find((x) => x.userId === state.currentUserId && x.status === 'new' && (demoActivityToast === 'tennis') === isTennisActivity(x));
    if (!a) return undefined;
    const t = setTimeout(() => {
      demoToastShown.current = true;
      activityToast(1, [a], 12000);
    }, 2500);
    return () => clearTimeout(t);
  }, [state.ready, state.currentUserId, state.detectedActivities]);

  const refreshActivities = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    const list = await remote.fetchActivities(me!);
    if (list && stateRef.current.currentUserId === me) setState((prev) => ({ ...prev, detectedActivities: list }));
  }, []);

  // Read on its own and handed back, never added to your sessions list: an
  // older one there would show up again as waiting to be logged (Oct 4).
  const fetchActivity = useCallback(async (id: ID): Promise<DetectedActivity | null> => {
    const me = stateRef.current.currentUserId;
    const held = stateRef.current.detectedActivities.find((a) => a.id === id && a.userId === me);
    if (held || !live(me, id)) return held ?? null;
    return remote.fetchActivity(me!, id).catch(() => null);
  }, []);

  const dismissActivity = useCallback((id: ID) => {
    const me = stateRef.current.currentUserId;
    haptics.tap();
    // Only one still waiting can be hidden; its "Tennis detected" row goes with it.
    setState((prev) => ({
      ...prev,
      detectedActivities: prev.detectedActivities.map((a) => (a.id === id && (a.status === 'new' || a.status === 'duplicate') ? { ...a, status: 'dismissed' } : a)),
      notifications: prev.notifications.filter((n) => !(n.kind === 'activity' && n.targetId === id)),
    }));
    if (live(me)) void remote.dismissActivity(id);
  }, []);

  const pastWorkouts = useCallback(async (): Promise<PastWorkout[] | null> => {
    const me = stateRef.current.currentUserId;
    if (!me) return [];
    const switches = await tennisFlags(me);
    const apple = stateRef.current.integrations.find((i) => i.provider === 'apple-health');
    // Health's other workouts only on the person's own yes to every workout (migration 107).
    const whoop = stateRef.current.integrations.find((i) => i.provider === 'whoop' && i.connected && i.readsWorkouts);
    // WHOOP's the same way (migration 135).
    const flags = { ...switches, workoutsApple: switches.workoutsApple && !!apple?.readsAllWorkouts, workoutsWhoop: switches.workoutsWhoop && !!whoop?.readsAllWorkouts };
    // The demo: the sessions it holds, nothing from Health.
    if (!live(me)) return mergePast(stateRef.current.detectedActivities, [], flags, me);
    const whoopTennis = flags.whoop && !!whoop;
    const appleOn = !!apple?.connected && !!apple.readsWorkouts;
    const [rows, health] = await Promise.all([
      remote.fetchActivitiesSince(me, 31).catch(() => null),
      appleOn && appleHealthAvailable() ? readPastHealth(flags, whoopTennis, flags.workoutsWhoop).catch(() => []) : Promise.resolve([]),
    ]);
    if (!rows || stateRef.current.currentUserId !== me) return null;
    return mergePast(rows, health, flags, me);
  }, []);

  const logPastWorkout = useCallback(async (w: PastWorkout): Promise<ID> => {
    const me = stateRef.current.currentUserId;
    if (w.row) return w.row.id;
    if (!live(me) || !w.health) throw new Error('That workout can’t be logged from here.');
    // Handed to the server as the check would have, its heart rate read now.
    const full = (await readOneWithHeartRate(w.health).catch(() => null)) ?? w.health;
    const r = await remote.reportActivity(full.id, {
      sport: full.sport, started_at: full.startedAt, ended_at: full.endedAt, tz_offset_min: full.tzOffsetMin,
      avg_hr: full.avgHr ?? null, max_hr: full.maxHr ?? null, kcal: full.kcal ?? null, device: full.device ?? null,
      ...(full.distanceM ? { distance_m: full.distanceM } : {}),
    });
    if (r === 'error') throw new Error('That didn’t go through. Try again.');
    if (!r) throw new Error('That workout can’t be logged. It may be too old, or too short.');
    void refreshActivities();
    return r.id;
  }, [refreshActivities]);

  const reportWorkoutFromAlert = useCallback(async (w: { id: string; startedAt: string; endedAt: string }): Promise<ID | null> => {
    const me = stateRef.current.currentUserId;
    if (!live(me) || !appleHealthAvailable()) return null;
    const r = await reportFromAlert(me!, w);
    if (r === 'error' || stateRef.current.currentUserId !== me) return null;
    // The workout among your sessions, and its "Workout detected" row in Notifications, as after a check.
    const [list, notes] = await Promise.all([remote.fetchActivities(me!).catch(() => null), remote.fetchActivityNotes(me!).catch(() => [])]);
    if (stateRef.current.currentUserId !== me) return null;
    if (list) setState((prev) => ({ ...prev, detectedActivities: list }));
    if (notes.length) setState((prev) => ({ ...prev, notifications: [...notes.filter((n) => !prev.notifications.some((x) => x.id === n.id)), ...prev.notifications] }));
    return r;
  }, []);

  /**
   * The demo's WHOOP handing over its past week (connected again, or every
   * workout turned on), as the server does: each session not held yet joins
   * your sessions with its own row in Notifications, and a note says so. One
   * already held (logged, hidden, or picked up before) never comes back.
   */
  const demoWhoopWeek = useCallback(async (all: boolean, source: 'whoop' | 'apple-health' = 'whoop') => {
    const me = stateRef.current.currentUserId;
    if (!me) return;
    // Apple Health connected in the demo looks back over its week the same way (check.ts on a phone).
    const week = await (source === 'apple-health' ? demoApi.fetchAppleWeek(all) : demoApi.fetchWhoopWeek(all));
    if (stateRef.current.currentUserId !== me) return;
    const held = new Set(stateRef.current.detectedActivities.map((a) => a.id));
    const fresh = week.filter((a) => !held.has(a.id)).map((a) => ({ ...a, userId: me }));
    if (!fresh.length) return;
    setState((prev) => {
      const add = fresh.filter((a) => !prev.detectedActivities.some((x) => x.id === a.id));
      const next = { ...prev, detectedActivities: [...add, ...prev.detectedActivities] };
      // Oldest first, so the newest lands on top of Notifications.
      return [...add].sort((x, y) => x.startedAt.localeCompare(y.startedAt))
        .reduce((acc, a) => withNotification(acc, { userId: me, actorId: me, kind: 'activity', targetId: a.id, targetKind: 'activity', preview: detectedNote(a) }, { toSelf: true }), next);
    });
    activityToast(fresh.length, [...fresh].sort((x, y) => (x.startedAt < y.startedAt ? 1 : -1)));
  }, []);

  const reportWorkoutsFromAlert = useCallback(async (ws: { id: string; startedAt: string; endedAt: string }[]): Promise<ID[]> => {
    const me = stateRef.current.currentUserId;
    if (!live(me) || !appleHealthAvailable()) return [];
    // Newest first, a few at a time (a catch-up can be dozens: one after another kept the list waiting).
    const sorted = [...ws].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const got: (ID | null)[] = sorted.map(() => null);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, sorted.length) }, async () => {
      while (next < sorted.length && stateRef.current.currentUserId === me) {
        const i = next;
        next += 1;
        const r = await reportFromAlert(me!, sorted[i]);
        if (r && r !== 'error') got[i] = r;
      }
    }));
    if (stateRef.current.currentUserId !== me) return [];
    const ids = [...new Set(got.filter((id): id is ID => !!id))];
    // Your sessions and Notifications read once for them all, as after a check.
    const [list, notes] = await Promise.all([remote.fetchActivities(me!).catch(() => null), remote.fetchActivityNotes(me!).catch(() => [])]);
    if (stateRef.current.currentUserId !== me) return [];
    if (list) setState((prev) => ({ ...prev, detectedActivities: list }));
    if (notes.length) setState((prev) => ({ ...prev, notifications: [...notes.filter((n) => !prev.notifications.some((x) => x.id === n.id)), ...prev.notifications] }));
    return ids;
  }, []);

  const turnOnTennis = useCallback(async (provider: 'apple-health' | 'whoop' | TrackerId, opts: { workouts?: boolean } = {}) => {
    const me = stateRef.current.currentUserId;
    // Every workout too: Apple Health and WHOOP (migrations 107 and 135), and only on the person's own yes to it.
    const all = (provider === 'apple-health' || provider === 'whoop') && opts.workouts === true;
    if (!live(me)) {
      // The demo: switched on at once.
      setState((prev) => ({ ...prev, integrations: prev.integrations.map((i) => (i.provider === provider ? { ...i, connected: true, readsWorkouts: true, ...(all ? { readsAllWorkouts: true } : {}), lastSyncedAt: i.lastSyncedAt ?? new Date().toISOString() } : i)) }));
      haptics.commit();
      // WHOOP's past week, as the server picks it up; Apple Health's, as the phone's first look reads it.
      if (provider === 'whoop') void demoWhoopWeek(all);
      else if (provider === 'apple-health') void demoWhoopWeek(all, 'apple-health');
      return;
    }
    // The past week the server filed while WHOOP was being connected.
    let filed: ID[] = [];
    if (provider === 'apple-health') {
      // The phone's own Health sheet, now asking for workouts and heart rate too.
      await connectAppleHealth({ workouts: true });
      if (!stateRef.current.integrations.find((i) => i.provider === 'apple-health')?.connected) await pullFrom(me!, 'apple-health');
      await remote.setHealthConnection(me!, 'apple-health', true, { readsWorkouts: true, ...(all ? { readsAllWorkouts: true } : {}) });
    } else if (provider === 'whoop') {
      const whoop = stateRef.current.integrations.find((i) => i.provider === 'whoop');
      // WHOOP already reads workouts for tennis (the same WHOOP permission): every workout is only the yes, saved;
      // the check below then looks back over the past week for them (check.ts).
      if (all && whoop?.connected && whoop.readsWorkouts) await remote.setHealthConnection(me!, 'whoop', true, { readsAllWorkouts: true });
      else filed = await connectWhoop(true, all);
    } else {
      await connectTracker(provider);
    }
    haptics.commit();
    const got = await reloadHealth();
    void checkWith(true, got ? got.connections.map((c) => ({ ...c, connected: true })) : stateRef.current.integrations, false, filed);
  }, [connectWhoop, connectTracker, pullFrom, reloadHealth, checkWith, demoWhoopWeek]);

  const turnOffTennis = useCallback(async (provider: 'apple-health' | 'whoop' | TrackerId) => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) {
      setState((prev) => ({ ...prev, integrations: prev.integrations.map((i) => (i.provider === provider ? { ...i, readsWorkouts: false, readsAllWorkouts: false } : i)) }));
      haptics.untap();
      return;
    }
    // Off is off for both: tennis, and every other workout when that was on too.
    const all = !!stateRef.current.integrations.find((i) => i.provider === provider)?.readsAllWorkouts;
    await remote.setHealthConnection(me!, provider, true, { readsWorkouts: false, ...(all ? { readsAllWorkouts: false } : {}) });
    haptics.untap();
    await reloadHealth();
  }, [reloadHealth]);

  const toggleIntegration = useCallback(async (provider: Integration['provider'], opts: { tennis?: boolean; workouts?: boolean } = {}) => {
    const me = stateRef.current.currentUserId;
    const current = withCatalog(stateRef.current.integrations).find((i) => i.provider === provider);
    if (!current) return;
    if (!live(me)) {
      const updated = current.connected ? await disconnectProvider(current) : await connectProvider(current);
      // WHOOP connected with tennis sessions (and every workout, when the screen said so) brings in its past week, as on the server.
      const whoopOn = provider === 'whoop' && updated.connected && opts.tennis === true;
      // A tracker connects for its tennis sessions, so in the demo they are on at once.
      const shown = isTracker(provider) ? { ...updated, readsWorkouts: updated.connected }
        : whoopOn ? { ...updated, readsWorkouts: true, readsAllWorkouts: opts.workouts === true } : updated;
      setState((prev) => ({ ...prev, integrations: prev.integrations.map((i) => (i.provider === provider ? shown : i)) }));
      if (whoopOn) void demoWhoopWeek(opts.workouts === true);
      return;
    }
    if (current.connected) {
      if (provider === 'whoop') await remote.whoop('disconnect');
      else if (isTracker(provider)) await remote.trackers('disconnect', { provider });
      else await remote.setHealthConnection(me!, provider, false);
      haptics.untap();
      await reloadHealth();
      return;
    }
    // With its switch on, connecting Apple Health or WHOOP turns tennis sessions on too, but only when
    // the screen said so first (it may not have, if it had not heard about the switch yet).
    let tennis = false;
    // The past week WHOOP's sign-in just filed into Notifications.
    let filed: ID[] = [];
    if (provider === 'apple-health') {
      const f = await tennisFlags(me);
      // Tennis, or (migration 107) every workout: the same Workout permission either way.
      tennis = opts.tennis === true && (f.apple || f.workoutsApple);
      // Every workout only when that is what the screen explained ("Workouts from Apple Health").
      const all = tennis && opts.workouts === true && f.workoutsApple;
      await connectAppleHealth(tennis ? { workouts: true } : {});
      await pullFrom(me!, provider);
      if (tennis) await remote.setHealthConnection(me!, provider, true, { readsWorkouts: true, ...(all ? { readsAllWorkouts: true } : {}) });
    } else if (provider === 'whoop') {
      const f = await tennisFlags(me);
      // Tennis, or (migration 135) every workout: the same WHOOP permission either way, and every
      // workout only when the screen said "workouts" (WHOOP's own sign-in then lists what it shares).
      tennis = opts.tennis === true && (f.whoop || f.workoutsWhoop);
      filed = await connectWhoop(tennis, tennis && opts.workouts === true && f.workoutsWhoop);
    } else if (isTracker(provider)) {
      // Fitbit, Oura and Polar connect only for tennis sessions.
      await connectTracker(provider);
      tennis = true;
    } else if (provider === 'cronometer' || provider === 'myfitnesspal') {
      if (appleHealthAvailable()) await connectAppleHealth();
      if (!(await pullFrom(me!, provider))) return;
    }
    haptics.commit();
    const got = await reloadHealth();
    if (tennis) void checkWith(true, got ? got.connections.map((c) => ({ ...c, connected: true })) : stateRef.current.integrations, false, filed);
  }, [pullFrom, reloadHealth, connectWhoop, connectTracker, checkWith, demoWhoopWeek]);

  const syncHealth = useCallback(async (provider: Integration['provider']) => {
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    if (await pullFrom(me!, provider)) { haptics.tap(); await reloadHealth(); }
  }, [pullFrom, reloadHealth]);

  // The courts' own state (migration 60): its actions are written in store/courtLife.
  const courtLife = useCourtLife(stateRef, setState, live);
  // Groups with a feed of their own (migration 67): its actions are written in store/feedGroups.
  const feedGroups = useFeedGroups(stateRef, setState, live);

  const actions = useMemo<AppActions>(
    () => ({
      ...courtLife,
      ...feedGroups,
      addCoachResult,
      addCoachReview,
      bookCoach,
      refreshCoaching,
      confirmBooking,
      answerBooking,
      startBooking,
      refundBooking,
      saveCoachListing,
      saveCoachService,
      removeCoachService,
      setupPayouts,
      checkPayouts,
      openPayoutDashboard,
      loadAllApplications,
      approveCoachApplication,
      rejectCoachApplication,
      setLocationEnabled,
      setMapVisibility,
      loadNewOnCourtside,
      loadTournamentPlans,
      setDefaultPayment,
      addPaymentMethod,
      removePaymentMethod,
      toggleFollow,
      acceptFollowRequest,
      declineFollowRequest,
      setPrivateAccount,
      setOpenToHit,
      editOpenToHit,
      checkHandle,
      changeHandle,
      wordsRefused,
      loadHiddenWords,
      saveHiddenWords,
      unhideByWords,
      toggleMute,
      toggleBlock,
      isBlocked,
      toggleAlerts,
      reportUser,
      acceptAnswer,
      resolveCoachQuestion,
      setPref,
      submitTip,
      voteTip,
      deleteTip,
      retryLoad,
      requestPasswordReset,
      setReadReceiptsEnabled,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
      accountInfo,
      changePassword,
      acceptTerms,
      changeEmail,
      signOutEverywhere,
      switchAccount,
      forgetSavedAccount,
      linkGoogle,
      deleteAccount,
      exportData,
      completeOnboarding,
      updateProfile,
      logSession,
      deleteSession,
      loadLastSeen,
      postHit,
      openHitNow,
      joinHit,
      leaveHit,
      cancelHit,
      recentHits,
      loadMySessionPosts,
      loadRecentSessionPosts,
      setSessionPlayers,
      respondSessionTag,
      removeSessionTag,
      refreshSessionTags,
      sessionTagRefusal,
      setSessionOpponent,
      setSessionScore,
      setSessionTime,
      headToHead,
      courtKings,
      flyby,
      friendsOnStreak,
      updateIdentity,
      toggleLike,
      addPost,
      toggleArchivePost,
      togglePinPost,
      editPost,
      editQuestion,
      refresh,
      deletePost,
      deleteComment,
      deleteStory,
      addStory,
      toggleArchiveStory,
      markStoryViewed,
      addComment,
      toggleLikeStory,
      toggleLikeComment,
      addStoryComment,
      watchComments,
      addQuestion,
      voteQuestion,
      votePoll,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
      syncHealth,
      refreshActivities,
      fetchActivity,
      checkForActivities,
      dismissActivity,
      pastWorkouts,
      logPastWorkout,
      reportWorkoutFromAlert,
      reportWorkoutsFromAlert,
      turnOnTennis,
      turnOffTennis,
      claimPendingReferral,
      countReferrals,
      fetchMyInvitees,
      matchContacts,
      myPhone,
      startPhoneLink,
      confirmPhoneLink,
      unlinkPhone,
      myInviter,
      claimInviteCode,
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      deleteCoachQuestion,
      deleteAnswer,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      catchUpNotifications,
      markNotificationsRead,
      markNotificationRead,
      markActivityNotesRead,
      recordView,
      noteFeedSignal,
      loadOlderMessages,
      syncConversation,
      watchTyping,
      watchInboxTyping,
      loadThread,
      loadMorePosts,
      loadPostsOf,
      searchPosts,
      loadPost,
      loadSavedPosts,
      isChatBlocked,
      loadFollowsOf,
      loadReports,
      countOpenReports,
      loadWaitlist,
      loadCourtPosts,
      loadCourtPage,
      loadPostThumbs,
      betaInvites,
      loadFirstPosts,
      loadFirstDayStats,
      noteFirstMove,
      loadSiteFeedback,
      removeFromWaitlistPage,
      loadReportedItem,
      suspendFromChat,
      loadReportedChat,
      loadReportEvidence,
      decideReport,
      removeReportedMessage,
      takeDown,
      restoreContent,
      loadRemoved,
      loadReviewRequests,
      askForReview,
      loadOpenReviews,
      keepRemoved,
      openConversationWith,
      resolveChatId,
      isDraftChat,
      sendMessage,
      sendCourt,
      sendVoice,
      sendPhotos,
      createGroup,
      addGroupMembers,
      removeGroupMember,
      renameGroup,
      setGroupPhoto,
      setGroupAdmin,
      leaveGroup,
      removedChat,
      muteChat,
      setChatReadReceipts,
      pinChat,
      markChatUnread,
      hideChat,
      loadMessage,
      reportChat,
      confirmBirthDate,
      removeNewAccountOnBlockedPhone,
      canMessage,
      canAddToGroup,
      recheckFollows,
      reachNow,
      lockedNow,
      tagHint,
      messageLock,
      editMessage,
      retryMessage,
      unsendMessage,
      deleteMessageForMe,
      shareToChats,
      markConversationRead,
      demoIncoming,
    }),
    [
      courtLife,
      feedGroups,
      addCoachResult,
      addCoachReview,
      bookCoach,
      refreshCoaching,
      confirmBooking,
      answerBooking,
      startBooking,
      refundBooking,
      saveCoachListing,
      saveCoachService,
      removeCoachService,
      setupPayouts,
      checkPayouts,
      openPayoutDashboard,
      loadAllApplications,
      approveCoachApplication,
      rejectCoachApplication,
      setLocationEnabled,
      setMapVisibility,
      loadNewOnCourtside,
      loadTournamentPlans,
      setDefaultPayment,
      addPaymentMethod,
      removePaymentMethod,
      toggleFollow,
      acceptFollowRequest,
      declineFollowRequest,
      setPrivateAccount,
      setOpenToHit,
      editOpenToHit,
      checkHandle,
      changeHandle,
      wordsRefused,
      loadHiddenWords,
      saveHiddenWords,
      unhideByWords,
      toggleMute,
      toggleBlock,
      isBlocked,
      toggleAlerts,
      reportUser,
      submitTip,
      deleteTip,
      setReadReceiptsEnabled,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
      signOut,
      accountInfo,
      changePassword,
      acceptTerms,
      changeEmail,
      signOutEverywhere,
      switchAccount,
      forgetSavedAccount,
      linkGoogle,
      deleteAccount,
      exportData,
      completeOnboarding,
      updateProfile,
      logSession,
      deleteSession,
      loadLastSeen,
      postHit,
      openHitNow,
      joinHit,
      leaveHit,
      cancelHit,
      recentHits,
      loadMySessionPosts,
      loadRecentSessionPosts,
      setSessionPlayers,
      respondSessionTag,
      removeSessionTag,
      refreshSessionTags,
      sessionTagRefusal,
      setSessionOpponent,
      setSessionScore,
      setSessionTime,
      headToHead,
      courtKings,
      flyby,
      friendsOnStreak,
      updateIdentity,
      toggleLike,
      addPost,
      toggleArchivePost,
      togglePinPost,
      editPost,
      editQuestion,
      refresh,
      deletePost,
      deleteComment,
      deleteStory,
      addStory,
      toggleArchiveStory,
      markStoryViewed,
      addComment,
      toggleLikeStory,
      toggleLikeComment,
      addStoryComment,
      watchComments,
      addQuestion,
      voteQuestion,
      votePoll,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
      syncHealth,
      refreshActivities,
      fetchActivity,
      checkForActivities,
      dismissActivity,
      pastWorkouts,
      logPastWorkout,
      reportWorkoutFromAlert,
      reportWorkoutsFromAlert,
      turnOnTennis,
      turnOffTennis,
      claimPendingReferral,
      countReferrals,
      fetchMyInvitees,
      matchContacts,
      myPhone,
      startPhoneLink,
      confirmPhoneLink,
      unlinkPhone,
      myInviter,
      claimInviteCode,
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      deleteCoachQuestion,
      deleteAnswer,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      catchUpNotifications,
      markNotificationsRead,
      markNotificationRead,
      markActivityNotesRead,
      recordView,
      noteFeedSignal,
      loadOlderMessages,
      syncConversation,
      watchTyping,
      watchInboxTyping,
      loadThread,
      loadMorePosts,
      loadPostsOf,
      searchPosts,
      loadPost,
      loadSavedPosts,
      isChatBlocked,
      loadFollowsOf,
      loadReports,
      countOpenReports,
      loadWaitlist,
      loadCourtPosts,
      loadCourtPage,
      loadPostThumbs,
      betaInvites,
      loadFirstPosts,
      loadFirstDayStats,
      noteFirstMove,
      loadSiteFeedback,
      removeFromWaitlistPage,
      loadReportedItem,
      suspendFromChat,
      loadReportedChat,
      loadReportEvidence,
      decideReport,
      removeReportedMessage,
      takeDown,
      restoreContent,
      loadRemoved,
      loadReviewRequests,
      askForReview,
      loadOpenReviews,
      keepRemoved,
      openConversationWith,
      resolveChatId,
      isDraftChat,
      sendMessage,
      sendCourt,
      sendVoice,
      sendPhotos,
      createGroup,
      addGroupMembers,
      removeGroupMember,
      renameGroup,
      setGroupPhoto,
      setGroupAdmin,
      leaveGroup,
      removedChat,
      muteChat,
      setChatReadReceipts,
      pinChat,
      markChatUnread,
      hideChat,
      loadMessage,
      reportChat,
      confirmBirthDate,
      removeNewAccountOnBlockedPhone,
      canMessage,
      canAddToGroup,
      recheckFollows,
      reachNow,
      lockedNow,
      tagHint,
      messageLock,
      editMessage,
      retryMessage,
      unsendMessage,
      deleteMessageForMe,
      shareToChats,
      markConversationRead,
      demoIncoming,
    ],
  );

  // What you reported is left out of everything the screens read: posts, hits,
  // threads, replies, comments and coach questions and replies. Ask a coach and
  // the tips board also leave out anyone you blocked, at once (Oct 5; the
  // database does the same from the next load, migration 115), the way posts,
  // threads and comments already do. So is anything taken down (migration 108)
  // that is neither yours nor seen by an admin: the database already keeps
  // those away, so this only catches a copy held from before (an account that
  // stopped being an admin, say).
  const amAdminNow = !!currentUser?.isAdmin;
  const unreported = useMemo(() => {
    const me = state.currentUserId;
    const out = new Set(state.reportedIds);
    const blocked = new Set(state.blockedIds);
    const shut = (x: { authorId: ID; removed?: Removed }) => !!x.removed && x.authorId !== me && !amAdminNow;
    const strays = state.posts.some(shut) || state.stories.some(shut);
    if (!out.size && !blocked.size && !strays) return null;
    const patch: Partial<Pick<AppState, 'posts' | 'stories' | 'hitRequests' | 'questions' | 'answers' | 'comments' | 'coachQuestions' | 'coachReplies' | 'tips'>> = {
      coachQuestions: state.coachQuestions.filter((q) => !out.has(q.id) && !blocked.has(q.authorId)),
      coachReplies: state.coachReplies.filter((r) => !out.has(r.id) && !blocked.has(r.coachUserId)),
      tips: state.tips.filter((t) => !out.has(t.id) && !blocked.has(t.authorId)),
    };
    if (out.size || strays) {
      patch.posts = state.posts.filter((p) => !out.has(p.id) && !shut(p));
      patch.stories = state.stories.filter((s) => !out.has(s.id) && !shut(s));
      patch.hitRequests = out.size ? state.hitRequests.filter((h) => !out.has(h.id)) : state.hitRequests;
      patch.comments = state.comments.filter((c) => !out.has(c.id));
    }
    // Threads and replies leave out anyone you blocked as well, at once (Oct 5): their
    // replies no longer stay on a thread you had open, nor their threads in Search's
    // recents, until it was loaded again (the database already does the same, 108).
    // A thread's reply count drops the replies hidden here too, so the two agree.
    const gone = new Set(state.answers.filter((a) => out.has(a.id) || blocked.has(a.authorId)).map((a) => a.id));
    patch.answers = gone.size ? state.answers.filter((a) => !gone.has(a.id)) : state.answers;
    const questions = state.questions.flatMap((q) => {
      if (out.has(q.id) || blocked.has(q.authorId)) return [];
      return gone.size && q.answerIds.some((id) => gone.has(id)) ? [{ ...q, answerIds: q.answerIds.filter((id) => !gone.has(id)) }] : [q];
    });
    patch.questions = questions.length === state.questions.length && questions.every((q, i) => q === state.questions[i]) ? state.questions : questions;
    return patch;
  }, [state.reportedIds, state.blockedIds, state.posts, state.stories, state.hitRequests, state.questions, state.answers, state.comments, state.coachQuestions, state.coachReplies, state.tips, state.currentUserId, amAdminNow]);
  const value = useMemo<AppContextValue>(
    () => ({ ...state, ...unreported, ready: state.ready && state.authResolved, currentUser, actions, seeing, shownAtCourt, ageSaysAdult }),
    [state, unreported, currentUser, actions, seeing, shownAtCourt, ageSaysAdult],
  );

  return <AppContext.Provider value={value}><UsersContext.Provider value={value.users}>{children}</UsersContext.Provider></AppContext.Provider>;
}

function applyVote<T extends { votes: number; votedBy: Record<ID, 1 | -1> }>(
  item: T,
  userId: ID,
  direction: 1 | -1,
): T {
  const existing = item.votedBy[userId];
  const votedBy: Record<ID, 1 | -1> = { ...item.votedBy };
  let delta = 0;

  if (existing === direction) {
    delete votedBy[userId];
    delta = -direction;
  } else if (existing) {
    votedBy[userId] = direction;
    delta = 2 * direction;
  } else {
    votedBy[userId] = direction;
    delta = direction;
  }

  return { ...item, votes: item.votes + delta, votedBy };
}

/**
 * For a screen nobody is looking at (a tab slid off to the side, or under a
 * page opened on top): while `hidden`, an app-wide change reaches the screens
 * inside as background work, drawn after whatever is on screen has drawn,
 * instead of all four tabs redrawing before a sent message can show. The
 * moment it is on screen again it reads the live state, so what you see is
 * never behind. See asTabRoute.
 */
export function AppStateLater({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const live = useContext(AppContext);
  const later = useDeferredValue(live);
  const shown = hidden ? later : live;
  return <AppContext.Provider value={shown}><UsersContext.Provider value={shown?.users ?? NO_USERS}>{children}</UsersContext.Provider></AppContext.Provider>;
}

/** Everyone the app knows about (the app state's `users`), for a part that needs nothing else. */
export function useUsers(): User[] {
  return useContext(UsersContext);
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useCurrentUser(): User {
  const { currentUser } = useApp();
  if (!currentUser) throw new Error('No signed-in user');
  return currentUser;
}

export function useUserLookup(): (id: ID) => User | undefined {
  const { users } = useApp();
  return useCallback((id: ID) => users.find((u) => u.id === id), [users]);
}

export function useCoachForUser(): (userId: ID) => Coach | undefined {
  const { coaches } = useApp();
  return useCallback((userId: ID) => coaches.find((c) => c.userId === userId), [coaches]);
}
