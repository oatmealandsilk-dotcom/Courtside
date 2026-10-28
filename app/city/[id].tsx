import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { ClipVideo } from '@/components/ClipVideo';
import { LevelPill } from '@/components/LevelPill';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { OpenRing } from '@/components/map/OpenRing';
import { BoardHead, FillDivider, FilledFace, Medal, Movement, hasCoin } from '@/features/cityBoard/BoardBits';
import { useCityFill } from '@/features/cityBoard/fill';
import { isFinal, monthName, morePlayersWords, nextTarget, ordinal, rankCities, rankRows, sessionsWords, viewsWords } from '@/features/cityBoard/board';
import { useCityBoard, useCityPage } from '@/features/cityBoard/useCityBoard';
import { useBarInset } from '@/features/navigation/barInset';
import { isOpenToHit, tillLabel } from '@/features/players/openToHit';
import { openPlayer } from '@/features/navigation/openPlayer';
import { goBack } from '@/lib/goBack';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import type { Post, User } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** Top players shown before your own row is pinned under them. */
const TOP = 5;
const PLAYER_H = 60;
/** A player row's place column (the head's "Rank" is centred over it) and face (the head's "Player" starts over it, as a club table's "Club" sits over the crests). */
const RANK_W = 32;
const FACE = 40;
/** The room between the list and your own row under it. */
const YOU_GAP = 14;
const BAR_H = 52;

/** A row of Top players: who, their sessions this month, their place among the rows shown (and you). */
interface PlayerLine { user: User; sessions: number; rank: number; me: boolean }

/**
 * A city's page, opened from the board (city_page, migration 196), as
 * approved (design/city-board, rounds 2 to 5). In order (owner, Oct 27):
 *
 *   1. The month's most watched clip there, big, playing muted while it is
 *      on screen, the city's name over it ("maybe even show that first").
 *      No clip this month: no hero, the page opens on its title.
 *   2. Up to hit today, right under it, faces sideways ("should be easy to
 *      find not hidden at bottom"): your own button first in your city; then
 *      the city's regulars, plain, to 8 faces (round 3).
 *   3. Where it stands, in one short line ("a tiny bit too much words").
 *   4. Top players, each row rising in as it scrolls into view, one by one
 *      (on the animation thread); your own row under them, set apart by space.
 *   5. Busiest courts (none yet: no section).
 *   (Round 5: both lists carry a head row, Rank · Player · Sessions and
 *   Court · Sessions, and their numbers stand bare.)
 *   6. "Help Los Angeles climb" (yours) or "Visiting Austin?" (another).
 *
 * Who is shown is the server's call, for you (city_page): players by the
 * town on their profile, never where they are; adults who may be named (a
 * teen never, to anyone); a private account only once you follow it; a teen
 * viewer sees friends who follow each other only; never anyone blocked
 * either way or muted. At most 5 named, and fewer so nobody's own count can
 * be worked out from the city's total; your place is among the rows you are
 * shown. Every number but yours is as of yesterday.
 */
export default function CityPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const cityId = String(id ?? '');
  const { users, posts, currentUser, currentUserId, blockedIds, blockedMeIds, mutedIds } = useApp();
  const boardNow = useCityBoard();
  const { status, stale, page, mySessions, retry } = useCityPage(cityId || null, boardNow.month);
  const city = page?.city ?? null;
  const homeId = boardNow.board?.me.cityId ?? null;
  const mine = !!city && (homeId ? city.id === homeId : !!page?.me);
  // The board as you see it (yours up to the minute), for "3rd of 15" and the one number to chase.
  const board = useMemo(() => rankCities(boardNow.cities, 'total'), [boardNow.cities]);
  const ranked = board.find((c) => c.id === city?.id) ?? null;
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { height: windowH } = useWindowDimensions();
  const barInset = useBarInset();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const top = isPhone ? insets.top : 0;
  const heroH = Math.round(Math.min(Math.max(windowH * 0.58, 420), 560));
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  // The server leaves these off already; a page kept for a few minutes still drops anyone blocked either way, or muted, since.
  const hidden = (uid: string) => blockedIds.includes(uid) || blockedMeIds.includes(uid) || mutedIds.includes(uid);

  // Top players: the rows the server named for you, and you (your sessions up to the minute), placed among them.
  const players = useMemo<PlayerLine[]>(() => {
    if (!page || !city) return [];
    const others = page.top.flatMap((t) => {
      const u = byId.get(t.userId);
      return u && u.id !== currentUserId && !hidden(u.id) ? [{ user: u, sessions: t.sessions, me: false }] : [];
    });
    const you = page.me && page.me.rank !== null && currentUser ? [{ user: currentUser, sessions: mySessions, me: true }] : [];
    // You first among level rows, as the server places you.
    return rankRows([...you, ...others]);
  }, [page, city, byId, currentUser, currentUserId, mySessions, blockedIds, blockedMeIds, mutedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = players.find((p) => p.me);
  const topPlayers = players.slice(0, TOP);
  const pinMe = me && !topPlayers.includes(me) ? me : null;
  // The number to chase from below the list: the last place shown ("7 to reach the top 5"), never someone not shown.
  const fifth = pinMe ? topPlayers[topPlayers.length - 1] ?? null : null;

  // Up to hit today, ringed, as the server listed them for you: your city, today's Find Players rule;
  // another city, only friends who follow each other with you.
  const upShown = useMemo(() => (page?.up ?? []).flatMap((uid) => {
    const u = byId.get(uid);
    return u && u.id !== currentUserId && !hidden(u.id) ? [{ user: u, till: tillLabel(u.openToHitUntil) ?? 'today' }] : [];
  }), [page, byId, currentUserId, blockedIds, blockedMeIds, mutedIds]); // eslint-disable-line react-hooks/exhaustive-deps
  // Round 3 (owner, Oct 28: "if no one is active in up to hit today ... put like, most active players in the
  // city. that way it stays full"): who is up first, ringed; then the city's regulars, plain, to FILL_TO faces.
  const fill = useCityFill(page, upShown.map((x) => x.user.id));
  const courts = page?.courts ?? [];

  // The clip on top: the month's most watched there, a public adult's, checked for you by the server.
  const clip = page?.clip ?? null;
  const clipAuthor = clip && !hidden(clip.authorId) ? byId.get(clip.authorId) ?? null : null;
  const clipPost = clip ? posts.find((p) => p.id === clip.postId) ?? null : null;
  const hero = !!clip && !!clipAuthor;

  // ---- The scroll, read on the animation thread: the bar over the clip, and Top players rising in ----
  const offsetY = useSharedValue(0);
  const listY = useSharedValue(0);
  const seeH = useSharedValue(windowH - barInset);
  useEffect(() => { seeH.value = windowH - barInset; }, [seeH, windowH, barInset]);
  const clock = useSharedValue(0);
  // Where the list starts in the page: the sum of three layouts, used only once all three have come in
  // (one alone, early, would start rows rising that are still below the screen).
  const parts = useRef<{ body: number | null; section: number | null; list: number | null }>({ body: null, section: null, list: null });
  const place = (key: keyof typeof parts.current, y: number) => {
    parts.current[key] = y;
    const { body, section, list } = parts.current;
    if (body !== null && section !== null && list !== null) listY.value = body + section + list;
  };
  // The clip plays only while it is on screen, and only while this page is the one in front.
  const [heroInView, setHeroInView] = useState(true);
  useAnimatedReaction(
    () => offsetY.value < heroH - (top + BAR_H),
    (inView, was) => { if (inView !== was) runOnJS(setHeroInView)(inView); },
    [heroH, top],
  );

  const name = city?.name ?? boardNow.board?.cities.find((c) => c.id === cityId)?.name ?? (boardNow.board?.me.cityId === cityId ? boardNow.board?.me.cityName : null) ?? 'City';
  if (status === 'off') return <Screen title={name} compactTitle onBack={() => goBack()}><EmptyState icon="podium-outline" title="City boards aren’t open yet" body="When they are, each city’s players and courts will show here." action={{ label: 'Back', onPress: () => goBack() }} /></Screen>;
  if (status === 'error') return <Screen title={name} compactTitle onBack={() => goBack()}><EmptyState icon="cloud-offline-outline" title={`Couldn’t load ${name}`} body="Check your connection and try again." action={{ label: 'Try again', onPress: retry }} /></Screen>;
  if (status === 'loading') return <Screen title={name} compactTitle onBack={() => goBack()}><LoadingPage /></Screen>;
  if (!city || !page) return <Screen title="City" compactTitle onBack={() => goBack()}><EmptyState icon="location-outline" title="No board for this city" body="It may not have enough players yet." action={{ label: 'Back', onPress: () => goBack() }} /></Screen>;

  const target = ranked ? nextTarget(board, ranked.id, 'total') : null;
  const placeNow = ranked?.rank ?? city.rank;
  const of = board.length || city.of;
  const moved = ranked ? ranked.moved : city.rank !== null && city.weekAgoRank ? city.weekAgoRank - city.rank : 0;
  // Last month's final board (the 1st): how far behind it finished, not how many to pass.
  const standingLine = city.rank !== null
    ? target ? isFinal(page.month) ? (target.gap === 1 ? `Level with ${target.city.name}` : `${sessionsWords(target.gap - 1)} behind ${target.city.name}`) : `${sessionsWords(target.gap)} to pass ${target.city.name}`
      : ranked && board[1] ? `${sessionsWords(ranked.sessions - board[1].sessions)} clear of ${board[1].name}`
        : board.length === 1 ? 'The only city ranked so far' : null
    : `Needs ${morePlayersWords(city.playersNeeded ?? 1)} to be ranked`;

  const body = (
    <View style={[styles.body, !hero && styles.bodyPlain]} onLayout={(e) => place('body', e.nativeEvent.layout.y)}>
      {stale ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.stale}>Offline: this is {city.name} from earlier.</Text> : null}
      {/* 2. Up to hit today: right under the clip, so it is never hunted for. */}
      {mine || upShown.length || fill.length ? (
        <View style={[styles.upSection, !hero && styles.upSectionPlain]}>
          <View style={styles.head}>
            {/* Nobody up yet: the row is the city's regulars, and its title says so (never "No one's up"). */}
            <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" numberOfLines={1} style={[styles.sectionTitle, styles.upTitle]}>{upShown.length || !fill.length ? 'Up to hit today' : `Most active in ${city.name}`}</Text>
            {upShown.length ? <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>{upShown.length} in {city.name}</Text> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faces} style={styles.facesScroll}>
            {mine && currentUser ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Up to hit: tell players here you are free today" onPress={() => router.push('/open-to-hit')} style={({ pressed }) => [styles.face, pressed && { opacity: PRESS_DIM }]}>
                <OpenRing open={isOpenToHit(currentUser)} hairline size={56} halo="small">
                  <Avatar name={currentUser.name} seed={currentUser.avatarSeed} uri={currentUser.avatarUrl} size={56} />
                </OpenRing>
                <View style={styles.plus}><Ionicons name="add" size={15} color={colors.brandInk} /></View>
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceName}>Up to hit</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceMeta}> </Text>
              </Pressable>
            ) : null}
            {upShown.map(({ user, till }) => (
              <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, up to hit today, ${till}. Open profile`} onPress={() => openPlayer(user.id, currentUserId)} style={({ pressed }) => [styles.face, pressed && { opacity: PRESS_DIM }]}>
                <OpenRing open size={56} halo="small"><Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={56} /></OpenRing>
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceName}>{user.name.split(' ')[0]}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceMeta}>{till}</Text>
              </Pressable>
            ))}
            {/* Then the regulars: no ring (that means up today), and when they usually play. */}
            {fill.length && (mine || upShown.length) ? <FillDivider size={56} /> : null}
            {fill.map((f) => (
              <FilledFace key={f.user.id} face={f} size={56} width={80} top={1} onPress={() => openPlayer(f.user.id, currentUserId)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* 3. Where it stands: the place, and one short line. */}
      <View style={styles.standing}>
        {placeNow !== null ? (
          <View style={styles.rankLine}>
            <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.rankBig}>{ordinal(placeNow)}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rankOf}>of {of}</Text>
            <View style={styles.rankMove}><Movement moved={moved} long /></View>
          </View>
        ) : null}
        {standingLine ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.standingLine}>{standingLine}</Text> : null}
      </View>

      {/* 4. Top players: each row rises in as it comes into view, one after another. Nobody you may be shown, and not you: no section. */}
      {topPlayers.length ? (
        <View style={styles.section} onLayout={(e) => place('section', e.nativeEvent.layout.y)}>
          <View style={styles.head}>
            <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Top players</Text>
          </View>
          <BoardHead name="Player" value="Sessions" rankWidth={RANK_W} style={styles.boardHead} />
          <View onLayout={(e) => place('list', e.nativeEvent.layout.y)}>
            {topPlayers.map((p, i) => (
              <Rise key={p.user.id} at={i * PLAYER_H} height={PLAYER_H} listY={listY} offsetY={offsetY} seeH={seeH} clock={clock} reduced={reduced}>
                <PlayerRow p={p} line={i > 0 && !topPlayers[i - 1]?.me && !p.me} onPress={() => openPlayer(p.user.id, currentUserId)} />
              </Rise>
            ))}
            {pinMe ? (
              <Rise at={topPlayers.length * PLAYER_H + YOU_GAP} height={PLAYER_H} listY={listY} offsetY={offsetY} seeH={seeH} clock={clock} reduced={reduced} style={styles.youGap}>
                <PlayerRow p={pinMe} sub={fifth ? `${fifth.sessions - pinMe.sessions + 1} to reach the top ${topPlayers.length}` : null} onPress={() => openPlayer(pinMe.user.id, currentUserId)} />
              </Rise>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* 5. Busiest courts: none counted yet, no section. */}
      {courts.length ? (
        <View style={styles.section}>
          <View style={styles.head}>
            <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Busiest courts</Text>
          </View>
          {/* Not ranked (its rows have no places), so no "Rank". */}
          <BoardHead name="Court" value="Sessions" rankWidth={null} style={styles.boardHead} />
          {courts.map((c, i) => (
            <View key={c.courtId} accessible accessibilityLabel={`${c.name ?? 'Court'}, ${c.courts} ${c.courts === 1 ? 'court' : 'courts'}, ${sessionsWords(c.sessions)} this month`} style={[styles.courtRow, i > 0 && styles.line]}>
              <View style={styles.courtWords}>
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.name}>{c.name ?? 'Court'}</Text>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sub}>{c.courts} {c.courts === 1 ? 'court' : 'courts'}</Text>
              </View>
              <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.value}>{c.sessions}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 6. Yours: help it climb. Another: the way there. */}
      <View style={styles.footer}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footHead}>{mine ? `Help ${city.name} climb` : `Visiting ${city.name}?`}</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.footBody}>{mine ? 'Every session a player from here logs counts.' : 'See its courts and who is up to hit on the map.'}</Text>
        <View style={styles.footButton}>
          {mine
            ? <Button label="Invite a hitting partner" variant="secondary" onPress={() => router.push('/invite')} full />
            : <Button label={`See ${city.name} on the map`} variant="secondary" onPress={() => router.push('/map')} full />}
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fine}>Players are listed by the city on their profile, never where they are.</Text>
      </View>
    </View>
  );

  // No clip this month: no hero; the page opens on its title, the way any page does.
  if (!hero) {
    return (
      <View style={styles.root}>
        <Screen title={city.name} compactTitle padded={false} onBack={() => goBack()} offsetY={offsetY}>{body}</Screen>
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <Screen bleedTop wash={false} padded={false} offsetY={offsetY}>
        <Hero cityName={city.name} month={page.month} clip={clip} post={clipPost} author={clipAuthor} height={heroH} top={top} playing={focused && heroInView} />
        {body}
      </Screen>
      <TopBar name={city.name} top={top} heroH={heroH} offsetY={offsetY} />
    </View>
  );
}

/** Still coming: Up to hit's faces and Top players' rows as quiet shapes, so nothing jumps when they land. */
function LoadingPage() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View accessibilityLabel="Loading" style={styles.loading}>
      <View style={styles.skelFaces}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={styles.skelFace} />)}
      </View>
      <View style={[styles.skel, { width: 90, height: 28, marginTop: spacing.xl }]} />
      <View style={[styles.skel, { width: 180, height: 14, marginTop: 8 }]} />
      <View style={{ marginTop: spacing.xl }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.playerRow, i > 0 && styles.line]}>
            <View style={styles.rankCol}><View style={[styles.skel, { width: 22, height: 22, borderRadius: 11 }]} /></View>
            <View style={[styles.skel, { width: FACE, height: FACE, borderRadius: FACE / 2 }]} />
            <View style={styles.playerWords}><View style={[styles.skel, { width: '55%', height: 13 }]} /></View>
            <View style={[styles.skel, { width: 26, height: 13 }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 1. The month's most watched clip in the city, playing muted while it is
 * on screen, with the city's name over it. A tap opens the clip. Its poster
 * (or the court card, until the post has come) shows at once.
 */
function Hero({ cityName, month, clip, post, author, height, top, playing }: { cityName: string; month: string; clip: { postId: string; views: number }; post: Post | null; author: User; height: number; top: number; playing: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const video = post?.videoUrl ?? null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Most watched clip in ${cityName} this month, by ${author.name}. Open clip`}
      onPress={() => router.push(`/post/${clip.postId}`)}
      style={[styles.hero, { height }]}
    >
      {video ? <ClipVideo uri={video} poster={post?.thumbnailUrl} active={playing} muted fit="cover" /> : <MediaPlaceholder label="Clip" seed={cityName} fill />}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']} style={[styles.heroTopShade, { height: top + 90 }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.66)']} locations={[0, 0.35, 1]} style={styles.heroShade} />
      <View pointerEvents="none" style={styles.heroWords}>
        <View style={styles.heroKicker}>
          <Ionicons name="play" size={11} color={colors.onMedia} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.heroKickerText}>Most watched in {monthName(month)}</Text>
        </View>
        {/* The name alone: its place is said once, as "3rd of 15" under Up to hit (round 2 review: no "3rd" twice on one screen). */}
        <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={styles.heroName}>{cityName}</Text>
        <View style={styles.heroBy}>
          <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={22} />
          <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.heroByText}>{author.name} · {viewsWords(clip.views)}</Text>
        </View>
      </View>
      {video ? <View pointerEvents="none" style={styles.muted}><Ionicons name="volume-mute" size={14} color={colors.onMedia} /></View> : null}
    </Pressable>
  );
}

/** Back over the clip; once the clip has gone up under it, the bar turns solid with the city's name. */
function TopBar({ name, top, heroH, offsetY }: { name: string; top: number; heroH: number; offsetY: SharedValue<number> }) {
  const styles = useThemedStyles(styleDefinitions);
  const from = heroH - (top + BAR_H) - 40;
  const ground = useAnimatedStyle(() => ({ opacity: interpolate(offsetY.value, [from, from + 40], [0, 1], 'clamp') }));
  const title = useAnimatedStyle(() => {
    const t = interpolate(offsetY.value, [from + 10, from + 50], [0, 1], 'clamp');
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }] };
  });
  const dark = pageIsDark();
  return (
    <View pointerEvents="box-none" style={[styles.bar, { height: top + BAR_H }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.barGround, ground]} />
      <View pointerEvents="box-none" style={[styles.barRow, { marginTop: top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={6} onPress={() => goBack()} style={({ pressed }) => [styles.back, pressed && { opacity: PRESS_DIM }]}>
          <Glass radius={19} tint={dark ? colors.surfaceAlt : undefined} style={styles.backGlass}>
            <Ionicons name="chevron-back" size={21} color={colors.text} style={styles.backGlyph} />
          </Glass>
        </Pressable>
        <Animated.Text numberOfLines={1} style={[styles.barTitle, title]}>{name}</Animated.Text>
        <View style={styles.barEnd} />
      </View>
    </View>
  );
}

/**
 * A row that rises into place the first time it scrolls into view (on the
 * animation thread). Rows that come into view together still come one after
 * another, 80 ms apart, so a fast scroll reads as a list arriving, not a
 * block popping in.
 */
function Rise({ at, height, listY, offsetY, seeH, clock, reduced, style, children }: {
  at: number; height: number; listY: SharedValue<number>; offsetY: SharedValue<number>; seeH: SharedValue<number>; clock: SharedValue<number>; reduced: boolean;
  style?: object; children: React.ReactNode;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  const started = useSharedValue(reduced);
  useAnimatedReaction(
    () => listY.value > 0 && offsetY.value + seeH.value > listY.value + at + height * 0.35,
    (inView) => {
      if (!inView || started.value) return;
      started.value = true;
      const now = Date.now();
      const delay = Math.max(0, clock.value - now);
      clock.value = now + delay + 80;
      p.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    },
    [at, height],
  );
  const rise = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 28 }] }));
  return <Animated.View style={[style, rise]}>{children}</Animated.View>;
}

function PlayerRow({ p, line = false, sub = null, onPress }: { p: PlayerLine; line?: boolean; sub?: string | null; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${ordinal(p.rank)}, ${p.me ? 'you' : p.user.name}, ${sessionsWords(p.sessions)}`} onPress={onPress} style={({ pressed }) => [styles.playerRow, p.me ? styles.rowMine : line && styles.line, pressed && { opacity: PRESS_DIM }]}>
      {/* 1st to 3rd on a coin of their metal (round 3). */}
      <View style={styles.rankCol}>
        {hasCoin(p.rank)
          ? <Medal rank={p.rank} size={RANK_W} fontSize={16} markSize={22} />
          : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, p.rank > 3 && styles.rankLow, p.me && styles.mineInk]}>{p.rank}</Text>}
      </View>
      <Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={FACE} ring={p.user.isCoach} />
      <View style={styles.playerWords}>
        <View style={styles.playerNameLine}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, p.me && styles.mineName]}>{p.me ? 'You' : p.user.name}</Text>
          <LevelPill profile={p.user.profile} small />
        </View>
        {sub ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.subMine}>{sub}</Text> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.value, p.me && styles.mineInk]}>{p.sessions}</Text>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1 },
  // The clip: edge to edge on a phone, under the status bar.
  hero: { width: '100%', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  heroTopShade: { position: 'absolute', left: 0, right: 0, top: 0 },
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  heroWords: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl, gap: 6 },
  heroKicker: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroKickerText: { ...typography.small, ...font('600'), color: colors.onMedia, opacity: 0.92 },
  heroName: { ...font('700'), fontSize: 38, letterSpacing: -1.2, color: colors.onMedia },
  heroBy: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  heroByText: { ...typography.small, ...font('500'), color: colors.onMedia, opacity: 0.92, flexShrink: 1 },
  muted: { position: 'absolute', right: spacing.lg, bottom: spacing.xl + 2, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, top: 0 },
  barGround: { backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barRow: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backGlass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  backGlyph: { marginLeft: -2 },
  barTitle: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  barEnd: { width: 44 },
  body: { paddingHorizontal: spacing.lg },
  // No clip: under the page's own title, which already leaves room above.
  bodyPlain: { paddingTop: 0 },
  upSection: { paddingTop: spacing.lg },
  upSectionPlain: { paddingTop: spacing.xs },
  stale: { ...typography.small, color: colors.textFaint, paddingTop: spacing.md },
  loading: { paddingTop: spacing.sm },
  skel: { backgroundColor: colors.surfaceAlt, borderRadius: 6 },
  skelFaces: { flexDirection: 'row', gap: 24, paddingTop: spacing.sm },
  skelFace: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceAlt },
  facesScroll: { marginHorizontal: -spacing.lg },
  faces: { paddingHorizontal: spacing.lg - 8, gap: 4, paddingVertical: 4 },
  face: { width: 80, alignItems: 'center', gap: 2 },
  plus: { position: 'absolute', top: 48, left: 52, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  faceName: { ...typography.smallStrong, color: colors.text, marginTop: 4 },
  faceMeta: { ...typography.caption, letterSpacing: 0, color: colors.textMuted, ...font('500') },
  standing: { paddingTop: spacing.xl, gap: 2 },
  rankLine: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  rankBig: { ...font('700'), fontSize: 34, letterSpacing: -1.2, color: colors.text, fontVariant: ['tabular-nums'] },
  rankOf: { ...typography.body, fontSize: 17, color: colors.textMuted },
  rankMove: { marginLeft: 4, alignSelf: 'center', marginTop: 4 },
  standingLine: { ...typography.body, ...font('500'), color: colors.text },
  section: { paddingTop: spacing.xl, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: spacing.sm },
  sectionTitle: { ...typography.title, color: colors.text },
  upTitle: { flexShrink: 1 },
  headNote: { ...typography.small, color: colors.textMuted },
  // The lists' head row (owner, Oct 28: "like the headers. And then the table chart"): clear of the section's title,
  // the table's top, a little room under its hairline before the first row (and off your tinted one).
  boardHead: { marginTop: spacing.sm, marginBottom: spacing.xs },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: PLAYER_H, paddingHorizontal: spacing.md },
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(14) },
  youGap: { marginTop: YOU_GAP },
  rankCol: { width: RANK_W, alignItems: 'center' },
  rank: { ...font('700'), fontSize: 22, letterSpacing: -0.6, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankLow: { color: colors.textFaint },
  mineInk: { color: colors.brand },
  playerWords: { flex: 1, minWidth: 0, gap: 1 },
  playerNameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  mineName: { ...font('600'), color: colors.brand },
  sub: { ...typography.small, color: colors.textFaint },
  subMine: { ...typography.small, ...font('500'), color: colors.text },
  value: { ...font('700'), fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'] },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 58, paddingHorizontal: spacing.md },
  courtWords: { flex: 1, minWidth: 0, gap: 1 },
  footer: { paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: 4, alignItems: 'center' },
  footHead: { ...typography.heading, color: colors.text, textAlign: 'center' },
  footBody: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  footButton: { alignSelf: 'stretch', marginTop: spacing.md, maxWidth: 440, width: '100%', marginHorizontal: 'auto' },
  fine: { ...typography.small, color: colors.textFaint, textAlign: 'center', lineHeight: 19, marginTop: spacing.lg, maxWidth: 360 },
});
