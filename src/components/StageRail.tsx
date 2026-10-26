import React from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, { useSharedValue } from 'react-native-reanimated';

import { LikeButton } from '@/components/LikeButton';
import { RailSave, RailTap } from '@/components/RailButton';
import { RailGlyph } from '@/components/RailGlyph';
import { COUNT_EDGE } from '@/components/ReelCaption';
import { useRailLive, useStageMotion } from '@/features/feed/useStageMotion';
import { shareLabel, sharePost } from '@/features/share/sharePost';
import { useApp } from '@/store/AppContext';
import { font } from '@/theme';

/**
 * The feed's rail, small, beside the clip on the stage under a session's stats
 * sheet (session-stats): the heart, send and save stay to hand while you read
 * (no speech bubble; no dots). The comments no longer show it: there the rail
 * goes with the clip's other buttons, as on TikTok and Instagram (Oct 26,
 * owner: "When I open comments likes comment etc should not be there").
 * An Instant has its heart only. White on the stage's
 * black, with the feed rail's own icons (RailGlyph), press and pop
 * (RailButton), edge and rolling counts. It fades in over
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
          <LikeButton ledgerKey={`p:${post.id}`} liked={liked} count={post.likedBy.length} onToggle={() => actions.toggleLike(post.id)} likesRoute={{ pathname: '/likes', params: { id: post.id } }} what="clip" size={26} style={styles.action} glyphBox={styles.glyph} labelStyle={styles.count} />
          {/* Your own session opens Share session (sharePost.ts); anything else sends, as before.
              Taken down, nobody else could open it: nothing to send (as the feed rail). */}
          {post.removed ? null : (
            <RailTap
              accessibilityLabel={shareLabel(post, currentUserId, 'clip')}
              onPress={() => sharePost(post, currentUserId)}
              glyph={<RailGlyph name="share" size={26} />}
              count={post.shares ?? 0}
              style={styles.action}
              glyphBox={styles.glyph}
              labelStyle={styles.count}
            />
          )}
          <RailSave
            ledgerKey={`s:${post.id}`}
            saved={isSaved}
            count={post.savedBy?.length ?? 0}
            onToggle={() => actions.toggleSavePost(post.id)}
            size={25}
            style={styles.action}
            glyphBox={styles.glyph}
            labelStyle={styles.count}
          />
        </>
      ) : story ? (
        <LikeButton ledgerKey={`h:${story.id}`} liked={liked} count={story.likedBy.length} onToggle={() => actions.toggleLikeStory(story.id)} likesRoute={{ pathname: '/likes', params: { id: story.id, kind: 'hit' } }} what="hit" size={26} style={styles.action} glyphBox={styles.glyph} labelStyle={styles.count} />
      ) : null}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // 12 in from the edge, 48 wide, as the feed's rail; its place up and down is set every frame (centred on the stage).
  rail: { position: 'absolute', top: 0, right: 12, width: 48, gap: 14, alignItems: 'center' },
  // Every button a full 48 square to the thumb.
  action: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 48, minHeight: 48 },
  // Each icon centred in the same box (the heart's count line is held now, as the others', so it sits level with them).
  glyph: { height: 28 },
  // White on the stage's black (the media exception in DESIGN.md), with the rail's darkest edge.
  count: { color: 'white', fontSize: 12, lineHeight: 15, ...font('600'), letterSpacing: 0.1, fontVariant: ['tabular-nums'], ...COUNT_EDGE },
});
