import { isoDaysAgo } from '@/lib/format';
import type { AffiliateStats, Invitee, InviteeMissing } from '../types';
import { CURRENT_USER_ID, users } from './users';

/**
 * The demo player is an affiliate (Oct 6), so the affiliate dashboard on the
 * Invites page can be looked at without a database: eleven players who
 * counted and five who have not yet, each for a different reason (one whose
 * only step left is private, so it shows no reason at all). Signing in to
 * the demo as anyone else ("miraplays") shows the plain Invite friends page.
 */
export const DEMO_AFFILIATES: ReadonlySet<string> = new Set([CURRENT_USER_ID]);

/** [who, joined days ago, counted days ago, or what is still missing]. */
const PEOPLE: [id: string, joined: number, counted: number | InviteeMissing[]][] = [
  ['u-diego', 4, 2],
  ['u-bea', 6, 3],
  ['u-lena', 8, 6],
  ['u-noor', 9, 7],
  ['u-kai', 11, 8],
  ['u-rosa', 12, 10],
  ['u-marcus', 14, 12],
  ['u-sam', 15, 13],
  ['u-june', 17, 15],
  ['u-dev', 19, 16],
  ['u-mira', 21, 18],
  ['u-jonah', 1, ['come-back', 'do-thing']],
  ['u-ivy', 2, ['verify']],
  ['u-nadia', 3, ['do-thing']],
  ['u-theo', 5, ['setup', 'verify', 'come-back', 'do-thing']],
  ['u-omar', 20, ['expired']],
];

/** Who joined through the demo player's link, as my_invitees (migration 85) answers. */
export function demoInvitees(): Invitee[] {
  return PEOPLE.flatMap(([id, joined, counted]) => {
    const u = users.find((x) => x.id === id);
    if (!u) return [];
    return [{
      id: u.id,
      handle: u.handle,
      name: u.name,
      avatarUrl: u.avatarUrl,
      joinedAt: isoDaysAgo(joined, 3),
      ...(typeof counted === 'number' ? { countedAt: isoDaysAgo(counted, 1) } : { missing: counted }),
    }];
  });
}

/** The demo player's own numbers, as my_affiliate_stats (migration 147) answers: eight paid for, the rest owed. */
export function demoAffiliateStats(): AffiliateStats {
  const list = demoInvitees();
  const qualified = list.filter((p) => p.countedAt).length;
  const paid = Math.min(8, qualified);
  const rateCents = 100;
  return {
    invited: list.length,
    qualified,
    paid,
    paidCents: paid * rateCents,
    owed: qualified - paid,
    owedCents: (qualified - paid) * rateCents,
    earnedCents: qualified * rateCents,
    rateCents,
    lastPaidAt: isoDaysAgo(3),
  };
}
