/**
 * Fake API layer.
 *
 * Every read the app performs goes through here, with a small artificial
 * latency so loading states are real. Replace each function body with a fetch
 * or a Supabase query and the UI does not change.
 */

import { achievements } from './mock/achievements';
import { coaches, coachingRequests, coachResults, coachReviews } from './mock/coaching';
import { answers, questions } from './mock/discussions';
import { coachQuestions, coachReplies } from './mock/coachQuestions';
import { comments, posts } from './mock/feed';
import { demoGroupPosts } from './mock/groups';
import { stories } from './mock/stories';
import { conversations, messages } from './mock/messages';
import { healthHistory, integrations } from './mock/health';
import { activityNotifications, demoFoundWorkouts, detectedActivities, whoopWeek } from './mock/activities';
import { CURRENT_USER_ID, users } from './mock/users';
import { demoHits } from './mock/hits';
import { isMapCourtId } from '@/features/places/courtName';
import { demoLastSeen } from './mock/presence';
import { DEMO_FOLLOWING, DEMO_MAP_ALERTS } from './mock/courtLife';
import { demoSessionTagNotifications, demoSessionTags, demoSessions } from './mock/sessions';
import { DEMO_COURT_REGULARS, DEMO_COURT_WINS, DEMO_FLYBY } from './mock/strava';
import { localDay } from '@/features/practice/stats';
import { STREAK_FLAME_FROM } from '@/features/practice/streakFlame';
import { notKnownAdult } from '@/features/players/age';
import { lastWeekStart, weekRecap } from '@/features/recap/recap';
import { supabase } from '@/lib/supabase';
import { canTagKind, isActive, isClosed, maxTagsFor, mirrorCopy } from '@/features/activity/sessionTags';
import type {
  Achievement,
  Answer,
  Coach,
  CoachApplication,
  CoachingRequest,
  CoachQuestion,
  CoachReply,
  CoachResult,
  CoachReview,
  Comment,
  Conversation,
  CourtKings,
  DailyHealth,
  FlybyPerson,
  FriendStreak,
  DetectedActivity,
  Integration,
  Message,
  Notification,
  Post,
  PracticeSession,
  HeadToHead,
  MatchSet,
  SessionTag,
  SessionTagRefusal,
  SessionTagRole,
  ShareKind,
  SharePerson,
  SharePreview,
  ShareTile,
  Question,
  Story,
  HitRequest,
  LastSeen,
  TrainingBlockKind,
  TrainingPlan,
  User,
  ID,
} from './types';

// The stand-in delay that makes loading states real in the demo. With a real
// backend there is real latency already, so it drops to nothing.
const LATENCY_MS = supabase ? 0 : 320;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Deep-ish clone so screens never mutate the seed data by accident. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface Bootstrap {
  users: User[];
  posts: Post[];
  stories: Story[];
  comments: Comment[];
  questions: Question[];
  answers: Answer[];
  coaches: Coach[];
  coachingRequests: CoachingRequest[];
  integrations: Integration[];
  healthHistory: DailyHealth[];
  achievements: Achievement[];
  coachQuestions: CoachQuestion[];
  coachReplies: CoachReply[];
  coachApplications: CoachApplication[];
  coachResults: CoachResult[];
  coachReviews: CoachReview[];
  conversations: Conversation[];
  messages: Message[];
  notifications: Notification[];
  /** Demo only: open hits and players' last spots, so Find Players and the map have something on them. */
  hitRequests?: HitRequest[];
  lastSeen?: Record<ID, LastSeen>;
  /** Demo only: the people the demo player follows, for the map's Following chip and court cards. */
  followingIds?: ID[];
  /** Tennis sessions a tracker picked up, waiting to be logged (migration 58). */
  detectedActivities: DetectedActivity[];
  /** Demo only: your own log, so Your sessions and Add session stats have something on them. */
  sessions?: PracticeSession[];
  /** Demo only: people tagged in sessions, yours and you in others' (migration 62). A real account's come from my_session_tags(). */
  sessionTags?: SessionTag[];
}

/**
 * The demo's Monday recap row (migration 130 files it at 8am your time):
 * last week from the demo log, by the same rules as the server, filed this
 * Monday at 8. Nothing when there is nothing to say.
 */
function demoRecapNotification(): Notification[] {
  const week = lastWeekStart();
  const line = weekRecap(CURRENT_USER_ID, demoSessions, posts, stories, week).line;
  if (!line) return [];
  const monday = new Date(`${week}T08:00:00`);
  monday.setDate(monday.getDate() + 7);
  return [{ id: 'n-recap-demo', userId: CURRENT_USER_ID, actorId: CURRENT_USER_ID, kind: 'weekly-recap', targetId: week, targetKind: 'recap', createdAt: monday.toISOString(), read: false, preview: line }];
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  // The demo's catch-up, only with ?found=1 (mock/activities): five workouts found in one go.
  const found = supabase ? null : demoFoundWorkouts();
  return delay(
    clone({
      users,
      // The demo reels are gone: real clips and hits come from people now.
      // The demo written posts and threads stay, so the app is never empty,
      // and so does the one clip tagged at a demo court, for its page and reel.
      posts: [...posts.filter((p) => p.kind !== 'clip' || !!p.court), ...(supabase ? [] : demoGroupPosts)],
      // Nobody's live Instants either; only your own old ones, past their day
      // or put away, so the Archive has something to show.
      stories: stories.filter((s) => s.authorId === CURRENT_USER_ID && (s.archived || Date.parse(s.expiresAt) <= Date.now())),
      comments,
      questions,
      answers,
      coaches,
      coachQuestions,
      coachReplies,
      coachApplications: [],
      coachResults,
      coachReviews,
      conversations,
      messages,
      // The demo's tracker session and its "Tennis detected" row, two of the
      // map's alerts and a tag of you. Only without a database: a real
      // account's come from the server.
      notifications: supabase ? [] : [...demoRecapNotification(), ...activityNotifications, ...(found?.notifications ?? []), ...DEMO_MAP_ALERTS, ...demoSessionTagNotifications],
      detectedActivities: supabase ? [] : [...detectedActivities, ...(found?.activities ?? [])],
      coachingRequests,
      integrations,
      healthHistory,
      achievements,
      // Only without a database: with one, these come from the server, and an
      // account's real hits must never be covered by the demo's.
      ...(supabase ? {} : { hitRequests: demoHits, lastSeen: demoLastSeen, followingIds: DEMO_FOLLOWING, sessions: demoSessions, sessionTags: demoSessionTags }),
    }),
  );
}

/**
 * The demo's stand-in for WHOOP's look back over the past week (the whoop
 * function's sync with {days: 7}): its workouts of the last seven days,
 * tennis only, or every workout once `all` is on (migration 135).
 */
export async function fetchWhoopWeek(all: boolean): Promise<DetectedActivity[]> {
  return delay(clone(whoopWeek().filter((a) => all || a.sport === 'tennis')));
}

/* ------------------------------------------- New on CourtSide (migration 63) */

/**
 * The demo's stand-in for new_on_courtside(): who joined in the last two
 * weeks that `me` may be shown, newest first, by the same rule. Only ever
 * known adults and 16 and 17 year olds; the demo keeps no birthdays, so
 * that is known adults only (every teen counts as under 16, and no age on
 * file is never listed). A known adult sees them all; anyone else only
 * those they follow. Never yourself, never anyone blocked.
 */
export function newOnCourtside({ me, users: everyone, followingIds, blockedIds, days = 14 }: { me: ID; users: User[]; followingIds: ID[]; blockedIds: ID[]; days?: number }): { userId: ID; joinedAt: string }[] {
  const viewer = everyone.find((u) => u.id === me);
  const adult = !!viewer && viewer.ageGroup !== 'teen';
  const since = Date.now() - Math.min(60, Math.max(1, days)) * 86_400_000;
  return everyone
    .filter((u) => u.id !== me && !blockedIds.includes(u.id) && Date.parse(u.joinedAt) >= since)
    // Known adults only: a teen with no birthday to say otherwise counts as under 16, and no age on file is never listed.
    .filter((u) => u.ageGroup === 'adult')
    .filter((u) => followingIds.includes(u.id) || adult)
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
    .slice(0, 100)
    .map((u) => ({ userId: u.id, joinedAt: u.joinedAt }));
}

/* ------------------------------------------- Session tags (migration 62) */

/*
 * The demo's stand-ins for the session-tag functions in remote.ts: the same
 * answers, the same refusals (thrown as the server's own word), worked out
 * from what the demo holds, since there is no database to ask. The store
 * shows each change straight away either way; these say whether it stands.
 */

/** Whether tagging players is open: always in the demo. */
export async function sessionTagsReady(): Promise<boolean> {
  return true;
}

/** Tags someone on a session of yours: tag_session's checks, in order. Resolves with the new tag's id (or the one already there). */
export async function tagSession({ me, session, who, role, tags, refusal, newId }: {
  me: ID; session: PracticeSession | undefined; who: ID; role?: SessionTagRole; tags: SessionTag[]; refusal: SessionTagRefusal | null; newId: ID;
}): Promise<ID> {
  await delay(null, 160);
  if (!session || session.userId !== me) throw new Error('not_your_session');
  if (session.fromSessionId) throw new Error('copy');
  if (!canTagKind(session.kind)) throw new Error('not_a_match_or_practice');
  if (role && role !== 'opponent' && role !== 'partner') throw new Error('bad_role');
  if (refusal) throw new Error(refusal);
  const on = tags.filter((t) => t.sessionId === session.id);
  const there = on.find((t) => t.taggedId === who);
  if (there) {
    if (!isActive(there)) throw new Error('declined');
    return there.id;
  }
  if (on.filter(isActive).length >= maxTagsFor(session.kind)) throw new Error('too_many');
  if (tags.filter((t) => t.taggerId === me && Date.now() - Date.parse(t.createdAt) < 86_400_000).length >= 30) throw new Error('rate_limited');
  return newId;
}

/** Takes a tag off: untag_session's rules. Anyone but the two on it is refused. */
export async function untagSession({ me, tag }: { me: ID; tag: SessionTag | undefined }): Promise<void> {
  await delay(null, 160);
  if (tag && tag.taggerId !== me && tag.taggedId !== me) throw new Error('not_yours');
}

/**
 * Accept or decline a tag of you: respond_session_tag's answer. Accepting
 * with addToMine gives your own copy of the session (an existing one is used
 * again): its day, length and kind, your side of the result, and who it was
 * with as private words. A tag taken back off can no longer be accepted; a
 * late yes to a no needs one of the three places to be free.
 */
export async function respondSessionTag({ me, tag, accept, addToMine, sessions, tags, taggerName, newId }: {
  me: ID; tag: SessionTag | undefined; accept: boolean; addToMine: boolean; sessions: PracticeSession[]; tags: SessionTag[]; taggerName: string; newId: ID;
}): Promise<PracticeSession | null> {
  await delay(null, 200);
  if (!tag || tag.taggedId !== me) throw new Error('not_yours');
  if (!accept) return null;
  if (isClosed(tag)) throw new Error('removed');
  if (!canTagKind(tag.kind)) throw new Error('not_a_match_or_practice');
  if (tag.status === 'declined' && tags.filter((t) => t.sessionId === tag.sessionId && t.id !== tag.id && isActive(t)).length >= maxTagsFor(tag.kind)) throw new Error('too_many');
  const have = sessions.some((s) => s.userId === me && (s.id === tag.mirroredSessionId || s.fromSessionId === tag.sessionId));
  if (!have && !addToMine) return null;
  return clone(mirrorCopy({ me, tag, sessions, taggerName, newId }));
}


/**
 * The demo's head_to_head (migration 91): your record against one player,
 * from your own log and the tags the demo holds, by the server's rule. Only
 * scored matches with them across the net who accepted (or, on theirs, you
 * did), never a copy, and the same match logged by both counted once.
 */
export async function headToHead({ me, other, sessions, tags }: { me: ID; other: ID; sessions: PracticeSession[]; tags: SessionTag[] }): Promise<HeadToHead | null> {
  await delay(null, 120);
  if (other === me) return null;
  const played: { sessionId: ID; day: string; createdAt: string; won: boolean; sets: MatchSet[]; byMe: boolean }[] = [];
  for (const t of tags) {
    if (t.role !== 'opponent' || t.status !== 'accepted' || t.dropped || t.kind !== 'match' || !t.sets?.length || t.won === undefined) continue;
    // Mine with them confirmed, or theirs with me confirmed; the tag already says it from my side.
    const mine = t.taggerId === me && t.taggedId === other;
    const theirs = t.taggerId === other && t.taggedId === me;
    if (!mine && !theirs) continue;
    const own = mine ? sessions.find((x) => x.id === t.sessionId && x.userId === me && !x.fromSessionId) : undefined;
    if (mine && !own) continue;
    played.push({ sessionId: t.sessionId, day: t.day, createdAt: own?.createdAt ?? t.createdAt, won: t.won, sets: t.sets, byMe: mine });
  }
  // One day and score: as many matches as the side that logged more of them (mine kept first), like the server.
  const key = (g: { day: string; sets: MatchSet[] }) => `${g.day}|${JSON.stringify(g.sets)}`;
  const mineOf = (k: string) => played.filter((x) => x.byMe && key(x) === k).length;
  const once = [
    ...played.filter((g) => g.byMe),
    ...played.filter((g) => !g.byMe).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .filter((g, i, theirs) => theirs.slice(0, i).filter((x) => key(x) === key(g)).length >= mineOf(key(g))),
  ];
  const last = [...once].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))[0];
  return {
    userId: other,
    wins: once.filter((g) => g.won).length,
    losses: once.filter((g) => !g.won).length,
    ...(last ? { last: { sessionId: last.sessionId, day: last.day, won: last.won, sets: clone(last.sets) } } : {}),
  };
}

/**
 * The demo's court_kings (migration 130): the board at a demo court from
 * the fixtures (mock/strava.ts), with your own wins there from your demo log
 * (a match won, logged at that court). Ties go to the latest win; only the
 * top three come back, and your place when you are on the board.
 */
export async function courtKings({ courtId, me, sessions, ranked = true }: { courtId: string; me: ID; sessions: PracticeSession[]; ranked?: boolean }): Promise<CourtKings> {
  await delay(null, 160);
  const since = localDay(Date.now() - 90 * 86_400_000);
  const mine = sessions.filter((s) => s.userId === me && s.courtId === courtId && s.kind === 'match' && s.won === true && s.day >= since);
  const myLast = mine.map((s) => s.day).sort().pop() ?? '';
  const wins = DEMO_COURT_WINS[courtId] ?? [];
  if (wins.length || mine.length) {
    const board = [...wins.filter((w) => w.userId !== me), ...(ranked && mine.length ? [{ userId: me, n: mine.length, last: myLast }] : [])]
      .sort((a, b) => b.n - a.n || b.last.localeCompare(a.last));
    const rank = board.findIndex((w) => w.userId === me);
    // More than ten placed above you: ranked, with no number ("10+"), as the server says it.
    const over = rank > 10;
    return { courtId, mode: board.length ? 'wins' : 'none', top: clone(board.slice(0, 3)), me: { wins: mine.length, ...(rank >= 0 && !over ? { rank: rank + 1 } : {}), ranked: rank >= 0, ...(over ? { over: true } : {}) } };
  }
  const regulars = DEMO_COURT_REGULARS[courtId] ?? [];
  if (regulars.length) return { courtId, mode: 'regulars', top: clone(regulars.slice(0, 3)), me: { wins: 0, ranked: false } };
  return { courtId, mode: 'none', top: [], me: { wins: 0, ranked: false } };
}

/**
 * The demo's flyby (migration 130): who else was at a demo court on a day,
 * from the fixtures, only when your own log has a session there that day,
 * and never anyone tagged on your sessions that day (the server's rules).
 */
export async function flyby({ courtId, day, me, sessions, tags }: { courtId: string; day: string; me: ID; sessions: PracticeSession[]; tags: SessionTag[] }): Promise<FlybyPerson[]> {
  await delay(null, 160);
  if (!sessions.some((s) => s.userId === me && s.courtId === courtId && s.day === day)) return [];
  const ago = Math.round((Date.parse(localDay(Date.now()) + 'T12:00:00') - Date.parse(day + 'T12:00:00')) / 86_400_000);
  const mySessions = new Set(sessions.filter((s) => s.userId === me && s.day === day).map((s) => s.id));
  const played = new Set(tags
    .filter((t) => t.status !== 'declined' && t.status !== 'removed' && (mySessions.has(t.sessionId) || (t.taggedId === me && t.day === day)))
    .flatMap((t) => [t.taggerId, t.taggedId]));
  return clone((DEMO_FLYBY[courtId]?.[ago] ?? []).filter((p) => p.userId !== me && !played.has(p.userId)));
}

/**
 * The demo's friends_on_streak (migration 20261006000137): the people the
 * demo player follows on a streak of 3 days or more (each fixture's own
 * count, through today), longest first, at most 5. By the server's rules:
 * never anyone hidden (blocked, muted) or suspended, and someone who does
 * not follow you back only when not a teen (the demo's own ages, as
 * features/players/age reads them).
 */
export async function friendsOnStreak({ me, users: everyone, followingIds, followEdges, hiddenIds }: { me: ID; users: User[]; followingIds: ID[]; followEdges: { followerId: ID; followingId: ID }[]; hiddenIds: ID[] }): Promise<FriendStreak[]> {
  await delay(null, 160);
  const today = localDay(new Date());
  const back = new Set(followEdges.filter((e) => e.followingId === me).map((e) => e.followerId));
  return clone(everyone
    .filter((u) => u.id !== me && followingIds.includes(u.id) && !hiddenIds.includes(u.id) && !u.suspended
      && u.stats.currentStreakDays >= STREAK_FLAME_FROM && (back.has(u.id) || !notKnownAdult(u)))
    .map((u) => ({ userId: u.id, days: u.stats.currentStreakDays, through: today }))
    .sort((a, b) => b.days - a.days || a.userId.localeCompare(b.userId))
    .slice(0, 5));
}

/**
 * Posts matching a search that the app has not loaded yet. In the demo every
 * post is already in memory, so there is never anything more to fetch.
 */
export async function searchPosts(_term: string): Promise<{ posts: Post[]; comments: Comment[] } | null> {
  return null;
}

/* ------------------------------ Shared links ------------------------------ */

/**
 * The read-only look a link shared outside the app gives someone with no
 * account (share_preview, migration 68). Null when it could not be asked
 * (offline, or the server is a version behind): the page then shows its
 * "Join CourtSide" card, which is never wrong. The demo answers from its
 * fixtures with the server's rules: only a public account known to be an
 * adult shows to a stranger.
 */
export async function fetchSharePreview(kind: ShareKind, id: string): Promise<SharePreview | null> {
  // A group never shows anything to someone signed out (feed_group_card is for signed-in players only).
  if (kind === 'group') return { kind, open: false };
  if (supabase) {
    const { data, error } = await supabase.rpc('share_preview', { p_kind: kind, p_id: id });
    if (error || !data || typeof data !== 'object') return null;
    return data as SharePreview;
  }
  const locked: SharePreview = { kind, open: false };
  const shareable = (userId: ID) => { const u = users.find((x) => x.id === userId); return !!u && !u.isPrivate && !u.suspended && u.ageGroup === 'adult'; };
  const person = (userId: ID): SharePerson => {
    const u = users.find((x) => x.id === userId)!;
    return { id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, location: u.location || undefined, isCoach: u.isCoach || undefined };
  };
  const live = (p: Post) => !p.archived;
  const tile = (p: Post): ShareTile => ({ id: p.id, kind: p.kind, body: p.body.slice(0, 80), imageUrl: p.imageUrl, thumbnailUrl: p.thumbnailUrl });
  const answer = (value: SharePreview) => delay(clone(value));
  if (kind === 'post') {
    const p = posts.find((x) => x.id === id);
    if (!p || !live(p) || !shareable(p.authorId)) return answer(locked);
    return answer({ kind, open: true, author: person(p.authorId), post: {
      id: p.id, kind: p.kind, body: p.body.slice(0, 500), createdAt: p.createdAt, imageUrl: p.imageUrl, videoUrl: p.videoUrl,
      thumbnailUrl: p.thumbnailUrl, orientation: p.orientation, mediaLabel: p.mediaLabel, likes: p.likedBy.length, comments: p.commentIds.length,
      courtName: p.court?.name, courtId: p.court?.id, location: p.location,
      session: p.session ? { minutes: p.session.minutes, focus: p.session.focus, kind: p.session.kind } : undefined,
    } });
  }
  if (kind === 'profile') {
    const u = users.find((x) => x.id === id);
    if (!u || !shareable(u.id)) return answer(locked);
    const theirs = posts.filter((p) => p.authorId === u.id && live(p));
    return answer({ kind, open: true, author: person(u.id), profile: {
      bio: u.bio || undefined, followers: u.followers, posts: theirs.length,
      skillSystem: u.profile?.skillSystem, rating: u.profile?.rating || undefined,
      openHits: demoHits.filter((h) => h.authorId === u.id && !h.cancelled && Date.parse(h.startsAt) > Date.now()).length,
      recent: theirs.slice(0, 6).map(tile),
    } });
  }
  if (kind === 'hit-request') {
    const h = demoHits.find((x) => x.id === id);
    if (!h || !shareable(h.authorId)) return answer(locked);
    return answer({ kind, open: true, gone: !!h.cancelled || Date.parse(h.startsAt) < Date.now() - 3_600_000, author: person(h.authorId), hit: {
      id: h.id, startsAt: h.startsAt, format: h.format, spots: h.spots, spotsLeft: Math.max(0, h.spots - h.joinedIds.length),
      levelMin: h.levelMin, levelMax: h.levelMax, note: h.note, place: h.place,
    } });
  }
  if (kind === 'question') {
    const q = questions.find((x) => x.id === id);
    if (!q || !shareable(q.authorId)) return answer(locked);
    return answer({ kind, open: true, author: person(q.authorId), question: {
      id: q.id, title: q.title, body: q.body.slice(0, 400), createdAt: q.createdAt, answers: answers.filter((a) => a.questionId === q.id).length,
    } });
  }
  if (kind === 'court') {
    if (!isMapCourtId(id)) return answer(locked);
    const here = posts.filter((p) => p.court?.id === id && live(p) && shareable(p.authorId));
    return answer({ kind, open: true, court: {
      name: here[0]?.court?.name,
      openHits: demoHits.filter((h) => h.place.id === id && !h.cancelled && Date.parse(h.startsAt) > Date.now() && shareable(h.authorId)).length,
      posts: here.length, players: new Set(here.map((p) => p.authorId)).size, recent: here.slice(0, 6).map(tile),
    } });
  }
  return answer(locked);
}

/**
 * The person a link's ?ref= names, only when they are someone a stranger may
 * see (a public adult account). Null otherwise, so a made-up link cannot say
 * it came from anyone.
 */
export async function fetchShareReferrer(handle: string): Promise<SharePerson | null> {
  const clean = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(clean)) return null;
  if (supabase) {
    const { data, error } = await supabase.rpc('share_preview', { p_kind: 'referrer', p_id: clean });
    if (error || !data || typeof data !== 'object') return null;
    const got = data as { open?: boolean; author?: SharePerson };
    return got.open && got.author ? got.author : null;
  }
  const u = users.find((x) => x.handle.toLowerCase() === clean);
  if (!u || u.isPrivate || u.suspended || u.ageGroup !== 'adult') return null;
  return delay(clone({ id: u.id, name: u.name, handle: u.handle, avatarUrl: u.avatarUrl, location: u.location || undefined, isCoach: u.isCoach || undefined }));
}

/* ------------------------------- Coach memory ------------------------------ */

export interface CoachMemory {
  summary: string;
  exchanges: { role: 'user' | 'coach'; body: string; topic?: string; created_at?: string }[];
  updatedAt: string | null;
  /** Messages left today under the daily cap. */
  remaining: number;
}

const DAILY_CAP = 20;

/** What the coach has kept about the signed-in player. Empty when not signed in or not configured. */
export async function fetchCoachMemory(): Promise<CoachMemory> {
  const blank: CoachMemory = { summary: '', exchanges: [], updatedAt: null, remaining: DAILY_CAP };
  if (!supabase) return blank;
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return blank;
  const today = new Date().toISOString().slice(0, 10);
  const [memory, usage] = await Promise.all([
    supabase.from('coach_memory').select('summary, exchanges, updated_at').eq('user_id', me).maybeSingle(),
    supabase.from('coach_usage').select('messages').eq('user_id', me).eq('day', today).maybeSingle(),
  ]);
  return {
    summary: memory.data?.summary ?? '',
    exchanges: (memory.data?.exchanges as CoachMemory['exchanges']) ?? [],
    updatedAt: memory.data?.updated_at ?? null,
    remaining: Math.max(0, DAILY_CAP - (usage.data?.messages ?? 0)),
  };
}

export async function clearCoachMemory(): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return;
  const { error } = await supabase.from('coach_memory').delete().eq('user_id', me);
  if (error) throw new Error(error.message);
}

export async function signIn(handle: string): Promise<User> {
  const match = users.find((u) => u.handle.toLowerCase() === handle.trim().toLowerCase());
  if (!match) {
    await delay(null, 400);
    throw new Error(`No account for "${handle}". Try "you" for the demo account.`);
  }
  return delay(clone(match), 500);
}

/** A human coach the AI coach may suggest, when one would help more than another message. */
export interface CoachOption { id: ID; name: string; specialties: string[]; fromCents: number }
export interface AiCoachReply {
  reply: string;
  /** Questions left today; the coach answers 20 a day. */
  remaining?: number;
  /** A suggestion to take this to a human coach. */
  handoff?: { id: string | null; coachId: ID; reason: string; line: string } | null;
}

/**
 * The AI coach. On a real account this goes through the `ai-coach` Edge
 * Function, which holds the model key, remembers earlier conversations, and
 * calls Claude with the player's profile as context. The demo build answers
 * with a short stand-in instead. Throws with a plain line when it cannot answer.
 */
export async function askAiCoach(prompt: string, context: string, coaches: CoachOption[] = [], live = true): Promise<AiCoachReply> {
  const trimmed = prompt.trim();
  if (!trimmed) return { reply: 'Ask me anything about your game and I will work from your profile and this week’s plan.' };
  if (supabase && live) {
    const { data, error } = await supabase.functions.invoke<AiCoachReply & { error?: string; capped?: boolean }>('ai-coach', {
      body: { mode: 'chat', prompt: trimmed, context, coaches },
    });
    if (data?.capped) throw new Error('That is all 20 questions for today. The coach is back tomorrow.');
    if (error || !data?.reply) throw new Error(data?.error ?? 'The coach is unavailable right now. Try again in a minute.');
    return data;
  }
  await delay(null, 700);
  return {
    reply: [
      'Start from what your last two weeks actually show, not how you feel today.',
      'Change one thing at a time, so you can tell what worked.',
      'If it touches an injury note on your profile, cap the volume before you change the technique.',
      '',
      '(This is the demo, so this is a sample answer. On a real account the coach answers from your profile.)',
    ].join('\n'),
    remaining: DAILY_CAP,
  };
}

/** What the coach sends back for a week, before the app gives it ids. */
interface RawPlan {
  headline: string; summary: string; focusAreas: string[]; cautions: string[];
  days: { label: string; restDay: boolean; blocks: { title: string; kind: TrainingBlockKind; minutes: number; detail: string[]; rationale: string }[] }[];
}

/**
 * This week's plan, written by the coach and kept for the week. A new one is
 * written when the profile changes (up to three times a week); otherwise the
 * same week comes back instantly. Null when it cannot be written.
 */
export async function fetchAiPlan(context: string, profileHash: string): Promise<TrainingPlan | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke<{ plan?: RawPlan; error?: string }>('ai-coach', {
    body: { mode: 'plan', context, profileHash },
  });
  if (error || !data?.plan?.days?.length) return null;
  const raw = data.plan;
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return {
    id: `ai-${profileHash}`,
    generatedAt: new Date().toISOString(),
    weekOf: monday.toISOString(),
    headline: raw.headline,
    summary: raw.summary,
    focusAreas: raw.focusAreas ?? [],
    cautions: raw.cautions ?? [],
    days: raw.days.map((day, dayIndex) => ({
      id: `ai-d${dayIndex}`,
      dayIndex,
      label: day.label,
      restDay: day.restDay,
      blocks: (day.blocks ?? []).map((b, i) => ({ ...b, id: `ai-d${dayIndex}-b${i}` })),
    })),
  };
}
