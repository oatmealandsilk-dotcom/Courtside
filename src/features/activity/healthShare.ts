import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DetectedActivity, HealthShareKey, PracticeSession, SessionDetail } from '@/data/types';
import { cleanZones, hardMinutes } from './zones';

/*
 * "Share health data" on a tracker session's post (owner, Oct 3): one switch,
 * and a Choose sheet with a tick for each number the tracker has. The same
 * for every age and account type. On by default for someone known to be an
 * adult, off for everyone else (who can still switch it on). The server
 * reads the list and adds only those numbers, from the author's own tracker
 * (migration 72).
 */

/**
 * The health numbers a session has: a tracker's (a DetectedActivity is one),
 * or since Oct 8 the calories and average heart rate typed into a session
 * logged by hand (loggedNumbers), which carry no tracker name. Everything
 * below reads only these, so both follow the same sharing rules.
 */
export type HealthNumbers = Partial<Pick<DetectedActivity, 'avgHr' | 'maxHr' | 'kcal' | 'zones' | 'strain' | 'source' | 'device'>>;

/** A session logged by hand, as the numbers typed into it; nothing when none were. A tracker's session never has any (its tracker's win). */
export function loggedNumbers(s: Pick<PracticeSession, 'kcal' | 'avgHr' | 'activityId'> | undefined): HealthNumbers | undefined {
  if (!s || s.activityId || (!s.kcal && !s.avgHr)) return undefined;
  return { ...(s.kcal ? { kcal: s.kcal } : {}), ...(s.avgHr ? { avgHr: s.avgHr } : {}) };
}

/** Every number in the order the sheet and the server list them. */
export const HEALTH_KEYS: HealthShareKey[] = ['hr', 'zones', 'strain', 'kcal'];

export const HEALTH_LABEL: Record<HealthShareKey, string> = {
  hr: 'Heart rate',
  zones: 'Heart-rate zones',
  strain: 'Strain',
  kcal: 'Calories',
};

/** The numbers this session actually has, in order. Strain is WHOOP's alone. */
export function availableShare(a: HealthNumbers | undefined): HealthShareKey[] {
  if (!a) return [];
  return HEALTH_KEYS.filter((k) => {
    switch (k) {
      case 'hr': return !!a.maxHr || !!a.avgHr;
      case 'zones': return !!cleanZones(a.zones);
      case 'strain': return a.source === 'whoop' && a.strain != null;
      case 'kcal': return !!a.kcal;
    }
  });
}

/** What one number reads as on the sheet: "141 avg · 171 max bpm", "30 min in zones 4–5", "14.2", "612 cal". */
export function healthValue(a: HealthNumbers, k: HealthShareKey): string {
  switch (k) {
    case 'hr': return [a.avgHr ? `${a.avgHr} avg` : null, a.maxHr ? `${a.maxHr} max` : null].filter(Boolean).join(' · ') + ' bpm';
    case 'zones': { const z = cleanZones(a.zones); return z ? `${hardMinutes(z)} min in zones 4–5` : ''; }
    case 'strain': return a.strain != null ? a.strain.toFixed(1) : '';
    case 'kcal': return a.kcal ? `${a.kcal} cal` : '';
  }
}

/**
 * The switch and the ticks, kept apart from any one session: `off` lists the
 * numbers ticked off, so "on" means every number the next session has
 * except those, whatever that session turns out to have.
 */
export interface HealthChoice { on: boolean; off: HealthShareKey[] }

/** On for someone known to be an adult, off for everyone else. */
export const defaultHealthChoice = (adult: boolean): HealthChoice => ({ on: adult, off: [] });

/** The numbers that go on the post: none with the switch off. */
export const chosenShare = (choice: HealthChoice, available: HealthShareKey[]): HealthShareKey[] =>
  (choice.on ? available.filter((k) => !choice.off.includes(k)) : []);

/** Ticks changed on the sheet: the switch stays on while any is ticked, and goes off with the last. */
export function choiceFromTicks(ticked: HealthShareKey[], available: HealthShareKey[]): HealthChoice {
  const on = available.some((k) => ticked.includes(k));
  return on ? { on, off: available.filter((k) => !ticked.includes(k)) } : { on: false, off: [] };
}

/** "2 of 4" while only some are chosen; nothing when all or none are. */
export function shareSummary(chosen: HealthShareKey[], available: HealthShareKey[]): string | undefined {
  return chosen.length && chosen.length < available.length ? `${chosen.length} of ${available.length}` : undefined;
}

/** "On your post: heart rate, zones and Strain." */
export function shareHint(chosen: HealthShareKey[]): string {
  if (!chosen.length) return 'Your heart rate and other health numbers stay private.';
  const words = chosen.map((k) => (k === 'zones' ? 'zones' : k === 'strain' ? 'Strain' : HEALTH_LABEL[k].toLowerCase()));
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `On your post: ${list}.`;
}

/**
 * A tracker's numbers as the post will carry them: only the chosen ones the
 * tracker has, and the list itself. The server writes the same from its own
 * copy of the tracker (migration 72); this is the copy shown straight away.
 */
export function withShare(base: SessionDetail, a: HealthNumbers, share: HealthShareKey[]): SessionDetail {
  const has = (k: HealthShareKey) => share.includes(k);
  const zones = cleanZones(a.zones);
  return {
    ...base,
    share,
    // Sending maxHr is also how an older server (before 72) is asked for heart rate.
    ...(has('hr') && a.maxHr ? { maxHr: a.maxHr } : {}),
    ...(has('hr') && a.avgHr ? { avgHr: a.avgHr } : {}),
    ...(has('zones') && zones ? { zones } : {}),
    ...(has('strain') && a.source === 'whoop' && a.strain != null ? { strain: a.strain } : {}),
    ...(has('kcal') && a.kcal ? { kcal: a.kcal } : {}),
  };
}

/*
 * "Share health data" on a post already up (Oct 4, owner): Edit post has the
 * same switch and Choose, starting from what the post shows now. Turning it
 * off takes the numbers off; turning it on or ticking more puts them on from
 * the author's own tracker, as the server does when the list changes
 * (migration 72's posts trigger reads them from its private copy).
 */

/**
 * The numbers a post shares now: its list, or, for a post made before the
 * list existed (it only ever had the time, and heart rate with zones for an
 * adult who asked), the numbers it carries.
 */
export function postShare(s: SessionDetail | undefined): HealthShareKey[] {
  // A tracker's post, or since Oct 8 one from your log that shares numbers typed into it (always with its list).
  if (!s?.activityId && !(s?.sessionId && Array.isArray(s.share))) return [];
  if (Array.isArray(s.share)) return HEALTH_KEYS.filter((k) => s.share?.includes(k));
  return HEALTH_KEYS.filter((k) => {
    switch (k) {
      case 'hr': return !!s.maxHr || !!s.avgHr;
      case 'zones': return !!cleanZones(s.zones);
      case 'strain': return s.strain != null;
      case 'kcal': return !!s.kcal;
    }
  });
}

/** Whether two lists name the same numbers, whatever the order. */
export const sameShare = (a: HealthShareKey[], b: HealthShareKey[]) => a.length === b.length && a.every((k) => b.includes(k));

/**
 * A post's stats with a new list, as shown straight away: every number off,
 * then the chosen ones back on from the author's tracker while this phone
 * holds it. Without it (older than the two weeks the app keeps), numbers can
 * only come off here; the server's answer brings the rest.
 */
export function reshare(s: SessionDetail, share: HealthShareKey[], a: HealthNumbers | undefined): SessionDetail {
  const { maxHr, avgHr, zones, strain, kcal, share: _was, ...base } = s;
  if (a) return withShare(base, a, share);
  const has = (k: HealthShareKey) => share.includes(k);
  return {
    ...base,
    share,
    ...(has('hr') && maxHr ? { maxHr } : {}),
    ...(has('hr') && avgHr ? { avgHr } : {}),
    ...(has('zones') && zones ? { zones } : {}),
    ...(has('strain') && strain != null ? { strain } : {}),
    ...(has('kcal') && kcal ? { kcal } : {}),
  };
}

/** Remembered on this phone for the next post, one choice per account (a shared phone must not share someone else's numbers). */
const storeKey = (userId: string) => `courtside-health-share:${userId}`;

export async function loadHealthChoice(userId: string): Promise<HealthChoice | null> {
  try {
    const raw = await AsyncStorage.getItem(storeKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<HealthChoice>;
    if (typeof v?.on !== 'boolean' || !Array.isArray(v.off)) return null;
    return { on: v.on, off: v.off.filter((k): k is HealthShareKey => HEALTH_KEYS.includes(k as HealthShareKey)) };
  } catch {
    return null;
  }
}

export function saveHealthChoice(userId: string, choice: HealthChoice): void {
  try { void AsyncStorage.setItem(storeKey(userId), JSON.stringify(choice)).catch(() => undefined); } catch { /* not remembered, still applied */ }
}
