import type { HitRequest, ID, Post, PracticeSession, Story } from '@/data/types';
import { activeDays, localDay } from '@/features/practice/stats';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface YearInTennis {
  year: number;
  /** Days you logged a session or posted anything. */
  days: number;
  busiestMonth?: string;
  hours: number;
  sessions: number;
  clips: number;
  views: number;
  likes: number;
  topPost?: Post;
  matchesPlayed: number;
  matchesWon: number;
  longestStreak: number;
  /** The people you played with most: tagged in your posts, or in the same hits. */
  partners: ID[];
}

/**
 * The recap is out from 1 December to 15 January, like Spotify's: it names
 * the year it covers, or null outside those weeks.
 */
export function wrappedYear(now = new Date()): number | null {
  const m = now.getMonth();
  if (m === 11) return now.getFullYear();
  if (m === 0 && now.getDate() <= 15) return now.getFullYear() - 1;
  return null;
}

/** Your year in tennis, worked out from what you logged and posted in it. */
export function yearInTennis(me: ID, year: number, data: { sessions: PracticeSession[]; posts: Post[]; stories: Story[]; hitRequests: HitRequest[] }): YearInTennis {
  const inYear = (at: string) => new Date(at).getFullYear() === year;
  const sessions = data.sessions.filter((s) => s.userId === me && s.day.startsWith(`${year}-`));
  const posts = data.posts.filter((p) => p.authorId === me && !p.archived && inYear(p.createdAt));
  const stories = data.stories.filter((s) => s.authorId === me && inYear(s.createdAt));
  const days = [...activeDays(me, sessions, posts, stories)].filter((d) => d.startsWith(`${year}-`)).sort();

  const perMonth = new Array(12).fill(0) as number[];
  for (const d of days) perMonth[Number(d.slice(5, 7)) - 1] += 1;
  const peak = Math.max(...perMonth);

  // The longest run of days in a row with something tennis in it.
  let longest = 0;
  let run = 0;
  let before = '';
  for (const d of days) {
    const prev = new Date(`${d}T12:00:00`);
    prev.setDate(prev.getDate() - 1);
    run = before === localDay(prev) ? run + 1 : 1;
    longest = Math.max(longest, run);
    before = d;
  }

  // A match you logged and posted is one match: posted scores count only on days with no logged match.
  const loggedMatches = sessions.filter((s) => s.kind === 'match');
  const loggedDays = new Set(loggedMatches.map((s) => s.day));
  const postedMatches = posts.filter((p) => p.match && !loggedDays.has(localDay(p.createdAt)));

  const partnerCount = new Map<ID, number>();
  const bump = (id: ID) => { if (id !== me) partnerCount.set(id, (partnerCount.get(id) ?? 0) + 1); };
  for (const p of posts) p.taggedUserIds?.forEach(bump);
  for (const h of data.hitRequests) {
    if (h.cancelled || !inYear(h.startsAt)) continue;
    const people = [h.authorId, ...h.joinedIds];
    if (people.includes(me)) people.forEach(bump);
  }

  const clips = posts.filter((p) => p.kind === 'clip' || !!p.videoUrl);
  const topPost = [...posts].sort((a, b) => b.likedBy.length - a.likedBy.length)[0];
  return {
    year,
    days: days.length,
    busiestMonth: peak > 0 ? MONTHS[perMonth.indexOf(peak)] : undefined,
    hours: Math.round(sessions.filter((s) => s.kind !== 'fitness').reduce((sum, s) => sum + s.minutes, 0) / 60),
    sessions: sessions.length,
    clips: clips.length,
    views: clips.reduce((sum, p) => sum + (p.views ?? 0), 0),
    likes: posts.reduce((sum, p) => sum + p.likedBy.length, 0),
    topPost: topPost && topPost.likedBy.length > 0 ? topPost : undefined,
    matchesPlayed: loggedMatches.length + postedMatches.length,
    matchesWon: loggedMatches.filter((s) => s.won).length + postedMatches.filter((p) => p.match?.won).length,
    longestStreak: longest,
    partners: [...partnerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id),
  };
}
