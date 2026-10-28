import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import type { Notification, User } from '@/data/types';

/**
 * "Add your friends" (owner, Oct 28: "a card that pops up every now and then
 * when you log in ... mutuals can see each others pins ... so people will be
 * incentivized to add each other and be mutuals"; then "Mock it").
 *
 * DESIGN MOCK ONLY. Shown in the demo web build, and only with the address
 * switch `?mutuals=`:
 *   a      the rare card, look A: a sheet that rises on Find Players
 *   b      the rare card, look B: a small card on Find Players, under the map
 *   on     only the small lines where following back pays off (no card)
 *   empty  as `on`, with nobody up to hit on the full map (its empty state)
 * Round 2 (Oct 28, owner: "the cards could be better"), in MutualsV2.tsx:
 *   b1     the card as a row of person cards you swipe across
 *   b2     the card as one line of faces that opens into the list
 *   b2open the same, opened
 *   b3     the card one person at a time, with the two pins joining
 *   a1     "Add your friends", a calmer sheet with the drawing
 *   a2     "Add your friends" as a card on Find Players (no friends on the map yet)
 * Every value also shows the small lines (a profile that follows you, the
 * follow row in Notifications, a city's Top players). Never on a phone, never
 * with the real database: nothing here is live, and nothing is saved anywhere.
 */
export type MutualsMock = 'a' | 'b' | 'on' | 'empty' | 'b1' | 'b2' | 'b2open' | 'b3' | 'a1' | 'a2';
const LOOKS: readonly string[] = ['a', 'b', 'on', 'empty', 'b1', 'b2', 'b2open', 'b3', 'a1', 'a2'];

const KEY = 'courtside-mutuals-mock';
let chosen: MutualsMock | null | undefined;

export function mutualsMock(): MutualsMock | null {
  if (chosen !== undefined) return chosen;
  chosen = null;
  if (isSupabaseConfigured || Platform.OS !== 'web' || typeof window === 'undefined') return chosen;
  const ok = (v: string | null): v is MutualsMock => v !== null && LOOKS.includes(v);
  try {
    const asked = new URLSearchParams(window.location.search).get('mutuals');
    if (ok(asked)) { window.sessionStorage.setItem(KEY, asked); chosen = asked; }
    else { const kept = window.sessionStorage.getItem(KEY); if (ok(kept)) chosen = kept; }
  } catch { /* no storage: off */ }
  return chosen;
}

// Read as the app loads, while the address still has the switch (sign-in moves on from it).
mutualsMock();

/** The one line, said the same way wherever following back is offered. */
export const MUTUAL_LINE = 'Follow back: you’ll see each other on the map and the leaderboard';
/** The same, in a row whose button already says Follow back. */
export const MUTUAL_LINE_SHORT = 'See each other on the map and the leaderboard';
/** Where a list only shows friends who follow each other (a teen's city board, their map). */
export const MUTUALS_ONLY_LINE = 'Only mutuals see each other here';

/**
 * One thing you share with someone who follows you, for under their name on
 * a card: a friend you both follow (Instagram's "Followed by"), or else their
 * town. Never a court or a spot: someone you don't follow back is a stranger
 * on the map (Apple 5.1.2(i)), so where they play stays theirs. The friends
 * in common are the mock's own, written in; the real one would count them.
 */
const IN_COMMON: Record<string, string> = { 'u-rosa': 'Sam', 'u-noor': 'Marcus', 'u-theo': 'Omar' };
export function sharedLine(u: User, me: User): string {
  if (IN_COMMON[u.id]) return `Followed by ${IN_COMMON[u.id]}`;
  const town = u.location.split(',')[0]?.trim();
  if (!town) return 'On CourtSide';
  return town === me.location.split(',')[0]?.trim() ? `Also in ${town}` : `In ${town}`;
}

/**
 * What following each other shows, in plain words: the card's rows. Each is
 * true today (or marked as coming), and nothing here changes who sees whom.
 */
export const MUTUAL_BENEFITS: { icon: 'map' | 'court' | 'board' | 'calendar'; title: string; line: string }[] = [
  { icon: 'map', title: 'Each other on the map', line: 'Your pin and how far away, while you’re up to hit' },
  { icon: 'court', title: 'Who plays at your courts', line: '“Sam and Marcus play here” on a court' },
  { icon: 'board', title: 'Each other on the leaderboard', line: 'Your sessions on your city’s Top players' },
  { icon: 'calendar', title: 'Tournament plans', line: 'Where each other is playing next' },
];

/**
 * How often the card may come up. Written down here for when it is built;
 * the mock shows it every time, so it can be looked at.
 *
 *   - First week after sign-up: at most once in the whole week.
 *   - After that: at most once every 14 days.
 *   - Never twice in one session (one open of the app), whatever the dates say.
 *   - Never on a launch that already shows something else first (the tutorial,
 *     "Who can see you on the map?", a birthday check): it waits for the next one.
 *   - Stops for good once you have 5 or more mutuals (it has done its job),
 *     or once you have closed it 3 times (you have said no).
 *   - Tapping either button counts as seen, not as closed.
 *
 * The small lines (a profile, a follow row, the map's empty state, a
 * friends-only list) are not rationed: they show only where following back
 * is the next step anyway.
 */
export const CARD_RULE = { firstWeekDays: 7, gapDays: 14, mutualsEnough: 5, closesEnough: 3 } as const;

export interface CardHistory {
  /** When the account was made (ms). */
  joinedAt: number;
  /** Each time the card was shown (ms), oldest first. */
  shownAt: number[];
  /** How many times it was closed without a tap on a button. */
  closes: number;
  /** People you follow who follow you back. */
  mutuals: number;
  /** Shown already in this open of the app. */
  shownThisSession: boolean;
}

/** Whether the card may come up now, by the rule above. */
export function cardDue(h: CardHistory, now: number): boolean {
  const DAY = 86_400_000;
  if (h.shownThisSession) return false;
  if (h.mutuals >= CARD_RULE.mutualsEnough || h.closes >= CARD_RULE.closesEnough) return false;
  const last = h.shownAt[h.shownAt.length - 1];
  if (last === undefined) return true;
  const firstWeekEnds = h.joinedAt + CARD_RULE.firstWeekDays * DAY;
  // Already shown during the first week: nothing more until the week is out.
  if (now < firstWeekEnds) return false;
  return now - last >= CARD_RULE.gapDays * DAY;
}

/** The mock's two "started following you" rows (the demo has none), newest first: people you don't follow back yet. */
export function mutualsDemoNotifications(me: string): Notification[] {
  if (!mutualsMock()) return [];
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return [
    { id: 'n-mutuals-rosa', userId: me, actorId: 'u-rosa', kind: 'follow', targetId: me, targetKind: 'post', createdAt: ago(9), read: false },
    { id: 'n-mutuals-kai', userId: me, actorId: 'u-kai', kind: 'follow', targetId: me, targetKind: 'post', createdAt: ago(95), read: false },
  ];
}
