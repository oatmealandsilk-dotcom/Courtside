import { ThreadReplies } from '@/components/ThreadReplies';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@/lib/useIsFocused';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, EmptyState } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { QuestionCard } from '@/components/QuestionCard';
import { PostCard } from '@/components/PostCard';
import { Tappable } from '@/components/Tappable';
import { VerticalPager } from '@/components/VerticalPager';
import { ReelPlayback } from '@/components/ReelPlayback';
import { rankFeed, type FeedItem } from '@/features/feed/rankFeed';

/** A feed page: a moment, a thread, or the who-to-follow row. */
type Page = FeedItem | { type: 'suggest' };
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

/**
 * The heart that blooms when you double tap a reel.
 *
 * Keyed on a counter rather than a boolean so tapping twice in a row replays
 * it — a boolean would already be true and the second tap would show nothing.
 */
function LikeBurst({ token }: { token: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!token) return;
    scale.setValue(0.5);
    opacity.setValue(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 16 }),
      Animated.sequence([
        Animated.delay(340),
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
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

export default function Home() {
  const styles = useThemedStyles(styleDefinitions);
  const app = useApp();
  const { posts, questions, comments, users, currentUserId, saved, actions, ready, followingIds, mutedIds, blockedIds, conversations } = app;
  const [active, setActive] = useState(0);
  const [visit, setVisit] = useState(0);
  const focused = useIsFocused();
  const latest = useRef(app);
  latest.current = app;
  const [order, setOrder] = useState<string[]>([]);

  // Re-rank when the session itself changes, not every time this screen regains
  // focus — otherwise stepping into a thread and back would reshuffle the feed
  // and throw you to the top.
  const rankedFor = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const stamp = `${ready}:${currentUserId}`;
      if (rankedFor.current === stamp) return;
      rankedFor.current = stamp;
      const data = latest.current;
      setOrder(
        rankFeed(data.posts, data.questions, data.comments, data.currentUserId).map((i) =>
          i.type === 'post' ? `p:${i.post.id}` : `q:${i.question.id}`,
        ),
      );
      setActive(0);
      setVisit((v) => v + 1);
    }, [ready, currentUserId]),
  );

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
      .filter((u) => u.id !== currentUserId && !followingIds.includes(u.id) && !blockedIds.includes(u.id))
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

  // Blocked and muted players disappear from the feed entirely; the
  // who-to-follow row slides in as the third page so it is seen early
  // without being the first thing on screen.
  const feed = useMemo<Page[]>(() => {
    const hidden = new Set([...blockedIds, ...mutedIds]);
    const pages: Page[] = order.flatMap<FeedItem>((key) => {
      const id = key.slice(2);
      if (key.startsWith('p:')) {
        const post = posts.find((p) => p.id === id);
        return post && !hidden.has(post.authorId) ? [{ type: 'post' as const, post }] : [];
      }
      const question = questions.find((q) => q.id === id);
      return question && !hidden.has(question.authorId) ? [{ type: 'question' as const, question }] : [];
    });
    if (users.length > 1) pages.splice(Math.min(2, pages.length), 0, { type: 'suggest' });
    return pages;
  }, [order, posts, questions, blockedIds, mutedIds, users.length]);

  const insets = useSafeAreaInsets();
  const [burst, setBurst] = useState({ id: '', n: 0 });

  /**
   * Double tap only ever likes, the way every app that does this behaves —
   * tapping twice on something you already liked should not take it away.
   */
  const likeByTap = (postId: string, alreadyLiked: boolean) => {
    if (!alreadyLiked) actions.toggleLike(postId);
    setBurst((b) => ({ id: postId, n: b.n + 1 }));
  };

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
  const WINDOW = 2;

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
  useEffect(() => {
    if (!focused || !showing || showing.type === 'suggest') return;
    actions.recordView(
      showing.type === 'post' ? 'post' : 'question',
      showing.type === 'post' ? showing.post.id : showing.question.id,
    );
  }, [focused, showing, actions]);

  return (
    <View style={styles.root}>
      {!ready || !feed.length ? (
        <EmptyState
          title={ready ? 'Your court is quiet' : 'Loading your reels'}
          body="Use + to share a moment."
        />
      ) : (
        <View style={styles.viewer}>
          <VerticalPager key={visit} initialIndex={active} onIndex={setActive}>
            {feed.map((item, index) => {
              const distance = Math.abs(index - active);
              const pageKey = item.type === 'post' ? item.post.id : item.type === 'question' ? item.question.id : 'suggest';
              if (distance > WINDOW) {
                // A placeholder page: holds its slot, costs nothing to render.
                return <View key={pageKey} />;
              }
              // One page either side keeps its video buffered, ready to play.
              const near = distance <= 1;

              if (item.type === 'suggest') {
                return (
                  <View key={pageKey} style={[styles.article, styles.suggestArticle]}>
                    <Text style={styles.eyebrow}>WHO TO FOLLOW</Text>
                    <Text style={styles.suggestTitle}>Players you might know</Text>
                    <Text style={styles.suggestSub}>
                      From your contacts, mutuals, and people who have interacted with you.
                    </Text>
                    {suggestions.length ? (
                      // Its own sideways bar: nativeID keeps the page swipe off it.
                      <ScrollView
                        horizontal
                        nativeID="who-to-follow"
                        showsHorizontalScrollIndicator={false}
                        style={{ flexGrow: 0, marginHorizontal: -20 }}
                        contentContainerStyle={styles.suggestRow}
                      >
                        {suggestions.map(({ user, reason }) => (
                          <View key={user.id} style={styles.suggestCard}>
                            <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.suggestBody}>
                              <Avatar name={user.name} seed={user.avatarSeed} size={64} ring={user.isCoach} />
                              <Text style={styles.suggestName} numberOfLines={1}>{user.name}</Text>
                              <Text style={styles.suggestHandle} numberOfLines={1}>@{user.handle}</Text>
                              <LevelPill profile={user.profile} small />
                              <Text style={styles.suggestReason} numberOfLines={1}>{reason}</Text>
                            </Pressable>
                            <Button label="Follow" onPress={() => actions.toggleFollow(user.id)} full />
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text style={styles.suggestSub}>You already follow everyone we can find near you.</Text>
                    )}
                    <Text style={styles.hint}>Swipe up to keep watching</Text>
                  </View>
                );
              }

              if (item.type === 'question') {
                const isSaved = saved.questionIds.includes(item.question.id);
                return (
                  <View key={item.question.id} style={[styles.article, styles.threadArticle]}>
                    <Text style={styles.eyebrow}>FROM THE COMMUNITY</Text>
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <QuestionCard
                        showBody
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

              if (post.kind !== 'reel') {
                return (
                  <View key={post.id} style={styles.article}>
                    <Text style={styles.eyebrow}>
                      {post.kind === 'match' ? 'SET PLAY' : post.kind.toUpperCase()} · FOR YOU
                    </Text>
                    <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <PostCard
                        post={post}
                        author={author}
                        liked={!!currentUserId && post.likedBy.includes(currentUserId)}
                        onToggleLike={() => actions.toggleLike(post.id)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSavePost(post.id)}
                        onShare={() => share('post', post.id)}
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
                <View key={post.id} style={styles.reel}>
                  {post.videoUrl ? (
                    <ReelPlayback
                      uri={post.videoUrl}
                      poster={post.thumbnailUrl}
                      active={focused && active === index}
                      preload={near}
                      onDoubleTap={() => likeByTap(post.id, liked)}
                    />
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
                        Demo preview · add a video link to play your own reel
                      </Text>
                    </Pressable>
                  )}

                  {burst.id === post.id ? <LikeBurst token={burst.n} /> : null}

                  <View style={styles.caption}>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() => router.push(`/user/${author.id}`)}
                      style={styles.author}
                    >
                      <Avatar name={author.name} seed={author.avatarSeed} size={34} />
                      <Text style={styles.authorName}>@{author.handle}</Text>
                    </Pressable>
                    <Text numberOfLines={3} style={styles.body}>
                      {post.body}
                    </Text>
                    <Text style={styles.tags}>{post.tags.map(t=><Text key={t} accessibilityRole="link" onPress={()=>router.push({pathname:'/search',params:{q:`#${t}`}})}>#{t}{'  '}</Text>)}</Text>
                    <Text style={styles.swipeHint}>↑ Next moment   ·   ← Community</Text>
                  </View>

                  <View style={styles.actions}>
                    <Tappable
                      accessibilityLabel={liked ? 'Unlike reel' : 'Like reel'}
                      onPress={() => actions.toggleLike(post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={35}
                        color={liked ? '#E17B7B' : 'white'}
                      />
                      <Text style={styles.actionLabel}>{post.likedBy.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Reel comments"
                      onPress={() => router.push(`/post/${post.id}`)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="chatbubble-outline" size={33} color="white" />
                      <Text style={styles.actionLabel}>{post.commentIds.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Send this reel to someone"
                      onPress={() => share('post', post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons name="paper-plane-outline" size={32} color="white" />
                      <Text style={styles.actionLabel}>{post.shares ?? 0}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this reel'}
                      onPress={() => actions.toggleSavePost(post.id)}
                      scaleTo={0.78}
                      style={styles.action}
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={31}
                        color="white"
                      />
                      <Text style={styles.actionLabel}>{post.savedBy?.length ?? 0}</Text>
                    </Tappable>
                  </View>
                </View>
              );
            }).map((page, index) =>
              // The wordmark lives inside the first page rather than over the
              // pager, so it leaves with that page as you swipe instead of
              // hanging in place and then vanishing.
              index === 0 ? (
                <React.Fragment key="first">
                  {page}
                  <View pointerEvents="none" style={[styles.wordmarkOverlay, { top: insets.top + 12 }]}>
                    <Text style={[styles.wordmark, feed[0]?.type === 'post' &&
                      feed[0].post.kind === 'reel' && styles.wordmarkOnReel]}>Courtside</Text>
                  </View>
                </React.Fragment>
              ) : page,
            )}
          </VerticalPager>
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  wordmarkOverlay: {
    // top comes from the safe-area inset at render; a fixed value put the
    // wordmark under the Dynamic Island on a phone.
    position: 'absolute', width: '100%',
    paddingHorizontal: 20, zIndex: 5, alignItems: 'center',
  },
  wordmark: {
    color: colors.brand, fontSize: 23, fontWeight: '800', letterSpacing: -0.3,
    textShadowColor: '#0003', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  // Over video the brand colour needs more lift to stay readable.
  wordmarkOnReel: {
    textShadowColor: '#0008', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  viewer: { flex: 1, width: '100%', minHeight: 0 },
  reel: { flex: 1, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
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
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
    paddingRight: 70,
    backgroundColor: 'transparent',
    gap: 10,
  },
  author: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  authorName: { color: 'white', fontSize: 14, fontWeight: '700' },
  body: { color: 'white', fontSize: 13, lineHeight: 19 },
  tags: { color: colors.text, fontSize: 11 },
  swipeHint: { color: colors.textMuted, fontSize: 10 },
  actions: { position: 'absolute', right: 12, bottom: 104, gap: 24 },
  action: { alignItems: 'center', gap: 5, minWidth: 48 },
  actionLabel: { color: 'white', fontSize: 13, fontWeight: '600', textShadowColor: '#0006', textShadowRadius: 3 },
  article: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64, gap: 20 },
  suggestArticle: { gap: 12, justifyContent: 'center' },
  suggestTitle: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  suggestSub: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  suggestRow: { gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  suggestCard: {
    width: 158,
    padding: 14,
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  suggestBody: { alignItems: 'center', gap: 6 },
  suggestName: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  suggestHandle: { fontSize: 12, color: colors.textFaint },
  suggestReason: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  threadArticle: { gap: 8, paddingBottom: 8 },
  eyebrow: { color: colors.warning, fontWeight: '700', letterSpacing: 1.2, fontSize: 11 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 10 },
});
