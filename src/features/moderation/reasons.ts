import type { Removed, TakedownKind, TakedownReason } from '@/data/types';

/**
 * The eight reasons an admin can give for taking something down, in the
 * order the Take down page lists them. `label` is the reason in a few words,
 * the same words the server puts in the author's notice
 * (takedown_reason_label, migration 108); `hint` is the line under it on
 * the Take down page, for the admin only.
 */
export const TAKEDOWN_REASONS: { code: TakedownReason; label: string; hint: string }[] = [
  { code: 'harassment', label: 'Harassment or bullying', hint: 'Insults, threats, piling on or shaming someone.' },
  { code: 'hate', label: 'Hate', hint: 'Attacks on people for who they are.' },
  { code: 'sexual', label: 'Sexual content', hint: 'Nudity or sexual material.' },
  { code: 'violence', label: 'Violence or weapons', hint: 'Hurting people or animals, guns pointed at people, threats.' },
  { code: 'spam', label: 'Spam or scams', hint: 'Ads, fake offers, links to trick people.' },
  { code: 'impersonation', label: 'Impersonation', hint: 'Pretending to be someone else.' },
  { code: 'minor-safety', label: 'Minor safety', hint: 'Anything that puts someone under 18 at risk.' },
  { code: 'other', label: 'Something else', hint: 'Add a short note for the other admins.' },
];

const CODES = new Set<string>(TAKEDOWN_REASONS.map((r) => r.code));

/** A reason from the server, or 'other' for anything this build does not know (or none, from the Reports screen's old Remove). */
export function asReason(code: unknown): TakedownReason {
  return typeof code === 'string' && CODES.has(code) ? (code as TakedownReason) : 'other';
}

/** The reason in a few words, for admins: "Violence or weapons", "Something else". */
export function reasonLabel(code: TakedownReason): string {
  return TAKEDOWN_REASONS.find((r) => r.code === code)?.label ?? 'Something else';
}

/**
 * What the author reads on their own removed thing: "Removed: Violence or
 * weapons". "Something else" is never named to them; it reads as breaking
 * CourtSide's rules, as their notice does.
 */
export function removedLine(removed: Removed): string {
  return removed.reason === 'other' ? 'Removed for breaking CourtSide’s rules' : `Removed: ${reasonLabel(removed.reason)}`;
}

/** What each kind is called in a sentence: "Take down this comment?" */
export const KIND_WORD: Record<TakedownKind, string> = {
  post: 'post',
  hit: 'Instant',
  comment: 'comment',
  'hit-comment': 'comment',
  question: 'thread',
  answer: 'reply',
  'coach-question': 'question',
  'coach-reply': 'reply',
};

/** The notice the author gets, word for word as the server writes it (migration 108). */
export function noticeFor(kind: TakedownKind, reason: TakedownReason, clip = false): string {
  const thing = kind === 'post' && clip ? 'clip' : kind === 'hit' ? 'instant' : KIND_WORD[kind];
  return reason === 'other'
    ? `Your ${thing} was removed for breaking CourtSide’s rules.`
    : `Your ${thing} was removed for breaking CourtSide’s rules: ${reasonLabel(reason)}.`;
}

export const TAKEDOWN_KINDS: TakedownKind[] = ['post', 'hit', 'comment', 'hit-comment', 'question', 'answer', 'coach-question', 'coach-reply'];

/** A kind from a link or the server, or null. */
export function asKind(raw: unknown): TakedownKind | null {
  return typeof raw === 'string' && (TAKEDOWN_KINDS as string[]).includes(raw) ? (raw as TakedownKind) : null;
}
