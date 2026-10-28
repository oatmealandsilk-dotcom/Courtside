import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ID } from '@/data/types';

/**
 * People you may know on Find Players, admins first (owner, Oct 28: "I like
 * b1 but it should say you may know. Instead of follow back. That way it's
 * not limited to just follow backs if someone followed you and you don't
 * follow back it can still appear there. Their thing will just say follow
 * back instead of follow").
 *
 * Off, Find Players is exactly as before. Admins (@oatmealandsilk,
 * @mrdinosaur62) get it first; in the web demo, ?admin=1 makes the demo's
 * player an admin. To open it to everyone: set this to true and ship an
 * over-the-air update (production channel only, never "store"). Nothing on
 * the server: it only reads who follows whom and the suggestions the app
 * already makes (src/features/people/suggestions.ts).
 * The same pattern as CITY_BOARD_FOR_EVERYONE and BAR_LENS_FOR_EVERYONE.
 */
export const PYMK_FOR_EVERYONE = false;

/** Whether this person sees People you may know. */
export const pymkOn = (me?: { isAdmin?: boolean } | null): boolean => !!me && (PYMK_FOR_EVERYONE || !!me.isAdmin);

const DAY = 86_400_000;
/** The x on a card: that person is not suggested here again for this long. */
export const HIDE_DAYS = 30;
/** Not now: the whole row rests this long ("very often", owner Oct 28), and this long from the third Not now on. */
export const REST_DAYS = 2;
export const REST_DAYS_LATER = 7;
export const NOT_NOWS_BEFORE_LONGER = 3;

/**
 * What the row remembers, kept on this device for each account separately
 * (there is no place for it on the server yet; nothing here is private:
 * only whom you hid and when the row may come back).
 */
export interface PymkMemory {
  /** Hidden people, until when (ms). */
  hidden: Record<ID, number>;
  /** The row rests until then (ms); 0 = not resting. */
  restUntil: number;
  /** How many times Not now was pressed. */
  notNows: number;
}

const EMPTY: PymkMemory = { hidden: {}, restUntil: 0, notNows: 0 };
const KEY = 'courtside-pymk';

/** Every account's memory, read once per open; null until read. */
let all: Record<string, PymkMemory> | null = null;
let reading: Promise<void> | null = null;

const clean = (raw: unknown, now: number): PymkMemory => {
  const x = raw as Partial<PymkMemory> | null;
  if (!x || typeof x !== 'object') return EMPTY;
  const hidden: Record<ID, number> = {};
  if (x.hidden && typeof x.hidden === 'object') {
    for (const [id, until] of Object.entries(x.hidden)) if (typeof until === 'number' && until > now) hidden[id] = until;
  }
  return {
    hidden,
    restUntil: typeof x.restUntil === 'number' && x.restUntil > now ? x.restUntil : 0,
    notNows: typeof x.notNows === 'number' && x.notNows > 0 ? Math.floor(x.notNows) : 0,
  };
};

function read(): Promise<void> {
  if (all) return Promise.resolve();
  if (!reading) {
    reading = AsyncStorage.getItem(KEY)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        const out: Record<string, PymkMemory> = {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [account, m] of Object.entries(parsed as Record<string, unknown>)) out[account] = clean(m, now);
        }
        all = { ...out, ...(all ?? {}) };
      })
      .catch(() => { all = all ?? {}; })
      .finally(() => { reading = null; });
  }
  return reading;
}

function write(account: string, m: PymkMemory) {
  all = { ...(all ?? {}), [account]: m };
  AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => { /* kept for this open */ });
}

/** This account's memory of the row: ready once read from the device (the row waits for it, so a hidden person never flashes). */
export function usePymkMemory(account: ID | null) {
  const [memory, setMemory] = useState<PymkMemory | null>(() => (account && all ? clean(all[account], Date.now()) : null));
  useEffect(() => {
    if (!account) { setMemory(null); return undefined; }
    let alive = true;
    read().then(() => { if (alive) setMemory(clean(all?.[account], Date.now())); });
    return () => { alive = false; };
  }, [account]);

  const hide = useCallback((id: ID) => {
    if (!account) return;
    const base = clean(all?.[account], Date.now());
    const next = { ...base, hidden: { ...base.hidden, [id]: Date.now() + HIDE_DAYS * DAY } };
    write(account, next);
    setMemory(next);
  }, [account]);

  const notNow = useCallback(() => {
    if (!account) return;
    const base = clean(all?.[account], Date.now());
    const notNows = base.notNows + 1;
    const next = { ...base, notNows, restUntil: Date.now() + (notNows >= NOT_NOWS_BEFORE_LONGER ? REST_DAYS_LATER : REST_DAYS) * DAY };
    write(account, next);
    setMemory(next);
  }, [account]);

  return { memory, hide, notNow };
}
