import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { MapVisibility, User } from '@/data/types';
import { checkInZoomOn } from '@/features/players/checkInZoom';
import { saidYes } from '@/features/players/mapPrivacy';
import { UTH_TIP_FOR_EVERYONE } from '@/features/players/upToHitTip';

/*
 * A second ask, later, for someone who said no to the map (Oct 28, owner: "For people that chose no one, it should
 * still be a tip. And maybe we encourage them to share their location. Cause a lot of times my first time using an
 * app I'll not want to share location but as I use it more and trust it I will want to share if prompted").
 *
 * One bubble under the Find Players card's Up to hit pill, the same bubble as every tip: "Friends can see you when
 * you tap Up to hit · only people you both follow, till 10pm", with Turn on and Not now.
 *
 *  - Who: on "No one", or tapped "Not now" on "Who can see you on the map?" and never said yes since. Teens too
 *    (their rule is unchanged: friends who follow each other, their rough area).
 *  - Turn on: our "Who can see you on the map?" (its first look: Turn on, or Not now). Never Apple's
 *    prompt: that still comes only after that yes, on their next tap of Up to hit, exactly as before.
 *  - When (trust first, never a nag; Apple 5.1.1): the first time only once they have used the app on 3 different
 *    days since saying no (or 7 days have gone by), then at most once every 14 days, never twice in a session, never
 *    in the tutorial or over another tip (useTip). Gone for good after 3 "Not now"s, or once they say Friends.
 *  - Kept per account on this device.
 *
 * Admins first: for everyone by setting NO_ONE_REASK_FOR_EVERYONE (or UTH_TIP_FOR_EVERYONE) to true.
 */
export const NO_ONE_REASK_FOR_EVERYONE = false;

/** Whether the re-ask may show for this person at all (the pill it hangs from is theirs too). */
export const noOneReaskOn = (me: User | null | undefined): boolean =>
  checkInZoomOn(me) && (NO_ONE_REASK_FOR_EVERYONE || UTH_TIP_FOR_EVERYONE || !!me?.isAdmin);

const DAY_MS = 86_400_000;
/** Days of use (since saying no) before the first ask. */
const FIRST_AFTER_DAYS_USED = 3;
/** Or this long since saying no, however few days they came. */
const FIRST_AFTER_MS = 7 * DAY_MS;
/** Never sooner than this after the last ask. */
const AGAIN_AFTER_MS = 14 * DAY_MS;
/** "Not now" this many times: never again. */
const MAX_NOT_NOWS = 3;
/** How long it stays up unanswered before it goes by itself (counts as asked, not as a Not now). */
export const REASK_SHOW_MS = 12_000;

type Saved = {
  /** When we first knew them as a no (ms), 0 while they are not one. */
  since: number;
  /** Tapped "Not now" on the first "Who can see you on the map?" (No one is read from the account). */
  declined: boolean;
  /** Different days (local, YYYY-MM-DD) they used the app since `since`, up to the few that matter. */
  days: string[];
  /** When it last showed (ms). */
  lastAt: number;
  notNows: number;
  /** Said Friends (or ran out of Not nows): never again. */
  done: boolean;
};
const blank = (): Saved => ({ since: 0, declined: false, days: [], lastAt: 0, notNows: 0, done: false });

const keyOf = (id: string) => `courtside.no-one-reask.v1.${id}`;
const state = new Map<string, Saved>();
const loading = new Set<string>();
/** Shown already since the app started (never twice in a session). */
let shownThisSession = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version += 1; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

function load(id: string) {
  if (state.has(id) || loading.has(id)) return;
  loading.add(id);
  void AsyncStorage.getItem(keyOf(id))
    .then((raw) => {
      const saved = raw ? { ...blank(), ...(JSON.parse(raw) as Partial<Saved>) } : blank();
      // Anything noted before the read finished is kept on top.
      const early = state.get(id);
      state.set(id, early ? { ...saved, declined: saved.declined || early.declined } : saved);
    })
    .catch(() => { if (!state.has(id)) state.set(id, blank()); })
    .finally(() => { loading.delete(id); emit(); });
}

function update(id: string, change: (s: Saved) => Saved) {
  const next = change(state.get(id) ?? blank());
  state.set(id, next);
  void AsyncStorage.setItem(keyOf(id), JSON.stringify(next)).catch(() => undefined);
  emit();
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** "Not now" (or closed) on the first "Who can see you on the map?": they said no for now. */
export function noteDeclined(id: string | null | undefined) {
  if (!id) return;
  load(id);
  update(id, (s) => ({ ...s, declined: true }));
}

/** Whether they are a no right now: No one, or Not now with no yes since. */
const isNo = (s: Saved | undefined, v: MapVisibility | null | undefined) => v === 'none' || (!!s?.declined && !saidYes(v));

/** Notes a day of use, and starts (or ends) the count, as their answer stands. */
function noteUse(id: string, v: MapVisibility | null | undefined) {
  const s = state.get(id);
  if (!s || s.done) return;
  if (saidYes(v)) {
    // Friends: it has done its job (or they found it on their own).
    if (s.since || s.declined) update(id, (x) => ({ ...x, done: true }));
    return;
  }
  if (!isNo(s, v)) return;
  const day = today();
  if (s.since && s.days.includes(day)) return;
  update(id, (x) => ({ ...x, since: x.since || Date.now(), days: x.days.includes(day) ? x.days : [...x.days, day].slice(-FIRST_AFTER_DAYS_USED) }));
}

/** Whether the time is right for them now (the who and the when; the where is the caller's). */
function due(s: Saved | undefined, v: MapVisibility | null | undefined, now: number): boolean {
  if (!s || s.done || shownThisSession || s.notNows >= MAX_NOT_NOWS || !isNo(s, v) || !s.since) return false;
  if (s.lastAt) return now - s.lastAt >= AGAIN_AFTER_MS;
  return s.days.length >= FIRST_AFTER_DAYS_USED || now - s.since >= FIRST_AFTER_MS;
}

/**
 * The Find Players card: whether the re-ask is due for this person, as they stand (`mapVisibility` undefined:
 * not known yet, so never). Counts their days of use while the card is mounted, and each time the app comes back.
 */
export function useNoOneReaskDue(me: User | null | undefined, mapVisibility: MapVisibility | null | undefined): boolean {
  const id = me?.id ?? null;
  const on = noOneReaskOn(me) && mapVisibility !== undefined;
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => { if (on && id) load(id); }, [on, id]);
  const s = id ? state.get(id) : undefined;
  const loaded = !!s;
  useEffect(() => {
    if (!on || !id || !loaded) return undefined;
    noteUse(id, mapVisibility);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') noteUse(id, mapVisibility); });
    return () => sub.remove();
  }, [on, id, loaded, mapVisibility]);
  return on && due(s, mapVisibility, Date.now());
}

/** It came up: asked, for the 14 days, and not again this session. */
export function noteReaskShown(id: string) {
  shownThisSession = true;
  update(id, (s) => ({ ...s, lastAt: Date.now() }));
}

/** "Not now" on the bubble, or on the sheet it opened. */
export function noteReaskNotNow(id: string) {
  update(id, (s) => ({ ...s, notNows: s.notNows + 1, done: s.done || s.notNows + 1 >= MAX_NOT_NOWS }));
}

/** They said Friends: never again. */
export function noteReaskYes(id: string) {
  update(id, (s) => ({ ...s, done: true }));
}

