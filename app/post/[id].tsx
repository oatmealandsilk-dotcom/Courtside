import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PostCard } from '@/components/PostCard';
import { Avatar, Button, EmptyState, Field, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

export default function PostDetail() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, comments, users, currentUserId, actions } = useApp();
  const view = actions.recordView;
  useEffect(() => { view('post', String(id)); }, [view, id]);
  const [draft, setDraft] = useState('');

  const post = posts.find((p) => p.id === id);
  const author = users.find((u) => u.id === post?.authorId);

  if (!post || !author) {
    return (
      <Screen title="Post" compactTitle onBack={() => router.back()}>
        <EmptyState icon="alert-circle-outline" title="This post is gone" />
      </Screen>
    );
  }

  const thread = post.commentIds
    .map((cid) => comments.find((c) => c.id === cid))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    actions.addComment(post.id, text);
    setDraft('');
  };

  return (
    <Screen title="Post" compactTitle onBack={() => router.back()}>
      <PostCard
        post={post}
        author={author}
        liked={Boolean(currentUserId && post.likedBy.includes(currentUserId))}
        onToggleLike={() => actions.toggleLike(post.id)}
        onPress={() => undefined}
        onPressAuthor={() => router.push(`/user/${author.id}`)}
      />

      {post.authorId === currentUserId ? (
        <View style={styles.ownRow}>
          <Text style={styles.ownNote}>
            {post.archived ? 'Archived. Only you can see this.' : 'Yours. Archive it to take it off your profile and the feed.'}
          </Text>
          <Button label={post.archived ? 'Unarchive' : 'Archive'} variant="secondary" onPress={() => actions.toggleArchivePost(post.id)} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {thread.length} {thread.length === 1 ? 'comment' : 'comments'}
        </Text>

        {thread.map((comment) => {
          const commenter = users.find((u) => u.id === comment.authorId);
          return (
            <View key={comment.id} style={styles.comment}>
              <Avatar
                name={commenter?.name ?? '?'}
                seed={commenter?.avatarSeed ?? comment.authorId}
                size={32}
              />
              <View style={styles.commentBody}>
                <Text style={styles.commentMeta}>
                  <PlayerName userId={commenter?.id}>{commenter?.name ?? 'Unknown'}</PlayerName> · {relativeTime(comment.createdAt)}
                </Text>
                <Text style={styles.commentText}>{comment.body}</Text>
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
  section: { gap: spacing.lg, paddingTop: spacing.xl },
  ownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md },
  ownNote: { ...typography.small, color: colors.textFaint, flex: 1, lineHeight: 18 },
  sectionTitle: { ...typography.heading, color: colors.text },
  comment: { flexDirection: 'row', gap: spacing.md },
  commentBody: { flex: 1, gap: 3 },
  commentMeta: { ...typography.caption, color: colors.textFaint },
  commentText: { ...typography.small, color: colors.text, lineHeight: 20 },
  composer: { gap: spacing.md, paddingTop: spacing.md },
});
