import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import type { DetectedActivity, ID, MatchSet, PracticeSession, SessionPlayer } from '@/data/types';
import { activityDay } from '@/features/activity/format';
import { andList, canTagKind } from '@/features/activity/sessionTags';
import { sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { computeStats } from '@/features/practice/stats';
import { duration } from '@/lib/format';
import { isSupabaseConfigured } from '@/lib/supabase';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { loggedLabel } from './format';
import { isTennisActivity } from './workouts';

/** What logging a session takes: what it was, a match's result, who you played (tagged, or a name typed). */
export interface LogInput {
  kind: PracticeSession['kind'];
  won?: boolean;
  /** A match's score, your side first (migration 91). */
  sets?: MatchSet[];
  players?: SessionPlayer[];
  opponent?: string;
  note?: string;
  /** The length in your log when it differs from the tracker's (a break taken off). Left out: the tracker's time. */
  minutes?: number;
  /** The court it was played at, by the map's id (the court tagged on the post, or the hit it came from): kept in your log (migration 130). */
  courtId?: string;
}

/**
 * A tracker's session (tennis, or since Oct 5 any workout) opened by its id
 * (a "Tennis detected" or "Workout detected" alert, Log it,
 * a link from the lock screen): found among yours, or waited for when the
 * app was opened cold. Asks the server once more if it is still not there,
 * and gives up after ten seconds rather than spinning for ever. A copy of
 * one the other tracker saw first (the same game from the watch and from
 * WHOOP) stands for that one, logged or not. Held still from the moment it arrives, so a refresh of your
 * sessions while you write cannot change it (`activity`); `live` is how it
 * stands now (logged, hidden).
 *
 * `save` logs it, with who you played, and tells anyone the server would
 * not tag why.
 */
export function useTrackerSession(activityId: ID | undefined) {
  const { actions, detectedActivities, remoteLoaded, users, currentUserId, sessions, posts, stories } = useApp();
  const flags = useTennisFlags();
  const postable = (x: DetectedActivity) => sourceOn(x, flags);
  // One older than the two weeks the app holds (a "Tennis detected" row from
  // weeks back) is asked for by its id, and its twin with it: held here only.
  const [fetched, setFetched] = useState<DetectedActivity[]>([]);
  const pool = fetched.length ? [...detectedActivities, ...fetched] : detectedActivities;
  const found = activityId ? pool.find((x) => x.id === activityId) : undefined;
  // The copy of a game the other tracker saw first stands for it, however that
  // one stands now: once it is logged, this one shows as logged too (never a
  // second log of the same game).
  const twin = found?.status === 'duplicate' && found.duplicateOf ? pool.find((x) => x.id === found.duplicateOf) : undefined;
  const live = twin ?? found;

  const [looked, setLooked] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!activityId || found || !remoteLoaded || looked) return;
    void actions.refreshActivities()
      .then(async () => {
        const a = await actions.fetchActivity(activityId);
        const of = a?.status === 'duplicate' && a.duplicateOf ? await actions.fetchActivity(a.duplicateOf) : null;
        if (a) setFetched([a, ...(of ? [of] : [])]);
      })
      .catch(() => undefined)
      .finally(() => setLooked(true));
  }, [activityId, found, remoteLoaded, looked, actions]);
  useEffect(() => {
    if (!activityId) return undefined;
    const t = setTimeout(() => setGaveUp(true), 10_000);
    return () => clearTimeout(t);
  }, [activityId]);
  const waiting = !!activityId && !found && isSupabaseConfigured && !gaveUp && (!remoteLoaded || !looked);

  // Frozen on first arrival, late or not.
  const [held, setHeld] = useState<DetectedActivity | null>(() => live ?? null);
  useEffect(() => { if (!held && live) setHeld(live); }, [live?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const activity = held ?? undefined;
  const gone = !!activityId && !waiting && !live;
  // Its entry in your log, once it has one.
  const logged = activity ? sessions.find((s) => s.activityId === activity.id || (!!live?.sessionId && s.id === live.sessionId)) : undefined;

  const firstOf = (id: ID) => users.find((u) => u.id === id)?.name.trim().split(/\s+/)[0] ?? 'They';
  const saving = useRef(false);
  /** Logs it (once), then asks each player tagged. Returns the log's id; throws if it did not save. */
  const save = async (input: LogInput): Promise<ID> => {
    if (!activity) throw new Error('That session is no longer here.');
    if (logged) return logged.id;
    if (saving.current) throw new Error('Saving…');
    saving.current = true;
    try {
      const tagging = canTagKind(input.kind) ? input.players ?? [] : [];
      const id = await actions.logSession({
        minutes: input.minutes && input.minutes > 0 ? input.minutes : activity.minutes,
        kind: input.kind,
        won: input.kind === 'match' ? input.won : undefined,
        ...(input.kind === 'match' && input.sets?.length ? { sets: input.sets } : {}),
        opponent: canTagKind(input.kind) ? input.opponent ?? '' : '',
        day: activityDay(activity),
        activityId: activity.id,
        ...(input.note ? { note: input.note } : {}),
        ...(input.courtId ? { courtId: input.courtId } : {}),
        // A workout logged as fitness keeps what it was ("Run"), so the log says so after the workout's own row goes (migration 107).
        ...(!isTennisActivity(activity) && input.kind === 'fitness' ? { workout: activity.sport } : {}),
      });
      if (tagging.length) {
        const refused = await actions.setSessionPlayers(id, tagging).catch(() => []);
        for (const r of refused) showToast({ title: `${firstOf(r.id)} wasn’t tagged`, body: r.why, icon: 'pricetag-outline' });
      }
      return id;
    } catch (e) {
      // Logged already (on another phone, say): catch up.
      if (e instanceof Error && e.message === 'Already logged.') void actions.refreshActivities();
      throw e;
    } finally {
      saving.current = false;
    }
  };

  /** The streak once a session on `day` is in your log, and what it was before. */
  const streakWith = (day: string) => (currentUserId
    ? {
      now: computeStats(currentUserId, [{ id: '__new', userId: currentUserId, day, minutes: 1, kind: 'practice', createdAt: new Date().toISOString() }, ...sessions], posts, stories).currentStreakDays,
      before: computeStats(currentUserId, sessions, posts, stories).currentStreakDays,
    }
    : { now: 0, before: 0 });

  return { activity, live, waiting, gone, logged, flags, postable, save, streakWith, askedNames: (players: SessionPlayer[]) => andList(players.map((p) => firstOf(p.id))) };
}

/**
 * "Logged · 1h 24m · Match · Won", with the streak beside it from two days
 * on: the note after a session goes into your log without a post. The streak
 * rolls up only when this session made it grow (`before` is what it was);
 * a day that already counted (a post, an Instant, an earlier session) holds
 * it still, so the note never celebrates what didn't happen. Given the
 * session's id, it carries an "Instagram" button: the session as a story
 * picture (share-session), the way Strava offers it once you save.
 *
 * When the session beat a personal record you already had (records.ts), the
 * moment is that instead, in one note, not two: "New record! Longest match ·
 * 2h 40m · beat 2h 5m" on a gold rosette, with a reward buzz and the same
 * Instagram button.
 */
export function showLogged(minutes: number, s: Pick<PracticeSession, 'kind' | 'won' | 'sets'> & { workout?: string }, streak: { now: number; before: number }, sessionId?: string, record?: { title: string; body: string } | null) {
  if (record) {
    haptics.reward();
    showToast({ title: record.title, body: record.body, glyph: 'record', ...(sessionId ? { action: shareAction({ session: sessionId }) } : {}) });
    return;
  }
  showToast({
    title: 'Logged',
    body: `${duration(minutes)} · ${loggedLabel(s)}`,
    glyph: 'logged',
    ...(streak.now >= 2 ? { stat: { value: streak.now, from: streak.before, label: 'day streak' } } : {}),
    ...(sessionId ? { action: shareAction({ session: sessionId }) } : {}),
  });
}

/** The toast button that opens a session's Instagram picture: by its log entry, its post, or both. */
export function shareAction(params: { session?: string; post?: string }): { label: string; onPress: () => void } {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => !!v)) as Record<string, string>;
  return { label: 'Instagram', onPress: () => router.push({ pathname: '/share-session', params: clean }) };
}
