import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { archivedStories } from '@/features/stories/stories';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

type Tab = 'stories' | 'posts';

/**
 * Everything you have put away. Stories land here on their own after a day;
 * posts only when you archive them. Nobody else can see any of it.
 */
export default function Archive() {
  const styles = useThemedStyles(styleDefinitions);
  const { posts, stories, currentUserId, actions } = useApp();
  // Your own posts, put-away ones included; the feed never carries those.
  useEffect(() => { if (currentUserId) void actions.loadPostsOf(currentUserId); }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<Tab>('stories');

  const myStories = archivedStories(stories, currentUserId);
  const myPosts = posts
    .filter((p) => p.authorId === currentUserId && p.archived)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Screen title="Archive" compactTitle onBack={() => goBack()}>
      <SegmentedControl
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        segments={[
          { value: 'stories', label: `Stories${myStories.length ? ` · ${myStories.length}` : ''}` },
          { value: 'posts', label: `Posts${myPosts.length ? ` · ${myPosts.length}` : ''}` },
        ]}
      />
      <Text style={styles.note}>
        {tab === 'stories'
          ? 'Stories come here after 24 hours, or sooner if you archive them. Only you can see this.'
          : 'Archived posts leave your profile and the feed, and keep their likes and comments. Only you can see this.'}
      </Text>

      {tab === 'stories' ? (
        myStories.length ? (
          <View style={styles.grid}>
            {myStories.map((story) => (
              <Pressable
                key={story.id}
                accessibilityRole="button"
                accessibilityLabel={`Story from ${day(story.createdAt)}`}
                onPress={() => router.push({ pathname: `/story/${story.authorId}`, params: { story: story.id } })}
                style={styles.storyTile}
              >
                {story.thumbnailUrl || story.imageUrl ? (
                  <Image accessibilityIgnoresInvertColors source={{ uri: story.thumbnailUrl ?? story.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={StyleSheet.absoluteFill}>
                    <MediaPlaceholder label={story.mediaLabel ?? 'Story'} seed={story.id} portrait />
                  </View>
                )}
                <View style={styles.tileScrim} pointerEvents="none" />
                <Text style={styles.tileDate}>{day(story.createdAt)}</Text>
                {story.archived ? <Ionicons name="archive" size={14} color="#FFFFFF" style={styles.tileMark} /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState icon="time-outline" title="No stories yet" body="Stories you share will keep here after they leave the rail." />
        )
      ) : myPosts.length ? (
        <View style={styles.list}>
          {myPosts.map((post) => (
            <View key={post.id} style={styles.postRow}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open archived ${post.kind}`}
                onPress={() => router.push(`/post/${post.id}`)}
                style={styles.postBody}
              >
                <View style={styles.postThumb}>
                  {post.thumbnailUrl ? (
                    <Image accessibilityIgnoresInvertColors source={{ uri: post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name={post.kind === 'clip' ? 'play' : 'document-text-outline'} size={18} color={colors.textMuted} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.postKind}>{post.kind === 'match' ? 'SET PLAY' : post.kind.toUpperCase()} · {day(post.createdAt)}</Text>
                  <Text numberOfLines={2} style={styles.postText}>{post.body}</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unarchive post"
                onPress={() => actions.toggleArchivePost(post.id)}
                style={styles.restore}
              >
                <Text style={styles.restoreText}>Unarchive</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon="archive-outline" title="No archived posts" body="Open one of your posts and choose Archive to put it away." />
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  note: { ...typography.small, color: colors.textFaint, lineHeight: 19, paddingVertical: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  storyTile: { width: '32.5%', aspectRatio: 9 / 16, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, justifyContent: 'flex-end', padding: 8 },
  tileScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.18)' },
  tileDate: { ...typography.caption, color: '#FFFFFF', letterSpacing: 0, textShadowColor: '#0009', textShadowRadius: 3 },
  tileMark: { position: 'absolute', top: 8, right: 8, textShadowColor: '#0009', textShadowRadius: 3 },
  list: { gap: spacing.sm },
  postRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  postBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  postThumb: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  postKind: { ...typography.caption, color: colors.textMuted },
  postText: { ...typography.small, color: colors.text, lineHeight: 19 },
  restore: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  restoreText: { ...typography.smallStrong, color: colors.text },
});
