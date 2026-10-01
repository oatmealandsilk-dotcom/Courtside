import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Post, User } from '@/data/types';
import { sameCourt } from '@/features/places/court';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useStillLoading } from '@/lib/useStillLoading';
import { useApp } from '@/store/AppContext';

/**
 * Posts by a teen account stay off court pages unless it is you or someone
 * you follow: gathering posts by place would show where a minor regularly
 * plays to anyone browsing that court. The map never shows a teen's spot
 * either. With the database, an account with no age set counts as a minor,
 * as the database's own rules treat it. (William's call; the database
 * version is a separate decision.)
 */
const HIDE_TEENS = true;

export type CourtPostsStatus = 'loading' | 'ready' | 'failed';

/**
 * Everything posted at one court, newest first, for its page, its reel and
 * the map's card, so all three show the same posts in the same order. The
 * list is read from the app's own posts, not from the fetch: a post of yours
 * appears once it lands, an archived or deleted one leaves at once, and
 * likes stay live. The database already hides archived, removed, blocked and
 * private-not-followed posts; this adds muted people, blocking in the demo,
 * and the teen rule above.
 */
export function useCourtPosts(place: { id?: string; lat: number; lng: number } | null) {
  const { posts, users, blockedIds, mutedIds, followingIds, currentUserId, actions } = useApp();
  const key = place ? `${place.lat.toFixed(4)},${place.lng.toFixed(4)}` : '';
  const at = useRef(place);
  at.current = place;
  const [status, setStatus] = useState<CourtPostsStatus>(place ? 'loading' : 'ready');
  // Which court the status is about: a court that only just became known (a bare
  // link, once the posts are in) reads as loading until its own first page is.
  const [statusKey, setStatusKey] = useState(key);
  const [more, setMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // A link opened cold: nothing is asked, and nothing is "ready", until the account's data is in.
  const stillLoading = useStillLoading();

  useEffect(() => {
    const spot = at.current;
    if (!spot || stillLoading) return;
    let on = true;
    setStatus('loading');
    actions.loadCourtPage({ lat: spot.lat, lng: spot.lng }, 'first').then(
      (got) => { if (on) { setMore(got.more); setStatus('ready'); setStatusKey(key); } },
      () => { if (on) { setStatus('failed'); setStatusKey(key); } },
    );
    return () => { on = false; };
  }, [key, actions, stillLoading, currentUserId]);

  const list = useMemo(() => {
    if (!place) return [];
    const byId = new Map<string, User>(users.map((u) => [u.id, u]));
    const hidden = new Set([...blockedIds, ...mutedIds]);
    const following = new Set(followingIds);
    const seeable = (p: Post) => {
      const author = byId.get(p.authorId);
      // A post whose author is not loaded cannot draw in the reel; leaving it out here keeps tile N on page N.
      if (!author || hidden.has(author.id)) return false;
      const mineOrFollowed = author.id === currentUserId || following.has(author.id);
      if (author.isPrivate && !mineOrFollowed) return false;
      const minor = isSupabaseConfigured ? author.ageGroup !== 'adult' : author.ageGroup === 'teen';
      if (HIDE_TEENS && minor && !mineOrFollowed) return false;
      return true;
    };
    return posts
      .filter((p) => !!p.court && !p.archived && sameCourt(p.court, place) && seeable(p))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [posts, users, blockedIds, mutedIds, followingIds, currentUserId, place?.id, place?.lat, place?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = useCallback(async () => {
    const spot = at.current;
    if (!spot || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const got = await actions.loadCourtPage({ lat: spot.lat, lng: spot.lng }, 'older');
      if (alive.current) setMore(got.more);
    } catch { /* the link stays, to try again */ } finally {
      if (alive.current) setLoadingOlder(false);
    }
  }, [actions, loadingOlder]);

  /** A pull, or Try again: the newest page asked for afresh. */
  const refresh = useCallback(async () => {
    const spot = at.current;
    if (!spot) return;
    setStatus((s) => (s === 'failed' ? 'loading' : s));
    try {
      const got = await actions.loadCourtPage({ lat: spot.lat, lng: spot.lng }, 'fresh');
      if (alive.current) { setMore(got.more); setStatus('ready'); }
    } catch {
      if (alive.current) setStatus((s) => (s === 'ready' ? s : 'failed'));
    }
  }, [actions]);

  const shown: CourtPostsStatus = !place ? 'ready' : stillLoading || statusKey !== key ? 'loading' : status;
  return { posts: list, status: shown, more, loadingOlder, loadOlder, refresh };
}
