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
import { users } from './mock/users';
import { fetchImportedThreads } from '@/features/community/importedThreads';
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
  Integration,
  Message,
  Notification,
  Post,
  Question,
  Story,
  User,
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
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  return delay(
    clone({
      users,
      posts,
      stories,
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
      notifications: [],
      coachingRequests,
      integrations,
      healthHistory,
      achievements,
    }),
  );
}

/**
 * Threads pulled in from Reddit and Talk Tennis so the board is never empty.
 * Fetched after the bootstrap so a slow feed never delays the app opening.
 * A real backend does this on a schedule and serves the result from here.
 */
export async function fetchCommunityThreads(): Promise<{ users: User[]; questions: Question[] }> {
  const bundle = await fetchImportedThreads();
  return { users: bundle.users, questions: bundle.questions };
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

/**
 * The AI coach. When Supabase is configured this goes through the `ai-coach`
 * Edge Function, which holds the model key and calls Claude with the player's
 * profile as context. Without it, the deterministic reply below stands in.
 */
export async function askAiCoach(
  prompt: string,
  context: string,
  history: { role: 'user' | 'coach'; body: string }[] = [],
): Promise<string> {
  const trimmed = prompt.trim();
  if (!trimmed) return 'Ask me anything about your game and I will work from your profile and this week’s plan.';
  if (supabase) {
    const { data, error } = await supabase.functions.invoke<{ reply?: string; error?: string }>('ai-coach', {
      body: { prompt: trimmed, context, history },
    });
    if (!error && data?.reply) return data.reply;
    // Function not deployed yet, or the key is missing: fall through to the stand-in.
  }
  await delay(null, 700);
  return [
    `Here is how I would think about that, given ${context}:`,
    '',
    '• Start from what your last two weeks actually show, not what you feel like today.',
    '• Change one variable at a time so you can tell what worked.',
    '• If it touches an injury note on your profile, cap the volume before you change the technique.',
    '',
    'TODO(ai): this reply is a deterministic placeholder. Wire this call to the coaching model and pass the player profile, active constraints, tournament calendar and recent recovery data as context.',
  ].join('\n');
}
