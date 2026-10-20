import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';

import type { HitRequest, ID } from '@/data/types';
import { tennisFlags, type TennisFlags } from '@/features/activity/flags';
import { pickSource } from '@/features/activity/recent';
import { duration } from '@/lib/format';
import { useFeedSwiped } from '@/features/feed/firstSwipe';
import { useCurtainDown } from '@/features/feed/warmup';
import { dueHits, keepHitPrefill, markAsked, nextHitEnd, prefillFor, readAsked, shortPlace, trackerFor } from '@/features/hits/followUp';
import { useTourBusy } from '@/features/tour/tourStore';
import { isShowing as toastShowing, show as showToast, withdraw as withdrawToast, type HitNoteLook } from '@/lib/toast';
import { useAnyUploading } from '@/lib/uploads';
import { useApp } from '@/store/AppContext';

/**
 * Pages where someone is writing or posting: the question waits until they are done. Sharing a session
 * too, which opens by itself straight after posting one (Oct 15): the note would sit over its title and Done.
 */
const BUSY = new Set(['/compose', '/edit-post', '/ask', '/ask-coach', '/log-session', '/start-session', '/live-session', '/pick-session', '/session-tag', '/pick-location', '/court-report', '/court-now', '/map-visibility', '/open-to-hit', '/hit-request/new', '/hit', '/comments', '/session-stats', '/who-played', '/health-share', '/tennis-sheet', '/share-session', '/new-session']);
/** The inbox and every chat: the note would sit over a chat's header and the inbox's title, mid-conversation. (Still playing? waits the same way.) */
export const isBusy = (path: string) => BUSY.has(path) || path === '/messages' || path.startsWith('/messages/');
/** A moment after the way is clear, so it never lands on the app's own opening notes. */
const SETTLE_MS = 2500;
/**
 * It stays up this long (a flick or a tap puts it away sooner): long enough
 * to be noticed, short enough not to sit in the way (was 15 s; Oct 20 sweep,
 * "For 15 seconds it hides page titles, the bell and the Feed tabs").
 */
const HOLD_MS = 6000;
/** Pushed off by another note before it could be seen: asked again once that one has gone (an Undo note stays 5 seconds). */
const RETRY_MS = 6000;
/** Put away because a page where you write or post opened: up this long, it was seen (as long as any note with a button stays); less, it comes back after. */
const SEEN_MS = 5000;
/** How the question is drawn (Toast's HitNote): 'pill', a card under the page's title row; 'banner', a card just above the tab bar with two answers. */
const LOOK: HitNoteLook = 'banner';

/**
 * "How was the hit at Alder Park? · Log it": once a hit you posted or joined
 * is over (90 minutes after it started), the next time the app is open this
 * asks, once, in the app's own note near the top, just under the page's
 * title row (never a phone alert), and
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
  const { currentUserId, hitRequests, sessions, detectedActivities, users, actions, liveSession } = useApp();
  const pathname = usePathname();
  const touring = useTourBusy();
  const uploading = useAnyUploading();
  const curtainDown = useCurtainDown();
  // On the Feed it waits for the first swipe to land (then the usual settle), so
  // it never drops in while someone is reaching for the Feed's top row.
  const swiped = useFeedSwiped();
  const waitOnFeed = (pathname === '/' || pathname === '/index') && !swiped;
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

  // A hit timed by a live session of yours (Start to Finish) is that session's to log: never asked about as well.
  const due = enabled && currentUserId && asked && flags ? dueHits(recent, { me: currentUserId, sessions, activities: detectedActivities, flags, asked, live: liveSession, now }) : [];
  const clear = enabled && curtainDown && !touring && !uploading && !isBusy(pathname) && !waitOnFeed;
  const first = due[0];

  // A page to write or post opened (or the tutorial) while it is up: it steps aside, never sitting over the Create box.
  useEffect(() => {
    if (!clear && showing.current && toastId.current !== null) withdrawToast(toastId.current);
  }, [clear]);

  useEffect(() => {
    if (!clear || !first || !currentUserId || !flags || showing.current) return undefined;
    const ids = due.map((h) => h.id);
    const t = setTimeout(() => {
      // Another note is up (such as "You're open to hit · Off the map until
      // Location is on"): it is not pushed away; asked again a little later.
      if (toastShowing()) { setRetry((n) => n + 1); return; }
      showing.current = true;
      const prefill = prefillFor(first, currentUserId, users);
      keepHitPrefill(prefill);
      // Your tracker's copy of the same game, waiting to be logged: that is the one logged, filled in from the hit.
      const tracked = trackerFor(first, { me: currentUserId, activities: detectedActivities, flags });
      const params = tracked ? { activity: tracked.id, hit: first.id } : { hit: first.id };
      // With your tracker's copy, the composer (post it, or just log it); without, the log sheet.
      const open = () => router.push({ pathname: tracked ? '/compose' : '/log-session', params });
      // The one it was with (the hit's host, or the first who joined): their picture leads the card.
      const withId = prefill.playerIds[0];
      const other = withId ? users.find((u) => u.id === withId) : undefined;
      const place = shortPlace(prefill.place);
      toastId.current = showToast({
        title: prefill.who ? `How was the hit with ${prefill.who}?` : `How was the hit at ${place}?`,
        ...(other ? { look: LOOK, person: { name: other.name, seed: other.avatarSeed, uri: other.avatarUrl } } : {}),
        // With your tracker's copy it carries what "Tennis detected" would have
        // said (the two arrive together, and this one takes its place): the
        // session's mark and its numbers, yours alone.
        ...(tracked
          ? { glyph: 'session' as const, body: [duration(tracked.minutes), tracked.maxHr ? `${tracked.maxHr} max bpm` : null, pickSource({ type: 'tracker', activity: tracked })].filter(Boolean).join(' · ') }
          : { icon: 'hit' as const, ...(prefill.who ? { body: place } : {}) }),
        href: tracked ? `/compose?activity=${tracked.id}&hit=${first.id}` : `/log-session?hit=${first.id}`,
        action: { label: 'Log it', onPress: open },
        // The card above the tab bar offers the other answer too: no game to log, so it is not asked again.
        ...(LOOK === 'banner' ? { secondary: { label: 'Skip', onPress: () => undefined } } : {}),
        holdMs: HOLD_MS,
        // Under the title row, not over it: titles, the bell and the Feed's group tabs stay in sight and tappable.
        belowTop: true,
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
