import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PostVideo } from '@/components/PostVideo';
import { CommentRow } from '@/components/CommentRow';
import { useApp } from '@/store/AppContext';
import { Tappable } from '@/components/Tappable';
import { Avatar, Chip } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { RichText } from '@/components/RichText';
import { compactNumber, relativeTime } from '@/lib/format';
import type { Post, User } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  post: Post;
  author: User;
  liked: boolean;
  saved: boolean;
  /** Whether this page is the one on screen: the video plays only then. */
  active: boolean;
  preload?: boolean;
  onDoubleTap: () => void;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
  /** Room left above for the wordmark. */
  topInset: number;
  /** A play burst over the picture, drawn by the feed. */
  burst?: React.ReactNode;
  discInk?: string;
  /** The picture (or video's first frame) is in. */
  onReady?: (ready: boolean) => void;
}

/**
 * A photo or video post as a page of the feed — Instagram's post, not its
 * reel. The picture sits at the top in its own frame, and everything about it
 * (who, the caption, the tags, like · comment · send · save) sits underneath
 * in the app's own type and colours, rather than painted over the picture.
 */
export function MediaPostPage({ post, author, liked, saved, active, preload = false, onDoubleTap, onToggleLike, onToggleSave, onComment, onShare, onMore, topInset, burst, discInk, onReady }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const { comments, currentUser, currentUserId } = useApp();
  // Newest first, the way the sheet lists them; they fill the bottom of the page.
  const thread = comments.filter((c) => c.postId === post.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const lastTap = useRef(0);
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) { lastTap.current = 0; onDoubleTap(); } else lastTap.current = now;
  };
  const landscape = post.orientation === 'landscape';

  return (
    // Without comments there is nothing to fill the bottom, so the picture and
    // its words sit in the middle of the page instead of leaving a gap below.
    <View style={[styles.page, { paddingTop: topInset }, !thread.length && styles.pageCentred]}>
      <View style={[styles.frame, landscape ? styles.frameWide : styles.frameTall]}>
        {post.videoUrl ? (
          <PostVideo uri={post.videoUrl} poster={post.thumbnailUrl} active={active} preload={preload} onDoubleTap={onDoubleTap} trimStart={post.trimStart} trimEnd={post.trimEnd} silent={post.muted} discInk={discInk} onReady={onReady} />
        ) : (
          <Pressable accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? 'Post photo'} onPress={tapPicture} style={StyleSheet.absoluteFill}>
            <Image accessibilityIgnoresInvertColors source={{ uri: post.imageUrl ?? post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={() => onReady?.(true)} />
          </Pressable>
        )}
        {burst}
      </View>

      <View style={styles.details}>
        <Pressable accessibilityRole="link" accessibilityLabel={`View ${author.name}'s profile`} onPress={() => router.push(author.id === currentUserId ? '/profile' : `/user/${author.id}`)} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} size={40} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{author.name}</Text>
              {author.isCoach ? <Ionicons name="shield-checkmark" size={14} color={colors.brand} /> : null}
            </View>
            <Text style={styles.sub} numberOfLines={1}>@{author.handle} · {relativeTime(post.createdAt)}</Text>
          </View>
          <LevelPill profile={author.profile} small />
        </Pressable>

        {/* The clip's buttons, laid across instead of down: same glyphs, same
            sizes, the count under each one. */}
        <View style={styles.actions}>
          <Tappable onPress={onToggleLike} immediate scaleTo={0.78} style={styles.action} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? '#FF3B5C' : colors.text} />
            <Text style={styles.actionText}>{compactNumber(post.likedBy.length)}</Text>
          </Tappable>
          <Tappable onPress={onComment} scaleTo={0.78} style={styles.action} accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={29} color={colors.text} />
            <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text>
          </Tappable>
          <Tappable onPress={onShare} scaleTo={0.78} style={styles.action} accessibilityLabel="Send this post to someone">
            <Ionicons name="arrow-redo-outline" size={29} color={colors.text} />
            <Text style={styles.actionText}>{compactNumber(post.shares ?? 0)}</Text>
          </Tappable>
          <Tappable onPress={onToggleSave} scaleTo={0.78} style={styles.action} accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={28} color={colors.text} />
            <Text style={styles.actionText}>{compactNumber(post.savedBy?.length ?? 0)}</Text>
          </Tappable>
          <Tappable onPress={onMore} scaleTo={0.78} style={styles.action} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={28} color={colors.text} />
            <Text style={styles.actionText}> </Text>
          </Tappable>
        </View>

        {post.body ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open the full post" onPress={() => router.push(`/post/${post.id}`)}>
            <Text numberOfLines={4} style={styles.caption}><Text style={styles.captionName}>{author.handle} </Text><RichText style={styles.caption}>{post.body}</RichText></Text>
          </Pressable>
        ) : null}
        {post.tags.length ? (
          <View style={styles.tags}>
            {post.tags.map((tag) => <Chip key={tag} label={`#${tag}`} onPress={() => router.push({ pathname: '/search', params: { q: `#${tag}` } })} small />)}
          </View>
        ) : null}
        {/* The comments, open on the page and filling whatever is left of it;
            the line at the bottom opens the sheet to write one. */}
        {thread.length ? (
          <ScrollView style={styles.thread} contentContainerStyle={styles.threadInner} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {thread.map((c) => <CommentRow key={c.id} comment={c} />)}
          </ScrollView>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Add a comment" onPress={onComment} style={styles.addComment}>
          {currentUser ? <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={28} /> : null}
          <Text style={styles.addCommentText}>{thread.length ? 'Add a comment…' : 'Be the first to comment…'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, gap: spacing.md, paddingBottom: spacing.md },
  pageCentred: { justifyContent: 'center' },
  frame: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center' },
  // Instagram's tall post: 4:5, so the picture is big without taking the page.
  frameTall: { aspectRatio: 4 / 5, maxHeight: '62%' },
  frameWide: { aspectRatio: 16 / 9 },
  details: { gap: spacing.sm, flexShrink: 1, minHeight: 0 },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint },
  actions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  action: { alignItems: 'center', gap: 3, minWidth: 48 },
  actionText: { ...typography.smallStrong, color: colors.text },
  thread: { flexShrink: 1, minHeight: 0, marginTop: spacing.xs },
  threadInner: { gap: spacing.sm, paddingBottom: spacing.xs },
  addComment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addCommentText: { ...typography.body, color: colors.textFaint, flex: 1 },
  caption: { ...typography.body, color: colors.text, lineHeight: 21 },
  captionName: { ...typography.bodyStrong, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
