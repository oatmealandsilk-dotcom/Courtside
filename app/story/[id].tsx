import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayback } from '@/components/ClipPlayback';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { Avatar, Button, EmptyState } from '@/components/ui';
import { isLive } from '@/features/stories/stories';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

/** How long a photo stays up. A video gets longer, and either can be tapped past. */
const PHOTO_MS = 5000;
const VIDEO_MS = 12000;

/**
 * Full-screen story viewer for one player. Tap the right side to move on, the
 * left to go back; the last one closes. Opened from the archive with ?story=,
 * it shows that one story on its own, live or not.
 */
export default function StoryViewer() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { id, story: only } = useLocalSearchParams<{ id: string; story?: string }>();
  const { stories, users, currentUserId, actions } = useApp();
  const user = users.find((u) => u.id === id);
  const mine = user?.id === currentUserId;

  const list = useMemo(
    () =>
      stories
        .filter((s) => s.authorId === id && (only ? s.id === only : isLive(s)))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [stories, id, only],
  );
  const [index, setIndex] = useState(0);
  const current = list[Math.min(index, list.length - 1)];
  const progress = useRef(new Animated.Value(0)).current;

  // Count the view, then run the bar; when it fills, move along.
  useEffect(() => {
    if (!current) return;
    actions.markStoryViewed(current.id);
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: current.videoUrl ? VIDEO_MS : PHOTO_MS, useNativeDriver: false });
    run.start(({ finished }) => {
      if (!finished) return;
      if (index < list.length - 1) setIndex(index + 1);
      else router.back();
    });
    return () => run.stop();
  }, [current?.id, index, list.length, actions, progress]);

  if (!user || !current) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
        <EmptyState title="Nothing to show" body="This story has gone." />
      </View>
    );
  }

  const step = (direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0) { progress.setValue(0); return; }
    if (next >= list.length) { router.back(); return; }
    setIndex(next);
  };

  const archive = () => {
    actions.toggleArchiveStory(current.id);
    if (only || list.length === 1) router.back();
    else if (index >= list.length - 1) setIndex(Math.max(0, index - 1));
  };

  const viewers = current.viewedBy.filter((v) => v !== current.authorId).length;

  return (
    <View style={styles.root}>
      <View style={styles.media}>
        {current.videoUrl ? (
          <ClipPlayback uri={current.videoUrl} poster={current.thumbnailUrl} active preload />
        ) : current.imageUrl ? (
          <Image accessibilityIgnoresInvertColors source={{ uri: current.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <MediaPlaceholder label={current.mediaLabel ?? 'Story'} seed={current.id} portrait />
          </View>
        )}
      </View>

      {/* Tap zones: a third on the left goes back, the rest goes forward. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Previous story" onPress={() => step(-1)} style={styles.zoneLeft} />
      <Pressable accessibilityRole="button" accessibilityLabel="Next story" onPress={() => step(1)} style={styles.zoneRight} />

      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.bars}>
          {list.map((s, i) => (
            <View key={s.id} style={styles.barTrack}>
              <Animated.View
                style={[styles.barFill, {
                  width: i < index ? '100%' : i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%',
                }]}
              />
            </View>
          ))}
        </View>
        <View style={styles.head}>
          <Pressable accessibilityRole="link" onPress={() => router.push(`/user/${user.id}`)} style={styles.who}>
            <Avatar name={user.name} seed={user.avatarSeed} size={34} />
            <Text style={styles.name}>{mine ? 'Your story' : user.name}</Text>
            <Text style={styles.time}>{relativeTime(current.createdAt)}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}
        {mine ? (
          <View style={styles.ownRow}>
            <View style={styles.views}>
              <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
              <Text style={styles.viewsText}>{viewers} {viewers === 1 ? 'view' : 'views'}</Text>
            </View>
            {isLive(current) || current.archived ? (
              <Button
                label={current.archived ? 'Unarchive' : 'Archive'}
                variant="secondary"
                onPress={archive}
              />
            ) : (
              <Text style={styles.viewsText}>Expired · in your archive</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F0C' },
  close: { alignSelf: 'flex-end', padding: spacing.md },
  media: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  placeholder: { width: '100%', maxWidth: 520, padding: spacing.lg },
  zoneLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%' },
  zoneRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '67%' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: spacing.md, gap: spacing.sm },
  bars: { flexDirection: 'row', gap: 4 },
  barTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#FFFFFF' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.smallStrong, color: '#FFFFFF', textShadowColor: '#0009', textShadowRadius: 4 },
  time: { ...typography.small, color: 'rgba(255,255,255,0.75)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.md },
  caption: {
    ...typography.body, color: '#FFFFFF', lineHeight: 22,
    textShadowColor: '#000A', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  ownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  views: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewsText: { ...typography.smallStrong, color: '#FFFFFF' },
});
