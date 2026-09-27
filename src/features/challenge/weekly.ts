import type { Post } from '@/data/types';

/**
 * The weekly challenge: one prompt a week, the same for everyone, entered by
 * posting a clip with its tag in the caption. Nothing is stored for it — the
 * tag on the posts is the entry — so it needs no server and no admin.
 */
export interface Challenge {
  tag: string;
  title: string;
  ask: string;
  /** Monday 00:00 UTC, and the Monday after. */
  startsAt: number;
  endsAt: number;
}

/** One a week in this order, round and round: shots anyone can film at their own court. */
const PROMPTS: Omit<Challenge, 'startsAt' | 'endsAt'>[] = [
  { tag: 'bestdropshot', title: 'Best drop shot', ask: 'Your softest, sneakiest drop shot.' },
  { tag: 'secondserve', title: 'Best second serve', ask: 'Kick, slice or flat: the one you trust on break point.' },
  { tag: 'longestrally', title: 'Longest rally', ask: 'Count the shots. The longest one wins.' },
  { tag: 'returnwinner', title: 'Best return winner', ask: 'Their serve, your winner.' },
  { tag: 'bestvolley', title: 'Best volley', ask: 'Get to the net and finish it.' },
  { tag: 'trickshot', title: 'Trick shot', ask: 'Tweeners, behind-the-backs, anything worth a rewatch.' },
  { tag: 'footworkdrill', title: 'Footwork drill', ask: 'The drill that keeps your feet honest.' },
  { tag: 'bestoverhead', title: 'Best overhead', ask: 'Sky-high lob, clean smash.' },
  { tag: 'slicebackhand', title: 'Slice backhand', ask: 'Low, skidding and nasty.' },
  { tag: 'matchpoint', title: 'Match point', ask: 'The point that won it. Put the score in the caption.' },
  { tag: 'lobwinner', title: 'Lob winner', ask: 'Over their head, on the line.' },
  { tag: 'forehandwinner', title: 'Forehand winner', ask: 'Your cleanest forehand winner.' },
];

const DAY = 86_400_000;
const WEEK = 7 * DAY;
// A Monday. Every challenge runs Monday to Sunday, UTC, so everyone has the same one.
const EPOCH = Date.UTC(2026, 0, 5);

/** This week's challenge, or with offset -1 last week's. */
export function challengeFor(now = Date.now(), offset = 0): Challenge {
  const n = Math.floor((now - EPOCH) / WEEK) + offset;
  const prompt = PROMPTS[((n % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
  const startsAt = EPOCH + n * WEEK;
  return { ...prompt, startsAt, endsAt: startsAt + WEEK };
}

/** "3 days left", "Ends today". */
export function timeLeft(challenge: Challenge, now = Date.now()): string {
  const days = Math.ceil((challenge.endsAt - now) / DAY);
  return days <= 1 ? 'Ends today' : `${days} days left`;
}

/** Clips posted that week with the tag, most-liked first; a tie goes to whoever posted first. */
export function entriesFor(challenge: Challenge, posts: Post[]): Post[] {
  return posts
    .filter((p) => {
      const at = Date.parse(p.createdAt);
      return !p.archived && (p.kind === 'clip' || !!p.videoUrl) && p.tags.includes(challenge.tag) && at >= challenge.startsAt && at < challenge.endsAt;
    })
    .sort((a, b) => b.likedBy.length - a.likedBy.length || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
