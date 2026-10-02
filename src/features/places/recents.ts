import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TaggedCourt } from '@/data/types';

/**
 * The places you tagged posts with before, kept on this device for each
 * account separately, newest first, so Add location can offer them before
 * you type (the way Instagram does). A court keeps what it needs to be
 * tagged again.
 */
export interface RecentPlace {
  value: string;
  court?: TaggedCourt;
  at: number;
}

const KEY = 'courtside-recent-places';
const KEEP = 12;

/** Every account's list, read once per visit; null until read. */
let all: Record<string, RecentPlace[]> | null = null;
let reading: Promise<void> | null = null;

const valid = (r: unknown): r is RecentPlace => {
  const x = r as RecentPlace;
  if (!x || typeof x !== 'object' || typeof x.value !== 'string' || !x.value.trim()) return false;
  const c = x.court;
  return !c || (typeof c.id === 'string' && typeof c.name === 'string' && typeof c.lat === 'number' && typeof c.lng === 'number');
};

/** Reads the lists from the device. Started as Add location opens, so they are there by its first frame. */
export function warmRecentPlaces(): Promise<void> {
  if (all) return Promise.resolve();
  if (!reading) {
    reading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        const out: Record<string, RecentPlace[]> = {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [account, list] of Object.entries(parsed as Record<string, unknown>)) {
            if (Array.isArray(list)) out[account] = list.filter(valid).slice(0, KEEP);
          }
        }
        all = out;
      })
      .catch(() => { all = all ?? {}; })
      .finally(() => { reading = null; });
  }
  return reading;
}

/** This account's recent places, newest first; null while not read yet. */
export function recentPlaces(accountId: string): RecentPlace[] | null {
  return all ? all[accountId] ?? [] : null;
}

/** Puts a place on top of this account's list (an older copy of it goes) and saves it on the device. */
export function rememberPlace(accountId: string, value: string, court?: TaggedCourt): void {
  const v = value.trim();
  if (!v) return;
  const same = (r: RecentPlace) => (court ? r.court?.id === court.id : !r.court && r.value.toLowerCase() === v.toLowerCase());
  const save = () => {
    const mine = all?.[accountId] ?? [];
    all = { ...(all ?? {}), [accountId]: [{ value: v, court, at: Date.now() }, ...mine.filter((r) => !same(r))].slice(0, KEEP) };
    AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => { /* kept for this visit only */ });
  };
  // Never write over lists not read yet.
  if (all) save();
  else void warmRecentPlaces().then(save);
}
