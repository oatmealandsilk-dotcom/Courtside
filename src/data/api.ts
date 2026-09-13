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

const LATENCY_MS = 320;

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

export async function signIn(handle: string): Promise<User> {
  const match = users.find((u) => u.handle.toLowerCase() === handle.trim().toLowerCase());
  if (!match) {
    await delay(null, 400);
    throw new Error(`No account for "${handle}". Try "you" for the demo account.`);
  }
  return delay(clone(match), 500);
}

/** Placeholder for the AI coach chat endpoint. */
export async function askAiCoach(prompt: string, context: string): Promise<string> {
  await delay(null, 700);
  const trimmed = prompt.trim();
  if (!trimmed) return 'Ask me anything about your game and I will work from your profile and this week’s plan.';
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
