import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

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
export function CommentRow({ comment, big = false, onPressBody, onLayout }: {
  comment: Comment;
  /** The post page's cut: bigger picture, name and words. */
  big?: boolean;
  /** A tap on the words themselves. */
  onPressBody?: () => void;
  onLayout?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const who = users.find((u) => u.id === comment.authorId);
  const liked = !!currentUserId && comment.likedBy.includes(currentUserId);
  const openProfile = () => { if (who) router.push(who.id === currentUserId ? '/profile' : `/user/${who.id}`); };
  // A photo in the comment opens to the whole screen; a tap anywhere puts it away.
  const [viewing, setViewing] = useState(false);
  return (
    <View style={styles.row} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={openProfile}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? comment.authorId} uri={who?.avatarUrl} size={big ? 40 : 32} />
      </Pressable>
      <Pressable accessibilityRole={onPressBody ? 'button' : undefined} onPress={onPressBody} disabled={!onPressBody} style={styles.body}>
        <Text style={[styles.meta, big && styles.metaBig]}>
          <Text style={[styles.name, big && styles.nameBig]} onPress={openProfile}>{who?.name ?? 'Unknown'}</Text>
          {'  '}{relativeTime(comment.createdAt)}
        </Text>
        {comment.body.trim() ? <RichText style={[styles.text, big && styles.textBig]}>{comment.body}</RichText> : null}
        {comment.imageUrl ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo in the comment. Open it larger" onPress={() => setViewing(true)} style={styles.photo}>
            <ExpoImage source={{ uri: comment.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={150} />
          </Pressable>
        ) : null}
      </Pressable>
      {comment.imageUrl ? (
        <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)} statusBarTranslucent>
          <Pressable accessibilityRole="button" accessibilityLabel="Close the photo" onPress={() => setViewing(false)} style={styles.viewer}>
            <ExpoImage source={{ uri: comment.imageUrl }} style={styles.viewerImage} contentFit="contain" cachePolicy="memory-disk" />
          </Pressable>
        </Modal>
      ) : null}
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
  metaBig: { fontSize: 12 },
  nameBig: { ...typography.bodyStrong, fontSize: 15 },
  textBig: { ...typography.body, lineHeight: 22 },
  like: { alignItems: 'center', gap: 2, paddingTop: 4, minWidth: 24 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  photo: { width: 168, height: 210, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginTop: 4 },
  // The viewer is a dark room whatever the theme: a photo reads best on black.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
