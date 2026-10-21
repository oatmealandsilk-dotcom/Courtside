import { PRESS_DIM } from '@/theme/press';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtSpinner } from '@/components/CourtSpinner';
import { ShareDensity } from '@/components/share/density';
import { SessionStoryArt, seeThrough, storyDesigns, themed, type StoryDesign } from '@/components/share/SessionStoryArt';
import { ShareActions } from '@/components/share/ShareActions';
import { EmptyState, Screen } from '@/components/ui';
import { postedIndex, sourceOn } from '@/features/activity/recent';
import { useTennisFlags } from '@/features/activity/useTennisFlags';
import { storyFromLog, storyFromPost, type SessionStory } from '@/features/share/sessionStory';
import { canScore } from '@/features/activity/score';
import { AddScore } from '@/components/session/ScoreField';
import { INSTAGRAM_NOTE, STICKER_COPY, exportStory, stageSize, stickerDensity, storyNoteOk, warmStory, type StoryAction, type StoryLook, type StorySticker } from '@/features/share/storyImage';
import { closedWithoutSharing, sharedFromScreen } from '@/features/share/afterPost';
import { mixHex } from '@/features/activity/zones';
import { HOME, goBack } from '@/lib/goBack';
import * as haptics from '@/lib/haptics';
import { show as showToast } from '@/lib/toast';
import { setUploadAside, useUploadState } from '@/lib/uploads';
import { useApp } from '@/store/AppContext';
import { ThemeScope, themes, useTheme, useThemedStyles, type ThemeName } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, radius, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * Share a session to Instagram, the way Strava does: four pictures to swipe
 * between (your photo with the session card on it, the card filling the
 * story, the card alone as a see-through sticker, and the numbers alone as a
 * see-through overlay), and a fifth, Heart rate, when the post shares its
 * zones and heart rate (the time and calories over one bar per zone, also
 * see-through), then Instagram Stories, Copy, Save or More. Opened
 * with ?post= (one of your posts with a session) or ?session= (a session in
 * your log; when it is on a post, the post's numbers and photo are used).
 * Only your own: anyone else's is not found.
 *
 * The pictures take the room at the top; "Add score" and the buttons sit at
 * the bottom, in thumb's reach, as Strava's do (Oct 5 polish). What a button
 * did (Copied, Saved) is said in a toast, so nothing moves under the finger;
 * Instagram's own steps, when an older iPhone build hands the picture over by
 * the clipboard, stay on a line under the buttons until you change design.
 *
 * Since Oct 15: every see-through design previewed on a checkerboard, never
 * your photo; colour dots under the names that redraw Photo, Card and
 * Sticker in another court's colours (these pictures only, never the app),
 * Clear the first of them and where the screen starts, which draws those
 * three with nothing filled; and Send, to someone on CourtSide, since a
 * post's share arrow opens here.
 *
 * And it opens by itself straight after a session's post goes up, Strava's
 * way (?posted=1, Oct 15, owner: "Like strava"; features/share/afterPost.ts):
 * then it is "Share your session", with a quiet line saying the post is up
 * (or still going up) and Done, back to the feed, in place of the back arrow.
 * Everything else is as ever.
 *
 * Each picture is drawn twice: small to look at, and once more out of sight
 * at exactly 1080 × 1920 pixels, which is the one photographed (storyImage.ts).
 */
/** Room above and below the preview for its shadow, which the swiping row would otherwise cut off. */
const SHADOW_ROOM = 16;
/** Space between the designs as they sit side by side. */
const CARD_GAP = 14;
/** What the page keeps for everything but the pictures: the title, the designs' names, the colour dots, Add score and the buttons. */
const CHROME_H = 424;
/** Straight after posting, the quiet line under the title and its gap: the pictures give up that much. */
const POSTED_LINE = 20;
/** One side of a square of the see-through checkerboard, in points: small, so it reads as a calm texture. */
const CHECK = 6;

/** What a colour dot paints with: a court, or Clear (nothing filled, no court's colours). */
type Paint = ThemeName | 'clear';

/**
 * The colour dots under the pictures (Oct 15, owner: "do the color changing
 * for the cards"): Clear first (owner, the same night: "make clear also a dot,
 * and make it the first one"), then one per court, named for its city, never
 * the tournament (trademarks). Clean only when it is the court you use, so
 * the dot you start on is always there.
 */
const PAINTS: { name: Paint; label: string }[] = [
  { name: 'clear', label: 'Clear' },
  { name: 'default', label: 'Light' },
  { name: 'night', label: 'Dark' },
  { name: 'ao', label: 'Melbourne' },
  { name: 'roland-garros', label: 'Paris' },
  { name: 'wimbledon', label: 'London' },
  { name: 'us-open', label: 'New York' },
];

/**
 * How Instagram's story editor gets each design: Photo and Card as the whole
 * story; Sticker, Overlay and Heart rate as a sticker over two colours. The stamp sits on
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
function storyLook(design: StoryDesign, paint: Paint, own: ThemeName): StoryLook {
  // Heart rate is white words on nothing too, so it goes over the same two colours; so do Card and
  // Sticker under the Clear dot.
  if (design === 'overlay' || design === 'heart' || (paint === 'clear' && (design === 'card' || design === 'sticker'))) {
    const deep = (pageIsDark() ? colors.bg : colors.text).slice(0, 7);
    return { sticker: true, top: mixHex(deep, colors.court.slice(0, 7), 0.15), bottom: deep };
  }
  // Photo, Card and Sticker: the court picked with the colour dots (your own under a Clear Photo).
  const court = themes[paint === 'clear' ? own : paint];
  return { sticker: design === 'sticker', top: court.brand.slice(0, 7), bottom: court.bg.slice(0, 7) };
}

/**
 * What a see-through design is previewed on: the checkerboard that means
 * "see-through" everywhere (Oct 15, owner: "the options should be transparent
 * background not with the photo in the back"), so nobody wonders whether the
 * photo goes too. Two dark greys, so the white numbers and the green mark read
 * on it. One drawn tile of four squares, repeated: cheap at any size.
 */
function Checker({ check = CHECK, light = false }: { check?: number; light?: boolean }) {
  const id = `check${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // `light`: white and pale grey, the see-through sign everyone knows, for the small Clear dot.
  const square = light ? withAlpha(colors.checkerAlt, 0.28) : colors.checkerAlt;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: light ? colors.onMedia : colors.checker }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} width={check * 2} height={check * 2} patternUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={check} height={check} fill={square} />
            <Rect x={check} y={check} width={check} height={check} fill={square} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * One design's card in the row: the picture, its checkerboard when see-through, and Photo's
 * "Choose a photo". On its own and memoised, so the row crossing halfway to the next design
 * (which changes the one showing) does not redraw every card while the swipe is still moving.
 */
const DesignCard = memo(function DesignCard({ design, label, court, story, cardW, cardH, photo, blockedIds, clear, see, onChoosePhoto }: {
  design: StoryDesign; label: string; court: ThemeName; story: SessionStory; cardW: number; cardH: number;
  photo: React.ComponentProps<typeof SessionStoryArt>['photo']; blockedIds: string[]; clear: boolean; see: boolean; onChoosePhoto: () => void;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.frame, { width: cardW, height: cardH }]} accessible accessibilityLabel={`${label} design`}>
      {/* A see-through design is shown on the see-through checkerboard, never your photo: only Photo has the photo. */}
      {see ? <Checker /> : null}
      <ThemeScope theme={court}>
        <SessionStoryArt design={design} story={story} width={cardW} photo={photo} hidden={blockedIds} clear={clear} />
      </ThemeScope>
      {design === 'photo' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Choose a photo'} onPress={onChoosePhoto} style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
          <View style={styles.photoChip}>
            <Ionicons name="image-outline" size={14} color={colors.onMedia} />
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.photoButtonText}>{photo ? 'Change photo' : 'Choose a photo'}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
});

export default function ShareSession() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { post: postParam, session: sessionParam, posted: postedParam } = useLocalSearchParams<{ post?: string; session?: string; posted?: string }>();
  const { posts, sessions, detectedActivities, currentUser, currentUserId, blockedIds, ready, actions } = useApp();
  // Opened by itself straight after posting (see above): "Share your session", with Done.
  const posted = postedParam === '1' && !!postParam;
  const flags = useTennisFlags();
  const { theme } = useTheme();
  // What the share pictures are drawn in: Clear until you tap a colour dot (Oct 15, owner: "it should
  // start on clear"). Only these pictures change, never the app.
  const [painted, setPainted] = useState<Paint | null>(null);
  const paint: Paint = painted ?? 'clear';
  const paints = theme === 'clean' ? [...PAINTS, { name: 'clean' as Paint, label: 'Clean' }] : PAINTS;
  // The Clear dot: Photo, Card and Sticker with the Clear stamp, and in no court's colours (your own court around them).
  const clearPaint = paint === 'clear';
  const courtOf = (d: StoryDesign): ThemeName => (themed(d) && paint !== 'clear' ? paint : theme);
  const clearOf = (d: StoryDesign) => clearPaint && themed(d);

  const liveStory = useMemo((): SessionStory | null => {
    const me = currentUser ?? undefined;
    let post = postParam ? posts.find((p) => p.id === postParam && p.authorId === currentUserId) : undefined;
    // Straight after posting, one whose photo or clip is still going up is in nobody's list yet: drawn from
    // what is going up (its picture still on this phone), so the screen never waits for the upload.
    if (!post && posted && postParam) {
      const going = actions.outgoingPost(postParam);
      if (going?.authorId === currentUserId) post = going;
    }
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
  }, [postParam, sessionParam, posts, sessions, detectedActivities, currentUser, currentUserId, flags, posted, actions]);
  // Posted, then gone (a photo or clip that didn't go up after all): the pictures stay as last drawn, the session still yours to share.
  const lastDrawn = useRef<SessionStory | null>(null);
  if (posted && liveStory) lastDrawn.current = liveStory;
  const story = liveStory ?? (posted ? lastDrawn.current : null);
  const postGone = posted && !liveStory && !!story;
  // How its upload is going, if it has one, said in the line under the title (the strip stands aside meanwhile, below).
  const upload = useUploadState(posted ? postParam : undefined);

  const { height: windowH } = useWindowDimensions();
  const [pageW, setPageW] = useState(0);
  // Narrow enough that the designs either side peek in, the way Strava's share screen shows there is more to swipe (Oct 5, owner).
  const chrome = CHROME_H + (posted ? POSTED_LINE : 0);
  const cardW = Math.floor(Math.max(150, Math.min(290, pageW - 96, ((windowH - chrome - insets.top - insets.bottom) * 9) / 16)));
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
  // Straight after posting, the picture first drawn stays: a photo still going up is the copy on this phone,
  // and it never blinks out while the hosted one loads once the post has landed.
  const heldPhoto = useRef<string | undefined>(undefined);
  if (posted && !heldPhoto.current && story?.photo) heldPhoto.current = story.photo;
  const photo = picked ?? heldPhoto.current ?? story?.photo;
  // The four designs, and Heart rate after them when the post shares its zones and heart rate (storyDesigns).
  const designs = useMemo(() => storyDesigns(story), [story]);
  // Each card's ease as you swipe (full size in the middle, its neighbours a touch smaller and quieter), made once per row.
  const looks = useMemo(() => designs.map((_, i) => {
    const range = [(i - 1) * step, i * step, (i + 1) * step];
    return {
      opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' }),
      transform: [{ scale: scrollX.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' }) }],
    };
  }), [step, designs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Photo's "Choose a photo", the same function every render (the cards are memoised), always running the latest.
  const choosePhotoRef = useRef<() => Promise<void>>(async () => {});
  const onChoosePhoto = useCallback(() => { void choosePhotoRef.current(); }, []);
  const [index, setIndex] = useState<number | null>(null);
  const shownIndex = Math.min(index ?? (story?.photo ? 0 : 1), designs.length - 1);
  const design: StoryDesign = designs[shownIndex].key;

  const pager = useRef<ScrollView>(null);
  const placed = useRef(false);
  useEffect(() => {
    if (!pageW || placed.current || !story) return;
    placed.current = true;
    pager.current?.scrollTo({ x: shownIndex * step, y: 0, animated: false });
  }, [pageW, story, shownIndex, step]);
  // A tap on a name glides the row there; the designs it passes on the way are not the one picked,
  // so the dot stays on the tapped name instead of flickering across the ones between (Oct 17, owner:
  // "the animation is weird ... it flickers between the two options"). A finger on the row takes over.
  const heading = useRef<number | null>(null);
  const headingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (headingTimer.current) clearTimeout(headingTimer.current); }, []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageW) return;
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.max(0, Math.min(designs.length - 1, Math.round(x / step)));
    if (heading.current !== null) {
      if (i === heading.current && Math.abs(x - i * step) < 2) heading.current = null;
      return;
    }
    if (i !== shownIndex) setIndex(i);
  };
  const goTo = (i: number) => {
    heading.current = i;
    if (headingTimer.current) clearTimeout(headingTimer.current);
    // In case the row never quite reports arriving: from then on the row's own position decides again.
    headingTimer.current = setTimeout(() => { heading.current = null; }, 700);
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

  // A see-through design's sticker, sharper (Oct 16, owner: "the courtside overlays are kinda blurry, pixelated,
  // make it super high quality"; storyImage.ts). It is still the whole story, framed exactly as today's, so
  // Instagram drops it in at today's size and spot (Oct 17); only it has `density` times the pixels, so it stays
  // sharp when pinched bigger. On a phone the story is drawn once more, out of sight and `density` times bigger,
  // only while it is photographed, then let go, so an older iPhone never keeps a big picture about; a browser
  // draws the hidden copy above at a finer scale.
  const bigStage = useRef<View>(null);
  const density = stickerDensity(design === 'card');
  const big = { width: size.width * density, height: size.height * density };
  const [bigCopy, setBigCopy] = useState(false);
  const bigLaidOut = useRef<(() => void) | null>(null);
  const drawBigCopy = async (): Promise<View | null> => {
    if (!STICKER_COPY) return stage.current;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      bigLaidOut.current = () => { clearTimeout(timer); resolve(); };
      setBigCopy(true);
    });
    bigLaidOut.current = null;
    // Laid out, then drawn: two frames.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return bigStage.current;
  };

  // Straight after posting, the post's upload is said in the line under the title, not on the strip across
  // the top, which would sit over the title and Done (a failure still shows there). Back on it once closed.
  useEffect(() => {
    if (!posted || !postParam) return undefined;
    setUploadAside(postParam, true);
    return () => setUploadAside(postParam, false);
  }, [posted, postParam]);
  // Strava's way without the nag (afterPost.ts): closed straight after posting without sharing counts toward
  // it no longer opening by itself; anything shared from here, however it was opened, starts the count again.
  const shared = useRef(false);
  const noteShared = () => {
    shared.current = true;
    if (currentUserId) sharedFromScreen(currentUserId);
  };
  useEffect(() => {
    if (!posted || !currentUserId) return undefined;
    const me = currentUserId;
    return () => { if (!shared.current && lastDrawn.current) closedWithoutSharing(me); };
  }, [posted, currentUserId]);

  const [busy, setBusy] = useState<StoryAction | null>(null);
  // Instagram's steps (INSTAGRAM_NOTE), kept under the buttons for when you come back from Instagram;
  // gone once you pick another design or tap again.
  const [steps, setSteps] = useState<string | null>(null);
  useEffect(() => { setSteps(null); }, [design]);
  const run = async (action: StoryAction) => {
    if (busy) return;
    noteShared();
    setBusy(action);
    setSteps(null);
    try {
      // The photo has to have drawn in the hidden copy first: a few seconds at most.
      if (design === 'photo') {
        for (let t = 0; t < 50 && waitFor.current === 'loading'; t += 1) await new Promise((r) => setTimeout(r, 100));
      }
      // A see-through design goes into a story as a sticker: the whole story, sharper (Oct 16, see drawBigCopy).
      const look = storyLook(design, paint, theme);
      const sticker: StorySticker | undefined = look.sticker && (action === 'copy' || action === 'instagram') ? { view: await drawBigCopy(), density } : undefined;
      // Your invite link goes along as words (Copy, More), never on the picture: Strava's way (Oct 5).
      const said = await exportStory(stage.current, action, 'My session on CourtSide', look, story?.invite, sticker);
      if (!said) haptics.commit();
      else if (said === INSTAGRAM_NOTE) { haptics.commit(); setSteps(said); }
      else if (storyNoteOk(said)) { haptics.commit(); showToast({ title: said, icon: 'checkmark-circle-outline', long: said.length > 40 }); }
      else showToast({ title: 'That didn’t work', body: said, icon: 'alert-circle-outline', long: true });
    } catch (error) {
      showToast({ title: 'That didn’t work', body: error instanceof Error && error.message ? error.message : 'The picture could not be made. Try again.', icon: 'alert-circle-outline', long: true });
    } finally {
      setBigCopy(false);
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
  choosePhotoRef.current = choosePhoto;

  // Straight after posting: Done, in place of the back arrow, back to the feed the post landed on (the feed
  // itself when this was the first page opened, a browser reloaded on it). Otherwise the way back, as ever.
  const doneButton = (
    <Pressable accessibilityRole="button" accessibilityLabel="Done" hitSlop={{ top: 9, bottom: 9, left: 10, right: 10 }} onPress={() => goBack(HOME)} style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.doneText}>Done</Text>
    </Pressable>
  );
  const header = posted ? { title: 'Share your session', right: doneButton } : { title: 'Share', onBack: () => goBack('/your-sessions') };
  // Under the title: the post is up (or still going up, or didn't go up after all), and the ask.
  const postedLine = !posted ? undefined
    : postGone ? 'Your post didn’t go up.'
    : upload === 'uploading' ? 'Posting… Add it to your story?'
    : 'Posted. Add it to your story?';

  if (!story) {
    return (
      <Screen {...header} compactTitle bar={false}>
        {/* Opened from a link while the app is still loading: wait for it before saying it is gone. */}
        {!ready ? <View style={styles.wait}><CourtSpinner size={28} /></View> : (
          <EmptyState icon="image-outline" title="This session is not here any more" body="It may have been deleted, or it is not yours to share." />
        )}
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      {/* The copy that is photographed: full size, out of sight under the page. */}
      <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, size]}>
        <View ref={stage} collapsable={false} style={size}>
          <ThemeScope theme={courtOf(design)}>
            <SessionStoryArt design={design} story={story} width={size.width} photo={photo} hidden={blockedIds} clear={clearOf(design)} onPhotoLoad={(ok) => { if (photo) setLoaded((was) => (was?.uri === photo && was.ok === ok ? was : { uri: photo, ok })); }} />
          </ThemeScope>
        </View>
      </View>
      {/* A phone's sticker: the same story, `density` times bigger, drawn only while it is photographed (drawBigCopy). */}
      {bigCopy ? (
        <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, big]} onLayout={() => bigLaidOut.current?.()}>
          <View ref={bigStage} collapsable={false} style={big}>
            <ShareDensity.Provider value={density}>
              <ThemeScope theme={courtOf(design)}>
                <SessionStoryArt design={design} story={story} width={big.width} hidden={blockedIds} clear={clearOf(design)} />
              </ThemeScope>
            </ShareDensity.Provider>
          </View>
        </View>
      ) : null}
      <View style={styles.page}>
        <Screen {...header} subtitle={postedLine} compactTitle bar={false} padded={false} scroll={false}>
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
                  onScrollBeginDrag={() => { heading.current = null; }}
                  scrollEventThrottle={16}
                  contentContainerStyle={{ paddingHorizontal: sidePad }}
                  style={{ width: pageW, height: cardH + SHADOW_ROOM * 2, flexGrow: 0 }}
                >
                  {designs.map((d, i) => (
                    // The one in the middle full size; its neighbours a touch smaller and quieter, easing as you swipe.
                    <Animated.View key={d.key} style={[styles.pageSlot, { width: step, height: cardH + SHADOW_ROOM * 2 }, looks[i]]}>
                      <Pressable disabled={i === shownIndex} onPress={() => goTo(i)} accessible={false}>
                        <DesignCard design={d.key} label={d.label} court={courtOf(d.key)} story={story} cardW={cardW} cardH={cardH} photo={photo} blockedIds={blockedIds} clear={clearOf(d.key)} see={seeThrough(d.key, clearOf(d.key))} onChoosePhoto={onChoosePhoto} />
                      </Pressable>
                    </Animated.View>
                  ))}
                </Animated.ScrollView>
              ) : <View style={{ height: cardH + SHADOW_ROOM * 2 }} />}

              {/* The designs' names under the cards, the one showing marked with a dot; a tap goes to it. */}
              <View style={styles.designs} accessibilityRole="tablist">
                {designs.map((d, i) => {
                  const on = i === shownIndex;
                  return (
                    <Pressable key={d.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => goTo(i)} style={styles.design}>
                      <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.designText, on && styles.designTextOn]}>{d.label}</Text>
                      <View style={[styles.designDot, on && styles.designDotOn]} />
                    </Pressable>
                  );
                })}
              </View>

              {/* The colour dots: Clear or a court's colours for Photo, Card and Sticker. Overlay and Heart rate
                  stay CourtSide's own (Oct 10), so the dots fade out for them, keeping their room so nothing moves. */}
              <View
                style={[styles.paints, !themed(design) && styles.paintsOff]}
                pointerEvents={themed(design) ? 'auto' : 'none'}
                accessibilityElementsHidden={!themed(design)}
                importantForAccessibility={themed(design) ? 'auto' : 'no-hide-descendants'}
                aria-hidden={!themed(design)}
                accessibilityRole="radiogroup"
                accessibilityLabel="Colours"
              >
                {paints.map((p) => {
                  const on = p.name === paint;
                  const court = p.name === 'clear' ? null : themes[p.name];
                  return (
                    <Pressable
                      key={p.name}
                      accessibilityRole="radio"
                      accessibilityLabel={p.label}
                      accessibilityState={{ checked: on, disabled: !themed(design) }}
                      // Faded out (Overlay, Heart rate): out of a keyboard's reach too.
                      disabled={!themed(design)}
                      focusable={themed(design)}
                      onPress={() => { if (!on) { haptics.tap(); setPainted(p.name); } }}
                      style={({ pressed }) => [styles.paint, pressed && styles.pressed]}
                    >
                      {/* The court's own card colour, with its lettering's colour in the middle; Clear, the checkerboard that means see-through. */}
                      <View style={[styles.paintRing, on && styles.paintRingOn]}>
                        {court ? (
                          <View style={[styles.paintDot, { backgroundColor: court.cardFill }]}>
                            <View style={[styles.paintInner, { backgroundColor: court.cardFigure }]} />
                          </View>
                        ) : (
                          <View style={[styles.paintDot, styles.paintClear]}>
                            <Checker check={4} light />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* The controls, at the bottom in thumb's reach. */}
            <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
              {addScore ? <AddScore sessionId={addScore} /> : null}
              <ShareActions
                busy={busy}
                onRun={(a) => { void run(a); }}
                steps={steps}
                // Send it to someone on CourtSide, as the post's share arrow did before it came here (Oct 15).
                // Straight after posting, once the post is up: still going up, there is nothing yet for a chat to open.
                onSend={story.postId && !postGone ? () => {
                  noteShared();
                  if (!posts.some((p) => p.id === story.postId)) { showToast({ title: 'Your post is still uploading', body: 'Send it once it is up.', icon: 'cloud-upload-outline' }); return; }
                  router.push({ pathname: '/share', params: { kind: 'post', id: story.postId! } });
                } : undefined}
              />
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
  pressed: { opacity: PRESS_DIM },
  // Done, straight after posting: the way out, in the brand's colour, level with the title (its line is
  // about 27 points tall) rather than halfway down to the line under it; its hitSlop makes the 44-point target.
  done: { alignSelf: 'flex-start', minHeight: 27, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  doneText: { ...typography.bodyStrong, color: colors.brand },
  designs: { flexDirection: 'row', alignSelf: 'center' },
  // Each name is a full 44-point target; the names keep their 16-point rhythm between them.
  design: { alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44, paddingHorizontal: spacing.sm },
  designText: { ...font('600'), fontSize: 13, color: colors.textFaint },
  designTextOn: { color: colors.text },
  designDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  designDotOn: { backgroundColor: colors.brand },
  paints: { flexDirection: 'row', alignSelf: 'center', height: 44, marginTop: -spacing.sm },
  paintsOff: { opacity: 0 },
  // Each dot a full 44-point target; the one showing wears a thin ring in the page's ink.
  paint: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  paintRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  paintRingOn: { borderColor: colors.text },
  paintDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  paintInner: { width: 9, height: 9, borderRadius: 5 },
  paintClear: { overflow: 'hidden' },
});
