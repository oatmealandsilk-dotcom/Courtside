import type { CourtToday, ID, Post, User } from '@/data/types';

/*
 * Played here today (Oct 29, owner: "Played here today glow looks good, maybe if someone taps the played here
 * today court. It will show a video from that day if someone posted").
 *
 * Why: a court only lights up live (lightUp) for strangers once two or more adults are there, so someone
 * playing with a friend who is not on CourtSide never lights a court. What they post afterwards still says
 * the court was played on today.
 *
 * On the full map, a court with something PUBLIC there today, in your own day (from your midnight): a post
 * tagged at that court (a clip, a photo, a session someone posted) or an open hit there today that everyone
 * may see, wears a soft warm glow (markers.ts courtPinHtml `today`): a faint ring and halo in the court's
 * warm decoration colour (colors.sun), breathing very slowly, and "Played today" beside its name once you
 * are zoomed in. Much quieter than a live lit court, and a lit court always wins when both apply (pinList).
 * Never from a private session, a session that logged itself (its audience is mutuals or only you), a post
 * shared to one group, a private account's post, someone blocked either way or muted, a teen's post (beyond
 * the court rules already in place, shows_at_court), or a taken-down post. Nothing public today: nothing
 * changes. The server answers for up to 50 courts at once (court_played_today, migration 205).
 *
 * Tapped, the court's card opens as it always does, with today's clip from that court at the top (the
 * most-liked public clip from today, the newest first on a tie; todayClip): its picture, still (the card
 * plays nothing on its own), and a tap opens it like any clip at a court (openCourtReel). A court whose
 * only public post today is a photo glows but adds nothing to the card.
 *
 * Off until the owner has seen the pictures: everything here is behind PLAYED_TODAY_GLOW.
 */
export const PLAYED_TODAY_GLOW = false;

/** Your midnight today, as the server is asked from (the phone's own clock and time zone). */
export function todayStart(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whether a time falls in your own day today. */
export const isToday = (iso: string, now: Date = new Date()): boolean => new Date(iso).toDateString() === now.toDateString();

/** Which day an answer is about, so yesterday's never shows after midnight. */
export const dayKey = (now: Date = new Date()): string => now.toDateString();

/**
 * The courts played on today that you may see, from the server's answers (or the demo's): those of today,
 * with at least one person behind them you have not blocked or muted (the server leaves out blocks; mutes
 * live in the app).
 */
export function playedTodayIds(rows: Record<string, CourtToday>, hidden: Set<ID>, now: Date = new Date()): Set<string> {
  const day = dayKey(now);
  const out = new Set<string>();
  for (const r of Object.values(rows)) {
    if (r.day !== day || !(r.posts + r.hits)) continue;
    if (r.authorIds.length && r.authorIds.every((id) => hidden.has(id))) continue;
    out.add(r.courtId);
  }
  return out;
}

/** One short key for the set, for a memo's list (the pins redraw only when it changes). */
export const playedTodayKey = (ids: Set<string> | null): string => (ids ? [...ids].sort().join(',') : '');

/** A post anyone may see: not to one group, not a session that logged itself, not taken down, not put away, and not a private account's (yours aside). */
export function isPublicPost(p: Post, author: User | undefined, me: ID | null): boolean {
  if (p.groupId || p.autoLogged || p.autoHeld || p.removed || p.archived) return false;
  if (p.authorId === me) return true;
  return !!author && !author.isPrivate;
}

/** A clip: it has a video, or is one. */
export const isClip = (p: Post): boolean => !!p.videoUrl || p.kind === 'clip';

/**
 * Today's clip at a court, for the top of its card: from the court's own posts (useCourtPosts, already
 * without anyone hidden, a teen's beyond the court rule, or a private account you do not follow), only the
 * public clips posted today; the most-liked, the newest on a tie. Null when there is none.
 */
export function todayClip(posts: Post[], users: Map<ID, User>, me: ID | null, now: Date = new Date()): Post | null {
  const today = posts.filter((p) => isClip(p) && isToday(p.createdAt, now) && isPublicPost(p, users.get(p.authorId), me));
  if (!today.length) return null;
  return today.slice().sort((a, b) => b.likedBy.length - a.likedBy.length || b.createdAt.localeCompare(a.createdAt))[0];
}
