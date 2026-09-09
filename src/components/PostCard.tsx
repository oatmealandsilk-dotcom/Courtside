import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ReelVideo } from '@/components/ReelVideo';
import { Avatar, Card, Chip } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { compactNumber, duration, relativeTime } from '@/lib/format';
import type { Post, User } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  post: Post;
  author: User;
  liked: boolean;
  onToggleLike: () => void;
  onPress: () => void;
  onPressAuthor?: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  onShare?: () => void;
}

const KIND_META: Record<Post['kind'], { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  reel: { label: 'Reel', icon: 'videocam-outline', tint: colors.brand },
  match: { label: 'Set play', icon: 'trophy-outline', tint: colors.brand },
  session: { label: 'Session', icon: 'barbell-outline', tint: colors.court },
  note: { label: 'Note', icon: 'chatbubble-ellipses-outline', tint: colors.hard },
  gear: { label: 'Gear', icon: 'pricetag-outline', tint: colors.clay },
  milestone: { label: 'Milestone', icon: 'flag-outline', tint: colors.warning },
};

export function PostCard({
  post,
  author,
  liked,
  onToggleLike,
  onPress,
  onPressAuthor,
  saved = false,
  onToggleSave,
  onShare,
}: Props) {
  const meta = KIND_META[post.kind];

  return (
    <Card style={styles.card}>
      <Pressable onPress={onPressAuthor} style={styles.header}>
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
        <LevelPill profile={author.profile} small />
      </Pressable>

      {post.videoUrl ? <ReelVideo uri={post.videoUrl} /> : post.kind === 'reel' ? <MediaPlaceholder label={post.mediaLabel ?? 'Reel'} seed={post.id} portrait /> : null}
      <Pressable onPress={onPress} style={styles.body}>
        <View style={[styles.kindRow, { borderColor: `${meta.tint}55` }]}>
          <Ionicons name={meta.icon} size={13} color={meta.tint} />
          <Text style={[styles.kindLabel, { color: meta.tint }]}>{meta.label.toUpperCase()}</Text>
        </View>

        <Text style={styles.text}>{post.body}</Text>

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

        {post.mediaLabel && !post.videoUrl && post.kind !== 'reel' ? <MediaPlaceholder label={post.mediaLabel} seed={post.id}  /> : null}

        {post.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {post.tags.map((tag) => (
              <Chip key={tag} label={`#${tag}`} small />
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={onToggleLike} style={styles.action} accessibilityRole="button">
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={19}
            color={liked ? colors.danger : colors.textMuted}
          />
          <Text style={[styles.actionText, liked && { color: colors.danger }]}>
            {compactNumber(post.likedBy.length)}
          </Text>
        </Pressable>
        <Pressable onPress={onPress} style={styles.action} accessibilityRole="button">
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={styles.actionText}>{compactNumber(post.commentIds.length)}</Text>
        </Pressable>
        {onShare ? (
          <Pressable
            onPress={onShare}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Share this post"
          >
            <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {onToggleSave ? (
          <Pressable
            onPress={onToggleSave}
            style={[styles.action, { marginLeft: 'auto' }]}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={saved ? colors.brand : colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderRadius: 0, borderWidth: 0, borderBottomWidth: 1, paddingHorizontal: 0, paddingBottom: spacing.xl, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.bodyStrong, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint },
  body: { gap: spacing.md },
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
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { ...typography.smallStrong, color: colors.textMuted },
});
