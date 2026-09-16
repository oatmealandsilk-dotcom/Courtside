import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ZoomableMedia } from '@/components/ZoomableMedia';
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
  const [captionOpen, setCaptionOpen] = useState(false);
  // A photo: one tap opens it full screen (pinch to look closer, it snaps
  // back), two taps like it. The single tap waits out the double-tap window.
  const insets = useSafeAreaInsets();
  const [full, setFull] = useState(false);
  const lastTap = useRef(0);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (pendingTap.current) { clearTimeout(pendingTap.current); pendingTap.current = null; }
      onDoubleTap();
      return;
    }
    lastTap.current = now;
    if (pendingTap.current) clearTimeout(pendingTap.current);
    pendingTap.current = setTimeout(() => { pendingTap.current = null; setFull(true); }, 280);
  };
  useEffect(() => () => { if (pendingTap.current) clearTimeout(pendingTap.current); }, []);
  const landscape = post.orientation === 'landscape';
  // A wide video's frame is cut to the video's own shape — the player says
  // what that is the moment it has read the file (the cover picture is only
  // a first guess) — so the picture fills it exactly, no bars at the sides.
  const [shape, setShape] = useState<number | null>(null);
  const [sized, setSized] = useState(false);
  useEffect(() => {
    const cover = post.thumbnailUrl ?? post.imageUrl;
    if (!landscape || !cover || sized) return;
    let live = true;
    Image.getSize(cover, (w, h) => { if (live && w > 0 && h > 0) setShape(Math.max(1.2, Math.min(2.6, w / h))); }, () => undefined);
    return () => { live = false; };
  }, [landscape, post.thumbnailUrl, post.imageUrl, sized]);
  // The phone can report a recording's stored size before its rotation flag
  // is applied (a landscape iPhone video often comes back as portrait), so a
  // wide post always takes the wide reading of the two, kept within bounds.
  const onSize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    setSized(true);
    setShape(Math.max(1.2, Math.min(2.6, Math.max(w, h) / Math.min(w, h))));
  };

  return (
    // Without comments there is nothing to fill the bottom, so the picture and
    // its words sit in the middle of the page instead of leaving a gap below.
    <View style={[styles.page, { paddingTop: topInset }, !thread.length && styles.pageCentred]}>
      {/* Who and their level, in the space above the picture. */}
      <View style={styles.whoRow}>
        <Pressable accessibilityRole="link" accessibilityLabel={`View ${author.name}'s profile`} onPress={() => router.push(author.id === currentUserId ? '/profile' : `/user/${author.id}`)} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={40} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{author.name}</Text>
              {author.isCoach ? <Ionicons name="shield-checkmark" size={14} color={colors.brand} /> : null}
            </View>
            <Text style={styles.sub} numberOfLines={1}>@{author.handle} · {relativeTime(post.createdAt)}</Text>
          </View>
        </Pressable>
        <LevelPill profile={author.profile} small />
      </View>
      <View style={[styles.frame, landscape ? [styles.frameWide, { aspectRatio: shape ?? 16 / 9 }] : styles.frameTall]}>
        {post.videoUrl ? (
          <PostVideo uri={post.videoUrl} poster={post.thumbnailUrl} active={active} preload={preload} onDoubleTap={onDoubleTap} trimStart={post.trimStart} trimEnd={post.trimEnd} crop={post.crop} silent={post.muted} discInk={discInk} onReady={onReady} onSize={landscape ? onSize : undefined} />
        ) : (
          <Pressable accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? 'Post photo'} onPress={tapPicture} style={StyleSheet.absoluteFill}>
            <Image accessibilityIgnoresInvertColors source={{ uri: post.imageUrl ?? post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onLoad={() => onReady?.(true)} />
          </Pressable>
        )}
        {burst}
      </View>
      {!post.videoUrl ? (
        <Modal visible={full} animationType="none" statusBarTranslucent onRequestClose={() => setFull(false)}>
          <View style={styles.fullRoot}>
            <ZoomableMedia>
              <Image accessibilityIgnoresInvertColors source={{ uri: post.imageUrl ?? post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </ZoomableMedia>
            <Pressable accessibilityRole="button" accessibilityLabel="Close full screen" onPress={() => setFull(false)} style={[styles.fullClose, { top: insets.top + 12 }]}>
              <Ionicons name="close" size={22} color="white" />
            </Pressable>
          </View>
        </Modal>
      ) : null}

      <View style={styles.details}>
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
          <Pressable accessibilityRole="button" accessibilityLabel={captionOpen ? 'Show less' : 'Show the whole caption'} onPress={() => setCaptionOpen((o) => !o)}>
            <Text numberOfLines={captionOpen ? undefined : 4} style={styles.caption}><Text style={styles.captionName}>{author.handle} </Text><RichText style={styles.caption}>{post.body}</RichText></Text>
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
            {thread.map((c) => <CommentRow key={c.id} comment={c} big onPressBody={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, at: c.id } })} />)}
          </ScrollView>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Add a comment" onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id, focus: '1' } })} style={styles.addComment}>
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
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'stretch' },
  // Instagram's tall post: 4:5, so the picture is big without taking the page.
  frameTall: { aspectRatio: 4 / 5, maxHeight: '62%', alignSelf: 'center', width: '100%' },
  // A wide video runs the full width of the screen, no margin, no rounding.
  // Rounded like the wordmark pill, a little in from the edges, the video's own shape.
  frameWide: { alignSelf: 'stretch', borderRadius: 14 },
  details: { gap: spacing.sm, flexShrink: 1, minHeight: 0 },
  fullRoot: { flex: 1, backgroundColor: '#000' },
  fullClose: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 2 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint },
  actions: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  action: { alignItems: 'center', gap: 3, minWidth: 48 },
  actionText: { ...typography.smallStrong, color: colors.text },
  thread: { flexShrink: 1, minHeight: 0, marginTop: spacing.xs },
  threadInner: { gap: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  addComment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  addCommentText: { ...typography.body, color: colors.textFaint, flex: 1 },
  caption: { ...typography.body, color: colors.text, lineHeight: 21 },
  captionName: { ...typography.bodyStrong, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
