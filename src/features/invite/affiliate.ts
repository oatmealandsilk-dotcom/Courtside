import type Ionicons from '@expo/vector-icons/Ionicons';

import type { Invitee, InviteeMissing } from '@/data/types';

/**
 * The affiliate deal as the partners were given it (the one-page flyer,
 * Oct 6): $1 for every real player, paid every week; a CourtSide tee at 20
 * players, a performance tee at 40, a hoodie and the Ambassador badge at 75,
 * and a shoutout on @courtsidebase for the month's #1. The gear is sent by
 * hand; this only shows how close someone is.
 */
export interface Reward {
  /** Players counted to unlock it. */
  at: number;
  /** Its name in the list. */
  name: string;
  /** Its name after "N more to your …". */
  next: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const REWARDS: readonly Reward[] = [
  { at: 20, name: 'CourtSide tee', next: 'CourtSide tee', icon: 'shirt-outline' },
  { at: 40, name: 'Performance tee', next: 'performance tee', icon: 'shirt' },
  { at: 75, name: 'Hoodie + Ambassador badge', next: 'hoodie and Ambassador badge', icon: 'ribbon-outline' },
];

/** The first reward not reached yet, or null once every one is. */
export const nextReward = (counted: number): Reward | null => REWARDS.find((r) => counted < r.at) ?? null;

/** How full the ladder's step `i` is (0 to 1): each step runs from the reward before it to its own. */
export function stepFill(counted: number, i: number): number {
  const from = i === 0 ? 0 : REWARDS[i - 1].at;
  const to = REWARDS[i].at;
  return Math.max(0, Math.min(1, (counted - from) / (to - from)));
}

/** "$12", or "$12.50" when it is not whole dollars. */
export const dollars = (cents: number) => `$${cents % 100 ? (cents / 100).toFixed(2) : Math.round(cents / 100)}`;

/**
 * The one plain reason someone has not counted yet, when it is the
 * affiliate's to know: what anyone could see or be told (finish signing up,
 * come back another day, use the app), or that their two weeks ran out.
 * Never a private step: confirming their email, or why they cannot count
 * (suspended, or the inviter's own phone, migration 85's one word "blocked"
 * on purpose). Those, and anything unknown, say only "Not counted yet".
 */
const REASON: Partial<Record<InviteeMissing, string>> = {
  setup: 'Needs to finish signing up',
  'come-back': 'Needs to come back another day',
  'do-thing': 'Needs to follow someone or post',
  expired: 'Didn’t come back within 2 weeks',
};

export function notCountedReason(p: Pick<Invitee, 'countedAt' | 'missing'>): string | null {
  if (p.countedAt) return null;
  for (const m of p.missing ?? []) if (REASON[m]) return REASON[m]!;
  return null;
}

/** A closed case: their two weeks ran out, so they will not count. */
export const wontCount = (p: Pick<Invitee, 'countedAt' | 'missing'>) => !p.countedAt && !!p.missing?.includes('expired');
