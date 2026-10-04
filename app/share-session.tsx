import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { SessionStoryArt, STORY_DESIGNS, type StoryDesign } from '@/components/share/SessionStoryArt';
import { Button, EmptyState, Screen } from '@/components/ui';
import { postedIndex, sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { storyFromLog, storyFromPost, type SessionStory } from '@/features/share/sessionStory';
import { canSaveStory, exportStory, stageSize, warmStory, type StoryAction } from '@/features/share/storyImage';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, radius, spacing, typography, withAlpha } from '@/theme';

/**
 * Share a session to Instagram, the way Strava does: three pictures to swipe
 * between (your photo with the session card on it, the card filling the
 * story, the card alone as a see-through sticker), then Instagram Stories,
 * Save image or More…. Opened with ?post= (one of your posts with a session)
 * or ?session= (a session in your log; when it is on a post, the post's
 * numbers and photo are used). Only your own: anyone else's is not found.
 *
 * Each picture is drawn twice: small to look at, and once more out of sight
 * at exactly 1080 × 1920 pixels, which is the one photographed (storyImage.ts).
 */
/** Room above and below the preview for its shadow, which the swiping row would otherwise cut off. */
const SHADOW_ROOM = 16;

export default function ShareSession() {
  const styles = useThemedStyles(styleDefinitions);
  const { post: postParam, session: sessionParam } = useLocalSearchParams<{ post?: string; session?: string }>();
  const { posts, sessions, detectedActivities, currentUser, currentUserId, blockedIds, ready } = useApp();
  const flags = useTennisFlags();

  const story = useMemo((): SessionStory | null => {
    const me = currentUser ?? undefined;
    let post = postParam ? posts.find((p) => p.id === postParam && p.authorId === currentUserId) : undefined;
    const log = sessionParam ? sessions.find((s) => s.id === sessionParam && s.userId === currentUserId) : undefined;
    // A session already on a post shares as the post shows it: its numbers, its photo.
    if (!post && log) {
      const index = postedIndex(posts, currentUserId);
      const id = (log.activityId ? index.get(`a:${log.activityId}`) : undefined) ?? index.get(`s:${log.id}`);
      post = id ? posts.find((p) => p.id === id) : undefined;
    }
    if (post?.session) return storyFromPost(post, me);
    if (log) {
      const found = log.activityId ? detectedActivities.find((a) => a.id === log.activityId) : undefined;
      return storyFromLog(log, me, found && sourceOn(found, flags) ? found : undefined);
    }
    return null;
  }, [postParam, sessionParam, posts, sessions, detectedActivities, currentUser, currentUserId, flags]);

  const { height: windowH } = useWindowDimensions();
  const [pageW, setPageW] = useState(0);
  const cardW = Math.floor(Math.max(150, Math.min(300, pageW - spacing.xl * 2, ((windowH - 400) * 9) / 16)));
  const cardH = Math.round((cardW * 16) / 9);

  const [picked, setPicked] = useState<string | undefined>();
  const photo = picked ?? story?.photo;
  const [index, setIndex] = useState<number | null>(null);
  // What the last button said ("Saved to your downloads…"); a new design clears it.
  const [note, setNote] = useState('');
  const shownIndex = index ?? (story?.photo ? 0 : 1);
  const design: StoryDesign = STORY_DESIGNS[shownIndex].key;

  const pager = useRef<ScrollView>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (!pageW || placed.current || !story) return;
    placed.current = true;
    pager.current?.scrollTo({ x: shownIndex * pageW, y: 0, animated: false });
  }, [pageW, story, shownIndex]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageW) return;
    const i = Math.max(0, Math.min(STORY_DESIGNS.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageW)));
    if (i !== shownIndex) { setIndex(i); setNote(''); }
  };
  const goTo = (i: number) => {
    setIndex(i);
    setNote('');
    pager.current?.scrollTo({ x: i * pageW, y: 0, animated: true });
  };

  // The out-of-sight copy that is photographed, and whether its photo has drawn.
  const stage = useRef<View>(null);
  const size = stageSize();
  const [loaded, setLoaded] = useState<{ uri: string; ok: boolean } | null>(null);
  const photoState = photo ? (loaded?.uri === photo ? (loaded.ok ? 'ready' : 'failed') : 'loading') : 'none';
  const waitFor = useRef(photoState);
  waitFor.current = photoState;
  useEffect(() => { warmStory(); }, []);

  const [busy, setBusy] = useState<StoryAction | null>(null);
  const run = async (action: StoryAction) => {
    if (busy) return;
    setBusy(action);
    setNote('');
    try {
      // The photo has to have drawn in the hidden copy first: a few seconds at most.
      if (design === 'photo') {
        for (let t = 0; t < 50 && waitFor.current === 'loading'; t += 1) await new Promise((r) => setTimeout(r, 100));
      }
      const said = await exportStory(stage.current, action, 'My session on CourtSide');
      if (said) setNote(said);
      else haptics.commit();
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : 'The picture could not be made. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, exif: false });
      if (result.canceled || !result.assets[0]) return;
      setPicked(result.assets[0].uri);
      if (shownIndex !== 0) goTo(0);
    } catch {
      setNote('Your photos could not be opened.');
    }
  };

  if (!story) {
    return (
      <Screen title="Share" compactTitle onBack={() => goBack('/your-sessions')} bar={false}>
        {/* Opened from a link while the app is still loading: wait for it before saying it is gone. */}
        {!ready ? <View style={styles.wait}><CourtSpinner size={28} /></View> : (
          <EmptyState icon="image-outline" title="This session is not here any more" body="It may have been deleted, or it is not yours to share." />
        )}
      </Screen>
    );
  }

  const save = canSaveStory();
  return (
    <View style={styles.root}>
      {/* The copy that is photographed: full size, out of sight under the page. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, size]}>
        <View ref={stage} collapsable={false} style={size}>
          <SessionStoryArt design={design} story={story} width={size.width} photo={photo} hidden={blockedIds} onPhotoLoad={(ok) => { if (photo) setLoaded((was) => (was?.uri === photo && was.ok === ok ? was : { uri: photo, ok })); }} />
        </View>
      </View>
      <View style={styles.page}>
        <Screen title="Share" compactTitle onBack={() => goBack('/your-sessions')} bar={false} padded={false}>
          <View style={styles.body} onLayout={(e) => setPageW(Math.round(e.nativeEvent.layout.width))}>
            {pageW ? (
              <ScrollView
                ref={pager}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                style={{ width: pageW, height: cardH + SHADOW_ROOM * 2 }}
              >
                {STORY_DESIGNS.map((d) => (
                  <View key={d.key} style={[styles.pageSlot, { width: pageW, height: cardH + SHADOW_ROOM * 2 }]}>
                    <View style={[styles.frame, { width: cardW, height: cardH }]} accessible accessibilityLabel={`${d.label} design`}>
                      {/* A see-through sticker is shown over a quiet backdrop, the way it will sit over a story. */}
                      {d.key === 'sticker' || d.key === 'overlay' ? <LinearGradient colors={[withAlpha(colors.text, 0.16), withAlpha(colors.text, 0.38)]} style={StyleSheet.absoluteFill} /> : null}
                      <SessionStoryArt design={d.key} story={story} width={cardW} photo={photo} hidden={blockedIds} />
                      {d.key === 'photo' ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Choose a photo'} onPress={() => { void choosePhoto(); }} style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
                          <Ionicons name="image-outline" size={14} color={colors.onMedia} />
                          <Text style={styles.photoButtonText}>{photo ? 'Change photo' : 'Choose a photo'}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : <View style={{ height: cardH + SHADOW_ROOM * 2 }} />}

            <View style={styles.designs} accessibilityRole="tablist">
              {STORY_DESIGNS.map((d, i) => {
                const on = i === shownIndex;
                return (
                  <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => goTo(i)} hitSlop={6} style={[styles.design, on && styles.designOn]}>
                    <Text style={[styles.designText, on && styles.designTextOn]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.buttons}>
              <Button label="Instagram Stories" onPress={() => { void run('instagram'); }} loading={busy === 'instagram'} disabled={!!busy && busy !== 'instagram'} full />
              <View style={styles.row}>
                <View style={styles.half}><Button label="Copy" variant="secondary" onPress={() => { void run('copy'); }} loading={busy === 'copy'} disabled={!!busy && busy !== 'copy'} full /></View>
                {save ? <View style={styles.half}><Button label="Save image" variant="secondary" onPress={() => { void run('save'); }} loading={busy === 'save'} disabled={!!busy && busy !== 'save'} full /></View> : null}
                <View style={styles.half}><Button label="More…" variant="secondary" onPress={() => { void run('more'); }} loading={busy === 'more'} disabled={!!busy && busy !== 'more'} full /></View>
              </View>
              <Text style={note ? styles.note : styles.fine}>
                {note || (design === 'overlay'
                  ? 'See-through numbers: tap Copy, then paste them onto any Instagram story.'
                  : design === 'sticker'
                  ? 'A see-through sticker: save it, then add it over your own story.'
                  : 'Pick Instagram, then Stories. Health numbers show only if your post shares them.')}
              </Text>
            </View>
          </View>
        </Screen>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  wait: { paddingTop: spacing.xxl, alignItems: 'center' },
  stage: { position: 'absolute', left: 0, top: 0 },
  page: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg },
  body: { gap: spacing.md, paddingBottom: spacing.xxl },
  pageSlot: { alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.22)' },
  photoButton: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.overlay },
  photoButtonText: { ...font('600'), fontSize: 12, color: colors.onMedia },
  pressed: { opacity: 0.7 },
  designs: { flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  design: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  designOn: { backgroundColor: colors.surface },
  designText: { ...typography.smallStrong, color: colors.textMuted },
  designTextOn: { color: colors.text },
  buttons: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  fine: { ...typography.caption, color: colors.textFaint, textAlign: 'center', letterSpacing: 0 },
  note: { ...typography.small, color: colors.text, textAlign: 'center' },
});
