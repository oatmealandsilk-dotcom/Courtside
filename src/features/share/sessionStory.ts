import type { DetectedActivity, ID, Post, PracticeSession, SessionDetail, User } from '@/data/types';
import { kindWord, sessionFromLogged, statsSourceOf } from '@/features/activity/format';
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
}

/** "Fri Oct 2", in the phone's own order, without commas. */
function dateWords(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).replace(/,/g, '');
}

/** "MATCH · FRI OCT 2", or just "TENNIS" with no day to go on. */
export function storyEyebrow(s: Pick<SessionDetail, 'kind' | 'day'>, fallbackDay?: string): string {
  const day = s.day ?? fallbackDay;
  return (day ? `${kindWord(s)} · ${dateWords(day)}` : kindWord(s)).toUpperCase();
}

/** A place only for a known adult; a long name is cut by the picture itself, on one line. */
function placeFor(me: User | undefined, name: string | undefined): string | undefined {
  const clean = name?.trim();
  if (!clean || !me || notKnownAdult(me)) return undefined;
  return clean;
}

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
  };
}

/**
 * A session from your own log that is not on a post: its time and what it
 * was, and nothing else. From a tracker that is still switched on, its
 * attribution too ("Data by WHOOP"), since the time is the tracker's.
 */
export function storyFromLog(s: PracticeSession, me: User | undefined, activity?: DetectedActivity): SessionStory {
  const session: SessionDetail = {
    ...sessionFromLogged(s),
    ...(activity ? { activityId: activity.id, source: statsSourceOf(activity) } : {}),
  };
  // A session logged from a hit keeps where it was in its note: "At Alder Park".
  const at = s.note?.startsWith('At ') ? s.note.slice(3).split(' · ')[0] : undefined;
  return { session, place: placeFor(me, at), eyebrow: storyEyebrow(session) };
}
