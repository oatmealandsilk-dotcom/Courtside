import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { PostTile } from '@/components/PostTile';
import type { Post, User } from '@/data/types';
import { TILE_RATIO, isClip } from '@/features/places/court';
import type { CourtPostsStatus } from '@/features/places/useCourtPosts';
import { relativeTime } from '@/lib/format';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * "Played here": every post tagged at the court as tall tiles, newest first,
 * three across on a phone, four on a tablet and five on a computer. Pictures
 * only, nothing plays here; a tile opens the court's reel on that post. While
 * the first page is coming there are blank tiles in their places; with
 * nothing posted it asks for the first one (the page's own button posts).
 * No `onPost` (a place with no court id cannot be tagged): no Post link.
 */
export function CourtGrid({ posts, users, status, more, loadingOlder, courtName, onOpen, onOlder, onPost, onRetry }: {
  posts: Post[];
  users: User[];
  status: CourtPostsStatus;
  more: boolean;
  loadingOlder: boolean;
  courtName: string;
  onOpen: (post: Post) => void;
  onOlder: () => void;
  onPost?: () => void;
  onRetry: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { width: windowWidth } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const width = gridW || windowWidth - spacing.lg * 2;
  const cols = width >= 900 ? 5 : width >= 600 ? 4 : 3;
  const tileW = Math.floor(width / cols);
  const tileH = Math.round(tileW * TILE_RATIO);
  const measure = (w: number) => { const next = Math.floor(w); if (next > 0 && next !== gridW) setGridW(next); };

  const head = (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={styles.title}>Played here</Text>
      {posts.length && onPost ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Post from ${courtName}`} hitSlop={8} onPress={onPost} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.headLink}>Post from here</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!posts.length && status === 'loading') {
    return (
      <View>
        {head}
        <View style={styles.grid} onLayout={(e) => measure(e.nativeEvent.layout.width)} accessibilityLabel="Loading posts from here">
          {Array.from({ length: cols * 2 }, (_, i) => <View key={i} style={[styles.blank, { width: tileW, height: tileH }]} />)}
        </View>
      </View>
    );
  }

  if (!posts.length && status === 'failed') {
    return (
      <View>
        {head}
        <View style={styles.failed}>
          <Text style={styles.failedText} accessibilityLiveRegion="polite">Couldn’t load posts from here</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.ghost}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!posts.length) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyTile}><Ionicons name="videocam-outline" size={26} color={colors.brand} /></View>
        <Text style={styles.emptyTitle}>{onPost ? 'Be the first to post from here' : 'Nothing posted from here yet'}</Text>
        <Text style={styles.emptyBody}>Clips and photos tagged at {courtName} show up here.</Text>
      </View>
    );
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  return (
    <View>
      {head}
      <View style={styles.grid} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
        {posts.map((p) => {
          const kind = isClip(p) ? 'Clip' : p.imageUrl ? 'Photo' : 'Post';
          const who = byId.get(p.authorId)?.name ?? 'a player';
          return <PostTile key={p.id} post={p} width={tileW} height={tileH} onPress={() => onOpen(p)} label={`${kind} by ${who}, ${relativeTime(p.createdAt)}: ${p.body}`} />;
        })}
      </View>
      {more ? (
        <View style={styles.older}>
          {loadingOlder ? <CourtSpinner size={22} /> : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onOlder} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.ghost}>Show older posts</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  title: { ...typography.heading, color: colors.text },
  headLink: { ...typography.smallStrong, color: colors.brand },
  pressed: { opacity: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 0 },
  blank: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt },
  failed: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  failedText: { ...typography.small, color: colors.textMuted },
  ghost: { ...typography.smallStrong, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { ...typography.heading, color: colors.text, textAlign: 'center' },
  emptyBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  older: { alignItems: 'center', paddingTop: spacing.xl, minHeight: 44 },
});
