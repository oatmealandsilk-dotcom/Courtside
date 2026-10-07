import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';

import { isBusy } from '@/components/HitFollowUp';
import type { LiveSession } from '@/data/types';
import { finishLive } from '@/features/activity/finishLive';
import { elapsedMs, hoursWords, livePlace, stillPlayingAt } from '@/features/activity/liveSession';
import { planStillPlaying } from '@/features/activity/stillPlaying';
import { useCurtainDown } from '@/features/feed/warmup';
import { useTourBusy } from '@/features/tour/tourStore';
import { duration } from '@/lib/format';
import { isShowing as toastShowing, show as showToast, withdraw as withdrawToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';

/** A moment after the way is clear, so it never lands on the app's own opening notes. */
const SETTLE_MS = 2500;
/** It stays up this long (a flick or a tap puts it away sooner), like "How was the hit?". */
const HOLD_MS = 15000;
/** Pushed off by another note before it could be seen: asked again once that one has gone. */
const RETRY_MS = 6000;
/** Put away because a page to write or post opened: up this long, it was seen; less, it comes back after. */
const SEEN_MS = 5000;

/**
 * "Still playing? · Keep going · Finish" (Oct 6, owner): a live session whose
 * clock has run three hours (pauses left out) is asked about once, gently, in
 * the app's own note at the top, the way "How was the hit?" asks (never over
 * a page where someone is writing, the tutorial or the opening curtain).
 * Finish stops the clock and opens the "Log it" composer filled in, where the
 * time can be put right; Keep going (or the note put away) asks again two hours
 * on. The phone also sets its own alert for that moment, so a session left
 * running with the app closed is asked about on the lock screen
 * (features/activity/stillPlaying; none in a browser). Draws nothing itself.
 * Works the same in the demo: the session lives on the phone.
 */
export function StillPlaying({ enabled }: { enabled: boolean }) {
  const { liveSession, currentUserId, actions } = useApp();
  const pathname = usePathname();
  const touring = useTourBusy();
  const curtainDown = useCurtainDown();
  const mine = liveSession && liveSession.userId === currentUserId ? liveSession : null;
  const at = stillPlayingAt(mine);
  const where = mine ? livePlace(mine) : '';
  // The session as it is now, for a note put up a moment after it was decided.
  const latest = useRef<LiveSession | null>(mine);
  latest.current = mine;

  // The phone's own alert, set for the moment it is due: moved by a pause, gone at Finish.
  useEffect(() => {
    const s = latest.current;
    if (at === null || !s) { void planStillPlaying(null); return; }
    const ran = hoursWords(at - Date.parse(s.startedAt) - (s.pausedMs || 0));
    void planStillPlaying(at, `Your session${where ? ` at ${where}` : ''} has been going ${ran}. Finish it, or keep going.`);
  }, [at, where]);

  // Looked at again the moment it is due, and whenever the app comes back to the front.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return undefined;
    const wait = at - Date.now();
    if (wait <= 0) { setNow(Date.now()); return undefined; }
    const t = setTimeout(() => setNow(Date.now()), Math.min(wait + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [at]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setNow(Date.now()); });
    return () => sub.remove();
  }, []);

  const due = at !== null && now >= at;
  // The live page counts as asked (opened from the alert, say): its clock and Finish are right there.
  useEffect(() => { if (due && pathname === '/live-session') actions.keepGoingLiveSession(); }, [due, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  // Never over a page where someone is writing or posting, nor the live page itself (the same pages "How was the hit?" waits for).
  const clear = enabled && curtainDown && !touring && !isBusy(pathname);
  const showing = useRef(false);
  const toastId = useRef<number | null>(null);
  const [retry, setRetry] = useState(0);

  // A page to write or post opened, or the session was paused or finished, while it is up: it steps aside.
  useEffect(() => {
    if ((!clear || at === null) && showing.current && toastId.current !== null) withdrawToast(toastId.current);
  }, [clear, at]);

  useEffect(() => {
    if (!clear || !due || showing.current) return undefined;
    const t = setTimeout(() => {
      const s = latest.current;
      if (!s || stillPlayingAt(s) === null || (stillPlayingAt(s) ?? 0) > Date.now()) return;
      // Another note is up: it is not pushed away; asked again a little later.
      if (toastShowing()) { setRetry((n) => n + 1); return; }
      showing.current = true;
      const place = livePlace(s);
      toastId.current = showToast({
        title: 'Still playing?',
        // "3h 5m · Alder Park": short enough for the note's one line beside its two buttons.
        body: place ? `${duration(Math.floor(elapsedMs(s) / 60_000))} · ${place}` : `${duration(Math.floor(elapsedMs(s) / 60_000))} on the clock`,
        icon: 'stopwatch-outline',
        href: '/live-session',
        secondary: { label: 'Keep going', onPress: () => actions.keepGoingLiveSession() },
        action: {
          label: 'Finish',
          onPress: () => { const now = latest.current; if (now) finishLive(now, actions); },
        },
        holdMs: HOLD_MS,
        onClosed: (how, upMs) => {
          showing.current = false;
          toastId.current = null;
          if (how === 'replaced' || (how === 'withdrawn' && upMs < SEEN_MS)) { setRetry((n) => n + 1); return; }
          // Seen and left (it ran its time, was flicked away or opened the live page): asked, so again in two hours.
          // Keep going and Finish say so themselves.
          if (how !== 'action') actions.keepGoingLiveSession();
        },
      });
    }, retry ? RETRY_MS : SETTLE_MS);
    return () => clearTimeout(t);
  }, [clear, due, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
