import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState } from '@/components/ui';
import { QuestionCard } from '@/components/QuestionCard';
import { PostCard } from '@/components/PostCard';
import { VerticalPager } from '@/components/VerticalPager';
import { ReelPlayback } from '@/components/ReelPlayback';
import { rankFeed, type FeedItem } from '@/features/feed/rankFeed';
import { useApp } from '@/store/AppContext';
import { colors } from '@/theme';

export default function Home() {
  const app = useApp();
  const { posts, questions, comments, users, currentUserId, saved, actions, ready } = app;
  const [active, setActive] = useState(0);
  const [visit, setVisit] = useState(0);
  const focused = useIsFocused();
  const latest = useRef(app);
  latest.current = app;
  const [order, setOrder] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
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
          <VerticalPager key={visit} onIndex={setActive}>
            {feed.map((item, index) => {
              if (item.type === 'question') {
                const isSaved = saved.questionIds.includes(item.question.id);
                return (
                  <View key={item.question.id} style={styles.article}>
                    <Text style={styles.eyebrow}>FROM THE COMMUNITY</Text>
                    <ScrollView>
                      <QuestionCard
                        question={item.question}
                        author={users.find((u) => u.id === item.question.authorId)}
                        answered={Boolean(item.question.acceptedAnswerId)}
                        saved={isSaved}
                        onToggleSave={() => actions.toggleSaveQuestion(item.question.id)}
                        onShare={() => share('question', item.question.id)}
                        onPress={() => router.push(`/question/${item.question.id}`)}
                      />
                    </ScrollView>
                    <Text style={styles.hint}>Swipe up for more · swipe left for Community</Text>
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
                    <ScrollView>
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
                    </ScrollView>
                    <Text style={styles.hint}>Swipe up for more</Text>
                  </View>
                );
              }

              const liked = !!currentUserId && post.likedBy.includes(currentUserId);
              return (
                <View key={post.id} style={styles.reel}>
                  {post.videoUrl ? (
                    <ReelPlayback uri={post.videoUrl} active={focused && active === index} />
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
                    <Text style={styles.tags}>{post.tags.map((t) => '#' + t).join('  ')}</Text>
                    <Text style={styles.swipeHint}>↑ Next moment   ·   ← Community</Text>
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
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
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Reel comments"
                      onPress={() => router.push(`/post/${post.id}`)}
                      style={styles.action}
                    >
                      <Ionicons name="chatbubble-outline" size={29} color="white" />
                      <Text style={styles.actionLabel}>{post.commentIds.length}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Send this reel to someone"
                      onPress={() => share('post', post.id)}
                      style={styles.action}
                    >
                      <Ionicons name="paper-plane-outline" size={28} color="white" />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this reel'}
                      onPress={() => actions.toggleSavePost(post.id)}
                      style={styles.action}
                    >
                      <Ionicons
                        name={isSaved ? 'bookmark' : 'bookmark-outline'}
                        size={27}
                        color="white"
                      />
                    </Pressable>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  wordmarkOverlay: {
    position: 'absolute', top: 16, width: '100%', maxWidth: 520,
    paddingHorizontal: 20, zIndex: 5,
  },
  wordmark: { color: colors.text, fontSize: 23, fontWeight: '800' },
  wordmarkOnReel: {
    color: 'white', textShadowColor: '#0006',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  viewer: { flex: 1, width: '100%', maxWidth: 520, minHeight: 0 },
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
    backgroundColor: '#0C160ED9',
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
  eyebrow: { color: colors.warning, fontWeight: '700', letterSpacing: 1.2, fontSize: 11 },
  hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center', paddingBottom: 10 },
});
