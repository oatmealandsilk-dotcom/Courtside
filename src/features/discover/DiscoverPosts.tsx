import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { Post } from '@/data/types';
import { PaneScroller, type PaneList, type PaneScrollerProps } from '@/components/ui/PaneScroller';
import { useGalleryInPage, type FeedSlot, type InPageRow } from '@/features/activity/feedLooks/ActivitiesList';
import { reachable, unfinishedClip } from '@/features/activity/feedLooks/galleryPosts';
import { sessionOnly } from '@/features/activity/format';
import { demotedPosts } from '@/features/feed/demoted';
import { feedScores, loadFeedScores } from '@/features/feed/feedScores';
import { rankFeed } from '@/features/feed/rankFeed';
import { seenOnPhone } from '@/features/feed/seenPosts';
import { useApp } from '@/store/AppContext';

/*
 * PICTURES ONLY (Nov 28, owner: "we can have one page be posts, which is like an instagram scroll which isnt weighted
 * towards the bottom, and we can see videos photos etc much like instagram. if you click into the videos though it will
 * be like the instagram style, like how our current wieghted scroll is"; branch design/home-discover).
 *
 * Discover → Posts: everyone's posts the way For you picks them (shared with everyone, not group-only, taken down or
 * archived; media the internet can reach; nobody blocked, muted or private you don't follow), in For you's order, as one
 * continuous scroll (never paged or snapping) in the gallery's card language: the header, the picture at 4:5 (a clip's
 * cover with its play mark), the actions row and the caption; a text post as its words. A clip opens the full-screen reel
 * (For you's weighted swipe, clips only) on that clip, and back lands on the same spot; a photo opens full screen.
 */

const NO_SLOTS: FeedSlot[] = [];
const NO_ROWS: InPageRow[] = [];

/** For you's own rule for what it may deal (the Feed's `forYou`), plus the people rules every feed keeps. */
function useDiscoverPosts(deal: number): { list: Post[]; ready: boolean } {
  const { ready, posts, users, comments, followingIds, followEdges, blockedIds, blockedMeIds, mutedIds, currentUserId } = useApp();
  const shown = useMemo(() => {
    const follows = new Set(followingIds);
    const hidden = new Set([...blockedIds, ...blockedMeIds, ...mutedIds]);
    const unfollowedPrivate = new Set(users.filter((u) => u.isPrivate && u.id !== currentUserId && !follows.has(u.id)).map((u) => u.id));
    return posts.filter((p) => reachable(p) && !p.groupId && !p.removed && !p.archived && !sessionOnly(p)
      && !hidden.has(p.authorId) && !unfollowedPrivate.has(p.authorId) && !unfinishedClip(p, currentUserId));
  }, [posts, users, followingIds, blockedIds, blockedMeIds, mutedIds, currentUserId]);
  // The ranking's scores asked for once the posts are in and again on each pull (an effect, never inside the render).
  useEffect(() => { if (ready) void loadFeedScores({ userId: currentUserId }); }, [ready, deal, currentUserId]);
  // Dealt once (and again on a pull), as For you is: a like or a page arriving never reshuffles what is on screen;
  // posts that reach the phone later go on at the end. (rankFeed puts people you follow first: closeness +6, and +3
  // when they follow you back, so friends' photos are lifted here too.) Keyed on the deal only, on purpose.
  const order = useMemo(() => (ready
    ? rankFeed(shown, [], comments, currentUserId, [], { followingIds, followEdges, users, seen: new Set(), seenOnPhone: seenOnPhone(currentUserId), scores: feedScores(), demoted: demotedPosts() })
      .flatMap((i) => (i.type === 'post' ? [i.post.id] : []))
    : null), [ready, deal]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const byId = new Map(shown.map((p) => [p.id, p]));
    const dealt = order ?? [];
    const inDeal = new Set(dealt);
    const later = shown.filter((p) => !inDeal.has(p.id)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return [...dealt.flatMap((id) => byId.get(id) ?? []), ...later];
  }, [shown, order]);
  return { list, ready };
}

/** Discover's Posts section: a PaneScroller (its own place, pull to refresh) whose rows are the posts. */
export function DiscoverPosts({ paused, onRefresh, ...pane }: Omit<PaneScrollerProps, 'list' | 'children'> & { paused: boolean }) {
  const [deal, setDeal] = useState(0);
  const { list, ready } = useDiscoverPosts(deal);
  const feed = useGalleryInPage({ posts: list, rollup: false, nearCount: 0, paused, postsIn: ready, start: null, slots: NO_SLOTS, everything: true, sim: 'dclip' });
  const { reopen } = feed;
  const pull = useMemo(() => (onRefresh ? async () => { try { return await onRefresh(); } finally { setDeal((n) => n + 1); reopen(); } } : undefined), [onRefresh, reopen]);
  const rows: PaneList<InPageRow> = { data: ready ? feed.data : NO_ROWS, renderItem: feed.renderItem, keyExtractor: feed.keyExtractor, onEndReached: feed.onEndReached, onViewableItemsChanged: feed.onViewableItemsChanged, viewabilityConfig: feed.viewabilityConfig };
  // The section's own top is empty: the gallery's first card brings its own band and air.
  return <><PaneScroller {...pane} onRefresh={pull} list={rows}><View /></PaneScroller>{feed.viewerNode}</>;
}
