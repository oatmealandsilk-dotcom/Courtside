import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { ClipPlayback } from '@/components/ClipPlayback';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { PlayerName } from '@/components/PlayerName';
import { RichText } from '@/components/RichText';
import { Tappable } from '@/components/Tappable';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime, timeLeft } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** One hit with its likes and comments — the same page a post gets. */
export default function HitThread() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stories, users, comments, currentUserId, actions } = useApp();
  const story = stories.find((st) => st.id === id);
  const author = users.find((u) => u.id === story?.authorId);
  const [draft, setDraft] = useState('');
  // Ticks once a minute so the countdown stays honest while you read.
  const [, tick] = useState(0);
  useEffect(() => { const timer = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(timer); }, []);

  if (!story || !author) {
    return (
      <Screen title="Hit" compactTitle onBack={() => goBack()}>
        <EmptyState title="This hit has gone" body="It may have expired or been taken down." />
      </Screen>
    );
  }

  const liked = !!currentUserId && story.likedBy.includes(currentUserId);
  const thread = comments.filter((c) => c.postId === story.id).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    actions.addStoryComment(story.id, text);
    setDraft('');
  };

  return (
    <Screen title="Hit" compactTitle onBack={() => goBack()}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open this hit full screen" onPress={() => router.push({ pathname: `/story/${author.id}`, params: { story: story.id } })} style={styles.frame}>
        {story.videoUrl ? (
          <ClipPlayback uri={story.videoUrl} poster={story.thumbnailUrl} active preload />
        ) : story.imageUrl ? (
          <Image accessibilityIgnoresInvertColors source={{ uri: story.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <MediaPlaceholder label={story.mediaLabel ?? 'Hit'} seed={story.id} portrait />
        )}
        <View pointerEvents="none" style={styles.clock}>
          <Ionicons name="time-outline" size={13} color="white" />
          <Text style={styles.clockText}>HIT · {timeLeft(story.expiresAt)}</Text>
        </View>
      </Pressable>

      <View style={styles.authorRow}>
        <Pressable accessibilityRole="link" onPress={() => router.push(author.id === currentUserId ? '/profile' : `/user/${author.id}`)} style={styles.author}>
          <Avatar name={author.name} seed={author.avatarSeed} size={36} />
          <View style={{ flex: 1 }}>
            <PlayerName userId={author.id} style={styles.name}>{author.name}</PlayerName>
            <Text style={styles.meta}>@{author.handle} · {relativeTime(story.createdAt)}</Text>
          </View>
        </Pressable>
        <Tappable accessibilityLabel={liked ? 'Unlike hit' : 'Like hit'} onPress={() => actions.toggleLikeStory(story.id)} scaleTo={0.8} style={styles.like}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.danger : colors.text} />
          <Text style={styles.likeCount}>{story.likedBy.length}</Text>
        </Tappable>
      </View>
      {story.caption ? <RichText style={styles.caption}>{story.caption}</RichText> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{thread.length} {thread.length === 1 ? 'comment' : 'comments'}</Text>
        {thread.map((comment) => {
          const commenter = users.find((u) => u.id === comment.authorId);
          return (
            <View key={comment.id} style={styles.comment}>
              <Avatar name={commenter?.name ?? '?'} seed={commenter?.avatarSeed ?? comment.authorId} size={32} />
              <View style={styles.commentBody}>
                <Text style={styles.commentMeta}>
                  <PlayerName userId={commenter?.id}>{commenter?.name ?? 'Unknown'}</PlayerName> · {relativeTime(comment.createdAt)}
                </Text>
                <RichText style={styles.commentText}>{comment.body}</RichText>
              </View>
            </View>
          );
        })}
        <View style={styles.composer}>
          <Field value={draft} onChangeText={setDraft} placeholder="Add a comment" multiline minHeight={70} onSubmitEditing={submit} />
          <Button label="Post comment" onPress={submit} disabled={draft.trim().length === 0} />
        </View>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, maxHeight: 520, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  clock: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  clockText: { color: 'white', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  likeCount: { ...typography.smallStrong, color: colors.text },
  caption: { ...typography.body, color: colors.text, lineHeight: 22, paddingTop: spacing.md },
  section: { gap: spacing.lg, paddingTop: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  comment: { flexDirection: 'row', gap: spacing.md },
  commentBody: { flex: 1, gap: 3 },
  commentMeta: { ...typography.caption, color: colors.textFaint },
  commentText: { ...typography.small, color: colors.text, lineHeight: 20 },
  composer: { gap: spacing.md, paddingTop: spacing.md },
});
