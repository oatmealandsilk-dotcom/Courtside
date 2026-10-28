import { PRESS_DIM } from '@/theme/press';
import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { Avatar, Button, EmptyState, Screen } from '@/components/ui';
import { Glass } from '@/components/ui/Glass';
import { ClipVideo } from '@/components/ClipVideo';
import { LevelPill } from '@/components/LevelPill';
import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { OpenRing } from '@/components/map/OpenRing';
import { FillDivider, FilledFace, Medal, Movement, hasCoin, medalInk } from '@/features/cityBoard/BoardBits';
import { useCityFill } from '@/features/cityBoard/fill';
import { BOARD_MONTH, DEMO_BUSY_COURTS, DEMO_PLAYER_HITS, MIN_PLAYERS, MOCK_UP_COUNT, MY_DEMO_HITS, REEL_MEDIA_BASE, TOP_REEL, cityById, nextTarget, ordinal, rankCities, viewsWords } from '@/features/cityBoard/mock';
import { useHomeCityId } from '@/features/cityBoard/useHomeCity';
import { useBarInset } from '@/features/navigation/barInset';
import { notKnownAdult } from '@/features/players/age';
import { isOpenToHit, tillLabel } from '@/features/players/openToHit';
import { openPlayer } from '@/features/navigation/openPlayer';
import { goBack } from '@/lib/goBack';
import { useResponsive } from '@/lib/useResponsive';
import { useApp } from '@/store/AppContext';
import type { User } from '@/data/types';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, pageIsDark, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** Top players shown before your own row is pinned under them. */
const TOP = 5;
const PLAYER_H = 60;
/** The room between the list and your own row under it. */
const YOU_GAP = 14;
const BAR_H = 52;
/** Made-up "free today" times for the demo's players in another city (never a spot, never a distance). */
const DEMO_FREE: Record<string, { id: string; till: string }[]> = {
  austin: [{ id: 'u-mira', till: 'till 7pm' }, { id: 'u-leo', till: 'till 6pm' }],
};
/** Made-up players for another city's page (the demo has only two in Austin, one of them a teen). Not openable. */
const DEMO_EXTRA: Record<string, { name: string; system: 'NTRP' | 'UTR'; rating: number; hits: number; free?: string }[]> = {
  austin: [
    { name: 'Carlos Mendoza', system: 'NTRP', rating: 4.5, hits: 25, free: 'till 8pm' },
    { name: 'Hannah Wright', system: 'NTRP', rating: 4.0, hits: 21 },
    { name: 'Dami Adeyemi', system: 'UTR', rating: 7.2, hits: 19, free: 'till 6pm' },
    { name: 'Grace Liu', system: 'NTRP', rating: 3.5, hits: 17 },
  ],
};
const MOCK_ID = 'mock-';

/**
 * DESIGN MOCK (design/city-board), round 2. A city's page, opened from the
 * board. In order (owner, Oct 27):
 *
 *   1. The month's most watched clip there, big, playing muted, the city's
 *      name over it ("maybe even show that first").
 *   2. Up to hit today, right under it, faces sideways ("should be easy to
 *      find not hidden at bottom"): your own button first in your city.
 *   3. Where it stands, in one short line ("a tiny bit too much words").
 *   4. Top players, each row rising in as it scrolls into view, one by one
 *      (on the animation thread); your own row under them, set apart by space
 *      (no "⋮").
 *   5. Busiest courts.
 *   6. "Help Los Angeles climb" (yours) or "Visiting Austin?" (another).
 *
 * Who is shown (Apple 13+): players by the city on their profile, never where
 * they are. Adults who share their stats; a private account only to people
 * who follow it; a teen only to friends who follow each other with them, and
 * never in another city's Up to hit, nor to a teen looking at another city.
 * The clip on top is only ever a public one by an adult.
 */
export default function CityPage() {
  const styles = useThemedStyles(styleDefinitions);
  const { id } = useLocalSearchParams<{ id: string }>();
  const city = cityById(String(id ?? ''));
  const homeId = useHomeCityId();
  const { users, currentUser, currentUserId, followingIds, blockedIds, lastSeen } = useApp();
  const viewerTeen = !currentUser || notKnownAdult(currentUser);
  const mine = !!city && city.id === homeId;
  const board = useMemo(() => rankCities('total'), []);
  const ranked = board.find((c) => c.id === city?.id) ?? null;
  const insets = useSafeAreaInsets();
  const { isPhone } = useResponsive();
  const { height: windowH } = useWindowDimensions();
  const barInset = useBarInset();
  const reduced = useReducedMotion();
  const top = isPhone ? insets.top : 0;
  const heroH = Math.round(Math.min(Math.max(windowH * 0.58, 420), 560));

  // Who this viewer may see on a city's board.
  const listable = (u: User) => {
    if (blockedIds.includes(u.id)) return false;
    if (notKnownAdult(u)) return !!lastSeen[u.id]?.mutual;
    if (u.isPrivate) return followingIds.includes(u.id);
    return true;
  };
  const extras = useMemo(() => (city && currentUser ? (DEMO_EXTRA[city.id] ?? []).map((x) => {
    const slug = x.name.toLowerCase().replace(/[^a-z]+/g, '-');
    const user: User = { ...currentUser, id: `${MOCK_ID}${slug}`, name: x.name, handle: slug.replace(/-/g, ''), avatarSeed: slug, avatarUrl: undefined, isCoach: false, isPrivate: false, ageGroup: 'adult', location: `${city.name}, ${city.state}`, profile: { ...currentUser.profile, skillSystem: x.system, rating: x.rating } };
    return { user, hits: x.hits, free: x.free };
  }) : []), [city, currentUser]);
  const players = useMemo(() => {
    if (!city) return [];
    const inCity = users.filter((u) => u.id !== currentUserId && u.location.split(',')[0].trim() === city.name && DEMO_PLAYER_HITS[u.id] && listable(u))
      .map((u) => ({ user: u, hits: DEMO_PLAYER_HITS[u.id], me: false }));
    if (mine && currentUser) inCity.push({ user: currentUser, hits: MY_DEMO_HITS, me: true });
    if (currentUser) for (const x of extras) inCity.push({ user: x.user, hits: x.hits, me: false });
    return inCity.sort((a, b) => b.hits - a.hits).map((p, i) => ({ ...p, rank: i + 1 }));
  }, [city, users, currentUser, currentUserId, mine, followingIds, blockedIds, lastSeen, extras]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = players.find((p) => p.me);
  const topPlayers = players.slice(0, TOP);
  const pinMe = me && me.rank > TOP ? me : null;
  // The number to chase from below the list: the top 5's last place ("7 to reach the top 5"), never someone not shown.
  const fifth = pinMe ? topPlayers[TOP - 1] ?? null : null;

  // Up to hit today. Your city: you first (the button), then who here said so today. Another city: adults only, and never to a teen.
  const upToday = useMemo(() => {
    if (!city) return [];
    if (mine) {
      return users.filter((u) => u.id !== currentUserId && u.location.split(',')[0].trim() === city.name && isOpenToHit(u) && listable(u))
        .map((u) => ({ user: u, till: tillLabel(u.openToHitUntil) ?? 'today' }));
    }
    if (viewerTeen) return [];
    return (DEMO_FREE[city.id] ?? []).flatMap(({ id: uid, till }) => {
      const u = users.find((x) => x.id === uid);
      return u && !notKnownAdult(u) && !blockedIds.includes(u.id) ? [{ user: u, till }] : [];
    }).concat(extras.flatMap((x) => (x.free ? [{ user: x.user, till: x.free }] : [])));
  }, [city, mine, viewerTeen, users, currentUserId, blockedIds, extras, followingIds, lastSeen]); // eslint-disable-line react-hooks/exhaustive-deps
  // Round 3 (owner, Oct 28: "if no one is active in up to hit today ... put like, most active players in the
  // city. that way it stays full"): who is up first, ringed; then the city's regulars, plain, to FILL_TO faces.
  // The picture can ask for fewer up (MOCK_UP_COUNT) to show the row with one up, or none.
  const upShown = MOCK_UP_COUNT !== null ? upToday.slice(0, MOCK_UP_COUNT) : upToday;
  const extraPlayers = useMemo(() => extras.map(({ user, hits }) => ({ user, hits })), [extras]);
  const fill = useCityFill({ cityName: city?.name ?? null, upIds: upShown.map((x) => x.user.id), extra: extraPlayers });
  const courts = city ? DEMO_BUSY_COURTS[city.id] ?? [] : [];

  // The clip on top: the month's most watched there, by an adult, public.
  const reel = city ? TOP_REEL[city.id] ?? null : null;
  const reelAuthor = reel ? users.find((u) => u.id === reel.authorId && !notKnownAdult(u) && !u.isPrivate && !blockedIds.includes(u.id)) ?? null : null;

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

  if (!city) return <Screen title="City" compactTitle onBack={() => goBack()}><EmptyState icon="location-outline" title="No board for this city" body="It may not have enough players yet." /></Screen>;

  const target = ranked ? nextTarget(board, ranked.id) : null;
  const standingLine = ranked
    ? target ? `${target.gap} hits to pass ${target.city.name}` : board[1] ? `${ranked.hits - board[1].hits} hits clear of ${board[1].name}` : null
    : `Needs ${MIN_PLAYERS - city.players} more players to be ranked`;

  return (
    <View style={styles.root}>
      <Screen bleedTop wash={false} padded={false} offsetY={offsetY}>
        <Hero cityName={city.name} reel={reel} author={reelAuthor} height={heroH} top={top} />

        <View style={styles.body} onLayout={(e) => place('body', e.nativeEvent.layout.y)}>
          {/* 2. Up to hit today: right under the clip, so it is never hunted for. */}
          {mine || upShown.length || fill.length ? (
            <View style={styles.upSection}>
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
                  <Pressable key={user.id} accessibilityRole="link" accessibilityLabel={`${user.name}, up to hit today, ${till}. Open profile`} onPress={() => { if (!user.id.startsWith(MOCK_ID)) openPlayer(user.id, currentUserId); }} style={({ pressed }) => [styles.face, pressed && { opacity: PRESS_DIM }]}>
                    <OpenRing open size={56} halo="small"><Avatar name={user.name} seed={user.avatarSeed} uri={user.avatarUrl} size={56} /></OpenRing>
                    <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceName}>{user.name.split(' ')[0]}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.faceMeta}>{till}</Text>
                  </Pressable>
                ))}
                {/* Then the regulars: no ring (that means up today), and when they usually play. */}
                {fill.length && (mine || upShown.length) ? <FillDivider size={56} /> : null}
                {fill.map((f) => (
                  <FilledFace key={f.user.id} face={f} size={56} width={80} top={1} onPress={() => { if (!f.user.id.startsWith(MOCK_ID)) openPlayer(f.user.id, currentUserId); }} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 3. Where it stands: the place, and one short line. */}
          <View style={styles.standing}>
            {ranked ? (
              <View style={styles.rankLine}>
                <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.rankBig}>{ordinal(ranked.rank)}</Text>
                <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rankOf}>of {board.length}</Text>
                <View style={styles.rankMove}><Movement moved={ranked.moved} long /></View>
              </View>
            ) : null}
            {standingLine ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.standingLine}>{standingLine}</Text> : null}
          </View>

          {/* 4. Top players: each row rises in as it comes into view, one after another. */}
          <View style={styles.section} onLayout={(e) => place('section', e.nativeEvent.layout.y)}>
            <View style={styles.head}>
              <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Top players</Text>
              <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>hits in {BOARD_MONTH}</Text>
            </View>
            <View onLayout={(e) => place('list', e.nativeEvent.layout.y)}>
              {topPlayers.map((p, i) => (
                <Rise key={p.user.id} at={i * PLAYER_H} height={PLAYER_H} listY={listY} offsetY={offsetY} seeH={seeH} clock={clock} reduced={reduced}>
                  <PlayerRow p={p} line={i > 0 && !topPlayers[i - 1]?.me && !p.me} onPress={() => { if (!p.user.id.startsWith(MOCK_ID)) openPlayer(p.user.id, currentUserId); }} />
                </Rise>
              ))}
              {pinMe ? (
                <Rise at={topPlayers.length * PLAYER_H + YOU_GAP} height={PLAYER_H} listY={listY} offsetY={offsetY} seeH={seeH} clock={clock} reduced={reduced} style={styles.youGap}>
                  <PlayerRow p={pinMe} sub={fifth ? `${fifth.hits - pinMe.hits + 1} to reach the top ${TOP}` : null} onPress={() => openPlayer(pinMe.user.id, currentUserId)} />
                </Rise>
              ) : null}
            </View>
          </View>

          {/* 5. Busiest courts. */}
          {courts.length ? (
            <View style={styles.section}>
              <View style={styles.head}>
                <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="header" style={styles.sectionTitle}>Busiest courts</Text>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headNote}>hits in {BOARD_MONTH}</Text>
              </View>
              {courts.map((c, i) => (
                <View key={c.name} style={[styles.courtRow, i > 0 && styles.line]}>
                  <View style={styles.courtWords}>
                    <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.name}>{c.name}</Text>
                    <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.sub}>{c.courts} courts</Text>
                  </View>
                  <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.value}>{c.hits}</Text>
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
      </Screen>
      <TopBar name={city.name} top={top} heroH={heroH} offsetY={offsetY} />
    </View>
  );
}

/**
 * 1. The month's most watched clip in the city, playing muted, with the
 * city's name over it. A tap opens the clip.
 */
function Hero({ cityName, reel, author, height, top }: { cityName: string; reel: (typeof TOP_REEL)[string] | null; author: User | null; height: number; top: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const shown = reel && author ? reel : null;
  const media = shown && REEL_MEDIA_BASE ? `${REEL_MEDIA_BASE}/cityboard-reel-${shown.media}` : null;
  return (
    <Pressable
      accessibilityRole={shown ? 'link' : undefined}
      accessibilityLabel={shown && author ? `Most watched clip in ${cityName} this month, by ${author.name}. Open clip` : undefined}
      disabled={!shown}
      onPress={() => { if (shown) router.push(`/post/${shown.postId}`); }}
      style={[styles.hero, { height }]}
    >
      {media ? <ClipVideo uri={`${media}.mp4`} poster={`${media}.jpg`} active muted fit="cover" /> : <MediaPlaceholder label={shown ? 'Clip' : cityName} seed={cityName} fill />}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']} style={[styles.heroTopShade, { height: top + 90 }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.66)']} locations={[0, 0.35, 1]} style={styles.heroShade} />
      <View pointerEvents="none" style={styles.heroWords}>
        {shown ? (
          <View style={styles.heroKicker}>
            <Ionicons name="play" size={11} color={colors.onMedia} />
            <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.heroKickerText}>Most watched in {BOARD_MONTH}</Text>
          </View>
        ) : null}
        {/* The name alone: its place is said once, as "3rd of 15" under Up to hit (round 2 review: no "3rd" twice on one screen). */}
        <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={styles.heroName}>{cityName}</Text>
        {shown && author ? (
          <View style={styles.heroBy}>
            <Avatar name={author.name} seed={author.avatarSeed} uri={author.avatarUrl} size={22} />
            <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.heroByText}>{author.name} · {viewsWords(shown.views)}</Text>
          </View>
        ) : null}
      </View>
      {media ? <View pointerEvents="none" style={styles.muted}><Ionicons name="volume-mute" size={14} color={colors.onMedia} /></View> : null}
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

function PlayerRow({ p, line = false, sub = null, onPress }: { p: { user: User; hits: number; rank: number; me: boolean }; line?: boolean; sub?: string | null; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${ordinal(p.rank)}, ${p.me ? 'you' : p.user.name}, ${p.hits} hits`} onPress={onPress} style={({ pressed }) => [styles.playerRow, p.me ? styles.rowMine : line && styles.line, pressed && { opacity: PRESS_DIM }]}>
      {/* 1st to 3rd on a coin of their metal (round 3). */}
      <View style={styles.rankCol}>
        {hasCoin(p.rank)
          ? <Medal rank={p.rank} size={32} fontSize={16} />
          : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, p.rank > 3 && styles.rankLow, p.me && styles.mineInk, medalInk(p.rank) ? { color: medalInk(p.rank)! } : null]}>{p.rank}</Text>}
      </View>
      <Avatar name={p.user.name} seed={p.user.avatarSeed} uri={p.user.avatarUrl} size={40} ring={p.user.isCoach} />
      <View style={styles.playerWords}>
        <View style={styles.playerNameLine}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, p.me && styles.mineName]}>{p.me ? 'You' : p.user.name}</Text>
          <LevelPill profile={p.user.profile} small />
        </View>
        {sub ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.subMine}>{sub}</Text> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.value, p.me && styles.mineInk]}>{p.hits}</Text>
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
  upSection: { paddingTop: spacing.lg },
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
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: PLAYER_H, paddingHorizontal: spacing.md },
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(14) },
  youGap: { marginTop: YOU_GAP },
  rankCol: { width: 32, alignItems: 'center' },
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
