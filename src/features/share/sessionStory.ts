import type { DetectedActivity, ID, Post, PracticeSession, SessionDetail, User } from '@/data/types';
import { sessionFromLogged, statsSourceOf, whatWord } from '@/features/activity/format';
import { isTennisActivity } from '@/features/activity/workouts';
import { inviteLink } from '@/features/invite/referral';
import { notKnownAdult } from '@/features/players/age';

/*
 * What a session's share picture (Share → Instagram) carries, worked out in
 * one place so every design says the same and keeps the same privacy:
 *
 * - The numbers are the post's, exactly as the post shows them: the server
 *   keeps only the health numbers the author chose to share (migration 72),
 *   so a picture never shows a heart rate the post does not. A session that
 *   was never posted has no such choice, so it shows only its time and what
 *   it was: never a health number.
 * - "Data by WHOOP" (or "From Apple Watch"…) whenever a tracker's numbers
 *   are on it, the tracker's time included.
 * - Where it was played only for someone known to be an adult. A teen's court
 *   tag stays off court pages for strangers (useCourtPosts), and a picture
 *   posted to Instagram is for strangers.
 * - The sharer's own invite link travels beside the picture as words, never
 *   on it (Oct 5, "Strava way": the picture is the session and the logo).
 *   Copy and More hand it on where the phone or browser can carry both;
 *   whoever joins through it counts as theirs, as from the Invites page.
 */

export interface SessionStory {
  session: SessionDetail;
  /** The post's photo or its clip's cover: the first design's background. */
  photo?: string;
  /** The court or place, already cleared for this person (see above). */
  place?: string;
  /** "PRACTICE · FRI OCT 2": the date itself, since a story is seen tomorrow too. */
  eyebrow: string;
  /** The post it came from, when it was posted. */
  postId?: ID;
  /** The sharer's invite link (app.courtsidebase.com/join?ref=handle): sent as words with the picture, never drawn on it. */
  invite?: string;
}

/** "Fri Oct 2", in the phone's own order, without commas. */
function dateWords(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).replace(/,/g, '');
}

/** "MATCH · FRI OCT 2", "RUN · SAT OCT 4", or just "TENNIS" with no day to go on. */
export function storyEyebrow(s: Pick<SessionDetail, 'kind' | 'day' | 'workout'>, fallbackDay?: string): string {
  const day = s.day ?? fallbackDay;
  return (day ? `${whatWord(s)} · ${dateWords(day)}` : whatWord(s)).toUpperCase();
}

/** A place only for a known adult; a long name is cut by the picture itself, on one line. */
function placeFor(me: User | undefined, name: string | undefined): string | undefined {
  const clean = name?.trim();
  if (!clean || !me || notKnownAdult(me)) return undefined;
  return clean;
}

/** The sharer's own invite link, when there is a handle to carry. */
const inviteFor = (me: User | undefined) => (me?.handle ? inviteLink(me.handle) : undefined);

/** The YYYY-MM-DD a post went up, on this phone's clock. */
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** One of your posts with a session on it, as its share picture shows it. */
export function storyFromPost(post: Post, me: User | undefined): SessionStory | null {
  if (!post.session) return null;
  return {
    session: post.session,
    photo: post.imageUrl || post.thumbnailUrl || undefined,
    place: placeFor(me, post.court?.name ?? post.location),
    eyebrow: storyEyebrow(post.session, dayOf(post.createdAt)),
    postId: post.id,
    invite: inviteFor(me),
  };
}

/**
 * A session from your own log that is not on a post: its time and what it
 * was, and nothing else. From a tracker that is still switched on, its
 * attribution too ("Data by WHOOP"), since the time is the tracker's, and a
 * workout's distance (a run's miles, migration 107: not a health number).
 */
export function storyFromLog(s: PracticeSession, me: User | undefined, activity?: DetectedActivity): SessionStory {
  const session: SessionDetail = {
    ...sessionFromLogged(s),
    ...(activity ? { activityId: activity.id, source: statsSourceOf(activity) } : {}),
    ...(activity && !isTennisActivity(activity) && s.kind === 'fitness' && s.workout && activity.distanceM ? { distanceM: activity.distanceM } : {}),
  };
  // A session logged from a hit keeps where it was in its note: "At Alder Park".
  const at = s.note?.startsWith('At ') ? s.note.slice(3).split(' · ')[0] : undefined;
  return { session, place: placeFor(me, at), eyebrow: storyEyebrow(session), invite: inviteFor(me) };
}
