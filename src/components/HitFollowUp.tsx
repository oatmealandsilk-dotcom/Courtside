import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';

import type { HitRequest, ID } from '@/data/types';
import { tennisFlags, type TennisFlags } from '@/features/activity/flags';
import { pickSource } from '@/features/activity/recent';
import { duration } from '@/lib/format';
import { useCurtainDown } from '@/features/feed/warmup';
import { dueHits, keepHitPrefill, markAsked, nextHitEnd, prefillFor, readAsked, shortPlace, trackerFor } from '@/features/hits/followUp';
import { useTourBusy } from '@/features/tour/tourStore';
import { show as showToast, withdraw as withdrawToast } from '@/lib/toast';
import { useAnyUploading } from '@/lib/uploads';
import { useApp } from '@/store/AppContext';

/** Pages where someone is writing or posting: the question waits until they are done. */
const BUSY = new Set(['/compose', '/edit-post', '/ask', '/ask-coach', '/log-session', '/pick-session', '/session-tag', '/pick-location', '/court-report', '/court-now', '/map-visibility', '/open-to-hit', '/hit-request/new', '/hit', '/comments', '/session-stats', '/who-played', '/health-share', '/tennis-sheet']);
/** The inbox and every chat: the note would sit over a chat's header and the inbox's title, mid-conversation. */
const isBusy = (path: string) => BUSY.has(path) || path === '/messages' || path.startsWith('/messages/');
/** A moment after the way is clear, so it never lands on the app's own opening notes. */
const SETTLE_MS = 2500;
/** It stays up this long (a flick or a tap puts it away sooner): long enough to be noticed on a page you are looking at. */
const HOLD_MS = 15000;
/** Pushed off by another note before it could be seen: asked again once that one has gone (an Undo note stays 5 seconds). */
const RETRY_MS = 6000;
/** Put away because a page where you write or post opened: up this long, it was seen (as long as any note with a button stays); less, it comes back after. */
const SEEN_MS = 5000;

/**
 * "How was the hit at Alder Park? · Log it": once a hit you posted or joined
 * is over (90 minutes after it started), the next time the app is open this
 * asks, once, in the app's own note at the top (never a phone alert), and
 * Log it opens the log sheet filled in from the hit (or, when your tracker
 * picked up the same game, that session, so it is logged once). Not while
 * the tutorial is up, a post is being written or is still going up, or under
 * the opening curtain. It stays up for a while, and only counts as asked once
 * it has stayed its time or been tapped, used or flicked away; pushed off by
 * another note first, it comes back a moment later. Opening a page to write
 * or post puts it away (asked, if it was up a few seconds). Called-off hits are
 * never asked about, nor any hit twice on this device (features/hits/followUp).
 * Draws nothing itself. The same on a phone and in a browser, so there is no
 * .web twin.
 */
export function HitFollowUp({ enabled }: { enabled: boolean }) {
  const { currentUserId, hitRequests, sessions, detectedActivities, users, actions } = useApp();
  const pathname = usePathname();
  const touring = useTourBusy();
  const uploading = useAnyUploading();
  const curtainDown = useCurtainDown();
  // Your hits from the last two days, fresh from the server each time it looks
  // (the open-hits list lets a hit go an hour after it starts, and may not
  // have heard it was called off). Only these are ever asked about.
  const [recent, setRecent] = useState<HitRequest[]>([]);
  const lookAgain = useRef<() => void>(() => undefined);
  // What this device already asked about; null until read, or when it cannot be.
  const [asked, setAsked] = useState<Set<ID> | null>(null);
  // Which trackers are switched on, so a game your tracker already has is not
  // logged twice; nothing is asked until the server has answered.
  const [flags, setFlags] = useState<TennisFlags | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The question on screen right now (its toast), so it is not put up a second time while it is still up.
  const showing = useRef(false);
  const toastId = useRef<number | null>(null);
  // Bumped when another note pushed it off, to ask again shortly.
  const [retry, setRetry] = useState(0);

  // Looked at when the app opens and each time it comes back to the front.
  useEffect(() => {
    if (!enabled || !currentUserId) return undefined;
    let live = true;
    const look = () => {
      void actions.recentHits().then((list) => { if (live) { setRecent(list); setNow(Date.now()); } }).catch(() => undefined);
      void tennisFlags(currentUserId).then((f) => { if (live) setFlags(f); });
    };
    lookAgain.current = look;
    look();
    void readAsked(currentUserId).then((set) => { if (live) setAsked(set); });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') look(); });
    return () => { live = false; sub.remove(); };
  }, [enabled, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every hit of yours known here, upcoming ones too, for when the next one ends.
  const known = useMemo(() => {
    const byId = new Map<ID, HitRequest>(hitRequests.map((h) => [h.id, h]));
    for (const h of recent) byId.set(h.id, h);
    return [...byId.values()];
  }, [hitRequests, recent]);

  // A hit that ends while the app is open is asked about then, once the server has been asked again.
  useEffect(() => {
    if (!enabled || !currentUserId) return undefined;
    const next = nextHitEnd(known, currentUserId, now);
    if (next === null) return undefined;
    const t = setTimeout(() => lookAgain.current(), next - Date.now() + 1000);
    return () => clearTimeout(t);
  }, [known, enabled, currentUserId, now]);

  const due = enabled && currentUserId && asked && flags ? dueHits(recent, { me: currentUserId, sessions, activities: detectedActivities, flags, asked, now }) : [];
  const clear = enabled && curtainDown && !touring && !uploading && !isBusy(pathname);
  const first = due[0];

  // A page to write or post opened (or the tutorial) while it is up: it steps aside, never sitting over the Create box.
  useEffect(() => {
    if (!clear && showing.current && toastId.current !== null) withdrawToast(toastId.current);
  }, [clear]);

  useEffect(() => {
    if (!clear || !first || !currentUserId || !flags || showing.current) return undefined;
    const ids = due.map((h) => h.id);
    const t = setTimeout(() => {
      showing.current = true;
      const prefill = prefillFor(first, currentUserId, users);
      keepHitPrefill(prefill);
      // Your tracker's copy of the same game, waiting to be logged: that is the one logged, filled in from the hit.
      const tracked = trackerFor(first, { me: currentUserId, activities: detectedActivities, flags });
      const params = tracked ? { activity: tracked.id, hit: first.id } : { hit: first.id };
      // With your tracker's copy, the composer (post it, or just log it); without, the log sheet.
      const open = () => router.push({ pathname: tracked ? '/compose' : '/log-session', params });
      toastId.current = showToast({
        title: `How was the hit at ${shortPlace(prefill.place)}?`,
        // With your tracker's copy it carries what "Tennis detected" would have
        // said (the two arrive together, and this one takes its place): the
        // session's mark and its numbers, yours alone.
        ...(tracked
          ? { glyph: 'session' as const, body: [duration(tracked.minutes), tracked.maxHr ? `${tracked.maxHr} max bpm` : null, pickSource({ type: 'tracker', activity: tracked })].filter(Boolean).join(' · ') }
          : { icon: 'hit' as const }),
        href: tracked ? `/compose?activity=${tracked.id}&hit=${first.id}` : `/log-session?hit=${first.id}`,
        action: { label: 'Log it', onPress: open },
        holdMs: HOLD_MS,
        onClosed: (how, upMs) => {
          showing.current = false;
          toastId.current = null;
          if (how === 'replaced' || (how === 'withdrawn' && upMs < SEEN_MS)) { setRetry((n) => n + 1); return; }
          // Asked once: this one and any older one waiting with it, so a busy day brings one question, not a queue.
          setAsked((prev) => new Set([...(prev ?? []), ...ids]));
          void markAsked(currentUserId, ids);
        },
      });
    }, retry ? RETRY_MS : SETTLE_MS);
    return () => clearTimeout(t);
  }, [clear, first?.id, currentUserId, !!flags, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
