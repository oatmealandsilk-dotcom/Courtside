import type { FriendStreak, ID, User } from '@/data/types';
import { streakToday } from './stats';
import { STREAK_FLAME_FROM } from './streakFlame';

/** How many friends "Friends on a streak" shows, besides you. */
export const STREAK_BOARD_FRIENDS = 5;

export interface StreakBoardRow {
  user: User;
  days: number;
  /** Your own row ("You"). */
  mine: boolean;
}

export interface StreakBoard {
  /** Longest first, you in your place among them when you are on a streak. */
  rows: StreakBoardRow[];
  /** You are on a streak (3 days or more) and have a row; otherwise the board says "Keep yours going". */
  onStreak: boolean;
}

/**
 * The weekly recap's "Friends on a streak" (owner, Oct 5: "go for streak
 * board"), from the friends the server (or the demo) put up: each as their
 * streak stands on this phone's today (3 days or more, last day yesterday or
 * later), only while you still follow them here and have not blocked or
 * muted them since, never a suspended account, longest first (the server's
 * order within a tie), at most 5. Then you in your place when you are on a
 * streak yourself (your own live count), after friends on the same number.
 * Null when no friend is on a streak: the section is left out, never an
 * empty box.
 */
export function streakBoard({ me, myDays, friends, users, followingIds, hiddenIds, now = new Date() }: {
  me: ID;
  /** Your own streak as your flame shows it (shownStreak): 0 under 3 days. */
  myDays: number;
  friends: FriendStreak[];
  users: User[];
  followingIds: ID[];
  /** Blocked either way, or muted. */
  hiddenIds: ID[];
  now?: Date;
}): StreakBoard | null {
  const hidden = new Set(hiddenIds);
  const following = new Set(followingIds);
  const byId = new Map(users.map((u) => [u.id, u]));
  const seen = new Set<ID>();
  const others: (StreakBoardRow & { at: number })[] = [];
  friends.forEach((f, at) => {
    if (f.userId === me || seen.has(f.userId) || hidden.has(f.userId) || !following.has(f.userId)) return;
    const user = byId.get(f.userId);
    if (!user || user.suspended) return;
    const days = streakToday(f, now);
    if (days < STREAK_FLAME_FROM) return;
    seen.add(f.userId);
    others.push({ user, days, mine: false, at });
  });
  if (!others.length) return null;
  const top: StreakBoardRow[] = others
    .sort((a, b) => b.days - a.days || a.at - b.at)
    .slice(0, STREAK_BOARD_FRIENDS)
    .map(({ user, days }) => ({ user, days, mine: false }));
  const self = byId.get(me);
  if (!self || myDays < STREAK_FLAME_FROM) return { rows: top, onStreak: false };
  const mine: StreakBoardRow = { user: self, days: myDays, mine: true };
  const place = top.findIndex((r) => r.days < myDays);
  return { rows: place < 0 ? [...top, mine] : [...top.slice(0, place), mine, ...top.slice(place)], onStreak: true };
}
