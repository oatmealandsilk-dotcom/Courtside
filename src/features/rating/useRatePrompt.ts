import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { notKnownAdult } from '@/features/players/age';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { askForRating, canAskForRating } from './rateApp';

/** A session logged just now, once there are this many in your log. */
const SESSIONS_NEEDED = 3;
/** A new like from someone else, once this many of your posts have been liked. */
const LIKED_POSTS_NEEDED = 2;
/** A session made in the last five minutes was logged just now, not loaded from before. */
const FRESH_MS = 5 * 60_000;
/** What arrives in the first stretch after the app has loaded is what was already there (a saved copy, then the server's). */
const SETTLE_MS = 15_000;
/** After the moment, a beat for the sheet to close and the page to settle. */
const PAUSE_MS = 2_000;
/** A moment that has not reached a calm page by now has passed. */
const STALE_MS = 2 * 60_000;

/**
 * When to ask for a rating (Oct 5, build 15; rateApp.ts asks). Mounted once,
 * in AppShell. A happy moment is either:
 *
 * - a session you just logged, once your log holds 3 or more, or
 * - a new like from someone else on one of your posts, once 2 or more of
 *   your posts have been liked by others.
 *
 * Then, once a calm page is in front (`calm`: past sign-up, the tutorial,
 * the splash, and not a composer, a sheet or a camera), a two-second
 * pause, and the phone's own rating box. Never while setting up
 * (onboardingComplete), never in a browser or on a build without the box,
 * and only for players known to be adults: nothing in Apple's or Google's
 * rules forbids asking a teen, but CourtSide keeps teens out of every
 * unprompted ask. At most once per open of the app, and once in 60 days on
 * a phone (rateApp.ts); Apple adds its own three-a-year limit on top.
 */
export function useRatePrompt({ calm }: { calm: boolean }) {
  const { currentUserId, currentUser, onboardingComplete, remoteLoaded, sessions, posts } = useApp();
  const [able] = useState(canAskForRating);
  const loaded = !!currentUserId && onboardingComplete && (remoteLoaded || !isSupabaseConfigured);
  const teen = !!currentUser && notKnownAdult(currentUser);
  const asked = useRef(false);
  // What was there last time: your sessions, and how many others had liked each of your posts.
  const seen = useRef<{ user: string; since: number; sessions: Set<string>; likes: Map<string, number> } | null>(null);
  // When the last happy moment was (0: none waiting).
  const [moment, setMoment] = useState(0);

  useEffect(() => {
    if (!able || !loaded || !currentUserId || asked.current) return;
    const now = Date.now();
    const mine = sessions.filter((s) => s.userId === currentUserId);
    const likes = new Map(posts
      .filter((p) => p.authorId === currentUserId && !p.archived && !p.removed)
      .map((p) => [p.id, p.likedBy.filter((id) => id !== currentUserId).length] as const));
    const was = seen.current;
    seen.current = { user: currentUserId, since: was?.user === currentUserId ? was.since : now, sessions: new Set(mine.map((s) => s.id)), likes };
    if (!was || was.user !== currentUserId || now - was.since < SETTLE_MS) return;
    const justLogged = mine.length >= SESSIONS_NEEDED
      && mine.some((s) => !was.sessions.has(s.id) && now - Date.parse(s.createdAt) < FRESH_MS);
    const liked = [...likes.values()].filter((n) => n > 0).length;
    const newLike = liked >= LIKED_POSTS_NEEDED
      && [...likes].some(([id, n]) => was.likes.has(id) && n > (was.likes.get(id) ?? 0));
    if (justLogged || newLike) setMoment(now);
  }, [able, loaded, currentUserId, sessions, posts]);

  useEffect(() => {
    if (!moment || asked.current || !calm || !loaded) return undefined;
    if (teen || Date.now() - moment > STALE_MS) { setMoment(0); return undefined; }
    const timer = setTimeout(() => {
      // Only with the app in front: Apple's box needs a window to show in.
      if (AppState.currentState !== 'active') return;
      asked.current = true;
      setMoment(0);
      void askForRating();
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [moment, calm, loaded, teen]);
}
