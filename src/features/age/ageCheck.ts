import AsyncStorage from '@react-native-async-storage/async-storage';

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
