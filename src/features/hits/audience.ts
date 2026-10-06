import type { HitAudience, HitRequest, ID } from '@/data/types';

/*
 * "Who sees it first" (migration 76), the app's side. The database decides
 * who is sent a hit; these say the same thing on the phone, so the demo
 * (which has no database) and a hit just posted (before the server has
 * answered) behave the way the server will, and the card can say when it
 * goes out to everyone.
 */

const HOUR = 3_600_000;

/** The three answers on the hit form, in its order. */
export const AUDIENCES: { value: HitAudience; icon: 'people-outline' | 'mail-unread-outline' | 'lock-closed-outline'; title: string; line: string }[] = [
  { value: 'everyone', icon: 'people-outline', title: 'Everyone', line: 'Players nearby see it on Find Players.' },
  { value: 'invite_first', icon: 'mail-unread-outline', title: 'Invite first', line: 'The people you invite get first dibs. Then it opens to everyone.' },
  { value: 'invite_only', icon: 'lock-closed-outline', title: 'Only people I invite', line: 'Never shows to anyone else.' },
];

/**
 * "Everyone" for someone not known to be an adult: their hit reaches only
 * the people who follow them (hits/visible), so the card says that instead.
 */
export const EVERYONE_FRIENDS_LINE = 'Friends who follow you see it.';

/** When an invite-first hit posted now opens to everyone: an hour from now, or three hours before it starts if that is sooner (the server's rule). */
export function opensAtFor(startsAt: string, now = Date.now()): string {
  return new Date(Math.min(now + HOUR, Date.parse(startsAt) - 3 * HOUR)).toISOString();
}

/** How many are in a hit, counting the people this account is not shown (hiddenJoins): what takes its spots. */
export const joinedCount = (hit: Pick<HitRequest, 'joinedIds' | 'hiddenJoins'>): number => hit.joinedIds.length + (hit.hiddenJoins ?? 0);

/** Whether a hit is out for everyone: posted that way, opened by its poster, or invite-first past its time with a spot still free. */
export function isHitOpen(hit: HitRequest, now = Date.now()): boolean {
  if (!hit.audience || hit.audience === 'everyone') return true;
  if (hit.audience === 'invite_only') return false;
  return !!hit.opensAt && Date.parse(hit.opensAt) <= now && joinedCount(hit) < hit.spots;
}

/**
 * Whether a hit reaches you, as far as who-sees-it-first goes: it is open,
 * yours, you were invited or are in it. A hit for the poster's groups is
 * taken on trust: the server only sends it to people in one with them.
 */
export function hitReaches(hit: HitRequest, me: ID | null, now = Date.now()): boolean {
  if (isHitOpen(hit, now)) return true;
  if (!me) return false;
  return hit.authorId === me || !!hit.invitedIds?.includes(me) || hit.joinedIds.includes(me) || !!hit.includeGroups;
}

/** "5:30 PM", or "tomorrow at 5:30 PM", or "Sat at 5:30 PM": when it opens, said from today. */
function opensWhen(at: string, now = new Date()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short' })} at ${time}`;
}

/**
 * The one line a hit that is not out for everyone carries, or null once it
 * is: for its poster, when it goes out ("Opens to everyone at 5:30 PM");
 * for someone invited, that they were.
 */
export function audienceLine(hit: HitRequest, me: ID | null, now = Date.now()): string | null {
  if (isHitOpen(hit, now)) return null;
  const mine = !!me && hit.authorId === me;
  if (hit.audience === 'invite_only') return mine ? 'Only the people you invited can see it' : 'Invite only';
  const full = joinedCount(hit) >= hit.spots;
  const when = hit.opensAt ? opensWhen(hit.opensAt, new Date(now)) : null;
  if (mine) {
    if (!when) return 'Invite first';
    if (Date.parse(hit.opensAt!) > now) return full ? `Full · stays with your invites` : `Opens to everyone ${when}`;
    return 'Full · stays with your invites';
  }
  const invited = !!me && !!hit.invitedIds?.includes(me);
  const lead = invited ? 'You’re invited' : 'Invite first';
  return when && Date.parse(hit.opensAt!) > now ? `${lead} · opens to everyone ${when}` : lead;
}
