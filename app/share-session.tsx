import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { SessionStoryArt, STORY_DESIGNS, type StoryDesign } from '@/components/share/SessionStoryArt';
import { EmptyState, Screen } from '@/components/ui';
import { postedIndex, sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { storyFromLog, storyFromPost, type SessionStory } from '@/features/share/sessionStory';
import { canScore } from '@/features/activity/score';
import { canCopyStory, canSaveStory, exportStory, stageSize, warmStory, type StoryAction, type StoryLook } from '@/features/share/storyImage';
import { mixHex } from '@/features/activity/zones';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';

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
/** Space between the designs as they sit side by side. */
const CARD_GAP = 14;

const ACTIONS: { key: StoryAction; label: string; spoken: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'instagram', label: 'Stories', spoken: 'Share to Instagram Stories', icon: 'logo-instagram' },
  { key: 'copy', label: 'Copy', spoken: 'Copy the picture', icon: 'copy-outline' },
  { key: 'save', label: 'Save', spoken: 'Save the picture', icon: 'download-outline' },
  { key: 'more', label: 'More', spoken: 'More ways to share', icon: 'share-outline' },
];

/**
 * How Instagram's story editor gets each design: Photo and Card as the whole
 * story; Sticker and Overlay as a sticker over two colours. The stamp sits on
 * the court's own brand and page colours. The Overlay is white numbers, so it
 * goes over the court's darkest colour, faintly tinted with the court at the
 * top (Oct 4 audit): on brand-to-page it faded into the cream at the bottom on
 * the default court. Darkest rather than a deepened court colour, because the
 * CourtSide mark under the numbers is in the brand colour, the court's own
 * hue: on deep green it all but vanished (about 1.1-1.4:1 on the cream and
 * London courts); here white reads at 12:1 or better and the mark at about
 * 2.2:1 or better where it sits, plus its light edge. Read when tapped, so a
 * court changed meanwhile is used.
 */
function storyLook(design: StoryDesign): StoryLook {
  if (design === 'overlay') {
    const deep = (pageIsDark() ? colors.bg : colors.text).slice(0, 7);
    return { sticker: true, top: mixHex(deep, colors.court.slice(0, 7), 0.15), bottom: deep };
  }
  return { sticker: design === 'sticker', top: colors.brand.slice(0, 7), bottom: colors.bg.slice(0, 7) };
}

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
  // Narrow enough that the designs either side peek in, the way Strava's share screen shows there is more to swipe (Oct 5, owner).
  const cardW = Math.floor(Math.max(150, Math.min(290, pageW - 96, ((windowH - 400) * 9) / 16)));
  const cardH = Math.round((cardW * 16) / 9);
  const step = cardW + CARD_GAP;
  const sidePad = Math.max(0, (pageW - cardW) / 2 - CARD_GAP / 2);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [picked, setPicked] = useState<string | undefined>();
  // The score is the session's own, saved in your log and drawn by the designs themselves (Oct 6, owner:
  // "practices can have scores too"): no Score box here. A tennis session of yours with none yet offers
  // a quiet "Add score", which opens its edit with the score ready to type, then comes back here.
  const logId = sessionParam ?? story?.session.sessionId;
  const log = logId ? sessions.find((s) => s.id === logId && s.userId === currentUserId) : undefined;
  const addScore = log && canScore(log.kind) && !log.fromSessionId && !log.sets?.length && !story?.session.sets?.length ? log.id : undefined;
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
    pager.current?.scrollTo({ x: shownIndex * step, y: 0, animated: false });
  }, [pageW, story, shownIndex, step]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageW) return;
    const i = Math.max(0, Math.min(STORY_DESIGNS.length - 1, Math.round(e.nativeEvent.contentOffset.x / step)));
    if (i !== shownIndex) { setIndex(i); setNote(''); }
  };
  const goTo = (i: number) => {
    setIndex(i);
    setNote('');
    pager.current?.scrollTo({ x: i * step, y: 0, animated: true });
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
      // Your invite link goes along as words (Copy, More), never on the picture: Strava's way (Oct 5).
      const said = await exportStory(stage.current, action, 'My session on CourtSide', storyLook(design), story?.invite);
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
              <Animated.ScrollView
                ref={pager as never}
                horizontal
                snapToInterval={step}
                decelerationRate="fast"
                disableIntervalMomentum
                showsHorizontalScrollIndicator={false}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onScroll })}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingHorizontal: sidePad }}
                style={{ width: pageW, height: cardH + SHADOW_ROOM * 2 }}
              >
                {STORY_DESIGNS.map((d, i) => {
                  // The one in the middle full size; its neighbours a touch smaller and quieter, easing as you swipe.
                  const range = [(i - 1) * step, i * step, (i + 1) * step];
                  const look = {
                    opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' }),
                    transform: [{ scale: scrollX.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' }) }],
                  };
                  return (
                  <Animated.View key={d.key} style={[styles.pageSlot, { width: step, height: cardH + SHADOW_ROOM * 2 }, look]}>
                    <Pressable disabled={i === shownIndex} onPress={() => goTo(i)} accessible={false}>
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
                    </Pressable>
                  </Animated.View>
                  );
                })}
              </Animated.ScrollView>
            ) : <View style={{ height: cardH + SHADOW_ROOM * 2 }} />}

            {/* The designs' names under the cards, the one showing marked with a dot; a tap goes to it. */}
            <View style={styles.designs} accessibilityRole="tablist">
              {STORY_DESIGNS.map((d, i) => {
                const on = i === shownIndex;
                return (
                  <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => goTo(i)} hitSlop={8} style={styles.design}>
                    <Text style={[styles.designText, on && styles.designTextOn]}>{d.label}</Text>
                    <View style={[styles.designDot, on && styles.designDotOn]} />
                  </Pressable>
                );
              })}
            </View>

            {addScore ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Add score to this session" hitSlop={8} onPress={() => router.push({ pathname: '/log-session', params: { edit: addScore, focus: 'score' } })} style={({ pressed }) => [styles.addScore, pressed && styles.pressed]}>
                <Ionicons name="add" size={15} color={colors.textMuted} />
                <Text style={styles.addScoreText}>Add score</Text>
              </Pressable>
            ) : null}

            {/* Strava's row of round buttons, in CourtSide's colours (Oct 4): Stories leads, the rest follow. */}
            <View style={styles.actions}>
              {ACTIONS.filter((a) => (a.key !== 'save' || save) && (a.key !== 'copy' || canCopyStory())).map((a) => {
                const lead = a.key === 'instagram';
                return (
                  <Pressable key={a.key} accessibilityRole="button" accessibilityLabel={a.spoken} disabled={!!busy} onPress={() => { void run(a.key); }} style={({ pressed }) => [styles.action, pressed && styles.pressed, !!busy && busy !== a.key && styles.dimmed]}>
                    <View style={[styles.actionCircle, lead && styles.actionLead]}>
                      {busy === a.key ? <CourtSpinner size={22} ink={lead ? colors.brandInk : colors.text} /> : <Ionicons name={a.icon} size={24} color={lead ? colors.brandInk : colors.text} />}
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={1}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
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
  designs: { flexDirection: 'row', alignSelf: 'center', gap: spacing.lg },
  design: { alignItems: 'center', gap: 5, paddingVertical: 2 },
  designText: { ...typography.smallStrong, color: colors.textFaint },
  designTextOn: { color: colors.text },
  designDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  designDotOn: { backgroundColor: colors.brand },
  addScore: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 3, paddingVertical: 2 },
  addScoreText: { ...typography.smallStrong, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  action: { alignItems: 'center', gap: 6, width: 64 },
  actionCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actionLead: { backgroundColor: colors.brand, borderColor: colors.brand },
  actionLabel: { ...font('500'), fontSize: 12.5, color: colors.text },
  dimmed: { opacity: 0.45 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  fine: { ...typography.caption, color: colors.textFaint, textAlign: 'center', letterSpacing: 0 },
  note: { ...typography.small, color: colors.text, textAlign: 'center' },
});
