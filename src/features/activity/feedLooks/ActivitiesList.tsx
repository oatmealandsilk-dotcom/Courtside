import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken } from 'react-native';
import Reanimated, { Easing as REasing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import type { Post, SessionDetail, User } from '@/data/types';
import { Avatar, EmptyState } from '@/components/ui';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { ActivitiesStart, NearYouTag } from '@/components/ActivitiesStart';
import { Heart } from '@/components/Heart';
import { PushedDownTag } from '@/components/PushedDownTag';
import { agoInWords, compactNumber, duration } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { useBarInset } from '@/features/navigation/barInset';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { ROW_TRAVEL, showRow } from '@/features/feed/topRowScroll';
import { hasSessionStats, resultWord, scoreLine, sessionTitle, whatWord } from '@/features/activity/format';
import { localDay } from '@/features/practice/stats';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SIM_DRIVER, simAction, simLog } from '@/lib/simDriver';
import { markSeen } from '@/features/feed/seenPosts';
import { useIsFocused } from '@/lib/useIsFocused';
import { useTourOpen } from '@/features/tour/tourStore';
import { useHoldTour } from '@/features/tour/tourHold';
import { Fold } from '@/components/ui/Fold';
import { useRestKey } from '@/components/ui/restMotion';
import { useReducedMotion as useAppReducedMotion } from '@/lib/useReducedMotion';
import { PhotoViewer, type TileRect } from '@/features/messages/ChatPhotoViews';
import { photosOf } from '@/features/compose/carousel';

/** On screen this long before a row counts as seen (Home's GLANCE_MS): one flown past mid-fling never does. */
const GLANCE_MS = 300;

/*
 * Activities as a gallery (Nov 28, owner: "1 gallery is better", then "Gallaty+ friends played"; the look is
 * ACTIVITIES_LOOK in ./activitiesLook, 'gallery' or 'gallery-rollup').
 * One continuous list, no snapping, that you flick through at any speed and that asks for older posts as you near
 * its end. The Feed hands over exactly the posts Activities may show: sessions only (Nov 28, owner: "why are non
 * activity stuff showing up on activity"; Apple Health and WHOOP auto-logs are sessions too), yours, the people you
 * follow's, and a new player's "near you" players'; blocked, muted, unfollowed private, taken down, group-only,
 * archived and unfinished ones already left out; an admin's pushed-down ones last. A plain photo, video or text post
 * stays in For you, groups and profiles. Here:
 *  - other people's sessions show as cards only with a photo or clip: a card with a 4:5 portrait picture (Nov 28,
 *    owner: "it should be portrait not square");
 *  - 'gallery-rollup': the sessions without one by people you follow, one day's together, as ONE quiet "who played"
 *    row in the feed's time order ("Tomás and Nadia played today"), opened in place with a tap, its sessions folding
 *    open under it (the app's Fold) as the chevron turns;
 *  - your own sessions without one show to you alone, as a thin row ('gallery': marked "Not in friends' feeds");
 *  - a tap on a session in the "who played" row, on your own row, or on a card's title and numbers opens the
 *    session's stats straight away (the post, when it has none to show);
 *  - a clip opens the full-screen reel at once, already playing (the feed's clips from that one down, videos only);
 *    back lands here, where you were. A photo opens full screen on a single tap (after the double-tap window, as
 *    Instagram's); a double tap likes it.
 * The card says little: name, "when · where", one title line, at most two numbers, a caption, like + comment on the
 * left and save + ••• on the right. Spacing comes off the theme's 4pt ladder; a 6pt band of the page's second
 * ground parts two cards.
 */

type CardProps = {
  post: Post;
  author: User;
  me: string | null;
  /** The column's width: the picture runs edge to edge of it. */
  width: number;
  /** A clip tapped: the full-screen reel of the feed's clips (videos only). */
  onOpenClip: (postId: string) => void;
  /** A photo tapped once: full screen, on the photo on show, growing out of where the picture sits (`home`). */
  onOpenPhoto: (post: Post, at: number, home: TileRect | undefined) => void;
  /** A "near you" player you don't follow yet: the "Near you" line with Follow under the name, as before. */
  near?: boolean;
};

export const GALLERY = {
  band: 6,
  /** Over the header, whose tap area (44) already holds 4pt of air above its 36pt face: 16 to the eye. */
  padTop: spacing.md,
  /** The header's least height: a finger's (its face is 36); it grows with larger text. */
  head: 44,
  /** Header to title. */
  gap: spacing.md,
  /** Title to numbers. */
  statsGap: 6,
  /** To the caption. */
  lineGap: 10,
  /** The actions row: a finger's height. */
  actions: 44,
  /** Your own photo-less session as a row: two lines inside 13pt of air above and below. */
  rowPad: 13,
  /** 'gallery-rollup': the "who played" row, and each of its sessions opened under it (at least; larger text grows them). */
  who: 56,
  whoItem: 56,
  /** The column on a computer: a phone's width, which also caps the picture there (390 wide, 488 tall), so a computer
   * never shows a giant photo. On a phone (narrower than `phoneUnder`) the column is the screen, whatever its width,
   * so pictures run edge to edge. */
  column: 390,
  phoneUnder: 600,
  /** A picture's height for its width: 4:5 portrait, Instagram's (Nov 28, owner: "it should be portrait not square"). */
  portrait: 5 / 4,
  /** The double-tap window: a single tap on a photo waits this long before opening it full screen. */
  doubleTap: 280,
};

/** A picture's frame for the column's width: 4:5, whole points. */
export const pictureHeight = (width: number) => Math.round(width * GALLERY.portrait);

/** The photos a post's picture shows (several, or one; a cover when that is all there is), for full screen. */
const photoUrls = (p: Post): string[] => {
  const list = photosOf(p);
  return list.length ? list : p.thumbnailUrl ? [p.thumbnailUrl] : [];
};

/* ------------------------------------------------------------------ what a post is */

/**
 * Whether a post shows a picture here. Real media only (a photo, several, a clip or its cover), the fields the
 * server fills (remote.ts toPost: image_url, image_urls, video_url, thumbnail_url): a session whose upload never
 * landed still carries its media label and must not show friends a big empty card. The demo has no pictures, so
 * there the label alone stands for one (its tinted court card).
 */
export const hasPicture = (p: Post) => !!(p.imageUrl || p.imageUrls?.length || p.videoUrl || p.thumbnailUrl) || (!isSupabaseConfigured && !!p.mediaLabel);
const isClip = (p: Post) => p.kind === 'clip' || !!p.videoUrl;

/** Where it was, never for a teen's post (teen rules). */
const placeOf = (post: Post, author: User) => (author.ageGroup === 'teen' ? '' : post.court?.name ?? post.location ?? '');

/** "Evening match", from when it was posted and what it was. */
const titleOf = (post: Post, s: SessionDetail) => sessionTitle(whatWord(s), { day: s.day ?? localDay(post.createdAt), startHour: new Date(post.createdAt).getHours() });

/** "0:14", when the clip's trimmed length is known (a post carries no length of its own otherwise). */
function clipLength(p: Post): string | null {
  if (p.trimEnd === undefined || p.trimEnd <= (p.trimStart ?? 0)) return null;
  const secs = Math.round((p.trimEnd - (p.trimStart ?? 0)) / (p.speed || 1));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** A little more room between sets than inside one ("6–3  7–5"), so the sets read apart at a glance. */
const roomySets = (score: string) => score.replace(/ /g, ' ');

/** The two numbers a plain card shows: the hero (a match's score, else the time), then the time (a match) or the average heart rate. */
function twoStats(s: SessionDetail): { label: string; value: string; unit?: string }[] {
  const score = scoreLine(s);
  const time = { label: s.kind === 'fitness' ? 'Active' : 'On court', value: duration(s.minutes) };
  if (score) return [{ label: resultWord(s) ?? 'Score', value: roomySets(score) }, time];
  const second = s.avgHr ? { label: 'Avg heart rate', value: String(s.avgHr), unit: 'bpm' }
    : s.kcal ? { label: 'Calories', value: String(Math.round(s.kcal)), unit: 'Cal' } : null;
  return second ? [time, second] : [time];
}

/**
 * The same two numbers as one line, Hevy's way: figures, and the words around them quieter.
 * "Won 6–3 7–5 · 1h 28m", "55m on court · 128 bpm". Each piece says whether it is a figure.
 */
function inlineStats(s: SessionDetail): { text: string; figure: boolean }[] {
  const score = scoreLine(s);
  const time = duration(s.minutes);
  if (score) {
    const word = resultWord(s);
    return [...(word ? [{ text: `${word} `, figure: false }] : []), { text: roomySets(score), figure: true }, { text: ' · ', figure: false }, { text: time, figure: true }];
  }
  const out = [{ text: time, figure: true }, { text: s.kind === 'fitness' ? ' active' : ' on court', figure: false }];
  if (s.avgHr) out.push({ text: ' · ', figure: false }, { text: String(s.avgHr), figure: true }, { text: ' bpm', figure: false });
  else if (s.kcal) out.push({ text: ' · ', figure: false }, { text: String(Math.round(s.kcal)), figure: true }, { text: ' Cal', figure: false });
  return out;
}
const inlineWords = (s: SessionDetail) => inlineStats(s).map((x) => x.text).join('').replace(/ /g, ' ');

const openStats = (post: Post) => (post.session && hasSessionStats(post.session) ? () => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } }) : undefined);
const openComments = (post: Post) => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } });
const openMenu = (post: Post) => router.push({ pathname: '/post-menu', params: { id: post.id } });

/* ------------------------------------------------------------------ the picture */

/** A post's several photos, swiped sideways in the square, as Instagram's; `onPage` hears which one is on show. */
function Photos({ urls, label, onPage }: { urls: string[]; label: string; onPage: (i: number) => void }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const atRef = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!box.w) return;
    const i = Math.max(0, Math.min(urls.length - 1, Math.round(e.nativeEvent.contentOffset.x / box.w)));
    if (i !== atRef.current) { atRef.current = i; onPage(i); }
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w ? (
        <FlatList
          horizontal
          pagingEnabled
          data={urls}
          keyExtractor={(_, i) => `${i}`}
          renderItem={({ item, index }) => <ExpoImage source={{ uri: item }} contentFit="cover" style={{ width: box.w, height: box.h }} accessibilityLabel={`${label}, photo ${index + 1} of ${urls.length}`} />}
          getItemLayout={(_, index) => ({ length: box.w, offset: box.w * index, index })}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

/** Instagram's small dots under a carousel: which photo is on show. */
function Dots({ n, at }: { n: number; at: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="none" style={styles.dots} accessible accessibilityLabel={`Photo ${at + 1} of ${n}`}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={[styles.dot, i === at && styles.dotOn]} />)}
    </View>
  );
}

/** The picture, a clip's cover, or (demo, or no cover yet) the tinted court card; several photos swipe sideways. */
function Media({ post, stand, onPage }: { post: Post; stand?: string; onPage?: (i: number) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const clip = isClip(post);
  // A clip's cover first; a photo post's own photo first (as MediaPostPage), never its smaller thumbnail.
  const uri = clip ? (post.thumbnailUrl ?? post.imageUrl) : (post.imageUrl ?? post.thumbnailUrl);
  const length = clipLength(post);
  const many = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls : null;
  if (many && onPage) return <View style={styles.media}><Photos urls={many} label={post.mediaLabel ?? 'Photo'} onPage={onPage} /></View>;
  const label = post.mediaLabel ?? stand ?? 'Session';
  return (
    <View style={styles.media}>
      {uri ? <ExpoImage source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
        : <MediaPlaceholder fill label={label} seed={post.id} />}
      {/* A clip's small play mark and length; the demo's court card with a length in its label already carries one. */}
      {clip && (uri || !/·\s*\d+:\d+/.test(label)) ? (
        <View style={styles.clipMark}>
          <Ionicons name="play" size={11} color={colors.onMedia} />
          {length ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.clipMarkText}>{length}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** The heart that blooms on a double tap, as Instagram's; keyed on a counter so a second double tap plays it again. Reduce Motion: it shows, then goes, without growing. */
function Bloom({ token }: { token: number }) {
  const still = useReducedMotion();
  const scale = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!token) return;
    scale.setValue(still ? 1 : 0.5);
    shown.setValue(1);
    Animated.parallel([
      ...(still ? [] : [Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 12 })]),
      Animated.sequence([Animated.delay(still ? 400 : 220), Animated.timing(shown, { toValue: 0, duration: 160, useNativeDriver: true })]),
    ]).start();
  }, [token, scale, shown, still]);
  if (!token) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={{ opacity: shown, transform: [{ scale }] }}>
        <Ionicons name="heart" size={96} color={colors.onMedia} />
      </Animated.View>
    </View>
  );
}

/**
 * The simulator proof harness only (simDriver: a demo build bundled with EXPO_PUBLIC_SIM_DRIVER; never a store build,
 * an update or the website): each picture card on screen leaves its double-tap here, so "actlike" can play one.
 */
const simLikes = new Map<string, () => void>();

/* ------------------------------------------------------------------ a card's pieces */

function GalleryHead({ post, author }: { post: Post; author: User }) {
  const styles = useThemedStyles(styleDefinitions);
  const place = placeOf(post, author);
  const when = agoInWords(post.createdAt);
  return (
    <View style={styles.head}>
      <Pressable onPress={() => router.push(`/user/${author.id}`)} accessibilityRole="link" accessibilityLabel={`${author.name}, ${when}${place ? `, ${place}` : ''}`} accessibilityHint="Opens their profile" style={styles.who}>
        <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={36} />
        <View style={styles.whoWords}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{author.name}</Text>
            <PushedDownTag post={post} />
          </View>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{when}{place ? ` · ${place}` : ''}</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** The title and the numbers, straight on the card; a tap opens the session's stats when it has them. `inline`: a picture card's one line. */
function GalleryStats({ post, inline = false }: { post: Post; inline?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const stats = twoStats(s);
  const open = openStats(post);
  const title = titleOf(post, s);
  return (
    <Pressable onPress={open} disabled={!open} accessibilityRole={open ? 'button' : 'text'} accessibilityLabel={`${title}. ${inline ? inlineWords(s) : stats.map((x) => `${x.label} ${x.value.replace(/ /g, ' ')}${x.unit ? ` ${x.unit}` : ''}`).join(', ')}`} accessibilityHint={open ? 'Opens the session stats' : undefined} style={styles.block}>
      <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>{title}</Text>
      {inline ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.inline}>
          {inlineStats(s).map((x, i) => <Text key={i} style={x.figure ? styles.inlineFigure : null}>{x.text}</Text>)}
        </Text>
      ) : (
        <View style={styles.stats}>
          {stats.map((x) => (
            <View key={x.label} style={styles.stat}>
              <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>{x.label}</Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.value}>
                {x.value}{x.unit ? <Text style={styles.unit}> {x.unit}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

/** Like and comment with their counts on the left, save and ••• on the right; nothing else. */
function GalleryActions({ post, me, pop, children }: { post: Post; me: string | null; /** A double tap's like: the heart pops with it. */ pop?: number; children?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const { saved: savedItems, actions } = useApp();
  const liked = !!me && post.likedBy.includes(me);
  const likes = post.likedBy.length;
  const n = post.commentIds.length;
  const saved = savedItems.postIds.includes(post.id);
  return (
    <View style={styles.actions}>
      <Pressable onPress={() => actions.toggleLike(post.id, !liked)} hitSlop={{ left: 8, right: 8 }} style={styles.act} accessibilityRole="button" accessibilityLabel={likes ? `Like, ${likes}` : 'Like'} accessibilityState={{ selected: liked }}>
        <Heart liked={liked} pop={pop} size={22} ink={colors.text} />
        {likes ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.count}>{compactNumber(likes)}</Text> : null}
      </Pressable>
      <Pressable onPress={() => openComments(post)} hitSlop={{ left: 8, right: 8 }} style={styles.act} accessibilityRole="button" accessibilityLabel={n ? `Comments, ${n}` : 'Comments'}>
        <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
        {n ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.count}>{compactNumber(n)}</Text> : null}
      </Pressable>
      {children}
      <Pressable onPress={() => actions.toggleSavePost(post.id)} hitSlop={{ left: 8, right: 8 }} style={[styles.act, styles.save]} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'} accessibilityState={{ selected: saved }}>
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => openMenu(post)} hitSlop={{ left: 8, right: 8 }} style={styles.act} accessibilityRole="button" accessibilityLabel="More options">
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/**
 * Your own session with no photo, as one quiet row rather than a card (it is you, so no face or name): the title
 * ('gallery': with "Not in friends' feeds" beside it), "1h 15m · 128 bpm" under it, and •••. A tap opens the
 * session's stats straight away (Nov 28, owner: "it will just open the stats instead of taking to nother screen"),
 * or the post when the session has none to show.
 * Under another such row it sits on a hairline, not the band, so a run of auto-logs stays small. In 'gallery-rollup'
 * there is no note: the people who follow you see it in their "who played" row.
 */
function OwnRow({ post, joined, note }: { post: Post; joined: boolean; /** "Not in friends' feeds" beside the title ('gallery'). */ note: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const title = titleOf(post, s);
  const line = inlineWords(s);
  const stats = openStats(post);
  return (
    <View testID="acts-own" style={[styles.oRow, joined ? styles.oJoined : styles.oBand]}>
      <Pressable onPress={stats ?? (() => router.push(`/post/${post.id}`))} accessibilityRole="button" accessibilityLabel={`Your ${title}, ${agoInWords(post.createdAt)}. ${line}${note ? `. ${OWN_NOTE}` : ''}`} accessibilityHint={stats ? 'Opens the session stats' : 'Opens the post'} style={styles.oPress}>
        <View style={styles.oTop}>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.oTitle}>{title}</Text>
          {note ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.oNote}>{OWN_NOTE}</Text> : null}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.oLine}>{line}</Text>
      </Pressable>
      <Pressable onPress={() => openMenu(post)} style={styles.oMore} accessibilityRole="button" accessibilityLabel="More options">
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}
const OWN_NOTE = 'Not in friends’ feeds';

/** One card: a session with a photo or clip (Activities holds sessions only; a plain one falls back to its numbers). */
const GalleryCard = React.memo(function GalleryCard({ post, author, me, onOpenClip, onOpenPhoto, near = false, width }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const liked = !!me && post.likedBy.includes(me);
  const media = hasPicture(post);
  const clip = isClip(post);
  const s = post.session;
  const stand = s ? [whatWord(s), scoreLine(s)].filter(Boolean).join(' · ') : undefined;
  const photos = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls.length : 0;
  const [page, setPage] = useState(0);
  const pageNow = useRef(0);
  pageNow.current = page;
  // A double tap on a picture likes it (never takes a like away); a single tap opens the photo full screen, once the
  // double-tap window has passed with no second tap (Nov 28, owner: "you should be able to tap into photos too which
  // will show a full screen version on activities"). The demo's drawn court cards have no photo to open.
  const canOpen = !clip && photoUrls(post).length > 0;
  const [bloom, setBloom] = useState(0);
  const lastTap = useRef(0);
  const pendingOpen = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<View>(null);
  const likedNow = useRef(liked);
  likedNow.current = liked;
  const likeIt = useCallback(() => {
    if (!likedNow.current) actions.toggleLike(post.id, true);
    setBloom((b) => b + 1);
  }, [actions, post.id]);
  const openPhoto = useCallback(() => {
    const at = pageNow.current;
    const node = frameRef.current;
    if (!node) { onOpenPhoto(post, at, undefined); return; }
    node.measureInWindow((x, y, w, h) => onOpenPhoto(post, at, w > 0 && h > 0 ? { x, y, w, h } : undefined));
  }, [onOpenPhoto, post]);
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < GALLERY.doubleTap) {
      lastTap.current = 0;
      if (pendingOpen.current) { clearTimeout(pendingOpen.current); pendingOpen.current = null; }
      likeIt();
      return;
    }
    lastTap.current = now;
    if (!canOpen) return;
    if (pendingOpen.current) clearTimeout(pendingOpen.current);
    pendingOpen.current = setTimeout(() => { pendingOpen.current = null; openPhoto(); }, GALLERY.doubleTap);
  };
  useEffect(() => () => { if (pendingOpen.current) clearTimeout(pendingOpen.current); }, []);
  useEffect(() => {
    if (!SIM_DRIVER || !media || clip) return;
    simLikes.set(post.id, likeIt);
    return () => { if (simLikes.get(post.id) === likeIt) simLikes.delete(post.id); };
  }, [media, clip, post.id, likeIt]);
  // VoiceOver's own double tap is one tap to the app: liking a picture is its "Like" action instead.
  const onPictureAction = (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'like') likeIt(); };
  const caption = post.body?.trim().replace(/\s+/g, ' ') ?? '';
  const nearLine = near ? <View style={styles.near}><NearYouTag user={author} /></View> : null;
  const captionView = (lines: number) => caption ? (
    <Pressable onPress={() => openComments(post)} accessibilityRole="button" accessibilityLabel={`${caption}. Open comments`} style={styles.caption}>
      <Text numberOfLines={lines} maxFontSizeMultiplier={TextScale.BODY} style={styles.captionText}>{caption}</Text>
    </Pressable>
  ) : null;

  if (!media) {
    return (
      <View testID="acts-plain" style={styles.card}>
        <GalleryHead post={post} author={author} />
        {nearLine}
        {s ? <GalleryStats post={post} /> : (
          // A text post: its words in the title's and numbers' place, three lines at most.
          <Pressable onPress={() => openComments(post)} accessibilityRole="button" accessibilityLabel={`${post.body}. Open comments`} style={styles.block}>
            <Text numberOfLines={3} maxFontSizeMultiplier={TextScale.BODY} style={styles.words}>{post.body}</Text>
          </Pressable>
        )}
        {s ? captionView(1) : null}
        <GalleryActions post={post} me={me} />
      </View>
    );
  }

  // The picture: the column's full width, square cornered, 4:5 portrait (Instagram's), cover-cropped from the centre.
  const who = author.name?.trim().split(/\s+/)[0] || author.handle;
  const picture = (
    <View ref={frameRef} collapsable={false} style={[styles.photo, !s && styles.photoUnderHead, { width, height: pictureHeight(width) }]}>
      {clip ? (
        <Pressable onPress={() => onOpenClip(post.id)} accessibilityRole="button" accessibilityLabel={`${who}'s clip${post.mediaLabel ? `, ${post.mediaLabel}` : ''}`} accessibilityHint="Plays it full screen" style={StyleSheet.absoluteFill}>
          <Media post={post} stand={stand} />
        </Pressable>
      ) : (
        <Pressable
          onPress={tapPicture}
          accessibilityRole={canOpen ? 'imagebutton' : 'image'}
          accessibilityLabel={`${who}'s photo${post.mediaLabel ? `, ${post.mediaLabel}` : ''}${photos ? `, ${photos} photos` : ''}`}
          accessibilityHint={canOpen ? 'Opens the photo full screen' : undefined}
          accessibilityActions={[{ name: 'like', label: 'Like' }]}
          onAccessibilityAction={onPictureAction}
          style={StyleSheet.absoluteFill}
        >
          <Media post={post} stand={stand} onPage={photos ? setPage : undefined} />
          <Bloom token={bloom} />
        </Pressable>
      )}
    </View>
  );
  return (
    <View testID="acts-photo" style={styles.card}>
      <GalleryHead post={post} author={author} />
      {nearLine}
      {s ? <GalleryStats post={post} inline /> : null}
      {picture}
      {captionView(2)}
      <GalleryActions post={post} me={me} pop={bloom}>{photos ? <Dots n={photos} at={page} /> : null}</GalleryActions>
    </View>
  );
});

/* ------------------------------------------------------------------ who played ('gallery-rollup') */

/** "today", "yesterday", "on Tuesday", "on Nov 20": when a day's sessions were, for the "who played" row. */
function dayWords(day: string): string {
  const now = new Date();
  if (day === localDay(now)) return 'today';
  if (day === localDay(new Date(now.getTime() - 86_400_000))) return 'yesterday';
  const at = new Date(`${day}T12:00:00`);
  if (now.getTime() - at.getTime() < 6 * 86_400_000) return `on ${at.toLocaleDateString(undefined, { weekday: 'long' })}`;
  return `on ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/** Who ("Tomás and Nadia", "Tomás, Nadia and 2 others") and the rest (" played today"), so the people can read as people. */
function whoPlayedWords(names: string[], day: string): { who: string; rest: string } {
  const rest = ` played ${dayWords(day)}`;
  if (names.length <= 1) return { who: names[0] ?? 'Someone', rest };
  if (names.length === 2) return { who: `${names[0]} and ${names[1]}`, rest };
  if (names.length === 3) return { who: `${names[0]}, ${names[1]} and ${names[2]}`, rest };
  return { who: `${names[0]}, ${names[1]} and ${names.length - 2} others`, rest };
}

const firstName = (u: User) => u.name?.trim().split(/\s+/)[0] || `@${u.handle}`;
/** Opened, at most this many sessions show before "Show all N". */
const WHO_FIRST = 5;

/** How long the "who played" row takes to open (and, a little quicker, to close): the app's Fold, its default. */
const WHO_OPEN_MS = 240;
const WHO_CLOSE_MS = 190;
/** The app's ease-out for things settling into place (Fold's, Collapse's, the folds' arrows). */
const SETTLE = REasing.bezier(0.22, 0.61, 0.36, 1);

/**
 * The row's chevron: it turns half round as the row opens and back as it closes, in step with the fold under it,
 * rather than swapping (the folds' arrows elsewhere turn the same way). Built afresh at each rest on a phone
 * (useRestKey), so a settled turn an iPhone drops can never point it the old way. Reduce Motion as the app's own
 * motion takes it (lib/useReducedMotion, the same answer Fold hears): with it, it simply points the new way.
 */
function TurningChevron({ open }: { open: boolean }) {
  const still = useAppReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);
  const [restKey, landed] = useRestKey();
  const first = useRef(true);
  useEffect(() => {
    // First drawn: already pointing the right way, nothing to turn.
    if (first.current) { first.current = false; return; }
    if (still) { turn.value = open ? 1 : 0; landed(); return; }
    turn.value = withTiming(open ? 1 : 0, { duration: open ? WHO_OPEN_MS : WHO_CLOSE_MS, easing: SETTLE }, (done) => { 'worklet'; if (done) runOnJS(landed)(); });
  }, [open, turn, landed, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Reanimated.View key={restKey} style={style}>
      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
    </Reanimated.View>
  );
}

/**
 * 'gallery-rollup': the sessions without a photo by people you follow on one day, as ONE quiet row in the feed's
 * time order (their faces, then "Tomás and Nadia played today"). A tap opens their sessions in place, as small rows
 * inside the same surface on hairlines (a face, "Tomás · Evening practice", "48 min on court · 126 bpm"; never a
 * place); a tap on one opens that session's stats straight away (Nov 28, owner: "it will just open the stats instead
 * of taking to nother screen"). Another tap closes them. The band comes back after the group.
 * Opening and closing move the way the app's other in-place sections do (Nov 28, owner: "the animations when you
 * tapped like ethan played on oct 15 needs to be alot better and maych our current stuff"): the sessions fold open
 * under the row with a real height change and a fade (Fold, 240ms open, 190ms shut, the app's settle curve), so the
 * cards below glide rather than jump, and the chevron turns with them. Reduce Motion as everywhere in the app
 * (lib/useReducedMotion: since Oct 5 every phone gets the same motion, owner: "all animation should look like the one
 * on my phone"); were it honoured again, Fold's plain way: the height at once and a short fade.
 */
const WhoPlayed = React.memo(function WhoPlayed({ day, posts, users, open, onToggle }: { day: string; posts: Post[]; users: Map<string, User>; open: boolean; onToggle: (day: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const [all, setAll] = useState(false);
  const people = useMemo(() => [...new Set(posts.map((p) => p.authorId))].flatMap((id) => users.get(id) ?? []), [posts, users]);
  if (!people.length) return null;
  const words = whoPlayedWords(people.map(firstName), day);
  const first = posts.slice(0, WHO_FIRST);
  const rest = posts.slice(WHO_FIRST);
  const item = (p: Post) => {
    const u = users.get(p.authorId);
    if (!u || !p.session) return null;
    const title = titleOf(p, p.session);
    const line = inlineWords(p.session);
    const stats = openStats(p);
    return (
      <Pressable key={p.id} testID="who-item" onPress={stats ?? (() => router.push(`/post/${p.id}`))} accessibilityRole="button" accessibilityLabel={`${u.name}, ${title}. ${line}`} accessibilityHint={stats ? 'Opens the session stats' : 'Opens the post'} style={styles.wItem}>
        <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={28} />
        <View style={styles.wItemWords}>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.wItemTitle}><Text style={styles.wWho}>{firstName(u)}</Text> · {title}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.wItemLine}>{line}</Text>
        </View>
      </Pressable>
    );
  };
  return (
    <View testID="who-group" style={styles.wGroup}>
      <Pressable
        testID="who-played"
        onPress={() => onToggle(day)}
        accessibilityRole="button"
        accessibilityLabel={`${words.who}${words.rest}, ${open ? 'hide' : 'show'} sessions`}
        // aria-expanded rather than accessibilityState: the website reads only the aria form (VoiceOver on iPhone reads either).
        aria-expanded={open}
        style={styles.wRow}
      >
        <View style={styles.wFaces}>
          {people.slice(0, 3).map((u, i) => (
            // The first face on top, as Instagram's "liked by" faces, so no one's initials are cut.
            <View key={u.id} style={[styles.wFace, i > 0 && styles.wFaceOver, { zIndex: 3 - i }]}>
              <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={28} />
            </View>
          ))}
        </View>
        {/* Two lines at most: with larger text or several names the day ("played yesterday") wraps rather than being cut. */}
        <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.wText}>
          <Text style={styles.wWho}>{words.who}</Text>{words.rest}
        </Text>
        <TurningChevron open={open} />
      </Pressable>
      <Fold open={open} duration={WHO_OPEN_MS}>
        {first.map(item)}
        {rest.length ? (
          <>
            {/* "Show all N": the rest fold open under the first five as the button folds away. */}
            <Fold open={all} duration={WHO_OPEN_MS}>{rest.map(item)}</Fold>
            <Fold open={!all} duration={WHO_OPEN_MS}>
              <Pressable onPress={() => setAll(true)} accessibilityRole="button" accessibilityLabel={`Show all ${posts.length} sessions`} style={styles.wAll}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.wAllText}>Show all {posts.length}</Text>
              </Pressable>
            </Fold>
          </>
        ) : null}
      </Fold>
    </View>
  );
});

/* ------------------------------------------------------------------ the list */

/**
 * What the list draws: a post's card, your own photo-less session as a row, ('gallery-rollup') one "who played" row
 * per day for the sessions without a photo by people you follow, and the head of the list (connect, follow suggestions).
 */
type Row =
  | { key: string; kind: 'post'; post: Post }
  | { key: string; kind: 'own'; post: Post; joined: boolean }
  | { key: string; kind: 'rollup'; day: string; posts: Post[] }
  | { key: string; kind: 'start' };
/** The head of the list (follow suggestions and the rest) goes after this many items, when there are more: a gallery opens on pictures. */
const START_AFTER = 2;
/**
 * Pages asked for in a row while none of them makes the list longer: other people's plain sessions only ('gallery'),
 * or ('gallery-rollup') only more sessions for a day whose "who played" row is already there.
 */
const QUIET_PAGES = 8;

/**
 * The rows: sessions only (anything else that slips in is left out); other people's as cards only with a picture,
 * yours without one as a row, the start block after the first two. `rollup` ('gallery-rollup'): other people's
 * without one, when you follow them and the session has
 * its numbers (as today's Activities pages take them), go into their day's one "who played" row, placed where the
 * day's newest of them falls in the feed's time order; a later page bringing more of that day adds to the same row.
 * The day is the one it was PLAYED (the session's own day), never the day it was posted: Saturday's match logged on
 * Monday is "played on Saturday", with Saturday's. Only a day still to come here (the player's clock a day ahead of
 * yours) falls back to the day it was posted.
 */
export function galleryRows(posts: Post[], me: string | null | undefined, showStart: boolean, rollup = false, follows: ReadonlySet<string> = new Set()): Row[] {
  const out: Row[] = [];
  const days = new Map<string, Extract<Row, { kind: 'rollup' }>>();
  const today = localDay(new Date());
  for (const post of posts) {
    if (!post.session) continue;
    if (hasPicture(post)) out.push({ key: post.id, kind: 'post', post });
    else if (post.authorId === me) out.push({ key: post.id, kind: 'own', post, joined: false });
    else if (rollup && follows.has(post.authorId) && hasSessionStats(post.session)) {
      const played = post.session.day;
      const day = played && played <= today ? played : localDay(post.createdAt);
      let r = days.get(day);
      if (!r) { r = { key: `day:${day}`, kind: 'rollup', day, posts: [] }; days.set(day, r); out.push(r); }
      r.posts.push(post);
    }
  }
  if (showStart) out.splice(Math.min(START_AFTER, out.length), 0, { key: 'start', kind: 'start' });
  // Under another of your rows, a row sits on a hairline rather than the band (once the start block is placed).
  return out.map((r, i): Row => (r.kind === 'own' && out[i - 1]?.kind === 'own' ? { ...r, joined: true } : r));
}

interface GalleryFeedArgs {
  /** Exactly the posts Activities may show, newest first (galleryPosts). */
  posts: Post[];
  /** 'gallery-rollup': other people's sessions without a photo as one "who played" row per day. */
  rollup: boolean;
  /** A follow block after the first two items (ActivitiesStart's "Follow more players", or the page's own: `start`). */
  showStart: boolean;
  nearCount: number;
  /** "Near you" players (a new player's), whose posts carry the "Near you" line until followed. */
  near?: Set<string>;
  /** Not the page on show: nothing is marked seen. */
  paused: boolean;
  /** The follow block, when not Activities' own start (ActivitiesStart): the Community map's People you may know. */
  start?: React.ReactNode;
  /** On another page (under the Community map): the follow block always sits on the band, as every row there does. */
  inPage?: boolean;
}

/**
 * What the gallery draws and how it behaves, whichever list holds it (the Feed's own, ActivitiesList, or the Community
 * map's page in the iPhone app, useGalleryInPage): its rows, each row drawn, a clip opening the reel (once per tap),
 * older posts asked for as the end nears (with the quiet-page guard), what is on screen marked seen, the calm empty
 * note and the row at the end (a spinner, "Show older posts" or "You're all caught up").
 */
function useGalleryFeed({ posts, rollup, showStart, nearCount, near, paused, start, inPage = false }: GalleryFeedArgs) {
  const styles = useThemedStyles(styleDefinitions);
  const app = useApp();
  const { users, currentUserId, followingIds, actions } = app;
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const following = useMemo(() => new Set(followingIds), [followingIds]);
  const rows = useMemo(() => galleryRows(posts, currentUserId, showStart, rollup, following), [posts, currentUserId, showStart, rollup, following]);
  // Anything from someone else on show (with none, the empty note says how friends' sessions show up here).
  const fromOthers = useMemo(() => rows.some((r) => r.kind === 'rollup' || (r.kind === 'post' && r.post.authorId !== currentUserId)), [rows, currentUserId]);
  // The "who played" rows opened, by day: a page arriving keeps them open (each day's row keeps its key).
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set());
  const toggleDay = useCallback((day: string) => setOpenDays((was) => {
    const next = new Set(was);
    if (next.has(day)) next.delete(day); else next.add(day);
    return next;
  }), []);
  const { width: screenW } = useWindowDimensions();
  const cardW = screenW < GALLERY.phoneUnder ? screenW : GALLERY.column;

  // A clip tapped: the full-screen reel, that clip first, then the feed's clips below it, videos only.
  const postsRef = useRef(posts);
  postsRef.current = posts;
  // One push per tap: a quick double tap on a clip (Instagram habit) must not stack two reels.
  const opening = useRef(false);
  const openingReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openClip = useCallback((postId: string) => {
    if (opening.current) return;
    opening.current = true;
    if (openingReset.current) clearTimeout(openingReset.current);
    openingReset.current = setTimeout(() => { opening.current = false; }, 1000);
    const all = postsRef.current;
    const at = all.findIndex((p) => p.id === postId);
    const ids = (at < 0 ? [] : all.slice(at)).filter(isClip).slice(0, 30).map((p) => p.id);
    router.push({ pathname: '/reel', params: { ids: (ids.length ? ids : [postId]).join(','), start: postId } });
  }, []);
  // Back on show (from the reel, or any page over it): a clip can be opened again at once.
  useFocusEffect(useCallback(() => { opening.current = false; }, []));
  useEffect(() => () => { if (openingReset.current) clearTimeout(openingReset.current); }, []);

  // A photo tapped once: full screen over the list (the chats' viewer: black ground, the photo fitted, pinch to look
  // closer, swipe sideways through a post's photos, swipe down or × to put it back), opened on the photo on show and
  // growing out of where it sits. The list never moves under it, so closing lands exactly where you were. The viewer
  // is its own full-screen layer (a Modal): whichever list holds the gallery draws `viewerNode` anywhere in its page.
  const [viewer, setViewer] = useState<{ post: Post; at: number; home?: TileRect } | null>(null);
  useHoldTour(!!viewer);
  const openPhoto = useCallback((post: Post, at: number, home: TileRect | undefined) => {
    if (photoUrls(post).length) setViewer({ post, at, home });
  }, []);
  const closePhoto = useCallback(() => setViewer(null), []);
  const viewerNode = viewer ? (() => {
    const urls = photoUrls(viewer.post);
    const author = usersById.get(viewer.post.authorId);
    const caption = viewer.post.body?.trim().replace(/\s+/g, ' ');
    return (
      <PhotoViewer
        photos={urls.map((path) => ({ path, w: 4, h: 5 }))}
        start={viewer.at}
        // Every photo of a post sits in the same frame on the card, so each goes back into it.
        homes={urls.map(() => viewer.home)}
        homeRadius={0}
        caption={caption || undefined}
        who={author ? `${firstName(author)} · ${agoInWords(viewer.post.createdAt)}` : undefined}
        share={false}
        onClose={closePhoto}
      />
    );
  })() : null;

  // Older posts as the end nears: the store's next page (AppContext loadMorePosts: 40 posts of the whole feed, by
  // time), with a quiet row while it is on its way. A page can bring nothing this list shows (posts from people you
  // don't follow, other people's plain sessions in 'gallery'), or ('gallery-rollup') only more sessions for a day
  // whose "who played" row is there already, so the list would not grow and would never ask again: when a page
  // lands and the list is no longer, ask again while the store has more, up to QUIET_PAGES pages in a row; past that
  // the list stops asking by itself (stalledRef: the end being reached again, as the footer or the empty note change
  // the list's length, must not start another run) and a plain "Show older posts" row asks on a tap. The run's count
  // starts over only when the list grew, on that tap, or on a pull. The store saying it has no more is the end.
  const moreRef = useRef(app.feed.more);
  moreRef.current = app.feed.more;
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(!app.feed.more);
  const [stalled, setStalled] = useState(false);
  const stalledRef = useRef(false);
  const asking = useRef(false);
  const lenRef = useRef(rows.length);
  lenRef.current = rows.length;
  const askedAt = useRef<number | null>(null);
  const tries = useRef(0);
  const [landed, setLanded] = useState(0);
  const loadMore = useCallback(() => {
    if (asking.current) return;
    if (!moreRef.current) { setEnded(true); return; }
    asking.current = true;
    askedAt.current = lenRef.current;
    setLoading(true);
    stalledRef.current = false;
    setStalled(false);
    const started = Date.now();
    void (async () => {
      try { await actions.loadMorePosts(); } catch { /* the next reach of the end asks again */ }
      // Held a beat, so the row never flickers.
      const left = 600 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      asking.current = false;
      setLanded((n) => n + 1);
    })();
  }, [actions]);
  // After a page lands (and the list has drawn with it): grew, done; didn't, and more is there, ask again.
  useEffect(() => {
    if (!landed || askedAt.current === null) return;
    const before = askedAt.current;
    askedAt.current = null;
    if (rows.length > before) { tries.current = 0; setLoading(false); return; }
    if (!moreRef.current) { setEnded(true); setLoading(false); return; }
    if (tries.current < QUIET_PAGES - 1) { tries.current += 1; loadMore(); return; }
    tries.current = 0;
    stalledRef.current = true;
    setLoading(false);
    setStalled(true);
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps
  // A pull or a new page from elsewhere can bring more back.
  useEffect(() => { if (app.feed.more) setEnded(false); }, [app.feed.more]);
  /** The end of the list reached: the next page, unless a run of quiet pages stopped it (then the row's tap asks). */
  const onEnd = useCallback(() => { if (!stalledRef.current) loadMore(); }, [loadMore]);
  /** A pull brought the newest again: the run's count starts over. */
  const reopen = useCallback(() => { tries.current = 0; stalledRef.current = false; setStalled(false); }, []);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Seen, as Home's pages are (Oct 7, owner: "don't keep seeing the same videos"): a card, your own row or a "who
  // played" row on screen for GLANCE_MS while this list is the one in front (its page on show, its route on top, no
  // tutorial over it, the app open) goes in this phone's seen list (features/feed/seenPosts), so the Feed's
  // Activities card stops counting it as new and For you deals it below what you have not seen yet. A "who played"
  // row counts for each session in it. As a card or your own row leaves the screen the server is told the same, with
  // how long it was there (noteFeedSignal, as Home's endViewing). A row flown past mid-fling is neither.
  const focused = useIsFocused();
  const touring = useTourOpen();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const sub = AppState.addEventListener('change', (next) => setAppActive(next === 'active')); return () => sub.remove(); }, []);
  const looking = focused && !touring && !paused && appActive;
  const lookingRef = useRef(looking);
  lookingRef.current = looking;
  const meRef = useRef(currentUserId);
  meRef.current = currentUserId;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  // The rows on screen now (by key), and the ones being looked at since when.
  const onScreen = useRef<string[]>([]);
  const views = useRef(new Map<string, { since: number; glance: ReturnType<typeof setTimeout> | null }>());
  const startView = useCallback((key: string) => {
    if (views.current.has(key)) return;
    const view: { since: number; glance: ReturnType<typeof setTimeout> | null } = { since: Date.now(), glance: null };
    view.glance = setTimeout(() => {
      view.glance = null;
      const r = rowsRef.current.find((x) => x.key === key);
      const shown = !r || r.kind === 'start' ? [] : r.kind === 'rollup' ? r.posts : [r.post];
      for (const p of shown) markSeen(meRef.current, `p:${p.id}`);
    }, GLANCE_MS);
    views.current.set(key, view);
  }, []);
  const endView = useCallback((key: string) => {
    const view = views.current.get(key);
    if (!view) return;
    views.current.delete(key);
    if (view.glance) { clearTimeout(view.glance); return; }
    const r = rowsRef.current.find((x) => x.key === key);
    if (!r || (r.kind !== 'post' && r.kind !== 'own')) return;
    const seconds = (Date.now() - view.since) / 1000;
    actionsRef.current.noteFeedSignal({ kind: 'post', id: r.post.id, seen: true, watched: seconds, skipped: seconds < 1.5 });
  }, []);
  /** The keys of the gallery's rows on screen now (the follow block never counts), from the list's viewability. */
  const onScreenNow = useCallback((now: string[]) => {
    for (const key of onScreen.current) if (!now.includes(key)) endView(key);
    onScreen.current = now;
    if (lookingRef.current) now.forEach(startView);
  }, [startView, endView]);
  useEffect(() => {
    if (looking) onScreen.current.forEach(startView);
    else [...views.current.keys()].forEach(endView);
  }, [looking, startView, endView]);
  useEffect(() => () => { [...views.current.keys()].forEach(endView); }, [endView]);

  const renderRow = useCallback((r: Row) => {
    if (r.kind === 'start') {
      return (
        <View style={[styles.column, { maxWidth: cardW }, r === rows[0] && !inPage ? null : styles.startInList]}>
          {start !== undefined ? start : <ActivitiesStart inList topInset={0} bottomInset={spacing.lg} nearCount={nearCount} sessions={posts.length} shown={!paused} onTop />}
        </View>
      );
    }
    if (r.kind === 'own') return <View style={[styles.column, { maxWidth: cardW }]}><OwnRow post={r.post} joined={r.joined} note={!rollup} /></View>;
    if (r.kind === 'rollup') return <View style={[styles.column, { maxWidth: cardW }]}><WhoPlayed day={r.day} posts={r.posts} users={usersById} open={openDays.has(r.day)} onToggle={toggleDay} /></View>;
    const author = usersById.get(r.post.authorId);
    if (!author) return null;
    const nearOne = !!near?.has(author.id) && author.id !== currentUserId && !following.has(author.id);
    return <View style={[styles.column, { maxWidth: cardW }]}><GalleryCard post={r.post} author={author} me={currentUserId} onOpenClip={openClip} onOpenPhoto={openPhoto} near={nearOne} width={cardW} /></View>;
  }, [usersById, near, currentUserId, following, openClip, openPhoto, cardW, styles, rows, nearCount, posts.length, paused, rollup, openDays, toggleDay, start, inPage]);

  // Nothing from anyone else yet, and nothing older to ask for (or many pages asked already): say why, calmly. A new
  // player (following fewer than five) has the start block, with its follow suggestions, instead.
  const settled = (ended || stalled) && !loading;
  const quiet = !fromOthers && settled && !showStart ? (
    <View style={[styles.column, { maxWidth: cardW }, rows.length || inPage ? styles.emptyUnder : null]}>
      {rollup ? (
        <EmptyState
          icon="images-outline"
          title="No sessions from friends yet"
          body="Sessions from players you follow show up here. Add a photo or clip to your next session and friends see it as a picture."
        />
      ) : (
        <EmptyState
          icon="images-outline"
          title="No photos from friends yet"
          body="Friends' sessions show up here when they add a photo or a clip. Add one to your next session and they'll see it too."
        />
      )}
    </View>
  ) : null;
  // One fixed height whatever it holds, so swapping spinner, button and words never changes the list's length.
  const end = (
    <View style={styles.end}>
      {loading ? <ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel="Loading older posts" />
        : !rows.length ? null
        : stalled ? (
          <Pressable onPress={() => { tries.current = 0; loadMore(); }} accessibilityRole="button" style={styles.older}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.olderText}>Show older posts</Text>
          </Pressable>
        ) : ended && fromOthers ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.endText}>You're all caught up</Text> : null}
    </View>
  );
  return { rows, rowsRef, renderRow, openClip, openPhoto, toggleDay, viewerNode, onEnd, reopen, onScreenNow, quiet, end, ended, stalled, more: app.feed.more, cardW };
}

export function ActivitiesList({ posts, rollup = false, showStart, nearCount, near, paused, row }: {
  /** Exactly the posts Activities may show, newest first (the Feed's ActivitiesGallery). */
  posts: Post[];
  /** 'gallery-rollup': other people's sessions without a photo as one "who played" row per day. */
  rollup?: boolean;
  /** The "Follow more players" start (ActivitiesStart), after the first two items, at its own height. */
  showStart: boolean;
  nearCount: number;
  /** "Near you" players (a new player's), whose posts carry the "Near you" line until followed. */
  near?: Set<string>;
  /** Another feed is on show: this one leaves the top row alone. */
  paused: boolean;
  row?: SharedValue<number>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const { rows, rowsRef, renderRow, openClip, openPhoto, toggleDay, viewerNode, onEnd, reopen, onScreenNow, quiet, end } = useGalleryFeed({ posts, rollup, showStart, nearCount, near, paused });
  const top = insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT + 8;

  // The top row follows the list the way Instagram's header does: forward takes it out with the scroll, back brings it in.
  const liveRow = paused ? undefined : row;
  const lastY = useRef(0);
  // Where the list was while it was the page on show: back from the reel (or any page over it) it is put back
  // exactly there if it slipped while covered, so the feed never jumps or starts over.
  const listRef = useRef<FlatList<Row>>(null);
  const keptY = useRef(0);
  const onShow = useRef(true);
  useFocusEffect(useCallback(() => {
    onShow.current = true;
    const y = keptY.current;
    if (y > 0 && Math.abs(lastY.current - y) > 1) {
      listRef.current?.scrollToOffset({ offset: y, animated: false });
      lastY.current = y;
    }
    return () => { onShow.current = false; };
  }, []));
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  useEffect(() => { if (!paused) showRow(row); }, [paused, row]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (onShow.current) keptY.current = y;
    if (!liveRow) return;
    liveRow.value = y <= 0 ? 0 : Math.min(1, Math.max(0, liveRow.value + dy / ROW_TRAVEL));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { liveRow.value = withTiming(y > top && liveRow.value > 0.5 ? 1 : 0, { duration: 200 }); }, 140);
  }, [liveRow, top]);
  // The plain band behind the row, so cards never pass under its words; it rides up with the row.
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: -(liveRow ? liveRow.value : 0) * top }] }));

  // The simulator proof harness only (simDriver; nothing at all elsewhere): "actscroll to=1200" or "actscroll by=600"
  // moves the list (glide=1: animated), "actclip" opens the first clip below the top of the screen as a tap would,
  // "actlike" double-taps the first photo below it, "actpos" says where the list is. Each says what it did in sim-log.
  useEffect(() => {
    if (!SIM_DRIVER) return;
    const firstBelow = (want: (p: Post) => boolean) => rowsRef.current.find((r): r is Extract<Row, { kind: 'post' }> => r.kind === 'post' && want(r.post))?.post;
    const off = [
      simAction('actscroll', (q) => {
        const to = q.to !== undefined ? Number(q.to) : lastY.current + (Number(q.by) || 0);
        listRef.current?.scrollToOffset({ offset: Math.max(0, to), animated: q.glide === '1' });
        simLog(`[acts] scroll to ${Math.round(to)}`);
      }),
      simAction('actclip', () => {
        const clipPost = firstBelow(isClip);
        simLog(`[acts] clip ${clipPost?.id ?? 'none'} at y ${Math.round(lastY.current)}`);
        if (clipPost) openClip(clipPost.id);
      }),
      simAction('actlike', () => {
        const id = rowsRef.current.flatMap((r) => (r.kind === 'post' && simLikes.has(r.post.id) ? [r.post.id] : []))[0];
        simLog(`[acts] doubletap ${id ?? 'none'}`);
        if (id) simLikes.get(id)?.();
      }),
      simAction('actpos', () => simLog(`[acts] at y ${Math.round(lastY.current)} kept ${Math.round(keptY.current)} rows ${rowsRef.current.length}`)),
      // "actwho" opens (or closes) the first "who played" row as its tap does; "actphoto" opens the first photo full screen.
      simAction('actwho', () => {
        const day = rowsRef.current.find((r): r is Extract<Row, { kind: 'rollup' }> => r.kind === 'rollup')?.day;
        simLog(`[acts] who ${day ?? 'none'}`);
        if (day) toggleDay(day);
      }),
      simAction('actphoto', () => {
        const photo = firstBelow((p) => !isClip(p) && photoUrls(p).length > 0);
        simLog(`[acts] photo ${photo?.id ?? 'none'}`);
        if (photo) openPhoto(photo, 0, undefined);
      }),
    ];
    return () => off.forEach((f) => f());
  }, [openClip, openPhoto, toggleDay, rowsRef]);
  useFocusEffect(useCallback(() => { if (SIM_DRIVER) simLog(`[acts] on show at y ${Math.round(lastY.current)} kept ${Math.round(keptY.current)}`); }, []));

  // FlatList takes one handler and one setting for the list's whole life.
  const viewability = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<Row>[] }) => {
    onScreenNow(viewableItems.flatMap((t) => (t.isViewable && t.item && t.item.kind !== 'start' ? [t.item.key] : [])));
  }).current;

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    showRow(liveRow);
    try { await actions.refresh(); } finally { setRefreshing(false); reopen(); }
  }, [actions, liveRow, reopen]);

  const renderItem = useCallback(({ item: r }: { item: Row }) => renderRow(r), [renderRow]);

  const footer = (
    <View style={{ paddingBottom: barInset + spacing.xxl }}>
      {quiet}
      {end}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        ListHeaderComponent={<View style={{ height: top }} />}
        ListFooterComponent={footer}
        onEndReached={onEnd}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewability}
        windowSize={7}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        onEndReachedThreshold={1.5}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textFaint} progressViewOffset={top} />}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
        accessibilityLabel="Activities"
      />
      <Reanimated.View pointerEvents="none" style={[styles.band, { height: top }, band]} />
      {viewerNode}
    </View>
  );
}

/* ------------------------------------------------------------------ the gallery on another page */

/** Something the page puts into the gallery between its items (the Community map's page: Open hits, courts, the city board…). */
export interface FeedSlot {
  key: string;
  /** Goes after this many of the gallery's items (the follow block not counted); past the end, at the end, in order, once no more pages are coming. */
  after: number;
  node: React.ReactNode;
}

/** One row of the gallery in another page's list: a gallery row, one of the page's own rows, the calm empty note, or the row at the end. */
export type InPageRow =
  | { key: string; kind: 'feed'; row: Row }
  | { key: string; kind: 'slot'; node: React.ReactNode }
  | { key: string; kind: 'quiet' }
  | { key: string; kind: 'end' };

/** How much of a photo's top shows under the first item's words on the first screen: enough to pull a thumb down. */
const PEEK_PHOTO = 56;
/** Under a first item with no photo: its last line, and this much air. */
const PEEK_AIR = 16;

/**
 * How much of the gallery's first item shows above the bottom bar on the Community map's first screen (HOME_LOOK
 * 'map-feed'), read off the gallery's own measures (GALLERY and the styles below, at the phone's usual text size): a
 * photo card down through its numbers and the top of its photo, anything else down to its last line and a little air,
 * so the bar never cuts through words.
 */
function firstPeek(row: Row | undefined): number {
  // The band, the room above the header, the header.
  const head = GALLERY.band + GALLERY.padTop + GALLERY.head;
  // Title (22) under the header's tap air (12).
  const title = GALLERY.gap - 4 + 22;
  if (!row) return 64;
  if (row.kind === 'own') return GALLERY.band + 2 * GALLERY.rowPad + 20 + 2 + 18 + PEEK_AIR;
  if (row.kind === 'rollup') return GALLERY.band + GALLERY.who + PEEK_AIR;
  // The follow block first (a short feed): its title.
  if (row.kind === 'start') return GALLERY.band + spacing.lg + 24 + PEEK_AIR;
  const p = row.post;
  const s = p.session;
  // A photo card: (a session's title and its one line of numbers), then the top of the photo.
  if (hasPicture(p)) return head + (s ? title + 4 + 20 + spacing.md : spacing.sm) + PEEK_PHOTO;
  // A plain session: its title, its two numbers (label and figure) and, with one, its caption's line.
  if (s) return head + title + GALLERY.statsGap + 16 + 26 + (p.body?.trim() ? GALLERY.lineGap + 20 : 0) + PEEK_AIR;
  // A text post: its words (three lines at most, about 38 letters to a line).
  return head + GALLERY.gap - 4 + 23 * Math.min(3, Math.max(1, Math.ceil((p.body?.length ?? 0) / 38))) + PEEK_AIR;
}

/**
 * The gallery under something else on a page, as that page's own list rows (the iPhone app's Community map, HOME_LOOK
 * 'map-feed': Find Players is one list, the search and the map its head, then these): the same rows, cards and
 * behaviour as the Feed's Activities (a clip opens the reel and back lands on the same spot, the page keeping its
 * place; double tap likes; •••; Save; the "who played" rows open in place; what is on screen marked seen; older posts
 * asked for as the list's end nears, with the quiet-page guard), the follow block after the first two items, and the
 * page's own rows between the items (`slots`). The page's rows that would go past the items loaded so far wait until
 * no more pages are coming: shown at the end now, a page landing would push them up into the middle of the feed, under
 * the reader's thumb. Hand the result to PaneScroller's `list`; `peek` is how much of the first item should show above
 * the bar on the first screen; `reopen` after a pull; `viewerNode` (a photo full screen, a Modal) anywhere in the page.
 */
export function useGalleryInPage({ posts, rollup, nearCount, near, paused, start, slots }: {
  posts: Post[];
  rollup: boolean;
  nearCount: number;
  near?: Set<string>;
  /** The page is not on show (or is only a picture of it): nothing is marked seen, no pages are asked for. */
  paused: boolean;
  /** The follow block (null: none). */
  start: React.ReactNode;
  slots: FeedSlot[];
}) {
  const styles = useThemedStyles(styleDefinitions);
  const { rows, renderRow, openClip, viewerNode, onEnd, reopen, onScreenNow, quiet, end, ended, stalled, more, cardW } = useGalleryFeed({ posts, rollup, showStart: !!start, nearCount, near, paused, start: start ?? undefined, inPage: true });
  const settled = ended || stalled || !more;
  const hasQuiet = !!quiet;
  const data = useMemo<InPageRow[]>(() => {
    const out: InPageRow[] = [];
    // The page's rows after so many items (the follow block is not counted).
    let items = 0;
    for (const row of rows) {
      out.push({ key: row.key, kind: 'feed', row });
      if (row.kind === 'start') continue;
      items += 1;
      for (const slot of slots) if (slot.after === items) out.push({ key: `slot:${slot.key}`, kind: 'slot', node: slot.node });
    }
    if (hasQuiet) out.push({ key: 'inpage:quiet', kind: 'quiet' });
    out.push({ key: 'inpage:end', kind: 'end' });
    if (settled) for (const slot of slots) if (slot.after > items) out.push({ key: `slot:${slot.key}`, kind: 'slot', node: slot.node });
    return out;
  }, [rows, slots, hasQuiet, settled]);
  const renderItem = useCallback(({ item }: { item: InPageRow }) => {
    if (item.kind === 'feed') return renderRow(item.row);
    // In the gallery's column, as its cards are (on a wide screen, a phone's width).
    if (item.kind === 'slot') return <View style={[styles.column, { maxWidth: cardW }, styles.slot]}>{item.node}</View>;
    if (item.kind === 'quiet') return quiet;
    return end;
  }, [renderRow, styles, quiet, end, cardW]);
  const keyExtractor = useCallback((item: InPageRow) => item.key, []);
  const onEndReached = useCallback(() => { if (!paused) onEnd(); }, [paused, onEnd]);
  // FlatList takes one handler and one setting for the list's whole life.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<InPageRow>[] }) => {
    onScreenNow(viewableItems.flatMap((t) => (t.isViewable && t.item?.kind === 'feed' && t.item.row.kind !== 'start' ? [t.item.key] : [])));
  }).current;
  // The simulator proof harness only (simDriver: a demo build bundled with EXPO_PUBLIC_SIM_DRIVER; nothing at all
  // elsewhere): "homeclip" opens the first clip in this feed as a tap on it would, to check the reel and the way back.
  useEffect(() => {
    if (!SIM_DRIVER || paused) return undefined;
    return simAction('homeclip', () => {
      const clip = posts.find((p) => isClip(p) && hasPicture(p));
      simLog(`[home] clip ${clip?.id ?? 'none'}`);
      if (clip) openClip(clip.id);
    });
  }, [paused, posts, openClip]);
  const peek = firstPeek(rows[0]);
  return { data, renderItem, keyExtractor, onEndReached, onViewableItemsChanged, viewabilityConfig, peek, reopen, viewerNode };
}

const styleDefinitions = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
  column: { width: '100%', alignSelf: 'center' },
  end: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl, height: 68 },
  endText: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  older: { minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  olderText: { ...font('500'), fontSize: 14, color: colors.text },
  emptyUnder: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt },
  // A row of the page's own between the gallery's items (useGalleryInPage): the band above it, in the page's margins.
  slot: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.bg },

  // A card: the column's full width, a band of the page's second ground above it, one left edge for all words.
  card: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt, paddingTop: GALLERY.padTop, paddingHorizontal: spacing.lg, backgroundColor: colors.bg, overflow: 'hidden' },
  head: { minHeight: GALLERY.head, flexDirection: 'row', alignItems: 'center' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 0, minHeight: 44 },
  whoWords: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { ...font('500'), fontSize: 15, lineHeight: 19, letterSpacing: -0.1, color: colors.text, flexShrink: 1 },
  meta: { ...typography.small, lineHeight: 16, color: colors.textMuted },
  near: { minHeight: 28, justifyContent: 'center', marginTop: 2 },
  // Under the header's 4pt of tap air: 12 to the eye.
  block: { marginTop: GALLERY.gap - 4 },
  title: { ...typography.heading, lineHeight: 22, color: colors.text },
  stats: { flexDirection: 'row', gap: spacing.xxl, marginTop: GALLERY.statsGap },
  stat: { minWidth: 0, flexShrink: 1 },
  label: { ...typography.small, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  value: { ...font('500'), fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
  unit: { ...font('400'), fontSize: 13, letterSpacing: 0, color: colors.textMuted },
  // A picture card's numbers as one line: the words muted, the figures in the text colour.
  inline: { ...typography.body, lineHeight: 20, marginTop: 4, color: colors.textMuted },
  inlineFigure: { ...font('500'), color: colors.text, fontVariant: ['tabular-nums'] },
  words: { ...typography.body, fontSize: 16, lineHeight: 23, color: colors.text },
  // Full bleed: out past the card's gutter on both sides, square cornered.
  photo: { marginTop: spacing.md, marginHorizontal: -spacing.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  photoUnderHead: { marginTop: spacing.sm },
  media: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  clipMark: { position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.overlay, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  clipMarkText: { ...typography.caption, fontSize: 11, color: colors.onMedia, fontVariant: ['tabular-nums'] },
  caption: { marginTop: GALLERY.lineGap },
  captionText: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.text },
  actions: { minHeight: GALLERY.actions, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, position: 'relative', marginTop: 2 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 28 },
  save: { marginLeft: 'auto' },
  count: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  dots: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand },

  // Your own photo-less session: one row, the band above it, or a hairline from the words when under another.
  oRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.xs, backgroundColor: colors.bg },
  oBand: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt },
  // The hairline starts at the words, as every row on a hairline does (DESIGN.md).
  oJoined: { marginLeft: spacing.lg, paddingLeft: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  oPress: { flex: 1, minWidth: 0, paddingVertical: GALLERY.rowPad, gap: 2 },
  oTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  oTitle: { ...font('500'), fontSize: 15, lineHeight: 20, color: colors.text, flexShrink: 1 },
  oNote: { ...typography.small, fontSize: 12, color: colors.textMuted, flexShrink: 0 },
  oLine: { ...typography.small, lineHeight: 18, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  oMore: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // The head of the list (follow suggestions…) when it sits after the first items: the band above it.
  startInList: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt, paddingTop: spacing.lg, backgroundColor: colors.bg },

  // 'gallery-rollup''s "who played": a band above, the row, then (opened) its sessions on hairlines in the same surface.
  wGroup: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt, backgroundColor: colors.bg },
  wRow: { minHeight: GALLERY.who, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  wFaces: { flexDirection: 'row', alignItems: 'center' },
  wFace: { borderRadius: 16, borderWidth: 2, borderColor: colors.bg },
  wFaceOver: { marginLeft: -8 },
  wText: { ...typography.body, fontSize: 14, color: colors.textMuted, flex: 1, minWidth: 0 },
  wWho: { ...font('500'), color: colors.text },
  wItem: { minHeight: GALLERY.whoItem, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.lg + 2, paddingRight: spacing.lg },
  // The hairline starts at the words (DESIGN.md), and the words grow the row with larger text.
  wItemWords: { flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wItemTitle: { ...typography.body, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  wItemLine: { ...typography.small, lineHeight: 17, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  wAll: { minHeight: 44, justifyContent: 'center', marginLeft: spacing.lg + 2 + 28 + spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wAllText: { ...font('500'), fontSize: 14, color: colors.text },
});
