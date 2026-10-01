import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Highlighted, plain } from '@/components/CourtSearch';
import { snippet, startsWord } from '@/features/search/match';
import { TileViews } from '@/components/TileViews';
import type { Post } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font } from '@/theme';

/**
 * One post as a grid tile, the way a profile shows them: its cover picture
 * when it has one, its words when it has not, a play mark and the view
 * count on a clip. Tiles sit edge to edge on a seam of the page colour.
 * Given `words` (a search), a written post shows the words around the
 * match, from the top and a size up, with the match in bold: the match is
 * often further in than a small tile's first lines reach. Found by a tag
 * or a place its words never mention, that tag or place leads the tile.
 */
export function PostTile({ post, width, height, onPress, label, words }: {
  post: Post;
  width: number;
  height: number;
  onPress: () => void;
  /** What a screen reader says; the tile's kind and words when not given. */
  label?: string;
  words?: string[];
}) {
  const styles = useThemedStyles(styleDefinitions);
  const picture = post.thumbnailUrl ?? post.imageUrl;
  const clip = post.kind === 'clip' || !!post.videoUrl;
  // A typed word the words do not hold: the tag or place that held it, so the tile says why it is here.
  const body = words?.length ? plain(post.body) : '';
  const missing = words?.filter((w) => !startsWord(body, w)) ?? [];
  const hits = (text: string) => missing.some((w) => startsWord(plain(text), w));
  const tag = missing.length ? post.tags.map((t) => t.replace(/^#/, '')).find(hits) : undefined;
  const place = missing.length && !tag ? [post.court?.name, post.location].find((x): x is string => !!x && hits(x)) : undefined;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label ?? `Open ${post.kind}: ${post.body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.pressed]}
    >
      {words?.length ? (
        <View style={[StyleSheet.absoluteFill, styles.found]}>
          {tag ? <Highlighted text={`#${tag}`} words={words} style={styles.why} strong={styles.whyMatch} lines={1} wordStart /> : null}
          {place ? (
            <View style={styles.whyPlace}>
              <Ionicons name="location-sharp" size={11} color={colors.textMuted} />
              <Highlighted text={place} words={words} style={[styles.why, styles.whyPlaceText]} strong={styles.whyMatch} lines={1} wordStart />
            </View>
          ) : null}
          <Highlighted text={snippet(post.body, words, 12, 140)} words={words} style={styles.foundText} strong={styles.textMatch} lines={tag || place ? 5 : 6} wordStart />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.blank]}>
          <Text numberOfLines={5} style={styles.text}>{post.body}</Text>
        </View>
      )}
      {picture ? <ExpoImage accessibilityIgnoresInvertColors source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={post.id} transition={120} /> : null}
      {clip ? <Ionicons name="play" size={14} color="#FFFFFF" style={styles.play} /> : null}
      {clip && (post.views ?? 0) > 0 ? <TileViews views={post.views ?? 0} /> : null}
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  tile: { borderWidth: 1, borderColor: colors.bg, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  blank: { padding: 10, justifyContent: 'center' },
  text: { fontSize: 11, lineHeight: 15, color: colors.textMuted },
  found: { padding: 10, justifyContent: 'flex-start' },
  foundText: { fontSize: 12, lineHeight: 16, color: colors.text },
  why: { fontSize: 12, lineHeight: 16, marginBottom: 2, color: colors.brand },
  whyMatch: { ...font('700') },
  whyPlace: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2 },
  whyPlaceText: { flexShrink: 1, marginBottom: 0, color: colors.textMuted },
  textMatch: { ...font('700'), color: colors.text },
  play: { position: 'absolute', top: 6, right: 6, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});
