import { useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CourtAccess, CourtFacts, CourtRightNow, ID, LiveSession, MapVisibility, TaggedCourt, User } from '@/data/types';
import { checkInPlan, liveState } from '@/features/activity/liveSession';
import { seenByOnMap, type TeenMap } from '@/features/players/mapPrivacy';
import * as haptics from '@/lib/haptics';
import type { CourtLifeActions } from '@/store/courtLife';

/*
 * A session played live (Oct 6, owner: "click start when they start a
 * session, and finish when they finish, like Strava"), as one slice of the
 * app's state, the way store/courtLife is: the session lives in AppContext
 * with everything else, the actions are written here.
 *
 * Start runs a clock and, at a court on the map, checks you in there with
 * the court sheet's own "I'm playing here" (checkInAtCourt, migration 63),
 * so its rules are the ones that decide who sees you: nothing new is shared.
 * Finish stops the clock and checks you out; the "Log it" composer then fills
 * itself in from it (app/compose?live=1, Oct 7; under five minutes Finish asks
 * instead: features/activity/finishLive). The session is kept on this phone, for
 * each account, so it survives the app closing; the server never has it.
 */

export interface LiveSessionState {
  /** Your session being played right now, or stopped and waiting to be logged; null with none. */
  liveSession: LiveSession | null;
  /** Whether this phone's copy has been read since signing in, so a page opened cold knows there is none. */
  liveSessionRead: boolean;
}

export const emptyLiveSession: LiveSessionState = { liveSession: null, liveSessionRead: false };

/** What the slice reads from the rest of the app's state. */
interface Reads {
  currentUserId: ID | null; users: User[]; locationEnabled: boolean;
  courtNow: Record<string, CourtRightNow>; courtFacts: Record<string, CourtFacts>;
  mapLive: boolean | null; mapVisibility: MapVisibility | null | undefined; teenMap: TeenMap;
}

export interface LiveSessionActions {
  /**
   * Start: the clock runs from now. At a court on the map you are checked in
   * there too, where the court sheet would let you ("I'm playing here").
   * Resolves once that has gone through or been refused. A session already
   * going is kept, never started twice.
   */
  startLiveSession: (input: { kind: LiveSession['kind']; court?: TaggedCourt | null; place?: string; access?: CourtAccess }) => Promise<LiveSession | null>;
  pauseLiveSession: () => void;
  /** Goes on from a pause, or from Finish (the log not saved yet): checked in again where Start checked you in. */
  resumeLiveSession: () => void;
  /** Stops the clock and checks you out; the session waits to be logged. */
  finishLiveSession: () => void;
  /** Throws it away, logging nothing (asked first, on the page). */
  discardLiveSession: () => void;
  /** It has been logged: done with. */
  endLiveSession: () => void;
  /** "Let friends see you're here", after a check-in that did not happen. Resolves the refusal, or null. */
  checkInLiveSession: () => Promise<string | null>;
  /** "Still playing?" was asked (Keep going, or put away): the clock runs on, and it is asked again two hours later. */
  keepGoingLiveSession: () => void;
}

/** This phone's copy, one session per account. */
const KEY = 'courtside-live-session';
/** A check-in lasts two hours (migration 63): one this old is put in again while the session goes on. */
const RENEW_MS = 100 * 60_000;

async function readAll(): Promise<Record<ID, LiveSession>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<ID, LiveSession>) : {};
  } catch {
    return {};
  }
}
const valid = (s: unknown): s is LiveSession => {
  const x = s as LiveSession;
  return !!x && typeof x.id === 'string' && typeof x.userId === 'string' && typeof x.startedAt === 'string' && Number.isFinite(Date.parse(x.startedAt))
    && ['practice', 'match', 'drills'].includes(x.kind) && typeof x.pausedMs === 'number';
};
/** Saves (or, with null, forgets) this account's session on the phone. Never throws: at worst it is kept for this visit only. */
function keep(userId: ID, s: LiveSession | null) {
  void readAll().then((all) => {
    const next = { ...all };
    if (s) next[userId] = s; else delete next[userId];
    return AsyncStorage.setItem(KEY, JSON.stringify(next));
  }).catch(() => undefined);
}

export function useLiveSession<S extends LiveSessionState & Reads>(
  stateRef: { current: S },
  setState: (update: (prev: S) => S) => void,
  live: (...ids: (ID | null | undefined)[]) => boolean,
  courts: Pick<CourtLifeActions, 'checkInAtCourt' | 'checkOutOfCourt' | 'loadCourtInfo'>,
  currentUserId: ID | null,
  session: LiveSession | null,
): LiveSessionActions {
  // The session as the actions last left it: the state's own copy is a render
  // behind (Start, then its check-in a moment later, both change it). A new
  // copy from the state (read from the phone, signed out) takes over.
  const latest = useRef<LiveSession | null>(session);
  const seen = useRef(session);
  if (seen.current !== session) { seen.current = session; latest.current = session; }
  /** Puts the session in place (or takes it away), here and on the phone. */
  const put = useCallback((me: ID, next: LiveSession | null) => {
    latest.current = next;
    setState((prev) => (prev.currentUserId === me ? { ...prev, liveSession: next } : prev));
    keep(me, next);
  }, [setState]);
  /** The same session with a change, if it is still the one going (the page may have moved on meanwhile). */
  const patch = useCallback((id: ID, change: Partial<LiveSession>) => {
    const s = latest.current;
    if (!s || s.id !== id) return;
    put(s.userId, { ...s, ...change });
  }, [put]);

  /** Checks you in at the session's court, by the court sheet's rules. Null when it went through. */
  const checkIn = useCallback(async (s: LiveSession, access?: CourtAccess): Promise<string | null> => {
    const st = stateRef.current;
    const me = st.users.find((u) => u.id === st.currentUserId);
    const plan = checkInPlan({
      me, court: s.court, access: access ?? (s.court ? st.courtFacts[s.court.id]?.access : undefined), locationOn: st.locationEnabled,
      seenBy: seenByOnMap(st.mapLive, me, st.teenMap, st.mapVisibility),
    });
    if (!plan.checkIn || !s.court) return null;
    const problem = await courts.checkInAtCourt(s.court.id);
    patch(s.id, problem ? { checkedIn: false, checkInProblem: problem } : { checkedIn: true, checkedInAt: new Date().toISOString(), checkInProblem: undefined });
    return problem;
  }, [stateRef, courts, patch]);

  /** Out of the session's court, if that is where you are checked in (a check-in somewhere else since is left alone). */
  const checkOut = useCallback((s: LiveSession) => {
    if (s.court && stateRef.current.courtNow[s.court.id]?.youHere) void courts.checkOutOfCourt();
  }, [stateRef, courts]);

  const startLiveSession = useCallback(async (input: { kind: LiveSession['kind']; court?: TaggedCourt | null; place?: string; access?: CourtAccess }) => {
    const me = stateRef.current.currentUserId;
    if (!me) return null;
    const going = latest.current;
    if (going && liveState(going) !== 'finished') return going;
    const s: LiveSession = {
      id: `live-${Date.now().toString(36)}`, userId: me, startedAt: new Date().toISOString(), kind: input.kind,
      ...(input.court ? { court: input.court } : {}),
      ...(!input.court && input.place?.trim() ? { place: input.place.trim() } : {}),
      pausedMs: 0, checkedIn: false,
    };
    haptics.reward();
    put(me, s);
    await checkIn(s, input.access);
    return latest.current ?? s;
  }, [stateRef, put, checkIn]);

  const pauseLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s || liveState(s) !== 'running') return;
    haptics.tap();
    put(s.userId, { ...s, pausedAt: new Date().toISOString() });
  }, [stateRef, put]);

  const resumeLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s) return;
    const state = liveState(s);
    if (state === 'running') return;
    haptics.tap();
    const now = Date.now();
    const stoppedAt = Date.parse((state === 'finished' ? s.endedAt : s.pausedAt) ?? new Date(now).toISOString());
    const { pausedAt: _p, endedAt: _e, ...rest } = s;
    const next: LiveSession = { ...rest, pausedMs: s.pausedMs + Math.max(0, now - stoppedAt) };
    put(s.userId, next);
    // Finish checked you out: going on puts you back where Start checked you in.
    if (state === 'finished' && s.checkedIn) void checkIn(next);
  }, [stateRef, put, checkIn]);

  const finishLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s || s.endedAt) return;
    haptics.commit();
    const { pausedAt: _p, ...rest } = s;
    put(s.userId, { ...rest, endedAt: s.pausedAt ?? new Date().toISOString() });
    checkOut(s);
  }, [stateRef, put, checkOut]);

  const discardLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s) return;
    haptics.tap();
    put(s.userId, null);
    checkOut(s);
  }, [stateRef, put, checkOut]);

  const endLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s) return;
    put(s.userId, null);
    checkOut(s);
  }, [stateRef, put, checkOut]);

  const checkInLiveSession = useCallback(async () => {
    const s = latest.current;
    if (!s || liveState(s) === 'finished') return null;
    return checkIn(s);
  }, [stateRef, checkIn]);

  const keepGoingLiveSession = useCallback(() => {
    const s = latest.current;
    if (!s || liveState(s) === 'finished') return;
    put(s.userId, { ...s, stillAskedAt: new Date().toISOString() });
  }, [put]);

  // Signed in: this account's session from the phone, if one was going. A
  // check-in it made is put back: the server's still stands for its two
  // hours (asked again here), the demo's lived only in the closed page.
  useEffect(() => {
    if (!currentUserId) return undefined;
    let on = true;
    void readAll().then((all) => {
      if (!on || stateRef.current.currentUserId !== currentUserId) return;
      const found = all[currentUserId];
      const s = valid(found) && found.userId === currentUserId ? found : null;
      setState((prev) => (prev.currentUserId !== currentUserId ? prev : { ...prev, liveSession: prev.liveSession ?? s, liveSessionRead: true }));
      if (!s?.court || !s.checkedIn || liveState(s) === 'finished') return;
      if (live(currentUserId)) void courts.loadCourtInfo([s.court.id]);
      else void courts.checkInAtCourt(s.court.id);
    });
    return () => { on = false; };
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A check-in lasts two hours: a longer session puts it in again, quietly, while you are still checked in there.
  const renewing = !!session && session.checkedIn && liveState(session) !== 'finished' && live(currentUserId);
  useEffect(() => {
    if (!renewing) return undefined;
    const look = () => {
      const s = latest.current;
      if (!s?.court || !s.checkedIn || liveState(s) === 'finished') return;
      if (!stateRef.current.courtNow[s.court.id]?.youHere) return;
      if (Date.now() - Date.parse(s.checkedInAt ?? s.startedAt) < RENEW_MS) return;
      void checkIn(s);
    };
    const t = setInterval(look, 60_000);
    return () => clearInterval(t);
  }, [renewing, stateRef, checkIn]);

  return useMemo(() => ({
    startLiveSession, pauseLiveSession, resumeLiveSession, finishLiveSession, discardLiveSession, endLiveSession, checkInLiveSession, keepGoingLiveSession,
  }), [startLiveSession, pauseLiveSession, resumeLiveSession, finishLiveSession, discardLiveSession, endLiveSession, checkInLiveSession, keepGoingLiveSession]);
}
