import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSpinner } from '@/components/CourtSpinner';
import { SessionStoryArt, STORY_DESIGNS, type StoryDesign } from '@/components/share/SessionStoryArt';
import { ShareActions } from '@/components/share/ShareActions';
import { EmptyState, Screen } from '@/components/ui';
import { postedIndex, sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { storyFromLog, storyFromPost, type SessionStory } from '@/features/share/sessionStory';
import { scoreText } from '@/features/activity/score';
import { INSTAGRAM_NOTE, exportStory, stageSize, storyNoteOk, warmStory, type StoryAction, type StoryLook } from '@/features/share/storyImage';
import { mixHex } from '@/features/activity/zones';
import { goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, radius, spacing } from '@/theme';

/**
 * Share a session to Instagram, the way Strava does: four pictures to swipe
 * between (your photo with the session card on it, the card filling the
 * story, the card alone as a see-through sticker, and the numbers alone as a
 * see-through overlay), then Instagram Stories, Copy, Save or More. Opened
 * with ?post= (one of your posts with a session) or ?session= (a session in
 * your log; when it is on a post, the post's numbers and photo are used).
 * Only your own: anyone else's is not found.
 *
 * The pictures take the room at the top; the score and the buttons sit at
 * the bottom, in thumb's reach, as Strava's do (Oct 5 polish). What a button
 * did (Copied, Saved) is said in a toast, so nothing moves under the finger;
 * Instagram's own steps, when an older iPhone build hands the picture over by
 * the clipboard, stay on a line under the buttons until you change design.
 *
 * Each picture is drawn twice: small to look at, and once more out of sight
 * at exactly 1080 × 1920 pixels, which is the one photographed (storyImage.ts).
 */
/** Room above and below the preview for its shadow, which the swiping row would otherwise cut off. */
const SHADOW_ROOM = 16;
/** Space between the designs as they sit side by side. */
const CARD_GAP = 14;
/** What the page keeps for everything but the pictures: the title, the designs' names, the score and the buttons. */
const CHROME_H = 380;

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

/**
 * What a see-through design is previewed over: your photo when there is one
 * (where a pasted sticker usually lands), else the two colours Instagram
 * Stories will put behind it (storyLook), so the preview is what you get.
 */
function StickerGround({ design, photo }: { design: StoryDesign; photo?: string }) {
  const look = storyLook(design);
  if (photo) {
    return (
      <>
        <ExpoImage source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        {/* A touch of shade, as a story's own text sits on: white numbers read on a bright photo too. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.22)' }]} />
      </>
    );
  }
  return <LinearGradient colors={[look.top, look.bottom]} style={StyleSheet.absoluteFill} />;
}

export default function ShareSession() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
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
  const cardW = Math.floor(Math.max(150, Math.min(290, pageW - 96, ((windowH - CHROME_H - insets.top - insets.bottom) * 9) / 16)));
  const cardH = Math.round((cardW * 16) / 9);
  const step = cardW + CARD_GAP;
  const sidePad = Math.max(0, (pageW - cardW) / 2 - CARD_GAP / 2);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [picked, setPicked] = useState<string | undefined>();
  // A match with a score saved in your log (migration 91) starts with it here; typing over it changes only the picture.
  // A posted match reads it from the post's copy of the session, or, when that has none (a score added in
  // the log after posting), from the log itself.
  const logged = story?.session.kind === 'match' && !story.session.sets?.length
    ? sessions.find((s) => s.userId === currentUserId && ((story.session.sessionId && s.id === story.session.sessionId) || (story.session.activityId && s.activityId === story.session.activityId)))
    : undefined;
  const saved = story?.session.kind === 'match' ? scoreText(story.session.sets?.length ? story.session.sets : logged?.sets, true) : '';
  const [score, setScore] = useState(saved);
  const scoreTyped = useRef(false);
  useEffect(() => { if (!scoreTyped.current && saved) setScore(saved); }, [saved]);
  // A workout (a run, the gym: migration 107) has no score: no Score box, and nothing typed goes on its picture.
  // Tennis, and anything logged by hand, keep the box as before.
  const workout = !!story?.session.workout;
  // "6-4 6-3" reads as a score with proper dashes and single spaces.
  const shownScore = !workout && score.trim() ? score.trim().replace(/\s*[-–]\s*/g, '–').replace(/\s+/g, ' ') : undefined;
  const photo = picked ?? story?.photo;
  const [index, setIndex] = useState<number | null>(null);
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
    if (i !== shownIndex) setIndex(i);
  };
  const goTo = (i: number) => {
    setIndex(i);
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
  // Instagram's steps (INSTAGRAM_NOTE), kept under the buttons for when you come back from Instagram;
  // gone once you pick another design or tap again.
  const [steps, setSteps] = useState<string | null>(null);
  useEffect(() => { setSteps(null); }, [design]);
  const run = async (action: StoryAction) => {
    if (busy) return;
    setBusy(action);
    setSteps(null);
    try {
      // The photo has to have drawn in the hidden copy first: a few seconds at most.
      if (design === 'photo') {
        for (let t = 0; t < 50 && waitFor.current === 'loading'; t += 1) await new Promise((r) => setTimeout(r, 100));
      }
      // Your invite link goes along as words (Copy, More), never on the picture: Strava's way (Oct 5).
      const said = await exportStory(stage.current, action, 'My session on CourtSide', storyLook(design), story?.invite);
      if (!said) haptics.commit();
      else if (said === INSTAGRAM_NOTE) { haptics.commit(); setSteps(said); }
      else if (storyNoteOk(said)) { haptics.commit(); showToast({ title: said, icon: 'checkmark-circle-outline', long: said.length > 40 }); }
      else showToast({ title: 'That didn’t work', body: said, icon: 'alert-circle-outline', long: true });
    } catch (error) {
      showToast({ title: 'That didn’t work', body: error instanceof Error && error.message ? error.message : 'The picture could not be made. Try again.', icon: 'alert-circle-outline', long: true });
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
      showToast({ title: 'Your photos could not be opened', icon: 'alert-circle-outline' });
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

  const typedNothing = !score;
  return (
    <View style={styles.root}>
      {/* The copy that is photographed: full size, out of sight under the page. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, size]}>
        <View ref={stage} collapsable={false} style={size}>
          <SessionStoryArt design={design} story={story} width={size.width} photo={photo} hidden={blockedIds} score={shownScore} onPhotoLoad={(ok) => { if (photo) setLoaded((was) => (was?.uri === photo && was.ok === ok ? was : { uri: photo, ok })); }} />
        </View>
      </View>
      <View style={styles.page}>
        <Screen title="Share" compactTitle onBack={() => goBack('/your-sessions')} bar={false} padded={false} scroll={false}>
          <View style={styles.body}>
            {/* The pictures, centred in all the room above the controls. */}
            <View style={styles.top} onLayout={(e) => setPageW(Math.round(e.nativeEvent.layout.width))}>
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
                  style={{ width: pageW, height: cardH + SHADOW_ROOM * 2, flexGrow: 0 }}
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
                            {/* A see-through design is shown over what it will sit on (StickerGround). */}
                            {d.key === 'sticker' || d.key === 'overlay' ? <StickerGround design={d.key} photo={photo} /> : null}
                            <SessionStoryArt design={d.key} story={story} width={cardW} photo={photo} hidden={blockedIds} score={shownScore} />
                            {d.key === 'photo' ? (
                              <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Choose a photo'} onPress={() => { void choosePhoto(); }} style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
                                <View style={styles.photoChip}>
                                  <Ionicons name="image-outline" size={14} color={colors.onMedia} />
                                  <Text style={styles.photoButtonText}>{photo ? 'Change photo' : 'Choose a photo'}</Text>
                                </View>
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
                    <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => goTo(i)} style={styles.design}>
                      <Text style={[styles.designText, on && styles.designTextOn]}>{d.label}</Text>
                      <View style={[styles.designDot, on && styles.designDotOn]} />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* The controls, at the bottom in thumb's reach. */}
            <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
              {/* Any tennis session can carry a score (Oct 4): practice sets and tiebreaks are scored too. A workout has none. */}
              {!workout ? (
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreLabel}>Score</Text>
                  <TextInput
                    value={score}
                    onChangeText={(t) => { scoreTyped.current = true; setScore(t.slice(0, 24)); }}
                    placeholder="Optional, e.g. 6-4 6-3"
                    placeholderTextColor={colors.textFaint}
                    // The hint in the page's regular weight, the score typed in semibold: an empty box never looks filled in.
                    style={[styles.scoreInput, typedNothing && styles.scoreInputEmpty]}
                    returnKeyType="done"
                    autoCorrect={false}
                    accessibilityLabel="Match score, shown on the picture"
                  />
                </View>
              ) : null}
              <ShareActions busy={busy} onRun={(a) => { void run(a); }} steps={steps} />
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
  body: { flex: 1 },
  top: { flex: 1, justifyContent: 'center', gap: spacing.md, minHeight: 0 },
  bottom: { gap: spacing.lg, paddingTop: spacing.md },
  pageSlot: { alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 18, overflow: 'hidden', boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.22)' },
  // "Change photo": a small chip on the picture, in a 44-point corner that takes the tap.
  photoButton: { position: 'absolute', top: 2, right: 2, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  photoChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.overlay },
  photoButtonText: { ...font('600'), fontSize: 12, color: colors.onMedia },
  pressed: { opacity: 0.7 },
  designs: { flexDirection: 'row', alignSelf: 'center' },
  // Each name is a full 44-point target; the names keep their 16-point rhythm between them.
  design: { alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, paddingHorizontal: spacing.sm },
  designText: { ...font('600'), fontSize: 13, color: colors.textFaint },
  designTextOn: { color: colors.text },
  designDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  designDotOn: { backgroundColor: colors.brand },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, paddingHorizontal: 16, height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  scoreLabel: { ...font('600'), fontSize: 14, color: colors.textMuted },
  // The box fills the row's height and centres its own line: sized to the text alone, a phone clipped the bottom of the letters (Oct 5).
  scoreInput: { flex: 1, alignSelf: 'stretch', ...font('600'), fontSize: 16, color: colors.text, paddingVertical: 0, paddingHorizontal: 0, textAlignVertical: 'center' },
  scoreInputEmpty: { ...font('400') },
});
