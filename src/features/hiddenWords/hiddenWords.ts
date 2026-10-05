import type { Answer, CoachReply, Comment, HiddenWords, ID } from '@/data/types';

/**
 * Hidden words (migration 117), the way Instagram has them. The list of
 * offensive words lives only in the database and is never sent to the app:
 * the server decides what is hidden, and the app only shows it.
 *
 *   - A comment, Instant comment, thread reply or coach reply that matches
 *     the filters of whoever owns the post (or thread, or question) arrives
 *     marked `hiddenByWords`, and only to its writer and that owner. Its
 *     writer sees it as normal; the owner finds it under "Hidden comments".
 *   - A message from someone you don't follow that matches your filters
 *     arrives marked too, and shows as "Hidden message · tap to show".
 */

/**
 * What the app says when the database refuses words (migration 117's
 * 'blocked_words'): slurs, sexual words about children and threats are
 * refused wherever anyone writes, edits included.
 */
export const BLOCKED_WORDS_NOTE = 'This includes words that break CourtSide’s rules.';

/** The most words and phrases you can hide, and how long each may be (set_hidden_words checks the same). */
export const HIDDEN_WORDS_MAX = 100;
export const HIDDEN_WORD_LENGTH = 30;

/** A new account's settings, and the demo's: both offensive filters on, no words of your own. */
export function defaultHiddenWords(locked: boolean): HiddenWords {
  return { hideOffensiveComments: true, hideOffensiveRequests: true, customWords: [], customInComments: true, customInRequests: true, locked };
}

/** Words as the server keeps them: trimmed, spaces run together, no empty ones, no repeats whatever the capitals. */
export function cleanWords(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = raw.replace(/\s+/g, ' ').trim();
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
  }
  return out;
}

/**
 * Whether a comment (or reply) shows in the ordinary list for `me`: always,
 * unless it was hidden by Hidden words and is not mine. Mine looks normal to
 * me, as on Instagram.
 */
export function shownInList(item: { hiddenByWords?: boolean }, writer: ID, me: ID | null): boolean {
  return !item.hiddenByWords || writer === me;
}

/** The comments on a post or Instant that its owner's Hidden words hid, oldest first: only its owner gets these. */
export function hiddenCommentsOn(comments: Comment[], targetId: ID, me: ID | null, ownerId: ID | undefined): Comment[] {
  if (!me || ownerId !== me) return [];
  return comments
    .filter((c) => c.postId === targetId && c.hiddenByWords && c.authorId !== me)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The same for a thread's replies. */
export function hiddenAnswersOn(answers: Answer[], questionId: ID, me: ID | null, ownerId: ID | undefined): Answer[] {
  if (!me || ownerId !== me) return [];
  return answers
    .filter((a) => a.questionId === questionId && a.hiddenByWords && a.authorId !== me)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The same for a coach question's replies. */
export function hiddenCoachRepliesOn(replies: CoachReply[], questionId: ID, me: ID | null, ownerId: ID | undefined): CoachReply[] {
  if (!me || ownerId !== me) return [];
  return replies
    .filter((r) => r.questionId === questionId && r.hiddenByWords && r.coachUserId !== me)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
