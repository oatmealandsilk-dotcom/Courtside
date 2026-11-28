import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View, type AccessibilityActionEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Reanimated, { useAnimatedStyle, useReducedMotion, withTiming, type SharedValue } from 'react-native-reanimated';
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

/*
 * Activities as a gallery (Nov 28, owner: "1 gallery is better"; the look is ACTIVITIES_LOOK in ./activitiesLook).
 * One continuous list, no snapping, that you flick through at any speed and that asks for older posts as you near
 * its end. The Feed hands over exactly the posts Activities may show (yours, the people you follow, and a new
 * player's "near you" players; blocked, muted, unfollowed private, taken down, group-only, archived and unfinished
 * ones already left out; an admin's pushed-down ones last). Here:
 *  - other people's sessions show only with a photo or clip: a card with a square picture, Hevy's way;
 *  - your own sessions without one show to you alone, as a thin row, "Not in friends' feeds";
 *  - photo posts, clips and text posts show as cards;
 *  - only a clip opens the full-screen reel (the feed's clips from that one down, videos only); back lands here,
 *    where you were. A double tap on a picture likes it.
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
  /** The column on a computer: a phone's width, so a whole picture card, actions too, fits under the top row. */
  column: 390,
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
  const uri = post.thumbnailUrl ?? post.imageUrl;
  const clip = isClip(post);
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
 * with "Not in friends' feeds" beside it, "1h 15m · 128 bpm" under it, and •••. A tap opens the post. Under another
 * such row it sits on a hairline, not the band, so a run of auto-logs stays small.
 */
function OwnRow({ post, joined }: { post: Post; joined: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const title = titleOf(post, s);
  const line = inlineWords(s);
  return (
    <View testID="acts-own" style={[styles.oRow, joined ? styles.oJoined : styles.oBand]}>
      <Pressable onPress={() => router.push(`/post/${post.id}`)} accessibilityRole="button" accessibilityLabel={`Your ${title}, ${agoInWords(post.createdAt)}. ${line}. ${OWN_NOTE}`} accessibilityHint="Opens the post" style={styles.oPress}>
        <View style={styles.oTop}>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.oTitle}>{title}</Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.oNote}>{OWN_NOTE}</Text>
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

/** One card: a session with a photo or clip, a photo post, a clip, a text post, or (rare: a near player's) a plain session. */
const GalleryCard = React.memo(function GalleryCard({ post, author, me, onOpenClip, near = false, width }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const liked = !!me && post.likedBy.includes(me);
  const media = hasPicture(post);
  const clip = isClip(post);
  const s = post.session;
  const stand = s ? [whatWord(s), scoreLine(s)].filter(Boolean).join(' · ') : undefined;
  const photos = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls.length : 0;
  const [page, setPage] = useState(0);
  // A double tap on a picture likes it (never takes a like away); a single tap does nothing.
  const [bloom, setBloom] = useState(0);
  const lastTap = useRef(0);
  const likedNow = useRef(liked);
  likedNow.current = liked;
  const likeIt = useCallback(() => {
    if (!likedNow.current) actions.toggleLike(post.id, true);
    setBloom((b) => b + 1);
  }, [actions, post.id]);
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) { lastTap.current = 0; likeIt(); } else lastTap.current = now;
  };
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

  // The picture: the column's full width, square cornered and square (Hevy's), so the whole post fits one screen.
  const who = author.name?.trim().split(/\s+/)[0] || author.handle;
  const picture = (
    <View style={[styles.photo, !s && styles.photoUnderHead, { width, height: width }]}>
      {clip ? (
        <Pressable onPress={() => onOpenClip(post.id)} accessibilityRole="button" accessibilityLabel={`${who}'s clip${post.mediaLabel ? `, ${post.mediaLabel}` : ''}`} accessibilityHint="Plays it full screen" style={StyleSheet.absoluteFill}>
          <Media post={post} stand={stand} />
        </Pressable>
      ) : (
        <Pressable
          onPress={tapPicture}
          accessibilityRole="image"
          accessibilityLabel={`${who}'s photo${post.mediaLabel ? `, ${post.mediaLabel}` : ''}${photos ? `, ${photos} photos` : ''}`}
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

/* ------------------------------------------------------------------ the list */

/** What the list draws: a post's card, your own photo-less session as a row, and the head of the list (connect, follow suggestions). */
type Row =
  | { key: string; kind: 'post'; post: Post }
  | { key: string; kind: 'own'; post: Post; joined: boolean }
  | { key: string; kind: 'start' };
/** The head of the list (follow suggestions and the rest) goes after this many items, when there are more: a gallery opens on pictures. */
const START_AFTER = 2;
/** Pages asked for in a row while none of them brings anything this list shows (other people's plain sessions only). */
const QUIET_PAGES = 8;

/** The rows: other people's sessions only with a picture, yours without one as a row, the start block after the first two. */
export function galleryRows(posts: Post[], me: string | null | undefined, showStart: boolean): Row[] {
  const out: Row[] = [];
  for (const post of posts) {
    if (!post.session || hasPicture(post)) out.push({ key: post.id, kind: 'post', post });
    else if (post.authorId === me) out.push({ key: post.id, kind: 'own', post, joined: out[out.length - 1]?.kind === 'own' });
  }
  if (showStart) out.splice(Math.min(START_AFTER, out.length), 0, { key: 'start', kind: 'start' });
  return out;
}

export function ActivitiesList({ posts, showStart, nearCount, near, paused, row }: {
  /** Exactly the posts Activities may show, newest first (the Feed's ActivitiesGallery). */
  posts: Post[];
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
  const app = useApp();
  const { users, currentUserId, followingIds, actions } = app;
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const following = useMemo(() => new Set(followingIds), [followingIds]);
  const rows = useMemo(() => galleryRows(posts, currentUserId, showStart), [posts, currentUserId, showStart]);
  // Anything from someone else on show (the empty note says friends' sessions need a picture when there is none).
  const fromOthers = useMemo(() => rows.some((r) => r.kind === 'post' && r.post.authorId !== currentUserId), [rows, currentUserId]);
  const { width: screenW } = useWindowDimensions();
  const cardW = Math.min(screenW, GALLERY.column);
  const top = insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT + 8;

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
    opening.current = false;
    const y = keptY.current;
    if (y > 0 && Math.abs(lastY.current - y) > 1) {
      listRef.current?.scrollToOffset({ offset: y, animated: false });
      lastY.current = y;
    }
    return () => { onShow.current = false; };
  }, []));
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); if (openingReset.current) clearTimeout(openingReset.current); }, []);
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

  // Older posts as the end nears: the store's next page (AppContext loadMorePosts: 40 posts of the whole feed, by
  // time), with a quiet row while it is on its way. A page can bring nothing this list shows (posts from people you
  // don't follow, other people's plain sessions), so the list would not grow and would never ask again: when a page
  // lands and the list is no longer, ask again while the store has more, up to QUIET_PAGES pages per reach of the end;
  // past that, a plain "Show older posts" row asks on a tap. The store saying it has no more is the end.
  const moreRef = useRef(app.feed.more);
  moreRef.current = app.feed.more;
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(!app.feed.more);
  const [stalled, setStalled] = useState(false);
  const asking = useRef(false);
  const lenRef = useRef(rows.length);
  lenRef.current = rows.length;
  const askedAt = useRef<number | null>(null);
  const tries = useRef(0);
  const [landed, setLanded] = useState(0);
  const loadMore = useCallback((again = false) => {
    if (asking.current) return;
    if (!moreRef.current) { setEnded(true); return; }
    if (!again) tries.current = 0;
    asking.current = true;
    askedAt.current = lenRef.current;
    setLoading(true);
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
    if (rows.length > before) { setLoading(false); return; }
    if (!moreRef.current) { setEnded(true); setLoading(false); return; }
    if (tries.current < QUIET_PAGES - 1) { tries.current += 1; loadMore(true); return; }
    setLoading(false);
    setStalled(true);
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps
  // A pull or a new page from elsewhere can bring more back.
  useEffect(() => { if (app.feed.more) setEnded(false); }, [app.feed.more]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    showRow(liveRow);
    try { await actions.refresh(); } finally { setRefreshing(false); setStalled(false); }
  }, [actions, liveRow]);

  const renderItem = useCallback(({ item: r }: { item: Row }) => {
    if (r.kind === 'start') {
      return (
        <View style={[styles.column, r === rows[0] ? null : styles.startInList]}>
          <ActivitiesStart inList topInset={0} bottomInset={spacing.lg} nearCount={nearCount} sessions={posts.length} shown={!paused} onTop />
        </View>
      );
    }
    if (r.kind === 'own') return <View style={styles.column}><OwnRow post={r.post} joined={r.joined} /></View>;
    const author = usersById.get(r.post.authorId);
    if (!author) return null;
    const nearOne = !!near?.has(author.id) && author.id !== currentUserId && !following.has(author.id);
    return <View style={styles.column}><GalleryCard post={r.post} author={author} me={currentUserId} onOpenClip={openClip} near={nearOne} width={cardW} /></View>;
  }, [usersById, near, currentUserId, following, openClip, cardW, styles, rows, nearCount, posts.length, paused]);

  // Nothing from anyone else yet, and nothing older to ask for (or many pages asked already): say why, calmly. A new
  // player (following fewer than five) has the start block, with its follow suggestions, instead.
  const settled = (ended || stalled) && !loading;
  const quiet = !fromOthers && settled && !showStart ? (
    <View style={[styles.column, rows.length ? styles.emptyUnder : null]}>
      <EmptyState
        icon="images-outline"
        title="No photos from friends yet"
        body="Friends' sessions show up here when they add a photo or a clip. Add one to your next session and they'll see it too."
      />
    </View>
  ) : null;

  const footer = (
    <View style={{ paddingBottom: barInset + spacing.xxl }}>
      {quiet}
      {rows.length ? (
        <View style={styles.end}>
          {loading ? <ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel="Loading older posts" />
            : stalled ? (
              <Pressable onPress={() => loadMore()} accessibilityRole="button" style={styles.older}>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.olderText}>Show older posts</Text>
              </Pressable>
            ) : ended && fromOthers ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.endText}>You're all caught up</Text> : null}
        </View>
      ) : loading ? <View style={styles.end}><ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel="Loading older posts" /></View> : null}
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
        onEndReached={() => loadMore()}
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
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg },
  column: { width: '100%', maxWidth: GALLERY.column, alignSelf: 'center' },
  end: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl, minHeight: 60 },
  endText: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  older: { minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  olderText: { ...font('500'), fontSize: 14, color: colors.text },
  emptyUnder: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt },

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
  oJoined: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  oPress: { flex: 1, minWidth: 0, paddingVertical: GALLERY.rowPad, gap: 2 },
  oTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  oTitle: { ...font('500'), fontSize: 15, lineHeight: 20, color: colors.text, flexShrink: 1 },
  oNote: { ...typography.small, fontSize: 12, color: colors.textMuted, flexShrink: 0 },
  oLine: { ...typography.small, lineHeight: 18, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  oMore: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // The head of the list (follow suggestions…) when it sits after the first items: the band above it.
  startInList: { borderTopWidth: GALLERY.band, borderTopColor: colors.surfaceAlt, paddingTop: spacing.lg, backgroundColor: colors.bg },
});
