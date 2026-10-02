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
import { stories } from './mock/stories';
import { conversations, messages } from './mock/messages';
import { healthHistory, integrations } from './mock/health';
import { activityNotifications, detectedActivities } from './mock/activities';
import { users } from './mock/users';
import { demoHits } from './mock/hits';
import { demoLastSeen } from './mock/presence';
import { DEMO_FOLLOWING, DEMO_MAP_ALERTS } from './mock/courtLife';
import { demoSessions } from './mock/sessions';
import { supabase } from '@/lib/supabase';
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
  DailyHealth,
  DetectedActivity,
  Integration,
  Message,
  Notification,
  Post,
  PracticeSession,
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
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  return delay(
    clone({
      users,
      // The demo reels are gone: real clips and hits come from people now.
      // The demo written posts and threads stay, so the app is never empty,
      // and so does the one clip tagged at a demo court, for its page and reel.
      posts: posts.filter((p) => p.kind !== 'clip' || !!p.court),
      stories: [],
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
      // The demo's tracker session and its "Tennis detected" row, and two of
      // the map's alerts. Only without a database: a real account's come from
      // the server.
      notifications: supabase ? [] : [...activityNotifications, ...DEMO_MAP_ALERTS],
      detectedActivities: supabase ? [] : detectedActivities,
      coachingRequests,
      integrations,
      healthHistory,
      achievements,
      // Only without a database: with one, these come from the server, and an
      // account's real hits must never be covered by the demo's.
      ...(supabase ? {} : { hitRequests: demoHits, lastSeen: demoLastSeen, followingIds: DEMO_FOLLOWING, sessions: demoSessions }),
    }),
  );
}

/**
 * Posts matching a search that the app has not loaded yet. In the demo every
 * post is already in memory, so there is never anything more to fetch.
 */
export async function searchPosts(_term: string): Promise<{ posts: Post[]; comments: Comment[] } | null> {
  return null;
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
