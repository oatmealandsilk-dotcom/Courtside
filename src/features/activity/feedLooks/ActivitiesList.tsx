import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import type { Post, SessionDetail, User } from '@/data/types';
import { Avatar } from '@/components/ui';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { ActivitiesStart, NearYouTag } from '@/components/ActivitiesStart';
import { Heart } from '@/components/Heart';
import { PushedDownTag } from '@/components/PushedDownTag';
import { SessionCard } from '@/components/session/SessionCard';
import { StreakFlame } from '@/components/StreakFlame';
import { LevelPill } from '@/components/LevelPill';
import { shownStreak } from '@/features/practice/streakFlame';
import { compactNumber } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { useBarInset } from '@/features/navigation/barInset';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { ROW_TRAVEL, showRow } from '@/features/feed/topRowScroll';
import { agoInWords, duration } from '@/lib/format';
import { sessionPeople } from '@/features/activity/sessionTags';
import { hasSessionStats, resultWord, scoreLine, sessionTitle, sourceLabel, whatWord } from '@/features/activity/format';
import { sharePost, shareLabel } from '@/features/share/sharePost';
import { localDay } from '@/features/practice/stats';
import { matchTiebreakAt } from '@/features/activity/score';
import type { ActivitiesLook } from './activitiesLook';

/*
 * The Activities looks the owner asked to see (Nov 27): one continuous list, no snapping, that you flick through at
 * any speed and that asks for older sessions as you near its end. Three ways to draw a session in it (Strava, Hevy,
 * classic Instagram), from the app's own pieces and the court's colours. The posts are exactly the ones today's
 * Activities shows (the Feed hands them over, already filtered and in order).
 */

type CardProps = { /** The column's width (the mixed looks size their boxes from it). */ width?: number; /** The mixed looks: where the stats sit on a photo card. */ order?: 'stats' | 'photo'; post: Post; author: User; me: string | null; hidden: string[]; users: Map<string, User>; /** The classic look: a clip tapped opens the full-screen reel of the feed's clips (videos only). */ onOpenClip?: (postId: string) => void; /** A "near you" player you don't follow yet: the "Near you" line with Follow under the handle, as Home's Activities. */ near?: boolean };

/* ------------------------------------------------------------------ small shared pieces */

/** Where it was, never for a teen's post (teen rules). */
const placeOf = (post: Post, author: User) => (author.ageGroup === 'teen' ? '' : post.court?.name ?? post.location ?? '');

/** "Tuesday at 6:40 PM" / "Today at 6:40 PM", as Strava dates an activity. */
function whenWords(iso: string): string {
  const at = new Date(iso);
  const now = new Date();
  const day = localDay(at) === localDay(now) ? 'Today' : localDay(at) === localDay(new Date(now.getTime() - 86_400_000)) ? 'Yesterday'
    : at.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return `${day} at ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "Evening match", from when it was posted and what it was. */
const titleOf = (post: Post, s: SessionDetail) => sessionTitle(whatWord(s), { day: s.day ?? localDay(post.createdAt), startHour: new Date(post.createdAt).getHours() });

/** Who it was against or with, by first name: "vs Mira", "with June". */
function peopleWords(s: SessionDetail, hidden: string[]): string | null {
  const { opponents, partners } = sessionPeople(s, hidden);
  const first = (w: { name?: string; handle: string }) => w.name?.trim().split(/\s+/)[0] || `@${w.handle}`;
  const list = (ws: { name?: string; handle: string }[]) => ws.map(first).join(' & ');
  const parts = [opponents.length ? `vs ${list(opponents)}` : '', partners.length ? `with ${list(partners)}` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** "Liked by mira and 2 others" (you count as "you"). */
function likedLine(post: Post, me: string | null, users: Map<string, User>): string | null {
  const n = post.likedBy.length;
  if (!n) return null;
  const firstId = post.likedBy.find((id) => id !== me) ?? post.likedBy[0];
  const first = firstId === me ? 'you' : users.get(firstId)?.handle ?? 'someone';
  return n === 1 ? `Liked by ${first}` : `Liked by ${first} and ${n - 1} ${n - 1 === 1 ? 'other' : 'others'}`;
}

const hasMedia = (p: Post) => !!(p.imageUrl || p.thumbnailUrl || p.videoUrl || p.mediaLabel);
const isClip = (p: Post) => p.kind === 'clip' || !!p.videoUrl;

/** "0:14", when the clip's trimmed length is known (a post carries no length of its own otherwise). */
function clipLength(p: Post): string | null {
  if (p.trimEnd === undefined || p.trimEnd <= (p.trimStart ?? 0)) return null;
  const secs = Math.round((p.trimEnd - (p.trimStart ?? 0)) / (p.speed || 1));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** The post's picture, clip cover, or the demo's court card; `stand` names a stats-only session's card. */
/** A post's several photos, swiped sideways in the square as Instagram's (the classic look); `onPage` hears which one is on show. */
function Photos({ urls, label, onPage, count = true }: { urls: string[]; label: string; onPage: (i: number) => void; /** The '2/3' pill on the photo (the mixed looks show only the dots). */ count?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [at, setAt] = useState(0);
  const atRef = useRef(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!box.w) return;
    const i = Math.max(0, Math.min(urls.length - 1, Math.round(e.nativeEvent.contentOffset.x / box.w)));
    if (i !== atRef.current) { atRef.current = i; setAt(i); onPage(i); }
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w ? (
        <FlatList
          horizontal
          pagingEnabled
          data={urls}
          keyExtractor={(u, i) => `${i}`}
          renderItem={({ item, index }) => <ExpoImage source={{ uri: item }} contentFit="cover" style={{ width: box.w, height: box.h }} accessibilityLabel={`${label}, photo ${index + 1} of ${urls.length}`} />}
          getItemLayout={(_, index) => ({ length: box.w, offset: box.w * index, index })}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          nestedScrollEnabled
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {count ? <View pointerEvents="none" style={styles.countMark}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.countText}>{at + 1}/{urls.length}</Text></View> : null}
    </View>
  );
}

/** Instagram's small dots under a carousel: which photo is on show. */
function Dots({ n, at }: { n: number; at: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View pointerEvents="none" style={styles.dots}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={[styles.dot, i === at && styles.dotOn]} />)}
    </View>
  );
}

function Media({ post, aspect, stand, clipBadge = false, onPage, count = true }: { post: Post; aspect: number; stand?: string; /** The '1/3' pill on several photos (the mixed looks show only the dots). */ count?: boolean; /** A clip's small play mark and length on a quiet pill (the classic look), on its cover; the demo's court card already carries its own play mark. */ clipBadge?: boolean; /** The classic look: several photos swipe sideways, this hears which is on show. */ onPage?: (i: number) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const uri = post.thumbnailUrl ?? post.imageUrl;
  const length = clipLength(post);
  const many = !isClip(post) && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls : null;
  if (many && onPage) {
    return <View style={[styles.media, { aspectRatio: aspect }]}><Photos urls={many} label={post.mediaLabel ?? 'Photo'} onPage={onPage} count={count} /></View>;
  }
  return (
    <View style={[styles.media, { aspectRatio: aspect }]}>
      {uri ? <ExpoImage source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel={post.mediaLabel ?? 'Photo'} />
        : <MediaPlaceholder fill label={post.mediaLabel ?? stand ?? 'Session'} seed={post.id} />}
      {clipBadge && isClip(post) ? (uri || !/·\s*\d+:\d+/.test(post.mediaLabel ?? stand ?? '') ? (
        <View style={styles.clipMark}>
          <Ionicons name="play" size={11} color={colors.onMedia} />
          {length ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.clipMarkText}>{length}</Text> : null}
        </View>
      ) : null) : uri && isClip(post) ? <View style={styles.playMark}><Ionicons name="play" size={18} color={colors.onMedia} /></View> : null}
      {count && post.imageUrls && post.imageUrls.length > 1 ? <View style={styles.countMark}><Text style={styles.countText}>1/{post.imageUrls.length}</Text></View> : null}
    </View>
  );
}

function useCardActions(post: Post, me: string | null) {
  const { actions } = useApp();
  const liked = !!me && post.likedBy.includes(me);
  return {
    liked,
    like: () => actions.toggleLike(post.id, !liked),
    open: () => router.push(`/post/${post.id}`),
    comments: () => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } }),
    author: () => router.push(`/user/${post.authorId}`),
  };
}

/* ------------------------------------------------------------------ A · Strava */

/** Strava's numbers: a small label over a big figure, columns parted by whitespace, no boxes. */
function stravaStats(s: SessionDetail): { label: string; value: string; unit?: string }[] {
  const out: { label: string; value: string; unit?: string }[] = [];
  const score = scoreLine(s);
  if (score) out.push({ label: resultWord(s) ?? 'Score', value: score });
  out.push({ label: 'Time', value: duration(s.minutes) });
  if (s.avgHr) out.push({ label: 'Avg heart rate', value: String(s.avgHr), unit: 'bpm' });
  else if (s.kcal) out.push({ label: 'Calories', value: String(Math.round(s.kcal)), unit: 'Cal' });
  else if (s.maxHr) out.push({ label: 'Max heart rate', value: String(s.maxHr), unit: 'bpm' });
  if (out.length < 3 && s.kcal && s.avgHr) out.push({ label: 'Calories', value: String(Math.round(s.kcal)), unit: 'Cal' });
  return out.slice(0, 3);
}

function StravaCard({ post, author, me, hidden, users }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const act = useCardActions(post, me);
  const place = placeOf(post, author);
  const stats = stravaStats(s);
  const people = peopleWords(s, hidden);
  const liked = likedLine(post, me, users);
  return (
    <View style={styles.card}>
      <View style={styles.pad}>
        <Pressable onPress={act.author} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={40} />
          <View style={styles.whoWords}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{author.name}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{whenWords(post.createdAt)}{place ? ` · ${place}` : ''}</Text>
          </View>
        </Pressable>
        <Pressable onPress={act.open} accessibilityRole="link" accessibilityLabel={`Open ${titleOf(post, s)}`}>
          <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.sTitle}>{titleOf(post, s)}</Text>
          {post.body ? <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>{post.body}</Text> : null}
          <View style={styles.sStats}>
            {stats.map((st, i) => (
              <View key={st.label} style={[styles.sStat, i === 0 && stats.length > 2 && scoreLine(s) ? styles.sStatWide : null, i > 0 && styles.sStatRule]}>
                <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.sLabel}>{st.label}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={TextScale.CARD} style={styles.sValue}>
                  {st.value}{st.unit ? <Text style={styles.sUnit}> {st.unit}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
          {people ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.people}>{people}</Text> : null}
        </Pressable>
      </View>
      {hasMedia(post) ? <Pressable onPress={act.open} accessibilityRole="link" accessibilityLabel="Open the post"><Media post={post} aspect={4 / 3} /></Pressable> : null}
      <View style={[styles.pad, styles.sFoot]}>
        <Pressable onPress={act.open} style={styles.flex}>
          <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>
            {liked ?? 'Be the first to give kudos'}{post.commentIds.length ? ` · ${post.commentIds.length} ${post.commentIds.length === 1 ? 'comment' : 'comments'}` : ''}
          </Text>
        </Pressable>
        <View style={styles.sIcons}>
          <Pressable onPress={act.like} hitSlop={10} accessibilityRole="button" accessibilityLabel={act.liked ? 'Remove kudos' : 'Give kudos'}>
            <Ionicons name={act.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={21} color={act.liked ? colors.brand : colors.textMuted} />
          </Pressable>
          <Pressable onPress={act.comments} hitSlop={10} accessibilityRole="button" accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ B · Hevy */

/** The session's lines, as Hevy lists a workout's exercises: what, then the figure at the right. Nothing it does not have. */
function hevyLines(s: SessionDetail, hidden: string[]): { what: string; value: string }[] {
  const lines: { what: string; value: string }[] = [];
  (s.sets ?? []).forEach(([a, b, pts], i, all) => {
    lines.push({ what: matchTiebreakAt(all, i) ? 'Match tiebreak' : `Set ${i + 1}`, value: `${a}–${b}${pts !== undefined ? `(${pts})` : ''}` });
  });
  const { opponents, partners } = sessionPeople(s, hidden);
  if (opponents.length) lines.push({ what: 'Against', value: opponents.map((o) => o.name || `@${o.handle}`).join(', ') });
  if (partners.length) lines.push({ what: 'With', value: partners.map((o) => o.name || `@${o.handle}`).join(', ') });
  for (const d of s.drills.slice(0, 3)) lines.push({ what: d, value: '' });
  if (s.drills.length > 3) lines.push({ what: `${s.drills.length - 3} more drills`, value: '' });
  return lines;
}

function ZonesBar({ zones }: { zones: number[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const total = zones.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const tones = [colors.border, colors.brandDim, colors.court, colors.brand, colors.clay];
  const hard = (zones[3] ?? 0) + (zones[4] ?? 0);
  return (
    <View style={styles.zones} accessible accessibilityLabel={`Heart-rate zones: ${hard} minutes in zones 4 and 5. Training information only.`}>
      <View style={styles.zonesHead}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hLabel}>Heart-rate zones</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.hLabel}><Text style={styles.num}>{hard}</Text> min in zones 4–5</Text>
      </View>
      <View style={styles.zonesBar}>
        {zones.map((m, i) => (m > 0 ? <View key={i} style={{ flex: m, backgroundColor: tones[i] ?? colors.brand }} /> : null))}
      </View>
    </View>
  );
}

function HevyCard({ post, author, me, hidden }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const act = useCardActions(post, me);
  const score = scoreLine(s);
  const result = resultWord(s);
  const stats = [
    { label: 'Duration', value: duration(s.minutes) },
    ...(score ? [{ label: result ?? 'Score', value: score }] : s.sets?.length ? [] : s.drills.length ? [{ label: 'Drills', value: String(s.drills.length) }] : []),
    ...(s.avgHr ? [{ label: 'Avg HR', value: `${s.avgHr}` }] : s.kcal ? [{ label: 'Calories', value: `${Math.round(s.kcal)}` }] : []),
  ];
  const lines = hevyLines(s, hidden);
  const thumb = hasMedia(post);
  return (
    <View style={styles.card}>
      <View style={styles.pad}>
        <Pressable onPress={act.author} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={36} />
          <View style={styles.whoWords}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.name}>{author.handle}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.meta}>{agoInWords(post.createdAt)}{placeOf(post, author) ? ` · ${placeOf(post, author)}` : ''}</Text>
          </View>
        </Pressable>
        <Pressable onPress={act.open} accessibilityRole="link" accessibilityLabel={`Open ${titleOf(post, s)}`}>
          <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.hTitle}>{titleOf(post, s)}</Text>
          {post.body ? <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>{post.body}</Text> : null}
          <View style={styles.hTop}>
            <View style={styles.hStats}>
              {stats.map((st) => (
                <View key={st.label} style={styles.hStat}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.hLabel}>{st.label}</Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.hValue}>{st.value}</Text>
                </View>
              ))}
            </View>
            {thumb ? <View style={styles.hThumb}><Media post={post} aspect={1} /></View> : null}
          </View>
          {lines.length ? (
            <View style={styles.hLines}>
              {lines.map((l, i) => (
                <View key={`${l.what}-${i}`} style={[styles.hLine, i > 0 && styles.hairTop]}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.hWhat}>{l.what}</Text>
                  {l.value ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.hNum}>{l.value}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          {s.zones?.length ? <ZonesBar zones={s.zones} /> : null}
        </Pressable>
      </View>
      <View style={[styles.hFoot, styles.hairTop]}>
        <Pressable onPress={act.like} style={styles.hAct} accessibilityRole="button" accessibilityLabel={act.liked ? 'Unlike' : 'Like'}>
          <Ionicons name={act.liked ? 'heart' : 'heart-outline'} size={19} color={act.liked ? colors.brand : colors.textMuted} />
          <Text style={styles.hActText}>{post.likedBy.length || 'Like'}</Text>
        </Pressable>
        <Pressable onPress={act.comments} style={styles.hAct} accessibilityRole="button" accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
          <Text style={styles.hActText}>{post.commentIds.length || 'Comment'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ C · classic Instagram */

/** The numbers as one quiet line under the caption: "Match · Won 6–4 3–6 7–5 · 1h 12m · 150 avg bpm". */
function oneLine(s: SessionDetail, hidden: string[]): string {
  const score = scoreLine(s);
  const result = resultWord(s);
  return [
    [whatWord(s), [result, score].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    peopleWords(s, hidden),
    duration(s.minutes),
    s.avgHr ? `${s.avgHr} avg bpm` : null,
  ].filter(Boolean).join(' · ');
}

/** The heart that blooms on a double tap, as Instagram's; keyed on a counter so a second double tap plays it again. */
function Bloom({ token }: { token: number }) {
  const scale = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!token) return;
    scale.setValue(0.5);
    shown.setValue(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 12 }),
      Animated.sequence([Animated.delay(220), Animated.timing(shown, { toValue: 0, duration: 160, useNativeDriver: true })]),
    ]).start();
  }, [token, scale, shown]);
  if (!token) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={{ opacity: shown, transform: [{ scale }] }}>
        <Ionicons name="heart" size={96} color={colors.onMedia} />
      </Animated.View>
    </View>
  );
}

const ClassicCard = React.memo(function ClassicCard({ post, author, me, hidden, users, onOpenClip, near = false }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const s = post.session;
  const act = useCardActions(post, me);
  const place = placeOf(post, author);
  const liked = likedLine(post, me, users);
  const n = post.commentIds.length;
  const clip = isClip(post);
  const media = hasMedia(post);
  // A post with nothing to look at but its words (a note, a question to friends): the words take the picture's place.
  const wordsOnly = !media && !s;
  const stand = s ? [whatWord(s), scoreLine(s)].filter(Boolean).join(' · ') : undefined;
  const stats = s ? oneLine(s, hidden) : null;
  const openStats = () => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } });
  // Several photos: swiped sideways in the square, dots under it show which (Instagram's carousel).
  const photos = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls.length : 0;
  const [page, setPage] = useState(0);

  // A double tap on a picture likes it (never takes a like away), as Instagram's; a single tap does nothing.
  const [bloom, setBloom] = useState(0);
  const lastTap = useRef(0);
  const likedNow = useRef(act.liked);
  likedNow.current = act.liked;
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (!likedNow.current) actions.toggleLike(post.id, true);
      setBloom((b) => b + 1);
    } else lastTap.current = now;
  };

  return (
    <View style={styles.cCard}>
      <View style={styles.cHead}>
        <Pressable onPress={act.author} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={[styles.who, styles.flex]}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} />
          <View style={styles.whoWords}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cHandle}>{author.handle}</Text>
            {place ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cPlace}>{place}</Text> : null}
            <PushedDownTag post={post} style={styles.cPushed} />
          </View>
        </Pressable>
        {/* The post menu, as every card today: report, block, mute, save, edit or delete your own, an admin's take down. */}
        <Pressable onPress={() => router.push({ pathname: '/post-menu', params: { id: post.id } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="More options" style={styles.cMore}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
        </Pressable>
      </View>
      {near ? <View style={styles.cNear}><NearYouTag user={author} /></View> : null}
      {wordsOnly ? (
        <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel="Open comments" style={styles.cWords}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.cWordsText}>{post.body}</Text>
        </Pressable>
      ) : clip ? (
        <Pressable onPress={() => onOpenClip?.(post.id)} accessibilityRole="button" accessibilityLabel="Play the clip full screen">
          <Media post={post} aspect={1} stand={stand} clipBadge />
        </Pressable>
      ) : (
        <Pressable onPress={tapPicture} accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? (s ? 'Session card' : 'Photo')} accessibilityHint="Double tap to like">
          <Media post={post} aspect={1} stand={stand} onPage={photos ? setPage : undefined} />
          <Bloom token={bloom} />
        </Pressable>
      )}
      <View style={styles.cBody}>
        <View style={styles.cIcons}>
          <Pressable onPress={act.like} hitSlop={8} accessibilityRole="button" accessibilityLabel={act.liked ? 'Unlike' : 'Like'}>
            <Heart liked={act.liked} size={26} ink={colors.text} pop={bloom} />
          </Pressable>
          <Pressable onPress={act.comments} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={23} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => sharePost(post, me)} hitSlop={8} accessibilityRole="button" accessibilityLabel={shareLabel(post, me, clip ? 'clip' : 'post')}>
            <Ionicons name="paper-plane-outline" size={23} color={colors.text} />
          </Pressable>
          {photos ? <Dots n={photos} at={page} /> : null}
        </View>
        {liked ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cLiked}>{liked}</Text> : null}
        {post.body && !wordsOnly ? (
          <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel="Open comments">
            <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.cCaption}>
              <Text style={styles.cHandle}>{author.handle}</Text> {post.body}
            </Text>
          </Pressable>
        ) : null}
        {stats ? (
          <Pressable onPress={s && hasSessionStats(s) ? openStats : undefined} disabled={!(s && hasSessionStats(s))} accessibilityRole="button" accessibilityLabel={`Session stats: ${stats}`}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cStats}>{stats}</Text>
          </Pressable>
        ) : null}
        {n ? <Pressable onPress={act.comments}><Text style={styles.cMuted}>{n === 1 ? 'View 1 comment' : `View all ${n} comments`}</Text></Pressable> : null}
        <Text style={styles.cTime}>{agoInWords(post.createdAt).toUpperCase()}</Text>
      </View>
    </View>
  );
});

/* ------------------------------------------------------------------ mixed: small plain cards, whole photo cards */

/*
 * The mixed looks (Nov 27, owner: "if an activity is just the card autologged with nothing on it, we can just fit 3
 * ... into one phone sized page, and then the ones with photos would look more special because they take up a whole
 * page"). Two sizes, each always the same: a PLAIN card (a session with no photo or clip, a text post, a milestone)
 * is MIXED.plain tall, three to a phone screen; a PHOTO card (anything with a photo or clip) is the same pieces with
 * the picture in the middle at 4:5, about a screen tall. Both are today's session box (SessionCard, compact) under
 * the same name row, with one line of words and the actions row, so they read as one family. Nothing wraps.
 */
export const MIXED = {
  /** Above the name row, under the hairline that parts two cards. */
  padTop: 12,
  head: 32,
  gap: 8,
  /** The session box (SessionCard compact), and a text post's words in its place. */
  box: 100,
  line: 20,
  actions: 36,
  padBottom: 4,
};
/** A plain card's whole height: name row, box, one line, actions. */
export const PLAIN_H = MIXED.padTop + MIXED.head + MIXED.gap + MIXED.box + MIXED.gap + MIXED.line + MIXED.actions + MIXED.padBottom;
const PHOTO_SHAPE = 4 / 5;
/** A text post's framed words: the box, the gap and the line together. */
const TEXT_H = MIXED.box + MIXED.gap + MIXED.line;

function MixedHead({ post, author, me }: { post: Post; author: User; me: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const streak = shownStreak(author, me);
  return (
    <View style={styles.mHead}>
      <Pressable onPress={() => router.push(`/user/${author.id}`)} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={[styles.who, styles.flex]}>
        <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} />
        <View style={[styles.mNameRow, styles.flex]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.mName}>{author.name}</Text>
          <StreakFlame days={streak} maxFontSizeMultiplier={1.1} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.mWhen}>{agoInWords(post.createdAt)}</Text>
          <PushedDownTag post={post} />
        </View>
      </Pressable>
      <LevelPill profile={author.profile} userId={author.id} small style={styles.mLevel} />
    </View>
  );
}

function MixedActions({ post, me, clip, children }: { post: Post; me: string | null; clip: boolean; children?: React.ReactNode }) {
  const styles = useThemedStyles(styleDefinitions);
  const { saved: savedItems, actions } = useApp();
  const act = useCardActions(post, me);
  const likes = post.likedBy.length;
  const n = post.commentIds.length;
  const saved = savedItems.postIds.includes(post.id);
  return (
    <View style={styles.mActions}>
      <Pressable onPress={act.like} hitSlop={6} style={styles.mAct} accessibilityRole="button" accessibilityLabel={act.liked ? 'Unlike' : 'Like'}>
        <Heart liked={act.liked} size={22} ink={colors.text} />
        {likes ? <Text maxFontSizeMultiplier={1.1} style={styles.mCount}>{compactNumber(likes)}</Text> : null}
      </Pressable>
      <Pressable onPress={act.comments} hitSlop={6} style={styles.mAct} accessibilityRole="button" accessibilityLabel={n ? `Comments, ${n}` : 'Comments'}>
        <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
        {n ? <Text maxFontSizeMultiplier={1.1} style={styles.mCount}>{compactNumber(n)}</Text> : null}
      </Pressable>
      <Pressable onPress={() => sharePost(post, me)} hitSlop={6} style={styles.mAct} accessibilityRole="button" accessibilityLabel={shareLabel(post, me, clip ? 'clip' : 'post')}>
        <Ionicons name="arrow-redo-outline" size={21} color={colors.text} />
      </Pressable>
      {children}
      {/* Save, as today's card: just before the menu, on the right. */}
      <Pressable onPress={() => actions.toggleSavePost(post.id)} hitSlop={6} style={[styles.mAct, styles.mSave]} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save this post'}>
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.text} />
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: '/post-menu', params: { id: post.id } })} hitSlop={8} style={styles.mAct} accessibilityRole="button" accessibilityLabel="More options">
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** The session box, or a text post's words in its place: always MIXED.box tall. */
function MixedBox({ post, author, width, hidden, joined }: { post: Post; author: User; width: number; hidden: string[]; joined?: 'top' | 'bottom' }) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session;
  const openStats = () => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } });
  if (s) {
    return <SessionCard session={s} author={author.name} width={width} height={MIXED.box} compact joined={joined} hidden={hidden} onPress={hasSessionStats(s) ? openStats : undefined} />;
  }
  return (
    <Pressable onPress={() => router.push({ pathname: '/comments', params: { kind: 'post', id: post.id } })} accessibilityRole="button" accessibilityLabel="Open comments" style={[styles.mWords, { width }]}>
      <Text numberOfLines={3} maxFontSizeMultiplier={1.1} style={styles.mWordsText}>{post.body}</Text>
    </Pressable>
  );
}

/** One line of words under the box: the caption, else where the numbers came from and where it was (never a teen's place). */
function mixedLine(post: Post, author: User): { text: string; quiet: boolean } {
  const s = post.session;
  if (s && post.body?.trim()) return { text: post.body.trim().replace(/\s+/g, ' '), quiet: false };
  const n = post.commentIds.length;
  if (!s) return { text: n ? (n === 1 ? 'View 1 comment' : `View all ${n} comments`) : '', quiet: true };
  const place = placeOf(post, author);
  return { text: [s.activityId ? sourceLabel(s.source ?? 'apple-health') : null, place || null].filter(Boolean).join(' · '), quiet: true };
}

const MixedCard = React.memo(function MixedCard({ post, author, me, hidden, onOpenClip, near = false, width = 390, order = 'stats' }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const act = useCardActions(post, me);
  const inner = width - spacing.lg * 2;
  const media = hasMedia(post);
  const clip = isClip(post);
  const line = mixedLine(post, author);
  const stand = post.session ? [whatWord(post.session), scoreLine(post.session)].filter(Boolean).join(' · ') : undefined;
  const photos = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls.length : 0;
  const [page, setPage] = useState(0);
  // A double tap on a picture likes it (never takes a like away), as the classic look; a single tap does nothing.
  const [bloom, setBloom] = useState(0);
  const lastTap = useRef(0);
  const likedNow = useRef(act.liked);
  likedNow.current = act.liked;
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (!likedNow.current) actions.toggleLike(post.id, true);
      setBloom((b) => b + 1);
    } else lastTap.current = now;
  };
  const lineView = (
    <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel={line.text ? `${line.text}. Open comments` : 'Open comments'} style={styles.mLine}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={line.quiet ? styles.mLineQuiet : styles.mLineText}>{line.text}</Text>
    </Pressable>
  );
  const nearLine = near ? <View style={styles.mNear}><NearYouTag user={author} /></View> : null;

  if (!media) {
    return (
      <View testID="mixed-plain" style={[styles.mCard, { height: PLAIN_H + (near ? NEAR_H : 0) }]}>
        <MixedHead post={post} author={author} me={me} />
        {nearLine}
        {post.session ? (
          <>
            <View style={styles.mBoxSlot}><MixedBox post={post} author={author} width={inner} hidden={hidden} /></View>
            {lineView}
          </>
        ) : (
          // A text post: its framed words take the box and the line's place together, so the card keeps PLAIN_H with no empty row.
          <View style={[styles.mBoxSlot, { height: TEXT_H }]}><MixedBox post={post} author={author} width={inner} hidden={hidden} /></View>
        )}
        <MixedActions post={post} me={me} clip={false} />
      </View>
    );
  }

  // A photo card is one frame. With a session, the box and the picture share it (one outer radius, a hairline where
  // they meet): box over picture in A, picture over box in B. Without a session there is no box: the picture alone,
  // then the caption in two fixed lines, in both orders.
  const s = post.session;
  const joined = !!s;
  const picture = (
    <View style={[joined ? styles.mPhotoJoined : styles.mPhoto, { width: inner, height: Math.round(inner / PHOTO_SHAPE) }]}>
      {clip ? (
        <Pressable onPress={() => onOpenClip?.(post.id)} accessibilityRole="button" accessibilityLabel="Play the clip full screen" style={StyleSheet.absoluteFill}>
          <Media post={post} aspect={PHOTO_SHAPE} stand={stand} clipBadge />
        </Pressable>
      ) : (
        <Pressable onPress={tapPicture} accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? 'Photo'} accessibilityHint="Double tap to like" style={StyleSheet.absoluteFill}>
          <Media post={post} aspect={PHOTO_SHAPE} stand={stand} onPage={photos ? setPage : undefined} count={false} />
          <Bloom token={bloom} />
        </Pressable>
      )}
    </View>
  );
  const actionsRow = <MixedActions post={post} me={me} clip={clip}>{photos ? <Dots n={photos} at={page} /> : null}</MixedActions>;
  if (!joined) {
    const words = post.body?.trim().replace(/\s+/g, ' ') ?? '';
    return (
      <View testID="mixed-photo" style={styles.mCard}>
        <MixedHead post={post} author={author} me={me} />
        {nearLine}
        {picture}
        <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel={words ? `${words}. Open comments` : 'Open comments'} style={styles.mCaption}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={styles.mLineText}>{words}</Text>
        </Pressable>
        {actionsRow}
      </View>
    );
  }
  const box = (o: 'top' | 'bottom') => <View style={styles.mBoxJoined}><MixedBox post={post} author={author} width={inner} hidden={hidden} joined={o} /></View>;
  const seam = <View style={styles.mSeam} />;
  return (
    <View testID="mixed-photo" style={styles.mCard}>
      <MixedHead post={post} author={author} me={me} />
      {nearLine}
      <View style={[styles.mFrame, { width: inner }]}>
        {order === 'stats' ? <>{box('bottom')}{seam}{picture}</> : <>{picture}{seam}{box('top')}</>}
      </View>
      {lineView}
      {actionsRow}
    </View>
  );
});
/** The "Near you" line with Follow, under a near player's name row. */
const NEAR_H = 30;

/* ------------------------------------------------------------------ mixed-a2: the card as one unit, edge to edge */

/*
 * 'mixed-a2' (Nov 27, owner, on mixed-a: "stats first is better but ... the cards seem like a bit weird the way its
 * like sitting ... just gotta be more like instagram hevy and strava"). In mixed-a a card was a stack of separate
 * framed pieces (a header, a rounded box inset from the edges, a rounded photo inset again). Here, as Strava, Hevy
 * and Instagram do it, the CARD is the unit: the column's full width, parted from the next by a thin band of the
 * page's second ground; the header (name, then when · where); a title line ("Evening match") with the result; the
 * same numbers in the same type straight on the card (SessionCard compact, `bare`); the photo full bleed and square
 * cornered at 4:5; the caption; the actions with their counts. All words share one left edge (the 16pt gutter); only
 * the photo runs to the edges. Every plain card is PLAIN2_H tall, every photo card the same as every other.
 */
export const MIXED2 = {
  /** The band of the page's second ground above each card. */
  band: 6,
  padTop: 12,
  head: 36,
  gap: 10,
  /** The title line, 6pt, and the numbers' row: SessionCard compact `bare`. */
  stats: 86,
  lineGap: 6,
  line: 20,
  actions: 36,
  padBottom: 4,
};
export const PLAIN2_H = MIXED2.band + MIXED2.padTop + MIXED2.head + MIXED2.gap + MIXED2.stats + MIXED2.lineGap + MIXED2.line + MIXED2.actions + MIXED2.padBottom;
/** A text post's words: the numbers', the gap's and the line's place together. */
const TEXT2_H = MIXED2.stats + MIXED2.lineGap + MIXED2.line;

function MixedHead2({ post, author, me }: { post: Post; author: User; me: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const streak = shownStreak(author, me);
  const place = placeOf(post, author);
  return (
    <View style={styles.m2Head}>
      <Pressable onPress={() => router.push(`/user/${author.id}`)} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={[styles.who, styles.flex]}>
        <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={36} />
        <View style={[styles.flex, styles.m2Words]}>
          <View style={styles.mNameRow}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.mName}>{author.name}</Text>
            <StreakFlame days={streak} maxFontSizeMultiplier={1.1} />
            <PushedDownTag post={post} />
          </View>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.m2Meta}>{agoInWords(post.createdAt)}{place ? ` · ${place}` : ''}</Text>
        </View>
      </Pressable>
      <LevelPill profile={author.profile} userId={author.id} small style={styles.mLevel} />
    </View>
  );
}

const MixedCard2 = React.memo(function MixedCard2({ post, author, me, hidden, onOpenClip, near = false, width = 390 }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const { actions } = useApp();
  const act = useCardActions(post, me);
  const inner = width - spacing.lg * 2;
  const media = hasMedia(post);
  const clip = isClip(post);
  const s = post.session;
  const stand = s ? [whatWord(s), scoreLine(s)].filter(Boolean).join(' · ') : undefined;
  const photos = !clip && post.imageUrls && post.imageUrls.length > 1 ? post.imageUrls.length : 0;
  const [page, setPage] = useState(0);
  // A double tap on a picture likes it (never takes a like away); a single tap does nothing.
  const [bloom, setBloom] = useState(0);
  const lastTap = useRef(0);
  const likedNow = useRef(act.liked);
  likedNow.current = act.liked;
  const tapPicture = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      if (!likedNow.current) actions.toggleLike(post.id, true);
      setBloom((b) => b + 1);
    } else lastTap.current = now;
  };
  const openStats = () => router.push({ pathname: '/session-stats', params: { kind: 'post', id: post.id } });
  // The caption, else (a session with none) where the numbers came from; the place is in the header now.
  const caption = post.body?.trim().replace(/\s+/g, ' ') ?? '';
  const lineText = s ? (caption || (s.activityId ? sourceLabel(s.source ?? 'apple-health') : '')) : '';
  const quiet = !caption;
  const nearLine = near ? <View style={styles.mNear}><NearYouTag user={author} /></View> : null;
  const stats = s ? (
    <View style={styles.m2Stats}>
      <SessionCard session={s} author={author.name} width={inner} height={MIXED2.stats} compact bare eyebrow={titleOf(post, s)} hidden={hidden} onPress={hasSessionStats(s) ? openStats : undefined} />
    </View>
  ) : null;
  const lineView = (
    <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel={lineText ? `${lineText}. Open comments` : 'Open comments'} style={styles.m2Line}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={quiet ? styles.mLineQuiet : styles.mLineText}>{lineText}</Text>
    </Pressable>
  );
  const actionsRow = <MixedActions post={post} me={me} clip={clip}>{photos ? <Dots n={photos} at={page} /> : null}</MixedActions>;

  if (!media) {
    return (
      <View testID="mixed-plain" style={[styles.m2Card, { height: PLAIN2_H + (near ? NEAR_H : 0) }]}>
        <MixedHead2 post={post} author={author} me={me} />
        {nearLine}
        {s ? <>{stats}{lineView}</> : (
          // A text post: its words, plain on the card, in the numbers' and the line's place.
          <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel="Open comments" style={styles.m2Text}>
            <Text numberOfLines={4} maxFontSizeMultiplier={1.1} style={styles.m2TextWords}>{post.body}</Text>
          </Pressable>
        )}
        {actionsRow}
      </View>
    );
  }

  // The picture: the column's full width, square cornered, 4:5, nothing round it.
  const picture = (
    <View style={[styles.m2Photo, { width, height: Math.round(width / PHOTO_SHAPE) }]}>
      {clip ? (
        <Pressable onPress={() => onOpenClip?.(post.id)} accessibilityRole="button" accessibilityLabel="Play the clip full screen" style={StyleSheet.absoluteFill}>
          <Media post={post} aspect={PHOTO_SHAPE} stand={stand} clipBadge />
        </Pressable>
      ) : (
        <Pressable onPress={tapPicture} accessibilityRole="image" accessibilityLabel={post.mediaLabel ?? 'Photo'} accessibilityHint="Double tap to like" style={StyleSheet.absoluteFill}>
          <Media post={post} aspect={PHOTO_SHAPE} stand={stand} onPage={photos ? setPage : undefined} count={false} />
          <Bloom token={bloom} />
        </Pressable>
      )}
    </View>
  );
  return (
    <View testID="mixed-photo" style={styles.m2Card}>
      <MixedHead2 post={post} author={author} me={me} />
      {nearLine}
      {stats}
      {picture}
      {s ? lineView : (
        <Pressable onPress={act.comments} accessibilityRole="button" accessibilityLabel={caption ? `${caption}. Open comments` : 'Open comments'} style={styles.m2Caption}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={styles.mLineText}>{caption}</Text>
        </Pressable>
      )}
      {actionsRow}
    </View>
  );
});

const MixedA = (p: CardProps) => <MixedCard {...p} order="stats" />;
const MixedB = (p: CardProps) => <MixedCard {...p} order="photo" />;

/* ------------------------------------------------------------------ the list */

const CARD: Record<Exclude<ActivitiesLook, 'now'>, React.ComponentType<CardProps>> = { strava: StravaCard, hevy: HevyCard, classic: ClassicCard, 'mixed-a': MixedA, 'mixed-b': MixedB, 'mixed-a2': MixedCard2 };

export function ActivitiesList({ look, posts, showStart, nearCount, near, paused, row }: {
  look: Exclude<ActivitiesLook, 'now'>;
  /** Exactly the posts today's Activities shows, in its order. */
  posts: Post[];
  /** The "Follow more players" start (ActivitiesStart) at the list's head, at its own height. */
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
  const { users, currentUserId, blockedIds, followingIds, actions } = app;
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const Card = CARD[look];
  // The mixed looks behave as the classic one (every kind of post, a clip opens the reel); only the cards differ.
  const classic = look === 'classic' || look === 'mixed-a' || look === 'mixed-b' || look === 'mixed-a2';
  const { width: screenW } = useWindowDimensions();
  // A clip tapped (classic look): the full-screen reel, that clip first, then the feed's clips below it, videos only.
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
  // The mixed looks' column on a computer: a photo card (4:5) still fits under the top row of an 800-tall window.
  // mixed-a2's photo runs edge to edge of the column, so the column is a phone's width: the whole card, actions too, fits.
  const column = look === 'mixed-a2' ? 390 : look === 'mixed-a' || look === 'mixed-b' ? 420 : classic ? 470 : 600;
  const cardW = Math.min(screenW, column);
  const top = insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT + 8;

  // The top row follows the list the way Instagram's header does: forward takes it out with the scroll, back brings it in.
  const liveRow = paused ? undefined : row;
  const lastY = useRef(0);
  // Where the list was while it was the page on show: back from the reel (or any page over it) it is put back
  // exactly there if the browser let it slip while covered, so the feed never jumps or starts over.
  const listRef = useRef<FlatList<Post>>(null);
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

  // Older sessions as the end nears: the store's next page, a quiet row while it is on its way.
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const asking = useRef(false);
  // The store pages the whole feed, so a page can bring nothing this list shows (posts from people you don't follow):
  // the list doesn't grow and the list would never ask again. So: when a page lands and the list is no longer, ask
  // again while the store has more, up to 5 pages per reach of the end.
  const moreRef = useRef(app.feed.more);
  moreRef.current = app.feed.more;
  const lenRef = useRef(posts.length);
  lenRef.current = posts.length;
  const askedAt = useRef<number | null>(null);
  const tries = useRef(0);
  const [landed, setLanded] = useState(0);
  const loadMore = useCallback((again = false) => {
    if (asking.current || ended) return;
    if (!again) tries.current = 0;
    asking.current = true;
    askedAt.current = lenRef.current;
    setLoading(true);
    const started = Date.now();
    void (async () => {
      try { await actions.loadMorePosts(); } catch { /* the next reach of the end asks again */ }
      // Held a beat, so the row never flickers.
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      asking.current = false;
      setLanded((n) => n + 1);
    })();
  }, [actions, ended]);
  // After a page lands (and the list has drawn with it): grew, done; didn't, and more is there, ask again.
  useEffect(() => {
    if (!landed || askedAt.current === null) return;
    const before = askedAt.current;
    askedAt.current = null;
    if (posts.length > before) { setLoading(false); return; }
    if (!moreRef.current) { setEnded(true); setLoading(false); return; }
    if (tries.current < 4) { tries.current += 1; loadMore(true); return; }
    setLoading(false);
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    showRow(liveRow);
    try { await actions.refresh(); } finally { setRefreshing(false); setEnded(false); }
  }, [actions, liveRow]);

  const renderItem = useCallback(({ item }: { item: Post }) => {
    const author = usersById.get(item.authorId);
    if (!author || (!item.session && !classic)) return null;
    const nearOne = !!near?.has(author.id) && author.id !== currentUserId && !followingIds.includes(author.id);
    return <View style={[styles.column, { maxWidth: column }]}><Card post={item} author={author} me={currentUserId} hidden={blockedIds} users={usersById} onOpenClip={openClip} near={nearOne} width={cardW} /></View>;
  }, [usersById, classic, near, currentUserId, followingIds, blockedIds, openClip, column, cardW, styles, Card]);

  const header = (
    <View style={{ paddingTop: top }}>
      {showStart ? (
        <View style={[styles.column, { maxWidth: column }]}>
          <ActivitiesStart inList topInset={0} bottomInset={spacing.lg} nearCount={nearCount} sessions={posts.length} shown={!paused} onTop />
          {posts.length ? <View style={styles.section}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sectionText}>{classic ? (nearCount ? 'Latest near you' : 'Latest') : nearCount ? 'Latest sessions near you' : 'Latest sessions'}</Text></View> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={showStart ? null : <Text style={[styles.endText, styles.empty]}>{classic ? 'No posts yet. Yours and the people you follow show up here.' : 'No sessions yet. Yours and the people you follow show up here.'}</Text>}
        ListFooterComponent={posts.length ? (
          <View style={[styles.end, { paddingBottom: barInset + spacing.xxl }]}>
            {loading ? <ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel={classic ? 'Loading older posts' : 'Loading older sessions'} />
              : ended ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.endText}>You're all caught up</Text> : null}
          </View>
        ) : <View style={{ height: barInset + spacing.xxl }} />}
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
  column: { width: '100%', alignSelf: 'center' },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sectionText: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  end: { alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xl, minHeight: 60 },
  endText: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
  empty: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },

  // Shared: a card is a band of the page between hairlines, never a rounded box.
  card: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.lg, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.lg },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  whoWords: { flex: 1, minWidth: 0 },
  name: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  body: { ...typography.body, color: colors.text, marginTop: 4, lineHeight: 21 },
  people: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  num: { fontVariant: ['tabular-nums'] },
  media: { width: '100%', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  playMark: { position: 'absolute', top: spacing.md, right: spacing.md },
  countMark: { position: 'absolute', top: spacing.md, right: spacing.md, backgroundColor: colors.overlay, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  countText: { ...typography.caption, color: colors.onMedia },
  clipMark: { position: 'absolute', top: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.overlay, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  clipMarkText: { ...typography.caption, fontSize: 11, color: colors.onMedia, fontVariant: ['tabular-nums'] },

  // A · Strava
  sTitle: { ...font('700'), fontSize: 20, letterSpacing: -0.3, color: colors.text, marginTop: spacing.md },
  sStats: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md, marginBottom: 2 },
  sStat: { flexShrink: 1, paddingRight: spacing.lg },
  sStatWide: { flexShrink: 0, maxWidth: '50%' },
  sStatRule: { paddingLeft: spacing.lg, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  sLabel: { ...typography.small, fontSize: 12, color: colors.textMuted },
  sValue: { ...font('400'), fontSize: 22, letterSpacing: -0.3, color: colors.text, fontVariant: ['tabular-nums'], marginTop: 1 },
  sUnit: { ...font('400'), fontSize: 14, color: colors.textMuted },
  sFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, marginTop: 0 },
  sIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },

  // B · Hevy
  hTitle: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text, marginTop: spacing.md },
  hTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.md },
  hStats: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.xl, rowGap: spacing.sm },
  hStat: { minWidth: 0 },
  hLabel: { ...typography.small, fontSize: 12, color: colors.textMuted },
  hValue: { ...font('500'), fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'], marginTop: 1 },
  hThumb: { width: 64, height: 64, overflow: 'hidden', borderRadius: 4 },
  hLines: { marginTop: spacing.md },
  hLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 9 },
  hairTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  hWhat: { ...typography.body, color: colors.text, flexShrink: 1 },
  hNum: { ...font('500'), fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right' },
  zones: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 6 },
  zonesHead: { flexDirection: 'row', justifyContent: 'space-between' },
  zonesBar: { flexDirection: 'row', height: 4, gap: 2, overflow: 'hidden', borderRadius: 1 },
  hFoot: { flexDirection: 'row', marginTop: spacing.md },
  hAct: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  hActText: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },

  // C · classic Instagram
  cCard: { paddingBottom: spacing.lg, backgroundColor: colors.bg },
  cHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  cMore: { paddingLeft: spacing.sm },
  cPushed: { marginTop: 3 },
  cNear: { paddingHorizontal: spacing.md, marginTop: -2 },
  dots: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.brand },
  cHandle: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  cPlace: { ...typography.small, fontSize: 12, color: colors.text },
  cBody: { paddingHorizontal: spacing.md, gap: 4 },
  cIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: 10, position: 'relative' },
  cLiked: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  cCaption: { ...typography.small, fontSize: 14, color: colors.text, lineHeight: 19 },
  cStats: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  cMuted: { ...typography.small, fontSize: 14, color: colors.textMuted },
  cWords: { paddingHorizontal: spacing.md, paddingTop: 2, paddingBottom: 4 },
  cWordsText: { ...typography.body, fontSize: 17, lineHeight: 24, color: colors.text },
  cTime: { ...typography.caption, fontSize: 10, color: colors.textFaint, letterSpacing: 0.3, marginTop: 2 },

  // Mixed: every piece a fixed height, so a plain card is always PLAIN_H and a photo card always the same.
  mCard: { paddingTop: MIXED.padTop, paddingBottom: MIXED.padBottom, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg, overflow: 'hidden' },
  mHead: { height: MIXED.head, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  mName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  mWhen: { ...typography.small, color: colors.textFaint, flexShrink: 0 },
  mNear: { height: 28, justifyContent: 'center', marginTop: 2 },
  mBoxSlot: { height: MIXED.box, marginTop: MIXED.gap },
  // A text post's words framed as the session box is: same band, same radius, so a run of plain cards keeps one shape.
  mWords: { height: TEXT_H, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mWordsText: { ...typography.body, fontSize: 15, lineHeight: 21, color: colors.text },
  mPhoto: { marginTop: MIXED.gap, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  mPhotoJoined: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  mFrame: { marginTop: MIXED.gap, borderRadius: 16, overflow: 'hidden' },
  mBoxJoined: { height: MIXED.box },
  mSeam: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  mCaption: { height: 38, marginTop: MIXED.gap, justifyContent: 'flex-start' },
  mLevel: { alignSelf: 'center' },
  mLine: { height: MIXED.line, marginTop: MIXED.gap, justifyContent: 'center' },
  mLineText: { ...typography.small, fontSize: 14, lineHeight: 19, color: colors.text },
  mLineQuiet: { ...typography.small, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  mActions: { height: MIXED.actions, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, position: 'relative' },
  mAct: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  mSave: { marginLeft: 'auto' },
  mCount: { ...typography.smallStrong, color: colors.text, fontVariant: ['tabular-nums'] },

  // mixed-a2: the card is the unit, edge to edge, a band of the page's second ground above it; one left edge for words.
  m2Card: { borderTopWidth: MIXED2.band, borderTopColor: colors.surfaceAlt, paddingTop: MIXED2.padTop, paddingBottom: MIXED2.padBottom, paddingHorizontal: spacing.lg, backgroundColor: colors.bg, overflow: 'hidden' },
  m2Head: { height: MIXED2.head, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  m2Words: { justifyContent: 'center', gap: 1 },
  m2Meta: { ...typography.small, fontSize: 13, lineHeight: 16, color: colors.textMuted },
  m2Stats: { height: MIXED2.stats, marginTop: MIXED2.gap },
  m2Line: { height: MIXED2.line, marginTop: MIXED2.lineGap, justifyContent: 'center' },
  // A text post's words a size up and centred in their slot, so a short post doesn't leave a hole above the actions.
  m2Text: { height: TEXT2_H, marginTop: MIXED2.gap, justifyContent: 'center' },
  m2TextWords: { ...typography.body, fontSize: 18, lineHeight: 25, letterSpacing: -0.2, color: colors.text },
  // Full bleed: out past the card's gutter on both sides, square cornered.
  m2Photo: { marginTop: 12, marginHorizontal: -spacing.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  m2Caption: { height: 38, marginTop: MIXED2.lineGap + 2, justifyContent: 'flex-start' },
});
