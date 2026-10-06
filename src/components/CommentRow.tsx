import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar } from '@/components/ui/Avatar';
import { RichText } from '@/components/RichText';
import { StreakFlame } from '@/components/StreakFlame';
import { shownStreak } from '@/features/practice/streakFlame';
import type { Comment, TakedownKind } from '@/data/types';
import { RemovedActions, RemovedNote } from '@/features/moderation/RemovedNote';
import { confirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import { confirmReport } from '@/lib/confirm';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';

/** How far a reply sits in: its picture lines up with the words of the comment it is under. */
export const replyIndent = (big: boolean) => (big ? 40 : 32) + spacing.md;

/**
 * One comment, Instagram-shaped: who, when, what, and a heart on the right
 * with its count, and "Reply" under the words. A reply is the same row a step
 * in, with a smaller picture. Used by the comments sheet and the post and hit pages.
 *
 * One an admin took down (migration 108) reaches only its author and the
 * admins, and says so under its words ("Removed: Hate"), with no Reply; its
 * author also gets "Why? See the rules · Ask for a review" there. For
 * an admin, holding the words offers Take down (or Restore); nobody else
 * gets anything on a hold.
 * Holding someone else's comment reports it (App Review 1.2, Oct 5).
 * Holding your own deletes it; under your own post or Instant, holding
 * anyone's offers Delete (migration 125) or Report.
 */
export function CommentRow({ comment, big = false, reply = false, onPressBody, onReply, onUnhide, onLayout }: {
  comment: Comment;
  /** The post page's cut: bigger picture, name and words. */
  big?: boolean;
  /** A reply under another comment: indented, with a smaller picture. */
  reply?: boolean;
  /** A tap on the words themselves. */
  onPressBody?: () => void;
  /** Shows "Reply" under the words. */
  onReply?: () => void;
  /** Shows "Unhide" under the words: one your Hidden words hid, on something of yours (migration 117). */
  onUnhide?: () => void;
  onLayout?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, posts, stories, currentUserId, currentUser, actions } = useApp();
  const who = users.find((u) => u.id === comment.authorId);
  // A comment on an Instant is its own kind to the server.
  const kind: TakedownKind = stories.some((st) => st.id === comment.postId) ? 'hit-comment' : 'comment';
  // Admins only: hold the words to take it down, or put it back.
  const moderate = currentUser?.isAdmin ? () => {
    haptics.tap();
    if (comment.removed) {
      confirm({ title: 'Restore this comment?', message: 'Everyone who could see it before sees it again.', confirmLabel: 'Restore', onConfirm: () => { void actions.restoreContent(kind, comment.id); } });
    } else {
      confirm({ title: 'Take down this comment?', message: 'Choose which of CourtSide’s rules it breaks on the next page.', confirmLabel: 'Choose a reason', destructive: true, onConfirm: () => router.push({ pathname: '/take-down', params: { kind, id: comment.id } }) });
    }
  } : undefined;
  const liked = !!currentUserId && comment.likedBy.includes(currentUserId);
  const streak = shownStreak(who, currentUserId);
  const openProfile = () => { if (who) openPlayer(who.id, currentUserId); };
  // A photo in the comment opens to the whole screen; a tap anywhere puts it away.
  const [viewing, setViewing] = useState(false);
  // Someone else's comment: hold it to report it. It leaves your screens at once.
  const canReport = !!currentUserId && comment.authorId !== currentUserId;
  const sendReport = () => {
    actions.reportUser(comment.authorId, `comment:${comment.id}`);
    showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
  };
  const report = canReport ? () => {
    haptics.tap();
    confirmReport('comment', sendReport);
  } : undefined;
  // Your own comment: hold it to delete it.
  const mine = !!currentUserId && comment.authorId === currentUserId;
  const deleteOwn = mine ? () => {
    haptics.tap();
    confirm({ title: 'Delete comment?', message: "This can't be undone.", confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteComment(comment.id) });
  } : undefined;
  // Someone else's, under your own post or Instant: delete it for everyone, or report it.
  const underMine = !!currentUserId && (posts.some((p) => p.id === comment.postId && p.authorId === currentUserId) || stories.some((st) => st.id === comment.postId && st.authorId === currentUserId));
  const deleteTheirs = canReport && underMine ? () => {
    haptics.tap();
    confirm({ title: 'Delete this comment?', message: 'It’s removed for everyone.', confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteComment(comment.id), also: { label: 'Report', destructive: true, onPress: sendReport } });
  } : undefined;
  const hold = deleteOwn ?? moderate ?? deleteTheirs ?? report;
  const holdHint = deleteOwn ? 'Hold to delete it' : moderate ? (comment.removed ? 'Hold to restore it' : 'Hold to take it down') : deleteTheirs ? 'Hold to delete or report it' : report ? 'Hold to report' : undefined;
  return (
    <View style={[styles.row, reply && { marginLeft: replyIndent(big) }]} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={openProfile}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? comment.authorId} uri={who?.avatarUrl} size={reply ? (big ? 30 : 24) : big ? 40 : 32} />
      </Pressable>
      <View style={styles.body}>
        <Pressable accessibilityRole={onPressBody || hold ? 'button' : undefined} accessibilityHint={holdHint} onPress={onPressBody} onLongPress={hold} delayLongPress={400} disabled={!onPressBody && !hold} style={styles.bodyPress}>
          {/* Who, their streak's flame (3 days or more), when: one line, the name giving way first. */}
          <View style={styles.metaLine}>
            <Text style={[styles.name, big && styles.nameBig]} numberOfLines={1} onPress={openProfile}>{who?.name ?? 'Unknown'}</Text>
            <StreakFlame days={streak} size="small" style={styles.flame} />
            <Text style={[styles.meta, big && styles.metaBig]}>{relativeTime(comment.createdAt)}</Text>
          </View>
          {comment.body.trim() ? <RichText style={[styles.text, big && styles.textBig]}>{comment.body}</RichText> : null}
          {comment.imageUrl ? (
            <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo in the comment. Open it larger" onPress={() => setViewing(true)} style={styles.photo}>
              <ExpoImage source={{ uri: comment.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={150} />
            </Pressable>
          ) : null}
          {comment.removed ? <RemovedNote removed={comment.removed} quiet item={{ kind, id: comment.id, authorId: comment.authorId }} actions={false} /> : null}
        </Pressable>
        {/* Its author's "Why? See the rules · Ask for a review": beside the words' own button, not inside it. */}
        {comment.removed ? <RemovedActions removed={comment.removed} item={{ kind, id: comment.id, authorId: comment.authorId }} style={styles.removedActions} /> : null}
        {/* Beside the words' own button, not inside it: a button may not hold another on the web. */}
        {onReply && !comment.removed ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${who?.name ?? 'this comment'}`} hitSlop={{ top: 6, bottom: 8, left: 8, right: 16 }} onPress={onReply} style={styles.replyButton}>
            <Text style={[styles.replyText, big && styles.replyTextBig]}>Reply</Text>
          </Pressable>
        ) : null}
        {onUnhide ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Unhide ${who?.name ?? 'this'}'s comment`} hitSlop={{ top: 6, bottom: 8, left: 8, right: 16 }} onPress={onUnhide} style={styles.replyButton}>
            <Text style={[styles.replyText, big && styles.replyTextBig]}>Unhide</Text>
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
  metaLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, flexShrink: 0 },
  name: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  flame: { marginLeft: -2 },
  text: { ...typography.small, color: colors.text, lineHeight: 20 },
  metaBig: { fontSize: 12 },
  nameBig: { ...typography.bodyStrong, fontSize: 15 },
  textBig: { ...typography.body, lineHeight: 22 },
  like: { alignItems: 'center', gap: 2, paddingTop: 4, minWidth: 24 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  photo: { width: 168, height: 210, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginTop: 4 },
  replyButton: { alignSelf: 'flex-start', paddingTop: 6 },
  removedActions: { paddingTop: 2 },
  replyText: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  replyTextBig: { fontSize: 13 },
  // The viewer is a dark room whatever the theme: a photo reads best on black.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
