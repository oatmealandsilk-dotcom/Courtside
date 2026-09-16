import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/RichText';
import type { Comment } from '@/data/types';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/**
 * One comment, Instagram-shaped: who, when, what, and a heart on the right
 * with its count. Used by the comments sheet and the post and hit pages.
 */
export function CommentRow({ comment }: { comment: Comment }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const who = users.find((u) => u.id === comment.authorId);
  const liked = !!currentUserId && comment.likedBy.includes(currentUserId);
  const openProfile = () => { if (who) router.push(who.id === currentUserId ? '/profile' : `/user/${who.id}`); };
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={openProfile}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? comment.authorId} uri={who?.avatarUrl} size={32} />
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.meta}>
          <Text style={styles.name} onPress={openProfile}>{who?.name ?? 'Unknown'}</Text>
          {'  '}{relativeTime(comment.createdAt)}
        </Text>
        <RichText style={styles.text}>{comment.body}</RichText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'} accessibilityState={{ selected: liked }} hitSlop={8} onPress={() => actions.toggleLikeComment(comment.id)} style={styles.like}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? colors.danger : colors.textFaint} />
        {comment.likedBy.length ? <Text style={[styles.count, liked && { color: colors.danger }]}>{comment.likedBy.length}</Text> : null}
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  body: { flex: 1, gap: 3 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  name: { ...typography.smallStrong, color: colors.text },
  text: { ...typography.small, color: colors.text, lineHeight: 20 },
  like: { alignItems: 'center', gap: 2, paddingTop: 4, minWidth: 24 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
});
