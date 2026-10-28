import type { ID, LastSeen } from '@/data/types';

/*
 * Check in (Oct 26, after Apple's 5.1.2(i) review; migration 189). Your pin
 * is on the map only after you tap Check in, only for friends who follow
 * each other with you, and only until 10pm that day on this phone's clock.
 * Checked in at 8pm or later, it lasts 2 hours instead, so a late check-in
 * never vanishes at once. Never longer than 16 hours (the server holds the
 * same limits: 15 minutes to 16 hours from now). Nothing is ever shared on
 * its own: no timer, no app open, no background.
 */

/** When a check-in made at `now` ends. */
export function checkInEnds(now: Date = new Date()): Date {
  if (now.getHours() >= 20) return new Date(now.getTime() + 2 * 3_600_000);
  const tenPm = new Date(now);
  tenPm.setHours(22, 0, 0, 0);
  return new Date(Math.min(tenPm.getTime(), now.getTime() + 16 * 3_600_000));
}

/** "10pm", "9:30pm": a time the way the app says it. */
export function clock(at: Date): string {
  const h = at.getHours();
  const m = at.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** How long a check-in made now lasts, in words: "until 10pm", or "for 2 hours" late in the day. */
export function checkInSpan(now: Date = new Date()): string {
  return now.getHours() >= 20 ? 'for 2 hours' : `until ${clock(checkInEnds(now))}`;
}

/** Until when your live check-in shows: "until 10pm". */
export const untilWords = (until: string) => `until ${clock(new Date(until))}`;

/** Your own check-in, while it lasts: when it ends, or null. */
export function liveCheckIn(lastSeen: Record<ID, LastSeen>, me: ID | null | undefined, now = Date.now()): string | null {
  const until = me ? lastSeen[me]?.until : undefined;
  return until && Date.parse(until) > now ? until : null;
}
