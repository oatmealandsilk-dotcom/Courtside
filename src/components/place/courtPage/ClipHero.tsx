import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ClipVideo } from '@/components/ClipVideo';
import { TileCover } from '@/components/TileCover';
import { Glass } from '@/components/ui/Glass';
import type { Post } from '@/data/types';
import { cropLayer } from '@/lib/crop';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { corner } from '@/theme/look';

/*
 * The top of a court's page when the court has a clip (Oct 28, owner: "In a
 * screen like this we should have most viral video on the top instead of the
 * plain map. Also the pull up is too high rn. We can show more of the clip on
 * the background. Everything else under is still same").
 *
 * The court's most-watched clip (topClip: only the clips its Clips row already
 * lists for you) plays edge to edge behind the sheet, cropped to fill, muted
 * and looping, with the Feed's own player (ClipVideo and its .web sibling), so
 * it holds still on a page pushed over it and while the app is away, as a Feed
 * clip does. It holds still too once the sheet has gone up over it, and on a
 * browser asked to keep data use down (it shows the clip's cover). Never any
 * sound. A tap opens it the way its tile in Clips does; "See on map" keeps the
 * map a tap away. A soft shade at its foot, so the sheet's top edge reads on
 * any picture; a picture is the ground, so the shade is plain black, as the
 * tiles' is.
 */

/** A browser asked to keep data use down (a phone's data saver): the cover, not the video. */
function savingData(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

export function ClipHero({ post, top, height, over, name, by, covered, onOpen, onOpenMap, offsetY, strip, rounded }: {
  post: Post;
  top: number;
  height: number;
  /** How far the sheet rises over its foot (0 on a computer, where the clip is a card of its own). */
  over: number;
  /** The court's name, for the words a screen reader says. */
  name: string;
  /** Who posted it, for the same. */
  by: string;
  /** The sheet has gone up over it: it holds still. */
  covered: boolean;
  onOpen: () => void;
  onOpenMap: () => void;
  offsetY: SharedValue<number>;
  strip: number;
  rounded: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const [ready, setReady] = useState(false);
  const [saving] = useState(savingData);
  const cover = post.thumbnailUrl ?? post.imageUrl;
  // As the map does: on a phone it drifts up slower than the page, and stretches when pulled down; a browser keeps it still.
  const drift = useAnimatedStyle(() => {
    if (Platform.OS === 'web') return {};
    const y = offsetY.value - strip;
    if (y < 0) return { transform: [{ translateY: y / 2 }, { scale: (height - y) / height }] };
    return { transform: [{ translateY: y * 0.45 }] };
  }, [height, strip]);
  return (
    <View style={[styles.hero, { height }, rounded && styles.rounded]}>
      <Animated.View style={[styles.fill, rounded && styles.rounded, drift]}>
        {post.videoUrl ? (
          <View style={cropLayer(post.crop)}>
            <ClipVideo uri={post.videoUrl} poster={cover} active={!covered && !saving} muted fit="cover" trimStart={post.trimStart} trimEnd={post.trimEnd} speed={post.speed} onReady={(r) => { if (r) setReady(true); }} />
          </View>
        ) : null}
        {/* Its cover until the first frame is in (and for good on data saver), so the top is never a black box. */}
        {cover && (!ready || saving) ? <TileCover accessibilityIgnoresInvertColors uri={cover} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={post.id} /> : null}
        {/* The status bar's words read on any picture: a soft shade under them. */}
        {top ? <LinearGradient pointerEvents="none" colors={['rgba(0, 0, 0, 0.38)', 'rgba(0, 0, 0, 0)']} style={[styles.topShade, { height: top + 56 }]} /> : null}
        <LinearGradient pointerEvents="none" colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.34)']} style={[styles.footShade, { height: 140 }]} />
      </Animated.View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Most watched clip at ${name}, by ${by}. Open it`} onPress={onOpen} style={StyleSheet.absoluteFill} />
      <Pressable accessibilityRole="button" accessibilityLabel={`See ${name} on the map`} hitSlop={6} onPress={onOpenMap} style={({ pressed }) => [styles.mapChip, { bottom: over + spacing.md }, pressed && styles.mapChipPressed]}>
        <Glass radius={radius.pill} style={styles.mapChipGlass}>
          <Ionicons name="map-outline" size={15} color={colors.text} />
          <Text style={styles.mapChipText}>See on map</Text>
        </Glass>
      </Pressable>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { width: '100%', backgroundColor: colors.bgElevated, overflow: 'hidden' },
  rounded: { borderRadius: corner(20), overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  topShade: { position: 'absolute', left: 0, right: 0, top: 0 },
  footShade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  mapChip: { position: 'absolute', right: spacing.lg, borderRadius: radius.pill, boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.14)' },
  // Pressed: a touch smaller, never fainter (no fading over glass).
  mapChipPressed: { transform: [{ scale: 0.97 }] },
  mapChipGlass: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mapChipText: { ...typography.smallStrong, color: colors.text },
});
