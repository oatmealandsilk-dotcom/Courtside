import type { AutoLogAudience, DetectedActivity, Post, User } from '@/data/types';

/*
 * Who sees a session that logged itself (migration 193; owner, Oct 27: "how
 * about we make it so mutuals can see, no private, its just mutual or
 * public", "heart rate showing is fine").
 *
 * Settings → "Sessions that log themselves": Friends (people you follow who
 * follow you back; the default), Public (whoever can see your posts) or Only
 * me. Under 18, or with no birthday given: Friends or Only me, never Public
 * (the server keeps it to friends whatever is stored).
 *
 * The server makes each one a post of its own, its card only (time, kind,
 * length, heart rate and the rest the tracker recorded), shown in Activities
 * and on the profile to that audience; nobody else ever gets it. Posting the
 * session from "Tennis logged" puts the player's own post in its place.
 *
 * Apple Health (and Android's Health Connect): shown to anyone only once the
 * player has made the choice, which the connect screens and Settings ask for
 * in so many words (Apple's 5.1.3). Until then, only them.
 *
 * The words here are the server's own (auto_log_seen_by), so the alert, the
 * Notifications row and the session's page say the same thing.
 */

export const AUDIENCES: AutoLogAudience[] = ['mutuals', 'public', 'private'];

/** Kept by the server only from Apple Health's (and Health Connect's): shown once the player has chosen. */
const askFirst = (source: string | undefined | null) => source === 'apple-health' || source === 'apple-watch' || source === 'health-connect';

/** Not known to be an adult: Friends at most. */
export const friendsAtMost = (user: Pick<User, 'ageGroup'> | null | undefined) => user?.ageGroup !== 'adult';

/**
 * Who sees one from `source` right now, by the player's setting (`chosen`,
 * null if never chosen), exactly as the server decides (auto_log_audience_of).
 * Undefined: a database before migration 193 (or not heard yet), where they
 * stay with the player only (185).
 */
export function shownTo(chosen: AutoLogAudience | null | undefined, source: string | undefined | null, user: Pick<User, 'ageGroup'> | null | undefined): AutoLogAudience {
  if (chosen === undefined) return 'private';
  if (!chosen && askFirst(source)) return 'private';
  const v = chosen ?? 'mutuals';
  return v === 'public' && friendsAtMost(user) ? 'mutuals' : v;
}

/** The choice as Settings names it. */
export const AUDIENCE_LABEL: Record<AutoLogAudience, string> = { mutuals: 'Friends', public: 'Public', private: 'Only me' };

/** What each choice means, under its name. */
export const AUDIENCE_LINE: Record<AutoLogAudience, string> = {
  mutuals: 'People you follow who follow you back',
  public: 'Anyone who can see your posts',
  private: 'Nobody but you, until you post one',
};

/** "Friends who follow you back can see it": the line under "Tennis logged", as the alert says it. */
export function seenByLine(aud: AutoLogAudience, many = false): string {
  if (aud === 'private') return many ? 'Only you can see them' : 'Only you can see it';
  if (aud === 'public') return 'On your profile';
  return many ? 'Friends who follow you back can see them' : 'Friends who follow you back can see it';
}

/**
 * Said before connecting (Apple Health's sheet, setup's card, the Health
 * page): who will see the tennis that logs itself, and that the choice is
 * theirs. For `aud` (what the player chose, or the default).
 */
export function consentLine(aud: AutoLogAudience): string {
  if (aud === 'private') return 'Tennis of 20 minutes or more logs itself, and only you see it until you post it.';
  const who = aud === 'public' ? 'anyone who can see your posts' : 'friends who follow you back';
  return `Tennis of 20 minutes or more logs itself, and ${who} can see it, with its time and heart rate. Change who in Settings.`;
}

/** A post the server made for one of your sessions that logged itself, for the session on it (its tracker row, or its log entry). */
export function isOwnAutoPostOf(p: Post, me: string | null | undefined, activityId?: string | null, sessionId?: string | null): boolean {
  if (!p.autoLogged || !me || p.authorId !== me || !p.session) return false;
  return (!!activityId && p.session.activityId === activityId) || (!!sessionId && p.session.sessionId === sessionId);
}

/** The Fitbit sessions still asking "Was this tennis?", newest first. */
export function unsureWaiting(list: DetectedActivity[]): DetectedActivity[] {
  return list.filter((a) => a.unsure && a.status === 'new').sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
}
