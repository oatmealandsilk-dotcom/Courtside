import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Reanimated, { FadeIn } from 'react-native-reanimated';

import { feedFrameRatio, feedShape } from '@/components/MediaPostPage';
import { PostVideo } from '@/components/PostVideo';
import { Avatar } from '@/components/ui';
import type { ID, MediaCrop, SessionDetail, User } from '@/data/types';
import { postZones, zoneColors } from '@/features/activity/zones';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography } from '@/theme';
import { SessionStrip } from './SessionStrip';
import { ZoneBar } from './ZoneBar';

/** The preview's width at most: the feed's post, scaled down so the rest of the composer still shows under it. */
const PREVIEW_W = 300;

export type PreviewMedia = { kind: 'photo' | 'video'; uri?: string; thumbnailUrl?: string; label: string };

/**
 * The post being written, the way the feed will show it (owner, Oct 3): who
 * posts it, the photo or clip at the feed's own shape, the session's stats
 * strip under it exactly as the feed draws it ("43m · Practice · Data by
 * WHOOP", with the health numbers chosen), and the caption as typed, all in
 * a rounded frame, smaller than the feed's. It changes as you write: the
 * caption, the place, what it was, and the numbers chosen under "Share
 * health data". A clip plays from its own button (and goes full screen from
 * its own); a tap on a photo opens the editor. The scissors open the editor
 * (trim, crop, cover) and the × takes the photo or clip off.
 */
export function PostPreview({ media, orientation, edit, session, author, caption, captionIsDefault, location, hidden, onEdit, onRemove }: {
  media: PreviewMedia;
  orientation: 'portrait' | 'landscape';
  edit: { trimStart?: number; trimEnd?: number; muted?: boolean; volume?: number; speed?: number; crop?: MediaCrop };
  session: SessionDetail | null;
  author?: Pick<User, 'name' | 'handle' | 'avatarSeed' | 'avatarUrl'>;
  /** What the post will say: what is typed, or the words it gets when nothing is. */
  caption: string;
  captionIsDefault: boolean;
  location?: string;
  hidden: ID[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { width: winW } = useWindowDimensions();
  const video = media.kind === 'video';
  const landscape = orientation === 'landscape';
  const cover = video ? media.thumbnailUrl : media.uri ?? media.thumbnailUrl;
  // The picture's own shape, as the feed reads it.
  const [shape, setShape] = useState<number | null>(null);
  useEffect(() => {
    setShape(null);
    if (!cover) return undefined;
    let live = true;
    Image.getSize(cover, (w, h) => { if (live && w > 0 && h > 0) setShape(feedShape(landscape, w, h)); }, () => undefined);
    return () => { live = false; };
  }, [cover, landscape]);
  const frameW = Math.min(PREVIEW_W, Math.min(winW, 600) - 32);
  const inner = frameW - 2 * PAD;
  const ratio = feedFrameRatio(landscape, video, shape);
  const mediaH = Math.round(inner / ratio);
  const zones = postZones(session ?? undefined);
  const what = video ? 'clip' : 'photo';
  const where = location?.trim();

  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={[styles.frame, { width: frameW }]}>
      {author ? (
        <View style={styles.who} accessible accessibilityLabel={`Preview of your post as ${author.name}`}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={28} />
          <View style={styles.whoWords}>
            <Text style={styles.name} numberOfLines={1}>{author.name}</Text>
            <Text style={styles.sub} numberOfLines={1}>@{author.handle} · now{where ? ` · ${where}` : ''}</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.media, { width: inner, height: mediaH }]}>
        {video && media.uri ? (
          <PostVideo uri={media.uri} poster={media.thumbnailUrl} active trimStart={edit.trimStart} trimEnd={edit.trimEnd} speed={edit.speed} volume={edit.volume} crop={edit.crop} silent={edit.muted} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Your photo. Edit it" onPress={onEdit} style={StyleSheet.absoluteFill}>
            {cover ? <ExpoImage accessibilityIgnoresInvertColors source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
              <View style={[StyleSheet.absoluteFill, styles.blank]}><Ionicons name="image-outline" size={26} color={colors.textMuted} /></View>
            )}
          </Pressable>
        )}
        {/* Heart-rate zones, when shared: the feed's thin foot along the picture's bottom edge. */}
        {zones ? <ZoneBar zones={zones} colors={zoneColors('media')} height={5} square style={styles.foot} /> : null}
        <View style={styles.tools} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={video ? 'Trim or edit the clip' : 'Edit the photo'} hitSlop={8} onPress={onEdit} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
            <Ionicons name="cut-outline" size={15} color="white" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove the ${what}`} hitSlop={8} onPress={onRemove} style={({ pressed }) => [styles.tool, pressed && styles.pressed]}>
            <Ionicons name="close" size={16} color="white" />
          </Pressable>
        </View>
      </View>
      {session ? <SessionStrip session={session} hidden={hidden} scale={0.9} /> : null}
      {caption ? (
        <Text style={styles.caption} numberOfLines={2}>
          {author ? <Text style={styles.captionName}>{author.handle} </Text> : null}
          <Text style={captionIsDefault ? styles.captionDefault : null}>{caption}</Text>
        </Text>
      ) : null}
    </Reanimated.View>
  );
}

const PAD = 12;

const styleDefinitions = StyleSheet.create({
  // A rounded frame around the post, on the page's own ground, so it reads as "this is your post".
  frame: { alignSelf: 'center', padding: PAD, gap: 10, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  whoWords: { flex: 1, minWidth: 0 },
  name: { ...font('600'), fontSize: 14, color: colors.text },
  sub: { ...font('400'), fontSize: 12, color: colors.textFaint },
  media: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', alignSelf: 'center' },
  blank: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // The editor and the ×, together in the top corner, clear of the clip's own controls along the bottom.
  tools: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 8 },
  tool: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  pressed: { opacity: 0.7 },
  caption: { ...typography.body, fontSize: 14, lineHeight: 19, color: colors.text },
  captionName: { ...font('600'), color: colors.text },
  captionDefault: { color: colors.textMuted },
});
