import { ThreadReplies } from '@/components/ThreadReplies';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState } from '@/components/ui';
import { QuestionCard } from '@/components/QuestionCard';
import { PostCard } from '@/components/PostCard';
import { Tappable } from '@/components/Tappable';
import { VerticalPager } from '@/components/VerticalPager';
import { ReelPlayback } from '@/components/ReelPlayback';
import { rankFeed, type FeedItem } from '@/features/feed/rankFeed';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function Home() {
  const styles = useThemedStyles(styleDefinitions);
  const app = useApp();
  const { posts, questions, comments, users, currentUserId, saved, actions, ready } = app;
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

  const feed = useMemo(
    () =>
      order.flatMap<FeedItem>((key) => {
        const id = key.slice(2);
        if (key.startsWith('p:')) {
          const post = posts.find((p) => p.id === id);
          return post ? [{ type: 'post' as const, post }] : [];
        }
        const question = questions.find((q) => q.id === id);
        return question ? [{ type: 'question' as const, question }] : [];
      }),
    [order, posts, questions],
  );

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
    if (!focused || !showing) return;
    actions.recordView(
      showing.type === 'post' ? 'post' : 'question',
      showing.type === 'post' ? showing.post.id : showing.question.id,
    );
  }, [focused, showing, actions]);

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.wordmarkOverlay}>
        <Text style={[styles.wordmark, feed[active]?.type === 'post' &&
          feed[active].post.kind === 'reel' && styles.wordmarkOnReel]}>courtside</Text>
      </View>
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
              if (distance > WINDOW) {
                // A placeholder page: holds its slot, costs nothing to render.
                return <View key={item.type === 'post' ? item.post.id : item.question.id} />;
              }
              // One page either side keeps its video buffered, ready to play.
              const near = distance <= 1;

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
                    />
                  ) : post.thumbnailUrl ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: post.thumbnailUrl }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.preview}>
                      <View style={styles.court}>
                        <View style={styles.net} />
                        <View style={styles.service} />
                      </View>
                      <Ionicons name="tennisball-outline" size={54} color="#C4D0BA" />
                      <Text style={styles.previewTitle}>{post.mediaLabel}</Text>
                      <Text style={styles.previewNote}>
                        Demo preview · add a video link to play your own reel
                      </Text>
                    </View>
                  )}

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
                      style={styles.action}
                    >
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={31}
                        color={liked ? '#E17B7B' : 'white'}
                      />
                      <Text style={styles.actionLabel}>{post.likedBy.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Reel comments"
                      onPress={() => router.push(`/post/${post.id}`)}
                      style={styles.action}
                    >
                      <Ionicons name="chatbubble-outline" size={29} color="white" />
                      <Text style={styles.actionLabel}>{post.commentIds.length}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel="Send this reel to someone"
                      onPress={() => share('post', post.id)}
                      style={styles.action}
                    >
                      <Ionicons name="paper-plane-outline" size={28} color="white" />
                      <Text style={styles.actionLabel}>{post.shares ?? 0}</Text>
                    </Tappable>
                    <Tappable
                      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this reel'}
                      onPress={() => actions.toggleSavePost(post.id)}
                      style={styles.action}
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={27}
                        color="white"
                      />
                      <Text style={styles.actionLabel}>{post.savedBy?.length ?? 0}</Text>
                    </Tappable>
                  </View>
                </View>
              );
            })}
          </VerticalPager>
        </View>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  wordmarkOverlay: {
    position: 'absolute', top: 16, width: '100%',
    paddingHorizontal: 20, zIndex: 5,
  },
  wordmark: { color: colors.text, fontSize: 23, fontWeight: '800' },
  wordmarkOnReel: {
    color: 'white', textShadowColor: '#0006',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  viewer: { flex: 1, width: '100%', minHeight: 0 },
  reel: { flex: 1, backgroundColor: '#203E2A', overflow: 'hidden' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  court: {
    position: 'absolute',
    top: '15%',
    bottom: '25%',
    left: '12%',
    right: '12%',
    borderWidth: 1,
    borderColor: '#6E856B',
  },
  net: { position: 'absolute', top: '50%', height: 1, width: '100%', backgroundColor: '#6E856B' },
  service: { position: 'absolute', top: '20%', bottom: '20%', left: '50%', width: 1, backgroundColor: '#6E856B' },
  previewTitle: {
    color: '#E0E7D6',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: '#203E2ACC',
    padding: 8,
  },
  previewNote: {
    color: '#B7C5AF',
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
  tags: { color: '#CBD7C2', fontSize: 11 },
  swipeHint: { color: '#A8B9A0', fontSize: 10 },
  actions: { position: 'absolute', right: 14, bottom: 100, gap: 22 },
  action: { alignItems: 'center', gap: 5 },
  actionLabel: { color: 'white', fontSize: 12 },
  article: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 64, gap: 20 },
  threadArticle: { gap: 8, paddingBottom: 8 },
  eyebrow: { color: colors.warning, fontWeight: '700', letterSpacing: 1.2, fontSize: 11 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 10 },
});
