import { AppState, Platform } from 'react-native';
import { File as DeviceFile } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
/**
 * The Supabase side of the API seam.
 *
 * Reads return app types (src/data/types.ts) built from table rows; writes
 * take app types and store rows. src/store/AppContext.tsx updates its own
 * state first and calls these afterwards, so the UI never waits on the
 * network and a failed write only logs. Anything not covered here — the
 * discussions board, coaching, health — still comes from the fixtures.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { ANDROID_OAUTH_KEY, androidOAuthClient, supabase, throwawayAuthClient } from '@/lib/supabase';
import { shrinkCover, shrinkPhoto, shrinkPhotoSized } from '@/lib/shrinkPhoto';
import { COVER_MARK, smallName } from '@/lib/smallCover';
import { canShrinkVideo, shrinkVideo } from '@/lib/shrinkVideo';
import { tooBigReason } from '@/lib/uploads';
import { blankVideoLocation } from '@/lib/videoLocation';
import { noteStep } from '@/lib/crashReporting';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { Answer, FriendStreak, ChatEvent, ChatPhoto, Coach, CoachResult, CoachReview, CoachService, CoachSpecialty, DailyHealth, DetectedActivity, IntegrationProvider, CoachQuestion, CoachReply, CoachingRequest, Comment, Conversation, HiddenWords, HiddenWordsKind, ID, Message, Notification, PaymentMethod, PlayerProfile, PlayerStats, Post, PracticeSession, HitRequest, CourtNote, LastSeen, MapPlace, MapVisibility, TaggedCourt, Question, Removed, RemovedItem, ReviewRequest, ReviewStatus, Story, SurfacePreference, TakedownKind, TakedownReason, Tip, TournamentEntry, User, PublicStreak, CoachApplication, CourtAccess, CourtAccessSource, CourtDayPart, CourtFacts, CourtFollowCount, CourtNow, CourtKings, CourtRegulars, CourtReview, CourtRightNow, CourtRing, FlybyPerson, FollowedCourt, SessionTag, SessionTagRefusal, SessionTagRole, FeedGroup, FeedGroupCard, DiscoverGroup, GroupLook, Invitee, AffiliateStats, ContactMatch, HeadToHead, MatchSet, SessionWith } from './types';
import { canScore, validSets } from '@/features/activity/score';
import { keptAvgHr, keptKcal } from '@/features/activity/manualStats';
import { TERMS_VERSION } from '@/lib/legal';
import { readinessOf, sessionTagNamesLive, sessionToSend, setSessionTagNamesLive, trustedSession } from './sessionTagGate';
import { isMapCourtId } from '@/features/places/courtName';
import type { Openness } from '@/features/players/age';
import { asHitMiles } from '@/features/players/openToHit';
import { lookFrom } from '@/features/groups/look';
import { asKind, asReason } from '@/features/moderation/reasons';
import { BLOCKED_WORDS_NOTE } from '@/features/hiddenWords/hiddenWords';
import { STREAK_FLAME_FROM } from '@/features/practice/streakFlame';

/** What a new player did first, after setup. */
/** What the live handle check says about a handle. */
/** 'words': it has words CourtSide refuses in it (migration 117). */
export type HandleStatus = 'ok' | 'yours' | 'invalid' | 'taken' | 'held' | 'words';

/**
 * What a new player did first, after setup. 'invite' (shared their link),
 * 'follow' (followed a player near them) and 'find' (went to find a friend
 * by @handle) came with the first-move page's Oct 5 change; the database
 * takes them from migration 124. Before it, saving one of those is refused
 * and nothing is kept (the save is quiet either way).
 */
export type FirstMove = 'post' | 'instant' | 'answer' | 'ask' | 'later' | 'invite' | 'follow' | 'find';
/** What a profile save can change. */
export type ProfilePatch = { name?: string; bio?: string; location?: string; cityAt?: { lat: number; lng: number } | null; avatarUrl?: string; profile?: PlayerProfile; isPrivate?: boolean; readReceipts?: boolean; openToHitUntil?: string | null; firstMove?: FirstMove };
/** One person who has invited anyone, as the admin Invites page shows them (migration 71). */
export interface InviteSummaryRow {
  id: ID; name: string; handle: string; avatarUrl?: string; suspended?: boolean;
  /**
   * On the server's affiliates list (migration 156, the same check as
   * my_affiliate_stats): only they are paid, so for anyone else owed is 0
   * and "Mark paid" is refused. Missing until migration 156 runs.
   */
  isAffiliate?: boolean;
  /** Worth a look (migration 80): their people share phones, >10 joined in an hour, or >20 counted in a day. Only a flag. */
  suspicious?: boolean;
  /** Signed up through their link (not deleted, not suspended, never themselves). */
  invited: number;
  /** Of those, finished setting up. */
  setUp: number;
  /** A real player (migration 80's test): what is paid for. */
  qualified: number;
  paid: number; paidCents: number; owed: number; owedCents: number; lastPaidAt?: string;
}
/**
 * Who invited me: their id and @handle once set; canSet while a code may
 * still be typed (inside a day of joining). With nobody set yet, `suggested`
 * is the @handle the waitlist matched from a link they used (migration 116):
 * filled in at "Invited by?", and only counted once they press Continue.
 */
export interface MyInviter { id?: ID; handle?: string; name?: string; canSet: boolean; suggested?: string }
export type InviteCodeResult =
  | { ok: true; id: ID; handle: string; followed: boolean; error?: undefined }
  | { ok?: undefined; error: 'not-found' | 'self' | 'already' | 'too-late' | 'offline'; handle?: string };
/** Someone one person brought: only their name, @handle and dates. */
export interface InviteeRow { id: ID; name: string; handle: string; avatarUrl?: string; joinedAt: string; setUp: boolean; qualifiedAt?: string }
export interface FirstDayStats { new30: number; moved30: number; cohort: number; movers: number; moversBack: number; othersBack: number; picked: Record<FirstMove, number> }

const need = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

/**
 * Forgets the session on this device only. The login itself stays alive on
 * the server, so its token (kept for the "pick an account" list) still works.
 * The auth client reads its session from storage every time, so removing it
 * there is enough.
 */
async function forgetLocalSession() {
  const client = need();
  const key = (client.auth as unknown as { storageKey?: string }).storageKey;
  if (!key) { await client.auth.signOut({ scope: 'local' }).catch(() => undefined); return; }
  const keys = [key, `${key}-user`, `${key}-code-verifier`];
  if (Platform.OS === 'web') { try { keys.forEach((k) => window.localStorage.removeItem(k)); } catch { /* private mode */ } }
  else await AsyncStorage.multiRemove(keys).catch(() => undefined);
}

/* ------------------------------------------------------------- mappings */

export const emptyProfile: PlayerProfile = {
  skillSystem: 'NTRP',
  rating: 3,
  playStyle: 'all-court',
  handedness: 'right',
  backhand: 'two-handed',
  fitnessLevel: 'recreational',
  preferredSurface: 'hard',
  goals: [],
  constraints: [],
  tournaments: [],
};

const emptyStats: PlayerStats = {
  sessionsLogged: 0,
  matchesPlayed: 0,
  matchesWon: 0,
  hoursOnCourt: 0,
  currentStreakDays: 0,
  longestStreakDays: 0,
};

interface ProfileRow {
  id: string; handle: string; name: string; bio: string; location: string;
  /** Migration 49. */
  city_lat?: number | null; city_lng?: number | null;
  avatar_url: string | null; is_coach: boolean; profile: Partial<PlayerProfile> | null; created_at: string;
  is_private?: boolean | null;
  /** Migration 31. */
  open_to_hit_until?: string | null;
  /** Never a profile column: your own, laid on from your settings row (migration 120). */
  open_to_hit_miles?: number | null;
  /** Migration 34. */
  handle_changed_at?: string | null;
  /** Kept by the database (migration 22); missing on a database without it. */
  followers_count?: number | null;
  /** Moderation (migration 23). */
  is_admin?: boolean | null;
  suspended_at?: string | null;
  following_count?: number | null;
  /**
   * Only before migration 64, when every profile carried it. Since then
   * nobody's age is on a profile; your own comes from your settings row.
   */
  age_group?: string | null;
  read_receipts?: boolean | null;
}
/**
 * Taken down by an admin (migration 108): when, and which of the eight
 * reasons. Only the author and admins ever get such a row back.
 */
interface RemovedColumns { removed_at?: string | null; removed_reason?: string | null }
/**
 * The comments, Instant comments, thread replies and coach replies your
 * Hidden words hid on what you posted (migration 117), by id. Only the owner
 * can read these (comment_word_holds); nothing on the comment itself says it
 * is hidden, so whoever wrote one sees it, and counts it, exactly as normal.
 * Read in full with each full load (refreshHeld); ones written since are
 * asked about as they arrive (learnHeld). Empty on a database without them.
 */
const held = { ids: new Set<string>(), at: 0, me: '' };
/** Hidden for you as its owner: this one, or the one it is a reply under. */
const heldHere = (id: string, parent?: string | null) => held.ids.has(id) || (!!parent && held.ids.has(parent));
/** Marked only when it is hidden for you, so everything else comes out exactly as before. */
const withHidden = <T extends object>(item: T, id: string): T => (held.ids.has(id) ? { ...item, hiddenByWords: true } : item);
/**
 * Reads which of your things' comments your Hidden words hid (on each full
 * load); a database without migration 117 simply has none.
 */
async function refreshHeld(me: ID): Promise<void> {
  if (!supabase || !me) return;
  const { data, error } = await supabase.from('comment_word_holds').select('item_id').order('held_at', { ascending: false }).limit(2000)
    .then((r) => r, () => ({ data: null, error: true }));
  // Not read: later loads ask about every comment on your things instead (see sinceHeldRead).
  if (error) { if (held.me !== me) held.ids = new Set(); held.me = me; held.at = 0; return; }
  held.ids = new Set(((data ?? []) as { item_id: string }[]).map((r) => r.item_id));
  held.me = me;
  held.at = Date.now();
}
/** Whether these comments, newer than the last full read, are hidden: asked about them alone. */
async function learnHeld(ids: ID[]): Promise<void> {
  const wanted = ids.filter((id) => UUID_RE.test(id) && !held.ids.has(id));
  for (let i = 0; i < wanted.length && supabase; i += 150) {
    const { data, error } = await supabase.from('comment_word_holds').select('item_id').in('item_id', wanted.slice(i, i + 150))
      .then((r) => r, () => ({ data: null, error: true }));
    if (error) return;
    for (const r of (data ?? []) as { item_id: string }[]) held.ids.add(r.item_id);
  }
}
/**
 * Of these rows (someone else's comments on what you posted), the ones
 * written since the last full read (with two minutes to spare for a phone
 * clock that runs ahead): those are asked about before they are shown.
 */
const sinceHeldRead = (rows: { id: string; created_at: string }[]) => rows.filter((r) => Date.parse(r.created_at) > held.at - 120_000).map((r) => r.id);
/** Your own id, for a load that does not pass it (the last one a full load was made for). */
const heldOwner = () => held.me;
/** hidden_words()'s answer as the app keeps it; null when it is not that shape. */
function asHiddenWords(data: unknown): HiddenWords | null {
  const d = data as Partial<HiddenWords> | null;
  if (!d || typeof d !== 'object' || typeof d.hideOffensiveComments !== 'boolean') return null;
  return {
    hideOffensiveComments: d.hideOffensiveComments,
    // Left out: off for an adult, on (and locked) otherwise, as the server starts them (migration 148).
    hideOffensiveRequests: d.locked === true || d.hideOffensiveRequests === true,
    customWords: Array.isArray(d.customWords) ? d.customWords.filter((w): w is string => typeof w === 'string') : [],
    customInComments: d.customInComments !== false,
    customInRequests: d.customInRequests !== false,
    locked: d.locked === true,
  };
}
const removedOf = (row: RemovedColumns): Removed | undefined =>
  row.removed_at ? { reason: asReason(row.removed_reason), at: row.removed_at } : undefined;
/** Marked only when it was taken down, so an untouched one comes out exactly as before. */
const withRemoved = <T extends object>(item: T, row: RemovedColumns): T => {
  const removed = removedOf(row);
  return removed ? { ...item, removed } : item;
};

type PostRow = {
  /** The group it is shared to, if any (migration 67). */
  group_id?: string | null;
  id: string; author_id: string; kind: Post['kind']; body: string; media_label: string | null;
  image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  match: Post['match'] | null; session: Post['session'] | null; tags: string[]; tagged_user_ids: string[];
  archived: boolean; views: number; shares: number; created_at: string;
  orientation?: string | null;
  trim_start?: number | string | null; trim_end?: number | string | null; muted?: boolean | null; pinned?: boolean | null;
  crop?: { scale: number; x: number; y: number } | null;
  /** Numeric columns arrive as strings, as trim_start does. */
  speed?: number | string | null; volume?: number | string | null;
  location?: string | null; edited_at?: string | null; feature_ok?: boolean | null; referred_by?: string | null; is_first?: boolean | null;
  court_id?: string | null; court_name?: string | null; court_lat?: number | null; court_lng?: number | null;
  post_likes?: { user_id: string }[]; post_saves?: { user_id: string }[]; comments?: { id: string; parent_id?: string | null }[];
} & RemovedColumns;
type CommentRow = {
  id: string; post_id: string; author_id: string; body: string; created_at: string; image_url?: string | null;
  /** A reply's thread and the comment it answers (migration 56); absent before it. */
  parent_id?: string | null; reply_to_id?: string | null;
  comment_likes?: { user_id: string }[];
} & RemovedColumns;
type StoryRow = {
  id: string; author_id: string; image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  media_label: string | null; caption: string | null; archived: boolean; created_at: string; expires_at: string;
  story_views?: { user_id: string }[];
  story_likes?: { user_id: string }[];
  story_comments?: ({ id: string; story_id: string; author_id: string; body: string; created_at: string; parent_id?: string | null; reply_to_id?: string | null; story_comment_likes?: { user_id: string }[] } & RemovedColumns)[];
} & RemovedColumns;

const toUser = (row: ProfileRow, followers: number, following: number): User => ({
  id: row.id,
  handle: row.handle,
  name: row.name,
  bio: row.bio ?? '',
  location: row.location ?? '',
  cityAt: row.city_lat != null && row.city_lng != null ? { lat: row.city_lat, lng: row.city_lng } : undefined,
  joinedAt: row.created_at,
  avatarSeed: row.id,
  avatarUrl: row.avatar_url ?? undefined,
  isPrivate: row.is_private || undefined,
  openToHitUntil: row.open_to_hit_until ?? undefined,
  openToHitMiles: asHitMiles(row.open_to_hit_miles),
  handleChangedAt: row.handle_changed_at ?? undefined,
  ageGroup: row.age_group === 'teen' || row.age_group === 'adult' ? row.age_group : undefined,
  // Off only when its owner turned it off; a database without the setting yet reads as on.
  readReceiptsEnabled: row.read_receipts !== false,
  isCoach: row.is_coach,
  isAdmin: row.is_admin || undefined,
  suspended: row.suspended_at ? true : undefined,
  // The database's own counts when it keeps them; otherwise counted from the follows loaded.
  followers: typeof row.followers_count === 'number' ? row.followers_count : followers,
  following: typeof row.following_count === 'number' ? row.following_count : following,
  profile: { ...emptyProfile, ...(row.profile ?? {}) },
  achievementIds: [],
  stats: emptyStats,
});

/**
 * What a post needs to arrive whole: who liked it, who saved it, and its
 * comments. Used by the opening load and by every later page, so a post that
 * comes in later is never a thinner version of the same thing.
 */
// Comments come whole (`*`): a database with or without the reply columns (migration 56) answers the same ask.
const POST_SELECT = '*, post_likes(user_id), post_saves(user_id), comments(*, comment_likes(user_id))';
/** How many posts come at a time: on open, and each time the feed nears its end. */
export const POST_PAGE = 40;
/** A group's feed comes a page of this many at a time (group_feed, migration 74). */
const GROUP_PAGE = 20;
type FullPostRow = PostRow & { comments?: CommentRow[] };
/**
 * Rows to the posts and comments the app holds. A post an admin took down
 * comes back only to its author and to admins (the database decides), and
 * arrives marked `removed`: the feeds leave it out, its author's own pages
 * show it marked.
 */
function toPosts(rows: FullPostRow[]): { posts: Post[]; comments: Comment[] } {
  return { posts: rows.map(toPost), comments: rows.flatMap((row) => (row.comments ?? []).map(toComment)) };
}
/**
 * The same, after asking whether your Hidden words hid any comment on your
 * own posts here written since the last full read.
 */
async function toPostsHeld(rows: FullPostRow[]): Promise<{ posts: Post[]; comments: Comment[] }> {
  const me = heldOwner();
  if (me) await learnHeld(sinceHeldRead(rows.filter((row) => row.author_id === me).flatMap((row) => ((row.comments ?? []) as CommentRow[]).filter((c) => c.author_id !== me))));
  return toPosts(rows);
}

/** session_minor_posts' answer (migration 124): which post, and the player's entry on it. Anything malformed is left out. */
function sessionEntries(data: unknown): { postId: ID; entry: SessionWith }[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const r = raw as { post_id?: unknown; entry?: { id?: unknown; handle?: unknown; name?: unknown; role?: unknown } | null };
    const e = r?.entry;
    if (typeof r?.post_id !== 'string' || !UUID_RE.test(r.post_id) || !e || typeof e.id !== 'string' || !UUID_RE.test(e.id)) return [];
    if (e.role !== 'opponent' && e.role !== 'partner') return [];
    return [{ postId: r.post_id, entry: { id: e.id, handle: typeof e.handle === 'string' ? e.handle : '', name: typeof e.name === 'string' ? e.name : '', role: e.role } }];
  });
}

/** A post row with one more player on its session's list (opponents first, as the server orders it), unless they are on it already. */
function withSessionPlayer(row: FullPostRow, entry: SessionWith): FullPostRow {
  const session = row.session;
  if (!session || typeof session !== 'object') return row;
  const had = Array.isArray(session.with) ? session.with : [];
  if (had.some((w) => w.id === entry.id)) return row;
  const list = [...had, entry];
  return { ...row, session: { ...session, with: [...list.filter((w) => w.role === 'opponent'), ...list.filter((w) => w.role !== 'opponent')] } };
}

const toPost = (row: PostRow): Post => withRemoved<Post>({
  id: row.id,
  authorId: row.author_id,
  kind: row.kind,
  createdAt: row.created_at,
  body: row.body,
  mediaLabel: row.media_label ?? undefined,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  orientation: (row.orientation as 'portrait' | 'landscape' | null) ?? undefined,
  trimStart: row.trim_start != null ? Number(row.trim_start) : undefined,
  trimEnd: row.trim_end != null ? Number(row.trim_end) : undefined,
  muted: row.muted || (row.volume != null && Number(row.volume) === 0) || undefined,
  // A shift with no zoom is still a crop; only an untouched one is dropped.
  crop: row.crop && (row.crop.scale > 1.001 || !!row.crop.x || !!row.crop.y) ? row.crop : undefined,
  speed: row.speed != null && Number(row.speed) !== 1 ? Number(row.speed) : undefined,
  volume: row.volume != null && Number(row.volume) > 0 && Number(row.volume) < 1 ? Number(row.volume) : undefined,
  taggedUserIds: row.tagged_user_ids?.length ? row.tagged_user_ids : undefined,
  match: row.match ?? undefined,
  session: trustedSession(row.session),
  likedBy: (row.post_likes ?? []).map((l) => l.user_id),
  // One your Hidden words hid (migration 117), or a reply under it, is not counted for you, its owner.
  commentIds: (row.comments ?? []).filter((c) => !heldHere(c.id, c.parent_id)).map((c) => c.id),
  tags: row.tags ?? [],
  views: row.views,
  shares: row.shares,
  savedBy: (row.post_saves ?? []).map((s) => s.user_id),
  archived: row.archived || undefined,
  pinned: row.pinned || undefined,
  location: row.location ?? undefined,
  court: row.court_id && row.court_name && row.court_lat != null && row.court_lng != null
    ? { id: row.court_id, name: row.court_name, lat: Number(row.court_lat), lng: Number(row.court_lng) } : undefined,
  featureOk: row.feature_ok === false ? false : undefined,
  isFirst: row.is_first || undefined,
  editedAt: row.edited_at ?? undefined,
  groupId: row.group_id ?? undefined,
}, row);

const toComment = (row: CommentRow): Comment => withHidden(withRemoved<Comment>({
  id: row.id,
  postId: row.post_id,
  authorId: row.author_id,
  body: row.body,
  createdAt: row.created_at,
  likedBy: (row.comment_likes ?? []).map((l) => l.user_id),
  imageUrl: row.image_url ?? undefined,
  parentId: row.parent_id ?? undefined,
  replyToId: row.reply_to_id ?? undefined,
}, row), row.id);

const toStory = (row: StoryRow): Story => withRemoved<Story>({
  id: row.id,
  authorId: row.author_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  imageUrl: row.image_url ?? undefined,
  videoUrl: row.video_url ?? undefined,
  thumbnailUrl: row.thumbnail_url ?? undefined,
  mediaLabel: row.media_label ?? undefined,
  caption: row.caption ?? undefined,
  viewedBy: (row.story_views ?? []).map((v) => v.user_id),
  likedBy: (row.story_likes ?? []).map((l) => l.user_id),
  commentIds: (row.story_comments ?? []).filter((c) => !heldHere(c.id, c.parent_id)).map((c) => c.id),
  archived: row.archived || undefined,
}, row);

/** A comment on a hit, shaped like any other comment with the hit as its "post". */
const toStoryComment = (row: NonNullable<StoryRow['story_comments']>[number]): Comment => withHidden(withRemoved<Comment>({
  id: row.id, postId: row.story_id, authorId: row.author_id, body: row.body, createdAt: row.created_at,
  likedBy: (row.story_comment_likes ?? []).map((l) => l.user_id),
  parentId: row.parent_id ?? undefined,
  replyToId: row.reply_to_id ?? undefined,
}, row), row.id);

/** How many comment watches have opened, for unique channel names. */
let commentWatches = 0;

/**
 * Saves a comment row, as a reply when it is one: its thread (`parent_id`)
 * and the comment it answers (`reply_to_id`). The database files a reply to a
 * reply under the same top comment itself. Two things are tried again: a
 * reply sent before the comment it answers has finished saving (a moment
 * later), and a database without replies yet (before migration 56), where the
 * words still go up, as a plain comment.
 */
async function insertReplying(table: 'comments' | 'story_comments', row: Record<string, unknown>, comment: Comment) {
  const db = need();
  if (!comment.parentId) return db.from(table).insert(row);
  const reply = { ...row, parent_id: comment.parentId, reply_to_id: comment.replyToId ?? comment.parentId };
  let { error } = await db.from(table).insert(reply);
  if (error && /reply_parent_missing/.test(error.message)) {
    await new Promise((r) => setTimeout(r, 1500));
    ({ error } = await db.from(table).insert(reply));
  }
  // Only a database that has no such columns yet (the API's "unknown column"
  // or Postgres's): a refused reply (its comment deleted meanwhile) is not re-sent as a comment.
  if (error && (error.code === 'PGRST204' || error.code === '42703') && /parent_id|reply_to_id/.test(error.message)) return db.from(table).insert(row);
  return { error };
}

/* ---------------------------------------------------------------- reads */

export interface RemoteData {
  users: User[];
  posts: Post[];
  comments: Comment[];
  stories: Story[];
  followingIds: ID[];
  /** Every follow between profiles, so any player's lists can be shown. */
  followEdges: { followerId: ID; followingId: ID }[];
  savedPostIds: ID[];
  /** Pending asks to follow a private account, yours and the ones waiting on you. */
  followRequests: { fromId: ID; toId: ID; createdAt: string }[];
  /** Your direct messages; empty until the messages tables exist. */
  conversations: Conversation[];
  messages: Message[];
  /** Discussions, coaching and your own settings; empty until their tables exist. */
  questions: Question[];
  answers: Answer[];
  coachQuestions: CoachQuestion[];
  coachReplies: CoachReply[];
  coachingRequests: CoachingRequest[];
  notifications: Notification[];
  userState: UserState | null;
  tips: Tip[];
  coachApplications: CoachApplication[];
  /** Real coaches: every listed one, and your own listing if you coach. */
  coaches: Coach[];
  coachReviews: CoachReview[];
  coachResults: CoachResult[];
  /** Your own practice log (see migration 39); empty on a database without it. */
  sessions: PracticeSession[];
  /** Open "Looking for a hit" posts (migration 43). */
  hitRequests: HitRequest[];
  /** Your tracker sessions (migration 58); missing in older saved copies. */
  activities?: DetectedActivity[];
  /** Whether this server can tag players on sessions (migration 62 has run); missing when it could not be told. */
  sessionTagsReady?: boolean;
  /**
   * Whether the profiles came down with everyone's age on them: true on a
   * database from before migration 64, false since (nobody's age but your
   * own reaches the app). Missing in saved copies.
   */
  agesOnProfiles?: boolean;
  /**
   * No settings row yet, and the database has "Let people find me from
   * their contacts" (migration 89). Missing otherwise: a settings row says
   * so itself.
   */
  contactsFindableReady?: boolean;
  /** The same, for the "Players joining near you" switch (migration 146). */
  alertSwitchesReady?: boolean;
  /** Messages you deleted for yourself, so a chat fetched again later leaves them out too. Missing in saved copies. */
  hiddenMessageIds?: ID[];
  /**
   * The accounts that have blocked you (blocked_me, migration 118): search
   * leaves them out. Missing on a database without it, or when it could not
   * be asked.
   */
  blockedMeIds?: ID[];
  /** Your settings row could not be read this time (not the same as having none): `userState` is null for that reason. */
  userStateFailed?: boolean;
}

interface SessionRow { id: string; user_id: string; day: string; minutes: number; kind: PracticeSession['kind']; won: boolean | null; opponent: string | null; note: string | null; created_at: string; activity_id?: string | null; from_session_id?: string | null; sets?: unknown; workout?: string | null; court_id?: string | null; kcal?: number | null; avg_hr?: number | null }
const toSession = (r: SessionRow): PracticeSession => {
  // A tennis session's score (migration 91 for a match, 136 for a practice or drills; absent before they run), kept only when it is a good one.
  const sets = canScore(r.kind) ? validSets(r.sets) : undefined;
  return {
    id: r.id, userId: r.user_id, day: r.day, minutes: r.minutes, kind: r.kind, won: r.won ?? undefined, opponent: r.opponent ?? undefined, note: r.note ?? undefined,
    activityId: r.activity_id ?? undefined, fromSessionId: r.from_session_id ?? undefined, ...(sets ? { sets } : {}),
    // What a fitness session logged from a workout was (migration 107; absent before it runs).
    ...(r.kind === 'fitness' && r.workout ? { workout: r.workout } : {}),
    // Where it was played (migration 130; absent before it runs).
    ...(isMapCourtId(r.court_id ?? undefined) ? { courtId: r.court_id! } : {}),
    // Calories and average heart rate typed in by hand (migration 154; absent before it runs), never on a tracker's.
    ...(!r.activity_id && keptKcal(r.kcal) ? { kcal: keptKcal(r.kcal) } : {}),
    ...(!r.activity_id && keptAvgHr(r.avg_hr) ? { avgHr: keptAvgHr(r.avg_hr) } : {}),
    createdAt: r.created_at,
  };
};

/** A row of my_session_tags() (migration 62): a tag and what the tagged person may see of the session. */
interface SessionTagRow {
  id: string; session_id: string; tagger_id: string; tagged_id: string; role: SessionTagRole; status: SessionTag['status']; dropped?: boolean | null;
  mirrored_session_id: string | null; created_at: string; responded_at: string | null;
  kind: PracticeSession['kind']; day: string; minutes: number; won: boolean | null;
  /** The score from your side (migration 91; absent before it runs). */
  sets?: unknown;
}
const toSessionTag = (r: SessionTagRow): SessionTag => ({
  id: r.id, sessionId: r.session_id, taggerId: r.tagger_id, taggedId: r.tagged_id, role: r.role, status: r.status,
  ...(r.dropped ? { dropped: true } : {}),
  mirroredSessionId: r.mirrored_session_id ?? undefined, createdAt: r.created_at, respondedAt: r.responded_at ?? undefined,
  // A date column arrives as "2026-09-29"; anything longer is cut to the day.
  kind: r.kind, day: String(r.day).slice(0, 10), minutes: r.minutes, won: r.won ?? undefined,
  ...(r.kind === 'match' && validSets(r.sets) ? { sets: validSets(r.sets) } : {}),
});
/** The exact word a session-tag function raised ('teen_closed', 'too_many'…), or the message as it came. */
const tagRefusal = (error: { message?: string }) => (error.message ?? '').trim();

interface ActivityRow {
  id: string; user_id: string; source: DetectedActivity['source']; sport: string | null; started_at: string; ended_at: string; tz_offset_min: number | null; minutes: number;
  avg_hr: number | null; max_hr: number | null; kcal: number | null; strain: number | string | null; device: string | null; status: DetectedActivity['status'];
  duplicate_of: string | null; session_id: string | null; created_at: string;
  /** Minutes in heart-rate zones 1–5 (migration 65; absent before it runs). */
  hr_zones?: number[] | null;
  /** A workout's distance in metres (migration 107; absent before it runs). */
  distance_m?: number | null;
  external_id?: string | null;
}
const toActivity = (r: ActivityRow): DetectedActivity => ({
  id: r.id, userId: r.user_id, source: r.source, sport: r.sport || 'tennis', startedAt: r.started_at, endedAt: r.ended_at, tzOffsetMin: r.tz_offset_min ?? undefined, minutes: r.minutes,
  avgHr: r.avg_hr ?? undefined, maxHr: r.max_hr ?? undefined, kcal: r.kcal ?? undefined,
  // numeric(3,1) arrives as a string.
  strain: r.strain == null ? undefined : Number(r.strain),
  device: r.device ?? undefined, status: r.status, duplicateOf: r.duplicate_of ?? undefined, sessionId: r.session_id ?? undefined, createdAt: r.created_at,
  zones: r.hr_zones ?? undefined,
  ...(r.distance_m ? { distanceM: r.distance_m } : {}),
  ...(r.external_id ? { externalId: r.external_id } : {}),
});
/**
 * Your tracker sessions that ended in the last `days` (two weeks unless
 * asked), newest first. Only your own rows come back (migration 58). Room
 * for a busy fortnight of workouts as well as tennis (migration 107).
 */
const activitiesQuery = (me: ID, days = 14, limit = 150) => need().from('detected_activities').select('*').eq('user_id', me)
  .gte('ended_at', new Date(Date.now() - days * 86_400_000).toISOString()).order('started_at', { ascending: false }).limit(limit);

interface HitRow { id: string; author_id: string; starts_at: string; place: { id?: string; name?: string; lat?: number; lng?: number } | null; level_min: number | null; level_max: number | null; format: HitRequest['format']; spots: number; note: string | null; conversation_id: string | null; cancelled: boolean; created_at: string; hit_joins?: { user_id: string }[]; audience?: string | null; opens_at?: string | null; include_groups?: boolean | null; joined_count?: number | null }
const toHit = (r: HitRow): HitRequest => {
  const joinedIds = (r.hit_joins ?? []).map((j) => j.user_id);
  // How many are in that this account is not shown (migration 95's count, kept by the server); none before it.
  const hiddenJoins = typeof r.joined_count === 'number' ? Math.max(0, r.joined_count - joinedIds.length) : 0;
  return {
    id: r.id, authorId: r.author_id, startsAt: r.starts_at,
    // The court's map id when it was picked from the courts list (kept only if it is one), so the hit lands on that court's page.
    place: { id: isMapCourtId(r.place?.id) ? r.place.id : undefined, name: String(r.place?.name ?? 'A court').slice(0, 120), lat: typeof r.place?.lat === 'number' ? r.place.lat : undefined, lng: typeof r.place?.lng === 'number' ? r.place.lng : undefined },
    levelMin: r.level_min ?? undefined, levelMax: r.level_max ?? undefined, format: r.format, spots: r.spots, note: r.note ?? undefined,
    conversationId: r.conversation_id ?? undefined, cancelled: r.cancelled, createdAt: r.created_at, joinedIds,
    ...(hiddenJoins ? { hiddenJoins } : {}),
    // Who sees it first (migration 76). A database without it sends none of these: every hit is for everyone.
    ...(r.audience === 'invite_first' || r.audience === 'invite_only'
      ? { audience: r.audience, opensAt: r.opens_at ?? undefined, includeGroups: !!r.include_groups, invitedIds: [] as ID[] }
      : {}),
  };
};
/** Who was invited to which hit: the poster reads every invite to their own hit, an invited player only their own (migration 76). Nothing without it. */
const hitInvitesQuery = () => need().from('hit_invites').select('hit_id, user_id').order('created_at', { ascending: true }).limit(1000);
const withInvites = (hits: HitRequest[], rows: { hit_id: string; user_id: string }[] | null | undefined): HitRequest[] => {
  if (!rows?.length) return hits;
  const by = new Map<string, ID[]>();
  for (const r of rows) by.set(r.hit_id, [...(by.get(r.hit_id) ?? []), r.user_id]);
  return hits.map((h) => (h.audience && by.has(h.id) ? { ...h, invitedIds: by.get(h.id) } : h));
};

interface TipRow { id: string; user_id: string; body: string; created_at: string; votes: number | null; voted_by: Record<string, 1 | -1> | null }
const toTip = (r: TipRow): Tip => ({ id: r.id, authorId: r.user_id, body: r.body, createdAt: r.created_at, votes: r.votes ?? 0, votedBy: r.voted_by ?? {} });

export interface UserState {
  mutedIds: ID[]; blockedIds: ID[]; savedQuestionIds: ID[]; paymentMethods: PaymentMethod[]; defaultPaymentId: ID | null;
  showActivity: boolean; pushLikes: boolean; pushCoach: boolean;
  /** The "Message alerts" switch (migration 54). Undefined on a database without it, which means on. */
  pushMessages?: boolean;
  /** The "Tennis sessions" alert switch (migration 58). Undefined on a database without it, which means on. */
  pushActivity?: boolean;
  /** The four map alert switches (migration 60). Undefined on a database without them, which means on. */
  pushMapFriends?: boolean; pushMapHits?: boolean; pushMapPlayers?: boolean; pushCourts?: boolean;
  /** "Let people find me from their contacts" (migration 89). Undefined on a database without it, which means on. */
  contactsFindable?: boolean;
  /** The weekly recap's phone alert (migration 130). Undefined on a database without it, which means on. */
  pushRecap?: boolean;
  /** "Players joining near you" and "Streak reminders" (migration 146). Undefined on a database without them: the phone's own choice stands. */
  pushJoined?: boolean; pushStreak?: boolean;
  /** What the coach works around (injuries, schedule, gear): kept in this private row, never on the public profile. Undefined on a database without migration 19. */
  constraints?: PlayerProfile['constraints'];
  /**
   * Who can see you on the map (migration 63). Undefined on a database
   * without it; null once it has it but you never chose (the app asks
   * "Who can see you on the map?").
   */
  mapVisibility?: MapVisibility | null;
  /**
   * The map's teen rule (migration 78): undefined on a database without it.
   * 'on': you may share with friends who follow you back (if you are not a
   * known adult). Since migration 119 that includes under 16s, the same
   * rule as 16 and 17 year olds.
   */
  teenMap?: 'on';
  /** Your own "up for a hit today" when it is kept privately (not a known adult; migration 78). */
  ownOpenUntil?: string | null;
}

/* Courts, migration 60: players' facts, follows, right now, rings. */
const DAY_PARTS: CourtDayPart[] = ['weekday-morning', 'weekday-afternoon', 'weekday-evening', 'weekend-morning', 'weekend-afternoon', 'weekend-evening'];
const NOW_WORDS: CourtNow[] = ['free', 'wait', 'full', 'wet', 'locked'];
const ACCESS_WORDS: CourtAccess[] = ['public', 'members', 'pay', 'private', 'unknown'];
const asAccess = (v: unknown): CourtAccess => (ACCESS_WORDS.includes(v as CourtAccess) ? (v as CourtAccess) : 'unknown');
const asNow = (v: unknown): CourtNow | undefined => (NOW_WORDS.includes(v as CourtNow) ? (v as CourtNow) : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
interface CourtFactsRow {
  court_id: string; players: number; lights_yes: number; lights_no: number; nets_good: number; nets_bad: number;
  surface_good: number; surface_cracked: number; surface_wet: number; busy: Record<string, number> | null; busy_answers: number; busy_never?: number | null;
  notes: { text: string; on: string }[] | null; access: string | null; access_by: string | null; fee: boolean | null; indoor: boolean | null; book_url: string | null; updated_at: string | null;
}
const toCourtFacts = (r: CourtFactsRow): CourtFacts => ({
  courtId: r.court_id, access: asAccess(r.access),
  ...(r.access_by === 'map' || r.access_by === 'players' || r.access_by === 'admin' ? { accessBy: r.access_by as CourtAccessSource } : {}),
  ...(typeof r.fee === 'boolean' ? { fee: r.fee } : {}), ...(typeof r.indoor === 'boolean' ? { indoor: r.indoor } : {}),
  ...(r.book_url ? { bookUrl: r.book_url } : {}),
  players: num(r.players),
  lights: { yes: num(r.lights_yes), no: num(r.lights_no) },
  nets: { good: num(r.nets_good), bad: num(r.nets_bad) },
  surface: { good: num(r.surface_good), cracked: num(r.surface_cracked), wetProne: num(r.surface_wet) },
  busy: Object.fromEntries(Object.entries(r.busy ?? {}).filter(([k]) => DAY_PARTS.includes(k as CourtDayPart)).map(([k, v]) => [k, num(v)])),
  busyAnswers: num(r.busy_answers),
  busyNever: num(r.busy_never ?? 0),
  notes: (r.notes ?? []).filter((n) => typeof n?.text === 'string').map((n) => ({ text: n.text, on: String(n.on) })),
  ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
});
interface CourtReviewRow { court_id: string; lights: boolean | null; nets: string | null; surface: string | null; busy: string[] | null; access: string | null; notes: string | null; from_hit: string | null; updated_at: string }
const toCourtReview = (r: CourtReviewRow): CourtReview => ({
  courtId: r.court_id,
  ...(typeof r.lights === 'boolean' ? { lights: r.lights } : {}),
  ...(r.nets === 'good' || r.nets === 'bad' ? { nets: r.nets } : {}),
  ...(r.surface === 'good' || r.surface === 'cracked' || r.surface === 'wet-prone' ? { surface: r.surface } : {}),
  ...(Array.isArray(r.busy) ? { busy: r.busy.filter((b): b is CourtDayPart => DAY_PARTS.includes(b as CourtDayPart)) } : {}),
  ...(r.access && r.access !== 'unknown' && ACCESS_WORDS.includes(r.access as CourtAccess) ? { access: r.access as Exclude<CourtAccess, 'unknown'> } : {}),
  ...(r.notes ? { notes: r.notes } : {}),
  ...(r.from_hit ? { fromHit: r.from_hit } : {}),
  updatedAt: r.updated_at,
});
interface QuestionRow extends RemovedColumns { id: string; author_id: string; title: string; body: string; topic: string; tags: string[]; votes: number; voted_by: Record<string, 1 | -1>; accepted_answer_id: string | null; edited_at: string | null; created_at: string }
interface AnswerRow extends RemovedColumns { id: string; question_id: string; author_id: string; parent_answer_id: string | null; body: string; votes: number; voted_by: Record<string, 1 | -1>; from_coach: boolean; created_at: string; media_url?: string | null; media_kind?: 'photo' | 'video' | null; media_thumb?: string | null }
interface CoachQuestionRow extends RemovedColumns { id: string; author_id: string; title: string; body: string; specialty: string; video_url: string | null; media_label: string | null; resolved: boolean; created_at: string }
interface CoachReplyRow extends RemovedColumns { id: string; question_id: string; coach_user_id: string; body: string; helpful_by: string[]; created_at: string }
interface CoachingRequestRow {
  id: string; coach_id: string; user_id: string; service_id: string; question: string; video_label: string | null; status: string; response: string | null; responded_at: string | null; created_at: string;
  /** Migration 35. */
  coach_user_id?: string | null; price_cents?: number | null; fee_cents?: number | null; paid_at?: string | null; due_at?: string | null; refunded_at?: string | null; video_url?: string | null;
}
/** The listing columns anyone may read (the Stripe account number is not one of them). */
const COACH_COLUMNS = 'id, user_id, headline, credentials, specialties, years_coaching, response_time_hours, verified, listed, payouts_ready, payouts_started, rating_avg, rating_count, created_at';
interface CoachRow {
  id: string; user_id: string; headline: string; credentials: string[] | null; specialties: string[] | null; years_coaching: number; response_time_hours: number;
  verified: boolean; listed: boolean; payouts_ready: boolean; payouts_started: boolean; rating_avg: number | string; rating_count: number; created_at: string;
}
interface CoachServiceRow { id: string; coach_id: string; title: string; description: string; price_cents: number; turnaround_hours: number; kind: string; active: boolean; position: number }
interface CoachReviewRow { id: string; coach_id: string; author_id: string; rating: number; body: string; created_at: string }
interface CoachResultRow { id: string; coach_id: string; client_name: string; focus: string; before: string; after: string; weeks: number; note: string | null; created_at: string }
const toService = (r: CoachServiceRow): CoachService & { active: boolean } => ({
  id: r.id, title: r.title, description: r.description ?? '', priceCents: r.price_cents, turnaroundHours: r.turnaround_hours,
  kind: (['video-review', 'written-qa', 'live-session', 'plan'].includes(r.kind) ? r.kind : 'written-qa') as CoachService['kind'], active: r.active,
});
const toCoach = (r: CoachRow, services: CoachServiceRow[], me: ID): Coach => ({
  id: r.id, userId: r.user_id, headline: r.headline, credentials: r.credentials ?? [], specialties: (r.specialties ?? []) as CoachSpecialty[],
  yearsCoaching: r.years_coaching, responseTimeHours: r.response_time_hours, verified: r.verified,
  ratingAvg: Number(r.rating_avg) || 0, ratingCount: r.rating_count,
  // A coach sees all their own services, switched off ones included; everyone else only the ones on offer.
  services: services.filter((s) => s.coach_id === r.id && (s.active || r.user_id === me)).sort((a, b) => a.position - b.position).map(toService),
  listed: r.listed, payoutsReady: r.payouts_ready, payoutsStarted: r.payouts_started,
});
/** One pin from map_players (migration 63; `mutual` since 98). */
interface MapPlayerRow { user_id: ID; lat: number; lng: number; place: MapPlace | string; court_id: string | null; court_name: string | null; city: string | null; seen_at: string | null; open_until: string | null; mutual?: boolean | null }
interface NotificationRow { id: string; user_id: string; actor_id: string; kind: string; target_id: string; target_kind: string; preview: string | null; read: boolean; created_at: string }
interface UserStateRow { muted_ids: string[]; blocked_ids: string[]; saved_question_ids: string[]; payment_methods: PaymentMethod[]; default_payment_id: string | null; show_activity: boolean; push_likes: boolean; push_coach: boolean; push_messages?: boolean | null; push_activity?: boolean | null; push_map_friends?: boolean | null; push_map_hits?: boolean | null; push_map_players?: boolean | null; push_courts?: boolean | null; contacts_findable?: boolean | null; push_recap?: boolean | null; push_joined?: boolean | null; push_streak?: boolean | null; private_profile?: { constraints?: PlayerProfile['constraints']; tournaments?: unknown } | null; map_visibility?: string | null;
  /** Your own age group, readable only by you (migration 64). Absent before it. */
  age_group?: string | null;
  /** Your birthday, readable only by you (migration 13). */
  birth_date?: string | null;
  /** When you (not a known adult) answered who can see you on the map, and your private ring (migration 78). Absent before it. */
  map_answered_at?: string | null; open_to_hit_until?: string | null;
  /** How far you'd like to go for a hit (migration 120): 5, 10 or 25; null for any. Absent before it. */
  open_to_hit_miles?: number | null }

interface PollRow { question_id: string; options: string[]; counts: number[] | null }
/** Each thread's poll, with the totals and your own vote, laid onto the threads. */
function withPolls(questions: Question[], polls: PollRow[], mine: { question_id: string; option: number }[]): Question[] {
  if (!polls.length) return questions;
  const byThread = new Map(polls.map((p) => [p.question_id, p]));
  const myVote = new Map(mine.map((v) => [v.question_id, v.option]));
  return questions.map((q) => {
    const p = byThread.get(q.id);
    return p ? { ...q, poll: { options: p.options, counts: (p.counts ?? []).slice(0, p.options.length), myVote: myVote.get(q.id) } } : q;
  });
}
/** The topics the app draws. A row with any other (written around the app) reads as Technique, never a crash. */
const QUESTION_TOPICS: ReadonlySet<string> = new Set<Question['topic']>(['gear', 'technique', 'strategy', 'injury', 'fitness', 'rules', 'mental']);
const toQuestion = (r: QuestionRow, answers: AnswerRow[]): Question => withRemoved<Question>({
  id: r.id, authorId: r.author_id, title: r.title, body: r.body, topic: QUESTION_TOPICS.has(r.topic) ? r.topic as Question['topic'] : 'technique', tags: r.tags ?? [],
  createdAt: r.created_at, votes: r.votes, votedBy: r.voted_by ?? {}, answerIds: answers.filter((a) => a.question_id === r.id && !heldHere(a.id, a.parent_answer_id)).map((a) => a.id),
  acceptedAnswerId: r.accepted_answer_id ?? undefined, editedAt: r.edited_at ?? undefined,
}, r);
const toAnswer = (r: AnswerRow): Answer => withHidden(withRemoved<Answer>({
  id: r.id, questionId: r.question_id, authorId: r.author_id, parentAnswerId: r.parent_answer_id ?? undefined, body: r.body,
  createdAt: r.created_at, votes: r.votes, votedBy: r.voted_by ?? {}, fromCoach: r.from_coach,
  media: r.media_url && r.media_kind ? { kind: r.media_kind, url: r.media_url, thumb: r.media_thumb ?? undefined } : undefined,
}, r), r.id);
const toCoachQuestion = (r: CoachQuestionRow, replies: CoachReplyRow[]): CoachQuestion => withRemoved<CoachQuestion>({
  id: r.id, authorId: r.author_id, title: r.title, body: r.body, specialty: r.specialty as CoachQuestion['specialty'], createdAt: r.created_at,
  videoUrl: r.video_url ?? undefined, mediaLabel: r.media_label ?? undefined, resolved: r.resolved,
  // One your Hidden words hid is not counted for you, the asker (the Coaching tab says "Awaiting a coach" until you unhide it).
  replyIds: replies.filter((x) => x.question_id === r.id && !heldHere(x.id)).map((x) => x.id),
}, r);
const toCoachReply = (r: CoachReplyRow): CoachReply => withHidden(withRemoved<CoachReply>({ id: r.id, questionId: r.question_id, coachUserId: r.coach_user_id, body: r.body, createdAt: r.created_at, helpfulBy: r.helpful_by ?? [] }, r), r.id);
const toCoachingRequest = (r: CoachingRequestRow): CoachingRequest => ({
  id: r.id, coachId: r.coach_id, userId: r.user_id, serviceId: r.service_id, question: r.question, videoLabel: r.video_label ?? undefined,
  status: r.status as CoachingRequest['status'], createdAt: r.created_at, response: r.response ?? undefined, respondedAt: r.responded_at ?? undefined,
  coachUserId: r.coach_user_id ?? undefined, priceCents: r.price_cents ?? undefined, feeCents: r.fee_cents ?? undefined, paidAt: r.paid_at ?? undefined,
  dueAt: r.due_at ?? undefined, refundedAt: r.refunded_at ?? undefined, videoUrl: r.video_url ?? undefined,
});
const toNotification = (r: NotificationRow): Notification => ({
  id: r.id, userId: r.user_id, actorId: r.actor_id, kind: r.kind as Notification['kind'], targetId: r.target_id, targetKind: r.target_kind as Notification['targetKind'],
  createdAt: r.created_at, read: r.read, preview: r.preview ?? undefined,
});
const toUserState = (r: UserStateRow): UserState => ({
  mutedIds: r.muted_ids ?? [], blockedIds: r.blocked_ids ?? [], savedQuestionIds: r.saved_question_ids ?? [], paymentMethods: r.payment_methods ?? [],
  defaultPaymentId: r.default_payment_id, showActivity: r.show_activity, pushLikes: r.push_likes, pushCoach: r.push_coach,
  pushMessages: typeof r.push_messages === 'boolean' ? r.push_messages : undefined,
  pushActivity: typeof r.push_activity === 'boolean' ? r.push_activity : undefined,
  pushMapFriends: typeof r.push_map_friends === 'boolean' ? r.push_map_friends : undefined,
  pushMapHits: typeof r.push_map_hits === 'boolean' ? r.push_map_hits : undefined,
  pushMapPlayers: typeof r.push_map_players === 'boolean' ? r.push_map_players : undefined,
  pushCourts: typeof r.push_courts === 'boolean' ? r.push_courts : undefined,
  contactsFindable: typeof r.contacts_findable === 'boolean' ? r.contacts_findable : undefined,
  pushRecap: typeof r.push_recap === 'boolean' ? r.push_recap : undefined,
  pushJoined: typeof r.push_joined === 'boolean' ? r.push_joined : undefined,
  pushStreak: typeof r.push_streak === 'boolean' ? r.push_streak : undefined,
  constraints: Array.isArray(r.private_profile?.constraints) ? r.private_profile!.constraints : undefined,
  // The key is there only once migration 63 has run; null means never chosen.
  mapVisibility: 'map_visibility' in r ? asVisibility(r.map_visibility) : undefined,
  // The key is there only once migration 78 has run. Under 16s too (migration 119): the same rule as 16 and 17 year olds.
  teenMap: 'map_answered_at' in r ? 'on' : undefined,
  ownOpenUntil: 'open_to_hit_until' in r ? r.open_to_hit_until ?? null : undefined,
});
const asVisibility = (v: unknown): MapVisibility | null => (v === 'nearby' || v === 'mutuals' || v === 'none' ? v : null);

interface CoachApplicationRow {
  id: string; user_id: string; full_name: string; email: string; phone: string; utr: string | null; ntrp: string | null; utr_link?: string | null; ntrp_link?: string | null;
  years_coaching: number; certifications: string; resume_name: string | null; current_clients: string; specialties: string[] | null;
  reference_contacts: string; about: string; status: string; created_at: string; resume_path?: string | null; review_note?: string | null;
}
const toCoachApplication = (r: CoachApplicationRow): CoachApplication => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, email: r.email, phone: r.phone, utr: r.utr ?? undefined, ntrp: r.ntrp ?? undefined,
  utrLink: r.utr_link ?? undefined, ntrpLink: r.ntrp_link ?? undefined,
  yearsCoaching: r.years_coaching, certifications: r.certifications, resumeLabel: r.resume_name ?? undefined, currentClients: r.current_clients,
  specialties: (r.specialties ?? []) as CoachApplication['specialties'], references: r.reference_contacts, about: r.about,
  status: (['submitted', 'in-review', 'approved', 'rejected'].includes(r.status) ? r.status : 'submitted') as CoachApplication['status'], createdAt: r.created_at,
  resumePath: r.resume_path ?? undefined, reviewNote: r.review_note ?? undefined,
});

/** A chat member's row. `role` came with migration 54 (admin or member); a database without it leaves it out. */
interface MemberRow { user_id: string; last_read_at: string | null; role?: string | null; read_receipts?: boolean | null }
interface ConversationRow { id: string; updated_at: string; title?: string | null; is_group?: boolean | null; created_by?: string | null; photo_url?: string | null; conversation_members?: MemberRow[]; messages?: MessageRow[] }
interface MessageRow { id: string; conversation_id: string; sender_id: string; body: string; kind: string; shared_id: string | null; reactions: Record<string, string> | null; created_at: string; edited_at?: string | null; place?: { id?: string; name: string; lat: number; lng: number; count?: unknown } | null; audio_url?: string | null; audio_ms?: number | null; event?: { type?: string; targets?: unknown; title?: string | null; on?: boolean | null; hit?: unknown } | null; photos?: unknown; reply_to_id?: string | null }

/**
 * A photo message's photos as the server keeps them ([{path, w, h}], migration
 * 61), in the app's shape. Anything malformed is left out; a message with
 * none left reads as having no photos.
 */
function toChatPhotos(raw: unknown): ChatPhoto[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.flatMap((p): ChatPhoto[] => {
    if (!p || typeof p !== 'object') return [];
    const { path, w, h } = p as { path?: unknown; w?: unknown; h?: unknown };
    if (typeof path !== 'string' || !path || typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) return [];
    return [{ path, w, h }];
  });
  return out.length ? out.slice(0, 10) : undefined;
}

const EVENT_TYPES: ChatEvent['type'][] = ['created', 'added', 'removed', 'left', 'renamed', 'photo', 'admin', 'joined', 'called-off'];
/** An event line's `event` as the server wrote it ({type, targets, title, on}, and `hit` on a called-off hit's line), in the app's shape. Anything unexpected is left out, and the line shows its plain sentence. */
function toChatEvent(raw: MessageRow['event']): ChatEvent | undefined {
  if (!raw || typeof raw !== 'object' || !EVENT_TYPES.includes(raw.type as ChatEvent['type'])) return undefined;
  const targets = Array.isArray(raw.targets) ? raw.targets.filter((t): t is string => typeof t === 'string') : [];
  return {
    type: raw.type as ChatEvent['type'],
    targetIds: targets.length ? targets : undefined,
    title: typeof raw.title === 'string' && raw.title ? raw.title : undefined,
    on: typeof raw.on === 'boolean' ? raw.on : undefined,
    hitId: typeof raw.hit === 'string' && raw.hit ? raw.hit : undefined,
  };
}

/**
 * Conversations and messages as the app holds them: who has read what comes
 * from each member's last_read_at, and `mutedUntil` (your own chat settings,
 * by chat id) says which chats you muted. Event lines ("Mira added Dev") are
 * never unread and never "read by" anyone.
 */
export function toConversations(me: ID, convRows: ConversationRow[], messageRows: MessageRow[], prefs?: Map<ID, ChatPrefs>, heldIds?: Set<ID>): { conversations: Conversation[]; messages: Message[] } {
  const readAt = new Map<string, Map<string, string>>();
  for (const c of convRows) {
    const at = new Map((c.conversation_members ?? []).filter((m) => m.last_read_at).map((m) => [m.user_id, m.last_read_at as string]));
    // How far you really read: with read receipts off, the server keeps it in your own chat settings (migration 141).
    const own = prefs?.get(c.id)?.readAt;
    if (own && own > (at.get(me) ?? '')) at.set(me, own);
    readAt.set(c.id, at);
  }
  const messages: Message[] = messageRows.map((row) => {
    const system = row.kind === 'system';
    const readers = system ? undefined : readAt.get(row.conversation_id);
    const readAtBy: Record<string, string> = {};
    if (readers) for (const [user, at] of readers) if (user !== row.sender_id && at >= row.created_at) readAtBy[user] = at;
    return {
      id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at,
      kind: (row.kind as Message['kind']) || 'text', sharedId: row.shared_id ?? undefined,
      event: system ? toChatEvent(row.event) : undefined,
      reactions: row.reactions && Object.keys(row.reactions).length ? row.reactions : undefined,
      editedAt: row.edited_at ?? undefined,
      audio: row.audio_url ? { url: row.audio_url, ms: row.audio_ms ?? 0 } : undefined,
      place: row.place && typeof row.place.lat === 'number' && typeof row.place.lng === 'number' ? {
        id: isMapCourtId(row.place.id) ? row.place.id : undefined, name: String(row.place.name ?? 'Court').slice(0, 80), lat: row.place.lat, lng: row.place.lng,
        // How many courts stand there, when the sender's list knew it (newer builds send it).
        count: typeof row.place.count === 'number' && row.place.count >= 1 && row.place.count < 100 ? Math.round(row.place.count) : undefined,
      } : undefined,
      photos: row.kind === 'photo' ? toChatPhotos(row.photos) : undefined,
      replyToId: row.reply_to_id ?? undefined,
      readAtBy: Object.keys(readAtBy).length ? readAtBy : undefined,
      openedAtBy: Object.keys(readAtBy).length ? readAtBy : undefined,
    };
  });
  const conversations: Conversation[] = convRows.map((c) => {
    const mine = messages.filter((m) => m.conversationId === c.id);
    const myRead = readAt.get(c.id)?.get(me) ?? '';
    const members = c.conversation_members ?? [];
    const admins = members.filter((m) => m.role === 'admin').map((m) => m.user_id);
    // A database with roles (migration 54) always has an admin in a group;
    // without roles the list stays unknown rather than empty.
    const hasRoles = members.some((m) => typeof m.role === 'string');
    const pref = prefs?.get(c.id);
    const muted = pref?.mutedUntil;
    return {
      id: c.id,
      participantIds: members.map((m) => m.user_id),
      isGroup: c.is_group ?? undefined,
      title: c.title ?? undefined,
      createdBy: c.created_by ?? undefined,
      adminIds: hasRoles && c.is_group ? admins : undefined,
      receiptsOffIds: members.some((m) => m.read_receipts === false) ? members.filter((m) => m.read_receipts === false).map((m) => m.user_id) : undefined,
      photoUrl: c.photo_url ?? undefined,
      mutedUntil: muted && Date.parse(muted) > Date.now() ? muted : undefined,
      pinnedAt: pref?.pinnedAt,
      markedUnread: pref?.markedUnread || undefined,
      hiddenAt: pref?.hiddenAt,
      messageIds: mine.map((m) => m.id),
      updatedAt: c.updated_at,
      // Never one your Hidden words hid (migration 117): like Instagram's hidden requests, it raises no badge.
      unreadCount: mine.filter((m) => m.senderId !== me && m.kind !== 'system' && m.createdAt > myRead && !heldIds?.has(m.id)).length,
    };
  });
  return { conversations, messages };
}

/**
 * The columns asked for each chat member. `role` came with migration 54; a
 * database without it refuses the whole ask, so the chats are asked for
 * again without it (and still load).
 */
const MEMBERS_NOW = 'conversation_members(user_id, last_read_at, role, read_receipts)';
const MEMBERS_BEFORE_141 = 'conversation_members(user_id, last_read_at, role)';
const MEMBERS_BEFORE_54 = 'conversation_members(user_id, last_read_at)';

/** Your own settings for one chat: mute (migration 54), and pin, mark unread and delete from the inbox (migration 75). */
export interface ChatPrefs { mutedUntil?: string; pinnedAt?: string; markedUnread?: boolean; hiddenAt?: string; readAt?: string }

/**
 * Your own chat settings, by chat id. The rows are asked for whole (`*`),
 * so a database without migration 75 simply has no pins, marks or deletes;
 * one without 54 gives no rows at all.
 */
function toMutes(rows: unknown): Map<ID, ChatPrefs> {
  const out = new Map<ID, ChatPrefs>();
  const at = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  for (const r of (Array.isArray(rows) ? rows : []) as { conversation_id?: string; muted_until?: string | null; pinned_at?: string | null; marked_unread?: boolean | null; hidden_at?: string | null; read_at?: string | null }[]) {
    if (!r.conversation_id) continue;
    const pref: ChatPrefs = { mutedUntil: at(r.muted_until), pinnedAt: at(r.pinned_at), markedUnread: r.marked_unread === true || undefined, hiddenAt: at(r.hidden_at), readAt: at(r.read_at) };
    if (pref.mutedUntil || pref.pinnedAt || pref.markedUnread || pref.hiddenAt || pref.readAt) out.set(r.conversation_id, pref);
  }
  return out;
}

type Edge = { follower_id: string; following_id: string };
interface ReportRow { id: string; reporter_id: string | null; target_user_id: string | null; target: string | null; reason: string | null; created_at: string; status?: string | null; reviewed_at?: string | null }
/** A report as the admin's Reports screen shows it. */
/** Someone who asked for early access on the waitlist page. */
export interface WaitlistEntry { id: string; email: string; name?: string; source?: string; referredBy?: string; createdAt: string }
/** A note from the waitlist page's feedback box. */
export interface SiteFeedback { id: string; message: string; email?: string; createdAt: string }
/** Where the beta invite email stands: live once Apple has approved the beta. */
export interface BetaInviteStatus { live: boolean; total: number; invited: number; waiting: number; sent: number; failed: string[] }

/** The kinds of thing a report can be about, besides an account or a chat ('hit-request': an open hit on Find Players, since migration 126; 'tip': the tips board, since 128). */
export type ReportedItemKind = 'post' | 'hit' | 'hit-request' | 'question' | 'answer' | 'comment' | 'coach-question' | 'coach-reply' | 'tip';
const ITEM_KINDS: ReportedItemKind[] = ['post', 'hit', 'hit-request', 'question', 'answer', 'comment', 'coach-question', 'coach-reply', 'tip'];

/**
 * Reports about something the admin's card can't load by itself (Oct 6): a
 * group, a coach's page, a review of a coach, and a court note, which is
 * never named. Each card shows whose it is (when known) and the words the
 * report carried (a group's name, a review's or note's words).
 */
export type ReportedOtherKind = 'group' | 'coach' | 'coach-review' | 'court-note';
const OTHER_KINDS: ReportedOtherKind[] = ['group', 'coach', 'coach-review', 'court-note'];

export interface AdminReport {
  id: ID;
  /** Who sent it; gone when they have since deleted their account (the report stays, migration 115). */
  reporterId?: ID;
  /** The account the report is about. */
  userId?: ID;
  /** What was reported: a post, a hit, a thread, a reply, a comment, a coach question or reply, an account, a chat, a group, a coach's page or review, or a court note. */
  kind: ReportedItemKind | ReportedOtherKind | 'profile' | 'conversation' | 'ai-coach';
  targetId?: ID;
  /** One message in a reported chat ("Report" on a message). */
  messageId?: ID;
  reason?: string;
  createdAt: string;
  status: 'open' | 'removed' | 'suspended' | 'dismissed';
  reviewedAt?: string;
}

/**
 * A copy of one message of a reported chat, kept for the admin (migration
 * 115): as it was when reported, or the version before it was unsent,
 * edited, removed or deleted with an account.
 */
export interface ReportEvidence {
  messageId?: ID;
  senderId?: ID;
  kind: string;
  body: string;
  photos?: ChatPhoto[];
  sentAt?: string;
  why: 'reported' | 'unsent' | 'edited' | 'removed' | 'deleted';
}

/** A reported chat as an admin sees it (report_chat_context, migration 54): its name, who is in it, and its last messages, oldest first. */
export interface ReportedChat {
  title?: string;
  isGroup: boolean;
  memberIds: ID[];
  /** `id` and `photos` came with migration 61 (a photo message's photos, which admins may open for a reported chat). */
  messages: { id?: ID; senderId: ID; body: string; kind: string; createdAt: string; photos?: ChatPhoto[] }[];
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** blocked_me()'s rows: plain ids, or ({ blocked_me: id }) from an older gateway. Anything else is dropped. */
const blockedMeIdsOf = (rows: unknown[]): ID[] =>
  rows.flatMap((row) => {
    const id = typeof row === 'string' ? row : row && typeof row === 'object' ? (row as { blocked_me?: unknown }).blocked_me : undefined;
    return typeof id === 'string' && UUID_RE.test(id) ? [id] : [];
  });
/**
 * The profile columns the app reads for everyone. Named rather than "*" so
 * nobody's town position (city_lat, city_lng) comes down with the list: the
 * app only ever uses your own, which comes from my_city_at() (migration
 * 118). Migration 121 then takes those two columns away from everyone else
 * altogether; after it, a read of "*" is refused. A column added to
 * profiles later has to be granted to signed-in readers and named here.
 */
const PROFILE_COLUMNS = 'id, handle, name, bio, location, avatar_url, is_coach, profile, created_at, is_private, read_receipts, followers_count, following_count, is_admin, suspended_at, open_to_hit_until, handle_changed_at';
/** Postgres's "column … does not exist": a database older than one of the columns named above. */
const missingColumn = (error: unknown) => !!error && typeof error === 'object' && (error as { code?: string }).code === '42703';
/**
 * Set once this session finds a function missing (a database before
 * migration 118), so it is not asked again on every load: each ask of a
 * missing function shows as a failed request in a browser's console.
 */
const missingThisSession = new Set<string>();
/**
 * Set once tournament_plans() (migration 123) has answered this session:
 * tournament plans live in each owner's settings row now, so a save of your
 * tennis profile says it knows (see updateProfile).
 */
let tournamentsPrivateLive = false;
const SURFACES: readonly SurfacePreference[] = ['hard', 'clay', 'grass', 'indoor'];
/** Tournament plans as stored (a profile bundle, a settings row, tournament_plans): only well-formed ones, at most 20. */
function tournamentsOf(raw: unknown): TournamentEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): TournamentEntry[] => {
    if (!item || typeof item !== 'object') return [];
    const t = item as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.startsAt !== 'string') return [];
    const surface = SURFACES.find((x) => x === t.surface) ?? 'hard';
    return [{ id: t.id, name: t.name, startsAt: t.startsAt, surface, level: typeof t.level === 'string' ? t.level : '', location: typeof t.location === 'string' ? t.location : '', registered: t.registered === true }];
  }).slice(0, 20);
}
/**
 * tournament_plans() (migration 123): the plans you may see, yours and those
 * of each person you follow who follows you back, by person. Undefined on a
 * database without it (or when it could not be asked): then the profile rows
 * still carry everyone's, and the app shows only the same people's.
 */
async function fetchPlans(): Promise<Map<ID, TournamentEntry[]> | undefined> {
  if (missingThisSession.has('tournament_plans')) return undefined;
  try {
    const { data, error } = await need().rpc('tournament_plans');
    if (error) {
      if (missingFunction(error)) missingThisSession.add('tournament_plans');
      return undefined;
    }
    tournamentsPrivateLive = true;
    const plans = new Map<ID, TournamentEntry[]>();
    for (const row of Array.isArray(data) ? data as { user_id?: unknown; tournaments?: unknown }[] : []) {
      if (typeof row?.user_id === 'string') plans.set(row.user_id, tournamentsOf(row.tournaments));
    }
    return plans;
  } catch {
    return undefined;
  }
}
/**
 * player_streaks (migration 134): each streak of 3 days or more whose last
 * day is recent enough that it may still be running somewhere, by person.
 * Only the number and that day: the sessions and posts behind it stay with
 * their owner. The database leaves out private accounts you do not follow
 * and anyone you are blocked with. Undefined on a database without it (or
 * when it could not be read): then nobody else's flame shows.
 */
async function fetchStreaks(): Promise<Map<ID, PublicStreak> | undefined> {
  if (missingThisSession.has('player_streaks')) return undefined;
  try {
    // Two days back, in UTC: wide enough for yesterday on any phone's clock; each phone then applies its own today.
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await allRows<{ user_id: string; days: number; through_day: string | null }>((from, to) =>
      need().from('player_streaks').select('user_id, days, through_day').gte('days', STREAK_FLAME_FROM).gte('through_day', since).range(from, to), 5000);
    if (error) {
      if (missingTable(error as { code?: string; message: string })) missingThisSession.add('player_streaks');
      return undefined;
    }
    const streaks = new Map<ID, PublicStreak>();
    for (const row of data) {
      if (typeof row?.user_id === 'string' && typeof row.days === 'number' && typeof row.through_day === 'string') {
        streaks.set(row.user_id, { days: row.days, through: row.through_day.slice(0, 10) });
      }
    }
    return streaks;
  } catch {
    return undefined;
  }
}
/** A player with the streak they put up, when there is one. */
const withStreak = (user: User, streaks: Map<ID, PublicStreak> | undefined): User => {
  const streak = streaks?.get(user.id);
  return streak ? { ...user, streak } : user;
};
/**
 * Every row of a read, fetched 1,000 at a time (the most the database hands
 * back at once) until there are no more, up to `cap` rows.
 */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 20000): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) return { data: out, error };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return { data: out, error: null };
}

/** The open-hits list: the first this many by start time, anywhere. */
const HITS_CAP = 100;
/**
 * A full open-hits list can cut off your own hits further ahead (and ones you
 * joined or were invited to): those are asked for on their own and added, so
 * they never drop off Find Players, the map or Your hit.
 */
async function withMyHits(hits: HitRequest[], me: ID | null | undefined): Promise<HitRequest[]> {
  if (hits.length < HITS_CAP || !me || !UUID_RE.test(me)) return hits;
  try {
    const db = need();
    const [joined, invited] = await Promise.all([
      db.from('hit_joins').select('hit_id').eq('user_id', me).gte('created_at', new Date(Date.now() - 32 * 86_400_000).toISOString()).limit(100),
      db.from('hit_invites').select('hit_id').eq('user_id', me).limit(100),
    ]);
    const ids = [...new Set([...((joined.data ?? []) as { hit_id: string }[]), ...((invited.error ? [] : invited.data ?? []) as { hit_id: string }[])].map((r) => r.hit_id))].filter((id) => UUID_RE.test(id));
    const base = db.from('hit_requests').select('*, hit_joins(user_id)').eq('cancelled', false).gte('starts_at', new Date(Date.now() - 3_600_000).toISOString());
    const { data, error } = await (ids.length ? base.or(`author_id.eq.${me},id.in.(${ids.join(',')})`) : base.eq('author_id', me)).order('starts_at', { ascending: true }).limit(100);
    if (error || !data?.length) return hits;
    const have = new Set(hits.map((h) => h.id));
    const extra = (data as HitRow[]).map(toHit).filter((h) => !have.has(h.id));
    return extra.length ? [...hits, ...extra].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : hits;
  } catch {
    return hits;
  }
}

/** How many messages of a chat come at a time: on open, and each time you scroll up for more. */
export const MESSAGE_PAGE = 40;

/** Everything the signed-in player needs on open, in four queries. */
export async function fetchRemote(me: ID): Promise<RemoteData> {
  const db = need();
  // Hits are asked for with their likes and comments; on a database that has
  // not had those tables added yet the request is refused, so it falls back
  // to the plain shape rather than taking the whole load down with it — that
  // is what left people re-doing the quiz: their profile never arrived.
  const storiesFull = db.from('stories').select('*, story_views(user_id), story_likes(user_id), story_comments(*, story_comment_likes(user_id))').order('created_at', { ascending: false }).limit(40);
  const storiesPlain = () => db.from('stories').select('*, story_views(user_id)').order('created_at', { ascending: false }).limit(40);
  // Coaches load alongside everything else rather than after it: one round
  // trip to the server fewer on every open. A failure just means no coaches.
  const coachingLoad = fetchCoaching(me).catch(() => ({ coaches: [], coachReviews: [], coachResults: [] }));
  // Direct messages: every chat, each with only its newest messages (older
  // ones load as you scroll up in the chat), the way Instagram does it. A
  // database without the tables yet just gives none; one without each
  // member's role (migration 54) is asked again without it.
  const chatList = (members: string) => db.from('conversations').select(`*, ${members}, messages(*)`)
    .order('updated_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(MESSAGE_PAGE, { referencedTable: 'messages' });
  const chatsLoad = (async () => {
    const now = await chatList(MEMBERS_NOW);
    if (!now.error) return now;
    const before141 = await chatList(MEMBERS_BEFORE_141);
    return before141.error ? chatList(MEMBERS_BEFORE_54) : before141;
  })();
  // Whether this server tags players on sessions (migration 62), asked alongside
  // everything else so it is known before any post is read: until it is, the
  // names on posts' session stats are not shown (see trustedSession).
  const tagsProbe = db.from('session_tags').select('id').limit(0).then(({ error }) => readinessOf(error), () => null);
  // Who has blocked you (migration 118), so search leaves them out the way it
  // leaves out people you blocked. A database without it (or a failed ask)
  // gives undefined, and search works as it always has. Only the standard
  // app does this: their profile row still reaches you (see useFindable).
  const blockedMeLoad = missingThisSession.has('blocked_me') ? Promise.resolve(undefined)
    : db.rpc('blocked_me').then(({ data, error }) => {
      if (error && missingFunction(error)) missingThisSession.add('blocked_me');
      return error || !Array.isArray(data) ? undefined : blockedMeIdsOf(data);
    }, () => undefined);
  // Your own town position, the only one the app uses (map, distances):
  // my_city_at() (migration 118); on a database without it, your own row.
  // Undefined when it could not be read: then the app goes by the town's name.
  type CityAt = { city_lat: number | null; city_lng: number | null };
  const ownRow = async (): Promise<CityAt | undefined> => {
    try {
      const { data, error } = await db.from('profiles').select('city_lat, city_lng').eq('id', me).maybeSingle();
      return error || !data ? undefined : (data as CityAt);
    } catch {
      return undefined;
    }
  };
  // Tournament plans you may see (migration 123): yours, and those of people
  // you follow who follow you back.
  const plansLoad = fetchPlans();
  const cityLoad = (async (): Promise<CityAt | undefined> => {
    if (missingThisSession.has('my_city_at')) return ownRow();
    try {
      const { data, error } = await db.rpc('my_city_at');
      if (error && missingFunction(error)) { missingThisSession.add('my_city_at'); return ownRow(); }
      const row: unknown = Array.isArray(data) ? data[0] : data;
      if (error || !row || typeof row !== 'object') return undefined;
      const { lat, lng } = row as { lat?: unknown; lng?: unknown };
      return { city_lat: typeof lat === 'number' ? lat : null, city_lng: typeof lng === 'number' ? lng : null };
    } catch {
      return undefined;
    }
  })();
  // Streaks of 3 days or more that may still be running (migration 134), for
  // the flame beside names: only the number and its last day ever come.
  const streaksLoad = fetchStreaks();
  // Comments your Hidden words hid on what you posted (migration 117), read before any comment is mapped.
  const commentHolds = refreshHeld(me);
  // Messages your Hidden words hid (migration 117), newest first: none on a database without them.
  const heldLoad = db.from('message_word_holds').select('message_id').order('held_at', { ascending: false }).limit(1000)
    .then(({ data, error }) => (error ? [] : ((data ?? []) as { message_id: string }[]).map((r) => r.message_id)), () => [] as string[]);
  const [profiles, posts, storiesTry, follows, requests, convs, qs, cqs, creqs, notes, ustate, tipRows, hiddenRows, applicationRows, sessionRows, pollRows, myPollVotes, hitRows, prefRows, activityRows, hitInviteRows] = await Promise.all([
    // Every profile, in chunks, so nobody is left out past the first 1,000:
    // the named columns, never anyone's town position (see PROFILE_COLUMNS).
    // A database older than one of them is read whole, as before.
    (async () => {
      const named = await allRows<ProfileRow>((from, to) => db.from('profiles').select(PROFILE_COLUMNS).order('created_at', { ascending: true }).range(from, to));
      return missingColumn(named.error) ? allRows<ProfileRow>((from, to) => db.from('profiles').select('*').order('created_at', { ascending: true }).range(from, to)) : named;
    })(),
    db.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(POST_PAGE),
    storiesFull,
    // Only the follows that involve you: who you follow, and who follows you.
    allRows<Edge>((from, to) => db.from('follows').select('follower_id, following_id').or(`follower_id.eq.${me},following_id.eq.${me}`).range(from, to)),
    // Only the ones that involve you come back; a database without the table yet just gives none.
    db.from('follow_requests').select('requester_id, target_id, created_at'),
    chatsLoad,
    // Threads and coach questions, each with its own newest replies (all of
    // them load when the thread is opened), so no app-wide cap cuts replies off.
    db.from('questions').select('*, answers(*)').order('created_at', { ascending: false }).limit(300)
      .order('created_at', { referencedTable: 'answers', ascending: false })
      .limit(100, { referencedTable: 'answers' }),
    db.from('coach_questions').select('*, coach_replies(*)').order('created_at', { ascending: false }).limit(200)
      .order('created_at', { referencedTable: 'coach_replies', ascending: false })
      .limit(100, { referencedTable: 'coach_replies' }),
    db.from('coaching_requests').select('*').order('created_at', { ascending: false }),
    // The last month of notifications, so the screen can show this week and the weeks before it.
    db.from('notifications').select('*').gte('created_at', new Date(Date.now() - 31 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(600),
    db.from('user_state').select('*').eq('user_id', me).maybeSingle(),
    db.from('tips').select('*').order('created_at', { ascending: false }).limit(300),
    // Messages you deleted for yourself; a database without the table yet just gives none.
    db.from('hidden_messages').select('message_id').eq('user_id', me),
    // Your own coach application, so the form can show where it stands.
    db.from('coach_applications').select('*').eq('user_id', me).order('created_at', { ascending: false }).limit(3),
    // Your practice log for the last year and a bit: enough for streaks and totals.
    db.from('practice_sessions').select('*').eq('user_id', me).gte('day', new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10)).order('day', { ascending: false }).limit(1000),
    // Polls and your own votes in them, asked for on their own so a database without them (migration 41) loses nothing else.
    db.from('polls').select('question_id, options, counts').order('created_at', { ascending: false }).limit(300),
    db.from('poll_votes').select('question_id, option').eq('user_id', me),
    // Hits still ahead (or just started), with who is in.
    db.from('hit_requests').select('*, hit_joins(user_id)').eq('cancelled', false).gte('starts_at', new Date(Date.now() - 3_600_000).toISOString()).order('starts_at', { ascending: true }).limit(HITS_CAP),
    // Which chats you muted: only your own rows come back (migration 54; none without it).
    db.from('conversation_prefs').select('*'),
    // Tennis sessions your tracker picked up (migration 58; none without it).
    activitiesQuery(me),
    // Who was invited to the invite-first hits you can see (migration 76; none without it).
    hitInvitesQuery(),
  ]);
  const coaching = await coachingLoad;
  const tagsReady = await tagsProbe;
  const blockedMeIds = await blockedMeLoad;
  const ownCity = await cityLoad;
  const plans = await plansLoad;
  const streaks = await streaksLoad;
  setSessionTagNamesLive(tagsReady);
  if (qs.error) console.warn('[remote] community tables missing; run the pending migrations', qs.error.message);
  const byTime = <T extends { created_at: string }>(a: T, b: T) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
  const questionRows = (qs.data ?? []) as (QuestionRow & { answers?: AnswerRow[] })[];
  const answerRows = questionRows.flatMap((q) => q.answers ?? []).sort(byTime);
  const coachQuestionRows = (cqs.data ?? []) as (CoachQuestionRow & { coach_replies?: CoachReplyRow[] })[];
  const replyRows = coachQuestionRows.flatMap((q) => q.coach_replies ?? []).sort(byTime);
  if (convs.error) console.warn('[remote] messages tables missing; run the pending migrations', convs.error.message);
  const hidden = new Set(((hiddenRows.data ?? []) as { message_id: string }[]).map((r) => r.message_id));
  // The member columns are picked at run time (with or without role), so the query's own typing cannot see the shape.
  const convRows = (convs.data ?? []) as unknown as ConversationRow[];
  const messageRows = convRows.flatMap((c) => c.messages ?? []).filter((m) => !hidden.has(m.id)).sort(byTime);
  const heldMessages = new Set(await heldLoad);
  const listed = toConversations(me, convRows, messageRows, toMutes(prefRows.error ? [] : prefRows.data), heldMessages);
  const dm = heldMessages.size ? { ...listed, messages: listed.messages.map((m) => (heldMessages.has(m.id) && m.senderId !== me ? { ...m, hiddenByWords: true } : m)) } : listed;
  if (requests.error) console.warn('[remote] follow requests table missing; run the pending migrations', requests.error.message);
  const stories = storiesTry.error ? await storiesPlain() : storiesTry;
  if (storiesTry.error) console.warn('[remote] hit likes/comments tables missing; run the pending migrations', storiesTry.error.message);
  for (const result of [profiles, posts, stories, follows]) if (result.error) throw result.error;
  await commentHolds;

  // A database without its own follow counts (migration 22) needs every
  // follow to count them, as the app used to: fetch them all in that case.
  const profileRows = profiles.data as ProfileRow[];
  const keepsCounts = profileRows.length > 0 && typeof profileRows[0].followers_count === 'number';
  const edges = keepsCounts
    ? follows.data
    : (await allRows<Edge>((from, to) => db.from('follows').select('follower_id, following_id').range(from, to))).data;
  const followers = new Map<string, number>();
  const following = new Map<string, number>();
  for (const edge of edges) {
    followers.set(edge.following_id, (followers.get(edge.following_id) ?? 0) + 1);
    following.set(edge.follower_id, (following.get(edge.follower_id) ?? 0) + 1);
  }

  // A post or Instant an admin took down comes only to its author and to
  // admins (the database decides), marked: the feeds leave it out, and its
  // author sees it on their own pages as removed, with the reason.
  const postRows = (posts.data ?? []) as (PostRow & { comments?: CommentRow[] })[];
  const storyRows = (stories.data ?? []) as StoryRow[];
  // Your own age: from your settings row, the only place it is since
  // migration 64; before that, from your profile row like everyone's.
  const ownState = (ustate.data ?? null) as UserStateRow | null;
  const ownAge = ownState?.age_group ?? profileRows.find((row) => row.id === me)?.age_group ?? null;
  // Which database this is: a profile row has an age_group column only before 64.
  const agesOnProfiles = profileRows.some((row) => 'age_group' in row);
  // A new Apple or Google account has no settings row until its age check,
  // so whether the database has "Let people find me from their contacts"
  // (migration 89) is asked on its own: the switch shows from the first visit.
  // The same for the "Players joining near you" switch (migration 146), asked alongside.
  const hasColumn = (column: string) => db.from('user_state').select(column).limit(0).then(({ error }) => !error, () => false);
  const [contactsFindableReady, alertSwitchesReady] = ustate.data || ustate.error ? [false, false]
    : await Promise.all([hasColumn('contacts_findable'), hasColumn('push_joined')]);
  const hitList = await withMyHits(((hitRows.data ?? []) as HitRow[]).map(toHit), me);
  // Tournament plans (where and when someone will play) are only for
  // themselves and friends who follow each other, whoever they are. Since
  // migration 123 they live in each owner's settings row: yours comes with
  // your settings, the rest from tournament_plans(). On a database before
  // it, the profile rows still carry everyone's, so the app keeps only the
  // same people's.
  const iFollow = new Set<string>();
  const followMe = new Set<string>();
  for (const edge of (follows.data ?? []) as Edge[]) {
    if (edge.follower_id === me) iFollow.add(edge.following_id);
    if (edge.following_id === me) followMe.add(edge.follower_id);
  }
  const ownPlans = Array.isArray(ownState?.private_profile?.tournaments) ? tournamentsOf(ownState!.private_profile!.tournaments) : undefined;
  const plansFor = (row: ProfileRow): TournamentEntry[] => {
    if (row.id === me) return ownPlans ?? plans?.get(me) ?? tournamentsOf(row.profile?.tournaments);
    if (plans) return plans.get(row.id) ?? [];
    return iFollow.has(row.id) && followMe.has(row.id) ? tournamentsOf(row.profile?.tournaments) : [];
  };
  const withPlans = (row: ProfileRow): ProfileRow => ({ ...row, profile: { ...(row.profile ?? {}), tournaments: plansFor(row) } });
  return {
    agesOnProfiles,
    ...(contactsFindableReady ? { contactsFindableReady: true } : {}),
    ...(alertSwitchesReady ? { alertSwitchesReady: true } : {}),
    // Your own "up for a hit" when it is kept privately (migration 78: not a known adult) comes from your settings row.
    // And how far you'd like to go for a hit (migration 120), kept only in that row too.
    // Nobody else's town position is read (PROFILE_COLUMNS); yours comes on its own (cityLoad).
    users: profileRows.map(withPlans).map((row) => withStreak(toUser(row.id === me
      ? { ...row, ...(ownCity ?? {}), age_group: ownAge, open_to_hit_until: row.open_to_hit_until ?? ownState?.open_to_hit_until ?? null, open_to_hit_miles: ownState?.open_to_hit_miles ?? null }
      : { ...row, city_lat: null, city_lng: null }, followers.get(row.id) ?? 0, following.get(row.id) ?? 0), streaks)),
    posts: postRows.map(toPost),
    comments: [
      ...postRows.flatMap((row) => (row.comments ?? []).map(toComment)),
      ...storyRows.flatMap((row) => (row.story_comments ?? []).map(toStoryComment)),
    ],
    stories: storyRows.map(toStory),
    followingIds: edges.filter((e) => e.follower_id === me).map((e) => e.following_id),
    followEdges: edges.map((e) => ({ followerId: e.follower_id, followingId: e.following_id })),
    savedPostIds: postRows.filter((row) => (row.post_saves ?? []).some((s) => s.user_id === me)).map((row) => row.id),
    followRequests: ((requests.data ?? []) as { requester_id: string; target_id: string; created_at: string }[]).map((r) => ({ fromId: r.requester_id, toId: r.target_id, createdAt: r.created_at })),
    conversations: dm.conversations,
    messages: dm.messages,
    questions: withPolls(questionRows.map((r) => toQuestion(r, answerRows)), (pollRows.data ?? []) as PollRow[], (myPollVotes.data ?? []) as { question_id: string; option: number }[]),
    answers: answerRows.map(toAnswer),
    coachQuestions: coachQuestionRows.map((r) => toCoachQuestion(r, replyRows)),
    coachReplies: replyRows.map(toCoachReply),
    coachingRequests: ((creqs.data ?? []) as CoachingRequestRow[]).map(toCoachingRequest),
    notifications: ((notes.data ?? []) as NotificationRow[]).map(toNotification),
    userState: ustate.data ? toUserState(ustate.data as UserStateRow) : null,
    tips: ((tipRows.data ?? []) as TipRow[]).map(toTip),
    coachApplications: ((applicationRows.data ?? []) as CoachApplicationRow[]).map(toCoachApplication),
    sessions: ((sessionRows.data ?? []) as SessionRow[]).map(toSession),
    hitRequests: withInvites(hitList, hitInviteRows.error ? null : (hitInviteRows.data as { hit_id: string; user_id: string }[])),
    activities: activityRows.error ? [] : ((activityRows.data ?? []) as ActivityRow[]).map(toActivity),
    ...(tagsReady === null ? {} : { sessionTagsReady: tagsReady }),
    hiddenMessageIds: [...hidden],
    ...(blockedMeIds ? { blockedMeIds } : {}),
    ...(ustate.error ? { userStateFailed: true } : {}),
    ...coaching,
  };
}

/**
 * Coaches, their services, reviews and results. A database without the
 * coaching tables yet (migration 35) just gives none.
 */
export async function fetchCoaching(me: ID): Promise<Pick<RemoteData, 'coaches' | 'coachReviews' | 'coachResults'>> {
  const db = need();
  const [coachRows, serviceRows, reviewRows, resultRows] = await Promise.all([
    db.from('coaches').select(COACH_COLUMNS),
    db.from('coach_services').select('*'),
    db.from('coach_reviews').select('*').order('created_at', { ascending: false }).limit(500),
    db.from('coach_results').select('*').order('created_at', { ascending: false }).limit(300),
  ]);
  if (coachRows.error) return { coaches: [], coachReviews: [], coachResults: [] };
  const services = (serviceRows.data ?? []) as CoachServiceRow[];
  return {
    coaches: ((coachRows.data ?? []) as unknown as CoachRow[]).map((r) => toCoach(r, services, me)),
    coachReviews: ((reviewRows.data ?? []) as CoachReviewRow[]).map((r) => ({ id: r.id, coachId: r.coach_id, authorId: r.author_id, rating: r.rating, body: r.body, createdAt: r.created_at })),
    coachResults: ((resultRows.data ?? []) as CoachResultRow[]).map((r) => ({ id: r.id, coachId: r.coach_id, clientName: r.client_name, focus: r.focus, before: r.before, after: r.after, weeks: r.weeks, note: r.note ?? undefined })),
  };
}

/** What the payments function answers; `error` is a plain sentence to show. */
type PaymentsReply<T> = T & { error?: string; off?: boolean };
/** Calls the coach-payments function, and throws its plain-English error when it has one. */
async function coachPayments<T>(mode: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await need().functions.invoke<PaymentsReply<T>>('coach-payments', { body: { mode, ...body } });
  // A booking's question refused for its words (migration 117) is said in plain words, whichever way it comes back.
  const plain = (text: string) => (isBlockedWords(text) ? BLOCKED_WORDS_NOTE : text);
  if (data?.error) throw new Error(plain(data.error));
  if (error) {
    // A refused call still carries the function's own sentence in its body.
    const context = (error as { context?: Response }).context;
    const said = context && typeof context.json === 'function' ? await context.json().catch(() => null) as { error?: string } | null : null;
    throw new Error(plain(said?.error ?? 'Payments are unavailable right now. Try again in a minute.'));
  }
  return data as T;
}

/* --------------------------------------------------------------- writes */

/**
 * The name the sign-up step gives an account it was told no name for: the
 * handle, underscores as spaces, each word capitalised (Postgres's initcap,
 * handle_new_user in migration 34).
 */
export function standInName(handle: string): string {
  return handle.replace(/_/g, ' ').toLowerCase().replace(/(^|[^a-z0-9])([a-z])/g, (_m, before: string, letter: string) => before + letter.toUpperCase());
}

const fail = (what: string) => (error: unknown) => {
  // Words the database refuses (migration 117): said once, in plain words, wherever they were written.
  if (isBlockedWords(error)) { wordsRefused(); return; }
  console.warn(`[remote] ${what} failed`, error);
};

/* ----------------------------------------------------------- hidden words */

export { BLOCKED_WORDS_NOTE };
/** Whether an error is that refusal: slurs, sexual words about children, telling someone to kill themselves, the gravest threats. */
export function isBlockedWords(error: unknown): boolean {
  const message = typeof error === 'string' ? error : (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && /blocked_words/.test(message);
}
const wordsRefusedListeners = new Set<() => void>();
const wordsRefused = () => wordsRefusedListeners.forEach((fn) => fn());
/** Told each time a write is refused for its words; the app shows BLOCKED_WORDS_NOTE. */
export function onWordsRefused(fn: () => void): () => void {
  wordsRefusedListeners.add(fn);
  return () => { wordsRefusedListeners.delete(fn); };
}
/** A save refused for its words, so the app takes back what it showed. */
const refusedFor = (error: unknown) => (isBlockedWords(error) ? ('blocked' as const) : undefined);
/** The most #tags a post files, and people it tags (posts_tags_count). */
const TAGS_MAX = 20;
/** Whether a row is there (read as you, so only one you may see). Errors count as there: nothing is put back wrongly. */
async function rowThere(table: 'stories' | 'comments' | 'story_comments', id: ID): Promise<boolean> {
  try {
    const { data, error } = await need().from(table).select('id').eq('id', id).maybeSingle();
    return !!error || !!data;
  } catch { return true; }
}
/** A comment whose answer was lost on the way back (no connection) may still have been saved: looked for before saying it failed. */
async function commentLanded(table: 'comments' | 'story_comments', id: ID, error: { code?: string; message: string }): Promise<boolean> {
  if (error.code || !/network|fetch|timed? ?out|abort/i.test(error.message)) return false;
  try {
    const { data } = await need().from(table).select('id').eq('id', id).maybeSingle();
    return !!data;
  } catch { return false; }
}
/** Why your Hidden words did not save, as set_hidden_words says it. */
export type HiddenWordsRefusal = 'too_many_words' | 'word_too_long' | 'not_ready' | 'failed';

/**
 * Why a group chat function said no, from the exact words it raises
 * (migration 54; 42's older wording for a full group too). Null for anything
 * else, which the app treats as "didn't go through".
 */
export type GroupRefusal = 'blocked' | 'teen' | 'full' | 'not-admin' | 'words';
function groupRefusal(message: string): GroupRefusal | null {
  // A group name with words CourtSide refuses (migration 117); checked first, as it says "blocked" too.
  if (/blocked_words/.test(message)) return 'words';
  if (/teen_closed/.test(message)) return 'teen';
  if (/group_full|up to 16 people/.test(message)) return 'full';
  if (/not_admin/.test(message)) return 'not-admin';
  if (/blocked/.test(message)) return 'blocked';
  return null;
}

/**
 * How a take-down or restore went: 'done' (or it already was), 'refused'
 * (not an admin), 'gone' (deleted meanwhile), 'not_ready' (a database
 * without migration 108 yet) or 'failed' (anything else; logged).
 */
export type ModerationResult = 'done' | 'refused' | 'gone' | 'not_ready' | 'failed';
function moderationResult(error: { code?: string; message: string } | null, what: string): ModerationResult {
  if (!error) return 'done';
  if (missingFunction(error)) return 'not_ready';
  if (/not allowed/.test(error.message)) return 'refused';
  if (/not found/.test(error.message)) return 'gone';
  fail(what)(error);
  return 'failed';
}
/** The longest note an author can send with "Ask for a review" (the database keeps 300 characters). */
export const REVIEW_NOTE_MAX = 300;
/**
 * How "Ask for a review" went: 'done', 'already' (asked about this take-down
 * before), 'not_removed' (put back meanwhile), 'not_yours', 'gone' (deleted),
 * 'not_ready' (a database without migration 20261006000139) or 'failed'.
 */
export type ReviewAskResult = 'done' | 'already' | 'not_removed' | 'not_yours' | 'gone' | 'not_ready' | 'failed';
/** Never closed_by: the app is not told which admin answered (the database does not hand it out either). */
const REVIEW_COLUMNS = 'id, author_id, target_kind, target_id, note, removed_at, status, created_at, closed_at';
interface ReviewRow { id: string; author_id: string; target_kind: string; target_id: string; note: string | null; removed_at: string; status: string; created_at: string; closed_at: string | null }
const toReviewRequest = (r: ReviewRow): ReviewRequest[] => {
  const kind = asKind(r.target_kind);
  const status: ReviewStatus | null = r.status === 'open' || r.status === 'kept' || r.status === 'restored' ? r.status : null;
  if (!kind || !status) return [];
  return [{
    id: r.id, authorId: r.author_id, kind, targetId: r.target_id, note: r.note ?? undefined, status,
    removedAt: r.removed_at, createdAt: r.created_at, closedAt: r.closed_at ?? undefined,
  }];
};
/** A reported post or Instant as the Reports screen shows it. */
export interface ReportedItem {
  body: string; picture?: string; removed: boolean; reason?: TakedownReason;
  /** What it sits under, so the report opens it in place: a comment's post or Instant, a reply's thread or coach question. */
  parentId?: ID;
  /** A comment on an Instant (story_comments), not on a post: its own kind to take down. */
  onHit?: boolean;
}
/**
 * The database does not have the function asked for: it has not had the
 * migration that adds it yet. PostgREST answers "Could not find the function
 * … in the schema cache" (PGRST202); Postgres itself says "function … does not exist".
 */
const missingFunction = (error: { code?: string; message: string }) =>
  error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message);

/** The same for a table: PostgREST's "Could not find the table" (PGRST205), or Postgres's "relation … does not exist". */
const missingTable = (error: { code?: string; message: string }) =>
  error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|relation .* does not exist/i.test(error.message);

/** Set once a settings save finds no push_messages column (a database before migration 54). */
let userStateLacksPushMessages = false;
/** Set once a settings save finds no push_activity column (a database before migration 58). */
let userStateLacksPushActivity = false;
/** Set once a settings save finds no map alert columns (a database before migration 60). */
let userStateLacksMapAlerts = false;
/** Set once a settings save finds no contacts_findable column (a database before migration 89). */
let userStateLacksContactsFindable = false;
/** A database without "Open to hit" distances (migration 120): not asked again this session. */
let lacksOpenToHitMiles = false;
/** A database without where a session was played (migration 130): not sent again this session. */
let sessionsLackCourt = false;
/** Set once a settings save finds no push_recap column (a database before migration 130). */
let userStateLacksPushRecap = false;
/** Set once a settings save finds no push_joined / push_streak columns (a database before migration 146). */
let userStateLacksAlertSwitches = false;

/** A note for whoever reads the logs: this needs the group chat update in Supabase first. */
const needs75 = (what: string) => console.warn(`[remote] ${what} needs the messaging update. Open Supabase → SQL Editor → New query, paste the file supabase/migrations/20261003000075_messaging.sql and press Run. It is safe to run more than once.`);
const needs54 = (what: string) => console.warn(`[remote] ${what} needs the group chat update. Open Supabase → SQL Editor → New query, paste the file supabase/migrations/20261001000054_group_chats.sql and press Run. It is safe to run more than once.`);

/** The edits a post can carry, and the migration file that adds each one's column. */
const OPTIONAL_COLUMNS = /trim_|muted|crop|location|speed|volume|feature_ok|court_/;
const MIGRATION_FOR: Record<string, string> = {
  trim_start: '20260916000002_post_trim.sql', trim_end: '20260916000002_post_trim.sql', muted: '20260916000002_post_trim.sql',
  crop: '20260916000003_post_crop.sql', location: '20260916000004_post_edit.sql',
  speed: '20260925000026_post_speed_volume.sql', volume: '20260925000026_post_speed_volume.sql',
  feature_ok: '20260926000028_feature_ok_referrals.sql',
  court_id: '20260930000051_post_court.sql', court_name: '20260930000051_post_court.sql', court_lat: '20260930000051_post_court.sql', court_lng: '20260930000051_post_court.sql',
};
const missingColumnsNote = (cols: string[]) =>
  `[remote] The posts table has no "${cols.join('", "')}" column yet, so this post was saved without that edit (it still went up). To keep it next time, open Supabase → SQL Editor → New query, paste the file supabase/migrations/${MIGRATION_FOR[cols[0]] ?? '…'} and press Run. It is safe to run more than once.`;

/** A group's look as the server sends it (migration 73); all missing before it runs. */
interface LookRow { color?: string | null; emoji?: string | null; photo?: string | null }
interface GroupRow extends LookRow { id: ID; name: string; description: string | null; ask: boolean; discoverable?: boolean; createdAt: string; members?: { id: ID; admin: boolean }[]; requests?: ID[] }
const toGroup = (row: GroupRow): FeedGroup => ({
  id: row.id, name: row.name, description: row.description ?? undefined, ask: !!row.ask, discoverable: row.discoverable !== false,
  look: lookFrom(row), createdAt: row.createdAt,
  members: row.members ?? [], requests: row.requests ?? [],
});
/** The server's word for why a group action said no (migration 67), or 'failed'. */
const groupWord = (error: { code?: string; message: string }) =>
  missingFunction(error) ? 'not_ready'
    : /adults_only|their_age|group_limit|their_limit|not_admin|not_found|name_needed|slow_down|bad_photo|bad_look|blocked_words/.exec(error.message)?.[0] ?? 'failed';

/**
 * Of these messages, the ones your Hidden words hid for you (migration 117).
 * Empty on a database without them, or when it could not be asked (they
 * then show as normal).
 */
async function heldMessageIdsOf(ids: ID[]): Promise<ID[]> {
  const wanted = ids.filter((id) => UUID_RE.test(id));
  if (!wanted.length || !supabase) return [];
  const out: ID[] = [];
  for (let i = 0; i < wanted.length; i += 150) {
    const { data, error } = await supabase.from('message_word_holds').select('message_id').in('message_id', wanted.slice(i, i + 150));
    if (error) { if (!missingTable(error)) fail('hidden messages')(error); return out; }
    out.push(...((data ?? []) as { message_id: string }[]).map((r) => r.message_id));
  }
  return out;
}
/** The same messages, the ones hidden for you marked (only ever someone else's). */
async function markHeld(me: ID, messages: Message[]): Promise<Message[]> {
  const theirs = messages.filter((m) => m.senderId !== me && m.kind !== 'system' && !!m.body?.trim()).map((m) => m.id);
  if (!theirs.length) return messages;
  const held = new Set(await heldMessageIdsOf(theirs).catch(() => [] as ID[]));
  return held.size ? messages.map((m) => (held.has(m.id) ? { ...m, hiddenByWords: true } : m)) : messages;
}

export const remote = {
  /* --------------------------------- streak --------------------------------- */

  /**
   * Puts your streak up beside your name for others (migration 134): only
   * the number and the last day it covers (your own calendar day), never the
   * sessions or posts behind it. A database without migration 134 is asked
   * once a session and then left alone; the flame then shows only on your
   * own screens. True once the server holds it; false when it could not be
   * put up (offline, or no migration 134), so the caller can try again.
   */
  async setMyStreak(days: number, through: string | null): Promise<boolean> {
    if (!supabase || missingThisSession.has('set_my_streak')) return false;
    const streak = Math.max(0, Math.min(3650, Math.round(days)));
    const { error } = await supabase.rpc('set_my_streak', { streak, last_day: streak > 0 ? through : null })
      .then((r) => r, (e: unknown) => ({ error: { message: String(e) } as { code?: string; message: string } }));
    if (!error) return true;
    if (missingFunction(error)) { missingThisSession.add('set_my_streak'); return false; }
    console.warn('[remote] streak not shared', error.message);
    return false;
  },

  /**
   * "Friends on a streak" for the weekly recap (friends_on_streak, migration
   * 20261006000137): up to 5 people you follow on a running streak, longest
   * first, as the server allows (a teen only when they follow you back,
   * never anyone whose activity status is off). `today` is this phone's day. Null on a database without it (asked once
   * a session) or when it could not be asked: the caller then keeps to
   * friends who follow each other with you.
   */
  async fetchFriendsOnStreak(today: string): Promise<FriendStreak[] | null> {
    if (!supabase || missingThisSession.has('friends_on_streak') || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
    const { data, error } = await supabase.rpc('friends_on_streak', { p_today: today })
      .then((r) => r, (e: unknown) => ({ data: null, error: { message: String(e) } as { code?: string; message: string } }));
    if (error) {
      if (missingFunction(error)) missingThisSession.add('friends_on_streak');
      else console.warn('[remote] friends on a streak', error.message);
      return null;
    }
    return ((Array.isArray(data) ? data : []) as { user_id?: unknown; days?: unknown; through_day?: unknown }[])
      .filter((r) => typeof r.user_id === 'string' && UUID_RE.test(r.user_id) && typeof r.through_day === 'string' && num(r.days) > 0)
      .map((r) => ({ userId: r.user_id as string, days: num(r.days), through: (r.through_day as string).slice(0, 10) }));
  },

  /* ------------------------------ hidden words ------------------------------ */

  /** Your Hidden words as they really work (migration 117). 'not_ready' on a database without it; null when it could not be asked. */
  async fetchHiddenWords(): Promise<HiddenWords | 'not_ready' | null> {
    const { data, error } = await need().rpc('hidden_words');
    if (error) { if (missingFunction(error)) return 'not_ready'; fail('hidden words')(error); return null; }
    return asHiddenWords(data);
  },
  /** Saves them; what the server kept (an under-18 account keeps both offensive filters on), or why not. */
  async saveHiddenWords(next: Omit<HiddenWords, 'locked'>): Promise<HiddenWords | HiddenWordsRefusal> {
    const { data, error } = await need().rpc('set_hidden_words', {
      p_hide_comments: next.hideOffensiveComments, p_hide_requests: next.hideOffensiveRequests, p_words: next.customWords,
      p_in_comments: next.customInComments, p_in_requests: next.customInRequests,
    });
    if (error) {
      if (missingFunction(error)) return 'not_ready';
      const word = /too_many_words|word_too_long/.exec(error.message)?.[0] as HiddenWordsRefusal | undefined;
      if (word) return word;
      fail('hidden words save')(error);
      return 'failed';
    }
    return asHiddenWords(data) ?? 'failed';
  },
  /** Shows a comment or reply your Hidden words hid, to everyone again. Nobody is told. True when it took. */
  async unhideWords(kind: HiddenWordsKind, id: ID): Promise<boolean> {
    const { error } = await need().rpc('unhide_words', { p_kind: kind, p_id: id });
    if (error) { fail('unhide')(error); return false; }
    held.ids.delete(id);
    return true;
  },
  /**
   * Whether these words (a caption, a place) would be refused for slurs,
   * sexual words about children, telling someone to kill themselves or the
   * gravest threats (migration 117), asked before a photo or clip goes up so
   * the draft can stay. False when it cannot be asked: the post itself is
   * still checked when it is saved.
   */
  async wordsRefused(texts: string[]): Promise<boolean> {
    const asked = texts.map((t) => t.trim()).filter(Boolean).slice(0, 10);
    if (!asked.length) return false;
    const { data, error } = await need().rpc('words_refused', { p_texts: asked }).then((r) => r, () => ({ data: null, error: true }));
    return !error && data === true;
  },
  /**
   * Of these messages, the ones hidden for you by your Hidden words (from
   * someone you don't follow). Empty on a database without them, or when it
   * could not be asked (they then show as normal).
   */
  heldMessageIds: heldMessageIdsOf,
  /** The same messages, the hidden ones marked. */
  markHeld,

  /* ------------------------ discussions and coaching ------------------------ */

  /** The words of a thread you wrote; the tally is the server's and is left alone. */
  async insertPoll(questionId: ID, options: string[]) {
    const { error } = await need().from('polls').insert({ question_id: questionId, options });
    if (error) fail('poll')(error);
    return refusedFor(error);
  },
  async votePoll(questionId: ID, option: number) {
    const { error } = await need().from('poll_votes').upsert({ question_id: questionId, option }, { onConflict: 'question_id,user_id' });
    if (error) fail('poll vote')(error);
  },
  async upsertQuestion(q: Question) {
    const { error } = await need().from('questions').upsert({
      id: q.id, author_id: q.authorId, title: q.title, body: q.body, topic: q.topic, tags: q.tags, accepted_answer_id: q.acceptedAnswerId ?? null,
      edited_at: q.editedAt ?? null, created_at: q.createdAt,
    });
    if (error) fail('thread save')(error);
    // 'blocked': refused for its words (migration 117); 'failed': not saved for any other reason
    // (offline, too long). Either way the app takes it back and says so.
    return refusedFor(error) ?? (error ? 'failed' as const : undefined);
  },
  /**
   * A change to a thread already up (an edit, an accepted answer): those
   * columns only, never its date. The upsert above re-dated it to "now",
   * because the server stamps the date on the insert half (migration 36).
   * Not on the server yet (its first save still going): the full save.
   */
  async updateQuestion(q: Question) {
    const { data, error } = await need().from('questions').update({
      title: q.title, body: q.body, tags: q.tags, accepted_answer_id: q.acceptedAnswerId ?? null, edited_at: q.editedAt ?? null,
    }).eq('id', q.id).select('id');
    if (error) { fail('thread save')(error); return refusedFor(error) ?? 'failed' as const; }
    if (!(data ?? []).length) return remote.upsertQuestion(q);
    return undefined;
  },
  async upsertAnswer(a: Answer) {
    const { error } = await need().from('answers').upsert({
      id: a.id, question_id: a.questionId, author_id: a.authorId, parent_answer_id: a.parentAnswerId ?? null, body: a.body, from_coach: a.fromCoach, created_at: a.createdAt,
      // Only sent with a picture or clip, so a plain reply still saves on a database without migration 40.
      ...(a.media ? { media_url: a.media.url, media_kind: a.media.kind, media_thumb: a.media.thumb ?? null } : {}),
    });
    if (error) fail('answer save')(error);
    // As for a thread: 'blocked' for its words, 'failed' for anything else.
    return refusedFor(error) ?? (error ? 'failed' as const : undefined);
  },
  async voteQuestion(questionId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_question', { q: questionId, dir }); if (error) fail('vote')(error); },
  async voteAnswer(answerId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_answer', { a: answerId, dir }); if (error) fail('vote')(error); },
  async upsertCoachQuestion(q: CoachQuestion) {
    const { error } = await need().from('coach_questions').upsert({
      id: q.id, author_id: q.authorId, title: q.title, body: q.body, specialty: q.specialty, video_url: q.videoUrl ?? null, media_label: q.mediaLabel ?? null, resolved: q.resolved, created_at: q.createdAt,
    });
    if (error) fail('coach question save')(error);
    // 'blocked' for its words; 'failed' for anything else (no connection, a rule that said no), so the app takes it back rather than show a question no coach will ever see.
    return error ? (refusedFor(error) ?? ('failed' as const)) : undefined;
  },
  /** "This answered it" / "Reopen": just that, so the question keeps its date (see updateQuestion). */
  async setCoachQuestionResolved(q: CoachQuestion) {
    const { data, error } = await need().from('coach_questions').update({ resolved: q.resolved }).eq('id', q.id).select('id');
    if (error) { fail('coach question save')(error); return; }
    if (!(data ?? []).length) await remote.upsertCoachQuestion(q);
  },
  /**
   * Deletes your own public coach question; the coaches' answers go with it
   * (migration 57). Throws when nothing was deleted: the database answers a
   * refused delete with zero rows, not an error, so an empty answer is the
   * only sign it did not happen.
   */
  /** Deletes your own thread reply (migration 87). Throws when nothing was deleted. */
  async deleteAnswer(id: ID) {
    const { data, error } = await need().from('answers').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!(data ?? []).length) throw new Error('answer not deleted');
  },
  async deleteCoachQuestion(id: ID) {
    const { data, error } = await need().from('coach_questions').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!(data ?? []).length) throw new Error('coach question not deleted');
  },
  async insertCoachReply(r: CoachReply) {
    const { error } = await need().from('coach_replies').upsert({ id: r.id, question_id: r.questionId, coach_user_id: r.coachUserId, body: r.body, created_at: r.createdAt });
    if (error) fail('coach reply save')(error);
    // As upsertCoachQuestion: 'blocked' for its words, 'failed' for anything else.
    return error ? (refusedFor(error) ?? ('failed' as const)) : undefined;
  },
  async toggleReplyHelpful(replyId: ID) { const { error } = await need().rpc('toggle_reply_helpful', { r: replyId }); if (error) fail('helpful')(error); },
  async insertCoachingRequest(r: CoachingRequest) {
    const { error } = await need().from('coaching_requests').upsert({
      id: r.id, coach_id: r.coachId, user_id: r.userId, service_id: r.serviceId, question: r.question, video_label: r.videoLabel ?? null, status: r.status, created_at: r.createdAt,
    });
    if (error) fail('coaching request save')(error);
    return refusedFor(error);
  },
  async markNotificationsRead(ids: ID[]) {
    if (!ids.length) return;
    const { error } = await need().from('notifications').update({ read: true }).in('id', ids);
    if (error) fail('notification read')(error);
  },
  /**
   * Files a report. With `returnId` (an admin's own report: nobody else may
   * read reports, so only they can have it back) resolves to the new
   * report's id; otherwise to null.
   */
  async insertReport(me: ID, targetUserId: ID | null, target: string, reason: string, returnId = false): Promise<ID | null> {
    const row = { reporter_id: me, target_user_id: targetUserId, target, reason };
    if (returnId) {
      const { data, error } = await need().from('reports').insert(row).select('id').single();
      if (error) { fail('report')(error); return null; }
      return (data as { id: string }).id;
    }
    const { error } = await need().from('reports').insert(row);
    if (error) fail('report')(error);
    return null;
  },
  /** Files a report, as insertReport, resolving whether it was filed (so the thanks shows only then). */
  async fileReport(me: ID, targetUserId: ID | null, target: string, reason: string): Promise<boolean> {
    const { error } = await need().from('reports').insert({ reporter_id: me, target_user_id: targetUserId, target, reason });
    if (error) { fail('report')(error); return false; }
    return true;
  },
  /** Your settings row as the server has it now (blocks, mutes, saved threads made on another device included). Null when there is none; throws when it could not be read. */
  async fetchUserState(me: ID): Promise<UserState | null> {
    const { data, error } = await need().from('user_state').select('*').eq('user_id', me).maybeSingle();
    if (error) throw error;
    return data ? toUserState(data as UserStateRow) : null;
  },
  async saveUserState(me: ID, s: UserState) {
    const row: Record<string, unknown> = {
      user_id: me, muted_ids: s.mutedIds, blocked_ids: s.blockedIds, saved_question_ids: s.savedQuestionIds, payment_methods: s.paymentMethods,
      default_payment_id: s.defaultPaymentId, show_activity: s.showActivity, push_likes: s.pushLikes, push_coach: s.pushCoach, updated_at: new Date().toISOString(),
    };
    // The "Message alerts" switch (migration 54), the "Tennis sessions" one
    // (migration 58), the four map alerts (migration 60) and "Let people find
    // me from their contacts" (migration 89) each have their
    // own columns. A database without one
    // refuses the whole save, so the rest is saved without it, and it is not
    // sent again this session.
    const send = () => need().from('user_state').upsert({
      ...row,
      ...(s.pushMessages !== undefined && !userStateLacksPushMessages ? { push_messages: s.pushMessages } : {}),
      ...(s.pushActivity !== undefined && !userStateLacksPushActivity ? { push_activity: s.pushActivity } : {}),
      ...(s.pushMapFriends !== undefined && !userStateLacksMapAlerts
        ? { push_map_friends: s.pushMapFriends, push_map_hits: s.pushMapHits ?? true, push_map_players: s.pushMapPlayers ?? true, push_courts: s.pushCourts ?? true }
        : {}),
      ...(s.contactsFindable !== undefined && !userStateLacksContactsFindable ? { contacts_findable: s.contactsFindable } : {}),
      // The weekly recap's alert (migration 130).
      ...(s.pushRecap !== undefined && !userStateLacksPushRecap ? { push_recap: s.pushRecap } : {}),
      // "Players joining near you" and "Streak reminders" (migration 146).
      ...(!userStateLacksAlertSwitches ? {
        ...(s.pushJoined !== undefined ? { push_joined: s.pushJoined } : {}),
        ...(s.pushStreak !== undefined ? { push_streak: s.pushStreak } : {}),
      } : {}),
    });
    let { error } = await send();
    for (let tries = 0; error && tries < 5; tries += 1) {
      if (/push_joined|push_streak/.test(error.message) && !userStateLacksAlertSwitches) userStateLacksAlertSwitches = true;
      else if (/push_recap/.test(error.message) && !userStateLacksPushRecap) userStateLacksPushRecap = true;
      else if (/contacts_findable/.test(error.message) && !userStateLacksContactsFindable) userStateLacksContactsFindable = true;
      else if (/push_map_|push_courts/.test(error.message) && !userStateLacksMapAlerts) userStateLacksMapAlerts = true;
      else if (/push_activity/.test(error.message) && !userStateLacksPushActivity) userStateLacksPushActivity = true;
      else if (/push_messages/.test(error.message) && !userStateLacksPushMessages) { userStateLacksPushMessages = true; needs54('The Message alerts switch'); }
      else break;
      ({ error } = await send());
    }
    if (error) fail('settings save')(error);
  },

  /* ------------------------------ messages ------------------------------ */

  /**
   * The 1:1 you already have with someone, or a new one under the id the app
   * chose. Returns the id that stands; 'failed' when there was no answer (no
   * signal), so the chat is not taken to be there when it may not be.
   */
  async openConversation(other: ID, wanted: ID): Promise<ID | null | 'blocked' | 'limit' | 'failed'> {
    const { data, error } = await need().rpc('open_conversation', { other, wanted });
    // Past the day's limit of new people (migration 109): no chat, whoever it was.
    if (error && /age_rule_limit/.test(error.message)) return 'limit';
    // A teen who does not follow you cannot be sent a new chat: null says so.
    if (error && /teen_closed/.test(error.message)) return null;
    // Nor can someone you are blocked with, either way.
    if (error && /blocked/.test(error.message)) return 'blocked';
    if (error) { fail('open conversation')(error); return 'failed'; }
    return (data as string) || wanted;
  },

  /* Group chats. Migration 54 does the work on the server (who may join,
     admins, event lines, alerts); on a database that has not had it yet, the
     older functions from migration 42 stand in where there is one, and the
     newer abilities (remove, admins, photo, mute) simply say no. */

  /**
   * A new group with the people picked (two to fifteen others) and an
   * optional name, under the id the app already shows, so a retry returns
   * the same group. Refused when someone you picked is blocked with someone
   * else in it ('blocked'), when someone not known to be an adult does not
   * follow you ('teen'), or past 16 people ('full').
   */
  async createGroup(memberIds: ID[], title: string | undefined, wanted: ID): Promise<ID | GroupRefusal | 'failed'> {
    const db = need();
    let { data, error } = await db.rpc('create_group', { group_title: title ?? null, member_ids: memberIds, wanted });
    if (error && missingFunction(error)) ({ data, error } = await db.rpc('open_group', { members: memberIds, group_title: title ?? null, wanted }));
    if (error) { const why = groupRefusal(error.message); if (why) return why; fail('create group')(error); return 'failed'; }
    return (data as string) || wanted;
  },

  /**
   * Adds people to a group you are in. Resolves with who was actually added
   * (anyone already in it is skipped), or why not, as createGroup.
   */
  async addGroupMembers(conversationId: ID, memberIds: ID[]): Promise<ID[] | GroupRefusal | 'failed'> {
    const db = need();
    const { data, error } = await db.rpc('add_group_members', { conv: conversationId, member_ids: memberIds });
    if (!error) return Array.isArray(data) ? (data as string[]) : [];
    if (!missingFunction(error)) { const why = groupRefusal(error.message); if (why) return why; fail('add to group')(error); return 'failed'; }
    // Before migration 54: one at a time, stopping at the first refusal.
    const added: ID[] = [];
    for (const member of memberIds) {
      const one = await db.rpc('add_to_group', { conv: conversationId, member });
      if (!one.error) { added.push(member); continue; }
      if (added.length) return added;
      const why = groupRefusal(one.error.message);
      if (why) return why;
      fail('add to group')(one.error);
      return 'failed';
    }
    return added;
  },

  /** An admin takes someone out of a group. */
  async removeGroupMember(conversationId: ID, memberId: ID): Promise<'ok' | 'not-admin' | 'failed'> {
    const { error } = await need().rpc('remove_group_member', { conv: conversationId, member: memberId });
    if (!error) return 'ok';
    if (missingFunction(error)) { needs54('Removing someone from a group'); return 'failed'; }
    if (groupRefusal(error.message) === 'not-admin') return 'not-admin';
    fail('remove from group')(error);
    return 'failed';
  },

  /** An admin makes someone an admin, or takes it away. */
  async setGroupAdmin(conversationId: ID, memberId: ID, admin: boolean): Promise<'ok' | 'not-admin' | 'failed'> {
    const { error } = await need().rpc('set_group_admin', { conv: conversationId, member: memberId, make: admin });
    if (!error) return 'ok';
    if (missingFunction(error)) { needs54('Group admins'); return 'failed'; }
    if (groupRefusal(error.message) === 'not-admin') return 'not-admin';
    fail('group admin')(error);
    return 'failed';
  },

  /** A group's photo (already uploaded to the media bucket, in your own folder), or null to take it off. True when it took. */
  async setGroupPhoto(conversationId: ID, url: string | null): Promise<boolean> {
    const { error } = await need().rpc('set_group_photo', { conv: conversationId, photo: url });
    if (!error) return true;
    if (missingFunction(error)) needs54('A group photo'); else fail('group photo')(error);
    return false;
  },

  /** Leaving a group. True when it took (false: you are still in it). */
  async leaveGroup(conversationId: ID): Promise<boolean> {
    const { error } = await need().rpc('leave_group', { conv: conversationId });
    if (error) { fail('leave group')(error); return false; }
    return true;
  },

  /** A group's new name ('' takes the name off). True when it took. */
  async renameGroup(conversationId: ID, title: string): Promise<boolean | 'blocked'> {
    const { error } = await need().rpc('rename_group', { conv: conversationId, new_title: title });
    // A name refused for its words (migration 117): the app says why instead of "didn't change".
    if (error && isBlockedWords(error)) return 'blocked';
    if (error) { fail('rename group')(error); return false; }
    return true;
  },

  /**
   * Mutes a chat you are in (a group or a one-to-one) until a moment, or
   * unmutes it with null. Only you can see it. True when it took.
   */
  /**
   * Your inbox settings for one chat (migration 75): pin it to the top (at
   * most three: 'limit' past that), mark it unread, or delete it from your
   * inbox. 'missing' on a database without them yet: the phone keeps the
   * change for now, and it is simply not saved.
   */
  async setChatPin(conversationId: ID, pinned: boolean): Promise<'ok' | 'limit' | 'missing' | 'failed'> {
    const { error } = await need().rpc('set_chat_pin', { conv: conversationId, pinned });
    if (!error) return 'ok';
    if (/pin_limit/.test(error.message)) return 'limit';
    if (missingFunction(error)) { needs75('Pinning a chat'); return 'missing'; }
    fail('pin chat')(error);
    return 'failed';
  },
  async setChatUnread(conversationId: ID, unread: boolean): Promise<'ok' | 'missing' | 'failed'> {
    const { error } = await need().rpc('set_chat_unread', { conv: conversationId, unread });
    if (!error) return 'ok';
    if (missingFunction(error)) { needs75('Marking a chat unread'); return 'missing'; }
    fail('mark chat unread')(error);
    return 'failed';
  },
  async hideChat(conversationId: ID): Promise<'ok' | 'missing' | 'failed'> {
    const { error } = await need().rpc('hide_chat', { conv: conversationId });
    if (!error) return 'ok';
    if (missingFunction(error)) { needs75('Deleting a chat from the inbox'); return 'missing'; }
    fail('delete chat')(error);
    return 'failed';
  },

  /** One message by its id (a reply's original, from further back than the chat has loaded); null when it is gone or not yours to read. */
  async fetchMessage(me: ID, messageId: ID): Promise<Message | null> {
    const { data, error } = await need().from('messages').select('*').eq('id', messageId).maybeSingle();
    if (error || !data) return null;
    const row = data as MessageRow;
    return toConversations(me, [{ id: row.conversation_id, updated_at: row.created_at }], [row]).messages[0] ?? null;
  },

  /** This chat's own Read receipts switch, for you (migration 141). */
  async setChatReadReceipts(conversationId: ID, on: boolean): Promise<boolean> {
    const { error } = await need().rpc('set_chat_read_receipts', { conv: conversationId, receipts: on });
    if (!error) return true;
    fail('chat read receipts')(error);
    return false;
  },

  async setChatMute(conversationId: ID, until: string | null): Promise<boolean> {
    const { error } = await need().rpc('set_chat_mute', { conv: conversationId, until });
    if (!error) return true;
    if (missingFunction(error)) needs54('Muting a chat'); else fail('mute chat')(error);
    return false;
  },

  /**
   * Your reaction on a message, or taken back by sending the same one again.
   * Only your own reaction changes, so two people reacting at once both
   * stick; resolves with everyone's reactions as they now stand. On a
   * database without migration 54, `whole` (every reaction as this phone now
   * has it) is written the old way instead, and it resolves with that.
   * Resolves null when it was not saved.
   */
  async toggleReaction(messageId: ID, emoji: string, whole: Record<ID, string>): Promise<Record<ID, string> | null> {
    const db = need();
    const { data, error } = await db.rpc('toggle_reaction', { msg: messageId, emoji });
    if (!error) return data && typeof data === 'object' ? (data as Record<ID, string>) : {};
    if (!missingFunction(error)) { fail('message reaction')(error); return null; }
    const old = await db.from('messages').update({ reactions: whole }).eq('id', messageId);
    if (old.error) { fail('message reaction')(old.error); return null; }
    return whole;
  },

  /**
   * Resolves 'refused' when the database will not take it (a one-to-one chat
   * with someone you are blocked with, or a group you are no longer in).
   * Event lines ('system') are only ever written by the server, so one is
   * never sent from here.
   */
  async insertMessage(message: Message): Promise<'refused' | 'blocked' | 'failed' | void> {
    if (message.kind === 'system') return 'refused';
    const row: Record<string, unknown> = {
      id: message.id, conversation_id: message.conversationId, sender_id: message.senderId, body: message.body,
      kind: message.kind, shared_id: message.sharedId ?? null, created_at: message.createdAt,
      ...(message.place ? { place: message.place } : {}),
      ...(message.audio ? { audio_url: message.audio.url, audio_ms: Math.round(message.audio.ms) } : {}),
      // Only the shelf addresses and sizes go: never a file still on this phone.
      ...(message.photos ? { photos: message.photos.map((p) => ({ path: p.path, w: Math.round(p.w), h: Math.round(p.h) })) } : {}),
    };
    const db = need();
    let { error } = await db.from('messages').insert(message.replyToId ? { ...row, reply_to_id: message.replyToId } : row);
    // A database without replies yet (migration 75): the answer still goes, as a plain message.
    if (error && message.replyToId && (error.code === 'PGRST204' || error.code === '42703') && /reply_to_id/.test(error.message)) {
      ({ error } = await db.from('messages').insert(row));
    }
    if (error && error.code === '42501') return 'refused';
    // Sent twice (a retry after a slow first try that did land): it is there.
    if (error && error.code === '23505') return;
    // Refused for its words (migration 117): it would be refused on every try, so the app takes it back.
    if (error && isBlockedWords(error)) return 'blocked';
    if (error) { fail('message send')(error); return 'failed'; }
  },

  /** Whether a chat is with someone you are blocked with, either way (so it cannot be written in). */
  async isChatBlocked(conversationId: ID): Promise<boolean> {
    const { data, error } = await need().rpc('chat_is_blocked', { conv: conversationId });
    return !error && data === true;
  },

  /**
   * `upTo`: the newest message read, as the server dated it. A phone whose
   * clock runs behind the server's would otherwise save a read time from
   * before that message, and it would count as unread (and never "Seen").
   */
  async markConversationRead(conversationId: ID, me: ID, upTo?: string) {
    const now = Date.now();
    // A millisecond on: the server's dates carry finer time than the phone keeps.
    const newest = upTo ? Date.parse(upTo) + 1 : NaN;
    const readAt = new Date(newest > now ? newest : now).toISOString();
    const { error } = await need().from('conversation_members').update({ last_read_at: readAt }).eq('conversation_id', conversationId).eq('user_id', me);
    if (error) fail('mark read')(error);
  },

  /**
   * Records your date of birth (the first time only) and returns the account
   * type it makes: 'teen' or 'adult', 'under_13' when it is too young for an
   * account, or null when the database cannot say (its age check not added yet).
   */
  async setBirthDate(dob: string): Promise<'teen' | 'adult' | 'under_13' | null> {
    const { data, error } = await need().rpc('set_birth_date', { dob });
    if (error) {
      if (/under_13/.test(error.message)) return 'under_13';
      fail('birth date')(error);
      return null;
    }
    return data === 'teen' ? 'teen' : 'adult';
  },

  /**
   * Files a coach application. The résumé, if one is attached, goes first to
   * the private coach-applications shelf, in the applicant's own folder.
   * Throws with a readable message if either step fails.
   */
  async submitCoachApplication(me: ID, application: CoachApplication, resume?: { uri: string; name: string; mimeType?: string }) {
    const db = need();
    let resumePath: string | null = null;
    if (resume) {
      const bytes = await (await fetch(resume.uri)).arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error('That résumé is over 10 MB. Attach a smaller PDF or Word file.');
      const safeName = resume.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'resume.pdf';
      resumePath = `${me}/${Date.now().toString(36)}-${safeName}`;
      // The shelf takes PDF and Word files only (migration 100): named by the
      // file's ending when the phone's own label is something else or missing.
      const byEnding: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const ending = /\.([a-z]+)$/i.exec(safeName)?.[1]?.toLowerCase() ?? '';
      const told = (resume.mimeType ?? '').toLowerCase();
      const contentType = Object.values(byEnding).includes(told) ? told : byEnding[ending] ?? 'application/pdf';
      const { error } = await db.storage.from('coach-applications').upload(resumePath, bytes, { contentType, upsert: false });
      if (error) throw new Error(`The résumé did not upload: ${error.message}`);
    }
    const { error } = await db.from('coach_applications').insert({
      id: application.id, user_id: me, full_name: application.fullName, email: application.email, phone: application.phone,
      utr: application.utr ?? null, ntrp: application.ntrp ?? null, years_coaching: application.yearsCoaching,
      utr_link: application.utrLink ?? null, ntrp_link: application.ntrpLink ?? null,
      certifications: application.certifications, resume_path: resumePath, resume_name: resume?.name ?? null,
      current_clients: application.currentClients, specialties: application.specialties, reference_contacts: application.references,
      about: application.about, status: 'submitted',
    });
    if (error) throw new Error(/relation|schema cache/i.test(error.message) ? 'Applications are not switched on yet. Try again soon.' : error.message);
  },

  /**
   * New words for a message of yours; the database stamps it as edited.
   * Resolves whether it was saved: an update the database quietly turned
   * down changes no row, so that counts as not saved too.
   */
  async editMessage(messageId: ID, body: string): Promise<boolean | 'blocked'> {
    const { data, error } = await need().from('messages').update({ body }).eq('id', messageId).select('id');
    // Refused for its words (migration 117): the app says why instead of "didn't save".
    if (error && isBlockedWords(error)) return 'blocked';
    if (error) { fail('message edit')(error); return false; }
    return !!data?.length;
  },

  /** Unsend: gone for everyone in the chat. Resolves whether the server took it (one already gone counts). */
  async unsendMessage(messageId: ID): Promise<boolean> {
    const { error } = await need().from('messages').delete().eq('id', messageId);
    if (error) { fail('message unsend')(error); return false; }
    return true;
  },

  /** Delete for yourself: hidden from your view only. Resolves whether it was saved (one already hidden counts). */
  async hideMessage(me: ID, messageId: ID): Promise<boolean> {
    const { error } = await need().from('hidden_messages').insert({ user_id: me, message_id: messageId });
    // Already hidden, or not on the server at all (yours that never went): nothing more to hide.
    if (error && (error.code === '23505' || error.code === '23503')) return true;
    if (error) { fail('message delete')(error); return false; }
    return true;
  },

  /**
   * Whether the database can take photos in chats yet (migration 61): asked
   * by looking for the photos column, which costs nothing and reads no rows.
   * Null when there was no answer (no signal), which says nothing either way.
   */
  async chatPhotosReady(): Promise<boolean | null> {
    const { error } = await need().from('messages').select('photos').limit(0);
    if (!error) return true;
    if (error.code === '42703' || error.code === 'PGRST204' || /photos/.test(error.message)) {
      console.warn('[remote] Photos in chats need the chat photos update. Open Supabase → SQL Editor → New query, paste the file supabase/migrations/20261002000061_chat_photos.sql and press Run. It is safe to run more than once.');
      return false;
    }
    return null;
  },

  /**
   * Links that open chat photos for the next hour, by where each is kept.
   * The storage server only gives one to someone in that chat (migration 61);
   * a photo it will not open is simply missing from the answer. Null when
   * there was no answer at all (no signal).
   */
  async signChatPhotos(paths: string[]): Promise<Record<string, string> | null> {
    if (!paths.length) return {};
    const { data, error } = await need().storage.from(CHAT_PHOTOS).createSignedUrls(paths, CHAT_PHOTO_LINK_SECONDS);
    if (error) { fail('chat photo links')(error); return null; }
    const out: Record<string, string> = {};
    for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
    return out;
  },

  /** Takes your own chat photos down (after an unsend). Best effort: a photo left behind is still only for that chat. */
  async removeChatPhotos(paths: string[]) {
    if (!paths.length) return;
    const { error } = await need().storage.from(CHAT_PHOTOS).remove(paths);
    if (error) fail('chat photo remove')(error);
  },

  /**
   * Takes files of yours down from the public media shelf by their links (a
   * voice note unsent, or one whose message never went). Only links into
   * your own folder (the shelf lets you delete only those): a voice note
   * forwarded from someone else points at theirs, and is left alone. Best effort.
   */
  async removeMedia(me: ID, urls: string[]) {
    const mark = '/object/public/media/';
    const paths = urls
      .map((url) => { const at = url.indexOf(mark); return at < 0 ? '' : decodeURIComponent(url.slice(at + mark.length).split(/[?#]/)[0]); })
      .filter((path) => path.startsWith(`${me}/`));
    if (!paths.length) return;
    const { error } = await need().storage.from('media').remove(paths);
    if (error) fail('media remove')(error);
  },

  /** One conversation with its messages — for one that just started on another phone. Null when it cannot be had, for whatever reason. */
  async fetchConversation(me: ID, conversationId: ID): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const got = await remote.fetchConversationState(me, conversationId);
    return got === 'gone' ? null : got;
  },

  /**
   * One conversation as it stands now: its people, name, photo, admins, your
   * mute and its newest messages. 'gone' when the database answered and it
   * is not there for you (you were taken out of the group, or everyone left);
   * null when there was no answer (no signal), which says nothing either way.
   */
  async fetchConversationState(me: ID, conversationId: ID): Promise<{ conversation: Conversation; messages: Message[] } | 'gone' | null> {
    const db = need();
    const chat = (members: string) => db.from('conversations').select(`*, ${members}`).eq('id', conversationId).maybeSingle();
    const [first, msgs, pref] = await Promise.all([
      chat(MEMBERS_NOW),
      db.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(MESSAGE_PAGE),
      db.from('conversation_prefs').select('*').eq('conversation_id', conversationId),
    ]);
    // A database without member roles (migration 54) is asked again without them.
    const second = first.error ? await chat(MEMBERS_BEFORE_141) : first;
    const conv = second.error ? await chat(MEMBERS_BEFORE_54) : second;
    if (conv.error || msgs.error) return null;
    if (!conv.data) return 'gone';
    const rows = ((msgs.data ?? []) as MessageRow[]).reverse();
    // Which of them your Hidden words hid (migration 117): marked, and not counted as unread.
    const theirs = rows.filter((m) => m.sender_id !== me && m.kind !== 'system' && !!m.body?.trim()).map((m) => m.id);
    const heldIds = new Set(theirs.length ? await heldMessageIdsOf(theirs).catch(() => [] as ID[]) : []);
    const dm = toConversations(me, [conv.data as unknown as ConversationRow], rows, toMutes(pref.error ? [] : pref.data), heldIds);
    const messages = heldIds.size ? dm.messages.map((m) => (heldIds.has(m.id) ? { ...m, hiddenByWords: true } : m)) : dm.messages;
    return dm.conversations[0] ? { conversation: dm.conversations[0], messages } : null;
  },

  /**
   * The page of messages just before `before` in one chat, oldest first, for
   * scrolling up. `more` says whether there are older ones still. Messages
   * you deleted for yourself are left out, so a page can come short; a page
   * of nothing else is passed over for the one before it.
   */
  async fetchOlderMessages(me: ID, conversationId: ID, before: string): Promise<{ messages: Message[]; more: boolean } | null> {
    const db = need();
    const page = (until: string) => db.from('messages').select('*').eq('conversation_id', conversationId).lt('created_at', until).order('created_at', { ascending: false }).limit(MESSAGE_PAGE);
    const [members, first, hiddenRows] = await Promise.all([
      db.from('conversation_members').select('user_id, last_read_at').eq('conversation_id', conversationId),
      page(before),
      db.from('hidden_messages').select('message_id').eq('user_id', me),
    ]);
    const hidden = new Set(((hiddenRows.data ?? []) as { message_id: string }[]).map((r) => r.message_id));
    let msgs = first;
    let rows: MessageRow[] = [];
    let shown: MessageRow[] = [];
    for (let tries = 0; ; tries += 1) {
      if (msgs.error) { fail('older messages')(msgs.error); return null; }
      rows = (msgs.data ?? []) as MessageRow[];
      shown = rows.filter((m) => !hidden.has(m.id));
      if (shown.length || rows.length < MESSAGE_PAGE || tries >= 4) break;
      msgs = await page(rows[rows.length - 1].created_at);
    }
    const conv: ConversationRow = { id: conversationId, updated_at: before, conversation_members: (members.data ?? []) as ConversationRow['conversation_members'] };
    const dm = toConversations(me, [conv], shown.reverse());
    return { messages: await markHeld(me, dm.messages), more: rows.length === MESSAGE_PAGE };
  },

  /**
   * The follows around some people: whom they follow, and (with `andFollowers`)
   * who follows them. For a profile's follower list when it is opened, and for
   * "mutual" counts in search (whom the people you follow follow).
   */
  async fetchFollowEdges(userIds: ID[], andFollowers: boolean): Promise<{ followerId: ID; followingId: ID }[]> {
    const ids = userIds.filter((id) => UUID_RE.test(id)).slice(0, 150);
    if (!ids.length) return [];
    const db = need();
    const list = ids.join(',');
    const { data, error } = await allRows<Edge>((from, to) => db.from('follows').select('follower_id, following_id')
      .or(andFollowers ? `follower_id.in.(${list}),following_id.in.(${list})` : `follower_id.in.(${list})`).range(from, to), 10000);
    if (error) fail('follow lists')(error);
    return data.map((e) => ({ followerId: e.follower_id, followingId: e.following_id }));
  },

  /**
   * What the server says about each of these people (migration 64,
   * open_to_you): whether you may start a chat with them (or add them to a
   * group, or tag them). Never their age. Someone it would not answer about
   * (blocked either way, gone, or past the day's limit of people asked
   * about) is left out. Up to 100 a question, so a longer list is asked in
   * parts. Null when the database has no such question yet (before 64);
   * throws when it could not be asked, so nobody is taken as closed for want
   * of an answer.
   */
  async fetchOpenness(userIds: ID[]): Promise<Record<ID, Openness> | null> {
    const ids = Array.from(new Set(userIds.filter((id) => UUID_RE.test(id))));
    const out: Record<ID, Openness> = {};
    for (let at = 0; at < ids.length; at += 100) {
      const { data, error } = await need().rpc('open_to_you', { ids: ids.slice(at, at + 100) });
      if (error) {
        if (missingFunction(error)) return null;
        fail('open to you')(error);
        throw error;
      }
      for (const r of (data ?? []) as { user_id: string; chat: boolean | null }[]) out[r.user_id] = { chat: r.chat === true };
    }
    return out;
  },
  /**
   * Of these posts, the ones that may show on a court's page for you
   * (migration 64, shown_at_court: the teen rule, as court_rings counts
   * posts). Up to 100 a question, so a longer list is asked in parts. Null
   * when the database has no such question (before 64); throws when it could
   * not be asked.
   */
  async fetchShownAtCourt(postIds: ID[]): Promise<Set<ID> | null> {
    const ids = Array.from(new Set(postIds.filter((id) => UUID_RE.test(id))));
    const out = new Set<ID>();
    for (let at = 0; at < ids.length; at += 100) {
      const { data, error } = await need().rpc('shown_at_court', { post_ids: ids.slice(at, at + 100) });
      if (error) {
        if (missingFunction(error)) return null;
        fail('shown at court')(error);
        throw error;
      }
      for (const r of (data ?? []) as (string | { shown_at_court?: string })[]) {
        const id = typeof r === 'string' ? r : r?.shown_at_court;
        if (id) out.add(id);
      }
    }
    return out;
  },
  /**
   * Which of these people follow you right now. Whether a teen account is
   * open to you depends on it, and the app's own copy is from when it
   * opened, so the pickers ask again before showing a lock as final.
   */
  async fetchFollowersAmong(me: ID, userIds: ID[]): Promise<ID[]> {
    const ids = userIds.filter((id) => UUID_RE.test(id)).slice(0, 150);
    if (!ids.length || !UUID_RE.test(me)) return [];
    const { data, error } = await need().from('follows').select('follower_id').eq('following_id', me).in('follower_id', ids);
    // Thrown, not passed over: an empty answer would read as "nobody follows you" and lock them.
    if (error) { fail('follows')(error); throw error; }
    return ((data ?? []) as { follower_id: string }[]).map((r) => r.follower_id);
  },

  /* ------------------------------ reports (admins) ------------------------------ */

  /** Everyone on the waitlist, newest first. Only admins can read it; for anyone else it is empty. */
  /* --------------------------------------------------------------- health */

  /** A person's days and which sources are connected. Null while the tables do not exist yet. */
  async fetchHealth(me: ID): Promise<{ days: DailyHealth[]; connections: { provider: IntegrationProvider; lastSyncedAt?: string; readsWorkouts?: boolean; readsAllWorkouts?: boolean }[] } | null> {
    const db = need();
    const [d, c] = await Promise.all([
      db.from('health_days').select('*').eq('user_id', me).order('date', { ascending: false }).limit(60),
      db.from('health_connections').select('*').eq('user_id', me),
    ]);
    if (d.error || c.error) return null;
    const days = (d.data ?? []).map((r) => ({
      date: r.date as string, calories: r.calories ?? 0, proteinGrams: r.protein_g ?? 0, carbGrams: r.carb_g ?? 0, fatGrams: r.fat_g ?? 0,
      restingHeartRate: r.resting_hr ?? 0, hrvMs: r.hrv_ms ?? 0, sleepHours: Number(r.sleep_hours ?? 0), recovery: r.recovery ?? 0, steps: r.steps ?? 0,
      // Which source gave each number, so WHOOP's can be kept out of the AI coach.
      sources: (r.sources ?? {}) as Record<string, string>,
    }));
    return {
      days,
      connections: (c.data ?? []).map((r) => ({
        provider: r.provider as IntegrationProvider, lastSyncedAt: r.last_synced_at ?? undefined,
        // Tennis sessions switched on for this source (migration 58; never without it).
        readsWorkouts: r.reads_workouts === true,
        // Every workout too, its own yes (migration 107; never without it).
        readsAllWorkouts: r.reads_all_workouts === true,
      })),
    };
  },

  /** Writes only the numbers a source gave, leaving another source's numbers on the same day alone. */
  async upsertHealthDays(me: ID, days: (Partial<DailyHealth> & { date: string })[], source: IntegrationProvider) {
    const db = need();
    if (!days.length) return;
    const dates = days.map((d) => d.date);
    const { data: have } = await db.from('health_days').select('date, sources').eq('user_id', me).in('date', dates);
    const known = new Map((have ?? []).map((r) => [r.date as string, (r.sources ?? {}) as Record<string, string>]));
    const col: Record<string, string> = { calories: 'calories', proteinGrams: 'protein_g', carbGrams: 'carb_g', fatGrams: 'fat_g', restingHeartRate: 'resting_hr', hrvMs: 'hrv_ms', sleepHours: 'sleep_hours', recovery: 'recovery', steps: 'steps' };
    const rows = days.map((d) => {
      const row: Record<string, unknown> = { user_id: me, date: d.date, updated_at: new Date().toISOString() };
      const sources = { ...(known.get(d.date) ?? {}) };
      for (const [k, c] of Object.entries(col)) {
        const v = (d as Record<string, unknown>)[k];
        if (v !== undefined && v !== null) { row[c] = v; sources[c] = source; }
      }
      row.sources = sources;
      return row;
    });
    const { error } = await db.from('health_days').upsert(rows, { onConflict: 'user_id,date' });
    if (error) throw new Error(error.message);
  },

  /**
   * `readsWorkouts` turns tennis sessions on or off for a connected source
   * (migration 58); `readsAllWorkouts`, every other workout as well
   * (migration 107), only ever on the person's own yes to it.
   */
  async setHealthConnection(me: ID, provider: IntegrationProvider, connected: boolean, extra?: { readsWorkouts?: boolean; readsAllWorkouts?: boolean }) {
    const db = need();
    if (!connected) {
      const { error } = await db.from('health_connections').delete().match({ user_id: me, provider });
      if (error) throw new Error(error.message);
      return;
    }
    const cols: Record<string, boolean> = {};
    if (extra?.readsWorkouts !== undefined) cols.reads_workouts = extra.readsWorkouts;
    if (extra?.readsAllWorkouts !== undefined) cols.reads_all_workouts = extra.readsAllWorkouts;
    const tennis = Object.keys(cols).length > 0;
    // Turning tennis sessions on or off is not a sync, so it leaves "Synced …" as it was
    // (every caller has just made or already has the row).
    const row: Record<string, unknown> = tennis ? { user_id: me, provider } : { user_id: me, provider, last_synced_at: new Date().toISOString() };
    let { error } = await db.from('health_connections').upsert({ ...row, ...cols });
    // A database before migration 107 (or 58) has no such column: the rest is still saved.
    if (error && 'reads_all_workouts' in cols && /reads_all_workouts/.test(error.message)) {
      delete cols.reads_all_workouts;
      ({ error } = await db.from('health_connections').upsert({ ...row, ...cols }));
    }
    if (error && 'reads_workouts' in cols && /reads_workouts/.test(error.message)) {
      delete cols.reads_workouts;
      ({ error } = await db.from('health_connections').upsert({ ...row, ...cols }));
    }
    if (error) throw new Error(error.message);
  },

  /**
   * The WHOOP function on the server: start, sync, disconnect, and finish (a
   * tennis sign-in collected by this phone). `fresh` (migration 58): the
   * tennis sessions a sync just filed.
   */
  async whoop<T = { url?: string; days?: number; ok?: boolean; fresh?: ID[] }>(path: 'start' | 'finish' | 'sync' | 'disconnect', body: object = {}): Promise<T> {
    const { data, error } = await need().functions.invoke<T & { error?: string }>(`whoop/${path}`, { body });
    if (error) throw new Error('WHOOP is not reachable right now.');
    if (data && (data as { error?: string }).error) throw new Error((data as { error?: string }).error);
    return data as T;
  },

  /* ------------------------------------------------------ coach marketplace */

  fetchCoaching,
  /** Your bookings (as a player) and the paid ones sent to you (as a coach). */
  async fetchCoachingRequests(): Promise<CoachingRequest[]> {
    const { data, error } = await need().from('coaching_requests').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return ((data ?? []) as CoachingRequestRow[]).map(toCoachingRequest);
  },
  /**
   * Whether you agreed to the AI coach sending your details to Anthropic
   * (migration 115). False when you have not, or on a database without it.
   */
  async aiCoachConsent(me: ID): Promise<boolean> {
    const { data, error } = await need().from('ai_coach_consent').select('user_id').eq('user_id', me).maybeSingle();
    if (error) { if (!missingTable(error)) fail('ai coach consent')(error); return false; }
    return !!data;
  },
  /** Agree (or take it back). Resolves false when the database refused or does not have it yet. */
  async setAiCoachConsent(me: ID, agree: boolean): Promise<boolean> {
    const db = need();
    const { error } = agree
      ? await db.from('ai_coach_consent').upsert({ user_id: me }, { onConflict: 'user_id', ignoreDuplicates: true })
      : await db.from('ai_coach_consent').delete().eq('user_id', me);
    if (error) { fail('ai coach consent')(error); return false; }
    return true;
  },
  /** Is Stripe set up on the server? Null when the payments function is not there yet. */
  async paymentsStatus(): Promise<{ on: boolean; feePercent: number } | null> {
    const { data, error } = await need().functions.invoke<{ on: boolean; feePercent: number }>('coach-payments', { body: { mode: 'status' } });
    return error || !data ? null : data;
  },
  checkout: (serviceId: ID, question: string, back: string, videoUrl?: string) => coachPayments<{ url: string; requestId: ID }>('checkout', { serviceId, question, back, videoUrl }),
  confirmPayment: (requestId: ID) => coachPayments<{ paid: boolean }>('confirm', { requestId }),
  refundBooking: (requestId: ID) => coachPayments<{ refunded: boolean }>('refund', { requestId }),
  /** No `url` when payouts are already set up: nothing to send the coach to Stripe for. */
  connectPayouts: (back: string) => coachPayments<{ url?: string; ready: boolean }>('connect', { back }),
  checkPayouts: () => coachPayments<{ ready: boolean; started: boolean; due?: number }>('connect-check'),
  payoutDashboard: () => coachPayments<{ url: string }>('dashboard'),
  paymentsAdminStatus: () => coachPayments<{ stripe: boolean; live: boolean; webhook: boolean; feePercent: number }>('admin-status'),
  setupPaymentsWebhook: () => coachPayments<{ webhook: boolean }>('setup-webhook'),

  async answerBooking(requestId: ID, response: string) {
    const { error } = await need().rpc('answer_coaching_request', { p_request: requestId, p_response: response });
    if (error) throw new Error(isBlockedWords(error) ? BLOCKED_WORDS_NOTE : error.message);
  },
  async startBooking(requestId: ID) {
    await need().rpc('start_coaching_request', { p_request: requestId });
  },
  /** Your own listing: the words on it, and whether it is on the Coaching tab. */
  async updateCoach(coachId: ID, patch: Partial<Pick<Coach, 'headline' | 'credentials' | 'specialties' | 'yearsCoaching' | 'responseTimeHours' | 'listed'>>) {
    const row: Record<string, unknown> = {};
    if (patch.headline !== undefined) row.headline = patch.headline;
    if (patch.credentials !== undefined) row.credentials = patch.credentials;
    if (patch.specialties !== undefined) row.specialties = patch.specialties;
    if (patch.yearsCoaching !== undefined) row.years_coaching = patch.yearsCoaching;
    if (patch.responseTimeHours !== undefined) row.response_time_hours = patch.responseTimeHours;
    if (patch.listed !== undefined) row.listed = patch.listed;
    const { error } = await need().from('coaches').update(row).eq('id', coachId);
    if (error) throw new Error(isBlockedWords(error) ? BLOCKED_WORDS_NOTE : error.message);
  },
  /** Adds a service, or changes one; returns its id. */
  async saveService(coachId: ID, service: CoachService & { active?: boolean }, position: number): Promise<ID> {
    const row = {
      coach_id: coachId, title: service.title, description: service.description, price_cents: service.priceCents,
      turnaround_hours: service.turnaroundHours, kind: service.kind, active: service.active ?? true, position,
    };
    const isNew = !UUID_RE.test(service.id);
    const { data, error } = isNew
      ? await need().from('coach_services').insert(row).select('id').single()
      : await need().from('coach_services').update(row).eq('id', service.id).select('id').single();
    if (error) throw new Error(isBlockedWords(error) ? BLOCKED_WORDS_NOTE : /price_cents/.test(error.message) ? 'Prices run from $5 to $1,000.' : error.message);
    return (data as { id: string }).id;
  },
  async removeService(serviceId: ID) {
    const { error } = await need().from('coach_services').delete().eq('id', serviceId);
    if (error) throw new Error(error.message);
  },
  async insertCoachReview(review: CoachReview) {
    const { error } = await need().from('coach_reviews').insert({ id: review.id, coach_id: review.coachId, author_id: review.authorId, rating: review.rating, body: review.body });
    if (error) throw new Error(isBlockedWords(error) ? BLOCKED_WORDS_NOTE : /row-level security/.test(error.message) ? 'You can review a coach once they have answered one of your bookings.' : error.message);
  },
  async insertCoachResult(result: CoachResult) {
    const { error } = await need().from('coach_results').insert({ id: result.id, coach_id: result.coachId, client_name: result.clientName, focus: result.focus, before: result.before, after: result.after, weeks: result.weeks, note: result.note ?? null });
    if (error) throw new Error(isBlockedWords(error) ? BLOCKED_WORDS_NOTE : error.message);
  },
  /** Every application, for the admin's review screen. */
  async fetchAllApplications(): Promise<CoachApplication[]> {
    const { data, error } = await need().from('coach_applications').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return ((data ?? []) as CoachApplicationRow[]).map(toCoachApplication);
  },
  async approveCoach(applicationId: ID, note?: string) {
    const { error } = await need().rpc('approve_coach', { p_application: applicationId, p_note: note ?? null });
    if (error) throw new Error(/approve_coach|does not exist|schema cache/.test(error.message) ? 'Run migration 35 in Supabase first.' : error.message);
  },
  async rejectCoach(applicationId: ID, note?: string) {
    const { error } = await need().rpc('reject_coach', { p_application: applicationId, p_note: note ?? null });
    if (error) throw new Error(error.message);
  },
  /** A short-lived link to an applicant's résumé (admins only). */
  async resumeLink(path: string): Promise<string | null> {
    const { data } = await need().storage.from('coach-applications').createSignedUrl(path, 600);
    return data?.signedUrl ?? null;
  },

  /* -------------------------------------------------------------- handles */

  /**
   * Whether a handle is free, for the live check as you type: ok, yours,
   * invalid, taken, or held (let go by someone under 14 days ago). Null
   * when the database has no such check yet (migration 34 not run).
   */
  async handleStatus(handle: string): Promise<HandleStatus | null> {
    const { data, error } = await need().rpc('handle_status', { p_handle: handle });
    if (error) return null;
    return data as HandleStatus;
  },

  /** Changes this account's handle. Throws with the database's own plain-English reason when it cannot. */
  async changeHandle(handle: string): Promise<string> {
    const { data, error } = await need().rpc('change_handle', { p_handle: handle });
    if (error) {
      if (/change_handle|function .* does not exist|schema cache/i.test(error.message)) {
        throw new Error('Changing handles is not open yet. Try again soon.');
      }
      if (isBlockedWords(error)) throw new Error(BLOCKED_WORDS_NOTE);
      throw new Error(error.message);
    }
    return String(data);
  },

  /**
   * The tournament plans you may see now (migration 123), by person: yours
   * and those of people you follow who follow you back. Undefined on a
   * database without it, or when it could not be asked.
   */
  async fetchTournamentPlans(): Promise<Map<ID, TournamentEntry[]> | undefined> {
    return fetchPlans();
  },

  /* -------------------------------------------------------------- invites */

  /**
   * Claims the invite this person joined through. Answered: `followed` is who
   * was followed (null when no follow was made, or nothing was credited).
   * Not answered (offline, a server hiccup): `ok: false`, so the handle is
   * kept and tried again rather than lost.
   */
  async claimReferral(handle: string): Promise<{ ok: true; followed: ID | null } | { ok: false }> {
    const { data, error } = await need().rpc('claim_referral', { p_handle: handle });
    if (error) return { ok: false };
    return { ok: true, followed: (data as ID | null) ?? null };
  },

  /** Who invited me (migration 80), and whether a code may still be typed. Null when unknown. */
  async myInviter(): Promise<MyInviter | null> {
    const { data, error } = await need().rpc('my_inviter');
    if (error || !data) return null;
    return data as MyInviter;
  },

  /** "Invited by?" at setup: the inviter's @handle, claimed as an invite link would be (once, never changed). */
  async claimInviteCode(code: string): Promise<InviteCodeResult> {
    const { data, error } = await need().rpc('claim_invite_code', { p_code: code });
    if (error) return { error: 'offline' };
    return (data ?? { error: 'not-found' }) as InviteCodeResult;
  },

  /** Once the birthday says adult: the follow an invite waited on (follow_my_inviter). Who was followed, or null when nothing was made. */
  async followMyInviter(): Promise<ID | null> {
    const { data, error } = await need().rpc('follow_my_inviter');
    if (error) return null;
    return (data as ID | null) ?? null;
  },

  async countReferrals(me: ID): Promise<number> {
    const { count, error } = await need().from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', me);
    if (error) return 0;
    return count ?? 0;
  },

  /**
   * Which of these phone numbers and emails (from the phone's contacts) are
   * CourtSide players (migration 88). Nothing sent is kept. 'limit' after 10
   * checks in a day; null when the server does not have it yet.
   */
  async matchContacts(phones: string[], emails: string[]): Promise<ContactMatch[] | 'limit' | null> {
    const { data, error } = await need().rpc('match_contacts', { p_phones: phones.slice(0, 3000), p_emails: emails.slice(0, 3000) });
    if (error || !data) return null;
    const result = data as { matches?: ContactMatch[]; error?: string };
    if (result.error === 'limit') return 'limit';
    return result.matches ?? null;
  },
  /** The phone number linked to this account and confirmed by text, in +digits form, or null. */
  async myPhone(): Promise<string | null> {
    const { data } = await need().auth.getUser();
    const phone = data.user?.phone_confirmed_at ? data.user.phone : '';
    return phone ? `+${phone.replace(/^\+/, '')}` : null;
  },
  /** Texts a 6-digit code to this number; confirmPhoneLink finishes the link. Throws a readable message. */
  async startPhoneLink(phone: string) {
    const { error } = await need().auth.updateUser({ phone });
    if (error) throw new Error(phoneError(error.message));
  },
  async confirmPhoneLink(phone: string, code: string) {
    const { error } = await need().auth.verifyOtp({ phone, token: code, type: 'phone_change' });
    if (error) throw new Error(phoneError(error.message));
  },
  async unlinkPhone() {
    const { error } = await need().rpc('unlink_my_phone');
    if (error) throw new Error('That did not go through. Try again.');
  },
  /** Everyone who joined through my link or code: counted, or what is still missing (migration 85). Null while the function is missing. */
  async fetchMyInvitees(): Promise<Invitee[] | null> {
    const { data, error } = await need().rpc('my_invitees');
    if (error || !Array.isArray(data)) return null;
    return data as Invitee[];
  },
  /**
   * My own numbers as an affiliate (migration 147): earned, paid, owed, counted.
   * Null for everyone who is not on the server's affiliates list, and while the
   * function is missing or could not be asked: the Invites page is then the plain one.
   */
  async fetchMyAffiliate(): Promise<AffiliateStats | null> {
    const { data, error } = await need().rpc('my_affiliate_stats');
    if (error || !data || typeof data !== 'object') return null;
    const row = data as Partial<AffiliateStats> & { affiliate?: boolean };
    if (row.affiliate !== true) return null;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const paidCents = n(row.paidCents);
    const owedCents = n(row.owedCents);
    return {
      invited: n(row.invited), qualified: n(row.qualified), paid: n(row.paid), paidCents, owed: n(row.owed), owedCents,
      earnedCents: n(row.earnedCents) || paidCents + owedCents, rateCents: n(row.rateCents) || 100,
      lastPaidAt: typeof row.lastPaidAt === 'string' ? row.lastPaidAt : undefined,
    };
  },

  /**
   * "Opened the app today" (migration 110): one row per person per day, for
   * the owner's day-1 / day-7 return numbers. `day` is the phone's own date.
   * Never throws: 'missing' while the database does not have it yet, 'failed'
   * for anything else (offline, a hiccup), so the caller can try again later.
   */
  async noteAppOpen(platform: 'ios' | 'android' | 'web' | 'other', day: string): Promise<'ok' | 'missing' | 'failed'> {
    try {
      const { error } = await need().rpc('note_app_open', { p_platform: platform, p_day: day });
      if (!error) return 'ok';
      return missingFunction(error) ? 'missing' : 'failed';
    } catch {
      return 'failed';
    }
  },

  /** Whether the first move works: day-one movers, and week-two returns for movers vs everyone else. Null while the function is missing. */
  async fetchFirstDayStats(): Promise<FirstDayStats | null> {
    const { data, error } = await need().rpc('first_day_stats');
    if (error || !data) return null;
    return data as FirstDayStats;
  },

  /** Admin: everyone who has invited anyone, with what is owed. Throws (so the page can say so) when refused or missing. */
  async fetchInviteSummary(): Promise<InviteSummaryRow[]> {
    const { data, error } = await need().rpc('admin_invite_summary');
    if (error) throw new Error(missingFunction(error) ? 'The Invites page needs migration 71 in Supabase.' : error.message);
    return (data ?? []) as InviteSummaryRow[];
  },
  /** Admin: the people one person brought. */
  async fetchInvitees(referrer: ID): Promise<InviteeRow[]> {
    const { data, error } = await need().rpc('admin_invitees', { referrer });
    if (error) throw new Error(missingFunction(error) ? 'The Invites page needs migration 71 in Supabase.' : error.message);
    return (data ?? []) as InviteeRow[];
  },
  /** Admin: records a payout covering `count` qualified players. The server refuses more than is owed, and anyone not an affiliate (migration 156). */
  async markInvitesPaid(referrer: ID, count: number, note?: string): Promise<void> {
    const { error } = await need().rpc('admin_mark_invites_paid', { referrer, count, note: note ?? null });
    if (error) {
      throw new Error(/only \d+ owed/.test(error.message) ? 'Some of that was already marked paid. The numbers are refreshed.'
        : /not an affiliate/.test(error.message) ? 'They are not on the affiliates list, so nothing is owed to them.'
        : error.message);
    }
  },

  /** Just enough of some posts to show them small: their picture and what kind they are. For notifications. */
  async fetchPostThumbs(ids: ID[]): Promise<Record<ID, { thumb?: string; kind: Post['kind'] }>> {
    const wanted = ids.filter((id) => UUID_RE.test(id)).slice(0, 100);
    if (!wanted.length) return {};
    const { data, error } = await need().from('posts').select('id, kind, image_url, thumbnail_url').in('id', wanted);
    if (error || !data) return {};
    return Object.fromEntries((data as { id: string; kind: Post['kind']; image_url: string | null; thumbnail_url: string | null }[])
      .map((r) => [r.id, { thumb: r.thumbnail_url ?? r.image_url ?? undefined, kind: r.kind }]));
  },
  /** What was posted at a court: posts tagged within a few hundred feet of it, newest first. Empty before migration 51. */
  async fetchCourtPosts(at: { lat: number; lng: number }): Promise<Post[]> {
    const { data, error } = await need().from('posts').select('*')
      .gte('court_lat', at.lat - 0.0025).lte('court_lat', at.lat + 0.0025)
      .gte('court_lng', at.lng - 0.003).lte('court_lng', at.lng + 0.003)
      .eq('archived', false).order('created_at', { ascending: false }).limit(12);
    if (error || !data) return [];
    return (data as PostRow[]).map(toPost);
  },
  /**
   * A court's own page: the posts tagged there, a page at a time, newest
   * first. Whole posts (likes, saves, comments), so they join the app's and
   * open in a reel. The box is just past 0.15 mi each way, on the court-spot
   * index; the app then keeps only those within 0.15 mi. `oldest` is the
   * next page's cursor, taken before removed posts are dropped.
   */
  async fetchCourtPage(at: { lat: number; lng: number }, before?: string): Promise<{ posts: Post[]; comments: Comment[]; more: boolean; oldest: string | null } | null> {
    const dLat = 0.0022; // ≈ 245 m, just past 0.15 mi
    const dLng = dLat / Math.max(0.2, Math.cos((at.lat * Math.PI) / 180));
    let q = need().from('posts').select(POST_SELECT)
      .gte('court_lat', at.lat - dLat).lte('court_lat', at.lat + dLat)
      .gte('court_lng', at.lng - dLng).lte('court_lng', at.lng + dLng)
      .eq('archived', false);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(POST_PAGE);
    if (error) { fail('court posts')(error); return null; }
    const rows = (data ?? []) as FullPostRow[];
    return { ...(await toPostsHeld(rows)), more: rows.length === POST_PAGE, oldest: rows.length ? rows[rows.length - 1].created_at : null };
  },
  /** One post by id, for a page opened from a link before the feed has it. */
  async fetchPost(id: ID): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await need().from('posts').select(POST_SELECT).eq('id', id).limit(1);
    if (error || !data?.length) return null;
    return toPostsHeld(data as FullPostRow[]);
  },

  /** First posts from the last month, newest first: the founder's list of people to welcome. */
  async fetchFirstPosts(): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await need().from('posts').select(POST_SELECT).eq('is_first', true).gte('created_at', since).order('created_at', { ascending: false }).limit(80);
    if (error) return null;
    return toPostsHeld((data ?? []) as FullPostRow[]);
  },

  async fetchWaitlist(): Promise<WaitlistEntry[]> {
    const { data, error } = await allRows<{ id: string; email: string; name: string | null; source: string | null; referred_by: string | null; created_at: string }>(
      (from, to) => need().from('waitlist').select('id, email, name, source, referred_by, created_at').order('created_at', { ascending: false }).range(from, to), 20000);
    if (error) { fail('waitlist')(error); return []; }
    return data.map((r) => ({ id: r.id, email: r.email, name: r.name ?? undefined, source: r.source ?? undefined, referredBy: r.referred_by ?? undefined, createdAt: r.created_at }));
  },
  /** The beta invite email: the counts, or (send) mail everyone still waiting, top of the list first. Admins only. */
  async betaInvites(send: boolean): Promise<BetaInviteStatus | null> {
    const { data, error } = await need().functions.invoke('waitlist-welcome', { body: { invite: true, dry: !send } });
    if (error || !data || typeof (data as BetaInviteStatus).total !== 'number') { if (error) fail('beta invites')(error); return null; }
    return data as BetaInviteStatus;
  },
  /** Notes left in the build log's feedback box, newest first. Admins only. */
  async fetchSiteFeedback(): Promise<SiteFeedback[]> {
    const { data, error } = await need().from('site_feedback').select('id, message, email, created_at').order('created_at', { ascending: false }).limit(500);
    if (error) { fail('site feedback')(error); return []; }
    return ((data ?? []) as { id: string; message: string; email: string | null; created_at: string }[])
      .map((r) => ({ id: r.id, message: r.message, email: r.email ?? undefined, createdAt: r.created_at }));
  },

  /** Takes one row off the waitlist or out of the feedback box. Admins only; resolves false when refused. */
  async removeFromWaitlistPage(table: 'waitlist' | 'site_feedback', id: string): Promise<boolean> {
    const { data, error } = await need().from(table).delete().eq('id', id).select('id');
    if (error) { fail('remove from ' + table)(error); return false; }
    return (data ?? []).length > 0;
  },

  /**
   * How many reports are open, for Settings' Reports row: the database counts
   * them (no rows come back), on the status index. Only admins can read
   * reports, so anyone else gets 0. Null when it could not be counted.
   */
  async countOpenReports(): Promise<number | null> {
    const { count, error } = await need().from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
    if (error) { fail('open reports')(error); return null; }
    return count ?? 0;
  },

  /** Every report, newest first. Only admins can read them; for anyone else the list is empty. Null when they could not be loaded. */
  async fetchReports(): Promise<AdminReport[] | null> {
    const { data, error } = await need().from('reports').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) { fail('reports')(error); return null; }
    return ((data ?? []) as ReportRow[]).map((r) => {
      const [kind, id] = (r.target ?? '').split(':');
      // A report about one message names it in the reason ("message:<id>"); the card points at it.
      const messageId = /^message:([0-9a-f-]{36})$/i.exec(r.reason ?? '')?.[1];
      // A reported AI coach answer or week (ai-coach.tsx) has nothing to open: the card says what it said.
      const aiWords = kind === 'ai-reply' || kind === 'ai-plan' ? (r.target ?? '').slice(kind.length + 1) : undefined;
      return {
        id: r.id, reporterId: r.reporter_id ?? undefined, userId: r.target_user_id ?? undefined,
        kind: aiWords !== undefined ? 'ai-coach' : (ITEM_KINDS as string[]).includes(kind) || (OTHER_KINDS as string[]).includes(kind) || kind === 'conversation' ? kind as AdminReport['kind'] : 'profile', targetId: aiWords === undefined ? id || undefined : undefined,
        // A message report's reason is only its id: the card marks the message itself.
        messageId, reason: messageId ? undefined : aiWords !== undefined ? `AI coach ${kind === 'ai-plan' ? 'week' : 'answer'}: “${aiWords}”` : r.reason || undefined,
        createdAt: r.created_at, status: (r.status ?? 'open') as AdminReport['status'], reviewedAt: r.reviewed_at ?? undefined,
      };
    });
  },
  /**
   * What was reported, as it stands: a post or hit (removed or not: admins
   * can see removed ones), or the words of a thread, reply, comment or coach
   * question or reply, and why it was taken down. Null when it is gone.
   */
  async fetchReportedItem(kind: ReportedItemKind, id: ID): Promise<ReportedItem | null> {
    // An open hit's own read rules have no exception for admins (a teen's,
    // an invite-only one, someone blocked): the database hands over this one
    // hit, and only once it is reported (migration 126), as for a chat.
    if (kind === 'hit-request') {
      const { data, error } = await need().rpc('report_hit_context', { hit: id });
      if (!error) {
        if (!data || typeof data !== 'object') return null;
        const raw = data as { note?: unknown; place?: unknown };
        const words = [typeof raw.note === 'string' ? raw.note : null, typeof raw.place === 'string' && raw.place.trim() ? `At ${raw.place}` : null]
          .filter((x): x is string => !!x && !!x.trim()).join(' · ');
        return { body: words, removed: false };
      }
      // Before migration 126: whatever the admin's own read rules let through.
      if (!missingFunction(error)) { fail('reported hit')(error); return null; }
    }
    const tables: Record<ReportedItemKind, string[]> = {
      post: ['posts'], hit: ['stories'], 'hit-request': ['hit_requests'], question: ['questions'], answer: ['answers'],
      // A comment is under a post or under a hit: whichever has it.
      comment: ['comments', 'story_comments'], 'coach-question': ['coach_questions'], 'coach-reply': ['coach_replies'],
      // A tip on the tips board (account sweep, Oct 5).
      tip: ['tips'],
    };
    for (const table of tables[kind]) {
      const { data, error } = await need().from(table).select('*').eq('id', id).maybeSingle();
      if (error || !data) continue;
      const row = data as { title?: string | null; body?: string | null; caption?: string | null; image_url?: string | null; thumbnail_url?: string | null; note?: string | null; place?: { name?: unknown } | null; post_id?: string | null; story_id?: string | null; question_id?: string | null } & RemovedColumns;
      // An open hit has no words but its note, so its place goes with them.
      const where = table === 'hit_requests' && typeof row.place?.name === 'string' ? `At ${row.place.name}` : null;
      const words = [row.title, row.body ?? row.caption ?? row.note, where].filter((x): x is string => !!x && !!x.trim()).join(' · ');
      const removed = removedOf(row);
      // A comment, reply or coach reply opens where it sits: its post or Instant, its thread, its question.
      const parentId = kind === 'comment' ? row.story_id ?? row.post_id ?? undefined : kind === 'answer' || kind === 'coach-reply' ? row.question_id ?? undefined : undefined;
      return {
        body: words, picture: row.thumbnail_url ?? row.image_url ?? undefined, removed: !!removed, ...(removed ? { reason: removed.reason } : {}),
        ...(parentId ? { parentId } : {}), ...(table === 'story_comments' ? { onHit: true } : {}),
      };
    }
    return null;
  },
  /**
   * A reported chat, for the admin's Reports screen: admins cannot read
   * chats they are not in, so the database hands over just this much, and
   * only for a chat someone reported. Null when it is gone, or on a
   * database without it yet (migration 54).
   */
  async fetchReportedChat(conversationId: ID): Promise<ReportedChat | null> {
    const { data, error } = await need().rpc('report_chat_context', { conv: conversationId });
    if (error) { if (!missingFunction(error)) fail('reported chat')(error); return null; }
    if (!data || typeof data !== 'object') return null;
    const raw = data as { title?: unknown; is_group?: unknown; members?: unknown; messages?: unknown };
    const lines = Array.isArray(raw.messages) ? raw.messages as { id?: unknown; sender?: unknown; body?: unknown; kind?: unknown; created_at?: unknown; photos?: unknown }[] : [];
    return {
      title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : undefined,
      isGroup: raw.is_group === true,
      memberIds: Array.isArray(raw.members) ? raw.members.filter((m): m is string => typeof m === 'string') : [],
      messages: lines
        .filter((m) => typeof m.sender === 'string' && typeof m.created_at === 'string')
        .map((m) => ({
          id: typeof m.id === 'string' ? m.id : undefined,
          senderId: m.sender as string, body: typeof m.body === 'string' ? m.body : '', kind: typeof m.kind === 'string' ? m.kind : 'text', createdAt: m.created_at as string,
          photos: m.kind === 'photo' ? toChatPhotos(m.photos) : undefined,
        })),
    };
  },
  /**
   * An admin takes one message out of a reported chat (an abusive photo,
   * say): gone for everyone in it at once, then its photos are taken off the
   * private shelf (migration 61 lets an admin do both, for a reported chat
   * only). False when the database refused.
   */
  async removeReportedMessage(messageId: ID): Promise<boolean> {
    const { data, error } = await need().rpc('remove_reported_message', { msg: messageId });
    if (error) { fail('remove reported message')(error); return false; }
    const paths = Array.isArray(data) ? data.filter((p): p is string => typeof p === 'string') : [];
    if (paths.length) {
      // Already closed to everyone with the message gone; this only frees the space.
      const { error: gone } = await need().storage.from(CHAT_PHOTOS).remove(paths);
      if (gone) fail('remove reported photos')(gone);
    }
    return true;
  },
  /** The copy of a reported chat kept for its report (migration 115), oldest first. Admins only; none before that migration. */
  async fetchReportEvidence(reportId: ID): Promise<ReportEvidence[]> {
    const { data, error } = await need().from('report_evidence').select('message_id, sender_id, kind, body, photos, sent_at, why')
      .eq('report_id', reportId).order('sent_at', { ascending: true }).limit(200);
    if (error) { if (!missingTable(error)) fail('report evidence')(error); return []; }
    type Row = { message_id: string | null; sender_id: string | null; kind: string | null; body: string | null; photos: unknown; sent_at: string | null; why: ReportEvidence['why'] };
    return ((data ?? []) as Row[]).map((r) => ({
      messageId: r.message_id ?? undefined, senderId: r.sender_id ?? undefined, kind: r.kind ?? 'text', body: r.body ?? '',
      photos: r.kind === 'photo' ? toChatPhotos(r.photos) : undefined, sentAt: r.sent_at ?? undefined, why: r.why,
    }));
  },
  /** An admin's decision on a report. Resolves false when the database refused. */
  async moderateReport(reportId: ID, decision: 'remove' | 'restore' | 'suspend' | 'unsuspend' | 'dismiss'): Promise<boolean> {
    const { error } = await need().rpc('moderate_report', { report: reportId, decision });
    if (error) { fail('moderate')(error); return false; }
    return true;
  },
  /**
   * An admin takes something down (take_down, migration 108): hidden from
   * everyone but its author and the admins, and its author told why. See
   * ModerationResult for the answers.
   */
  async takeDown(kind: TakedownKind, id: ID, reason: TakedownReason, note?: string): Promise<ModerationResult> {
    const words = note?.replace(/\s+/g, ' ').trim().slice(0, 200);
    const { error } = await need().rpc('take_down', { p_kind: kind, p_id: id, p_reason: reason, p_note: words || null });
    return moderationResult(error, 'take down');
  },
  /** An admin puts it back exactly as it was (restore_content, migration 108). */
  async restoreContent(kind: TakedownKind, id: ID): Promise<ModerationResult> {
    const { error } = await need().rpc('restore_content', { p_kind: kind, p_id: id });
    return moderationResult(error, 'restore');
  },
  /** Settings → Admin → Removed: everything taken down, newest first (admin_removed, migration 108). */
  async fetchRemoved(): Promise<RemovedItem[] | 'not_ready' | null> {
    const { data, error } = await need().rpc('admin_removed');
    if (error) { if (missingFunction(error)) return 'not_ready'; fail('removed list')(error); return null; }
    type Raw = { kind?: unknown; id?: unknown; parent_id?: unknown; author_id?: unknown; preview?: unknown; picture?: unknown; reason?: unknown; note?: unknown; removed_at?: unknown; removed_by?: unknown };
    const rows: Raw[] = Array.isArray(data) ? (data as Raw[]) : [];
    const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    return rows.flatMap((r): RemovedItem[] => {
      const kind = asKind(r.kind);
      const id = text(r.id);
      const authorId = text(r.author_id);
      const removedAt = text(r.removed_at);
      if (!kind || !id || !authorId || !removedAt) return [];
      return [{
        kind, id, authorId, removedAt, preview: text(r.preview) ?? '', reason: asReason(r.reason),
        parentId: text(r.parent_id), picture: text(r.picture), note: text(r.note), removedBy: text(r.removed_by),
      }];
    });
  },
  /**
   * Your own asks for a review (review_requests, migration 20261006000139),
   * newest first; or, for an admin with `open`, every ask still waiting.
   * 'not_ready' on a database without that migration; null when it failed.
   */
  async fetchReviewRequests(who: { mine: ID } | { open: true }): Promise<ReviewRequest[] | 'not_ready' | null> {
    let ask = need().from('review_requests').select(REVIEW_COLUMNS);
    ask = 'mine' in who ? ask.eq('author_id', who.mine) : ask.eq('status', 'open');
    const { data, error } = await ask.order('created_at', { ascending: false }).limit(300);
    if (error) { if (missingTable(error)) return 'not_ready'; fail('review requests')(error); return null; }
    return ((data ?? []) as ReviewRow[]).flatMap(toReviewRequest);
  },
  /**
   * The author asks CourtSide to look again (request_review): once per
   * take-down. See ReviewAskResult for the answers.
   */
  async requestReview(kind: TakedownKind, id: ID, note?: string): Promise<ReviewAskResult> {
    const words = note?.replace(/\s+/g, ' ').trim().slice(0, REVIEW_NOTE_MAX).trim();
    const { error } = await need().rpc('request_review', { p_kind: kind, p_id: id, p_note: words || null });
    if (!error) return 'done';
    if (missingFunction(error)) return 'not_ready';
    if (/already asked/.test(error.message)) return 'already';
    if (/not removed/.test(error.message)) return 'not_removed';
    if (/not yours/.test(error.message)) return 'not_yours';
    if (/not found/.test(error.message)) return 'gone';
    fail('request review')(error);
    return 'failed';
  },
  /** An admin looked again and it stays down (keep_removed): its author is told. 'no_request' when nothing about it was waiting. */
  async keepRemoved(kind: TakedownKind, id: ID): Promise<'done' | 'no_request' | ModerationResult> {
    const { data, error } = await need().rpc('keep_removed', { p_kind: kind, p_id: id });
    if (error) return moderationResult(error, 'keep removed');
    return data === 'no_request' ? 'no_request' : 'done';
  },

  /* ------------------------------ more posts ------------------------------ */

  /**
   * The page of feed posts just older than `before`, newest first, for when
   * the feed nears the end of what is loaded. `more` says whether there are
   * older ones still. Posts someone put away are left out: the feed never
   * shows them, and your own come with your profile instead.
   */
  async fetchMorePosts(before: string): Promise<{ posts: Post[]; comments: Comment[]; more: boolean } | null> {
    const { data, error } = await need().from('posts').select(POST_SELECT)
      .lt('created_at', before).eq('archived', false)
      .order('created_at', { ascending: false }).limit(POST_PAGE);
    if (error) { fail('more posts')(error); return null; }
    const rows = (data ?? []) as FullPostRow[];
    return { ...(await toPostsHeld(rows)), more: rows.length === POST_PAGE };
  },

  /**
   * Search, for posts the app has not loaded yet: the 30 newest whose words
   * or place contain what was typed, or that carry it as a tag. Characters
   * the query language reserves (and the wildcards) become "any one
   * character", so "4.0" or "Pullen, Park" still find themselves.
   */
  async searchPosts(term: string): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    const words = term.trim().replace(/^#/, '');
    const like = words.replace(/[%_*,.:()"'\\]/g, '_');
    if (like.replace(/_/g, '').length < 2) return null;
    const tag = words.toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '');
    const either = [`body.ilike.%${like}%`, `location.ilike.%${like}%`, ...(tag ? [`tags.cs.{${tag}}`] : [])].join(',');
    const { data, error } = await need().from('posts').select(POST_SELECT)
      .eq('archived', false).or(either)
      .order('created_at', { ascending: false }).limit(30);
    if (error) { fail('search posts')(error); return null; }
    return toPostsHeld((data ?? []) as FullPostRow[]);
  },

  /**
   * Everything one player has posted, newest first, plus the posts they were
   * tagged in — so their grid and their counts are whole however old the
   * posts are. Your own put-away posts come too (nobody else's do: the
   * database does not hand them over).
   */
  async fetchUserPosts(userId: ID): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    if (!UUID_RE.test(userId)) return null;
    const db = need();
    const [own, tagged, played, unlisted] = await Promise.all([
      allRows<FullPostRow>((from, to) => db.from('posts').select(POST_SELECT).eq('author_id', userId).order('created_at', { ascending: false }).range(from, to), 3000),
      db.from('posts').select(POST_SELECT).contains('tagged_user_ids', [userId]).order('created_at', { ascending: false }).limit(300),
      // Posts whose session they accepted a tag on (migration 62). The value
      // goes as JSON text: handed an array, the client would write it as a
      // Postgres array ({…}), which a jsonb column cannot compare. Only once
      // the server is known to write these lists itself: before 62 a phone
      // could write any list, so it is never searched.
      sessionTagNamesLive()
        ? db.from('posts').select(POST_SELECT).contains('session->with', JSON.stringify([{ id: userId }])).order('created_at', { ascending: false }).limit(300)
        : Promise.resolve({ data: [] as FullPostRow[], error: null }),
      // Since migration 124 a player not known to be an adult is no longer
      // named on other people's posts themselves: the server says which posts
      // carry a session they played, and only to them, the post's author and
      // the people they follow. Nothing (an error) on a database without it.
      sessionTagNamesLive()
        ? db.rpc('session_minor_posts', { who: userId })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (own.error) { fail('their posts')(own.error); return null; }
    if (tagged.error) fail('tagged posts')(tagged.error);
    if (played.error) fail('session-tagged posts')(played.error);
    const rows = [...own.data, ...((tagged.data ?? []) as FullPostRow[]), ...((played.data ?? []) as FullPostRow[])];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const entries = unlisted.error ? [] : sessionEntries(unlisted.data);
    // The posts not already here, a handful at a time (one long list of ids makes a web address the database refuses).
    const missing = [...new Set(entries.map((e) => e.postId))].filter((id) => !byId.has(id));
    for (let at = 0; at < missing.length; at += 100) {
      const { data, error } = await db.from('posts').select(POST_SELECT).in('id', missing.slice(at, at + 100));
      if (error) { fail('session-tagged posts')(error); break; }
      for (const row of (data ?? []) as FullPostRow[]) byId.set(row.id, row);
    }
    for (const { postId, entry } of entries) {
      const row = byId.get(postId);
      if (row) byId.set(postId, withSessionPlayer(row, entry));
    }
    return toPostsHeld([...byId.values()]);
  },
  /**
   * Your own posts from the last two months that carry a session, put away
   * ones included, for "Already posted": one session goes on one post, and
   * the app may hold only the newest few of yours (the feed's first page, or
   * your profile once it has been opened). Null when they could not be read.
   */
  async fetchMySessionPosts(me: ID): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    if (!UUID_RE.test(me)) return null;
    const db = need();
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const { data, error } = await db.from('posts').select(POST_SELECT).eq('author_id', me).not('session', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(200);
    if (error) { fail('your session posts')(error); return null; }
    return toPostsHeld(data as FullPostRow[]);
  },

  /**
   * Sessions posted to everyone in the last three weeks, newest first (any
   * author; not archived, not shared to a group only), for Activities' "Near
   * you" (features/activity/nearYou). What comes back is only what the
   * posts table already lets this account read; the app then keeps only
   * players near you whom the teen rules let it show.
   */
  async fetchRecentSessionPosts(): Promise<{ posts: Post[]; comments: Comment[] } | null> {
    const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
    const { data, error } = await need().from('posts').select(POST_SELECT).not('session', 'is', null).is('group_id', null).eq('archived', false)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(80);
    if (error) { fail('recent session posts')(error); return null; }
    return toPostsHeld(data as FullPostRow[]);
  },

  /**
   * The posts this player bookmarked, however far back they go, so nothing
   * quietly drops off the Saved page once the app holds more than it opened
   * with.
   */
  async fetchSavedPosts(me: ID): Promise<{ posts: Post[]; comments: Comment[]; ids: ID[] } | null> {
    const db = need();
    const saves = await allRows<{ post_id: string }>((from, to) => db.from('post_saves').select('post_id, created_at').eq('user_id', me).order('created_at', { ascending: false }).range(from, to), 3000);
    if (saves.error) { fail('saved posts')(saves.error); return null; }
    const ids = saves.data.map((row) => row.post_id);
    const rows: FullPostRow[] = [];
    // Asked for in handfuls: one long list of ids makes a web address the
    // database refuses.
    for (let at = 0; at < ids.length; at += 100) {
      const { data, error } = await db.from('posts').select(POST_SELECT).in('id', ids.slice(at, at + 100));
      if (error) { fail('saved posts')(error); break; }
      rows.push(...((data ?? []) as FullPostRow[]));
    }
    // Newest save first, and one an admin removed is no longer saved for anyone.
    const live = new Set(rows.filter((row) => !row.removed_at).map((row) => row.id));
    return { ...(await toPostsHeld(rows)), ids: ids.filter((id) => live.has(id)) };
  },

  /** One thread by its id, for a link to one older than the first load brought. */
  async fetchQuestion(questionId: ID): Promise<Question | null> {
    const { data, error } = await need().from('questions').select('*').eq('id', questionId).maybeSingle();
    if (error || !data) return null;
    return toQuestion(data as QuestionRow, []);
  },

  /** Every reply in one thread, oldest first: the whole conversation when it is opened. */
  async fetchThreadAnswers(questionId: ID): Promise<Answer[] | null> {
    const { data, error } = await need().from('answers').select('*').eq('question_id', questionId).order('created_at', { ascending: true }).limit(1000);
    if (error) { fail('thread replies')(error); return null; }
    const rows = (data ?? []) as AnswerRow[];
    // Whether your Hidden words hid any written since the last full read (migration 117); only ever yours are found.
    const me = heldOwner();
    if (me) await learnHeld(sinceHeldRead(rows.filter((a) => a.author_id !== me)));
    return rows.map(toAnswer);
  },

  /**
   * Live changes to messages in the conversations you are in: new ones, ones
   * edited or reacted to, and ones their sender unsent. Returns the unsubscribe.
   */
  /**
   * Live: someone in one of your chats has read up to a moment, with their
   * Read receipts switch for that chat (migration 141). Returns the unsubscribe.
   */
  onReads(handle: (conversationId: ID, userId: ID, readAt: string | null, receipts?: boolean) => void): () => void {
    const db = need();
    const channel = db.channel('reads-live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, (payload) => {
        const row = payload.new as { conversation_id?: string; user_id?: string; last_read_at?: string | null; read_receipts?: boolean | null };
        const receipts = typeof row.read_receipts === 'boolean' ? row.read_receipts : undefined;
        if (row.conversation_id && row.user_id && (row.last_read_at || receipts !== undefined)) handle(row.conversation_id, row.user_id, row.last_read_at ?? null, receipts);
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  },

  /**
   * Every message in your chats sent after `since`, oldest first: what the
   * phone missed while it was asleep or the live connection was down.
   */
  async fetchMessagesSince(since: string): Promise<Message[]> {
    const { data, error } = await need().from('messages').select('*').gt('created_at', since).order('created_at', { ascending: true }).limit(500);
    if (error || !data) return [];
    // Only ever someone else's message is held for you, so your own are never marked.
    return markHeld('', toConversations('', [], data as MessageRow[]).messages);
  },

  /**
   * "Typing…" in one chat: a quick signal sent straight between phones (never
   * stored). `ping` says you are typing; `onTyping` hears who else is.
   * Both channels are private (migration 96): only people in the chat may
   * listen or send, and only you may listen to your own chat list's channel.
   */
  typing(conversationId: ID, me: ID, onTyping: (userId: ID, stopped?: boolean) => void, others: ID[] = []): { ping: () => void; stop: () => void; off: () => void } {
    const db = need();
    const channel = db.channel(`typing:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { userId?: string; stop?: boolean } | null;
        if (p?.userId && p.userId !== me) onTyping(p.userId, !!p.stop);
      })
      .subscribe();
    // The others' inboxes hear it too, so their chat list says "typing…"
    // (Oct 4, owner). Sent without joining their channels; a big group is capped.
    const inboxes = others.filter((id) => id !== me).slice(0, 16).map((id) => db.channel(`inbox-typing:${id}`, { config: { private: true } }));
    return {
      ping: () => {
        void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: me } });
        inboxes.forEach((inbox) => { void inbox.httpSend('typing', { conversationId, userId: me }).catch(() => undefined); });
      },
      // Sent, cleared or left: the dots go at once rather than after the lapse.
      stop: () => {
        void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: me, stop: true } });
        inboxes.forEach((inbox) => { void inbox.httpSend('typing', { conversationId, userId: me, stop: true }).catch(() => undefined); });
      },
      off: () => { void db.removeChannel(channel); inboxes.forEach((inbox) => { void db.removeChannel(inbox); }); },
    };
  },

  /** "Typing…" for the chat list: hears which of your chats someone is typing in right now. */
  inboxTyping(me: ID, onTyping: (conversationId: ID, userId: ID, stopped?: boolean) => void): () => void {
    const db = need();
    const channel = db.channel(`inbox-typing:${me}`, { config: { private: true } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const p = payload as { conversationId?: string; userId?: string; stop?: boolean } | null;
        if (p?.conversationId && p.userId && p.userId !== me) onTyping(p.conversationId, p.userId, !!p.stop);
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  },

  /** Open hits from an hour ago on, with who is in: the list the app loads at the start. Null when it could not be asked. */
  /** The posts, hits, threads, replies, comments and coach questions you have reported (migrations 81 and 115); none on a database without it. */
  async fetchMyReported(): Promise<ID[]> {
    const { data, error } = await need().rpc('my_reported_targets');
    if (error || !Array.isArray(data)) return [];
    // An open hit ('hit-request') since migration 126, a tip since 128, a coach review, a court note and a group since 145;
    // before them the server never hands one back, and nothing changes.
    return (data as unknown[]).map((t) => /^(?:post|hit|hit-request|question|answer|comment|coach-question|coach-reply|tip|coach-review|court-note|group):(.+)$/.exec(String(t))?.[1]).filter((id): id is string => !!id);
  },
  async fetchHits(me?: ID | null): Promise<HitRequest[] | null> {
    const { data, error } = await need().from('hit_requests').select('*, hit_joins(user_id)').eq('cancelled', false)
      .gte('starts_at', new Date(Date.now() - 3_600_000).toISOString()).order('starts_at', { ascending: true }).limit(HITS_CAP);
    if (error) { fail('hits')(error); return null; }
    const hits = await withMyHits((data as HitRow[]).map(toHit), me);
    if (!hits.some((h) => h.audience)) return hits;
    const invites = await hitInvitesQuery();
    return withInvites(hits, invites.error ? null : (invites.data as { hit_id: string; user_id: string }[]));
  },
  /**
   * Your own hits, posted or joined, that started in the last two days,
   * called-off ones included (so they are never asked about), for "How was
   * the hit?". The open-hits list above lets a hit go an hour after it
   * starts, before it has ended. Empty when they could not be read.
   */
  async fetchMyRecentHits(me: ID): Promise<HitRequest[]> {
    if (!UUID_RE.test(me)) return [];
    const db = need();
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
    // A hit can be joined up to 30 days before it starts (migration 43's rule for posting one).
    const joined = await db.from('hit_joins').select('hit_id').eq('user_id', me).gte('created_at', new Date(Date.now() - 32 * 86_400_000).toISOString()).limit(100);
    const ids = ((joined.data ?? []) as { hit_id: string }[]).map((r) => r.hit_id).filter((id) => UUID_RE.test(id));
    const base = db.from('hit_requests').select('*, hit_joins(user_id)').gte('starts_at', since).lte('starts_at', new Date().toISOString());
    const { data, error } = await (ids.length ? base.or(`author_id.eq.${me},id.in.(${ids.join(',')})`) : base.eq('author_id', me)).order('starts_at', { ascending: false }).limit(20);
    if (error) return [];
    return (data as HitRow[]).map(toHit);
  },
  /** A hit posted, changed, joined or left anywhere (migration 53): the caller asks for the list again. Also once on connecting, to catch up. */
  onHits(changed: () => void): () => void {
    const db = need();
    const channel = db.channel('hits-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hit_requests' }, () => changed())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hit_joins' }, () => changed())
      .subscribe((status) => { if (status === 'SUBSCRIBED') changed(); });
    return () => { void db.removeChannel(channel); };
  },

  onMessages(handle: { added: (message: Message) => void; changed: (message: Message) => void; removed: (messageId: ID) => void; connected?: () => void; dropped?: () => void }): () => void {
    const db = need();
    const one = (row: MessageRow) => toConversations('', [{ id: row.conversation_id, updated_at: row.created_at }], [row]).messages[0];
    const channel = db.channel('messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => handle.added(one(payload.new as MessageRow)))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => handle.changed(one(payload.new as MessageRow)))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) handle.removed(id);
      })
      // Connected (again): the caller catches up on anything sent meanwhile.
      // Dropped (a sleeping phone, a bad signal): the caller reconnects.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handle.connected?.();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handle.dropped?.();
      });
    return () => { void db.removeChannel(channel); };
  },

  /**
   * Saves a new log entry. Says whether a score sent with it was dropped:
   * before migration 136 the server keeps a score on a match only and
   * quietly clears a practice's or drills', so the app can say so rather
   * than show a score that is not there.
   */
  async insertSession(s: PracticeSession): Promise<{ scoreDropped: boolean }> {
    const db = need();
    const row: Record<string, unknown> = { id: s.id, user_id: s.userId, day: s.day, minutes: s.minutes, kind: s.kind, won: s.won ?? null, opponent: s.opponent ?? null, note: s.note ?? null, created_at: s.createdAt };
    // A score only when there is one (migration 91), so a session with none saves on a database without it.
    if (s.sets?.length) row.sets = s.sets;
    // What a workout was (migration 107), only when there is one, the same way.
    if (s.workout) row.workout = s.workout;
    // Where it was played (migration 130), only when there is one and the database has it.
    if (s.courtId && !sessionsLackCourt) row.court_id = s.courtId;
    // Calories and average heart rate typed in (migration 154), only on one logged by hand, only when given.
    if (!s.activityId && s.kcal) row.kcal = s.kcal;
    if (!s.activityId && s.avgHr) row.avg_hr = s.avgHr;
    // With a score, the row comes back as the server kept it.
    let keptSets: unknown = null;
    const send = async (body: Record<string, unknown>) => {
      if (!body.sets) return db.from('practice_sessions').insert(body);
      const res = await db.from('practice_sessions').insert(body).select('sets');
      if (!res.error) keptSets = (res.data as { sets?: unknown }[] | null)?.[0]?.sets ?? null;
      return res;
    };
    let { error } = await send(s.activityId ? { ...row, activity_id: s.activityId } : row);
    // A database before migration 130 has no court_id: the session still counts, without where it was.
    if (error && row.court_id && /court_id/.test(error.message)) {
      sessionsLackCourt = true;
      delete row.court_id;
      ({ error } = await send(s.activityId ? { ...row, activity_id: s.activityId } : row));
    }
    // A database before migration 154 has neither: the session still counts, without them (the app hides the boxes until it has them).
    if (error && (row.kcal !== undefined || row.avg_hr !== undefined) && /\b(kcal|avg_hr)\b/.test(error.message)) {
      delete row.kcal;
      delete row.avg_hr;
      ({ error } = await send(s.activityId ? { ...row, activity_id: s.activityId } : row));
    }
    // A database before migration 107 has no workout: the session still counts, as Fitness.
    if (error && row.workout && /\bworkout\b/.test(error.message)) {
      delete row.workout;
      ({ error } = await send(s.activityId ? { ...row, activity_id: s.activityId } : row));
    }
    // A database before migration 58 has no activity_id: the session still counts, just without the link.
    if (error && s.activityId && /activity_id/.test(error.message)) ({ error } = await send(row));
    // A database before migration 91 has no sets: the match still counts, with its result, and the score is dropped.
    if (error && row.sets && /\bsets\b/.test(error.message)) {
      delete row.sets;
      ({ error } = await send(s.activityId ? { ...row, activity_id: s.activityId } : row));
    }
    if (error) {
      fail('session')(error);
      // Each tracker session can be logged once (a unique index on activity_id).
      if (error.code === '23505') throw new Error('Already logged.');
      throw new Error(error.message.includes('a lot of sessions') ? error.message : 'That session didn’t save. Try again.');
    }
    return { scoreDropped: !!s.sets?.length && (!row.sets || keptSets == null) };
  },
  async deleteSession(id: ID) {
    const { error } = await need().from('practice_sessions').delete().eq('id', id);
    if (error) fail('session delete')(error);
  },
  /**
   * A session's score, set, changed or cleared on a session already in your
   * log (migration 91), with the result it gives on a match. The server works
   * the result out again from the sets, so the two never disagree. A practice
   * or drills (Oct 6) has no result: `won` is left out and only the sets go.
   * Throws a plain sentence.
   */
  async updateSessionScore(id: ID, sets: MatchSet[] | null, won?: boolean | null) {
    const { data, error } = await need().from('practice_sessions').update(won === undefined ? { sets } : { sets, won }).eq('id', id).select('sets');
    if (error) {
      fail('session score')(error);
      if (/\bsets\b/.test(error.message) && /column|schema/i.test(error.message)) throw new Error('Scores aren’t ready yet. Try again later.');
      throw new Error(/bad_score/.test(error.message) ? 'That score doesn’t look right.' : 'That didn’t save. Try again.');
    }
    // A score sent and none kept: before migration 136 the server clears a practice's or drills' (a match's
    // stays). Said plainly, so the app puts it back rather than showing a score that is not saved.
    const row = (data as { sets?: unknown }[] | null)?.[0];
    if (sets?.length && row && row.sets == null) throw new Error('Scores aren’t ready yet. Try again later.');
  },
  /**
   * Your record against one player (head_to_head, migration 91): only scored
   * matches you were both confirmed on. Null when it could not be asked (or
   * the database has no head-to-head yet).
   */
  async headToHead(other: ID): Promise<HeadToHead | null> {
    if (!UUID_RE.test(other)) return null;
    const { data, error } = await need().rpc('head_to_head', { other });
    if (error) { if (!missingFunction(error)) fail('head to head')(error); return null; }
    if (!data || typeof data !== 'object') return null;
    const r = data as { wins?: number; losses?: number; last?: { sessionId?: string; day?: string; won?: boolean; sets?: unknown } };
    const sets = validSets(r.last?.sets);
    return {
      userId: other, wins: Number(r.wins) || 0, losses: Number(r.losses) || 0,
      ...(r.last && sets && typeof r.last.won === 'boolean' && r.last.sessionId ? { last: { sessionId: r.last.sessionId, day: String(r.last.day ?? '').slice(0, 10), won: r.last.won, sets } } : {}),
    };
  },
  /** The private name you typed for who you played, changed on a session already in your log. */
  async updateSessionOpponent(id: ID, opponent: string | null) {
    const { error } = await need().from('practice_sessions').update({ opponent }).eq('id', id);
    if (error) { fail('session opponent')(error); throw new Error('That didn’t save. Try again.'); }
  },
  /**
   * A session's day and length, changed on a session already in your log
   * (Oct 6). The database already takes it (your own rows, migration 39);
   * its triggers ask anyone who accepted a tag again (migration 62) and
   * rework your posts carrying it (migration 65).
   */
  async updateSessionTime(id: ID, day: string, minutes: number) {
    const { error } = await need().from('practice_sessions').update({ day, minutes }).eq('id', id);
    if (error) { fail('session time')(error); throw new Error('That didn’t save. Try again.'); }
  },

  /**
   * Whether the database keeps calories and average heart rate typed into a
   * session (migration 154): asked by looking at the two columns, which reads
   * no rows. False when they are not there; null when there was no answer
   * (no signal), which says nothing either way. Until it is true, "+ Add
   * calories & heart rate" is not offered, so nothing typed is lost.
   */
  async manualStatsReady(): Promise<boolean | null> {
    const { error } = await need().from('practice_sessions').select('kcal,avg_hr').limit(0);
    if (!error) return true;
    if (error.code === '42703' || error.code === 'PGRST204' || /\b(kcal|avg_hr)\b/.test(error.message)) return false;
    return null;
  },

  /* ---------------------------------------------- session tags (migration 62) */

  /**
   * Whether the database can tag players on sessions yet (migration 62):
   * asked by looking at the table, which reads no rows and works signed in or
   * out. False when it is not there; null when there was no answer (no
   * signal), which says nothing either way.
   */
  async sessionTagsReady(): Promise<boolean | null> {
    const { error } = await need().from('session_tags').select('id').limit(0);
    const ready = readinessOf(error);
    setSessionTagNamesLive(ready);
    if (ready === false) console.warn('[remote] Tagging players on sessions needs the session tags update. Open Supabase → SQL Editor → New query, paste the file supabase/migrations/20261002000062_session_tags.sql and press Run. It is safe to run more than once.');
    return ready;
  },
  /* ---------------------------------------------------------- groups (67) */
  /**
   * Your groups and the groups you asked to join, and whether a group's look
   * can be saved here (`looks`: migration 73 has run). Null on a database
   * without groups (before migration 67).
   */
  async myFeedGroups(): Promise<{ groups: FeedGroup[]; asked: { id: ID; name: string; look?: GroupLook }[]; looks: boolean } | null> {
    const { data, error } = await need().rpc('my_feed_groups');
    if (error) { if (!missingFunction(error)) fail('groups')(error); return null; }
    const raw = (data ?? {}) as { groups?: GroupRow[]; asked?: ({ id: ID; name: string } & LookRow)[]; looks?: boolean };
    return { groups: (raw.groups ?? []).map(toGroup), asked: (raw.asked ?? []).map((a) => ({ id: a.id, name: a.name, look: lookFrom(a) })), looks: raw.looks === true };
  },
  /**
   * Starts a group with everything the form asks in one go (migration 73,
   * start_feed_group): whether it shows in Find groups, and its colour and
   * emoji. Its id. Throws with the server's word ('group_limit',
   * 'name_needed', 'slow_down', 'bad_look', or 'not_ready' before 73).
   */
  async startFeedGroup(input: { name: string; description: string; ask: boolean; discoverable: boolean; look: GroupLook }): Promise<ID> {
    const { data, error } = await need().rpc('start_feed_group', {
      p_name: input.name, p_description: input.description || null, p_ask: input.ask,
      p_discoverable: input.discoverable, p_color: input.look.color ?? null, p_emoji: input.look.emoji ?? null,
    });
    if (error) throw new Error(groupWord(error));
    return data as string;
  },
  /** Starts a group; its id. Throws with the server's word ('group_limit', 'name_needed', 'slow_down'). */
  async createFeedGroup(name: string, description: string, ask: boolean): Promise<ID> {
    const { data, error } = await need().rpc('create_feed_group', { p_name: name, p_description: description || null, p_ask: ask });
    if (error) throw new Error(groupWord(error));
    return data as string;
  },
  /**
   * What an invite link shows. Null when there is no such group (or no
   * groups yet); throws when it could not be asked (no connection), so a
   * group is never taken as gone for want of an answer.
   */
  async feedGroupCard(id: ID): Promise<FeedGroupCard | null> {
    if (!UUID_RE.test(id)) return null;
    const { data, error } = await need().rpc('feed_group_card', { g: id });
    if (error) { if (missingFunction(error)) return null; throw new Error(groupWord(error)); }
    if (!data) return null;
    const c = data as { id: ID; name: string; description: string | null; ask: boolean; members: number; member: boolean; requested: boolean } & LookRow;
    return { id: c.id, name: c.name, description: c.description ?? undefined, ask: c.ask, look: lookFrom(c), memberCount: Number(c.members) || 0, member: c.member, requested: c.requested };
  },
  /** Joins, or asks to. Throws with the server's word ('group_limit', 'not_found', 'slow_down'). */
  async joinFeedGroup(id: ID): Promise<'joined' | 'requested' | 'already'> {
    const { data, error } = await need().rpc('join_feed_group', { g: id });
    if (error) throw new Error(groupWord(error));
    return data as 'joined' | 'requested' | 'already';
  },
  async leaveFeedGroup(id: ID) {
    const { error } = await need().rpc('leave_feed_group', { g: id });
    if (error) throw new Error(groupWord(error));
  },
  async answerFeedGroupRequest(id: ID, who: ID, accept: boolean) {
    const { error } = await need().rpc('answer_feed_group_request', { g: id, who, accept });
    if (error) throw new Error(groupWord(error));
  },
  async removeFeedGroupMember(id: ID, who: ID) {
    const { error } = await need().rpc('remove_feed_group_member', { g: id, who });
    if (error) throw new Error(groupWord(error));
  },
  async updateFeedGroup(id: ID, name: string, description: string, ask: boolean) {
    const { error } = await need().rpc('update_feed_group', { g: id, p_name: name, p_description: description || null, p_ask: ask });
    if (error) throw new Error(groupWord(error));
  },
  /**
   * Groups to find and join (migration 70): only ones shown in Find groups,
   * near you first, then the biggest. Null on a database without it yet.
   */
  async discoverGroups(q: string, limit = 30): Promise<DiscoverGroup[] | null> {
    const { data, error } = await need().rpc('discover_groups', { q: q.trim() || null, lim: limit });
    if (error) { if (!missingFunction(error)) fail('find groups')(error); return null; }
    const rows = (Array.isArray(data) ? data : []) as ({ id: ID; name: string; description: string | null; ask: boolean; members: number; member: boolean; requested: boolean; near: boolean } & LookRow)[];
    return rows.map((c) => ({ id: c.id, name: c.name, description: c.description ?? undefined, ask: !!c.ask, look: lookFrom(c), memberCount: Number(c.members) || 0, member: !!c.member, requested: !!c.requested, near: !!c.near }));
  },
  /** An admin shows or hides a group in Find groups. Throws with the server's word ('not_admin', or 'not_ready' before migration 70). */
  async setFeedGroupDiscoverable(id: ID, on: boolean) {
    const { error } = await need().rpc('set_feed_group_discoverable', { g: id, p_on: on });
    if (error) throw new Error(groupWord(error));
  },
  /**
   * An admin sets a group's look (migration 73): its colour, emoji and photo
   * (already uploaded to the media bucket, in the GROUP's folder, never
   * yours: see uploadMedia's first argument), all at once. Throws with the
   * server's word ('not_admin', 'bad_photo', 'bad_look', or 'not_ready'
   * before migration 73).
   */
  async setFeedGroupLook(id: ID, look: GroupLook) {
    const { error } = await need().rpc('set_feed_group_look', { g: id, p_color: look.color ?? null, p_emoji: look.emoji ?? null, p_photo: look.photoUrl ?? null });
    if (error) throw new Error(groupWord(error));
  },
  /**
   * A page of a group's feed, newest first, older than `before`: everything
   * its members post, plus what was shared to that group only (migration 74,
   * group_feed). `next` is where the following page starts; null at the end.
   * Before migration 74 it falls back to the group-only posts, as in 67.
   */
  async fetchFeedGroupPosts(id: ID, before?: string): Promise<{ posts: Post[]; comments: Comment[]; next: string | null } | null> {
    if (!UUID_RE.test(id)) return null;
    const db = need();
    const page = await db.rpc('group_feed', { g: id, before: before ?? null, lim: GROUP_PAGE });
    if (page.error && !missingFunction(page.error)) { fail('group feed')(page.error); return null; }
    if (!page.error) {
      const listed = (Array.isArray(page.data) ? page.data : []) as { id: ID; created_at: string }[];
      if (!listed.length) return { posts: [], comments: [], next: null };
      const { data, error } = await db.from('posts').select(POST_SELECT).in('id', listed.map((r) => r.id));
      if (error) { fail('group feed')(error); return null; }
      return { ...(await toPostsHeld((data ?? []) as FullPostRow[])), next: listed.length === GROUP_PAGE ? listed[listed.length - 1].created_at : null };
    }
    let q = db.from('posts').select(POST_SELECT).eq('group_id', id).eq('archived', false);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(POST_PAGE);
    if (error) { fail('group posts')(error); return null; }
    const rows = (data ?? []) as FullPostRow[];
    return { ...(await toPostsHeld(rows)), next: rows.length === POST_PAGE ? rows[rows.length - 1].created_at : null };
  },

  /** Every tag you made and every tag of you, newest first. Null when they could not be read. */
  async mySessionTags(): Promise<SessionTag[] | null> {
    const { data, error } = await need().rpc('my_session_tags');
    if (error) { fail('session tags')(error); return null; }
    return ((data ?? []) as SessionTagRow[]).map(toSessionTag);
  },
  /** Tags someone on a session of yours; the tag's id. Throws with the server's word for a refusal ('teen_closed', 'too_many'…). */
  async tagSession(sessionId: ID, who: ID, role?: SessionTagRole): Promise<ID> {
    const { data, error } = await need().rpc('tag_session', { s: sessionId, who, as_role: role ?? null });
    if (error) throw new Error(tagRefusal(error));
    return data as string;
  },
  /** Takes a tag off: yours as the tagger, or "Remove tag" as the one tagged (with your own copy too when dropMine). */
  async untagSession(tagId: ID, dropMine = false): Promise<void> {
    const { error } = await need().rpc('untag_session', { t: tagId, drop_mine: dropMine });
    if (error) throw new Error(tagRefusal(error));
  },
  /** Accept or decline a tag of you. Accepting with addToMine returns your own copy of the session. */
  async respondSessionTag(tagId: ID, accept: boolean, addToMine = true): Promise<PracticeSession | null> {
    const { data, error } = await need().rpc('respond_session_tag', { t: tagId, accept, add_to_mine: addToMine });
    if (error) throw new Error(tagRefusal(error));
    return data && typeof data === 'object' ? toSession(data as SessionRow) : null;
  },
  /** Why you may not tag this person, or null when you may. Null too when the server could not say. */
  async sessionTagRefusal(who: ID): Promise<SessionTagRefusal | null> {
    const { data, error } = await need().rpc('session_tag_refusal', { who });
    if (error) return null;
    return (typeof data === 'string' ? data : null) as SessionTagRefusal | null;
  },
  /**
   * A tag of yours or of you made, answered or taken off anywhere: the caller
   * asks for the list again. Also once on connecting, to catch up. New and
   * changed rows are asked for as yours only (as the tagger or the one
   * tagged). A deleted row arrives as its id alone, to everyone listening, so
   * only one this phone holds (`known`) counts.
   */
  onSessionTags(me: ID, known: () => Set<ID>, changed: () => void): () => void {
    const db = need();
    const channel = db.channel(`session-tags-live-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_tags', filter: `tagged_id=eq.${me}` }, () => changed())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_tags', filter: `tagged_id=eq.${me}` }, () => changed())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_tags', filter: `tagger_id=eq.${me}` }, () => changed())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'session_tags', filter: `tagger_id=eq.${me}` }, () => changed())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_tags' }, (payload) => {
        const gone = (payload.old as { id?: string } | null)?.id;
        if (gone && known().has(gone)) changed();
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') changed(); });
    return () => { void db.removeChannel(channel); };
  },

  /**
   * The trackers function on the server (Fitbit, Oura, Polar; migration 69):
   * status (which are set up), start (their sign-in page, or {on: false}),
   * finish (this phone collects a sign-in), sync and disconnect.
   */
  async trackers<T = { url?: string; on?: boolean; ok?: boolean; fresh?: ID[] }>(path: 'status' | 'start' | 'finish' | 'sync' | 'disconnect', body: object = {}): Promise<T> {
    const { data, error } = await need().functions.invoke<T & { error?: string }>(`trackers/${path}`, { body });
    if (error) throw new Error('That tracker is not reachable right now.');
    if (data && (data as { error?: string }).error) throw new Error((data as { error?: string }).error);
    return data as T;
  },

  /* ------------------------------------------- tennis sessions (migration 58) */

  /**
   * Which server switches are on for you, by name ('tennis-apple', 'tennis-whoop'). Empty on a
   * database without them. Null when they could not be read (no signal, say): not the same as
   * all off, so a step that would switch something off for good can wait (useWorkoutWatch).
   */
  async myFlags(): Promise<Record<string, boolean> | null> {
    const { data, error } = await need().rpc('my_flags');
    // PGRST202: no such function (a database before migration 58), which is all off.
    if (error) return error.code === 'PGRST202' ? {} : null;
    if (!data || typeof data !== 'object') return {};
    return data as Record<string, boolean>;
  },
  /** Your tracker sessions from the last two weeks. Null when they could not be read (empty on a database without them). */
  async fetchActivities(me: ID): Promise<DetectedActivity[] | null> {
    const { data, error } = await activitiesQuery(me);
    if (error) return null;
    return ((data ?? []) as ActivityRow[]).map(toActivity);
  },
  /**
   * Your tracker sessions from the last `days` (at most the 30 the server
   * keeps), for Past workouts. Read on their own and handed back, never put
   * in the app's list (an older one there would show as waiting to be
   * logged). Null when they could not be read.
   */
  async fetchActivitiesSince(me: ID, days: number): Promise<DetectedActivity[] | null> {
    const { data, error } = await activitiesQuery(me, Math.min(31, Math.max(1, days)), 300);
    if (error) return null;
    return ((data ?? []) as ActivityRow[]).map(toActivity);
  },
  /**
   * One of your own tracker sessions by its id, however old, while the
   * server still keeps it (30 days): Edit post's "Share health data" on a
   * post older than the two weeks the app holds (Oct 4). Null when it has
   * gone or could not be read; only your own rows ever come back (migration 58).
   */
  async fetchActivity(me: ID, id: ID): Promise<DetectedActivity | null> {
    const { data, error } = await need().from('detected_activities').select('*').eq('user_id', me).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return toActivity(data as ActivityRow);
  },
  /**
   * A workout read from Apple Health on this phone (tennis, or since
   * migration 107 any kind), handed to the server, which keeps it, checks
   * it against WHOOP's copy and files the in-app row. `notify` is true only when this very call filed it. Null on a
   * database without the function, or when the server turned it away;
   * 'error' when it did not get through.
   */
  async reportActivity(ext: string, p: object): Promise<{ id: ID; status: DetectedActivity['status']; notify: boolean } | null | 'error'> {
    const { data, error } = await need().rpc('report_activity', { ext, p });
    if (error) return missingFunction(error) ? null : 'error';
    return (data as { id: ID; status: DetectedActivity['status']; notify: boolean } | null) ?? null;
  },
  /** "Not tennis": hides a session you have not logged, and its notification. */
  async dismissActivity(id: ID) {
    const { error } = await need().rpc('dismiss_activity', { a: id });
    if (error) fail('dismiss activity')(error);
  },
  /** Your notifications newer than `since`, newest first: what came in while the app was in the background. Empty when they could not be read. */
  async fetchNotificationsSince(me: ID, since: string): Promise<Notification[]> {
    const { data, error } = await need().from('notifications').select('*').eq('user_id', me).gt('created_at', since).order('created_at', { ascending: false }).limit(200);
    if (error) return [];
    return ((data ?? []) as NotificationRow[]).map(toNotification);
  },
  /** The "Tennis detected" and "Workout detected" rows from the last two weeks, for a check that just filed some. */
  async fetchActivityNotes(me: ID): Promise<Notification[]> {
    const { data, error } = await need().from('notifications').select('*').eq('user_id', me).eq('kind', 'activity')
      .gte('created_at', new Date(Date.now() - 14 * 86_400_000).toISOString());
    if (error) return [];
    return ((data ?? []) as NotificationRow[]).map(toNotification);
  },
  /**
   * Everyone's last spot you are allowed to see. Empty when the table is not
   * there yet; null when the ask failed, so the map keeps what it had and
   * nothing reads a failed load as "nobody near you".
   */
  async fetchLastSeen(): Promise<LastSeen[] | null> {
    const { data, error } = await need().from('last_seen').select('user_id, lat, lng, city, seen_at, show_activity').limit(2000);
    if (error) { fail('last seen')(error); return missingTable(error) ? [] : null; }
    return (data as { user_id: ID; lat: number; lng: number; city: string | null; seen_at: string; show_activity: boolean }[])
      .map((r) => ({ userId: r.user_id, lat: r.lat, lng: r.lng, city: r.city ?? undefined, seenAt: r.show_activity ? r.seen_at : undefined }));
  },
  /**
   * Everyone the map may show you, each where you may see them (migration
   * 63's map_players): on their court, exactly (you, and people who follow
   * each other with you) or about a kilometre out; with until when they are
   * up for a hit today. Since migration 98 every answer carries all your
   * friends who follow each other with you, wherever they are (`mutual`),
   * and anyone else only inside `view` (at most 2° each way round its
   * middle) and within about 50 miles of your own shared spot: the server
   * decides "near you", whatever view is asked for, and with Location off
   * or on Only me nobody is near you (nearbyLock). With no view: you and
   * your friends. 'missing' on a database without it (the app reads
   * last_seen instead); null when the ask failed.
   */
  async fetchMapPlayers(view?: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null): Promise<LastSeen[] | null | 'missing'> {
    const area = view ? { min_lat: view.minLat, min_lng: view.minLng, max_lat: view.maxLat, max_lng: view.maxLng } : {};
    const { data, error } = await need().rpc('map_players', area);
    if (error) { if (missingFunction(error)) return 'missing'; fail('map players')(error); return null; }
    // (How far each person up for a hit would like to go, migration 120, is asked
    // afterwards by the app, so the pins never wait for it: fetchOpenToHitMiles.)
    return ((data ?? []) as MapPlayerRow[]).map((r) => ({
      userId: r.user_id, lat: r.lat, lng: r.lng, city: r.city ?? undefined, seenAt: r.seen_at ?? undefined,
      place: r.place === 'court' || r.place === 'exact' ? r.place : 'approx',
      courtId: r.court_id ?? undefined, courtName: r.court_name ?? undefined, openUntil: r.open_until ?? undefined,
      ...(r.mutual ? { mutual: true } : {}),
    }));
  },
  /**
   * How far each of these people would like to go for a hit (migration 120),
   * for those whose ring is on and whose "open until" you may already read
   * (on your map, or on their profile). Nobody else comes back, the same as
   * someone who chose any distance. Empty on a database without it (then
   * everyone reads as any distance); null when the ask failed, so what was
   * known before is kept.
   */
  async fetchOpenToHitMiles(ids: ID[]): Promise<Record<ID, number> | null> {
    const unique = [...new Set(ids)].slice(0, 200);
    if (!unique.length || lacksOpenToHitMiles) return {};
    const { data, error } = await need().rpc('open_to_hit_miles', { ids: unique });
    if (error) { if (missingFunction(error)) { lacksOpenToHitMiles = true; return {}; } fail('open to hit distance')(error); return null; }
    const out: Record<ID, number> = {};
    for (const r of (data ?? []) as { user_id: ID; miles: number | null }[]) { const m = asHitMiles(r.miles); if (m) out[r.user_id] = m; }
    return out;
  },
  /**
   * Saves how far you'd like to go for a hit (migration 120): 5, 10 or 25
   * miles, or null for any distance. 'missing' on a database without it
   * (the choice then stays on this phone, and others read any distance).
   */
  async setOpenToHitMiles(miles: number | null): Promise<boolean | 'missing'> {
    if (lacksOpenToHitMiles) return 'missing';
    const { error } = await need().rpc('set_open_to_hit_miles', { miles: asHitMiles(miles) ?? null });
    if (error) { if (missingFunction(error)) { lacksOpenToHitMiles = true; return 'missing'; } fail('open to hit distance')(error); return false; }
    return true;
  },
  /** "Who can see you on the map?" (migration 63). Resolves false when it could not be saved. */
  async setMapVisibility(v: MapVisibility): Promise<boolean> {
    const { error } = await need().rpc('set_map_visibility', { v });
    if (error) { fail('map visibility')(error); return false; }
    return true;
  },
  /**
   * New on CourtSide, decided by the server (migration 63): who joined in
   * the last `days` days that you may be shown, newest first. Null on a
   * database without it (the app works it out the old way) or a failed ask.
   */
  async fetchNewOnCourtside(days = 14): Promise<{ userId: ID; joinedAt: string }[] | null> {
    const { data, error } = await need().rpc('new_on_courtside', { days });
    if (error) { if (!missingFunction(error)) fail('new on courtside')(error); return null; }
    return ((data ?? []) as { user_id: ID; joined_at: string }[]).map((r) => ({ userId: r.user_id, joinedAt: r.joined_at }));
  },
  /** Your own spot; the database keeps it to itself and shows others only what each may see. */
  async markLastSeen(lat: number, lng: number, city?: string) {
    const { error } = await need().rpc('mark_last_seen', { p_lat: lat, p_lng: lng, p_city: city ?? null });
    if (error) fail('mark last seen')(error);
  },
  /** Location off: the server drops your spots. Resolves false when it could not. */
  async forgetLastSeen(): Promise<boolean> {
    const { error } = await need().rpc('forget_last_seen');
    if (error) fail('forget last seen')(error);
    return !error;
  },
  /*
   * Courts (migration 60). Every read here answers null on a database
   * without it (the function or table is missing), so the app hides what it
   * cannot show yet rather than failing; the writes say so in a sentence.
   */
  /** Everyone's facts about up to 50 courts, added up, never naming anyone. */
  async fetchCourtFacts(ids: string[]): Promise<CourtFacts[] | null> {
    const { data, error } = await need().rpc('court_facts', { ids: ids.slice(0, 50) });
    if (error) { if (!missingFunction(error)) fail('court facts')(error); return null; }
    return ((data ?? []) as CourtFactsRow[]).map(toCourtFacts);
  },
  /** Your own facts about one court, to fill the sheet in. Null when you have none (or the table is missing). */
  async fetchMyCourtReview(me: ID, courtId: string): Promise<CourtReview | null> {
    const { data, error } = await need().from('court_reviews').select('court_id, lights, nets, surface, busy, access, notes, from_hit, updated_at').eq('user_id', me).eq('court_id', courtId).maybeSingle();
    if (error || !data) return null;
    return toCourtReview(data as CourtReviewRow);
  },
  /** Your facts about a court; saving again replaces them. Throws a plain sentence when it cannot. */
  async saveCourtReview(me: ID, r: CourtReview) {
    const { error } = await need().from('court_reviews').upsert({
      court_id: r.courtId, user_id: me, lights: r.lights ?? null, nets: r.nets ?? null, surface: r.surface ?? null,
      // A hit's id is a uuid; anything else in that slot would make the whole save fail.
      busy: r.busy ?? null, access: r.access ?? null, notes: r.notes?.trim() || null, from_hit: r.fromHit && /^[0-9a-f-]{36}$/i.test(r.fromHit) ? r.fromHit : null,
    }, { onConflict: 'court_id,user_id' });
    if (!error) return;
    if (isBlockedWords(error)) throw new Error(BLOCKED_WORDS_NOTE);
    fail('court review')(error);
    if (missingTable(error)) throw new Error('Court reviews aren’t switched on yet. Try again soon.');
    if (/30 courts a day|slow down/i.test(error.message)) throw new Error('That’s a lot of courts for one day. Try again tomorrow.');
    throw new Error('That didn’t save. Try again.');
  },
  /** "6 players follow this court", and whether you do, for up to 50 courts. */
  async fetchCourtFollowCounts(ids: string[]): Promise<CourtFollowCount[] | null> {
    const { data, error } = await need().rpc('court_follow_counts', { ids: ids.slice(0, 50) });
    if (error) { if (!missingFunction(error)) fail('court follows')(error); return null; }
    return ((data ?? []) as { court_id: string; followers: number; following: boolean }[]).map((r) => ({ courtId: r.court_id, followers: num(r.followers), following: !!r.following }));
  },
  /** Follow a court (the heart). Null when it went through, else a sentence. */
  async followCourt(me: ID, courtId: string): Promise<string | null> {
    const { error } = await need().from('court_follows').insert({ user_id: me, court_id: courtId });
    if (!error || error.code === '23505') return null;
    fail('follow court')(error);
    if (/up to 100 courts/.test(error.message)) return 'You can follow up to 100 courts.';
    return 'That didn’t go through. Try again.';
  },
  async unfollowCourt(me: ID, courtId: string): Promise<boolean> {
    const { error } = await need().from('court_follows').delete().eq('user_id', me).eq('court_id', courtId);
    if (error) { fail('unfollow court')(error); return false; }
    return true;
  },
  /** The courts you follow, with what is new at each ("Your courts"). */
  async fetchMyCourts(): Promise<FollowedCourt[] | null> {
    const { data, error } = await need().rpc('my_courts');
    if (error) { if (!missingFunction(error)) fail('my courts')(error); return null; }
    return ((data ?? []) as { court_id: string; name: string | null; lat: number; lng: number; access: string | null; followed_at: string; new_posts: number; upcoming_hits: number; next_hit_at: string | null; status: string | null; status_at: string | null; last_at: string | null; you_here?: boolean | null }[])
      .map((r) => ({
        courtId: r.court_id, ...(r.name ? { name: r.name } : {}), lat: r.lat, lng: r.lng, access: asAccess(r.access), followedAt: r.followed_at,
        newPosts: num(r.new_posts), upcomingHits: num(r.upcoming_hits), ...(r.next_hit_at ? { nextHitAt: r.next_hit_at } : {}),
        ...(asNow(r.status) ? { status: asNow(r.status), statusAt: r.status_at ?? undefined } : {}), ...(r.last_at ? { lastAt: r.last_at } : {}),
        ...(r.you_here ? { youHere: true } : {}),
      }));
  },
  /** Right now at up to 50 courts: the latest answer, and who is playing (counts and names as the server allows). */
  async fetchCourtRightNow(ids: string[]): Promise<CourtRightNow[] | null> {
    const { data, error } = await need().rpc('court_right_now', { ids: ids.slice(0, 50) });
    if (error) { if (!missingFunction(error)) fail('court right now')(error); return null; }
    return ((data ?? []) as { court_id: string; status: string | null; status_at: string | null; playing: number; friend_ids: string[] | null; you_here: boolean }[])
      .map((r) => ({ courtId: r.court_id, ...(asNow(r.status) ? { status: asNow(r.status), statusAt: r.status_at ?? undefined } : {}), playing: num(r.playing), friendIds: r.friend_ids ?? [], youHere: !!r.you_here }));
  },
  /** "How is it right now?" No status takes yours back. Null when it went through, else a sentence. */
  async reportCourtStatus(courtId: string, status: CourtNow | null): Promise<string | null> {
    const { error } = await need().rpc('report_court_status', { p_court: courtId, p_status: status });
    if (!error) return null;
    fail('court status')(error);
    if (missingFunction(error)) return 'This isn’t switched on yet. Try again soon.';
    if (/private_court/.test(error.message)) return 'This is someone’s home court, so it doesn’t take reports.';
    if (/slow down/.test(error.message)) return 'That’s a lot of courts this hour. Try again later.';
    return 'That didn’t go through. Try again.';
  },
  /** "I'm playing here": when it ends, or why not, as the server says it. */
  async checkInAtCourt(courtId: string): Promise<{ until: string } | { error: 'adults_only' | 'location_off' | 'too_far' | 'closed_court' | 'slow_down' | 'hidden' | 'failed' }> {
    const { data, error } = await need().rpc('check_in_at_court', { p_court: courtId });
    if (!error && typeof data === 'string') return { until: data };
    if (error) fail('check in')(error);
    const said = error?.message ?? '';
    // 'hidden': you chose Only me on the map (migration 63), so nobody sees you at a court either.
    return { error: /adults_only/.test(said) ? 'adults_only' : /location_off/.test(said) ? 'location_off' : /too_far/.test(said) ? 'too_far'
      : /closed_court/.test(said) ? 'closed_court' : /slow down/.test(said) ? 'slow_down' : /hidden/.test(said) ? 'hidden' : 'failed' };
  },
  /** False when it did not go through (you still show as playing there). */
  async checkOutOfCourt(): Promise<boolean> {
    const { error } = await need().rpc('check_out_of_court');
    if (error) fail('check out')(error);
    return !error;
  },
  /** Court rings in a box of the map: real courts with a post or hit there this week that you may see. */
  async fetchCourtRings(box: { minLat: number; minLng: number; maxLat: number; maxLng: number }): Promise<CourtRing[] | null> {
    const { data, error } = await need().rpc('court_rings', { min_lat: box.minLat, min_lng: box.minLng, max_lat: box.maxLat, max_lng: box.maxLng });
    if (error) { if (!missingFunction(error)) fail('court rings')(error); return null; }
    return ((data ?? []) as { court_id: string; name: string | null; lat: number; lng: number; posts: number; hits: number; last_at: string }[])
      .map((r) => ({ courtId: r.court_id, ...(r.name ? { name: r.name } : {}), lat: r.lat, lng: r.lng, posts: num(r.posts), hits: num(r.hits), lastAt: r.last_at }));
  },
  /** "Sam and Dev, who you follow, play here", for up to 50 courts. */
  async fetchCourtRegulars(ids: string[]): Promise<CourtRegulars[] | null> {
    const { data, error } = await need().rpc('court_people_you_follow', { ids: ids.slice(0, 50) });
    if (error) { if (!missingFunction(error)) fail('court regulars')(error); return null; }
    return ((data ?? []) as { court_id: string; user_ids: string[] | null }[]).map((r) => ({ courtId: r.court_id, userIds: r.user_ids ?? [] }));
  },
  /**
   * King of the Court at one court (court_kings, migration 130): the board
   * and your own line, as the server ranks them for you. Null when it could
   * not be asked (or the database has no board yet).
   */
  async fetchCourtKings(courtId: string): Promise<CourtKings | null> {
    if (!isMapCourtId(courtId)) return null;
    const { data, error } = await need().rpc('court_kings', { p_court: courtId });
    if (error) { if (!missingFunction(error)) fail('court kings')(error); return null; }
    const r = (data ?? {}) as { mode?: string; top?: { id?: string; n?: number; last?: string | null }[]; me?: { n?: number; rank?: number | null; ranked?: boolean; over?: boolean } };
    const over = r.me?.over === true && !!r.me?.ranked;
    const mode = r.mode === 'wins' || r.mode === 'regulars' ? r.mode : 'none';
    return {
      courtId, mode,
      top: (Array.isArray(r.top) ? r.top : []).filter((t) => typeof t.id === 'string' && UUID_RE.test(t.id)).slice(0, 3)
        .map((t) => ({ userId: t.id!, n: num(t.n), ...(typeof t.last === 'string' ? { last: t.last.slice(0, 10) } : {}) })),
      me: { wins: num(r.me?.n), ...(typeof r.me?.rank === 'number' ? { rank: r.me.rank } : {}), ranked: !!r.me?.ranked && (typeof r.me?.rank === 'number' || over), ...(over ? { over: true } : {}) },
    };
  },
  /**
   * Who else was at a court on a day of yours (flyby, migration 130): only
   * when you were there yourself, only people the app may show you, the part
   * of the day in your own time. Null when it could not be asked.
   */
  async fetchFlyby(courtId: string, day: string, offsetMin: number): Promise<FlybyPerson[] | null> {
    if (!isMapCourtId(courtId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const { data, error } = await need().rpc('flyby', { p_court: courtId, p_day: day, p_offset_min: Math.round(offsetMin) });
    if (error) { if (!missingFunction(error)) fail('flyby')(error); return null; }
    return ((data ?? []) as { user_id: string; part: string; via: string; post_id: string | null }[])
      .filter((r) => UUID_RE.test(r.user_id))
      .map((r) => ({
        userId: r.user_id,
        part: r.part === 'afternoon' || r.part === 'evening' ? r.part : 'morning',
        via: r.via === 'checkin' ? 'checkin' : 'post',
        ...(r.post_id ? { postId: r.post_id } : {}),
      }));
  },
  /** Your phone's time zone, for the weekly recap at 8am your time (migration 130). Null when it could not be said (or the database is older). */
  async setMyTimeZone(tz: string): Promise<boolean | null> {
    const { data, error } = await need().rpc('set_my_time_zone', { p_tz: tz });
    if (error) { if (!missingFunction(error)) fail('time zone')(error); return null; }
    return data === true;
  },
  async insertHit(h: HitRequest) {
    const { error } = await need().from('hit_requests').insert({
      id: h.id, author_id: h.authorId, starts_at: h.startsAt, place: h.place, level_min: h.levelMin ?? null, level_max: h.levelMax ?? null,
      format: h.format, spots: h.spots, note: h.note ?? null,
      // Only an invite-first or invite-only hit names who sees it (migration 76), so a hit for everyone still posts on a database without it.
      // When it opens is the server's to work out.
      ...(h.audience ? { audience: h.audience, include_groups: !!h.includeGroups } : {}),
    });
    if (error) {
      // A note refused for its words (migration 117): saying so is the whole message.
      if (isBlockedWords(error)) throw new Error(BLOCKED_WORDS_NOTE);
      fail('hit request')(error);
      // Never posted for everyone instead: a database without migration 76 says no, and so does the app.
      if (h.audience && /audience|include_groups/.test(error.message)) throw new Error('Invite-first hits aren’t ready yet. Post it for everyone, or try again later.');
      throw new Error('That didn’t post. Try again.');
    }
  },
  /** The players invited to your invite-first or invite-only hit (migration 76): who the server took (never someone blocked, or a teen you don't follow both ways). */
  async inviteToHit(hitId: ID, userIds: ID[]): Promise<ID[]> {
    const { data, error } = await need().rpc('invite_to_hit', { hit: hitId, people: userIds.filter((x) => UUID_RE.test(x)) });
    if (error) { fail('invite to hit')(error); throw new Error('The invites didn’t go. Try again.'); }
    return (data as string[] | null) ?? [];
  },
  /** "Open to everyone now", on your own invite-first hit (migration 76). */
  async openHitNow(hitId: ID) {
    const { error } = await need().rpc('open_hit_now', { hit: hitId });
    if (error) { fail('open hit')(error); throw new Error('That didn’t go through. Try again.'); }
  },
  /** "I'm in": the hit's group chat comes back, or a plain sentence saying why not. */
  async joinHit(hitId: ID): Promise<{ conversationId?: ID; error?: string }> {
    const { data, error } = await need().rpc('join_hit', { hit: hitId });
    if (error) {
      if (/teen_closed/.test(error.message)) return { error: 'You can join once you follow each other.' };
      if (/blocked/.test(error.message)) return { error: 'You can’t join this one.' };
      // An admin took you out of this hit's chat (migration 54): only someone in it can add you back. Never says who.
      if (/\bremoved\b/.test(error.message)) return { error: 'You were removed from this hit’s chat, so you can’t rejoin it.' };
      const plain = error.message.match(/That hit[^.]*\.|That is your own hit\./);
      return { error: plain ? plain[0] : 'That didn’t go through. Try again.' };
    }
    return { conversationId: (data as string) || undefined };
  },
  /**
   * "Can't make it": out of a hit you joined. Since migration 151 the server
   * also takes you out of the hit's chat and tells the poster; before it,
   * leave_hit only gave the spot back, so the chat is left here too (a
   * second ask that does nothing once the server has done it). In that order
   * on purpose: leaving the chat first would give the spot back without the
   * poster's note. False when the spot could not be given back.
   */
  async leaveHit(hitId: ID, conversationId?: ID): Promise<boolean> {
    const db = need();
    const { error } = await db.rpc('leave_hit', { hit: hitId });
    if (error) { fail('leave hit')(error); return false; }
    if (conversationId) {
      const left = await db.rpc('leave_group', { conv: conversationId });
      if (left.error) fail('leave hit chat')(left.error);
    }
    return true;
  },
  /** Throws when it does not go through, so the hit can come back on screen. */
  async cancelHit(hitId: ID) { const { error } = await need().from('hit_requests').update({ cancelled: true }).eq('id', hitId); if (error) { fail('cancel hit')(error); throw error; } },
  /** 'blocked' when refused for its words (the box says so itself, not a toast), 'failed' for anything else. */
  async insertTip(tip: Tip) {
    const { error } = await need().from('tips').insert({ id: tip.id, user_id: tip.authorId, body: tip.body, created_at: tip.createdAt });
    if (!error) return undefined;
    if (isBlockedWords(error)) return 'blocked' as const;
    fail('tip')(error);
    return 'failed' as const;
  },
  async voteTip(tipId: ID, dir: 1 | -1) { const { error } = await need().rpc('vote_tip', { t: tipId, dir }); if (error) fail('tip vote')(error); },
  /** Your own tip, off the board. Throws when it was not deleted (before migration 128 nobody could delete one). */
  async deleteTip(id: ID) {
    const { data, error } = await need().from('tips').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!(data ?? []).length) throw new Error('tip not deleted');
  },

  /** Resolves false when it was not saved (most callers need not ask). */
  async updateProfile(me: ID, patch: ProfilePatch): Promise<boolean> {
    return (await remote.saveProfile(me, patch)) === 'ok';
  },
  /** The same, saying why not: 'blocked' when its words were refused (migration 117). */
  async saveProfile(me: ID, patch: ProfilePatch): Promise<'ok' | 'blocked' | 'failed'> {
    const row: Record<string, unknown> = {};
    if (patch.firstMove !== undefined) { row.first_move = patch.firstMove; row.first_move_at = new Date().toISOString(); }
    if (patch.openToHitUntil !== undefined) row.open_to_hit_until = patch.openToHitUntil;
    if (patch.readReceipts !== undefined) row.read_receipts = patch.readReceipts;
    if (patch.isPrivate !== undefined) row.is_private = patch.isPrivate;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.bio !== undefined) row.bio = patch.bio;
    if (patch.location !== undefined) row.location = patch.location;
    // A town, not a spot (security review, Oct 5): profiles are public, and "Use my location" hands over the phone's own fix, so only two decimals (about 1 km) ever leave the phone. The server rounds too.
    const town = (n?: number) => (n == null ? null : Math.round(n * 100) / 100);
    if (patch.cityAt !== undefined) { row.city_lat = town(patch.cityAt?.lat); row.city_lng = town(patch.cityAt?.lng); }
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    // Since migration 123 the database files tournament plans privately as the
    // profile is saved; the flag says this app knows that, so the plans sent
    // are the whole list (none clears them). Without the flag (an older app)
    // the database only ever adds plans.
    if (patch.profile !== undefined) row.profile = tournamentsPrivateLive ? { ...patch.profile, tournamentsPrivate: true } : patch.profile;
    let { error } = await need().from('profiles').update(row).eq('id', me);
    // A database without the town's position yet (migration 49): save the rest.
    if (error && /city_l(at|ng)/.test(error.message) && ('city_lat' in row || 'city_lng' in row)) {
      delete row.city_lat; delete row.city_lng;
      if (Object.keys(row).length) ({ error } = await need().from('profiles').update(row).eq('id', me));
      else error = null;
    }
    if (error) { fail('profile update')(error); return refusedFor(error) ?? 'failed'; }
    return 'ok';
  },

  /**
   * Makes sure the account has a profile row. The sign-up trigger normally
   * creates it; when it has not (seen with a Google sign-up), everything the
   * app saves about you would fail silently, quiz included.
   */
  async ensureProfile(me: ID, handle: string, name: string) {
    const { error } = await need().from('profiles').upsert({ id: me, handle, name }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) fail('profile create')(error);
  },

  /**
   * Saves a new post under the id the phone gave it when Share was tapped.
   * That id makes it safe to send twice: a second try (a reply lost on the
   * way back, a retry) finds the post already there and counts as done, so
   * one post can never become two. Throws when it truly could not be saved,
   * so the app says "Could not post" rather than "Posted" for a post nobody
   * else will ever see.
   */
  async insertPost(post: Post) {
    const row = {
      id: post.id,
      author_id: post.authorId,
      kind: post.kind,
      body: post.body,
      media_label: post.mediaLabel ?? null,
      image_url: post.imageUrl ?? null,
      video_url: post.videoUrl ?? null,
      thumbnail_url: post.thumbnailUrl ?? null,
      orientation: post.orientation ?? null,
      match: post.match ?? null,
      // The names on a session are the server's to write (migration 62); a list shown here early is never sent.
      session: sessionToSend(post.session),
      // The database files 20 #tags at most (posts_tags_count): any more stay in the words, just not filed.
      tags: post.tags.slice(0, TAGS_MAX),
      tagged_user_ids: post.taggedUserIds ?? [],
      created_at: post.createdAt,
      // A group post must never go up without its group (it would be public),
      // so this is never dropped like the optional edits below.
      ...(post.groupId ? { group_id: post.groupId } : {}),
    };
    // The edits a clip carries, only sent when set. Each column came with its
    // own migration; one the database does not know yet is dropped on its
    // own and the post still goes up, minus that one edit.
    const extras: Record<string, unknown> = {
      ...(post.trimStart !== undefined ? { trim_start: post.trimStart, trim_end: post.trimEnd ?? null } : {}),
      ...(post.muted ? { muted: true } : {}),
      ...(post.crop ? { crop: post.crop } : {}),
      ...(post.location ? { location: post.location } : {}),
      ...(post.speed && post.speed !== 1 ? { speed: post.speed } : {}),
      ...(post.volume !== undefined && post.volume > 0 && post.volume < 1 ? { volume: post.volume } : {}),
      ...(post.featureOk === false ? { feature_ok: false } : {}),
      ...(post.court ? { court_id: post.court.id, court_name: post.court.name, court_lat: post.court.lat, court_lng: post.court.lng } : {}),
    };
    const sending = { ...extras };
    const dropped: string[] = [];
    // Whether the post is already saved under its id (an answer lost on the way back still saved it).
    const landed = async () => {
      try {
        const { data } = await need().from('posts').select('id').eq('id', post.id).maybeSingle();
        return !!data;
      } catch { return false; }
    };
    let dropouts = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await need().from('posts').insert({ ...row, ...sending });
      if (!error) { if (dropped.length) console.warn(missingColumnsNote(dropped)); return; }
      // Already saved under this id: the same post, sent again. Nothing more to do.
      if (error.code === '23505') return;
      // The connection dropped (no answer from the database at all): the same
      // post, same id, is simply sent again, twice at most. If the first one
      // did get there, the second is told so (above) and it is still one post.
      if (!error.code && /network|fetch|timed? ?out|abort/i.test(error.message) && dropouts < 2) {
        dropouts += 1;
        await new Promise((r) => setTimeout(r, 1500 * dropouts));
        continue;
      }
      // PostgREST names the column it does not know: "Could not find the 'speed' column of 'posts' in the schema cache".
      const named = /'([a-z_]+)' column/.exec(error.message)?.[1] ?? /column "?([a-z_]+)"?/.exec(error.message)?.[1];
      if (named && named in sending) {
        delete sending[named];
        if (named === 'trim_start') delete sending.trim_end;
        // The court's four columns come and go together.
        if (named.startsWith('court_')) for (const key of Object.keys(sending)) if (key.startsWith('court_')) delete sending[key];
        dropped.push(named);
        continue;
      }
      // A message about one of ours that names no column: send the post bare.
      if (Object.keys(sending).length && OPTIONAL_COLUMNS.test(error.message)) {
        dropped.push(...Object.keys(sending));
        for (const key of Object.keys(sending)) delete sending[key];
        continue;
      }
      if (post.groupId && /group_id|not_in_group/.test(error.message)) {
        fail('group post insert')(error);
        throw new Error(/not_in_group/.test(error.message) ? 'You are not in that group any more.' : 'Groups are not switched on yet. Share it with everyone instead.');
      }
      // Refused for its words (migration 117): saying so is the whole message.
      if (isBlockedWords(error)) throw new Error(BLOCKED_WORDS_NOTE);
      // Past the database's own limits (posts_tags_count, posts_body_len): said as it is, not as a connection problem.
      if (error.code === '23514' && /posts_tags_count/.test(error.message)) throw new Error(`A post can tag up to ${TAGS_MAX} people. Take some off and post it again.`);
      if (error.code === '23514' && /posts_body_len/.test(error.message)) throw new Error('The caption is too long. Shorten it and post it again.');
      // Before saying it failed (and you post it again, as a second post): is it there after all?
      if (await landed()) return;
      fail('post insert')(error);
      throw new Error('Your post could not be saved. Check your connection and try again.');
    }
    if (await landed()) return;
    throw new Error('Your post could not be saved. Try again in a moment.');
  },

  /** False when it did not go through (no connection, say): the app puts the post back. */
  async deletePost(postId: ID): Promise<boolean> {
    const { error } = await need().from('posts').delete().eq('id', postId);
    if (error) fail('delete post')(error);
    return !error;
  },
  /** False when it did not go through: the app puts the post back as it was. */
  async setPostArchived(postId: ID, archived: boolean): Promise<boolean> {
    const { error } = await need().from('posts').update({ archived }).eq('id', postId);
    if (error) fail('post archive')(error);
    return !error;
  },
  /** The author's edit: words, tags, who is in it, where it was — and when. */
  /**
   * Resolves 'blocked' when the new words were refused (migration 117),
   * 'too-many-tagged' past the database's limit on tagged people
   * (posts_tags_count), and 'failed' when it did not save at all.
   */
  async updatePost(postId: ID, patch: { body: string; tags: string[]; taggedUserIds: ID[]; location?: string; court?: TaggedCourt | null; editedAt: string }): Promise<'blocked' | 'failed' | 'too-many-tagged' | undefined> {
    const base = { body: patch.body, tags: patch.tags.slice(0, TAGS_MAX), tagged_user_ids: patch.taggedUserIds };
    const court = patch.court === undefined ? {} : { court_id: patch.court?.id ?? null, court_name: patch.court?.name ?? null, court_lat: patch.court?.lat ?? null, court_lng: patch.court?.lng ?? null };
    let { error } = await need().from('posts').update({ ...base, location: patch.location ?? null, ...court, edited_at: patch.editedAt }).eq('id', postId);
    // Before migration 51 there is nowhere to keep the court: save the rest.
    if (error && /court_/.test(error.message)) ({ error } = await need().from('posts').update({ ...base, location: patch.location ?? null, edited_at: patch.editedAt }).eq('id', postId));
    if (!error) return undefined;
    if (error.code === '23514' && /posts_tags_count/.test(error.message)) return 'too-many-tagged';
    if (/location|edited_at/.test(error.message)) {
      console.warn('[remote] edit columns missing; run the pending migration — saving the words only');
      const retry = await need().from('posts').update(base).eq('id', postId);
      if (!retry.error) return undefined;
      fail('post edit')(retry.error);
      return refusedFor(retry.error) ?? 'failed';
    }
    fail('post edit')(error);
    return refusedFor(error) ?? 'failed';
  },
  /**
   * "Share health data" changed on a post already up (Oct 4, owner). Only the
   * list is this phone's word: the posts trigger (migration 72) rebuilds a
   * tracker post's stats from the author's own private tracker row, keeps
   * only the chosen numbers, and works out the names again. What it wrote
   * comes back, so the post shows the server's numbers. Null when it did
   * not save (not yours, no connection).
   */
  async setPostHealthShare(postId: ID, session: NonNullable<Post['session']>): Promise<Post['session'] | null> {
    const { data, error } = await need().from('posts').update({ session: sessionToSend(session) }).eq('id', postId).select('session').maybeSingle();
    if (error) { fail('post health share')(error); return null; }
    return trustedSession((data as { session: Post['session'] | null } | null)?.session) ?? null;
  },
  /**
   * "Let CourtSide feature this on its Instagram" switched on a post already
   * up (Edit post, Oct 5, owner). What the server kept comes back: a tracker
   * session's post always stays off (the posts trigger, migration 58 on).
   * Null when it did not save (not yours, no connection, a database before
   * migration 28).
   */
  async setPostFeatureOk(postId: ID, ok: boolean): Promise<boolean | null> {
    const { data, error } = await need().from('posts').update({ feature_ok: ok }).eq('id', postId).select('feature_ok').maybeSingle();
    if (error) { fail('post feature switch')(error); return null; }
    const row = data as { feature_ok: boolean | null } | null;
    return row ? row.feature_ok !== false : null;
  },
  /** False when it did not go through: the app puts the pin back as it was. */
  async setPostPinned(postId: ID, pinned: boolean): Promise<boolean> {
    const { error } = await need().from('posts').update({ pinned }).eq('id', postId);
    if (error) fail('post pin')(error);
    return !error;
  },

  // Likes, saves, views and follows are one row per person: a repeat (another
  // phone, a tap that raced a refresh) leaves the row already there alone
  // (ignoreDuplicates). A plain upsert tries to rewrite it, which these tables'
  // rules never allow, so a second like or follow came back refused.
  /** False when it did not go through (no connection, say). */
  async setLike(postId: ID, me: ID, liked: boolean): Promise<boolean> {
    const db = need();
    const { error } = liked
      ? await db.from('post_likes').upsert({ post_id: postId, user_id: me }, { ignoreDuplicates: true })
      : await db.from('post_likes').delete().match({ post_id: postId, user_id: me });
    if (error) fail('like')(error);
    return !error;
  },

  /** False when it did not go through (no connection, say). */
  async setSaved(postId: ID, me: ID, saved: boolean): Promise<boolean> {
    const db = need();
    const { error } = saved
      ? await db.from('post_saves').upsert({ post_id: postId, user_id: me }, { ignoreDuplicates: true })
      : await db.from('post_saves').delete().match({ post_id: postId, user_id: me });
    if (error) fail('save')(error);
    return !error;
  },

  async insertComment(comment: Comment): Promise<'blocked' | 'failed' | undefined> {
    const row = { id: comment.id, post_id: comment.postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt };
    const insert = (r: Record<string, unknown>) => insertReplying('comments', r, comment);
    let { error } = await insert({ ...row, ...(comment.imageUrl ? { image_url: comment.imageUrl } : {}) });
    // Before migration 52 there is nowhere for the photo: the words still go up.
    if (error && comment.imageUrl && /image_url/.test(error.message)) ({ error } = await insert(row));
    if (!error || error.code === '23505' || await commentLanded('comments', comment.id, error)) return undefined;
    fail('comment insert')(error);
    // 'blocked': refused for its words (migration 117); 'failed': not saved at all
    // (no connection; a photo with no words before migration 125). Either way the app takes it back off the list.
    return refusedFor(error) ?? 'failed';
  },

  /** The same as insertPost: saved under the phone's own id, safe to send twice, throws when it could not be saved. */
  async insertStory(story: Story) {
    const row = {
      id: story.id,
      author_id: story.authorId,
      image_url: story.imageUrl ?? null,
      video_url: story.videoUrl ?? null,
      thumbnail_url: story.thumbnailUrl ?? null,
      media_label: story.mediaLabel ?? null,
      caption: story.caption ?? null,
      created_at: story.createdAt,
      expires_at: story.expiresAt,
    };
    let { error } = await need().from('stories').insert(row);
    // The connection dropped: sent once more under the same id (a copy that got there the first time answers 23505).
    if (error && !error.code && /network|fetch|timed? ?out|abort/i.test(error.message)) {
      await new Promise((r) => setTimeout(r, 1500));
      ({ error } = await need().from('stories').insert(row));
    }
    if (!error || error.code === '23505') return;
    if (isBlockedWords(error)) throw new Error(BLOCKED_WORDS_NOTE);
    // Before saying it failed (and it is posted again, as a second one): is it there after all?
    const { data: there } = await need().from('stories').select('id').eq('id', story.id).maybeSingle().then((r) => r, () => ({ data: null }));
    if (there) return;
    fail('story insert')(error);
    throw new Error('Your Instant could not be saved. Check your connection and try again.');
  },

  /** False when it did not go through: the app puts the Instant back as it was. */
  async setStoryArchived(storyId: ID, archived: boolean): Promise<boolean> {
    const { error } = await need().from('stories').update({ archived }).eq('id', storyId);
    if (error) fail('story archive')(error);
    return !error;
  },

  /** Your own Instant, gone for good with its likes, views and comments. False when it is still there. */
  async deleteStory(storyId: ID): Promise<boolean> {
    const { data, error } = await need().from('stories').delete().eq('id', storyId).select('id');
    if (error) { fail('delete instant')(error); return false; }
    return !!data?.length || !(await rowThere('stories', storyId));
  },

  /**
   * A comment (or one on an Instant), with its replies: your own, or anyone's
   * under something of yours (migration 125). False when it is still there:
   * no connection, or a database from before 125 refusing a post's author.
   */
  async deleteComment(commentId: ID, onHit: boolean): Promise<boolean> {
    const table = onHit ? 'story_comments' : 'comments';
    const { data, error } = await need().from(table).delete().eq('id', commentId).select('id');
    if (error) { fail('delete comment')(error); return false; }
    return !!data?.length || !(await rowThere(table, commentId));
  },

  async setStoryLike(storyId: ID, me: ID, liked: boolean) {
    const db = need();
    const { error } = liked
      ? await db.from('story_likes').upsert({ story_id: storyId, user_id: me }, { ignoreDuplicates: true })
      : await db.from('story_likes').delete().match({ story_id: storyId, user_id: me });
    if (error) fail('hit like')(error);
  },

  /** A heart on a comment; `onHit` picks the table, since hit comments live apart. */
  async setCommentLike(commentId: ID, me: ID, liked: boolean, onHit: boolean) {
    const db = need();
    const table = onHit ? 'story_comment_likes' : 'comment_likes';
    const { error } = liked
      ? await db.from(table).upsert({ comment_id: commentId, user_id: me }, { ignoreDuplicates: true })
      : await db.from(table).delete().match({ comment_id: commentId, user_id: me });
    if (error) fail('comment like')(error);
  },

  async insertStoryComment(comment: Comment): Promise<'blocked' | 'failed' | undefined> {
    const { error } = await insertReplying('story_comments', {
      id: comment.id, story_id: comment.postId, author_id: comment.authorId, body: comment.body, created_at: comment.createdAt,
    }, comment);
    if (!error || error.code === '23505' || await commentLanded('story_comments', comment.id, error)) return undefined;
    fail('hit comment insert')(error);
    return refusedFor(error) ?? 'failed';
  },

  /**
   * New and deleted comments on one post or Instant, while its comments are
   * open (migration 56 streams both tables). Each new row has already passed
   * the reading rules (blocked people, private accounts) on the server. A
   * deleted one comes as its id alone, so deletes are heard table-wide and
   * the caller drops the ids it holds.
   */
  onComments(target: { id: ID; kind: 'post' | 'hit'; mine?: boolean }, handle: { added: (comment: Comment) => void; removed: (commentId: ID) => void; connected?: () => void }): () => void {
    const db = need();
    const table = target.kind === 'hit' ? 'story_comments' : 'comments';
    const column = target.kind === 'hit' ? 'story_id' : 'post_id';
    // Its own name each time: the sheet and the Instant page may watch the same thing at once.
    commentWatches += 1;
    const channel = db.channel(`comments-live:${target.kind}:${target.id}:${commentWatches}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${column}=eq.${target.id}` }, (payload) => {
        const row = payload.new as CommentRow & { story_id?: string };
        const show = () => handle.added(target.kind === 'hit' ? toStoryComment({ ...row, story_id: row.story_id ?? target.id }) : toComment(row));
        // On your own post or Instant, someone else's may have been hidden by your Hidden words (migration 117): asked first.
        if (target.mine && row.author_id !== heldOwner()) void learnHeld([row.id]).catch(() => undefined).then(show);
        else show();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) handle.removed(id);
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') handle.connected?.(); });
    return () => { void db.removeChannel(channel); };
  },

  async recordStoryView(storyId: ID, me: ID) {
    const { error } = await need().from('story_views').upsert({ story_id: storyId, user_id: me }, { ignoreDuplicates: true });
    if (error) fail('story view')(error);
  },

  /** Asking to follow a private account, and what happens to the ask. */
  async sendFollowRequest(me: ID, userId: ID): Promise<'refused' | void> {
    // An ask already waiting (from an earlier tap or another phone) simply stands: "do nothing" on a repeat.
    // A plain upsert would rewrite the row, which the rules only let the database itself do, and came back refused.
    const { error } = await need().from('follow_requests').upsert({ requester_id: me, target_id: userId }, { onConflict: 'requester_id,target_id', ignoreDuplicates: true });
    if (error && error.code === '42501') return 'refused';
    if (error) fail('follow request')(error);
  },
  async cancelFollowRequest(me: ID, userId: ID) {
    const { error } = await need().from('follow_requests').delete().match({ requester_id: me, target_id: userId });
    if (error) fail('cancel follow request')(error);
  },
  /** The server adds the follow and clears the ask in one go, as the account being followed. */
  async acceptFollowRequest(requesterId: ID) {
    const { error } = await need().rpc('accept_follow_request', { requester: requesterId });
    if (error) fail('accept follow request')(error);
  },
  async declineFollowRequest(me: ID, requesterId: ID) {
    const { error } = await need().from('follow_requests').delete().match({ requester_id: requesterId, target_id: me });
    if (error) fail('decline follow request')(error);
  },
  async updatePostThumbnail(postId: ID, thumbnailUrl: string) {
    const { error } = await need().from('posts').update({ thumbnail_url: thumbnailUrl }).eq('id', postId);
    if (error) fail('post thumbnail')(error);
  },

  /** Resolves 'refused' when the database will not take a follow (someone you are blocked with). */
  async setFollow(me: ID, userId: ID, following: boolean): Promise<'refused' | void> {
    const db = need();
    const { error } = following
      ? await db.from('follows').upsert({ follower_id: me, following_id: userId }, { ignoreDuplicates: true })
      : await db.from('follows').delete().match({ follower_id: me, following_id: userId });
    if (error && error.code === '42501') return 'refused';
    if (error) fail('follow')(error);
  },

  async bumpViews(postId: ID) {
    const { error } = await need().rpc('bump_post_views', { post: postId });
    if (error) fail('view count')(error);
  },
};

/* ------------------------------------------------------------ feed signals */

/**
 * What someone did with a post in the feed, for a smarter feed later: they
 * saw it, how long it was on screen, whether they swiped past it within a
 * second and a half, and whether they tapped through to its author.
 */
export interface FeedSignal {
  kind: 'post' | 'hit' | 'question';
  id: ID;
  seen?: boolean;
  watched?: number;
  skipped?: boolean;
  profileTap?: boolean;
}

// Signals wait here and go up together every few seconds (or as the app goes
// to the background), so a fast scroll is one small request, not dozens.
let pendingSignals: FeedSignal[] = [];
let signalTimer: ReturnType<typeof setTimeout> | null = null;
async function flushSignals() {
  if (signalTimer) { clearTimeout(signalTimer); signalTimer = null; }
  if (!pendingSignals.length || !supabase) return;
  const items = pendingSignals.splice(0, 60).map((sg) => ({ ...sg, watched: sg.watched ? Math.round(sg.watched * 10) / 10 : 0 }));
  const { error } = await supabase.rpc('record_feed_signals', { items });
  // A database without migration 20 simply refuses; nothing to retry.
  if (error && !/function|schema cache/i.test(error.message)) fail('feed signals')(error);
  if (pendingSignals.length) signalTimer = setTimeout(() => { void flushSignals(); }, 8000);
}
export function queueFeedSignal(signal: FeedSignal) {
  pendingSignals.push(signal);
  // The look that was on screen as the app went away (the feed closes it a moment after the flush below):
  // sent now, not in eight seconds a phone in the background may never give it.
  if (pendingSignals.length >= 40 || AppState.currentState !== 'active') { void flushSignals(); return; }
  if (!signalTimer) signalTimer = setTimeout(() => { void flushSignals(); }, 8000);
}
AppState.addEventListener('change', (next) => { if (next !== 'active') void flushSignals(); });

/* --------------------------------------------------------------- media */

/** A picker result still on the device, as opposed to something already hosted. */
export const isLocalMedia = (uri?: string) =>
  !!uri && /^(file:|content:|blob:|data:|ph:|assets-library:)/.test(uri);

/**
 * Copies a picked photo or video into the media bucket under the player's
 * folder and returns its public URL. Falls back to the original URI on
 * failure so the local post still shows.
 */
const ALLOWED_MEDIA = /^(image|video|audio)\/[a-z0-9.+-]+$/i;

/** The file's type from its name, for a file the phone hands over without one. */
function guessType(uri: string, kind: 'photo' | 'video' | 'audio'): string {
  const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
  const known: Record<string, string> = { m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' , ...(kind === 'audio' ? { mp4: 'audio/mp4', webm: 'audio/webm' } : {}) };
  return known[ext] ?? (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mp4' : 'image/jpeg');
}

/** How long a public upload may be kept by phones, browsers and the storage server's cache: a year (names are never reused). */
const YEAR_SECONDS = 31536000;

/**
 * Sends one file to the bucket with a running report of how much has gone
 * (the posting strip's percentage). Supabase's own upload call gives no
 * progress, so this talks to the storage address directly; if that is
 * refused for any reason, the plain upload runs instead, and the bar simply
 * jumps to the end.
 */
async function uploadWithProgress(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void, bucket = 'media', cacheSeconds = YEAR_SECONDS): Promise<void> {
  const db = need();
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apikey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  const token = (await db.auth.getSession()).data.session?.access_token;
  if (!base || !apikey || !token || typeof XMLHttpRequest === 'undefined') throw new Error('no direct upload');
  const form = new FormData();
  const name = path.split('/').pop() ?? 'upload';
  // How long phones, browsers and the storage server's cache may keep it. Must come before the file.
  form.append('cacheControl', String(cacheSeconds));
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('', blob, name);
  } else {
    // The phone streams the file from disk itself — no copy into memory.
    form.append('', { uri, name, type: contentType } as unknown as Blob);
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', apikey);
    xhr.setRequestHeader('x-upsert', 'false');
    // A public upload has its own name and is never replaced, so it can be
    // kept for a year instead of re-checked on every view. A private chat
    // photo is kept no longer than its link works (see uploadChatPhoto).
    xhr.setRequestHeader('cache-control', `max-age=${cacheSeconds}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}: ${xhr.responseText.slice(0, 200)}`)));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(form);
  });
}

/** The bucket's limit, which is also the most Supabase's free plan accepts per file. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** A size for the crash note: "24 MB", or "unknown-size". */
const megabytes = (bytes: number) => (bytes ? `${Math.max(1, Math.round(bytes / 1048576))} MB` : 'unknown-size');

/**
 * How big a picked file is, in bytes (0 when it cannot be told). A phone
 * asks the file system, which reads nothing into memory; a browser's picked
 * file is already in memory, so it is simply looked at.
 */
async function sizeOf(uri: string): Promise<number> {
  if (Platform.OS !== 'web') {
    try {
      const file = new DeviceFile(uri);
      return file.exists ? file.size ?? 0 : 0;
    } catch {
      return 0;
    }
  }
  return fetch(uri).then((r) => r.blob()).then((b) => b.size).catch(() => 0);
}

/**
 * Makes and sends a post's small cover (see smallCover.ts) next to the full
 * one just sent, unless the player is near the daily upload limit (see
 * roomForSmallCover). Never throws: a tile with no small cover quietly shows
 * the full one. It is waited for, so a tile usually finds it the moment the post
 * appears, but for two and a half seconds at most, making and sending
 * together: on a slow phone or connection the post goes ahead and the small
 * copy carries on by itself.
 */
async function sendSmallCover(me: ID, path: string, picture: string): Promise<void> {
  const work = (async () => {
    const [small, room] = await Promise.all([shrinkCover(picture), roomForSmallCover(me)]);
    if (!small || !room) return;
    const target = smallName(path);
    await uploadWithProgress(target, small, 'image/jpeg').catch(async () => {
      // A few dozen KB, so the plain upload (from memory) is fine on a phone too.
      const bytes = await (await fetch(small)).arrayBuffer();
      const { error } = await need().storage.from('media').upload(target, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (error) throw error;
    });
  })().catch((error) => console.warn('[remote] small cover not sent', error));
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 2_500))]);
}

/**
 * The bucket takes at most 60 files from each player in any 24 hours (the
 * "upload into your folder" rule), and a small copy uses one of them like
 * any other file. So once a player has sent 40 in the last 24 hours, covers
 * go up without a small copy and the last 20 are kept for real posts; a tile
 * without one just shows the full cover. If the count cannot be read, no
 * small copy is sent, to be safe.
 */
const SMALL_COVERS_A_DAY_UNTIL = 40;
async function roomForSmallCover(me: ID): Promise<boolean> {
  const { data, error } = await need().storage.from('media')
    .list(me, { limit: SMALL_COVERS_A_DAY_UNTIL, sortBy: { column: 'created_at', order: 'desc' } })
    .catch((thrown: unknown) => ({ data: null, error: thrown }));
  if (error || !data) {
    console.warn('[remote] could not count today\'s uploads', error);
    return false;
  }
  const dayAgo = Date.now() - 86_400_000;
  return data.filter((file) => file.created_at && Date.parse(file.created_at) > dayAgo).length < SMALL_COVERS_A_DAY_UNTIL;
}

/**
 * Sends a picked file to the bucket and returns its public address. Throws
 * with a plain-words message if it cannot — a post must never be saved
 * pointing at a file that only exists on one phone. With `smallCover`, a
 * photo that will be a post's cover also gets its small copy for grid tiles.
 * `me` is the folder it goes in: your own id, or a group's id for a group's
 * photo (migration 73 lets only that group's admins put files there).
 */
/** Supabase's phone messages, in plain words. */
function phoneError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('provider') || m.includes('unsupported') || m.includes('sms')) return 'Phone numbers can’t be linked just yet. Try again soon.';
  if (m.includes('already') || m.includes('registered') || m.includes('exists')) return 'That number is already linked to another CourtSide account.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token')) return 'That code didn’t work. Check it, or send a new one.';
  if (m.includes('rate') || m.includes('too many') || m.includes('seconds')) return 'Too many tries. Wait a minute, then try again.';
  if (m.includes('phone')) return 'That number doesn’t look right. Include the area code.';
  return 'That didn’t go through. Try again.';
}

export async function uploadMedia(me: ID, original: string, kind: 'photo' | 'video' | 'audio', onProgress?: (fraction: number) => void, options?: { smallCover?: boolean }): Promise<string> {
  try {
    const db = need();
    // A photo goes up at the size a feed shows it (1440 on its long edge),
    // not the camera's full size: ten times smaller, same on screen.
    const uri = kind === 'photo' ? await shrinkPhoto(original) : original;
    // A video is shrunk too, when this build can (see shrinkVideo): the first
    // part of the upload bar is the shrinking, the rest the sending.
    const shrinking = kind === 'video' && canShrinkVideo();
    const upload = shrinking ? (f: number) => onProgress?.(0.35 + 0.65 * f) : onProgress;
    // Noted before the shrinker (the phone's own code) starts: if it takes the app down, the next open says so.
    if (shrinking) await noteStep(`shrinking a ${megabytes(await sizeOf(uri))} video`);
    const sent = shrinking ? await shrinkVideo(uri, (f) => onProgress?.(0.35 * f)) : uri;
    // Too big is the usual reason an upload fails, and it is worth saying
    // before the bytes go up rather than after. On a phone the size is read
    // from the file itself: reading a long clip into memory just to measure
    // it (hundreds of MB if it could not be shrunk) is enough for the phone
    // to close the app.
    const size = await sizeOf(sent);
    if (size > MAX_UPLOAD_BYTES) {
      const mb = Math.round(size / 1024 / 1024);
      throw new Error(tooBigReason(kind, Math.round(MAX_UPLOAD_BYTES / 1024 / 1024), mb));
    }
    const contentType = Platform.OS === 'web'
      ? ((await fetch(sent, { method: 'HEAD' }).catch(() => null))?.headers.get('content-type') || guessType(sent, kind)).split(';')[0].trim()
      : guessType(sent, kind);
    // The bucket enforces the same list; checking here gives a readable message.
    if (!ALLOWED_MEDIA.test(contentType)) throw new Error('Only photos and videos can be posted.');
    const ext = contentType.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg');
    // A cover that gets a small copy says so in its name, which is how tiles know to ask for it.
    const withSmall = kind === 'photo' && !!options?.smallCover;
    const path = `${me}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${withSmall ? COVER_MARK : ''}.${ext}`;
    // Where a video was filmed is blanked before any of it goes up (see
    // videoLocation.ts): phones write the spot into the file, often a
    // player's home, and every video the app uploads comes through here.
    // The compressor's new file is blanked where it is; a picked file that
    // went up unshrunk is never changed, and a blanked copy goes instead
    // (same kind of file, so the type worked out above still holds).
    const blanked = kind === 'video' ? await blankVideoLocation(sent, { inPlace: sent !== uri }) : null;
    const file = blanked?.uri ?? sent;
    await noteStep(`sending a ${megabytes(size)} ${kind}${shrinking && sent === uri ? ' that could not be shrunk' : ''}`);
    try {
      await uploadWithProgress(path, file, contentType, upload);
    } catch (direct) {
      console.warn('[remote] direct upload fell back', direct);
      // The plain upload needs the whole file in memory. On a phone that is
      // only done for a file known to be under the limit; one whose size
      // could not be read is never loaded blind (see sizeOf above).
      if (Platform.OS !== 'web' && !size) throw direct;
      await noteStep(`sending a ${megabytes(size)} ${kind} from memory (the direct send failed)`);
      const response = await fetch(file);
      const bytes = await response.arrayBuffer();
      const { error } = await db.storage.from('media').upload(path, bytes, { contentType, upsert: false, cacheControl: String(YEAR_SECONDS) });
      if (error) throw error;
    } finally {
      // The blanked copy, if one was made, is not needed once the upload is over, sent or not.
      blanked?.release();
    }
    // The bar is full once the post's own file is up; the small copy is extra.
    onProgress?.(1);
    // Made from the photo just sent (already shrunk), so it is quick.
    if (withSmall) await sendSmallCover(me, path, uri);
    return db.storage.from('media').getPublicUrl(path).data.publicUrl;
  } catch (error) {
    fail('media upload')(error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(/exceeded the maximum allowed size/i.test(message) ? tooBigReason(kind, Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)) : message);
  }
}

/** The private shelf chat photos go on (migration 61), and how long a link to one keeps working. */
const CHAT_PHOTOS = 'chat-photos';
const CHAT_PHOTO_LINK_SECONDS = 60 * 60;
/** A chat photo's long edge once shrunk on the phone, and its JPEG quality: sharp full screen, a few hundred KB. */
const CHAT_PHOTO_EDGE = 1600;
const CHAT_PHOTO_QUALITY = 0.8;
/** What a chat photo's sender is told when the phone could not re-draw it (an odd format, or too big for memory). */
export const CHAT_PHOTO_UNREADABLE = 'Couldn’t prepare this photo. Try another one.';

/**
 * Puts one picked photo on the private chat shelf, shrunk on the phone first
 * (1600 px on its long edge, JPEG at 80%), at "<chat>/<you>/<name>.jpg" (the
 * shape migration 61's rules read), and says where it went and its size in
 * pixels. Throws with plain words if it cannot.
 *
 * Only the re-drawn JPEG ever goes up: re-drawing leaves behind what the
 * camera wrote into the file, above all where the photo was taken (often
 * someone's home). A photo that cannot be re-drawn is refused rather than
 * sent as it is (the shelf only takes JPEGs anyway).
 */
export async function uploadChatPhoto(me: ID, conversationId: ID, picked: ChatPhoto, onProgress?: (fraction: number) => void): Promise<ChatPhoto> {
  const original = picked.path;
  try {
    const db = need();
    const shrunk = await shrinkPhotoSized(original, CHAT_PHOTO_EDGE, CHAT_PHOTO_QUALITY);
    if (!shrunk.width || !shrunk.height || shrunk.uri === original) throw new Error(CHAT_PHOTO_UNREADABLE);
    onProgress?.(0.1);
    const contentType = 'image/jpeg';
    const path = `${conversationId.toLowerCase()}/${me.toLowerCase()}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const sending = (f: number) => onProgress?.(0.1 + 0.9 * f);
    // Kept by caches no longer than a link to it works: a photo that is unsent,
    // or someone taken out of the chat, must not go on being served from a
    // copy kept along the way. The app keeps its own copy on the phone.
    const cacheSeconds = CHAT_PHOTO_LINK_SECONDS;
    try {
      await uploadWithProgress(path, shrunk.uri, contentType, sending, CHAT_PHOTOS, cacheSeconds);
    } catch (direct) {
      console.warn('[remote] direct chat photo upload fell back', direct);
      const bytes = await (await fetch(shrunk.uri)).arrayBuffer();
      const { error } = await db.storage.from(CHAT_PHOTOS).upload(path, bytes, { contentType, upsert: false, cacheControl: String(cacheSeconds) });
      if (error) throw error;
    }
    onProgress?.(1);
    return { path, w: shrunk.width, h: shrunk.height };
  } catch (error) {
    fail('chat photo upload')(error);
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/* ---------------------------------------------------------------- auth */

/**
 * Where Google sends the phone back to. Supabase refuses any return address
 * whose host is an IP address other than 127.0.0.1, and Expo Go's own address
 * is the Mac's Wi-Fi IP — so on iPhone the app's scheme is used instead. The
 * sign-in sheet catches that address itself, whether or not the phone has an
 * app registered for it, which is why it works in Expo Go too.
 *
 * An Android build uses the very same address (Oct 5), the one Supabase
 * already allows for the iPhone, so nothing needs adding there; it was
 * courtside:///, which Supabase would have refused. Only Expo Go on Android
 * keeps its own exp:// address. app/+native-intent.tsx keeps the app's pages
 * from also trying to open courtside://auth when it comes back.
 */
function nativeReturnAddress() {
  if (Platform.OS === 'ios' || Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) return 'courtside://auth';
  return Linking.createURL('/');
}

/** Wipes the Android Google helper's own copy of a login, and any leftover one-time secret. */
async function clearAndroidOAuth() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(ANDROID_OAUTH_KEY));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch { /* nothing kept */ }
}

/**
 * Android: Google's one-time code (PKCE, see androidOAuthClient) turned into
 * the login, which then becomes the app's own (the main client's), so the
 * app opens signed in. Also used when Android closed the app while Google was
 * open and the return opened it afresh (app/+native-intent.tsx).
 */
export async function finishAndroidGoogle(returnUrl: string) {
  const helper = androidOAuthClient();
  const client = need();
  if (!helper) throw new Error('Google sign-in is not available here.');
  const back = new URL(returnUrl);
  const params = new URLSearchParams(back.hash.startsWith('#') ? back.hash.slice(1) : back.search.slice(1));
  const code = back.searchParams.get('code');
  if (!code) throw new Error(params.get('error_description') ?? 'Google did not return a session.');
  const flowId = back.searchParams.get('sb_flow_id');
  try {
    const exchanged = await helper.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (exchanged.error || !exchanged.data.session) throw new Error(exchanged.error?.message ?? 'Google did not return a session.');
    const { access_token, refresh_token } = exchanged.data.session;
    const set = await client.auth.setSession({ access_token, refresh_token });
    if (set.error) throw new Error(set.error.message);
    return set.data.session;
  } finally {
    await clearAndroidOAuth();
  }
}

export const auth = {
  async signIn(email: string, password: string) {
    const { data, error } = await need().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    return data.session;
  },
  async signUp(email: string, password: string, name: string, handle: string, birthDate?: string, invitedBy?: string | null) {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const { data, error } = await need().auth.signUp({
      email: email.trim(),
      password,
      // The sign-up form cannot be sent without ticking the terms, so the
      // agreement is written onto the account as it is made. The birthday
      // typed on the form rides along too: the account can open before it is
      // saved, or only from the email link (on any phone or browser), and the
      // age check saves it from here instead of asking again. It still goes
      // through set_birth_date, and comes off once the age is on file.
      // The invite link this person came through rides along as well, and the
      // server credits it the moment the account is made (migration 116), so
      // it is not lost when the confirmation email opens in another browser.
      options: {
        data: { name: name.trim(), handle: handle.trim().toLowerCase(), terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString(), ...(birthDate ? { birth_date: birthDate } : {}), ...(invitedBy ? { invited_by: invitedBy } : {}) },
        // The confirmation link comes back to this same site, where the invite link was kept.
        ...(Platform.OS === 'web' ? { emailRedirectTo: `${window.location.origin}${base}/` } : {}),
      },
    });
    if (error) throw new Error(error.message);
    // With email confirmation on, there is no session yet; the screen says so.
    return data.session;
  },
  async signOut() {
    // Leaves this phone signed out without ending the login on the server.
    // Supabase's own sign-out ends it there too, which threw away the token
    // the sign-in screen keeps for this account, and tapping the account
    // then failed with "Invalid Refresh Token".
    await forgetLocalSession();
  },
  /**
   * Logs out and ends this login on the server too (only this one: the
   * account's other phones and computers stay signed in), so its saved token
   * stops working. For a browser, which may be shared (see signOut).
   */
  async endSession() {
    // Supabase takes the login off this device even when the server cannot be reached.
    await need().auth.signOut({ scope: 'local' }).catch(() => undefined);
    await forgetLocalSession();
  },
  /**
   * Signs in as a remembered account from its refresh token, replacing whoever
   * is signed in now. The saved login is renewed on a throwaway client that
   * keeps nothing, and only a renewed one replaces the account on screen: an
   * expired login, or no connection, leaves you signed in exactly as you
   * were. (Renewing on the app's own client wiped the current login first,
   * so a failure signed you out of both.) The account being left stays valid
   * on the server too, so switching back is a tap. An expired login's error
   * is marked `expired`, so only that one is dropped from the saved list.
   * Renewing spends the old token, so `keep` saves the new one at once,
   * before anything else can fail: the saved list never holds a spent one.
   */
  async resumeAccount(refreshToken: string, keep?: (renewed: { userId: string; email?: string; refreshToken: string }) => Promise<unknown>) {
    const client = need();
    const check = throwawayAuthClient();
    if (!check) throw new Error('Supabase is not configured');
    const { data, error } = await check.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      if (error && isAuthRetryableFetchError(error)) throw new Error('Could not reach CourtSide. Check your connection and try again.');
      throw Object.assign(new Error('That login has expired on this phone. Sign in with your email to add it again.'), { expired: true });
    }
    if (keep) await keep({ userId: data.session.user.id, email: data.session.user.email ?? undefined, refreshToken: data.session.refresh_token }).catch(() => undefined);
    const set = await client.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    if (set.error || !set.data.session) throw new Error('Could not switch accounts. Check your connection and try again.');
    return set.data.session;
  },
  /**
   * Google, through Supabase. On the web the whole page goes to Google and
   * comes back to the app, where the client picks the session out of the URL
   * on its own. On a phone the page cannot leave, so an in-app browser opens
   * instead and the session is read out of the URL it hands back.
   */
  async signInWithGoogle() {
    const client = need();
    if (Platform.OS === 'web') {
      const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        // Always Google's account chooser, so someone with two Google accounts can pick.
        options: { redirectTo: `${window.location.origin}${base}/`, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw new Error(error.message);
      return null;
    }
    const redirectTo = nativeReturnAddress();
    // Android: the PKCE way, through its helper client (see androidOAuthClient).
    const helper = androidOAuthClient();
    if (helper) {
      await clearAndroidOAuth();
      const started = await helper.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (started.error || !started.data.url) throw new Error(started.error?.message ?? 'Google sign-in could not start.');
      const back = await WebBrowser.openAuthSessionAsync(started.data.url, redirectTo);
      if (back.type !== 'success') { await clearAndroidOAuth(); return null; }
      return finishAndroidGoogle(back.url);
    }
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw new Error(error.message);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return null;
    const url = new URL(result.url);
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.search.slice(1));
    const code = url.searchParams.get('code');
    if (code) {
      const exchanged = await client.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw new Error(exchanged.error.message);
      return exchanged.data.session;
    }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) throw new Error(params.get('error_description') ?? 'Google did not return a session.');
    const set = await client.auth.setSession({ access_token, refresh_token });
    if (set.error) throw new Error(set.error.message);
    return set.data.session;
  },

  /* ------------------------------------------------------- account centre */

  /** Who is signed in, as the auth system sees them: email, sign-in methods, since when. */
  /**
   * Sign in with Apple, the way Apple wants it on iPhone: the phone's own
   * sheet hands back a signed token, Supabase checks it against the app's
   * bundle id. Apple gives the person's name once, on the first sign-in.
   */
  async signInWithApple() {
    const client = need();
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!cred.identityToken) throw new Error('Apple did not finish signing you in.');
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
    if (error) throw new Error(error.message);
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ').trim();
    if (name && !data.user?.user_metadata?.name) await client.auth.updateUser({ data: { name } }).catch(() => undefined);
    // The profile was made by the sign-up step before Apple's name could reach it, from the
    // first part of the email: with Hide My Email a random string ("X7k2m9qbzt"), which the
    // setup's Name box then showed. Apple's name (this time's, or one saved on an earlier
    // sign-in) goes on the profile while it still holds that stand-in, before the app loads
    // it, so the reviewer and everyone else start with their real name (App Review 4.0, Oct 5).
    const metaName = typeof data.user?.user_metadata?.name === 'string' ? data.user.user_metadata.name.trim() : '';
    const appleName = (name || metaName).slice(0, 60);
    // The name put on the profile just now, if any: the app's sign-in listener began loading the
    // account before it got there, so the app puts it on screen itself (see AppContext).
    let applied: string | null = null;
    if (data.user && appleName) {
      try {
        const { data: row } = await client.from('profiles').select('name, handle').eq('id', data.user.id).maybeSingle();
        const p = row as { name?: string; handle?: string } | null;
        if (p?.handle && p.name && (p.name === standInName(p.handle) || p.name === p.handle) && p.name !== appleName) {
          const { error: nameError } = await client.from('profiles').update({ name: appleName }).eq('id', data.user.id).eq('name', p.name);
          if (!nameError) applied = appleName;
        }
      } catch { /* the setup's Name box is still there to fix it */ }
    }
    return data.session ? { session: data.session, name: applied } : null;
  },
  /**
   * For deleting an account made with Apple: Apple's own sheet asks the
   * person to confirm once more and hands back a one-time code, which the
   * server swaps for Apple's token and revokes (Apple's account-deletion
   * guidance). Null when the account has no Apple sign-in, off an iPhone, or
   * when the sheet is closed; deleting goes ahead either way.
   */
  async appleCodeForDelete(): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;
    try {
      const { data } = await need().auth.getUser();
      if (!(data.user?.identities ?? []).some((i) => i.provider === 'apple')) return null;
      if (!(await AppleAuthentication.isAvailableAsync())) return null;
      const cred = await AppleAuthentication.signInAsync({ requestedScopes: [] });
      return cred.authorizationCode ?? null;
    } catch {
      return null;
    }
  },
  async account() {
    const { data, error } = await need().auth.getUser();
    if (error || !data.user) throw new Error(error?.message ?? 'Not signed in');
    const providers = (data.user.identities ?? []).map((i) => i.provider);
    return {
      email: data.user.email ?? '',
      providers,
      createdAt: data.user.created_at,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
    };
  },
  /** Sends the "set a new password" email. The link signs them in on the site, where the account page takes the new password. */
  async requestPasswordReset(email: string) {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}${base}/account?reset=1` : 'https://app.courtsidebase.com/account?reset=1';
    const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw new Error(error.message);
  },
  /** The sign-up confirmation email again, coming back to the same place the first one did. */
  async resendConfirmation(email: string) {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const { error } = await need().auth.resend({
      type: 'signup',
      email: email.trim(),
      ...(Platform.OS === 'web' ? { options: { emailRedirectTo: `${window.location.origin}${base}/` } } : {}),
    });
    if (error) throw new Error(error.message);
  },
  /**
   * The signed-in account as this phone's login has it, for the age check:
   * when it was made, and the birthday its sign-up form carried, if any. No
   * trip to the server.
   */
  async signedInUser(): Promise<{ id: string; createdAt: string; birthDate: string | null } | null> {
    const user = (await need().auth.getSession()).data.session?.user;
    if (!user) return null;
    const dob: unknown = user.user_metadata?.birth_date;
    return { id: user.id, createdAt: user.created_at, birthDate: typeof dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null };
  },
  /** Takes the sign-up form's birthday off the account once the age check has it (set_birth_date keeps its own private copy). */
  async forgetSignUpBirthDate() {
    const { error } = await need().auth.updateUser({ data: { birth_date: null } });
    if (error) throw new Error(error.message);
  },
  /** Records that this account agreed to the current terms, on the account itself. */
  async acceptTerms() {
    const { error } = await need().auth.updateUser({ data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() } });
    if (error) throw new Error(error.message);
  },
  async updatePassword(password: string) {
    const { error } = await need().auth.updateUser({ password });
    if (error) throw new Error(error.message);
  },
  /** Supabase emails both addresses; the change lands when the new one is confirmed. */
  async updateEmail(email: string) {
    const { error } = await need().auth.updateUser({ email: email.trim() });
    if (error) throw new Error(error.message);
  },
  async signOutEverywhere() {
    const { error } = await need().auth.signOut({ scope: 'global' });
    if (error) throw new Error(error.message);
  },
  /** Adds Google as a second way into an email account. Needs "manual linking" on in Supabase. */
  async linkGoogle() {
    const client = need();
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    const redirectTo = Platform.OS === 'web' ? `${window.location.origin}${base}/account` : nativeReturnAddress();
    const { data, error } = await client.auth.linkIdentity({ provider: 'google', options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' } });
    if (error) throw new Error(error.message);
    if (Platform.OS !== 'web' && data.url) await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  },
  /**
   * Deletes the account. `appleCode` is a fresh code from Apple's sheet (see
   * appleCodeForDelete): with it the server also revokes the Sign in with
   * Apple link, so CourtSide leaves the person's Apple ID settings too.
   */
  async deleteAccount(appleCode?: string | null) {
    const { data, error } = await need().functions.invoke<{ ok?: boolean; error?: string }>('delete-account', { body: appleCode ? { appleCode } : {} });
    if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? 'Could not delete the account.');
    await need().auth.signOut();
  },
};
