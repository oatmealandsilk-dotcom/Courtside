import { asTabRoute } from '@/features/navigation/tabFocus';
import { ThreadReplies } from '@/components/ThreadReplies';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PinchZone } from '@/components/PinchZone';
import Reanimated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import * as haptics from '@/lib/haptics';

import { Avatar, Button, EmptyState } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { QuestionCard } from '@/components/QuestionCard';
import { PostCard } from '@/components/PostCard';
import { BrandMark } from '@/components/BrandMark';
import { Heart } from '@/components/Heart';
import { LANE_INSET, MediaPostPage } from '@/components/MediaPostPage';
import { Tappable } from '@/components/Tappable';
import { VerticalPager, type VerticalPagerHandle } from '@/components/VerticalPager';
import { subscribeScrollToTop } from '@/features/navigation/scrollToTop';
import { setFeedWarm, useCurtainDown } from '@/features/feed/warmup';
import { subscribeFeedRefresh } from '@/features/feed/feedBus';
import { BAR_DUCK_PX, setBarCompact } from '@/features/navigation/barShrink';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { TipPage } from '@/components/TipPage';
import { isLive } from '@/features/stories/stories';
import { sourceUserIds } from '@/features/community/importedThreads';
import { ClipPlayback } from '@/components/ClipPlayback';
import { rankFeed, type FeedItem } from '@/features/feed/rankFeed';
import { lockPageSwipe } from '@/features/navigation/swipeLock';
import { relativeTime, timeLeft } from '@/lib/format';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichText } from '@/components/RichText';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { isDesktopBrowser } from '@/lib/browserDevice';
import { colors } from '@/theme';

/**
 * The heart that blooms when you double tap a clip.
 *
 * Keyed on a counter rather than a boolean so tapping twice in a row replays
 * it — a boolean would already be true and the second tap would show nothing.
 */
/**
 * Something that can be tapped away: it shrinks and fades in one short move,
 * then tells its page it is gone. The page decides how long to remember that.
 */
function TapAway({ onHidden, label, children, style }: { onHidden: () => void; label: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const gone = useSharedValue(0);
  const press = useSharedValue(0);
  const pop = useSharedValue(0);
  const hover = useSharedValue(0);
  // Touch down: it gives a hair, like a button. Release: a small lift, then
  // gone in one short fade-and-shrink — between a plain snap and a bounce.
  const anim = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ scale: (1 - 0.04 * press.value + 0.02 * pop.value + 0.04 * hover.value) * (1 - 0.2 * gone.value) }, { translateY: -3 * gone.value }],
  }));
  return (
    <Reanimated.View style={anim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={style}
        onHoverIn={() => { hover.value = withTiming(1, { duration: 120 }); }}
        onHoverOut={() => { hover.value = withTiming(0, { duration: 120 }); }}
        onPressIn={() => { haptics.untap(); press.value = withTiming(1, { duration: 50 }); }}
        onPressOut={() => { press.value = withTiming(0, { duration: 80 }); }}
        onPress={() => {
          pop.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 80 }));
          gone.value = withDelay(50, withTiming(1, { duration: 220 }, (finished) => { if (finished) runOnJS(onHidden)(); }));
        }}
      >{children}</Pressable>
    </Reanimated.View>
  );
}


function LikeBurst({ token }: { token: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!token) return;
    scale.setValue(0.5);
    opacity.setValue(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 12 }),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]),
    ]).start();
  }, [token, scale, opacity]);

  if (!token) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="heart" size={112} color="rgba(255,255,255,0.94)" />
      </Animated.View>
    </Animated.View>
  );
}

/** Show one player's things as a feed of their own: their clips, posts, or tagged posts. */
export interface FeedScope { userId: string; set: 'own' | 'clips' | 'tagged'; start?: string }

// On a phone — the app or a phone's browser — a vertical clip fills the whole
// page, edge to edge. The tall 9:16 box in the middle is for computer windows.
const phone = Platform.OS !== 'web' || !isDesktopBrowser();

/**
 * A hit's photo at its own shape. A tall one fills the page; a wide one (a
 * computer's camera, say) sits in a wide box across the middle rather than
 * being cropped down to a strip of it.
 */
function HitPicture({ uri }: { uri: string }) {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => { if (live) setWide(w > h); }, () => { if (live) setWide(false); });
    return () => { live = false; };
  }, [uri]);
  if (wide) {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', backgroundColor: '#000' }]}>
        <Image accessibilityIgnoresInvertColors source={{ uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="contain" />
      </View>
    );
  }
  return <Image accessibilityIgnoresInvertColors source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />;
}

function Home({ scope }: { previewSection?: string; scope?: FeedScope } = {}) {
  const styles = useThemedStyles(styleDefinitions);
  // The US Open ground is navy; the green wordmark sinks into it, white does not.
  const { theme } = useTheme();
  const app = useApp();
  const { posts, questions, comments, stories, users, currentUserId, saved, actions, ready, followingIds, mutedIds, blockedIds, conversations } = app;
  const currentUser = users.find((u) => u.id === currentUserId);
  const [active, setActive] = useState(0);

  // Pinch out on a clip or hit and everything but the picture goes away —
  // caption, buttons, wordmark, sound disc; pinch in brings it all back.
  const [immersive, setImmersive] = useState(false);
  const pager = useRef<VerticalPagerHandle>(null);
  useEffect(() => subscribeScrollToTop((tab) => { if (tab === '/') pager.current?.scrollToTop(); }), []);
  // Locking in has a feel to it: the picture gives a small push and settles
  // with a spring while the overlays sink away; locking out is the reverse.
  const immersion = useSharedValue(0);
  const punch = useSharedValue(1);
  const lock = (on: boolean) => {
    if (on === immersive) return;
    setImmersive(on);
    haptics.tap();
    if (on) setBarCompact(true);
    // One quick snap: the overlays go, the picture gives a short push and settles — no bounce.
    immersion.value = withTiming(on ? 1 : 0, { duration: 180 });
    punch.value = withSequence(withTiming(on ? 1.03 : 0.97, { duration: 80 }), withTiming(1, { duration: 110 }));
  };
  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - immersion.value, transform: [{ translateY: 14 * immersion.value }] }));
  // The wordmark and the thread logo can be tapped away, page by page: the
  // one you tapped goes; the next page still has its own.
  const [hiddenMarks, setHiddenMarks] = useState<Set<string>>(() => new Set());
  const hideMark = (key: string) => setHiddenMarks((prev) => new Set(prev).add(key));
  const pictureStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  useEffect(() => { setImmersive(false); immersion.value = 0; punch.value = 1; }, [active, immersion, punch]);
  const [visit, setVisit] = useState(0);
  const focused = useIsFocused();
  const latest = useRef(app);
  latest.current = app;
  const [order, setOrder] = useState<string[]>([]);

  // Re-rank when the session itself changes, not every time this screen regains
  // focus — otherwise stepping into a thread and back would reshuffle the feed
  // and throw you to the top.
  const rankedFor = useRef<string | null>(null);
  // Builds the page order from whatever is loaded; a pull-to-refresh asks for it again.
  const rerank = useCallback((remount = true) => {
      const data = latest.current;
      if (scope) {
        // One person's things, newest first, opened on the one that was tapped.
        const mine = data.posts
          .filter((p) => !p.archived && (scope.set === 'tagged' ? p.taggedUserIds?.includes(scope.userId) : p.authorId === scope.userId && (scope.set !== 'clips' || p.kind === 'clip')))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        setOrder(mine.map((p) => `p:${p.id}`));
        setActive(Math.max(0, mine.findIndex((p) => p.id === scope.start)));
        setVisit((v) => v + 1);
        return;
      }
      const ranked = rankFeed(data.posts, data.questions.filter((q) => !q.source), data.comments, data.currentUserId, data.stories.filter((st) => isLive(st))).flatMap((i) =>
        i.type === 'post' ? [`p:${i.post.id}`] : i.type === 'question' ? [`q:${i.question.id}`] : i.type === 'hit' ? [`h:${i.story.id}`] : [],
      );
      // Something of yours from the last few minutes goes first, so a fresh post is right there.
      const justMine = data.posts
        .filter((p) => p.authorId === data.currentUserId && !p.archived && Date.now() - Date.parse(p.createdAt) < 5 * 60_000)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((p) => `p:${p.id}`);
      setOrder([...justMine, ...ranked.filter((k) => !justMine.includes(k))]);
      setActive(0);
      if (remount) setVisit((v) => v + 1);
  }, [scope?.userId, scope?.set, scope?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(
    useCallback(() => {
      const stamp = `${ready}:${currentUserId}:${scope?.userId ?? ''}:${scope?.set ?? ''}`;
      if (rankedFor.current === stamp) return;
      rankedFor.current = stamp;
      rerank();
    }, [ready, currentUserId, scope?.userId, scope?.set, rerank]),
  );
  // A post of yours that just finished uploading: the feed starts over with it on top.
  useEffect(() => subscribeFeedRefresh(() => { if (!scope) rerank(); }), [scope, rerank]);
  // Pulling down on the first page fetches what is new and starts the feed over from the top.
  // Pull-to-refresh: fetch what is new, rank the pages again in place (the
  // pager is holding the feed down and brings it back itself), and give the
  // new first pages a short beat to draw before the feed comes back up.
  // The brand on a page that is not built or loaded yet. Built once, so the
  // dozens of held pages cost nothing when the feed re-renders on a tap.
  const holdMark = useMemo(() => <BrandMark size={72} />, []);
  const holdWord = useMemo(() => <Text style={styles.holdWord}>CourtSide</Text>, [styles]);
  const warmWaiters = useRef<(() => void)[]>([]);
  const firstReadyRef = useRef(false);
  const refreshFeed = useCallback(async () => {
    await actions.refresh();
    rerank(false);
    // Hold until the new first pages have their pictures in (six seconds at
    // most). Pages already loaded count straight away; nothing is unloaded.
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(t); resolve(); };
      const t = setTimeout(done, 6000);
      setTimeout(() => { if (firstReadyRef.current) done(); else warmWaiters.current.push(done); }, 80);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 240));
  }, [actions, rerank]);

  /**
   * People worth following, best first: anyone who has interacted with you
   * (liked or commented on your posts, or messaged you), then coaches, then
   * players from your city. Never anyone you already follow or have blocked.
   */
  const suggestions = useMemo(() => {
    if (!currentUserId) return [];
    const me = users.find((u) => u.id === currentUserId);
    const interacted = new Set<string>();
    for (const post of posts) {
      if (post.authorId === currentUserId) post.likedBy.forEach((id) => interacted.add(id));
      else if (post.likedBy.includes(currentUserId)) interacted.add(post.authorId);
    }
    for (const comment of comments) {
      const post = posts.find((p) => p.id === comment.postId);
      if (post?.authorId === currentUserId) interacted.add(comment.authorId);
    }
    for (const conversation of conversations) conversation.participantIds.forEach((id) => interacted.add(id));
    const city = (location: string) => location.split(',')[0].trim();
    return users
      .filter((u) => u.id !== currentUserId && !followingIds.includes(u.id) && !blockedIds.includes(u.id) && !sourceUserIds.includes(u.id))
      .map((user) => {
        const local = !!me && city(user.location) === city(me.location);
        const reason = interacted.has(user.id) ? 'Interacted with you'
          : user.isCoach ? 'Coach on CourtSide'
          : local ? `Plays in ${city(user.location)}`
          : 'Suggested for you';
        return { user, reason, score: (interacted.has(user.id) ? 2 : 0) + (local ? 1 : 0) + (user.isCoach ? 0.5 : 0) };
      })
      .sort((a, b) => b.score - a.score);
  }, [users, posts, comments, conversations, currentUserId, followingIds, blockedIds]);

  // Anything you post after the feed was ranked — a clip, a note, a hit —
  // goes right to the very top and the feed jumps there, so posting reads as
  // "it's up" instead of leaving you to scroll and find it.

  // Blocked and muted players disappear from the feed entirely.
  const feedItems = useMemo<FeedItem[]>(() => {
    const hidden = new Set([...blockedIds, ...mutedIds]);
    // A private account is only in your feed once they have let you follow.
    for (const u of users) if (u.isPrivate && u.id !== currentUserId && !followingIds.includes(u.id)) hidden.add(u.id);
    return order.flatMap<FeedItem>((key) => {
      const id = key.slice(2);
      if (key.startsWith('p:')) {
        const post = posts.find((p) => p.id === id);
        return post && !hidden.has(post.authorId) && !post.archived ? [{ type: 'post' as const, post }] : [];
      }
      if (key.startsWith('h:')) {
        // A hit leaves the feed the moment it expires or is put away.
        const story = stories.find((st) => st.id === id);
        return story && !hidden.has(story.authorId) && isLive(story) ? [{ type: 'hit' as const, story }] : [];
      }
      const question = questions.find((q) => q.id === id);
      return question && !hidden.has(question.authorId) ? [{ type: 'question' as const, question }] : [];
    });
  }, [order, posts, questions, stories, blockedIds, mutedIds, users, currentUserId, followingIds]);
  // While the app is young, a page a few swipes in asks early users for a tip.
  const feed = useMemo<FeedItem[]>(() => {
    if (scope || !feedItems.length) return feedItems;
    const at = Math.min(3, feedItems.length);
    return [...feedItems.slice(0, at), { type: 'tip' as const }, ...feedItems.slice(at)];
  }, [feedItems, scope]);

  /**
   * Which page carries the who-to-follow strip: the first thread or written
   * post past the opening clip, and only that one. It sits at the top of the
   * page, under the eyebrow, rather than riding along the bottom.
   */
  const suggestHost = useMemo(
    () => (scope ? -1 : feed.findIndex((item, index) => index >= 1 && (item.type === 'question' || (item.type === 'post' && item.post.kind !== 'clip')))),
    [feed, scope],
  );

  const suggestStrip = suggestions.length ? (
    <View style={styles.strip}>
      <View style={styles.stripHead}>
        <Text style={styles.stripTitle}>Players you might know</Text>
        <Text style={styles.stripSub}>Contacts, mutuals, interactions</Text>
      </View>
      {/* Its own sideways bar: nativeID keeps the page swipe off it. */}
      <ScrollView
        horizontal
        nativeID="who-to-follow"
        onTouchStart={() => lockPageSwipe(true)}
        onTouchEnd={() => lockPageSwipe(false)}
        onTouchCancel={() => lockPageSwipe(false)}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginHorizontal: -20 }}
        contentContainerStyle={styles.stripRow}
      >
        {suggestions.slice(0, 6).map(({ user, reason }) => (
          <View key={user.id} style={styles.stripCard}>
            <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.stripBody}>
              <Avatar name={user.name} seed={user.avatarSeed} size={40} ring={user.isCoach} />
              <Text style={styles.stripName} numberOfLines={1}>{user.name.split(' ')[0]}</Text>
              <Text style={styles.stripReason} numberOfLines={1}>{reason}</Text>
            </Pressable>
            <Tappable accessibilityLabel={`Follow ${user.name}`} onPress={() => actions.toggleFollow(user.id)} style={styles.stripFollow}>
              <Text style={styles.stripFollowText}>Follow</Text>
            </Tappable>
          </View>
        ))}
      </ScrollView>
    </View>
  ) : null;

  const insets = useSafeAreaInsets();
  const [burst, setBurst] = useState({ id: '', n: 0 });

  /**
   * Double tap only ever likes, the way every app that does this behaves —
   * tapping twice on something you already liked should not take it away.
   */
  // Whether it is liked is read at the moment of the tap, not from the
  // handler's closure: the players keep the first handler they were given,
  // and a second double tap through a stale one took the like away again.
  const likedNow = useRef({ posts, stories: app.stories, me: currentUserId });
  likedNow.current = { posts, stories: app.stories, me: currentUserId };
  const likeByTap = (postId: string, _alreadyLiked?: boolean) => {
    const { posts: all, me } = likedNow.current;
    const post = all.find((p) => p.id === postId);
    if (post && me && !post.likedBy.includes(me)) actions.toggleLike(postId);
    setBurst((b) => ({ id: postId, n: b.n + 1 }));
  };
  const likeHitByTap = (storyId: string, _alreadyLiked?: boolean) => {
    const { stories, me } = likedNow.current;
    const story = stories.find((s) => s.id === storyId);
    if (story && me && !story.likedBy.includes(me)) actions.toggleLikeStory(storyId);
    setBurst((b) => ({ id: storyId, n: b.n + 1 }));
  };
  const lastHitTap = useRef(0);

  // Pressable has no double tap, so count taps inside a short window.
  const lastTap = useRef({ id: '', at: 0 });
  const doubleTapFor = (postId: string, alreadyLiked: boolean) => () => {
    const now = Date.now();
    const quick = lastTap.current.id === postId && now - lastTap.current.at < 280;
    lastTap.current = quick ? { id: '', at: 0 } : { id: postId, at: now };
    if (quick) likeByTap(postId, alreadyLiked);
  };

  const share = (kind: 'post' | 'question', id: string) =>
    router.push(`/share?kind=${kind}&id=${id}`);

  /**
   * How many items either side of the current one stay mounted.
   *
   * Everything outside this becomes an empty page of the same height, so the
   * scrollbar and snap points are unchanged but the work per swipe stops
   * growing with the length of the feed. Two is enough that you never catch a
   * page mid-build, even swiping fast.
   */
  const WINDOW = 1;
  /** How many pages ahead stay mounted and buffering, so the feed is never caught out. */
  const AHEAD = 2;
  /** How many of those the curtain waits for on opening; the rest load in behind the feed. */
  const FIRST = 3;

  // The warm-up: the first seven pages load (a video's first seconds, a
  // photo, a thread's words) behind a curtain, which lifts when they are in
  // — or after six seconds, whichever is first. Only the main feed waits.
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());
  // A picture that failed counts as done too: nothing waits on it, and its cover lifts.
  const markReady = useCallback((id: string, _ok: boolean) => {
    setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);
  const [warmTimedOut, setWarmTimedOut] = useState(false);
  useEffect(() => {
    if (!ready || !feed.length || !(!isSupabaseConfigured || app.remoteLoaded)) return;
    const t = setTimeout(() => setWarmTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, [ready, feed.length, app.remoteLoaded]);
  const warmTargets = useMemo(() => feed.slice(0, FIRST).flatMap((item) => {
    if (item.type === 'hit') return item.story.videoUrl || item.story.imageUrl ? [item.story.id] : [];
    if (item.type === 'post') return item.post.videoUrl || item.post.imageUrl || item.post.thumbnailUrl ? [item.post.id] : [];
    return [];
  }), [feed]); // eslint-disable-line react-hooks/exhaustive-deps
  const warmDone = warmTargets.filter((id) => readyIds.has(id)).length;
  const firstReady = warmDone >= warmTargets.length;
  firstReadyRef.current = firstReady;
  // A pull-to-refresh holding the feed down is let go once the new first pages are in.
  useEffect(() => { if (firstReady && warmWaiters.current.length) { const w = warmWaiters.current; warmWaiters.current = []; w.forEach((fn) => fn()); } }, [firstReady]);
  const dataIn = !isSupabaseConfigured || app.remoteLoaded;
  const warmed = !!scope || warmTimedOut || (ready && dataIn && feed.length > 0 && warmDone >= warmTargets.length);
  // The shell keeps the splash curtain up until this says the first pages are in.
  useEffect(() => { if (warmed && !scope) setFeedWarm(true); }, [warmed, scope]);
  // Playback starts only once the splash curtain has actually left the
  // screen (it says so itself), a beat after — never while it is still
  // fading over the player.
  const curtainDown = useCurtainDown();
  const [playable, setPlayable] = useState(!!scope);
  useEffect(() => {
    if (scope) { setPlayable(true); return; }
    if (!warmed) { setPlayable(false); return; }
    // The curtain says when it is gone; if it never showed at all (the feed
    // opened from a link, say), playback starts after a short wait instead.
    const t = setTimeout(() => setPlayable(true), curtainDown ? 120 : 1500);
    return () => clearTimeout(t);
  }, [warmed, curtainDown, scope]);
  // Photos and clip covers are fetched outright; a page reports itself ready when its picture lands.
  useEffect(() => {
    for (const item of feed.slice(0, AHEAD)) {
      if (item.type === 'post' && !item.post.videoUrl) {
        const uri = item.post.imageUrl ?? item.post.thumbnailUrl;
        if (uri) Image.prefetch(uri).then(() => markReady(item.post.id, true)).catch(() => markReady(item.post.id, true));
      }
      if (item.type === 'hit' && !item.story.videoUrl && item.story.imageUrl) {
        Image.prefetch(item.story.imageUrl).then(() => markReady(item.story.id, true)).catch(() => markReady(item.story.id, true));
      }
    }
  }, [feed, markReady]);

  // Warm the covers on either side so a swipe never lands on a grey rectangle.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    for (const offset of [1, -1, 2]) {
      const item = feed[active + offset];
      const url = item?.type === 'post' ? item.post.thumbnailUrl : undefined;
      if (url) {
        const img = new window.Image();
        img.src = url;
      }
    }
  }, [active, feed]);

  // Whatever is settled on screen counts as watched, once per session.
  const showing = feed[active];
  // A clip or a hit fills the page with a picture; a written post or thread does not.
  const activeOnPicture = showing?.type === 'hit' || (showing?.type === 'post' && (showing.post.kind === 'clip' || !!showing.post.videoUrl || !!showing.post.imageUrl));
  useEffect(() => {
    if (!focused || !showing) return;
    // A hit counts as watched through the story viewer, not here.
    if (showing.type === 'hit' || showing.type === 'tip') return;
    actions.recordView(
      showing.type === 'post' ? 'post' : 'question',
      showing.type === 'post' ? showing.post.id : showing.question.id,
    );
  }, [focused, showing, actions]);

  // The last page of the main feed: a small congratulations for getting
  // there this early, a way to post, and a way back to the top.
  // Kept quiet on purpose: a dark page nobody is told about, found only by
  // scrolling all the way down.
  const endPage = (
    <View key="the-end" style={styles.endPage}>
      <View style={styles.endCard}>
        <Text style={styles.endEyebrow}>YOU FOUND IT</Text>
        <BrandMark size={40} />
        <Text style={styles.endTitle}>The bottom of CourtSide.</Text>
        <Text style={styles.endBody}>Almost nobody scrolls this far. You are one of the first people ever on here.</Text>
        <View style={styles.endDivider} />
        <Text style={styles.endSecret}>EARLY · №{String(feed.length).padStart(3, '0')}</Text>
        <Text style={styles.endHint}>Remember this page. It will mean something later.</Text>
      </View>
      <View style={styles.endActions}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/compose')} style={styles.endButton}><Text style={styles.endButtonText}>Leave something here</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => pager.current?.scrollToTop()} hitSlop={8}><Text style={styles.endBack}>↑ Back to the top</Text></Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {!ready || !feed.length ? (
        <EmptyState
          title={scope ? 'Nothing here yet' : ready ? 'Your court is quiet' : 'Loading your clips'}
          body={scope ? undefined : 'Use + to share a moment.'}
        />
      ) : (
        <View style={styles.viewer}>
          <VerticalPager ref={pager} key={visit} initialIndex={active} onIndex={setActive} onRefresh={scope ? undefined : refreshFeed} pullHeader={scope || !currentUser ? undefined : (
            <View style={styles.pullGreeting}>
              <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} />
              <Text style={styles.pullGreetingText}>{`${currentUser.name.split(' ')[0]}'s homepage`}</Text>
            </View>
          )}>
            {[...feed.map((item, index) => {
              const distance = Math.abs(index - active);
              const ahead = index - active;
              const pageKey = item.type === 'post' ? item.post.id : item.type === 'question' ? item.question.id : item.type === 'hit' ? item.story.id : 'tip';
              // Two pages behind and seven ahead stay built; the rest hold their slot.
              if (ahead < -WINDOW || ahead > AHEAD) {
                // A page not built yet holds its slot with the brand on it, so a
                // fast scroll lands on the mark (a post) or the name (a clip or thread).
                return <View key={pageKey} style={styles.holdPage}>{item.type === 'post' && item.post.kind !== 'clip' ? holdMark : holdWord}</View>;
              }
              // The same over a built page whose picture has not landed yet.
              const cover = (id: string, kind: 'mark' | 'word') => readyIds.has(id) ? null : <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.holdPage]}>{kind === 'mark' ? holdMark : holdWord}</View>;
              // The page behind and the seven ahead keep their video buffered, ready to play.
              const near = distance <= 1 || (ahead > 0 && ahead <= AHEAD);
              const strip = index === suggestHost ? suggestStrip : null;

              if (item.type === 'tip') return <TipPage key="tip" onSubmit={actions.submitTip} />;

              if (item.type === 'hit') {
                const story = item.story;
                const author = users.find((u) => u.id === story.authorId);
                if (!author) return <View key={story.id} />;
                const hitLiked = !!currentUserId && story.likedBy.includes(currentUserId);
                return (
                  <View key={story.id} style={styles.clip}>
                   <PinchZone onPinchOut={() => lock(true)} onPinchIn={() => lock(false)}><Reanimated.View style={[StyleSheet.absoluteFill, pictureStyle]}>
                    <View accessibilityLabel={`${author.name}'s hit`} style={styles.clipFrame}>
                      <View style={phone ? StyleSheet.absoluteFill : styles.clipPortrait}>
                        {story.videoUrl ? (
                          <ClipPlayback uri={story.videoUrl} poster={story.thumbnailUrl} active={focused && active === index && warmed && playable} preload={near} bare={immersive} onDoubleTap={() => likeHitByTap(story.id, hitLiked)} discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand} discPinned={index === 0 && !scope} onReady={(ok) => markReady(story.id, ok)} />
                        ) : (
                          // Two quick taps like a hit, the way they like a clip.
                          <Pressable accessibilityRole="image" accessibilityLabel={`${author.name}'s hit`} onPress={() => { const now = Date.now(); if (now - lastHitTap.current < 280) { lastHitTap.current = 0; likeHitByTap(story.id, hitLiked); } else lastHitTap.current = now; }} style={StyleSheet.absoluteFill}>
                            {story.imageUrl ? (
                              <HitPicture uri={story.imageUrl} />
                            ) : (
                              <MediaPlaceholder label={story.mediaLabel ?? 'Hit'} seed={story.id} portrait fill />
                            )}
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {burst.id === story.id ? <LikeBurst token={burst.n} /> : null}
                    <Reanimated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents={immersive ? 'none' : 'box-none'}>
                    <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.bottomFade} />
                    <View style={styles.caption}>
                      <Pressable accessibilityRole="link" onPress={() => router.push(author.id === currentUserId ? '/profile' : `/user/${author.id}`)} style={styles.author}>
                        <Avatar name={author.name} seed={author.avatarSeed} size={34} />
                        <Text style={styles.authorName}>@{author.handle}<Text style={styles.authorTime}> · {relativeTime(story.createdAt)}</Text></Text>
                      </Pressable>
                      <HitClock expiresAt={story.expiresAt} />
                      {story.caption ? <RichText numberOfLines={3} style={styles.body}>{story.caption}</RichText> : null}
                      <Text style={styles.swipeHint}>↑ Next moment   ·   ← Community</Text>
                    </View>
                    <View style={styles.actions}>
                      <Tappable accessibilityLabel={hitLiked ? 'Unlike hit' : 'Like hit'} onPress={() => actions.toggleLikeStory(story.id)} immediate scaleTo={0.78} style={styles.action}>
                        <Heart liked={hitLiked} size={36} style={styles.actionGlyph} />
                        <Text style={styles.actionLabel}>{story.likedBy.length}</Text>
                      </Tappable>
                      <Tappable accessibilityLabel="Hit comments" onPress={() => router.push({ pathname: '/comments', params: { kind: 'hit', id: story.id } })} scaleTo={0.78} style={styles.action}>
                        <Ionicons name="chatbubble-outline" size={33} color="white" style={styles.actionGlyph} />
                        <Text style={styles.actionLabel}>{story.commentIds.length}</Text>
                      </Tappable>
                      <Tappable accessibilityLabel="More options" onPress={() => router.push({ pathname: '/post-menu', params: { id: story.id, kind: 'hit' } })} scaleTo={0.78} style={styles.action}>
                        <Ionicons name="ellipsis-horizontal" size={30} color="white" style={styles.actionGlyph} />
                      </Tappable>
                    </View>
                    </Reanimated.View>
                   </Reanimated.View></PinchZone>
                    {story.videoUrl ? cover(story.id, 'word') : null}
                  </View>
                );
              }

              if (item.type === 'question') {
                const isSaved = saved.questionIds.includes(item.question.id);
                return (
                  <View key={item.question.id} style={[styles.article, styles.threadArticle, scope && styles.articleScoped]}>
                    <View style={styles.eyebrowRow}>
                      <Text style={styles.eyebrow}>FROM THE COMMUNITY</Text>
                      {hiddenMarks.has(item.question.id) ? <View style={{ width: 34, height: 34 }} /> : <TapAway label="Hide the CourtSide logo" onHidden={() => hideMark(item.question.id)} style={styles.threadMark}><BrandMark size={34} /></TapAway>}
                    </View>
                    {strip}
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <QuestionCard
                        showBody
                        brandCorner
                        question={item.question}
                        author={users.find((u) => u.id === item.question.authorId)}
                        answered={Boolean(item.question.acceptedAnswerId)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSaveQuestion(item.question.id)}
                        onShare={() => share('question', item.question.id)}
                        onPress={() => router.push(`/question/${item.question.id}`)}
                      />
                      <Pressable accessibilityRole="link" accessibilityLabel="Read full thread" onPress={() => router.push(`/question/${item.question.id}`)}>
                        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                          <ThreadReplies questionId={item.question.id} preview/>
                        </View>
                      </Pressable>
                    </View>
                    <Pressable accessibilityRole="link" onPress={() => router.push(`/question/${item.question.id}`)}>
                      <Text style={styles.hint}>Tap to read the full thread</Text>
                    </Pressable>
                  </View>
                );
              }

              const post = item.post;
              const author = users.find((u) => u.id === post.authorId);
              if (!author) return <View key={post.id} />;
              const isSaved = saved.postIds.includes(post.id);

              if (post.kind !== 'clip' && (post.imageUrl || post.videoUrl)) {
                // A photo or video post: the picture up top, the words and
                // buttons below it in the app's own type, like every other page.
                const liked = !!currentUserId && post.likedBy.includes(currentUserId);
                return (
                  <View key={post.id} style={styles.clip}>
                    <MediaPostPage
                      post={post}
                      author={author}
                      liked={liked}
                      saved={isSaved}
                      active={focused && active === index && warmed && playable}
                      preload={near}
                      topInset={insets.top + 66}
                      onDoubleTap={() => likeByTap(post.id, liked)}
                      onToggleLike={() => actions.toggleLike(post.id)}
                      onToggleSave={() => actions.toggleSavePost(post.id)}
                      onComment={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })}
                      onShare={() => share('post', post.id)}
                      onMore={() => router.push({ pathname: '/post-menu', params: { id: post.id } })}
                      discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand}
                      burst={burst.id === post.id ? <LikeBurst token={burst.n} /> : null}
                      onReady={(ok) => markReady(post.id, ok)}
                    />
                    {cover(post.id, 'mark')}
                  </View>
                );
              }

              if (post.kind !== 'clip') {
                return (
                  <View key={post.id} style={[styles.article, scope && styles.articleScoped]}>
                    {/* Inside one person's posts the feed label means nothing, and the back chevron wants the room. */}
                    {scope ? null : <Text style={styles.eyebrow}>
                      {post.kind === 'match' ? 'SET PLAY' : post.kind.toUpperCase()} · FOR YOU
                    </Text>}
                    {strip}
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <PostCard
                        post={post}
                        author={author}
                        liked={!!currentUserId && post.likedBy.includes(currentUserId)}
                        onToggleLike={() => actions.toggleLike(post.id)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSavePost(post.id)}
                        onShare={() => share('post', post.id)}
                        onComment={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })}
                        onPress={() => router.push(`/post/${post.id}`)}
                        onPressAuthor={() => router.push(`/user/${author.id}`)}
                      />
                    </View>
                    <Pressable accessibilityRole="link" onPress={() => router.push(`/post/${post.id}`)}>
                      <Text style={styles.hint}>Tap to view the full post</Text>
                    </Pressable>
                  </View>
                );
              }

              const liked = !!currentUserId && post.likedBy.includes(currentUserId);
              return (
                <View key={post.id} style={styles.clip}>
                 <PinchZone onPinchOut={() => lock(true)} onPinchIn={() => lock(false)}><Reanimated.View style={[StyleSheet.absoluteFill, pictureStyle]}>
                  {post.videoUrl ? (
                    // A clip keeps its own shape on every screen: a vertical clip is a
                    // tall box, a landscape one a wide box, centred, with the theme
                    // colour around it rather than black bars or a crop.
                    <View style={[styles.clipFrame, post.orientation === 'landscape' && { backgroundColor: '#000' }]}>
                      <View style={post.orientation === 'landscape' || phone ? StyleSheet.absoluteFill : styles.clipPortrait}>
                        <ClipPlayback
                          letterbox={post.orientation === 'landscape'}
                          uri={post.videoUrl}
                          poster={post.thumbnailUrl}
                          active={focused && active === index && warmed && playable}
                          preload={near}
                          onDoubleTap={() => likeByTap(post.id, liked)}
                          trimStart={post.trimStart}
                          trimEnd={post.trimEnd}
                          crop={post.crop}
                          silent={post.muted}
                          bare={immersive}
                          discInk={theme === 'us-open' ? '#FFFFFF' : colors.brand}
                          discPinned={index === 0 && !scope}
                          onReady={(ok) => markReady(post.id, ok)}
                        />
                      </View>
                    </View>
                  ) : post.thumbnailUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Double tap to like"
                      onPress={doubleTapFor(post.id, liked)}
                      style={StyleSheet.absoluteFill}
                    >
                      <Image
                        accessibilityIgnoresInvertColors
                        source={{ uri: post.thumbnailUrl }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Double tap to like"
                      onPress={doubleTapFor(post.id, liked)}
                      style={styles.preview}
                    >
                      <View style={styles.court}>
                        <View style={styles.net} />
                        <View style={styles.service} />
                      </View>
                      <Ionicons name="tennisball-outline" size={54} color={colors.court} />
                      <Text style={styles.previewTitle}>{post.mediaLabel}</Text>
                      <Text style={styles.previewNote}>
                        Demo preview · add a video link to play your own clip
                      </Text>
                    </Pressable>
                  )}

                  {burst.id === post.id ? <LikeBurst token={burst.n} /> : null}

                  <Reanimated.View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents={immersive ? 'none' : 'box-none'}>

                  <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.bottomFade} />

                  <View style={styles.caption}>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.push(`/user/${author.id}`)}
                      style={styles.author}
                    >
                      <Avatar name={author.name} seed={author.avatarSeed} size={34} />
                      <Text style={styles.authorName}>@{author.handle}<Text style={styles.authorTime}> · {relativeTime(post.createdAt)}{post.editedAt ? ' · Edited' : ''}{post.location ? ` · ${post.location}` : ''}</Text></Text>
                    </Pressable>
                    <RichText numberOfLines={3} style={styles.body}>
                      {post.body}
                    </RichText>
                    <Text style={styles.tags}>{post.tags.map(t=><Text key={t} accessibilityRole="link" onPress={()=>router.push({pathname:'/search',params:{q:`#${t}`}})}>#{t}{'  '}</Text>)}</Text>
                    <Text style={styles.swipeHint}>↑ Next moment   ·   ← Community</Text>
                  </View>

                  <View style={styles.actions}>
                    <Tappable
                      accessibilityLabel={liked ? 'Unlike clip' : 'Like clip'}
                      onPress={() => actions.toggleLike(post.id)}
                      immediate
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Heart liked={liked} size={36} style={styles.actionGlyph} />
                      <Text style={styles.actionLabel}>{post.likedBy.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Clip comments"
                      onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="chatbubble-outline" size={33} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel}>{post.commentIds.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Send this clip to someone"
                      onPress={() => share('post', post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="arrow-redo-outline" size={32} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel}>{post.shares ?? 0}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this clip'}
                      onPress={() => actions.toggleSavePost(post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={31} color="white" style={styles.actionGlyph} />
                      <Text style={styles.actionLabel}>{post.savedBy?.length ?? 0}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="More options"
                      onPress={() => router.push({ pathname: '/post-menu', params: { id: post.id } })}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="ellipsis-horizontal" size={30} color="white" style={styles.actionGlyph} />
                    </Tappable>
                  </View>
                  </Reanimated.View>
                 </Reanimated.View></PinchZone>
                  {post.videoUrl ? cover(post.id, 'word') : null}
                </View>
              );
            }).map((page, index) => {
              // The wordmark rides every full-screen moment — a clip or a hit —
              // inside its own page, so it leaves with that page as you swipe
              // instead of hanging in place and then vanishing. Written posts
              // and threads have their own eyebrow and go without.
              const item = feed[index];
              const media = item?.type === 'hit' || (item?.type === 'post' && (item.post.kind === 'clip' || !!item.post.imageUrl || !!item.post.videoUrl));
              // The fade only belongs on a real picture or video; the demo court cards do without.
              const picture = item?.type === 'hit'
                ? !!(item.story.imageUrl || item.story.videoUrl)
                : item?.type === 'post' && item.post.kind === 'clip' && !!(item.post.videoUrl || item.post.thumbnailUrl || item.post.imageUrl);
              if (!media && index !== 0) return page;
              const key = item?.type === 'post' ? item.post.id : item?.type === 'question' ? item.question.id : item?.type === 'hit' ? item.story.id : 'first';
              return (
                <React.Fragment key={key}>
                  {page}
                  {/* Over a picture the wordmark sits in a small pill of the theme's own
                      background, so it reads on anything without touching the picture. */}
                  {scope || hiddenMarks.has(key) || (immersive && index === active) ? null : <View pointerEvents="box-none" style={[styles.wordmarkOverlay, { top: insets.top + 24 }, !phone && item?.type === 'post' && item.post.kind !== 'clip' && styles.wordmarkLeft, media && picture && styles.clipMarkOverlay]}>
                    {/* A tap on the mark tucks it away for this page only. Over a clip or hit it is the
                        small mark at the top left, part of the picture; on a post, the wordmark. */}
                    {media && picture ? (
                      <TapAway label="Hide the CourtSide mark" onHidden={() => hideMark(key)} style={styles.markPill}>
                        <BrandMark size={30} color={theme === 'us-open' ? '#FFFFFF' : colors.brand} />
                      </TapAway>
                    ) : (
                      <TapAway label="Hide the CourtSide wordmark" onHidden={() => hideMark(key)}>
                        <Text style={[styles.wordmark, theme === 'us-open' && { color: '#FFFFFF' }]}>CourtSide</Text>
                      </TapAway>
                    )}
                  </View>}
                </React.Fragment>
              );
            }), ...(scope ? [] : [endPage])]}
          </VerticalPager>

          {scope ? (
            // The same plain chevron every other page has, white only when it sits over a picture.
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => goBack()} style={[styles.scopeBack, { top: insets.top + 10 }]}>
              <Ionicons name="chevron-back" size={22} color={activeOnPicture ? '#FFFFFF' : colors.text} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** "HIT · 22h left", ticking once a minute so it never reads stale. */
function HitClock({ expiresAt }: { expiresAt: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(id); }, []);
  return (
    <View style={styles.hitClock}>
      <Ionicons name="time-outline" size={13} color="white" />
      <Text style={styles.hitClockText}>HIT · {timeLeft(expiresAt)}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  scopeBack: { position: 'absolute', left: 12, padding: 6, zIndex: 6 },
  wordmarkOverlay: {
    // top comes from the safe-area inset at render; a fixed value put the
    // wordmark under the Dynamic Island on a phone.
    position: 'absolute', width: '100%',
    paddingHorizontal: 20, zIndex: 5, alignItems: 'center',
  },
  // On a computer a post sits at the left, so its wordmark lines up over it
  // rather than floating in the middle of the window.
  pullGreeting: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The mark sits at the far left of the gap, level with the greeting; the greeting and disc in the middle.
  pullGreetingText: { color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  wordmarkLeft: { alignItems: 'flex-start', paddingLeft: 12 + LANE_INSET },
  wordmark: {
    color: colors.brand, fontSize: 23, fontWeight: '800', letterSpacing: -0.3,
  },
  // Kept as a hook for anything the wordmark needs over video; the shadow that
  // used to live here was doing more harm than good.
  // Over a clip: the mark alone, top left, with the same soft shadow the caption wears.
  clipMarkOverlay: { alignItems: 'flex-start', paddingLeft: 34 },
  // The mark sits in the same pale pill the wordmark used to, the same one the sound disc wears.
  markPill: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.bg, opacity: 0.76, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, width: '100%', minHeight: 0 },
  clip: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  holdPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  holdWord: { fontSize: 34, fontWeight: '800', color: colors.brand, letterSpacing: -1 },
  clipFrame: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  clipPortrait: { height: '100%', aspectRatio: 9 / 16, maxWidth: '100%', overflow: 'hidden', backgroundColor: colors.bg },
  clipLandscape: { width: '100%', aspectRatio: 16 / 9, maxHeight: '100%', overflow: 'hidden', backgroundColor: '#000' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  court: {
    position: 'absolute',
    top: '15%',
    bottom: '25%',
    left: '12%',
    right: '12%',
    borderWidth: 1,
    borderColor: colors.court,
  },
  net: { position: 'absolute', top: '50%', height: 1, width: '100%', backgroundColor: colors.court },
  service: { position: 'absolute', top: '20%', bottom: '20%', left: '50%', width: 1, backgroundColor: colors.court },
  previewTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: '#203E2ACC',
    padding: 8,
  },
  previewNote: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 230,
    backgroundColor: '#203E2ACC',
  },
  caption: {
    position: 'absolute',
    bottom: BAR_DUCK_PX - 4,
    left: 0,
    right: 0,
    padding: 18,
    paddingBottom: 10,
    paddingRight: 70,
    backgroundColor: 'transparent',
    gap: 8,
  },
  author: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  hitClock: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)' },
  hitClockText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  authorName: { color: 'white', fontSize: 14, fontWeight: '700' },
  authorTime: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' },
  body: { color: 'white', fontSize: 13, lineHeight: 19 },
  tags: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  swipeHint: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 240 + BAR_DUCK_PX },
  actions: { position: 'absolute', right: 12, bottom: 82 + BAR_DUCK_PX, gap: 22 },
  action: { alignItems: 'center', gap: 4, minWidth: 48 },
  // Instagram's trick: plain white glyphs made bolder by a soft dark shadow
  // rather than a heavier icon, so they hold up over bright footage.
  actionGlyph: { textShadowColor: 'rgba(0, 0, 0, 0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  actionLabel: { color: 'white', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0, 0, 0, 0.55)', textShadowRadius: 4 },
  // The feed's pages hold their size while the bar ducks, so the bottom few
  // points can sit under a full-size bar: written pages keep that much clear.
  article: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64, paddingBottom: 32, gap: 20 },
  // In a scoped feed the back chevron has its own line above the words.
  articleScoped: { paddingTop: 116 },
  strip: { gap: 6, paddingBottom: 4 },
  stripHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  stripTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  stripSub: { fontSize: 11, color: colors.textFaint },
  stripRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  stripCard: {
    width: 104,
    padding: 8,
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stripBody: { alignItems: 'center', gap: 3 },
  stripName: { fontSize: 12, fontWeight: '700', color: colors.text },
  stripReason: { fontSize: 10, color: colors.textMuted },
  stripFollow: { paddingVertical: 5, borderRadius: 999, backgroundColor: colors.brand, alignItems: 'center' },
  stripFollowText: { color: colors.brandInk, fontSize: 12, fontWeight: '700' },
  threadArticle: { gap: 8, paddingBottom: 20 },
  eyebrow: { color: colors.warning, fontWeight: '700', letterSpacing: 1.2, fontSize: 11 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threadMark: { marginRight: 6, marginTop: 6 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 10 },
  // The theme's own colours, so the page belongs to whichever look is on.
  endPage: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 22, padding: 28 },
  endCard: { alignSelf: 'stretch', alignItems: 'center', gap: 12, padding: 26, borderRadius: 22, borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.surface },
  endEyebrow: { color: colors.brand, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  endTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  endBody: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  endDivider: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: 4 },
  endSecret: { color: colors.brand, fontSize: 13, fontWeight: '700', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  endHint: { color: colors.textFaint, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },
  endActions: { alignSelf: 'stretch', alignItems: 'center', gap: 16 },
  endButton: { alignSelf: 'stretch', paddingVertical: 14, borderRadius: 999, backgroundColor: colors.brand, alignItems: 'center' },
  endButtonText: { color: colors.brandInk, fontWeight: '800', fontSize: 15 },
  endBack: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
});

export default asTabRoute<{ previewSection?: string; scope?: FeedScope }>(Home);
