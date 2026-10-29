import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useApp } from '@/store/AppContext';
import { show as showToast, type ToastMessage } from '@/lib/toast';
import { isDemo } from './flags';

/*
 * The watch tip (owner, Oct 28: "Auto log should be very pushed hard"). Of 18 players who had connected something,
 * only 3 had ever had a session log itself: connecting Apple Health brings nothing in until a Tennis workout is
 * recorded on the watch, and Fitbit files tennis as "Sport" unless Tennis is started on it.
 *
 *  - Who: Apple Health connected for tennis (or Fitbit connected), and no tennis session has ever come in from a
 *    tracker (nothing detected as tennis, nothing logged from one). Once one does, never again (kept on this phone).
 *  - Where: the top of Activities (its first page, in the connect card's place) and under the source's row on the
 *    Health page. "Got it" puts it away for AGAIN_MS everywhere; then it comes back, until a session arrives.
 *  - Fitbit: also once, as a note after the first "Was this tennis?" yes (the words approved Oct 27).
 *
 * Kept per account on this device. Teens see it too: it is about their own watch.
 */

export type WatchTipSource = 'apple-health' | 'fitbit';

export const WATCH_TIP: Record<WatchTipSource, string> = {
  'apple-health': 'Start a Tennis workout on your Apple Watch and it logs itself.',
  fitbit: 'Start Tennis on your Fitbit and it logs itself.',
};

const DAY_MS = 86_400_000;
/** "Got it" puts the tip away this long. */
export const AGAIN_MS = 3 * DAY_MS;

type Saved = {
  /** When "Got it" was last tapped (ms), 0 never. */
  gotItAt: number;
  /** A tennis session came in from a tracker: never again. */
  done: boolean;
  /** The note after the first Fitbit "Was this tennis?" yes has been shown. */
  fitbitYes: boolean;
};
const blank = (): Saved => ({ gotItAt: 0, done: false, fitbitYes: false });
const keyOf = (id: string) => `courtside.watch-tip.v1.${id}`;
const state = new Map<string, Saved>();
const loading = new Set<string>();
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
      state.set(id, early ? { gotItAt: Math.max(saved.gotItAt, early.gotItAt), done: saved.done || early.done, fitbitYes: saved.fitbitYes || early.fitbitYes } : saved);
    })
    .catch(() => { if (!state.has(id)) state.set(id, blank()); })
    .finally(() => { loading.delete(id); emit(); });
}

/** Read this account's saved tip ahead of time (asked as the tabs open, with the connect card's), so Activities knows at once. */
export function warmWatchTip(id: string) {
  load(id);
}

function update(id: string, change: (s: Saved) => Saved) {
  const next = change(state.get(id) ?? blank());
  state.set(id, next);
  void AsyncStorage.setItem(keyOf(id), JSON.stringify(next)).catch(() => undefined);
  emit();
}

export interface WatchTip {
  /** The source the tip is about (Apple Health before Fitbit), or null with neither connected. */
  source: WatchTipSource | null;
  /** The tip shows now: connected, no tennis session ever came in, and not put away in the last few days. */
  due: boolean;
  /** "Got it": away for a few days, everywhere. */
  gotIt: () => void;
  /** Everything `due` depends on has been heard (connections, sessions, this phone's saved tip): it is the final word. */
  known: boolean;
}

export function useWatchTip(): WatchTip {
  const { currentUserId, integrations, detectedActivities, sessions, healthIsReal, remoteLoaded } = useApp();
  const me = currentUserId;
  // A real account's connections and sessions are known once its open has loaded (the demo's at once).
  const ready = !!me && (isDemo(me) || (!!healthIsReal && remoteLoaded));
  useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => { if (ready && me) load(me); }, [ready, me]);
  const apple = integrations.some((i) => i.provider === 'apple-health' && i.connected && !!i.readsWorkouts);
  // Fitbit with tennis turned off is not told it logs itself (review, Oct 28): the same test as Apple Health's.
  const fitbit = integrations.some((i) => i.provider === 'fitbit' && i.connected && !!i.readsWorkouts);
  const source: WatchTipSource | null = apple ? 'apple-health' : fitbit ? 'fitbit' : null;
  // A tennis session from any tracker: detected as tennis (Fitbit's "Sport" ones still asking do not count), or
  // logged from one, by the server or by hand.
  const arrived = !!me && (detectedActivities.some((a) => a.userId === me && a.sport === 'tennis' && !a.unsure)
    || sessions.some((x) => x.userId === me && (!!x.autoLogged || !!x.activityId) && x.kind !== 'fitness'));
  const saved = me ? state.get(me) : undefined;
  useEffect(() => { if (ready && me && saved && !saved.done && arrived) update(me, (s) => ({ ...s, done: true })); }, [ready, me, saved, arrived]);
  const gotIt = useCallback(() => { if (me) update(me, (s) => ({ ...s, gotItAt: Date.now() })); }, [me]);
  const due = ready && !!source && !arrived && !!saved && !saved.done && (!saved.gotItAt || Date.now() - saved.gotItAt >= AGAIN_MS);
  return { source, due, gotIt, known: ready && !!saved };
}

/**
 * After the first "Was this tennis?" yes (Notifications): once the "Tennis logged" note has gone, one note with
 * the Fitbit tip, once ever on this phone. Returns the note's onClosed, or undefined when it has been shown.
 */
export function fitbitTipAfterYes(me: string | null | undefined): ((how: string) => void) | undefined {
  if (!me) return undefined;
  load(me);
  if (state.get(me)?.fitbitYes) return undefined;
  return (how) => {
    // Another note took its place (or the caller withdrew it): the tip waits for the next yes.
    if (how === 'replaced' || how === 'withdrawn') return;
    if (state.get(me)?.fitbitYes) return;
    update(me, (s) => ({ ...s, fitbitYes: true }));
    setTimeout(() => {
      showToast({ title: 'A tip for next time', body: WATCH_TIP.fitbit, icon: 'watch-outline', long: true });
    }, 600);
  };
}

/**
 * The same tip after a Fitbit "Sport" session is logged as tennis from its own row in Notifications ("Was this
 * tennis?" → the session's page → Log), not only from Yes (review, Oct 28). Noted by the save (useTrackerSession),
 * then picked up by its "Logged" note (showLogged): the session's page itself is unchanged.
 */
let yesFromRow: { me: string; sessionId: string } | null = null;

export function noteFitbitYes(me: string | null | undefined, sessionId: string) {
  if (me) yesFromRow = { me, sessionId };
}

/** The "Logged" note's onClosed for `sessionId`: the tip when that save was a Fitbit yes and it is due, else `next`. */
export function fitbitTipAfterLogged(sessionId: string | undefined, next: ToastMessage['onClosed']): ToastMessage['onClosed'] {
  const yes = yesFromRow;
  if (!yes || !sessionId || yes.sessionId !== sessionId) return next;
  yesFromRow = null;
  const tip = fitbitTipAfterYes(yes.me);
  if (!tip) return next;
  // Gone by itself or tapped away: the tip, in what would have followed's place. Otherwise what would have followed.
  return (how, upMs) => { if (how === 'timeout' || how === 'tap') tip(how); else next?.(how, upMs); };
}
