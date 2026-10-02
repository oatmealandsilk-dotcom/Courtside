import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import Reanimated, { useSharedValue } from 'react-native-reanimated';

import { LikeButton } from '@/components/LikeButton';
import { Tappable } from '@/components/Tappable';
import { COUNT_EDGE, GLYPH_EDGE, MAX_GROW, railCount } from '@/components/ReelCaption';
import { useRailLive, useStageMotion } from '@/features/feed/useStageMotion';
import { useApp } from '@/store/AppContext';
import { font } from '@/theme';

/**
 * The feed's rail, small, beside the clip on the comments stage: the heart,
 * send and save stay to hand while you read (no speech bubble, the comments
 * are open; no dots). An Instant has its heart only. White on the stage's
 * black, with the feed rail's own edge, labels and counts. It fades in over
 * the last of the opening, centred on the stage as the sheet moves, and out
 * with the picture as the sheet goes up to full.
 */
export function StageRail({ kind, id }: { kind: 'post' | 'hit'; id: string }) {
  const { posts, stories, currentUserId, saved, actions } = useApp();
  const height = useSharedValue(0);
  const motion = useStageMotion('rail', { railHeight: height });
  const live = useRailLive();
  const post = kind === 'post' ? posts.find((p) => p.id === id) : undefined;
  const story = kind === 'hit' ? stories.find((st) => st.id === id) : undefined;
  if (!post && !story) return null;
  const liked = !!currentUserId && (post ?? story)!.likedBy.includes(currentUserId);
  const isSaved = !!post && saved.postIds.includes(post.id);
  return (
    <Reanimated.View
      ref={motion.ref as never}
      pointerEvents={live ? 'box-none' : 'none'}
      onLayout={(e) => { height.value = e.nativeEvent.layout.height; }}
      style={[styles.rail, motion.style]}
    >
      {post ? (
        <>
          <LikeButton ledgerKey={`p:${post.id}`} liked={liked} count={post.likedBy.length} onToggle={() => actions.toggleLike(post.id)} likesRoute={{ pathname: '/likes', params: { id: post.id } }} what="clip" size={26} style={styles.action} glyphStyle={GLYPH_EDGE} labelStyle={styles.count} />
          <Tappable accessibilityLabel="Send this clip to someone" onPress={() => router.push(`/share?kind=post&id=${post.id}`)} scaleTo={0.78} style={styles.action}>
            <Ionicons name="arrow-redo-outline" size={26} color="white" style={GLYPH_EDGE} />
            <Text style={styles.count} maxFontSizeMultiplier={MAX_GROW}>{railCount(post.shares ?? 0)}</Text>
          </Tappable>
          <Tappable accessibilityLabel={isSaved ? 'Remove from saved' : 'Save this clip'} onPress={() => actions.toggleSavePost(post.id)} scaleTo={0.78} style={styles.action}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={25} color="white" style={GLYPH_EDGE} />
            <Text style={styles.count} maxFontSizeMultiplier={MAX_GROW}>{railCount(post.savedBy?.length ?? 0)}</Text>
          </Tappable>
        </>
      ) : story ? (
        <LikeButton ledgerKey={`h:${story.id}`} liked={liked} count={story.likedBy.length} onToggle={() => actions.toggleLikeStory(story.id)} likesRoute={{ pathname: '/likes', params: { id: story.id, kind: 'hit' } }} what="hit" size={26} style={styles.action} glyphStyle={GLYPH_EDGE} labelStyle={styles.count} />
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // 12 in from the edge, 48 wide, as the feed's rail; its place up and down is set every frame (centred on the stage).
  rail: { position: 'absolute', top: 0, right: 12, width: 48, gap: 14, alignItems: 'center' },
  // Every button a full 48 square to the thumb.
  action: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 48, minHeight: 48 },
  // White on the stage's black (the media exception in DESIGN.md), with the rail's darkest edge.
  count: { color: 'white', fontSize: 12, lineHeight: 15, ...font('600'), letterSpacing: 0.1, fontVariant: ['tabular-nums'], ...COUNT_EDGE },
});
