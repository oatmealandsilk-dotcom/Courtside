import { useEffect, useMemo, useRef, useState } from 'react';

import type { Post } from '@/data/types';
import { useConnectRow } from '@/features/activity/autoLog';
import { hasSessionStats } from '@/features/activity/format';
import { START_UNDER, useNearYouAuthors } from '@/features/activity/nearYou';
import { demotedPosts, onDemotedChange } from '@/features/feed/demoted';
import { sinkDemoted } from '@/features/feed/rankFeed';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useApp } from '@/store/AppContext';
import { isGalleryLook, type ActivitiesLook } from './activitiesLook';

/** Media the internet can reach: a file:// link only ever worked on the phone that made it. Every photo of a carousel too. */
export const reachable = (p: { imageUrl?: string; videoUrl?: string; imageUrls?: string[] }) => [p.imageUrl, p.videoUrl, ...(p.imageUrls ?? [])].every((u) => !u || /^(https?:|data:|blob:)/.test(u));

/**
 * One for Activities: a session with its numbers, yours or by someone you follow, out on the feed (not archived, taken down or group-only).
 * For a new player (following fewer than five), also one by a player near them (`near`, features/activity/nearYou), marked "Near you".
 */
export const isActivity = (p: Post, me: string | null | undefined, follows: Set<string>, near: Set<string>) =>
  !p.archived && !p.removed && !p.groupId && reachable(p) && !!p.session && hasSessionStats(p.session) && (p.authorId === me || follows.has(p.authorId) || near.has(p.authorId));

/**
 * One for Activities in the classic look (owner, Nov 27: "the instagram feed which has activities, pictures. regular
 * posts. and videos"): every kind of post from the same people Home's Activities draws from (you, who you follow, and
 * for a new player the players near them), with the same rules (not archived, taken down or group-only, media the
 * internet can reach). Sessions, pictures, text posts and clips alike.
 */
export const inClassicActivities = (p: Post, me: string | null | undefined, follows: Set<string>, near: Set<string>) =>
  !p.archived && !p.removed && !p.groupId && reachable(p) && (p.authorId === me || follows.has(p.authorId) || near.has(p.authorId));

/**
 * A clip whose video never finished uploading (no video, no picture): to
 * anyone but its author it would only be a grey box, so only its author sees
 * it. The demo's stand-in clips are drawn as court cards on purpose and stay.
 */
export const unfinishedClip = (p: Post, me: string | null | undefined) =>
  isSupabaseConfigured && p.kind === 'clip' && !p.videoUrl && !p.imageUrl && !p.imageUrls?.length && p.authorId !== me;

/**
 * The posts an Activities look shows, in order, and its start: the same posts as Home's Activities (newest first, an
 * admin's pushed-down ones last, blocked, muted, unfollowed private and unfinished ones left out), the gallery and mixed
 * looks holding every kind of post (inClassicActivities), the others sessions only (isActivity).
 * The start (a new player's "Follow more players", or a watch still to connect) is decided once, as Home's Activities
 * decides its start page. Shared by the Feed's Activities and the map-then-activity picture (homePreview).
 */
export function useActivitiesFeed(look: Exclude<ActivitiesLook, 'now'>) {
  const app = useApp();
  const { ready, posts, users, followingIds, blockedIds, mutedIds, currentUserId, actions } = app;
  const nearAuthors = useNearYouAuthors(true);
  const connectRow = useConnectRow();
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
  const every = look === 'classic' || look === 'mixed-a' || look === 'mixed-b' || look === 'mixed-a2' || isGalleryLook(look);
  const list = useMemo(() => {
    const follows = new Set(followingIds);
    const hidden = new Set([...blockedIds, ...mutedIds]);
    const unfollowedPrivate = new Set(users.filter((u) => u.isPrivate && u.id !== currentUserId && !follows.has(u.id)).map((u) => u.id));
    const acts = posts
      // The mixed looks hold every kind of post, as the classic one.
      .filter((p) => (every ? inClassicActivities(p, currentUserId, follows, nearAuthors) : isActivity(p, currentUserId, follows, nearAuthors)) && !hidden.has(p.authorId) && !unfollowedPrivate.has(p.authorId) && !unfinishedClip(p, currentUserId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const byKey = new Map(acts.map((p) => [`p:${p.id}`, p]));
    return sinkDemoted(acts.map((p) => `p:${p.id}`), demotedPosts()).flatMap((k) => byKey.get(k) ?? []);
  }, [every, posts, users, followingIds, blockedIds, mutedIds, currentUserId, nearAuthors, demotedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const nearCount = list.filter((p) => nearAuthors.has(p.authorId)).length;
  return { list, showStart, nearCount, nearAuthors };
}
