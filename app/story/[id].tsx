import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from '@/lib/useIsFocused';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { goBack } from '@/lib/goBack';
import { router, useLocalSearchParams } from 'expo-router';
import * as haptics from '@/lib/haptics';
import { useLightStatusWhileFocused } from '@/lib/statusBarStyle';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayback } from '@/components/ClipPlayback';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { Avatar, EmptyState } from '@/components/ui';
import { hitClock, isLive } from '@/features/stories/stories';
import { RemovedNote } from '@/features/moderation/RemovedNote';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { Story } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';
import { useStillLoading } from '@/lib/useStillLoading';
import { CourtSpinner } from '@/components/CourtSpinner';

/** How long a photo stays up. A video gets longer, and either can be tapped past. */
const PHOTO_MS = 5000;
const VIDEO_MS = 12000;

/**
 * Full-screen story viewer for one player. Tap the right side to move on, the
 * left to go back; the last one closes. Opened from the archive with ?story=,
 * it shows that one story on its own, live or not.
 *
 * Its ••• opens the same menu as an Instant's ••• in the feed (post-menu,
 * kind=hit): Archive and Delete on your own, Report, Mute and Block on
 * anyone else's. The viewer is paused while the menu (and any question it
 * asks) is up, and on the way back moves on from an Instant that went.
 */
export default function StoryViewer() {
  const focused = useIsFocused();
  // Stories are shown on black: the clock and battery go light over them.
  useLightStatusWhileFocused();
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { id, story: only } = useLocalSearchParams<{ id: string; story?: string }>();
  const { stories, users, currentUserId, actions } = useApp();
  const loading = useStillLoading();
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
  // The Instant the ••• menu was opened on, as it was then. While the menu is up the viewer keeps
  // showing it, deleted or not, rather than slide on to the next one behind the menu.
  const [held, setHeld] = useState<{ story: Story; archived: boolean } | null>(null);
  const shown = list[Math.min(index, list.length - 1)];
  const current = held && !focused ? (stories.find((st) => st.id === held.story.id) ?? held.story) : shown;
  const progress = useRef(new Animated.Value(0)).current;

  // Count the view and start the bar afresh only when the Instant itself changes.
  useEffect(() => {
    if (!current) return;
    actions.markStoryViewed(current.id);
    progress.setValue(0);
  }, [current?.id, index, actions, progress]);
  // Run the bar while this viewer is the page on screen; when it fills, move
  // along. A page opened on top (comments, a profile, likes) pauses it where it
  // is, and it carries on from there on the way back. It never moves on while
  // covered, or its goBack would close that page instead of the viewer.
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  useEffect(() => {
    if (!current || !focused) return;
    let stopped = false;
    let run: Animated.CompositeAnimation | undefined;
    progress.stopAnimation((value) => {
      if (stopped) return;
      const total = current.videoUrl ? VIDEO_MS : PHOTO_MS;
      run = Animated.timing(progress, { toValue: 1, duration: Math.max(0, (1 - value) * total), useNativeDriver: false });
      run.start(({ finished }) => {
        if (!finished || !focusedRef.current) return;
        if (index < list.length - 1) setIndex(index + 1);
        else goBack('/');
      });
    });
    return () => { stopped = true; run?.stop(); };
  }, [current?.id, index, list.length, focused, progress]);
  // Back from the ••• menu: an Instant that went meanwhile (deleted, reported) or was put away
  // (archived from the rail's viewer) is left behind, the way it was when these lived on the viewer
  // itself: the next one slides into its place, or the viewer closes when there is none.
  // Opened from the archive (?story=), archiving or unarchiving takes you back there.
  useEffect(() => {
    if (!focused || !held) return;
    const was = held;
    setHeld(null);
    const now = stories.find((st) => st.id === was.story.id);
    const stillShown = list.some((st) => st.id === was.story.id);
    if (now && stillShown && !!now.archived === was.archived) return;
    if (only || !list.length) { goBack('/'); return; }
    setIndex((i) => Math.min(i, list.length - 1));
  }, [focused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !current) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack('/')} style={styles.close}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
        {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><CourtSpinner size={28} ink="white" /></View> : <EmptyState title="Nothing to show" body="This Instant has gone." />}
      </View>
    );
  }

  const step = (direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0) { progress.setValue(0); return; }
    if (next >= list.length) { goBack('/'); return; }
    setIndex(next);
  };

  const openMenu = () => {
    setHeld({ story: current, archived: !!current.archived });
    router.push({ pathname: '/post-menu', params: { id: current.id, kind: 'hit' } });
  };

  const viewers = current.viewedBy.filter((v) => v !== current.authorId).length;
  const liked = !!currentUserId && current.likedBy.includes(currentUserId);

  return (
    <View style={styles.root}>
      <View style={styles.media}>
        {current.videoUrl ? (
          <ClipPlayback uri={current.videoUrl} poster={current.thumbnailUrl} active={focused} preload />
        ) : current.imageUrl ? (
          <ExpoImage accessibilityIgnoresInvertColors source={{ uri: current.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={styles.placeholder}>
            <MediaPlaceholder label={current.mediaLabel ?? 'Instant'} seed={current.id} portrait />
          </View>
        )}
      </View>

      {/* Tap zones: a third on the left goes back, the rest goes forward. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Previous Instant" onPress={() => step(-1)} style={styles.zoneLeft} />
      <Pressable accessibilityRole="button" accessibilityLabel="Next Instant" onPress={() => step(1)} style={styles.zoneRight} />

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
            <Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={34} />
            <Text style={styles.name}>{mine ? 'Your Instant' : user.name}</Text>
            <Text style={styles.time}>{relativeTime(current.createdAt)} · {hitClock(current)}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack('/')} style={styles.closeTarget}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {/* Taken down by an admin (migration 108): only its author and admins get here, and see why. */}
        {current.removed ? <RemovedNote removed={current.removed} style={{ alignSelf: 'flex-start' }} /> : null}
        {current.caption ? <Text style={styles.caption}>{current.caption}</Text> : null}
        {/* One row of the same white-on-dark pills, all one height: like and comments on the left; your
            views, then the ••• (Archive, Delete; or Report, Mute, Block) on the right. */}
        <View style={styles.reactRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike Instant. Hold to see who liked it' : 'Like Instant. Hold to see who liked it'} onPress={() => actions.toggleLikeStory(current.id)} onLongPress={() => { haptics.commit(); router.push({ pathname: '/likes', params: { id: current.id, kind: 'hit' } }); }} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E17B7B' : '#FFFFFF'} />
            <Text style={styles.pillText}>{current.likedBy.length}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel={`Comments on this Instant, ${current.commentIds.length}`} onPress={() => router.push(`/hits/${current.id}`)} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}>
            <Ionicons name="chatbubble-outline" size={17} color="#FFFFFF" />
            <Text style={styles.pillText}>{current.commentIds.length}</Text>
          </Pressable>
          <View style={styles.flex} />
          {mine ? (
            <View style={styles.pill} accessibilityLabel={`${viewers} ${viewers === 1 ? 'view' : 'views'}`}>
              <Ionicons name="stats-chart" size={15} color="#FFFFFF" />
              <Text style={styles.pillText}>{viewers} {viewers === 1 ? 'view' : 'views'}</Text>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={openMenu} style={({ pressed }) => [styles.pill, styles.morePill, pressed && styles.pillPressed]}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
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
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, flexShrink: 1 },
  name: { ...typography.smallStrong, color: '#FFFFFF', textShadowColor: '#0009', textShadowRadius: 4 },
  time: { ...typography.small, color: 'rgba(255,255,255,0.75)' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, gap: spacing.md },
  caption: {
    ...typography.body, color: '#FFFFFF', lineHeight: 22,
    textShadowColor: '#000A', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  reactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  // The viewer's one pill: 44 points tall, white on a dark glass, whatever the court's colours.
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, minWidth: 44, paddingHorizontal: 14,
    borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pillPressed: { backgroundColor: 'rgba(0,0,0,0.65)' },
  morePill: { paddingHorizontal: 0, width: 44 },
  pillText: { ...typography.smallStrong, fontSize: 14, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  closeTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
});
