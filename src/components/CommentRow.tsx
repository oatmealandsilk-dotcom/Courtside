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
import { confirmReport } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';

/** How far a reply sits in: its picture lines up with the words of the comment it is under. */
export const replyIndent = (big: boolean) => (big ? 40 : 32) + spacing.md;

/**
 * One comment, Instagram-shaped: who, when, what, and a heart on the right
 * with its count, and "Reply" under the words. A reply is the same row a step
 * in, with a smaller picture. Used by the comments sheet and the post and hit pages.
 * Holding someone else's comment reports it (App Review 1.2, Oct 5).
 */
export function CommentRow({ comment, big = false, reply = false, onPressBody, onReply, onLayout }: {
  comment: Comment;
  /** The post page's cut: bigger picture, name and words. */
  big?: boolean;
  /** A reply under another comment: indented, with a smaller picture. */
  reply?: boolean;
  /** A tap on the words themselves. */
  onPressBody?: () => void;
  /** Shows "Reply" under the words. */
  onReply?: () => void;
  onLayout?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, currentUserId, actions } = useApp();
  const who = users.find((u) => u.id === comment.authorId);
  const liked = !!currentUserId && comment.likedBy.includes(currentUserId);
  const openProfile = () => { if (who) router.push(who.id === currentUserId ? '/profile' : `/user/${who.id}`); };
  // A photo in the comment opens to the whole screen; a tap anywhere puts it away.
  const [viewing, setViewing] = useState(false);
  // Someone else's comment: hold it to report it. It leaves your screens at once.
  const canReport = !!currentUserId && comment.authorId !== currentUserId;
  const report = canReport ? () => {
    haptics.tap();
    confirmReport('comment', () => {
      actions.reportUser(comment.authorId, `comment:${comment.id}`);
      showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
    });
  } : undefined;
  return (
    <View style={[styles.row, reply && { marginLeft: replyIndent(big) }]} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={openProfile}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? comment.authorId} uri={who?.avatarUrl} size={reply ? (big ? 30 : 24) : big ? 40 : 32} />
      </Pressable>
      <View style={styles.body}>
        <Pressable accessibilityRole={onPressBody ? 'button' : undefined} accessibilityHint={report ? 'Hold to report' : undefined} onPress={onPressBody} onLongPress={report} delayLongPress={400} disabled={!onPressBody && !report} style={styles.bodyPress}>
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
        {/* Beside the words' own button, not inside it: a button may not hold another on the web. */}
        {onReply ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${who?.name ?? 'this comment'}`} hitSlop={{ top: 6, bottom: 8, left: 8, right: 16 }} onPress={onReply} style={styles.replyButton}>
            <Text style={[styles.replyText, big && styles.replyTextBig]}>Reply</Text>
          </Pressable>
        ) : null}
      </View>
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
  body: { flex: 1 },
  bodyPress: { gap: 3 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  name: { ...typography.smallStrong, color: colors.text },
  text: { ...typography.small, color: colors.text, lineHeight: 20 },
  metaBig: { fontSize: 12 },
  nameBig: { ...typography.bodyStrong, fontSize: 15 },
  textBig: { ...typography.body, lineHeight: 22 },
  like: { alignItems: 'center', gap: 2, paddingTop: 4, minWidth: 24 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  photo: { width: 168, height: 210, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginTop: 4 },
  replyButton: { alignSelf: 'flex-start', paddingTop: 6 },
  replyText: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  replyTextBig: { fontSize: 13 },
  // The viewer is a dark room whatever the theme: a photo reads best on black.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
