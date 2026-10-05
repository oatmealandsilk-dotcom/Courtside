import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { LOAD_BUDGET_MS, LOAD_SILENCE_MS, LOAD_STUCK_MS, RETRY_WAITS_MS } from '@/components/map/engineLoader';
import { reportError } from '@/lib/crashReporting';

/** Where a map is: on its way (including any retries), drawn, or given up on after every retry. */
export type MapLoadStatus = 'loading' | 'painted' | 'failed';

/**
 * One map's loading, shared by the phone (MapCanvas, whose web view is made
 * afresh for each try) and the browser (WebMap, whose map is). `attempt`
 * counts up each time the map should be made again; the page or map tells
 * this what it hears (PAINT_WATCH_JS, ENGINE_JS) and when it fails.
 *
 * - A try that fails, or goes 20 seconds without a word before the map is
 *   up, is made again after 2 seconds, then 6 (RETRY_WAITS_MS). Each try
 *   gets its own clock: one that has just started is never timed out.
 * - After the third failure, or a failure past 45 seconds (or 45 seconds
 *   gone, the try itself 20 seconds in, and nothing arriving in the last
 *   few), it says 'failed', once, in app_errors too (with what failed and
 *   how many tries, so "check crashes" shows it).
 * - Once the map is up, slow streets are never a failure: it is 'loading'
 *   until they have drawn. The page fetches failed or stuck streets again
 *   itself, and says 'fail' if they never come (PAINT_WATCH_JS); a page
 *   that goes 90 seconds without a word counts as failed too.
 * - Given up, it tries again by itself when the app comes back to the front
 *   or the connection comes back, and whenever `restart` is called (a tap).
 *   A try that was still going and comes good later still counts.
 */
export function useMapLoad(where: string) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<MapLoadStatus>('loading');
  // since: when this round of tries began; began: when the current try did.
  const s = useRef({ tries: 0, since: Date.now(), began: Date.now(), heard: Date.now(), progress: Date.now(), up: false, painted: false, gaveUp: false, reported: false, retry: null as ReturnType<typeof setTimeout> | null }).current;

  /** A new try, with its own clock: the page or map is made again. */
  const begin = () => {
    if (s.retry) { clearTimeout(s.retry); s.retry = null; }
    s.up = false;
    s.began = s.heard = s.progress = Date.now();
    setAttempt((n) => n + 1);
  };
  const giveUp = (why: string) => {
    if (s.painted || s.gaveUp) return;
    s.gaveUp = true;
    setStatus('failed');
    if (!s.reported) {
      s.reported = true;
      void reportError(new Error(`Map didn't load (${why}) after ${s.tries || 1} ${s.tries === 1 ? 'try' : 'tries'}, ${Math.round((Date.now() - s.since) / 1000)}s`), { where });
    }
  };
  /** This try failed: another after a wait, or (out of tries or time) the card says so. */
  const failed = (why: string) => {
    if (s.painted || s.gaveUp || s.retry) return;
    s.tries += 1;
    if (s.tries > RETRY_WAITS_MS.length || Date.now() - s.since > LOAD_BUDGET_MS) { giveUp(why); return; }
    s.retry = setTimeout(begin, RETRY_WAITS_MS[s.tries - 1]);
  };
  /** What the page or map said: any word shows it is alive; 'up' and 'painted' move it along. */
  const heard = (what: 'boot' | 'progress' | 'up' | 'painted' | 'other') => {
    const now = Date.now();
    s.heard = now;
    if (what === 'progress') s.progress = now;
    if (what === 'up') s.up = true;
    if (what === 'painted') {
      s.painted = true;
      if (s.retry) { clearTimeout(s.retry); s.retry = null; }
      setStatus('painted');
    } else if (what === 'up' && s.gaveUp) {
      // A try given up on came good after all: back to loading, and its streets are on their way.
      s.gaveUp = false;
      setStatus('loading');
    }
  };
  /** From the beginning, with all its tries: a tap on "Tap to try again", the app back in front, the connection back. */
  const restart = () => {
    if (s.painted) return;
    s.tries = 0;
    s.since = Date.now();
    s.gaveUp = false;
    setStatus('loading');
    begin();
  };
  /** The page was stopped by the phone (to free memory): made again, without counting as a failure. */
  const reboot = () => begin();

  // A try that has gone quiet is a failure (20 s before the map is up, 90 s after); before it is up, time runs
  // out once nothing is arriving, but never for a try that has only just started (it counts as a try then).
  useEffect(() => {
    if (status !== 'loading') return undefined;
    const t = setInterval(() => {
      if (s.painted || s.gaveUp || s.retry) return;
      const now = Date.now();
      if (s.up) { if (now - s.heard > LOAD_STUCK_MS) failed('stuck'); return; }
      if (now - s.heard > LOAD_SILENCE_MS) { failed('no answer'); return; }
      if (now - s.since > LOAD_BUDGET_MS && now - s.began > LOAD_SILENCE_MS && now - s.progress > 5000) failed('too slow');
    }, 1000);
    return () => clearInterval(t);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back in front: a map given up on tries again; one still on its way gets fresh clocks (the
  // phone may have paused it, and the timers above with it, while the app was away).
  const latest = useRef({ restart });
  latest.current = { restart };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || s.painted) return;
      if (s.gaveUp) { latest.current.restart(); return; }
      s.heard = Date.now();
      if (!s.up) { s.since = s.began = s.progress = Date.now(); }
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The connection is back: a map that has not come up starts again at once. */
  const online = () => { if (!s.painted && (s.gaveUp || !s.up)) latest.current.restart(); };
  // In the browser the page itself says so; on the phone the map's web view does (MapCanvas).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.addEventListener) return undefined;
    const on = () => online();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (s.retry) clearTimeout(s.retry); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, attempt, heard, failed, restart, reboot, online };
}
