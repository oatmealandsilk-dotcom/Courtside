import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState as DeviceState, Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';

import { fetchBootstrap, fetchCommunityThreads, signIn as apiSignIn, type Bootstrap } from '@/data/api';
import { auth as remoteAuth, fetchRemote, isLocalMedia, remote, uploadMedia, emptyProfile } from '@/data/remote';
import { forgetAccount, listSavedAccounts, rememberAccount, type SavedAccount } from '@/features/accounts/savedAccounts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { markMessagesOpened } from '@/features/messaging/readReceipts';
import { readReceiptPreference, saveReceiptPreference } from '@/features/messaging/preferences';
import { connectProvider, disconnectProvider } from '@/lib/integrations';
import { nearestPlace } from '@/data/locations';
import { getPosition } from '@/lib/geo';
import * as haptics from '@/lib/haptics';
import * as toast from '@/lib/toast';
import { finishUpload, setUploadProgress, simulateUpload, startUpload } from '@/lib/uploads';
import { framesAt } from '@/features/compose/frames';
import type {
  Answer,
  Coach,
  CoachApplication,
  CoachingRequest,
  CoachQuestion,
  CoachReply,
  CoachResult,
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
  Story,
  User,
  PlayerProfile,
  MediaCrop,
} from '@/data/types';

interface NewStoryInput {
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  mediaLabel?: string;
  caption?: string;
}

interface NewPostInput {
  kind: PostKind;
  /** People tagged in it; each gets a notification. */
  taggedUserIds?: ID[];
  orientation?: 'portrait' | 'landscape';
  trimStart?: number;
  trimEnd?: number;
  crop?: MediaCrop;
  muted?: boolean;
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

export type CoachApplicationInput = Omit<CoachApplication, 'id' | 'userId' | 'status' | 'createdAt'>;

interface NewQuestionInput {
  title: string;
  body: string;
  topic: QuestionTopic;
  tags: string[];
}

/**
 * Files a notification, unless you caused it yourself — nobody wants to be told
 * they liked their own post. Pure, so it composes inside a setState updater.
 */
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
): AppState {
  if (!entry.userId || entry.userId === entry.actorId) return state;
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

/** What a double tap leaves, remembered between visits on web. */
function readDefaultReaction(): string {
  try {
    if (Platform.OS !== 'web') return '❤️';
    return localStorage.getItem('courtside-default-reaction') || '❤️';
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

function readDefaultPayment(): ID {
  try {
    if (Platform.OS !== 'web') return 'pm-visa';
    return localStorage.getItem('courtside-default-payment') || 'pm-visa';
  } catch {
    return 'pm-visa';
  }
}

interface AppState extends Bootstrap {
  ready: boolean;
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
  /** Logins remembered on this device, newest first. */
  savedAccounts: SavedAccount[];
  /** Every follow the app knows about, for followers and following lists. */
  followEdges: { followerId: ID; followingId: ID }[];
  /** Pending asks to follow a private account — yours, and the ones waiting on you. */
  followRequests: { fromId: ID; toId: ID; createdAt: string }[];
  /** People whose posts you have muted — still followed, just quiet. */
  mutedIds: ID[];
  /** People you have blocked. Their posts and messages are hidden. */
  blockedIds: ID[];
  /** People whose new posts you have asked to be told about. */
  alertIds: ID[];
  /** Ways to pay a coach, and which one is used unless you say otherwise. */
  paymentMethods: PaymentMethod[];
  defaultPaymentId: ID | null;
  /** Whether the app may ask the device where you are, and the city it found. */
  locationEnabled: boolean;
  detectedLocation: string | null;
  /** The actual fix, for the map; the city name above is for text. */
  detectedCoords: { lat: number; lng: number } | null;
}

interface AppActions {
  /* Location */
  setLocationEnabled: (enabled: boolean) => Promise<string | null>;

  /* Payments */
  setDefaultPayment: (id: ID) => void;
  addPaymentMethod: (kind: PaymentKind) => void;
  removePaymentMethod: (id: ID) => void;

  /* People */
  toggleFollow: (userId: ID) => void;
  /** A private account's owner saying yes or no to someone's ask. */
  acceptFollowRequest: (requesterId: ID) => void;
  declineFollowRequest: (requesterId: ID) => void;
  setPrivateAccount: (enabled: boolean) => void;
  toggleMute: (userId: ID) => void;
  toggleBlock: (userId: ID) => void;
  toggleAlerts: (userId: ID) => void;
  reportUser: (userId: ID, reason: string) => void;
  /** A suggestion from an early user, kept for the team to read. */
  submitTip: (body: string) => Promise<void>;

  setReadReceiptsEnabled: (enabled: boolean) => void;
  /** With Supabase: email and password. Without it: the demo handle. */
  signIn: (identity: string, password?: string) => Promise<void>;
  /** Creates the account. Resolves 'confirm' when the project wants the email verified first. */
  signUp: (email: string, password: string, name: string, handle: string) => Promise<'session' | 'confirm'>;
  /** Resolves once the account is loaded, or false if the person backed out. */
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => void;
  /* Account centre */
  accountInfo: () => Promise<{ email: string; providers: string[]; createdAt: string; lastSignInAt: string | null; emailConfirmed: boolean } | null>;
  changePassword: (password: string) => Promise<void>;
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
  updateIdentity: (patch: Pick<User, 'name' | 'bio' | 'location'> & { avatarUrl?: string }) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;

  toggleLike: (postId: ID) => void;
  addPost: (input: NewPostInput) => ID;
  /** Puts one of your posts away, or brings it back. */
  toggleArchivePost: (postId: ID) => void;
  togglePinPost: (postId: ID) => void;
  /** Change your own post's words, tags, who is in it, and where it was. */
  editPost: (postId: ID, patch: { body: string; taggedUserIds: ID[]; location?: string }) => void;
  /** Change your own thread's question and details. */
  editQuestion: (questionId: ID, patch: { title: string; body: string }) => void;
  /** Pull-to-refresh: fetches everything again from the server. */
  refresh: () => Promise<void>;
  deletePost: (postId: ID) => void;
  addComment: (postId: ID, body: string) => void;
  toggleLikeStory: (storyId: ID) => void;
  toggleLikeComment: (commentId: ID) => void;
  addStoryComment: (storyId: ID, body: string) => void;

  /* Stories */
  addStory: (input: NewStoryInput) => ID;
  toggleArchiveStory: (storyId: ID) => void;
  markStoryViewed: (storyId: ID) => void;

  addQuestion: (input: NewQuestionInput) => ID;
  voteQuestion: (questionId: ID, direction: 1 | -1) => void;
  addAnswer: (questionId: ID, body: string, parentAnswerId?: ID) => void;
  voteAnswer: (answerId: ID, direction: 1 | -1) => void;

  submitCoachingRequest: (coachId: ID, serviceId: ID, question: string, videoLabel?: string) => ID;
  toggleIntegration: (provider: Integration['provider']) => Promise<void>;

  /* Ask a coach */
  askCoach: (input: NewCoachQuestionInput) => ID;
  replyToCoachQuestion: (questionId: ID, body: string) => void;
  toggleReplyHelpful: (replyId: ID) => void;

  /* Become a coach */
  submitCoachApplication: (input: CoachApplicationInput) => ID;

  /* A coach's page */
  addCoachResult: (input: Omit<CoachResult, 'id' | 'coachId'>) => void;
  addCoachReview: (coachId: ID, rating: number, body: string) => void;

  /* Saved */
  toggleSavePost: (postId: ID) => void;
  toggleSaveQuestion: (questionId: ID) => void;

  /* Reactions */
  reactToMessage: (messageId: ID, emoji?: string) => void;
  setDefaultReaction: (emoji: string) => void;

  /* Notifications */
  markNotificationsRead: () => void;
  markNotificationRead: (notificationId: ID) => void;

  /* Counting */
  recordView: (targetKind: 'post' | 'question', targetId: ID) => void;

  /* Messaging */
  openConversationWith: (userId: ID) => ID;
  sendMessage: (conversationId: ID, body: string) => void;
  shareToUsers: (userIds: ID[], kind: 'post' | 'question' | 'profile', sharedId: ID, note?: string) => void;
  markConversationRead: (conversationId: ID) => void;
}

interface AppContextValue extends AppState {
  currentUser: User | null;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

const emptyBootstrap: Bootstrap = {
  users: [],
  posts: [],
  stories: [],
  comments: [],
  questions: [],
  answers: [],
  coaches: [],
  coachingRequests: [],
  integrations: [],
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
};

let idCounter = 0;
/** Real rows need real UUIDs; the fixtures keep their readable ids. */
const nextId = (prefix: string): string => {
  if (isSupabaseConfigured) return randomUUID();
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Whether an id names a row in Supabase rather than a fixture. */
const live = (...ids: (ID | null | undefined)[]) => isSupabaseConfigured && ids.every((id) => !!id && UUID.test(id));

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ...emptyBootstrap,
    ready: false,
    authResolved: !isSupabaseConfigured,
    currentUserId: null,
    onboardingComplete: false,
    error: null,
    saved: { postIds: [], questionIds: [] },
    defaultReaction: readDefaultReaction(),
    followingIds: [],
    followEdges: [],
    followRequests: [],
    remoteLoaded: false,
    savedAccounts: [],
    mutedIds: [],
    blockedIds: [],
    alertIds: [],
    paymentMethods: STARTER_PAYMENTS,
    defaultPaymentId: readDefaultPayment(),
    locationEnabled: readFlag('courtside-location'),
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
        // Imported threads arrive on their own clock and slot in when ready.
        fetchCommunityThreads()
          .then((imported) => {
            if (cancelled || !imported.questions.length) return;
            setState((prev) => {
              const known = new Set(prev.questions.map((q) => q.id));
              const knownUsers = new Set(prev.users.map((u) => u.id));
              return {
                ...prev,
                users: [...prev.users, ...imported.users.filter((u) => !knownUsers.has(u.id))],
                questions: [...prev.questions, ...imported.questions.filter((q) => !known.has(q.id))],
              };
            });
          })
          .catch(() => { /* The board still works without them. */ });
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
  useEffect(() => {
    if (!isSupabaseConfigured || !remoteLoaded || !currentUserForLive || !UUID.test(currentUserForLive)) return;
    const me = currentUserForLive;
    let off: (() => void) | undefined;
    try {
      off = remote.onNewMessage((message) => {
        if (stateRef.current.messages.some((m) => m.id === message.id)) return;
        const known = stateRef.current.conversations.some((c) => c.id === message.conversationId);
        if (known) {
          setState((prev) => prev.messages.some((m) => m.id === message.id) ? prev : {
            ...prev,
            messages: [...prev.messages, message],
            conversations: prev.conversations.map((c) => c.id === message.conversationId
              ? { ...c, messageIds: [...c.messageIds, message.id], updatedAt: message.createdAt, unreadCount: message.senderId === me ? c.unreadCount : c.unreadCount + 1 }
              : c),
          });
          return;
        }
        void remote.fetchConversation(me, message.conversationId).then((got) => {
          if (!got) return;
          setState((prev) => prev.conversations.some((c) => c.id === got.conversation.id) ? prev : {
            ...prev,
            conversations: [got.conversation, ...prev.conversations],
            messages: [...prev.messages, ...got.messages.filter((m) => !prev.messages.some((p) => p.id === m.id))],
          });
        });
      });
    } catch { /* live updates are a nicety */ }
    return () => { off?.(); };
  }, [remoteLoaded, currentUserForLive]);

  const loadRemote = useCallback(async (me: ID, email?: string | null) => {
    try {
      const data = await fetchRemote(me);
      setState((prev) => {
        const remoteUsers = new Set(data.users.map((u) => u.id));
        const remotePosts = new Set(data.posts.map((p) => p.id));
        const remoteStories = new Set(data.stories.map((s) => s.id));
        const remoteComments = new Set(data.comments.map((c) => c.id));
        let users = [...data.users, ...prev.users.filter((u) => !remoteUsers.has(u.id))];
        // The profile row is created by a trigger; if it has not landed yet,
        // stand in for it so the screens have someone to show.
        if (!remoteUsers.has(me)) {
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
        return {
          ...prev,
          users,
          posts: [...data.posts, ...prev.posts.filter((p) => !remotePosts.has(p.id))],
          comments: [...data.comments, ...prev.comments.filter((c) => !remoteComments.has(c.id))],
          stories: [...data.stories, ...prev.stories.filter((st) => !remoteStories.has(st.id))],
          followingIds: data.followingIds,
          followEdges: data.followEdges,
          followRequests: data.followRequests,
          // Your real conversations replace the demo ones once the messages tables exist.
          conversations: data.conversations.length || data.messages.length ? data.conversations : prev.conversations.filter((c) => c.participantIds.includes(me)),
          messages: data.conversations.length || data.messages.length ? data.messages : prev.messages,
          remoteLoaded: true,
          saved: { ...prev.saved, postIds: data.savedPostIds },
          currentUserId: me,
          // Finished the quiz on any device, or (older accounts) set a goal in it.
          onboardingComplete: prev.onboardingComplete || !!self?.profile.onboardedAt || (self?.profile.goals.length ?? 0) > 0,
          authResolved: true,
          error: null,
        };
      });
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
            const frame = (await framesAt(post.videoUrl!, [post.trimStart ?? 0]))[0]?.uri;
            if (!frame) return;
            const hosted = await uploadMedia(me, frame, 'photo');
            await remote.updatePostThumbnail(post.id, hosted);
            setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === post.id ? { ...p, thumbnailUrl: hosted } : p)) }));
          } catch (error) { console.warn('[remote] cover repair failed', error); }
        })();
      }
      // Now the profile is known, the saved login gets its name and picture.
      const who = data.users.find((u) => u.id === me);
      if (who) rememberAccount({ id: me, handle: who.handle, name: who.name, avatarUrl: who.avatarUrl }).then((savedAccounts) => setState((prev) => ({ ...prev, savedAccounts })));
    } catch (err) {
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
        return { ...prev, users, currentUserId: me, authResolved: true, remoteLoaded: false, error: err instanceof Error ? err.message : 'Could not load your account.' };
      });
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        // Known to be signed in: let the app open now and merge the feed in
        // when it lands, instead of holding the splash for the whole fetch.
        const me = data.session.user.id;
        setState((prev) => ({ ...prev, currentUserId: prev.currentUserId ?? me, authResolved: true }));
        loadRemote(me, data.session.user.email);
      } else setState((prev) => ({ ...prev, authResolved: true }));
    }).catch(() => setState((prev) => ({ ...prev, authResolved: true })));
    listSavedAccounts().then((savedAccounts) => { if (!cancelled) setState((prev) => ({ ...prev, savedAccounts })); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Every fresh session (and every rotated token) is kept, so this login
      // can be picked again later without a password.
      if (session?.refresh_token) {
        rememberAccount({ id: session.user.id, email: session.user.email ?? undefined, refreshToken: session.refresh_token })
          .then((savedAccounts) => { if (!cancelled) setState((prev) => ({ ...prev, savedAccounts })); });
      }
      if (event === 'SIGNED_IN' && session) loadRemote(session.user.id, session.user.email);
      // A refreshed token after a failed first load: try again with the new one.
      if (event === 'TOKEN_REFRESHED' && session && !stateRef.current.remoteLoaded) loadRemote(session.user.id, session.user.email);
      if (event === 'SIGNED_OUT') setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false }));
    });
    // Tokens only refresh while the app is in front.
    const sub = DeviceState.addEventListener('change', (status) => {
      if (Platform.OS === 'web') return;
      if (status === 'active') supabase?.auth.startAutoRefresh();
      else supabase?.auth.stopAutoRefresh();
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
      sub.remove();
    };
  }, [loadRemote]);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );

  // Keep a ref so async actions read fresh state without re-creating callbacks.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const requireUser = useCallback((): ID => {
    if (!state.currentUserId) throw new Error('Not signed in');
    return state.currentUserId;
  }, [state.currentUserId]);

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

  const signUp = useCallback(async (email: string, password: string, name: string, handle: string) => {
    const session = await remoteAuth.signUp(email, password, name, handle);
    if (!session) return 'confirm' as const;
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

  const accountInfo = useCallback(async () => (isSupabaseConfigured ? remoteAuth.account() : null), []);
  const changePassword = useCallback((password: string) => remoteAuth.updatePassword(password), []);
  const changeEmail = useCallback((email: string) => remoteAuth.updateEmail(email), []);
  const linkGoogle = useCallback(() => remoteAuth.linkGoogle(), []);
  const signOutEverywhere = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (isSupabaseConfigured) await remoteAuth.signOutEverywhere();
    // Everywhere includes this device: the remembered login is gone too.
    const savedAccounts = me ? await forgetAccount(me) : stateRef.current.savedAccounts;
    setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false, savedAccounts }));
  }, []);

  const switchAccount = useCallback(async (id: ID) => {
    const saved = stateRef.current.savedAccounts.find((a) => a.id === id);
    if (!saved) throw new Error('That account is not saved on this device.');
    let session;
    try {
      session = await remoteAuth.resumeAccount(saved.refreshToken);
    } catch (err) {
      const savedAccounts = await forgetAccount(id);
      setState((prev) => ({ ...prev, savedAccounts }));
      throw err;
    }
    setState((prev) => ({ ...prev, currentUserId: session.user.id, remoteLoaded: false, onboardingComplete: false, error: null }));
    await loadRemote(session.user.id, session.user.email);
  }, [loadRemote]);

  const forgetSavedAccount = useCallback(async (id: ID) => {
    const savedAccounts = await forgetAccount(id);
    setState((prev) => ({ ...prev, savedAccounts }));
  }, []);
  const deleteAccount = useCallback(async () => {
    if (isSupabaseConfigured) await remoteAuth.deleteAccount();
    setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false }));
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
    };
  }, []);

  const signOut = useCallback(() => {
    if (isSupabaseConfigured) remoteAuth.signOut();
    setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false }));
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

  const updateIdentity = useCallback((patch: Pick<User, 'name' | 'bio' | 'location'> & { avatarUrl?: string }) => {
    patchCurrentUser(u => ({ ...u, ...patch }));
    const me = stateRef.current.currentUserId;
    if (!live(me)) return;
    (async () => {
      const avatarUrl = isLocalMedia(patch.avatarUrl) ? await uploadMedia(me!, patch.avatarUrl!, 'photo') : patch.avatarUrl;
      if (avatarUrl && avatarUrl !== patch.avatarUrl) patchCurrentUser(u => ({ ...u, avatarUrl }));
      await remote.updateProfile(me!, { ...patch, avatarUrl });
    })();
  }, [patchCurrentUser]);
  const setReadReceiptsEnabled = useCallback((enabled: boolean) => {
    const me = requireUser();
    saveReceiptPreference(me, enabled);
    patchCurrentUser(user => ({...user, readReceiptsEnabled: enabled}));
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

  const toggleLike = useCallback(
    (postId: ID) => {
      const me = requireUser();
      if (live(me, postId)) {
        const post = stateRef.current.posts.find((p) => p.id === postId);
        if (post) remote.setLike(postId, me, !post.likedBy.includes(me));
      }
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        const liking = !!post && !post.likedBy.includes(me);
        liking ? haptics.reward() : haptics.untap();
        const next: AppState = {
          ...prev,
          posts: prev.posts.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  likedBy: p.likedBy.includes(me)
                    ? p.likedBy.filter((id) => id !== me)
                    : [...p.likedBy, me],
                }
              : p,
          ),
        };
        // Only the like fires a notification; taking it back should not.
        return liking && post
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

  const addPost = useCallback(
    (input: NewPostInput): ID => {
      const me = requireUser();
      haptics.commit();
      const post: Post = {
        id: nextId('p'),
        authorId: me,
        createdAt: new Date().toISOString(),
        likedBy: [],
        commentIds: [],
        ...input,
      };
      const celebration = {
        userId: me, targetId: post.id, targetKind: 'post' as const, preview: snippet(post.body || (post.kind === 'clip' ? 'Clip' : 'Post')),
        title: post.kind === 'clip' ? 'Clip posted' : 'Posted',
        body: post.kind === 'clip' ? 'It is in the feed and on your profile.' : 'It is live in the feed.',
        href: '/', icon: post.kind === 'clip' ? 'play' : 'checkmark',
      };
      const uploading = live(me) && (isLocalMedia(post.imageUrl) || isLocalMedia(post.videoUrl) || isLocalMedia(post.thumbnailUrl));
      const label = post.body ? snippet(post.body, 60) : post.kind === 'clip' ? 'Your clip' : 'Your post';
      // Everyone tagged hears about it.
      const tell = (state: AppState) => (post.taggedUserIds ?? []).reduce(
        (acc, id) => withNotification(acc, { userId: id, actorId: me, kind: 'tag', targetId: post.id, targetKind: 'post', preview: snippet(post.body || 'a post') }),
        state,
      );
      if (uploading) {
        // The strip across the top counts the upload up; the celebration
        // waits until it has actually landed.
        startUpload(post.id, label, post.thumbnailUrl ?? post.imageUrl);
        setState((prev) => tell({ ...prev, posts: [post, ...prev.posts] }));
      } else {
        if (post.videoUrl || post.imageUrl) simulateUpload(post.id, label, post.thumbnailUrl ?? post.imageUrl);
        setState((prev) => tell(celebratePosted({ ...prev, posts: [post, ...prev.posts] }, { ...celebration, quiet: !!(post.videoUrl || post.imageUrl) })));
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
            const imageUrl = local[0] ? await uploadMedia(me, post.imageUrl!, 'photo', report(0)) : post.imageUrl;
            const videoUrl = local[1] ? await uploadMedia(me, post.videoUrl!, 'video', report(1)) : post.videoUrl;
            const thumbnailUrl = post.thumbnailUrl === post.imageUrl ? imageUrl
              : local[2] ? await uploadMedia(me, post.thumbnailUrl!, 'photo', report(2)) : post.thumbnailUrl;
            const hosted = { ...post, imageUrl, videoUrl, thumbnailUrl };
            setState((prev) => ({ ...prev, posts: prev.posts.map((p) => (p.id === post.id ? { ...p, imageUrl, videoUrl, thumbnailUrl } : p)) }));
            await remote.insertPost(hosted);
            if (uploading) {
              finishUpload(post.id);
              setState((prev) => celebratePosted(prev, { ...celebration, quiet: true }));
            }
          } catch (error) {
            console.warn('[remote] post did not land', error);
            const reason = error instanceof Error ? error.message : 'Something went wrong.';
            if (uploading) finishUpload(post.id, false, reason);
            else toast.show({ title: 'Could not post', body: reason, icon: 'alert' });
            // The post never reached the server; leaving it in the feed would
            // show something nobody else can see.
            setState((prev) => ({ ...prev, posts: prev.posts.filter((p) => p.id !== post.id) }));
            haptics.reject();
          }
        })();
      }
      return post.id;
    },
    [requireUser],
  );

  /** Gone for good: the post, its comments, likes and saves. Only the author can. */
  const deletePost = useCallback((postId: ID) => {
    const me = requireUser();
    const post = stateRef.current.posts.find((p) => p.id === postId);
    if (!post || post.authorId !== me) return;
    haptics.commit();
    if (live(me, postId)) remote.deletePost(postId);
    setState((prev) => ({
      ...prev,
      posts: prev.posts.filter((p) => p.id !== postId),
      comments: prev.comments.filter((c) => c.postId !== postId),
      saved: { ...prev.saved, postIds: prev.saved.postIds.filter((id) => id !== postId) },
    }));
  }, [requireUser]);

  const toggleArchivePost = useCallback((postId: ID) => {
    const me = requireUser();
    haptics.commit();
    if (live(me, postId)) {
      const post = stateRef.current.posts.find((p) => p.id === postId);
      if (post?.authorId === me) remote.setPostArchived(postId, !post.archived);
    }
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => (p.id === postId && p.authorId === me ? { ...p, archived: !p.archived } : p)),
    }));
  }, [requireUser]);

  const togglePinPost = useCallback((postId: ID) => {
    const me = requireUser();
    haptics.commit();
    if (live(me, postId)) {
      const post = stateRef.current.posts.find((p) => p.id === postId);
      if (post?.authorId === me) remote.setPostPinned(postId, !post.pinned);
    }
    setState((prev) => ({
      ...prev,
      posts: prev.posts.map((p) => (p.id === postId && p.authorId === me ? { ...p, pinned: !p.pinned } : p)),
    }));
  }, [requireUser]);

  const editPost = useCallback((postId: ID, patch: { body: string; taggedUserIds: ID[]; location?: string }) => {
    const me = requireUser();
    const post = stateRef.current.posts.find((p) => p.id === postId);
    if (!post || post.authorId !== me) return;
    haptics.commit();
    const editedAt = new Date().toISOString();
    const tags = Array.from(new Set((patch.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase())));
    const location = patch.location?.trim() || undefined;
    if (live(me, postId)) remote.updatePost(postId, { body: patch.body, tags, taggedUserIds: patch.taggedUserIds, location, editedAt });
    setState((prev) => {
      const before = prev.posts.find((p) => p.id === postId);
      const newlyTagged = patch.taggedUserIds.filter((id) => !(before?.taggedUserIds ?? []).includes(id));
      const next: AppState = {
        ...prev,
        posts: prev.posts.map((p) => (p.id === postId ? { ...p, body: patch.body, tags, taggedUserIds: patch.taggedUserIds.length ? patch.taggedUserIds : undefined, location, editedAt } : p)),
      };
      return newlyTagged.reduce((acc, id) => withNotification(acc, { userId: id, actorId: me, kind: 'tag', targetId: postId, targetKind: 'post', preview: snippet(patch.body || 'a post') }), next);
    });
  }, [requireUser]);

  const editQuestion = useCallback((questionId: ID, patch: { title: string; body: string }) => {
    const me = requireUser();
    haptics.commit();
    const tags = Array.from(new Set((patch.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.slice(1).toLowerCase())));
    setState((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => (q.id === questionId && q.authorId === me ? { ...q, title: patch.title, body: patch.body, tags, editedAt: new Date().toISOString() } : q)),
    }));
  }, [requireUser]);

  const refresh = useCallback(async () => {
    const me = stateRef.current.currentUserId;
    if (me && isSupabaseConfigured && stateRef.current.remoteLoaded) await loadRemote(me);
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }, [loadRemote]);

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
      setState((prev) => celebratePosted({ ...prev, stories: [story, ...prev.stories] }, {
        userId: me, targetId: story.id, targetKind: 'post', preview: `Hit${story.caption ? ` · ${snippet(story.caption, 60)}` : ''}`,
        title: 'Hit posted', body: 'Up for 24 hours, then kept in your archive.',
        href: '/', icon: 'camera',
      }));
      if (live(me)) {
        (async () => {
          const imageUrl = isLocalMedia(story.imageUrl) ? await uploadMedia(me, story.imageUrl!, 'photo') : story.imageUrl;
          const videoUrl = isLocalMedia(story.videoUrl) ? await uploadMedia(me, story.videoUrl!, 'video') : story.videoUrl;
          const thumbnailUrl = story.thumbnailUrl === story.imageUrl ? imageUrl
            : isLocalMedia(story.thumbnailUrl) ? await uploadMedia(me, story.thumbnailUrl!, 'photo') : story.thumbnailUrl;
          setState((prev) => ({ ...prev, stories: prev.stories.map((st) => (st.id === story.id ? { ...st, imageUrl, videoUrl, thumbnailUrl } : st)) }));
          await remote.insertStory({ ...story, imageUrl, videoUrl, thumbnailUrl });
        })();
      }
      return story.id;
    },
    [requireUser],
  );

  const toggleArchiveStory = useCallback((storyId: ID) => {
    const me = requireUser();
    haptics.commit();
    if (live(me, storyId)) {
      const story = stateRef.current.stories.find((st) => st.id === storyId);
      if (story?.authorId === me) remote.setStoryArchived(storyId, !story.archived);
    }
    setState((prev) => ({
      ...prev,
      stories: prev.stories.map((s) => (s.id === storyId && s.authorId === me ? { ...s, archived: !s.archived } : s)),
    }));
  }, [requireUser]);

  const markStoryViewed = useCallback((storyId: ID) => {
    const me = stateRef.current.currentUserId;
    const story = stateRef.current.stories.find((st) => st.id === storyId);
    if (live(me, storyId) && story && !story.viewedBy.includes(me!)) remote.recordStoryView(storyId, me!);
    setState((prev) => {
      const me = prev.currentUserId;
      const story = prev.stories.find((s) => s.id === storyId);
      if (!me || !story || story.viewedBy.includes(me)) return prev;
      return { ...prev, stories: prev.stories.map((s) => (s.id === storyId ? { ...s, viewedBy: [...s.viewedBy, me] } : s)) };
    });
  }, []);

  const toggleLikeStory = useCallback(
    (storyId: ID) => {
      const me = requireUser();
      if (live(me, storyId)) {
        const story = stateRef.current.stories.find((st) => st.id === storyId);
        if (story) remote.setStoryLike(storyId, me, !story.likedBy.includes(me));
      }
      setState((prev) => {
        const story = prev.stories.find((st) => st.id === storyId);
        const liking = !!story && !story.likedBy.includes(me);
        liking ? haptics.reward() : haptics.untap();
        const next: AppState = {
          ...prev,
          stories: prev.stories.map((st) =>
            st.id === storyId
              ? { ...st, likedBy: st.likedBy.includes(me) ? st.likedBy.filter((id) => id !== me) : [...st.likedBy, me] }
              : st,
          ),
        };
        return liking && story && story.authorId !== me
          ? withNotification(next, { userId: story.authorId, actorId: me, kind: 'like', targetId: story.id, targetKind: 'hit', preview: story.caption ? snippet(story.caption) : 'your hit' })
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
      setState((prev) => ({
        ...prev,
        comments: prev.comments.map((c) => (c.id === commentId ? { ...c, likedBy: liking ? [...c.likedBy, me] : c.likedBy.filter((id) => id !== me) } : c)),
      }));
    },
    [requireUser],
  );

  const addStoryComment = useCallback(
    (storyId: ID, body: string) => {
      const me = requireUser();
      const comment: Comment = { id: nextId('c'), postId: storyId, authorId: me, body, createdAt: new Date().toISOString(), likedBy: [] };
      haptics.commit();
      if (live(me, storyId)) remote.insertStoryComment(comment);
      setState((prev) => {
        const story = prev.stories.find((st) => st.id === storyId);
        const next: AppState = {
          ...prev,
          comments: [...prev.comments, comment],
          stories: prev.stories.map((st) => (st.id === storyId ? { ...st, commentIds: [...st.commentIds, comment.id] } : st)),
        };
        return story && story.authorId !== me
          ? withNotification(next, { userId: story.authorId, actorId: me, kind: 'comment', targetId: story.id, targetKind: 'hit', preview: snippet(body) })
          : next;
      });
    },
    [requireUser],
  );

  const addComment = useCallback(
    (postId: ID, body: string) => {
      const me = requireUser();
      const comment: Comment = {
        id: nextId('c'),
        postId,
        authorId: me,
        body,
        createdAt: new Date().toISOString(),
        likedBy: [],
      };
      haptics.commit();
      if (live(me, postId)) remote.insertComment(comment);
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        const next: AppState = {
          ...prev,
          comments: [...prev.comments, comment],
          posts: prev.posts.map((p) =>
            p.id === postId ? { ...p, commentIds: [...p.commentIds, comment.id] } : p,
          ),
        };
        return post
          ? withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'comment',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(body),
            })
          : next;
      });
    },
    [requireUser],
  );

  const addQuestion = useCallback(
    (input: NewQuestionInput): ID => {
      const me = requireUser();
      const question: Question = {
        id: nextId('q'),
        authorId: me,
        createdAt: new Date().toISOString(),
        votes: 0,
        votedBy: {},
        answerIds: [],
        ...input,
      };
      setState((prev) => celebratePosted({ ...prev, questions: [question, ...prev.questions] }, {
        userId: me, targetId: question.id, targetKind: 'question', preview: snippet(question.title),
        title: 'Question posted', body: 'The community can see it now.',
        href: '/', icon: 'chatbubbles',
      }));
      return question.id;
    },
    [requireUser],
  );

  const voteQuestion = useCallback(
    (questionId: ID, direction: 1 | -1) => {
      haptics.tap();
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === questionId ? applyVote(q, me, direction) : q)),
      }));
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
    },
    [requireUser],
  );

  const addAnswer = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID) => {
      const me = requireUser();
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
        };
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
      return request.id;
    },
    [requireUser],
  );

  /* ------------------------------ Ask a coach ----------------------------- */

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
      return question.id;
    },
    [requireUser],
  );

  const replyToCoachQuestion = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID) => {
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
    },
    [requireUser],
  );

  const toggleReplyHelpful = useCallback(
    (replyId: ID) => {
      const me = requireUser();
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
    (input: CoachApplicationInput): ID => {
      const me = requireUser();
      const application: CoachApplication = {
        id: nextId('ca'),
        userId: me,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        ...input,
      };
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
    setState((prev) => {
      const me = prev.currentUserId;
      if (!me) return prev;
      const mark = emoji ?? prev.defaultReaction;
      const message = prev.messages.find((m) => m.id === messageId);
      const existing = message?.reactions?.[me];
      existing === mark ? haptics.untap() : haptics.tap();
      return {
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions ?? {}) };
          if (reactions[me] === mark) delete reactions[me];
          else reactions[me] = mark;
          if (live(me, messageId)) void remote.setMessageReactions(messageId, reactions);
          return { ...m, reactions };
        }),
      };
    });
  }, []);

  const setDefaultReaction = useCallback((emoji: string) => {
    setState((prev) => ({ ...prev, defaultReaction: emoji }));
    try {
      if (Platform.OS === 'web') localStorage.setItem('courtside-default-reaction', emoji);
    } catch {}
  }, []);

  const markNotificationsRead = useCallback(() => {
    setState((prev) =>
      prev.notifications.some((n) => !n.read)
        ? { ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }
        : prev,
    );
  }, []);

  const markNotificationRead = useCallback((notificationId: ID) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  /**
   * Counts a view once per item per session. Without the guard, scrolling a clip
   * back into sight would inflate the number every time it passed.
   */
  const seenThisSession = useRef<Set<string>>(new Set());
  const recordView = useCallback((targetKind: 'post' | 'question', targetId: ID) => {
    const key = `${targetKind}:${targetId}`;
    if (seenThisSession.current.has(key)) return;
    seenThisSession.current.add(key);
    if (targetKind === 'post' && live(stateRef.current.currentUserId, targetId)) remote.bumpViews(targetId);
    setState((prev) =>
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
    );
  }, []);

  const toggleSavePost = useCallback((postId: ID) => {
    {
      const me = stateRef.current.currentUserId;
      if (live(me, postId)) remote.setSaved(postId, me!, !stateRef.current.saved.postIds.includes(postId));
    }
    setState((prev) => {
      const me = prev.currentUserId;
      const saving = !prev.saved.postIds.includes(postId);
      saving ? haptics.tap() : haptics.untap();
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

  const toggleSaveQuestion = useCallback((questionId: ID) => {
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

  /** Returns the existing 1:1 thread with a user, creating one if needed. */
  const openConversationWith = useCallback(
    (userId: ID): ID => {
      const me = requireUser();
      const existing = stateRef.current.conversations.find(
        (c) => c.participantIds.length === 2 && c.participantIds.includes(userId) && c.participantIds.includes(me),
      );
      if (existing) return existing.id;

      const conversation: Conversation = {
        id: nextId('cv'),
        participantIds: [me, userId],
        messageIds: [],
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
      };
      setState((prev) => ({ ...prev, conversations: [conversation, ...prev.conversations] }));
      if (live(me, userId)) void remote.openConversation(userId, conversation.id).then((standing) => {
        if (standing === conversation.id) return;
        // The database already had one: fold this one into it.
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.some((c) => c.id === standing)
            ? prev.conversations.filter((c) => c.id !== conversation.id)
            : prev.conversations.map((c) => (c.id === conversation.id ? { ...c, id: standing } : c)),
          messages: prev.messages.map((m) => (m.conversationId === conversation.id ? { ...m, conversationId: standing } : m)),
        }));
      });
      return conversation.id;
    },
    [requireUser],
  );

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
            // A message from the other person counts as unread until the thread is opened.
            ? { ...c, messageIds: [...c.messageIds, message.id], updatedAt: message.createdAt, unreadCount: senderId === prev.currentUserId ? c.unreadCount : (c.unreadCount ?? 0) + 1 }
            : c,
        ),
      };
    },
    [],
  );

  const sendMessage = useCallback(
    (conversationId: ID, body: string) => {
      haptics.commit();
      const me = requireUser();
      const trimmed = body.trim();
      if (!trimmed) return;
      const message = makeMessage(conversationId, me, trimmed);
      setState((prev) => appendMessage(prev, message));
      if (live(me, conversationId)) void remote.insertMessage(message);
    },
    [requireUser, appendMessage, makeMessage],
  );

  /** Share a clip or a thread into one or more DMs, Instagram style. */
  const shareToUsers = useCallback(
    (userIds: ID[], kind: 'post' | 'question' | 'profile', sharedId: ID, note?: string) => {
      const me = requireUser();
      const fresh: Conversation[] = [];
      const outgoing: Message[] = [];
      for (const userId of userIds) {
        let conversation = [...fresh, ...stateRef.current.conversations].find(
          (c) => c.participantIds.length === 2 && c.participantIds.includes(userId) && c.participantIds.includes(me),
        );
        if (!conversation) {
          conversation = { id: nextId('cv'), participantIds: [me, userId], messageIds: [], updatedAt: new Date().toISOString(), unreadCount: 0 };
          fresh.push(conversation);
        }
        outgoing.push(makeMessage(conversation.id, me, '', kind, sharedId));
        if (note?.trim()) outgoing.push(makeMessage(conversation.id, me, note.trim()));
      }
      setState((prev) => {
        let next = fresh.length ? { ...prev, conversations: [...fresh, ...prev.conversations] } : prev;
        for (const message of outgoing) next = appendMessage(next, message);

        // One share tally per send, however many people it went to.
        if (kind === 'post') {
          const post = next.posts.find((p) => p.id === sharedId);
          next = {
            ...next,
            posts: next.posts.map((p) =>
              p.id === sharedId ? { ...p, shares: (p.shares ?? 0) + userIds.length } : p,
            ),
          };
          if (post) {
            next = withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'share',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(post.body),
            });
          }
        } else if (kind === 'question') {
          const question = next.questions.find((q) => q.id === sharedId);
          next = {
            ...next,
            questions: next.questions.map((q) =>
              q.id === sharedId ? { ...q, shares: (q.shares ?? 0) + userIds.length } : q,
            ),
          };
          if (question) {
            next = withNotification(next, {
              userId: question.authorId,
              actorId: me,
              kind: 'share',
              targetId: question.id,
              targetKind: 'question',
              preview: snippet(question.title),
            });
          }
        }
        return next;
      });
      // Saved after they show: a new chat is opened first, then its messages go up.
      if (isSupabaseConfigured && UUID.test(me)) {
        void (async () => {
          for (const c of fresh) { const other = c.participantIds.find((p) => p !== me); if (other && UUID.test(other)) await remote.openConversation(other, c.id); }
          for (const m of outgoing) if (UUID.test(m.conversationId)) await remote.insertMessage(m);
        })();
      }
    },
    [requireUser, appendMessage, makeMessage],
  );

  const markConversationRead = useCallback((conversationId: ID) => {
    const before = stateRef.current.conversations.find((c) => c.id === conversationId);
    const me = stateRef.current.currentUserId;
    const hadUnread = !!before && before.unreadCount > 0 && !!me && before.participantIds.includes(me);
    if (hadUnread && live(me, conversationId)) void remote.markConversationRead(conversationId, me as ID);
    setState(prev => {
      const conversation = prev.conversations.find(c => c.id === conversationId);
      const me = prev.currentUserId;
      if (!conversation || !me || !conversation.participantIds.includes(me)) return prev;
      const user = prev.users.find(u => u.id === me);
      const messages = markMessagesOpened(prev.messages, conversation, me, user?.readReceiptsEnabled !== false, new Date().toISOString());
      if (messages === prev.messages && conversation.unreadCount === 0) return prev;
      return {...prev, messages, conversations: prev.conversations.map(c => c.id === conversationId ? {...c, unreadCount: 0} : c)};
    });
  }, []);

  /* ---------------------------- A coach's page ---------------------------- */

  /** Only the coach who owns the page can add to it; anyone else is ignored. */
  const addCoachResult = useCallback((input: Omit<CoachResult, 'id' | 'coachId'>) => {
    setState((prev) => {
      const coach = prev.coaches.find((c) => c.userId === prev.currentUserId);
      if (!coach) return prev;
      haptics.commit();
      const result: CoachResult = { ...input, id: nextId('res'), coachId: coach.id };
      return { ...prev, coachResults: [result, ...prev.coachResults] };
    });
  }, []);

  /** One review per player per coach; the coach's average moves with it. */
  const addCoachReview = useCallback((coachId: ID, rating: number, body: string) => {
    setState((prev) => {
      const me = prev.currentUserId;
      const coach = prev.coaches.find((c) => c.id === coachId);
      if (!me || !coach || coach.userId === me) return prev;
      if (prev.coachReviews.some((r) => r.coachId === coachId && r.authorId === me)) return prev;
      haptics.commit();
      const stars = Math.max(1, Math.min(5, Math.round(rating)));
      const review: CoachReview = {
        id: nextId('rev'),
        coachId,
        authorId: me,
        rating: stars,
        body: body.trim(),
        createdAt: new Date().toISOString(),
      };
      const total = coach.ratingAvg * coach.ratingCount + stars;
      const count = coach.ratingCount + 1;
      return {
        ...prev,
        coachReviews: [review, ...prev.coachReviews],
        coaches: prev.coaches.map((c) =>
          c.id === coachId ? { ...c, ratingCount: count, ratingAvg: Math.round((total / count) * 10) / 10 } : c,
        ),
      };
    });
  }, []);

  /* ------------------------------- Location ------------------------------- */

  /**
   * Turning Location on asks the device once, through its own prompt, and
   * keeps only the nearest city name. Resolves with a message for the screen
   * to show, or null when everything went fine.
   */
  const setLocationEnabled = useCallback(async (enabled: boolean): Promise<string | null> => {
    const remember = (on: boolean) => {
      try {
        if (Platform.OS === 'web') localStorage.setItem('courtside-location', on ? 'on' : 'off');
      } catch {}
    };
    if (!enabled) {
      remember(false);
      setState((prev) => ({ ...prev, locationEnabled: false, detectedLocation: null, detectedCoords: null }));
      return null;
    }
    const result = await getPosition();
    if (!result.ok) {
      remember(false);
      setState((prev) => ({ ...prev, locationEnabled: false, detectedLocation: null, detectedCoords: null }));
      return result.reason === 'denied'
        ? 'Location was blocked. Allow it for this site in your browser or phone settings, then try again.'
        : result.reason === 'unavailable'
          ? 'This device cannot share its location with the app yet.'
          : 'Could not get a location right now. Try again in a moment.';
    }
    const place = nearestPlace(result.lat, result.lng);
    haptics.tap();
    remember(true);
    setState((prev) => ({ ...prev, locationEnabled: true, detectedLocation: place.name, detectedCoords: { lat: result.lat, lng: result.lng } }));
    return null;
  }, []);

  // Someone who left Location on last time gets the city refreshed quietly.
  useEffect(() => {
    if (!state.locationEnabled || state.detectedLocation) return;
    getPosition().then((result) => {
      if (result.ok) {
        const place = nearestPlace(result.lat, result.lng);
        setState((prev) => ({ ...prev, detectedLocation: place.name, detectedCoords: { lat: result.lat, lng: result.lng } }));
      }
    });
  }, [state.locationEnabled, state.detectedLocation]);

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

  const toggleFollow = useCallback((userId: ID) => {
    {
      const me = stateRef.current.currentUserId;
      const target = stateRef.current.users.find((u) => u.id === userId);
      const following = stateRef.current.followingIds.includes(userId);
      if (me && userId !== me && target?.isPrivate && !following) {
        // A private account: this is an ask, not a follow. Asking twice takes it back.
        const asked = stateRef.current.followRequests.some((r) => r.fromId === me && r.toId === userId);
        asked ? haptics.untap() : haptics.tap();
        if (live(me, userId)) asked ? remote.cancelFollowRequest(me, userId) : remote.sendFollowRequest(me, userId);
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
      if (live(me, userId) && userId !== me) remote.setFollow(me!, userId, !following);
    }
    setState((prev) => {
      const me = prev.currentUserId;
      if (!me || userId === me) return prev;
      const following = !prev.followingIds.includes(userId);
      following ? haptics.tap() : haptics.untap();
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
  }, [requireUser, patchCurrentUser]);

  const toggleMute = useCallback((userId: ID) => {
    setState((prev) => {
      prev.mutedIds.includes(userId) ? haptics.untap() : haptics.tap();
      return { ...prev, mutedIds: toggleIn(prev.mutedIds, userId) };
    });
  }, []);

  /** Blocking also unfollows, both ways, and drops the conversation. */
  const toggleBlock = useCallback((userId: ID) => {
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
          ? prev.conversations.filter((c) => !(c.participantIds.includes(userId) && c.participantIds.includes(me)))
          : prev.conversations,
      };
    });
  }, []);

  const toggleAlerts = useCallback((userId: ID) => {
    setState((prev) => {
      prev.alertIds.includes(userId) ? haptics.untap() : haptics.tap();
      return { ...prev, alertIds: toggleIn(prev.alertIds, userId) };
    });
  }, []);

  /** A report goes nowhere in the mock build; the feedback is what matters. */
  const submitTip = useCallback(async (body: string) => {
    const me = stateRef.current.currentUserId;
    haptics.commit();
    if (me && live(me)) await remote.insertTip(me, body);
  }, []);

  const reportUser = useCallback((_userId: ID, _reason: string) => {
    haptics.commit();
  }, []);

  const toggleIntegration = useCallback(async (provider: Integration['provider']) => {
    const current = stateRef.current.integrations.find((i) => i.provider === provider);
    if (!current) return;
    const updated = current.connected
      ? await disconnectProvider(current)
      : await connectProvider(current);
    setState((prev) => ({
      ...prev,
      integrations: prev.integrations.map((i) => (i.provider === provider ? updated : i)),
    }));
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      addCoachResult,
      addCoachReview,
      setLocationEnabled,
      setDefaultPayment,
      addPaymentMethod,
      removePaymentMethod,
      toggleFollow,
      acceptFollowRequest,
      declineFollowRequest,
      setPrivateAccount,
      toggleMute,
      toggleBlock,
      toggleAlerts,
      reportUser,
      submitTip,
      setReadReceiptsEnabled,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      accountInfo,
      changePassword,
      changeEmail,
      signOutEverywhere,
      switchAccount,
      forgetSavedAccount,
      linkGoogle,
      deleteAccount,
      exportData,
      completeOnboarding,
      updateProfile,
      updateIdentity,
      toggleLike,
      addPost,
      toggleArchivePost,
      togglePinPost,
      editPost,
      editQuestion,
      refresh,
      deletePost,
      addStory,
      toggleArchiveStory,
      markStoryViewed,
      addComment,
      toggleLikeStory,
      toggleLikeComment,
      addStoryComment,
      addQuestion,
      voteQuestion,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      markNotificationsRead,
      markNotificationRead,
      recordView,
      openConversationWith,
      sendMessage,
      shareToUsers,
      markConversationRead,
    }),
    [
      addCoachResult,
      addCoachReview,
      setLocationEnabled,
      setDefaultPayment,
      addPaymentMethod,
      removePaymentMethod,
      toggleFollow,
      acceptFollowRequest,
      declineFollowRequest,
      setPrivateAccount,
      toggleMute,
      toggleBlock,
      toggleAlerts,
      reportUser,
      submitTip,
      setReadReceiptsEnabled,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      accountInfo,
      changePassword,
      changeEmail,
      signOutEverywhere,
      switchAccount,
      forgetSavedAccount,
      linkGoogle,
      deleteAccount,
      exportData,
      completeOnboarding,
      updateProfile,
      updateIdentity,
      toggleLike,
      addPost,
      toggleArchivePost,
      togglePinPost,
      editPost,
      editQuestion,
      refresh,
      deletePost,
      addStory,
      toggleArchiveStory,
      markStoryViewed,
      addComment,
      toggleLikeStory,
      toggleLikeComment,
      addStoryComment,
      addQuestion,
      voteQuestion,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      markNotificationsRead,
      markNotificationRead,
      recordView,
      openConversationWith,
      sendMessage,
      shareToUsers,
      markConversationRead,
    ],
  );

  const value = useMemo<AppContextValue>(
    () => ({ ...state, ready: state.ready && state.authResolved, currentUser, actions }),
    [state, currentUser, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
