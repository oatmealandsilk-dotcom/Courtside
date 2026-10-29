import type { AutoLogAudience, DetectedActivity, Post, User } from '@/data/types';

/*
 * Who sees a session that logged itself (migration 193; owner, Oct 27: "how
 * about we make it so mutuals can see, no private, its just mutual or
 * public", "heart rate showing is fine").
 *
 * Settings → "Sessions that log themselves": Friends (people you follow who
 * follow you back), Public (whoever can see your posts) or Only me. Under 18,
 * or with no birthday given: Friends or Only me, never Public (the server
 * keeps it to friends whatever is stored).
 *
 * Not chosen yet: only the player sees them, from any tracker (review, Oct
 * 28: players who connected before 193 were told "Only you see them until you
 * post one"). The choice is asked once, on "Tennis logged" (Friends or Only
 * me, side by side), and in Settings. Connecting WHOOP from a screen that says
 * friends will see them saves Friends (the owner's "mutuals default");
 * connecting Apple Health (or Android's Health Connect) never chooses for the
 * player (Apple's 5.1.3: a clear yes, with a no beside it).
 *
 * The server makes each one a post of its own, its card only (time, kind,
 * length, and for an adult the heart rate, zones and calories the tracker
 * recorded; none of those for anyone else), shown in Activities and on the
 * profile to that audience; nobody else ever gets it. Posting the session
 * from "Tennis logged" puts the player's own post in its place.
 *
 * The words here are the server's own (auto_log_seen_by), so the alert, the
 * Notifications row and the session's page say the same thing.
 */

export const AUDIENCES: AutoLogAudience[] = ['mutuals', 'public', 'private'];

/** Apple Health's (and Health Connect's): connecting one never chooses who sees them (Apple's 5.1.3). */
export const askFirst = (source: string | undefined | null) => source === 'apple-health' || source === 'apple-watch' || source === 'health-connect';

/** Not known to be an adult: Friends at most. */
export const friendsAtMost = (user: Pick<User, 'ageGroup'> | null | undefined) => user?.ageGroup !== 'adult';

/**
 * Who sees one right now, by the player's setting (`chosen`, null if never
 * chosen), exactly as the server decides (auto_log_audience_of): not chosen
 * yet, only them. Undefined: a database before migration 193 (or not heard
 * yet), where they stay with the player only (185). `source` and `held` no
 * longer change the answer (every one waits for the choice); kept so callers
 * read the same.
 */
export function shownTo(chosen: AutoLogAudience | null | undefined, _source?: string | null, user?: Pick<User, 'ageGroup'> | null, _held = false): AutoLogAudience {
  if (!chosen) return 'private';
  return chosen === 'public' && friendsAtMost(user) ? 'mutuals' : chosen;
}

/**
 * Who will see the tennis that logs itself once `source` is connected, for
 * the line said before connecting: the choice made; not chosen yet, Friends
 * for WHOOP or another tracker (connecting it from that screen saves Friends,
 * see `savesOnConnect`), only them for Apple Health until they choose.
 */
export function onConnect(chosen: AutoLogAudience | null | undefined, source: string | undefined | null, user: Pick<User, 'ageGroup'> | null | undefined): AutoLogAudience {
  if (chosen) return shownTo(chosen, source, user);
  return chosen === null && !askFirst(source) ? 'mutuals' : 'private';
}

/** Connecting `source` from a screen that said friends will see them saves Friends (never for Apple Health or Health Connect). */
export const savesOnConnect = (chosen: AutoLogAudience | null | undefined, source: string | undefined | null) => chosen === null && !askFirst(source);

/** Settings' and the Privacy center's value for the row: "Friends", or "Not chosen" (only you, until you choose). */
export function audienceValue(chosen: AutoLogAudience | null | undefined, user: Pick<User, 'ageGroup'> | null | undefined): string {
  return chosen ? AUDIENCE_LABEL[shownTo(chosen, null, user)] : 'Not chosen';
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
 * page): who will see the tennis that logs itself, and what of it. For `aud`
 * (onConnect); `chosen`: the player's setting (null: not chosen yet). An adult's
 * shows its time, heart rate, zones and calories; anyone else's only when and
 * how long (the server's share list, migration 193).
 */
export function consentLine(aud: AutoLogAudience, user: Pick<User, 'ageGroup'> | null | undefined, chosen: AutoLogAudience | null | undefined = aud): string {
  if (aud === 'private') {
    return chosen ? 'Tennis of 20 minutes or more logs itself, and only you see it until you post it.'
      : 'Tennis of 20 minutes or more logs itself. Only you see it until you choose who can.';
  }
  const who = aud === 'public' ? 'anyone who can see your posts' : 'friends who follow you back';
  const what = friendsAtMost(user) ? 'when you played and for how long' : 'with its time, heart rate, zones and calories';
  return `Tennis of 20 minutes or more logs itself, and ${who} can see it, ${what}. Change who in Settings.`;
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
