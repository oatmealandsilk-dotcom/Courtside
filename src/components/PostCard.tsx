import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState, memo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as haptics from '@/lib/haptics';
import { Ionicons } from '@expo/vector-icons';

import { ClipVideo } from '@/components/ClipVideo';
import { Tappable } from '@/components/Tappable';
import { Avatar, Card, Chip } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { compactNumber, duration, relativeTime } from '@/lib/format';
import type { Post, QuestionTopic, User } from '@/data/types';
import { RichText } from '@/components/RichText';
import { requestSection } from '@/features/navigation/swipeOrder';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  /** Opens the comments; without it the comment button behaves like a tap on the card. */
  onComment?: () => void;
  post: Post;
  author: User;
  liked: boolean;
  onToggleLike: () => void;
  onPress: () => void;
  onPressAuthor?: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  onShare?: () => void;
  /**
   * How many lines of the post's words to show before the card would outgrow
   * its page. The feed passes this; a page that scrolls leaves it off.
   */
  clamp?: number;
  /** Shown as ••• on your own posts: archive or delete. */
  onArchive?: () => void;
  onDelete?: () => void;
}

/** Which Community topic each kind of post belongs with, for the tappable label. */
const KIND_TOPIC: Record<Post['kind'], QuestionTopic | 'all'> = {
  clip: 'technique', match: 'strategy', session: 'fitness', note: 'all', gear: 'gear', milestone: 'mental',
};

const KIND_META: Record<Post['kind'], { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  clip: { label: 'Clip', icon: 'videocam-outline', tint: colors.brand },
  match: { label: 'Set play', icon: 'trophy-outline', tint: colors.brand },
  session: { label: 'Session', icon: 'barbell-outline', tint: colors.court },
  note: { label: 'Note', icon: 'chatbubble-ellipses-outline', tint: colors.hard },
  gear: { label: 'Gear', icon: 'pricetag-outline', tint: colors.clay },
  milestone: { label: 'Milestone', icon: 'flag-outline', tint: colors.warning },
};

function PostCardInner({
  onComment,
  post,
  author,
  liked,
  onToggleLike,
  onPress,
  onPressAuthor,
  saved = false,
  onToggleSave,
  onShare,
  clamp,
  onArchive,
  onDelete,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = KIND_META[post.kind];

  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${author.name} profile`} onPress={onPressAuthor ?? (() => router.push(`/user/${author.id}`))} style={styles.header}>
        <Avatar name={author.name} seed={author.avatarSeed} size={42} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {author.name}
            </Text>
            {author.isCoach ? (
              <Ionicons name="shield-checkmark" size={14} color={colors.brand} />
            ) : null}
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            @{author.handle} · {relativeTime(post.createdAt)}
          </Text>
        </View>
        {onDelete || onArchive ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Post options" hitSlop={10} onPress={() => setMenuOpen(true)} style={styles.more}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
          </Pressable>
        ) : (
          <LevelPill profile={author.profile} small />
        )}
      </Pressable>
      {menuOpen ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable accessibilityLabel="Close" onPress={() => setMenuOpen(false)} style={styles.backdrop}>
            <View style={styles.sheet}>
              <View style={styles.grabber} />
              {onArchive ? (
                <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); onArchive(); }} style={styles.menuRow}>
                  <Ionicons name={post.archived ? 'arrow-undo-outline' : 'archive-outline'} size={21} color={colors.text} />
                  <Text style={styles.menuLabel}>{post.archived ? 'Unarchive' : 'Archive'}</Text>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable accessibilityRole="button" onPress={() => { setMenuOpen(false); onDelete(); }} style={[styles.menuRow, styles.menuBorder]}>
                  <Ionicons name="trash-outline" size={21} color={colors.danger} />
                  <Text style={[styles.menuLabel, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {post.imageUrl && <Image accessibilityLabel={post.mediaLabel ?? "Post photo"} source={{uri:post.imageUrl}} style={{width:"100%",aspectRatio:1,borderRadius:12}} resizeMode="cover"/>}
      {post.videoUrl ? <ClipVideo uri={post.videoUrl} poster={post.thumbnailUrl} /> : post.kind === 'clip' ? <MediaPlaceholder label={post.mediaLabel ?? 'Clip'} seed={post.id} portrait /> : null}
      <Pressable onPress={onPress} style={styles.body}>
        <Tappable
          accessibilityLabel={`${meta.label}: see discussions about this in Community`}
          onPress={() => { requestSection('/discuss', 'discussions'); requestSection('/discuss#topic', KIND_TOPIC[post.kind]); router.push('/discuss'); }}
          style={[styles.kindRow, { borderColor: `${meta.tint}55` }]}
        >
          <Ionicons name={meta.icon} size={13} color={meta.tint} />
          <Text style={[styles.kindLabel, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
          <Ionicons name="chevron-forward" size={11} color={meta.tint} />
        </Tappable>

        <RichText numberOfLines={clamp} style={styles.text}>{post.body}</RichText>

        {post.match ? (
          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>
              {post.match.won ? 'def.' : 'lost to'} {post.match.opponentName}
            </Text>
            <View style={styles.setRow}>
              {post.match.sets.map((set, i) => (
                <View
                  key={`${set}-${i}`}
                  style={[
                    styles.setChip,
                    { borderColor: post.match?.won ? colors.court : colors.border },
                  ]}
                >
                  <Text style={styles.setText}>{set}</Text>
                </View>
              ))}
              <Text style={styles.surfaceText}>{post.match.surface}</Text>
            </View>
          </View>
        ) : null}

        {post.session ? (
          <View style={styles.detailBox}>
            <Text style={styles.detailTitle}>
              {post.session.focus} · {duration(post.session.minutes)} · intensity {post.session.intensity}/5
            </Text>
            {post.session.drills.map((drill) => (
              <Text key={drill} style={styles.drill}>
                • {drill}
              </Text>
            ))}
          </View>
        ) : null}

        {post.mediaLabel && !post.imageUrl && !post.videoUrl && post.kind !== 'clip' ? <MediaPlaceholder label={post.mediaLabel} seed={post.id}  /> : null}

        {post.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {post.tags.map((tag) => (
              <Chip key={tag} label={`#${tag}`} onPress={() => router.push({pathname:"/search",params:{q:`#${tag}`}})} small />
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        <Tappable onPress={onToggleLike} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: post.id } }); }} scaleTo={0.8} style={styles.action} accessibilityLabel={liked ? 'Unlike. Hold to see who liked it' : 'Like. Hold to see who liked it'}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={23}
            color={liked ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.actionText, liked && { color: colors.danger }]}>
            {compactNumber(post.likedBy.length)}
          </Text>
        </Tappable>
        <Tappable onPress={onComment ?? onPress} scaleTo={0.8} style={styles.action} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
          <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text>
        </Tappable>
        {onShare ? (
          <Tappable onPress={onShare} scaleTo={0.8} style={styles.action} accessibilityLabel="Share this post">
            <Ionicons name="arrow-redo-outline" size={22} color={colors.textMuted} />
          </Tappable>
        ) : null}
        {onToggleSave ? (
          <View style={{ marginLeft: 'auto' }}>
            <Tappable
              onPress={onToggleSave}
              scaleTo={0.8}
              style={styles.action}
              accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}
            >
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={saved ? colors.brand : colors.textMuted}
              />
            </Tappable>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styleDefinitions = StyleSheet.create({
  // In the feed the card sits in a page of fixed height. It shrinks rather
  // than overflowing, and the words below are what gives, so the row of
  // buttons is never sliced through the middle.
  card: { gap: spacing.md, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, paddingHorizontal: 0, paddingBottom: spacing.xl, backgroundColor: colors.bg, flexShrink: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  more: { padding: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: spacing.xxl, paddingTop: spacing.sm, maxWidth: 520, width: '100%', alignSelf: 'center' },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  menuBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  menuLabel: { ...typography.body, color: colors.text },
  headerText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint },
  body: { gap: spacing.md, flexShrink: 1, minHeight: 0 },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  kindLabel: { ...typography.caption },
  text: { ...typography.body, color: colors.text, lineHeight: 22 },
  detailBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detailTitle: { ...typography.smallStrong, color: colors.text },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  setChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  setText: { ...typography.smallStrong, color: colors.text },
  surfaceText: { ...typography.caption, color: colors.textFaint },
  drill: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: {
    flexDirection: 'row',
    gap: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  actionText: { ...typography.bodyStrong, fontSize: 14, color: colors.textMuted },
});

/** Re-renders only when a shown value changes; the handlers passed in read fresh values through their own props, so a new function alone is no reason to rebuild. */
export const PostCard = memo(PostCardInner, (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = (a as Record<string, unknown>)[k]; const y = (b as Record<string, unknown>)[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (x !== y) return false;
  }
  return true;
});
