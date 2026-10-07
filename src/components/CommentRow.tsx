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
import { confirm, reportQuestion, useScopedConfirm } from '@/lib/confirm';
import { relativeTime } from '@/lib/format';
import * as haptics from '@/lib/haptics';
import { afterReport } from '@/features/moderation/reportThanks';
import { useApp } from '@/store/AppContext';
import { colors, spacing, typography } from '@/theme';
import { openPlayer } from '@/features/navigation/openPlayer';
import { useLightStatusWhile } from '@/lib/statusBarStyle';

/**
 * A comment's first few words, in quotes, so a card about it says which one
 * it is ("“Stopping at 80 when the shoulder…”"); a photo with no words is "A photo".
 */
function commentGist(comment: Comment): string | undefined {
  const words = comment.body.replace(/\s+/g, ' ').trim();
  if (!words) return comment.imageUrl ? 'A photo' : undefined;
  if (words.length <= 72) return `“${words}”`;
  // Cut at a word, never mid-word, and without a comma or dash left hanging before the dots.
  const cut = words.slice(0, 70);
  const end = cut.lastIndexOf(' ');
  return `“${(end > 30 ? cut.slice(0, end) : cut).replace(/[\s,.;:!?–—-]+$/, '')}…”`;
}

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
 * anyone's offers Delete (migration 125) or Report on a card that names the
 * comment; Delete goes at once, Report asks its own question. The words dim
 * while held, so a hold is felt before anything opens. Every question is
 * taken back if the row goes (the sheet closed under it).
 *
 * One your Hidden words hid (`onUnhide`, under "Hidden comments") has no
 * heart: liking it would tell its writer, which undoes "hidden". It has
 * "Unhide · Delete" under its words instead.
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
  /** Shows "Unhide · Delete" under the words, and no heart: one your Hidden words hid, on something of yours (migration 117). */
  onUnhide?: () => void;
  onLayout?: (y: number) => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { users, posts, stories, comments, currentUserId, currentUser, actions } = useApp();
  const ask = useScopedConfirm();
  const who = users.find((u) => u.id === comment.authorId);
  // A comment on an Instant is its own kind to the server.
  const kind: TakedownKind = stories.some((st) => st.id === comment.postId) ? 'hit-comment' : 'comment';
  // Admins only: hold the words to take it down, or put it back.
  const moderate = currentUser?.isAdmin ? () => {
    haptics.tap();
    if (comment.removed) {
      ask({ title: 'Restore this comment?', message: 'Everyone who could see it before sees it again.', confirmLabel: 'Restore', onConfirm: () => { void actions.restoreContent(kind, comment.id); } });
    } else {
      // Straight to the page that asks which rule it breaks: it asks once more before anything happens.
      router.push({ pathname: '/take-down', params: { kind, id: comment.id } });
    }
  } : undefined;
  const liked = !!currentUserId && comment.likedBy.includes(currentUserId);
  const streak = shownStreak(who, currentUserId);
  const openProfile = () => { if (who) openPlayer(who.id, currentUserId); };
  // A photo in the comment opens to the whole screen; a tap anywhere puts it away.
  const [viewing, setViewing] = useState(false);
  // The photo opened larger is a dark room: the clock and battery go light over it, and on Android
  // the message banner stands aside while it is up (it would be drawn under it), as in the other viewers.
  const viewerShown = useLightStatusWhile(viewing);
  // Someone else's comment: hold it to report it. It leaves your screens at once.
  const canReport = !!currentUserId && comment.authorId !== currentUserId;
  const sendReport = () => {
    afterReport(actions.reportUser(comment.authorId, `comment:${comment.id}`), who, actions);
  };
  const askReport = () => ask(reportQuestion('comment', sendReport));
  const report = canReport ? () => {
    haptics.tap();
    askReport();
  } : undefined;
  // Your own comment: hold it to delete it.
  const mine = !!currentUserId && comment.authorId === currentUserId;
  const deleteOwn = mine ? () => {
    haptics.tap();
    ask({ title: 'Delete comment?', message: 'This can’t be undone.', confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteComment(comment.id) });
  } : undefined;
  // Someone else's, under your own post or Instant: delete it for everyone, or report it. Two taps to
  // delete, as on Instagram (the deliberate hold is the safety): a card naming whose comment it is and
  // its first words, with Delete, Report and Cancel. Delete removes it at once; Report asks its own question.
  const underMine = !!currentUserId && (posts.some((p) => p.id === comment.postId && p.authorId === currentUserId) || stories.some((st) => st.id === comment.postId && st.authorId === currentUserId));
  const deleteTheirs = canReport && underMine ? () => {
    haptics.tap();
    // Its replies go with it (deleteComment), so the card says so when there are any.
    const replies = comment.parentId ? 0 : comments.filter((c) => c.parentId === comment.id).length;
    const gist = commentGist(comment);
    const along = replies ? `Its ${replies === 1 ? 'reply goes' : `${replies} replies go`} with it.` : undefined;
    ask({
      title: who ? `${who.name}’s comment` : 'This comment',
      message: gist && along ? `${gist}\n${along}` : gist ?? along,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => actions.deleteComment(comment.id),
      also: { label: 'Report', destructive: true, onPress: askReport },
    });
  } : undefined;
  // Hidden by your Hidden words: deleted from its own "Delete", without the Report choice of a hold.
  const deleteHidden = canReport && underMine ? () => {
    haptics.tap();
    confirm({ title: 'Delete this comment?', message: 'It’s removed for everyone.', confirmLabel: 'Delete', destructive: true, onConfirm: () => actions.deleteComment(comment.id) });
  } : undefined;
  const hold = deleteOwn ?? moderate ?? deleteTheirs ?? report;
  const holdHint = deleteOwn ? 'Hold to delete it' : moderate ? (comment.removed ? 'Hold to restore it' : 'Hold to take it down') : deleteTheirs ? 'Hold to delete or report it' : report ? 'Hold to report' : undefined;
  return (
    <View style={[styles.row, reply && { marginLeft: replyIndent(big) }]} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <Pressable accessibilityRole="link" accessibilityLabel={who ? `Open ${who.name}'s profile` : undefined} onPress={openProfile}>
        <Avatar name={who?.name ?? '?'} seed={who?.avatarSeed ?? comment.authorId} uri={who?.avatarUrl} size={reply ? (big ? 30 : 24) : big ? 40 : 32} />
      </Pressable>
      <View style={styles.body}>
        <Pressable accessibilityRole={onPressBody || hold ? 'button' : undefined} accessibilityHint={holdHint} onPress={onPressBody} onLongPress={hold} delayLongPress={400} disabled={!onPressBody && !hold} style={({ pressed }) => [styles.bodyPress, pressed && !!hold && styles.bodyHeld]}>
          {/* Who, their streak's flame (3 days or more), when: one line, the name giving way first. */}
          <View style={styles.metaLine}>
            <Text style={[styles.name, big && styles.nameBig]} numberOfLines={1} onPress={openProfile}>{who?.name ?? 'Unknown'}</Text>
            <StreakFlame days={streak} size="small" style={styles.flame} />
            <Text style={[styles.meta, big && styles.metaBig]}>{relativeTime(comment.createdAt)}</Text>
          </View>
          {comment.body.trim() ? <RichText style={[styles.text, big && styles.textBig]}>{comment.body}</RichText> : null}
          {comment.removed ? <RemovedNote removed={comment.removed} quiet item={{ kind, id: comment.id, authorId: comment.authorId }} actions={false} /> : null}
        </Pressable>
        {/* The photo is its own button beside the words' one, not inside it (a button may not hold another on
            the web): a tap opens it larger, and a hold does what holding the words does. */}
        {comment.imageUrl ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="Photo in the comment. Open it larger" accessibilityHint={holdHint} onPress={() => setViewing(true)} onLongPress={hold} delayLongPress={400} style={({ pressed }) => [styles.photo, pressed && !!hold && styles.bodyHeld]}>
            <ExpoImage source={{ uri: comment.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={150} />
          </Pressable>
        ) : null}
        {/* Its author's "Why? See the rules · Ask for a review": beside the words' own button, not inside it. */}
        {comment.removed ? <RemovedActions removed={comment.removed} item={{ kind, id: comment.id, authorId: comment.authorId }} style={styles.removedActions} /> : null}
        {/* Beside the words' own button, not inside it: a button may not hold another on the web. */}
        {onReply && !comment.removed ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${who?.name ?? 'this comment'}`} onPress={onReply} style={styles.replyButton}>
            <Text style={[styles.replyText, big && styles.replyTextBig]}>Reply</Text>
          </Pressable>
        ) : null}
        {onUnhide ? (
          <View style={styles.hiddenActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Unhide ${who?.name ?? 'this'}'s comment`} hitSlop={{ top: 16, bottom: 12, left: 8, right: 8 }} onPress={onUnhide}>
              <Text style={[styles.hiddenText, big && styles.replyTextBig]}>Unhide</Text>
            </Pressable>
            {deleteHidden ? (
              <>
                <Text style={[styles.hiddenDot, big && styles.replyTextBig]}>·</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${who?.name ?? 'this'}'s comment`} hitSlop={{ top: 16, bottom: 12, left: 8, right: 16 }} onPress={deleteHidden}>
                  <Text style={[styles.hiddenText, big && styles.replyTextBig]}>Delete</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
      {comment.imageUrl ? (
        <Modal visible={viewerShown} transparent animationType="fade" onRequestClose={() => setViewing(false)} statusBarTranslucent>
          <Pressable accessibilityRole="button" accessibilityLabel="Close the photo" onPress={() => setViewing(false)} style={styles.viewer}>
            <ExpoImage source={{ uri: comment.imageUrl }} style={styles.viewerImage} contentFit="contain" cachePolicy="memory-disk" />
          </Pressable>
        </Modal>
      ) : null}
      {onUnhide ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike comment' : 'Like comment'} accessibilityState={{ selected: liked }} hitSlop={8} onPress={() => actions.toggleLikeComment(comment.id)} style={styles.like}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={16} color={liked ? colors.danger : colors.textFaint} />
          {comment.likedBy.length ? <Text style={[styles.count, liked && { color: colors.danger }]}>{comment.likedBy.length}</Text> : null}
        </Pressable>
      )}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  body: { flex: 1 },
  bodyPress: { gap: 3 },
  // Held: the words dim a little, so the hold is felt before its choices open.
  bodyHeld: { opacity: 0.55 },
  metaLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 },
  meta: { ...typography.caption, color: colors.textFaint, letterSpacing: 0, flexShrink: 0 },
  name: { ...typography.smallStrong, color: colors.text, flexShrink: 1 },
  flame: { marginLeft: -2 },
  text: { ...typography.small, color: colors.text, lineHeight: 20 },
  metaBig: { fontSize: 12 },
  nameBig: { ...typography.bodyStrong, fontSize: 15 },
  textBig: { ...typography.body, lineHeight: 22 },
  // A full 44-point target round the heart (a browser has no hitSlop), taking no more room beside the words than before.
  like: { alignItems: 'center', gap: 2, paddingTop: 4, minWidth: 44, minHeight: 44, marginHorizontal: -10 },
  count: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  photo: { width: 168, height: 210, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceAlt, marginTop: 7 },
  // A full finger's height (a browser has no hitSlop): the words where they were, the extra hanging into the gap below.
  replyButton: { alignSelf: 'flex-start', minHeight: 44, minWidth: 44, paddingTop: 6, paddingRight: 16, marginBottom: -20 },
  removedActions: { paddingTop: 2 },
  replyText: { ...typography.smallStrong, fontSize: 12, color: colors.textFaint },
  replyTextBig: { fontSize: 13 },
  // Unhide · Delete, on one your Hidden words hid: a shade stronger than Reply, so they read as the actions here.
  hiddenActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: 6 },
  hiddenText: { ...typography.smallStrong, color: colors.textMuted },
  hiddenDot: { ...typography.smallStrong, color: colors.textFaint },
  // The viewer is a dark room whatever the theme: a photo reads best on black.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
