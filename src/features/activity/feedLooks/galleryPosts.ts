import { useEffect, useMemo, useRef, useState } from 'react';

import type { Post } from '@/data/types';
import { useConnectRow } from '@/features/activity/autoLog';
import { hasSessionStats } from '@/features/activity/format';
import { START_UNDER, useNearYouAuthors } from '@/features/activity/nearYou';
import { demotedPosts, onDemotedChange } from '@/features/feed/demoted';
import { sinkDemoted } from '@/features/feed/rankFeed';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { hasPicture } from './ActivitiesList';

/*
 * Which posts the Activities gallery shows, in one place for the two pages that show it: the Feed's Activities
 * (ACTIVITIES_LOOK 'gallery' or 'gallery-rollup') and, in the iPhone app, the friends' activity under the Community map
 * (HOME_LOOK 'map-feed', features/community/communityMapLook). Same people, same rules, same order on both.
 */

/** Media the internet can reach: a file:// link only ever worked on the phone that made it. Every photo of a carousel too. */
export const reachable = (p: { imageUrl?: string; videoUrl?: string; imageUrls?: string[] }) => [p.imageUrl, p.videoUrl, ...(p.imageUrls ?? [])].every((u) => !u || /^(https?:|data:|blob:)/.test(u));

/**
 * A clip whose video never finished uploading (no video, no picture): to
 * anyone but its author it would only be a grey box, so only its author sees
 * it. The demo's stand-in clips are drawn as court cards on purpose and stay.
 */
export const unfinishedClip = (p: Post, me: string | null | undefined) =>
  isSupabaseConfigured && p.kind === 'clip' && !p.videoUrl && !p.imageUrl && !p.imageUrls?.length && p.authorId !== me;

/**
 * One for Activities as a gallery (Nov 28): every kind of post from the same people Activities draws from (you, who you
 * follow, and only the sessions of a new player's players near them), on the same rules (not archived, taken down or
 * group-only, media the internet can reach); a session by someone else only with a photo or clip.
 * Your own sessions without one stay (the list shows them to you alone, as a row). With `rollup` ('gallery-rollup') a
 * session without one by someone you follow stays too, exactly those the Activities pages take (its numbers), for the
 * day's "who played" row; a near player's (not followed) never does.
 */
export const inActivitiesGallery = (p: Post, me: string | null | undefined, follows: Set<string>, near: Set<string>, rollup: boolean) =>
  !p.archived && !p.removed && !p.groupId && reachable(p) && (p.authorId === me || follows.has(p.authorId) || (near.has(p.authorId) && !!p.session))
  && (!p.session || p.authorId === me || hasPicture(p) || (rollup && follows.has(p.authorId) && hasSessionStats(p.session)));

/**
 * The gallery's posts and its start: the same people and rules as Home's Activities (blocked, whoever blocked you,
 * muted, unfollowed private, taken down, group-only, archived and unfinished posts left out; newest first; an admin's
 * pushed-down ones last) and the same start for a new player (the follow suggestions, and the sessions near them asked
 * for once). The list decides what it draws of them. A session without a photo by someone else that an admin pushed
 * down is left out altogether: with `rollup` it would otherwise join its day's "who played" row, up where that day is.
 */
export function useGalleryPosts(rollup: boolean) {
  const { ready, posts, users, followingIds, blockedIds, blockedMeIds, mutedIds, currentUserId, actions } = useApp();
  const nearAuthors = useNearYouAuthors(true);
  const connectRow = useConnectRow();
  // Decided once, as Home's Activities decides its start page: a new player, or a watch still to connect. Once
  // there it stays, so following your fifth player from it never pulls it out from under you.
  const startKept = useRef(false);
  if (!startKept.current && ready && (followingIds.length < START_UNDER || (connectRow.known && connectRow.offer))) startKept.current = true;
  const showStart = startKept.current;
  const askedNear = useRef(false);
  useEffect(() => {
    if (!showStart || askedNear.current) return;
    askedNear.current = true;
    void actions.loadRecentSessionPosts();
  }, [showStart, actions]);
  const [demotedTick, setDemotedTick] = useState(0);
  useEffect(() => onDemotedChange(() => setDemotedTick((n) => n + 1)), []);
  const list = useMemo(() => {
    const follows = new Set(followingIds);
    // Whoever blocked you too (the server keeps their posts from you already; this list never relies on it).
    const hidden = new Set([...blockedIds, ...blockedMeIds, ...mutedIds]);
    const unfollowedPrivate = new Set(users.filter((u) => u.isPrivate && u.id !== currentUserId && !follows.has(u.id)).map((u) => u.id));
    const down = demotedPosts();
    const acts = posts
      .filter((p) => inActivitiesGallery(p, currentUserId, follows, nearAuthors, rollup) && !hidden.has(p.authorId) && !unfollowedPrivate.has(p.authorId) && !unfinishedClip(p, currentUserId)
        && !(down.has(p.id) && !!p.session && p.authorId !== currentUserId && !hasPicture(p)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const byKey = new Map(acts.map((p) => [`p:${p.id}`, p]));
    return sinkDemoted(acts.map((p) => `p:${p.id}`), down).flatMap((k) => byKey.get(k) ?? []);
  }, [rollup, posts, users, followingIds, blockedIds, blockedMeIds, mutedIds, currentUserId, nearAuthors, demotedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearCount = useMemo(() => list.filter((p) => nearAuthors.has(p.authorId)).length, [list, nearAuthors]);
  return { list, showStart, nearCount, nearAuthors, ready };
}
