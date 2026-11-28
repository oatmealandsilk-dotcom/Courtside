import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import type { Post, SessionDetail, User } from '@/data/types';
import { Avatar } from '@/components/ui';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { ActivitiesStart } from '@/components/ActivitiesStart';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { useBarInset } from '@/features/navigation/barInset';
import { TOP_BAND_HEIGHT, TOP_BAND_TOP } from '@/features/feed/topBand';
import { ROW_TRAVEL, showRow } from '@/features/feed/topRowScroll';
import { agoInWords, duration } from '@/lib/format';
import { sessionPeople } from '@/features/activity/sessionTags';
import { resultWord, scoreLine, sessionTitle, whatWord } from '@/features/activity/format';
import { localDay } from '@/features/practice/stats';
import { matchTiebreakAt } from '@/features/activity/score';
import type { ActivitiesLook } from './activitiesLook';

/*
 * The Activities looks the owner asked to see (Nov 27): one continuous list, no snapping, that you flick through at
 * any speed and that asks for older sessions as you near its end. Three ways to draw a session in it (Strava, Hevy,
 * classic Instagram), from the app's own pieces and the court's colours. The posts are exactly the ones today's
 * Activities shows (the Feed hands them over, already filtered and in order).
 */

type CardProps = { post: Post; author: User; me: string | null; hidden: string[]; users: Map<string, User> };

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

/** The post's picture, clip cover, or the demo's court card; `stand` names a stats-only session's card. */
function Media({ post, aspect, stand }: { post: Post; aspect: number; stand?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const uri = post.thumbnailUrl ?? post.imageUrl;
  return (
    <View style={[styles.media, { aspectRatio: aspect }]}>
      {uri ? <ExpoImage source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel={post.mediaLabel ?? 'Photo'} />
        : <MediaPlaceholder fill label={post.mediaLabel ?? stand ?? 'Session'} seed={post.id} />}
      {uri && isClip(post) ? <View style={styles.playMark}><Ionicons name="play" size={18} color={colors.onMedia} /></View> : null}
      {post.imageUrls && post.imageUrls.length > 1 ? <View style={styles.countMark}><Text style={styles.countText}>1/{post.imageUrls.length}</Text></View> : null}
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

function ClassicCard({ post, author, me, hidden, users }: CardProps) {
  const styles = useThemedStyles(styleDefinitions);
  const s = post.session!;
  const act = useCardActions(post, me);
  const place = placeOf(post, author);
  const liked = likedLine(post, me, users);
  const n = post.commentIds.length;
  const stand = [whatWord(s), scoreLine(s)].filter(Boolean).join(' · ');
  return (
    <View style={styles.cCard}>
      <View style={styles.cHead}>
        <Pressable onPress={act.author} accessibilityRole="link" accessibilityLabel={`${author.name}, open profile`} style={styles.who}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={32} />
          <View style={styles.whoWords}>
            <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cHandle}>{author.handle}</Text>
            {place ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cPlace}>{place}</Text> : null}
          </View>
        </Pressable>
      </View>
      <Pressable onPress={act.open} accessibilityRole="link" accessibilityLabel="Open the post"><Media post={post} aspect={1} stand={stand} /></Pressable>
      <View style={styles.cBody}>
        <View style={styles.cIcons}>
          <Pressable onPress={act.like} hitSlop={8} accessibilityRole="button" accessibilityLabel={act.liked ? 'Unlike' : 'Like'}>
            <Ionicons name={act.liked ? 'heart' : 'heart-outline'} size={26} color={act.liked ? colors.danger : colors.text} />
          </Pressable>
          <Pressable onPress={act.comments} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={23} color={colors.text} />
          </Pressable>
          <Pressable onPress={act.open} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
            <Ionicons name="paper-plane-outline" size={23} color={colors.text} />
          </Pressable>
        </View>
        {liked ? <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cLiked}>{liked}</Text> : null}
        {post.body ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={TextScale.CARD} style={styles.cCaption}>
            <Text style={styles.cHandle}>{author.handle}</Text> {post.body}
          </Text>
        ) : null}
        <Text numberOfLines={1} maxFontSizeMultiplier={TextScale.CARD} style={styles.cStats}>{oneLine(s, hidden)}</Text>
        {n ? <Pressable onPress={act.comments}><Text style={styles.cMuted}>{n === 1 ? 'View 1 comment' : `View all ${n} comments`}</Text></Pressable> : null}
        <Text style={styles.cTime}>{agoInWords(post.createdAt).toUpperCase()}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ the list */

const CARD: Record<Exclude<ActivitiesLook, 'now'>, (p: CardProps) => React.ReactElement> = { strava: StravaCard, hevy: HevyCard, classic: ClassicCard };

export function ActivitiesList({ look, posts, showStart, nearCount, paused, row }: {
  look: Exclude<ActivitiesLook, 'now'>;
  /** Exactly the posts today's Activities shows, in its order. */
  posts: Post[];
  /** The "Follow more players" start (ActivitiesStart) at the list's head, at its own height. */
  showStart: boolean;
  nearCount: number;
  /** Another feed is on show: this one leaves the top row alone. */
  paused: boolean;
  row?: SharedValue<number>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const app = useApp();
  const { users, currentUserId, blockedIds, actions } = app;
  const insets = useSafeAreaInsets();
  const barInset = useBarInset();
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const Card = CARD[look];
  const column = look === 'classic' ? 470 : 600;
  const top = insets.top + TOP_BAND_TOP + TOP_BAND_HEIGHT + 8;

  // The top row follows the list the way Instagram's header does: forward takes it out with the scroll, back brings it in.
  const liveRow = paused ? undefined : row;
  const lastY = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  useEffect(() => { if (!paused) showRow(row); }, [paused, row]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
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
  const loadMore = useCallback(() => {
    if (asking.current || ended) return;
    asking.current = true;
    setLoading(true);
    const started = Date.now();
    void (async () => {
      let added = 0;
      try { added = (await actions.loadMorePosts()).length; } catch { added = 0; }
      // Held a beat, so the row never flickers.
      const left = 700 - (Date.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (!added && !app.feed.more) setEnded(true);
      asking.current = false;
      setLoading(false);
    })();
  }, [actions, ended, app.feed.more]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    showRow(liveRow);
    try { await actions.refresh(); } finally { setRefreshing(false); setEnded(false); }
  }, [actions, liveRow]);

  const header = (
    <View style={{ paddingTop: top }}>
      {showStart ? (
        <View style={[styles.column, { maxWidth: column }]}>
          <ActivitiesStart inList topInset={0} bottomInset={spacing.lg} nearCount={nearCount} sessions={posts.length} shown={!paused} onTop />
          {posts.length ? <View style={styles.section}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.sectionText}>{nearCount ? 'Latest sessions near you' : 'Latest sessions'}</Text></View> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const author = usersById.get(item.authorId);
          if (!author || !item.session) return null;
          return <View style={[styles.column, { maxWidth: column }]}><Card post={item} author={author} me={currentUserId} hidden={blockedIds} users={usersById} /></View>;
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={showStart ? null : <Text style={[styles.endText, styles.empty]}>No sessions yet. Yours and the people you follow show up here.</Text>}
        ListFooterComponent={posts.length ? (
          <View style={[styles.end, { paddingBottom: barInset + spacing.xxl }]}>
            {loading ? <ActivityIndicator size="small" color={colors.textFaint} accessibilityLabel="Loading older sessions" />
              : ended ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.endText}>You're all caught up</Text> : null}
          </View>
        ) : <View style={{ height: barInset + spacing.xxl }} />}
        onEndReached={loadMore}
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
  cHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10 },
  cHandle: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  cPlace: { ...typography.small, fontSize: 12, color: colors.text },
  cBody: { paddingHorizontal: spacing.md, gap: 4 },
  cIcons: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: 10 },
  cLiked: { ...typography.smallStrong, fontSize: 14, color: colors.text },
  cCaption: { ...typography.small, fontSize: 14, color: colors.text, lineHeight: 19 },
  cStats: { ...typography.small, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  cMuted: { ...typography.small, fontSize: 14, color: colors.textMuted },
  cTime: { ...typography.caption, fontSize: 10, color: colors.textFaint, letterSpacing: 0.3, marginTop: 2 },
});
