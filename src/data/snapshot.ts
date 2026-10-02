import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RemoteData } from '@/data/remote';
import type { ID } from '@/data/types';

/**
 * A copy of what you last saw, kept on this phone (or in this browser), so
 * the next open shows your feed straight after the logo while the fresh one
 * loads, the way Instagram does. One copy per account, deleted when you sign
 * out. It is trimmed to what the first screens need, never the whole load:
 * the newest posts and threads, recent messages, and the people in them.
 */

const VERSION = 1;
const key = (me: ID) => `courtside-snapshot-v${VERSION}:${me}`;
/** Older than this and it is more confusing than helpful. */
const MAX_AGE_MS = 21 * 86_400_000;
/** Browsers give a site about 5 MB; the copy stays well inside it. */
const MAX_CHARS = 2_000_000;

const newest = <T extends { createdAt: string }>(list: T[], n: number) =>
  [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)).slice(0, n);

export function trimSnapshot(data: RemoteData, me: ID): RemoteData {
  const posts = newest(data.posts, 40);
  const postIds = new Set(posts.map((p) => p.id));
  const comments = data.comments.filter((c) => postIds.has(c.postId)).slice(-400);
  const questions = newest(data.questions, 40);
  const questionIds = new Set(questions.map((q) => q.id));
  const answers = data.answers.filter((a) => questionIds.has(a.questionId));
  // The last few messages of each conversation: enough for the inbox and the top of a chat.
  const byConversation = new Map<ID, RemoteData['messages']>();
  for (const m of data.messages) byConversation.set(m.conversationId, [...(byConversation.get(m.conversationId) ?? []), m]);
  const messages = [...byConversation.values()].flatMap((list) => newest(list, 20));
  const notifications = newest(data.notifications, 60);
  const coachQuestions = newest(data.coachQuestions, 20);
  const coachQuestionIds = new Set(coachQuestions.map((q) => q.id));
  const coachReplies = data.coachReplies.filter((r) => coachQuestionIds.has(r.questionId));
  const tips = [...data.tips].sort((a, b) => b.votes - a.votes).slice(0, 20);
  // Only the people these things mention (and you): never the whole directory.
  const people = new Set<ID>([me, ...data.followingIds]);
  posts.forEach((p) => { people.add(p.authorId); p.taggedUserIds?.forEach((id) => people.add(id)); p.session?.with?.forEach((w) => people.add(w.id)); });
  comments.forEach((c) => people.add(c.authorId));
  data.stories.forEach((s) => people.add(s.authorId));
  questions.forEach((q) => people.add(q.authorId));
  answers.forEach((a) => people.add(a.authorId));
  data.conversations.forEach((c) => c.participantIds.forEach((id) => people.add(id)));
  notifications.forEach((n) => people.add(n.actorId));
  coachQuestions.forEach((q) => people.add(q.authorId));
  coachReplies.forEach((r) => people.add(r.coachUserId));
  data.coaches.forEach((c) => people.add(c.userId));
  data.coachingRequests.forEach((r) => { people.add(r.userId); if (r.coachUserId) people.add(r.coachUserId); });
  data.followRequests.forEach((r) => { people.add(r.fromId); people.add(r.toId); });
  tips.forEach((t) => people.add(t.authorId));
  return {
    ...data,
    users: data.users.filter((u) => people.has(u.id)),
    posts,
    comments,
    questions,
    answers,
    messages,
    notifications,
    coachQuestions,
    coachReplies,
    tips,
    coachReviews: data.coachReviews.slice(0, 60),
    coachResults: data.coachResults.slice(0, 30),
    followEdges: data.followEdges.filter((e) => e.followerId === me || e.followingId === me),
  };
}

export async function saveSnapshot(me: ID, data: RemoteData): Promise<void> {
  try {
    let trimmed = trimSnapshot(data, me);
    let json = JSON.stringify({ v: VERSION, savedAt: Date.now(), data: trimmed });
    // Too big for the browser: drop the parts that are cheapest to go without first.
    if (json.length > MAX_CHARS) {
      trimmed = { ...trimmed, messages: [], comments: [], answers: [] };
      json = JSON.stringify({ v: VERSION, savedAt: Date.now(), data: trimmed });
    }
    if (json.length > MAX_CHARS) return;
    await AsyncStorage.setItem(key(me), json);
  } catch { /* storage full or unavailable: the app simply opens the old way */ }
}

export async function readSnapshot(me: ID): Promise<RemoteData | null> {
  try {
    const raw = await AsyncStorage.getItem(key(me));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; savedAt?: number; data?: RemoteData };
    if (parsed.v !== VERSION || !parsed.data || !parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function clearSnapshot(me: ID): Promise<void> {
  try { await AsyncStorage.removeItem(key(me)); } catch { /* nothing kept */ }
}

/*
 * A guard against a bad copy: opening on it leaves a mark that is taken
 * away once the app has run a few seconds. A mark still there next time
 * means that open never got that far, so the copy is thrown away and the
 * app opens the old way, rather than tripping over the same thing forever.
 */
const openingKey = (me: ID) => `courtside-snapshot-opening:${me}`;

export async function snapshotFailedBefore(me: ID): Promise<boolean> {
  try { return (await AsyncStorage.getItem(openingKey(me))) === '1'; } catch { return false; }
}
export async function markSnapshotOpening(me: ID): Promise<void> {
  try { await AsyncStorage.setItem(openingKey(me), '1'); } catch { /* best effort */ }
}
export async function markSnapshotOpened(me: ID): Promise<void> {
  try { await AsyncStorage.removeItem(openingKey(me)); } catch { /* best effort */ }
}
