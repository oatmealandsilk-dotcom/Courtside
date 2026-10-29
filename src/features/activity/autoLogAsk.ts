import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DetectedActivity, PracticeSession, User } from '@/data/types';
import { sourceWord } from '@/features/activity/recent';
import { friendsAtMost } from '@/features/activity/autoLogSharing';

/*
 * "Show your tennis to friends?" (owner, Oct 29: "Can you somehow push them
 * to pick friends", "Show to friends should be emphasized and pushed hard").
 *
 * Players who connected a tracker before migration 193, and every Apple
 * Health player, have never chosen who sees the tennis that logs itself
 * (autoLogSharing null), so those sessions stay with them alone. This asks
 * them once: in the app, the next time it is open (components/AutoLogAsk,
 * the card at app/auto-log-ask), and once by phone alert (migration 199,
 * which opens the same card). "Show to friends" is the big green button;
 * "Keep private" is a plain, one-tap answer under it (Apple's 5.1.3: health
 * data goes to others only on a clear yes, with a real no beside it). Each
 * answer is saved as Settings saves it; nothing is shared until a yes.
 */

/** The card's address. */
export const AUTO_LOG_ASK = '/auto-log-ask';

/**
 * The server's one alert opens Notifications with this (migration 199): an
 * address every version of the app can open. This version opens the card.
 */
export const AUTO_LOG_ASK_ALERT = '/notifications?ask=auto-log';

/** The alert's address, as this version opens it: the card. Null for any other. */
export const askFromAlert = (href: string): string | null => (href === AUTO_LOG_ASK_ALERT ? `${AUTO_LOG_ASK}?from=alert` : null);

/**
 * Whether the account has something the ask is about: a session that logged
 * itself, or anything a tracker sent (it is connected). Only one of yours.
 */
export function hasAutoTennis(me: string | null, sessions: Pick<PracticeSession, 'userId' | 'autoLogged'>[], activities: Pick<DetectedActivity, 'userId' | 'status'>[]): boolean {
  if (!me) return false;
  return sessions.some((s) => s.userId === me && !!s.autoLogged) || activities.some((a) => a.userId === me && a.status !== 'withdrawn');
}

/** Where your sessions come from, in words: "WHOOP", "WHOOP and Apple Health"; "your tracker" when not known. */
export function sourcesWords(me: string | null, activities: Pick<DetectedActivity, 'userId' | 'status' | 'source' | 'device'>[]): string {
  const names: string[] = [];
  for (const a of activities) {
    if (a.userId !== me || a.status === 'withdrawn') continue;
    const w = sourceWord(a);
    if (!names.includes(w)) names.push(w);
  }
  if (!names.length) return 'your tracker';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).slice(0, 2).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The card's one line: who sees them and what of them, by today's rules
 * (consentLine's): an adult's show their time, heart rate, zones and
 * calories; anyone else's (under 18, or no birthday given) only when and how long.
 */
export function askLine(sources: string, user: Pick<User, 'ageGroup'> | null | undefined, teen = false): string {
  const start = `Your sessions from ${sources} show to friends who follow you back`;
  return teen || friendsAtMost(user) ? `${start}: when you played and for how long, no heart rate.` : `${start}, with heart rate, zones and calories.`;
}

/** "Sam, Marcus and 5 friends will see it" (real friends who follow you back; none, no line). */
export function willSeeWords(people: Pick<User, 'name'>[]): string {
  const first = people.map((u) => u.name.split(' ')[0]);
  if (!first.length) return '';
  if (first.length === 1) return `${first[0]} will see it`;
  if (first.length <= 3) return `${first.slice(0, -1).join(', ')} and ${first[first.length - 1]} will see it`;
  const rest = first.length - 2;
  return `${first.slice(0, 2).join(', ')} and ${rest} ${rest === 1 ? 'friend' : 'friends'} will see it`;
}

/**
 * Demo build in a browser: `?ask=auto-log` (or `?ask=teen`, a teen's card;
 * kept for the tab) lets the card come up by itself as it does for a real
 * player, so it can be seen. Without it the demo never puts it up (it would
 * stand over every walk-through). Null: not asked for.
 */
export function demoAsk(): 'adult' | 'teen' | null {
  try {
    if (typeof window === 'undefined' || !window.location || !window.sessionStorage) return null;
    const asked = new URLSearchParams(window.location.search).get('ask');
    if (asked === 'auto-log' || asked === 'teen') window.sessionStorage.setItem('courtside-demo-auto-log-ask', asked === 'teen' ? 'teen' : 'adult');
    const kept = window.sessionStorage.getItem('courtside-demo-auto-log-ask');
    return kept === 'teen' || kept === 'adult' ? kept : null;
  } catch {
    return null;
  }
}

const ASKED_KEY = (me: string) => `courtside-auto-log-asked:${me}`;

/** Whether this phone has already put the ask up for this account (null: it could not be read, so it is not asked). */
export async function readAsked(me: string): Promise<boolean | null> {
  try {
    return (await AsyncStorage.getItem(ASKED_KEY(me))) === '1';
  } catch {
    return null;
  }
}

/** Put up once: never again by itself on this phone (the alert, or Settings, can still open it). */
export async function markAsked(me: string): Promise<void> {
  try { await AsyncStorage.setItem(ASKED_KEY(me), '1'); } catch { /* best effort */ }
}
