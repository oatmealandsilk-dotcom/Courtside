import type Ionicons from '@expo/vector-icons/Ionicons';

import type { CourtAccess, CourtDayPart, CourtFacts, CourtNow, CourtRightNow, User } from '@/data/types';

/*
 * How a court's facts read, everywhere they show (the map's card, the
 * court's page, the "Add what you know" sheet), so every place says the
 * same thing the same way.
 */

export const ACCESS_LABEL: Record<CourtAccess, string> = { public: 'Public', members: 'Members only', pay: 'Pay to book', private: 'Private court', unknown: 'Not known yet' };
/** The sheet's own words for each answer: a player picks what they found. */
export const ACCESS_CHOICE: Record<Exclude<CourtAccess, 'unknown'>, string> = { public: 'Anyone can play', members: 'Members only', pay: 'Pay to book', private: 'Someone’s home' };

export const NOW_LABEL: Record<CourtNow, string> = { free: 'Free', wait: 'A wait', full: 'Full', wet: 'Wet', locked: 'Locked' };
export const NOW_ICON: Record<CourtNow, keyof typeof Ionicons.glyphMap> = { free: 'checkmark-circle', wait: 'time', full: 'people', wet: 'water', locked: 'lock-closed' };

export const DAY_PART_LABEL: Record<CourtDayPart, string> = {
  'weekday-morning': 'weekday mornings', 'weekday-afternoon': 'weekday afternoons', 'weekday-evening': 'weekday evenings',
  'weekend-morning': 'weekend mornings', 'weekend-afternoon': 'weekend afternoons', 'weekend-evening': 'weekend evenings',
};
export const DAY_PARTS: CourtDayPart[] = ['weekday-morning', 'weekday-afternoon', 'weekday-evening', 'weekend-morning', 'weekend-afternoon', 'weekend-evening'];

export type FactIcon = 'bulb-outline' | 'people-outline' | 'layers-outline' | 'grid-outline';
export interface Fact { icon: FactIcon; label: string }

/**
 * What players say about a court, as a few short facts and one line:
 * "Lights · Usually busy weekday evenings · Some cracks (3 players)".
 * Each fact goes the way most players said; a fact nobody gave is left out.
 */
export function summarizeFacts(f: CourtFacts | undefined): { facts: Fact[]; line: string; players: number; note?: { text: string; on: string } } {
  if (!f || f.players <= 0) return { facts: [], line: '', players: 0 };
  const facts: Fact[] = [];
  if (f.lights.yes + f.lights.no > 0) facts.push({ icon: 'bulb-outline', label: f.lights.yes >= f.lights.no ? 'Lights' : 'No lights' });
  if (f.busyAnswers > 0) {
    const busy = busyLabel(f);
    if (busy) facts.push({ icon: 'people-outline', label: busy });
  }
  const { good, cracked, wetProne } = f.surface;
  if (cracked > 0) facts.push({ icon: 'layers-outline', label: cracked > good ? 'Cracked surface' : 'Some cracks' });
  if (wetProne > 0) facts.push({ icon: 'layers-outline', label: 'Puddles after rain' });
  if (!cracked && !wetProne && good > 0) facts.push({ icon: 'layers-outline', label: 'Good surface' });
  if (f.nets.good + f.nets.bad > 0) facts.push({ icon: 'grid-outline', label: f.nets.bad > f.nets.good ? 'Nets need work' : 'Good nets' });
  const who = `${f.players} ${f.players === 1 ? 'player' : 'players'}`;
  return { facts, line: facts.length ? `${facts.map((x) => x.label).join(' · ')} (${who})` : `From ${who}`, players: f.players, note: f.notes[0] };
}

/**
 * When a court is busy, from the players who answered: the parts of the
 * week at least half of them called busy ("Usually busy weekday evenings",
 * two at most); else "Usually free" only when most of them said they have
 * never seen it busy; else the one busiest part ("Often busy weekend
 * mornings"), or "Busy times vary" when no part leads.
 */
function busyLabel(f: CourtFacts): string | null {
  const count = (p: CourtDayPart) => f.busy[p] ?? 0;
  const enough = Math.max(1, Math.ceil(f.busyAnswers / 2));
  const parts = DAY_PARTS.filter((p) => count(p) >= enough).sort((a, b) => count(b) - count(a)).slice(0, 2);
  if (parts.length) return `Usually busy ${parts.map((p) => DAY_PART_LABEL[p]).join(' and ')}`;
  if (f.busyNever * 2 > f.busyAnswers) return 'Usually free';
  const ranked = DAY_PARTS.filter((p) => count(p) > 0).sort((a, b) => count(b) - count(a));
  if (!ranked.length) return null;
  return ranked.length === 1 || count(ranked[0]) > count(ranked[1]) ? `Often busy ${DAY_PART_LABEL[ranked[0]]}` : 'Busy times vary';
}

/** Answers older than this are gone (the server keeps them 90 minutes too). */
const NOW_LASTS_MS = 90 * 60_000;

/** "20 min ago", "1 hr ago": how long since someone said how it is. */
export function nowAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

/** The latest answer still standing: "Free · 20 min ago", or nothing. */
export function nowStatus(now: Pick<CourtRightNow, 'status' | 'statusAt'> | undefined): { status: CourtNow; line: string } | null {
  if (!now?.status || !now.statusAt || Date.now() - Date.parse(now.statusAt) > NOW_LASTS_MS) return null;
  return { status: now.status, line: `${NOW_LABEL[now.status]} · ${nowAgo(now.statusAt)}` };
}

/**
 * Who is on court right now (checked in), as the server lets you see it:
 * people who follow each other with you by name, and anyone else only as a
 * count, and only when two or more adults are there. "Sam + 2 on court
 * now", "3 on court now": always "now", so it never reads like the
 * "who you follow plays here" line, which is from past posts and hits.
 * Nothing when nobody is.
 */
export function playingLine(now: CourtRightNow | undefined, users: User[]): string | null {
  if (!now) return null;
  const friends = now.friendIds.map((id) => users.find((u) => u.id === id)?.name.split(' ')[0]).filter((n): n is string => !!n);
  if (friends.length) {
    const others = Math.max(0, now.playing - friends.length);
    const names = friends.length === 1 ? friends[0] : friends.length === 2 ? `${friends[0]} and ${friends[1]}` : `${friends[0]}, ${friends[1]} and ${friends.length - 2} more`;
    return others ? `${names} + ${others} on court now` : `${names} on court now`;
  }
  return now.playing >= 2 ? `${now.playing} on court now` : null;
}

/** "Sam and Dev, who you follow, play here", from the people the server named (from posts and hits there, never from phones). */
export function regularsLine(people: User[]): string | null {
  const first = people.map((u) => u.name.split(' ')[0]);
  if (!first.length) return null;
  const names = first.length === 1 ? first[0] : first.length === 2 ? `${first[0]} and ${first[1]}` : `${first[0]}, ${first[1]} and ${first.length - 2} more`;
  return `${names}, who you follow, ${first.length === 1 ? 'plays' : 'play'} here`;
}
