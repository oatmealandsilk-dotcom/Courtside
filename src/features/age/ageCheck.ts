import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * The age check's small pieces: turning a typed date into a real one,
 * working out an age, and the two things this phone remembers — that an
 * answer here was under 13 (so the question cannot simply be asked again
 * with a different date), and which accounts on it have already answered.
 */

const BLOCK_KEY = 'courtside-age-block';
const answeredKey = (userId: string) => `courtside-age:${userId}`;

export type AgeGroup = 'teen' | 'adult';

/** Month, day and year as typed, as a date ("2009-04-17"), or null if it is not a real date. */
export function toBirthDate(month: string, day: string, year: string): string | null {
  const m = Number(month), d = Number(day), y = Number(year);
  if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y) || year.trim().length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > Date.now() || y < 1900) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Whole years old today, for a date like "2009-04-17". */
export function yearsOld(birthDate: string, today = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let years = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) years -= 1;
  return years;
}

export const groupFor = (years: number): AgeGroup => (years < 18 ? 'teen' : 'adult');

export async function isDeviceBlocked(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(BLOCK_KEY)) === 'yes'; } catch { return false; }
}
export async function blockDevice() {
  try { await AsyncStorage.setItem(BLOCK_KEY, 'yes'); } catch { /* nothing to keep it in */ }
}
export async function rememberAnswered(userId: string, group: AgeGroup) {
  try { await AsyncStorage.setItem(answeredKey(userId), group); } catch { /* nothing to keep it in */ }
}
export async function recallAnswered(userId: string): Promise<AgeGroup | null> {
  try {
    const value = await AsyncStorage.getItem(answeredKey(userId));
    return value === 'teen' || value === 'adult' ? value : null;
  } catch { return null; }
}

/**
 * A birthday typed on the sign-up form before tapping Apple or Google,
 * carried to the account that opens next so the age check does not ask for
 * it again. (An email sign-up's birthday travels on the account itself; see
 * auth.signUp.) It is kept only for this visit: in memory on a phone, and for
 * this tab on the web, which leaves for Google's page and comes back. It
 * names no account, so a new tap on Apple or Google replaces it, the first
 * account to open afterwards uses it up whether or not it takes it, and only
 * an account made after the tap, within a few minutes, can take it.
 */
const CARRY_KEY = 'courtside-age-carried';
const CARRIED_FOR = 10 * 60 * 1000;
// The account's creation time comes from the server, whose clock can be a
// little behind the phone's; a brand-new account still counts as made after the tap.
const CLOCK_SLACK = 5 * 60 * 1000;
type Carried = { date: string; at: number };
let carried: Carried | null = null;
function tab(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try { return window.sessionStorage; } catch { return null; }
}

export function carryBirthDate(date: string) {
  carried = { date, at: Date.now() };
  try { tab()?.setItem(CARRY_KEY, JSON.stringify(carried)); } catch { /* this visit's memory still has it */ }
}
export function dropCarriedBirthDate() {
  carried = null;
  try { tab()?.removeItem(CARRY_KEY); } catch { /* nothing kept */ }
}
/** For the account that has just opened: the carried birthday if it may have it, or null. Either way it is used up. */
export function claimCarriedBirthDate(account: { createdAt?: string | null }): string | null {
  let held = carried;
  if (!held) {
    try {
      const raw = tab()?.getItem(CARRY_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Carried>) : null;
      if (typeof saved?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.date) && typeof saved.at === 'number') held = { date: saved.date, at: saved.at };
    } catch { /* unreadable: as if nothing was carried */ }
  }
  dropCarriedBirthDate();
  if (!held || Date.now() - held.at >= CARRIED_FOR) return null;
  const made = Date.parse(account.createdAt ?? '');
  return made >= held.at - CLOCK_SLACK ? held.date : null;
}
