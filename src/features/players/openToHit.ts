import type { User } from '@/data/types';

/** Up for a hit right now: they said so today, and today is not over. */
export const isOpenToHit = (user: Pick<User, 'openToHitUntil'> | null | undefined) =>
  !!user?.openToHitUntil && Date.parse(user.openToHitUntil) > Date.now();

/** The end of today, where the phone is: "open to hit" lasts the day, the way a status should. */
export function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}
