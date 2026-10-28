import { PRESS_DIM } from '@/theme/press';
import React, { useId, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DAYS_LEFT_LABEL, MIN_PLAYERS, MOMENTS, cityById, nextTarget, ordinal, rankCities, sessionsWords, type RankedCity } from '@/features/cityBoard/mock';
import { BoardHead, Medal, Movement, hasCoin, medalInk } from '@/features/cityBoard/BoardBits';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** One row's height: the fade is measured in rows. */
export const ROW_H = 48;
/** The place column: a coin's width (the head's "Rank" is centred over it). */
const RANK_W = 32;
/** Your city sits in the run of the top rows while it is this high; below it, it gets its own row under the top 3. */
const IN_RUN = 5;

/**
 * DESIGN MOCK (design/city-board), round 2. Find Players, under the map, in
 * place of "You're early in …": this month's city board, fading into the
 * page, with "See all cities" on the fade. One tap opens the full board.
 *
 * Which rows (owner, Oct 27: "should it show your city amongst the top …
 * or just have it show the correct leaderboard", and "not a big fan of these
 * 5 .... 9"): always the true board, never your city faked into the top.
 *   - Your city in the top 5: the top of the board, yours tinted in place.
 *   - Lower: the top 3, then your city as its own row with its real place
 *     and the one number that matters to you ("69 to pass Denver"), then the
 *     city right behind you, fading. No dots: the space and the tint say
 *     "and here is you", the way Strava pins your row under a segment's top.
 * Movement this week sits beside each city; a city on a run gets the filled mark.
 */
export function CityBoardPreview({ homeCityId }: { homeCityId: string | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const board = useMemo(() => rankCities('total'), []);
  const mine = board.find((c) => c.id === homeCityId) ?? null;
  const unranked = !mine && homeCityId ? cityById(homeCityId) : null;
  const at = mine ? board.indexOf(mine) : -1;
  const apart = at >= IN_RUN;
  const top = apart ? board.slice(0, 3) : board.slice(0, Math.max(5, at + 2));
  const below = apart ? board[at + 1] ?? null : null;
  const target = mine ? nextTarget(board, mine.id) : null;

  // One line of news under the title, the race's latest: about your city when there is one.
  const moment = useMemo(() => {
    const m = MOMENTS.find((x) => x.who === mine?.id || x.passed === mine?.id) ?? MOMENTS[0];
    const who = cityById(m.who);
    const passed = cityById(m.passed);
    return who && passed ? { text: `${who.name} passed ${passed.name}`, when: m.when } : null;
  }, [mine]);

  // The last row dissolves into the page; never your own.
  const fadeRows = apart ? (below ? 1 : 0) : Math.min(1.6, Math.max(0, top.length - 1 - at));

  // What VoiceOver hears for the card (one link): the rows it shows, each with its unit ("512 sessions").
  const shown = [...top, ...(apart && mine ? [mine, ...(below ? [below] : [])] : [])];
  const spokenRows = shown.map((c) => `${ordinal(c.rank)}, ${c.name}${c.id === mine?.id ? ', your city' : ''}, ${sessionsWords(c.hits)}`).join('. ');

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Cities this month, by tennis sessions logged.${spokenRows ? ` ${spokenRows}.` : ''} See all cities`}
      onPress={() => router.push('/city-board')}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: PRESS_DIM }]}
    >
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>Cities this month</Text>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.left}>{DAYS_LEFT_LABEL}</Text>
      </View>
      {unranked ? (
        <View style={styles.newsRow}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.news}>{unranked.name} needs {MIN_PLAYERS - unranked.players} more players to make the board.</Text>
        </View>
      ) : moment ? (
        <View style={styles.newsRow}>
          <Ionicons name="caret-up" size={11} color={colors.success} />
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.news}>{moment.text}<Text style={styles.when}> · {moment.when}</Text></Text>
        </View>
      ) : null}
      {unranked ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`Invite a hitting partner to put ${unranked.name} on the board`} hitSlop={6} onPress={() => router.push('/invite')} style={({ pressed }) => [styles.invite, pressed && { opacity: PRESS_DIM }]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteText}>Invite a hitting partner</Text>
        </Pressable>
      ) : null}
      {/* Round 5 (owner, Oct 28: "something on the top that says like position or rank ... and then city, and then sessions"). */}
      <BoardHead name="City" value="Sessions" rankWidth={RANK_W} style={styles.boardHead} />
      <View style={styles.rows}>
        {top.map((c, i) => <PreviewRow key={c.id} city={c} mine={c.id === mine?.id} line={i > 0 && top[i - 1].id !== mine?.id && c.id !== mine?.id} target={c.id === mine?.id ? target : null} />)}
        {apart && mine ? (
          <View style={styles.yours}>
            <PreviewRow city={mine} mine target={target} />
            {below ? <PreviewRow city={below} mine={false} /> : null}
          </View>
        ) : null}
        {fadeRows > 0 ? <Fade height={ROW_H * fadeRows} /> : null}
      </View>
      <View style={[styles.more, fadeRows === 0 && styles.moreClear]}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.moreText}>See all cities</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

/** A city's row here: place, name, this week's movement, sessions logged. Yours is tinted, with the number to chase under its name. */
function PreviewRow({ city, mine, line = false, target = null }: { city: RankedCity; mine: boolean; line?: boolean; target?: ReturnType<typeof nextTarget> }) {
  const styles = useThemedStyles(styleDefinitions);
  const podium = city.rank <= 3;
  return (
    <View style={[styles.row, mine ? styles.rowMine : line && styles.rowLine]}>
      {/* 1st to 3rd on a coin of their metal (round 3); yours keeps its metal, its name says it is yours. */}
      <View style={styles.rankCol}>
        {hasCoin(city.rank)
          ? <Medal rank={city.rank} size={RANK_W} fontSize={16} />
          : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, !podium && styles.rankLow, mine && styles.inkMine, medalInk(city.rank) ? { color: medalInk(city.rank)! } : null]}>{city.rank}</Text>}
      </View>
      <View style={styles.nameCol}>
        <View style={styles.nameLine}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, mine && styles.nameMine]}>{city.name}</Text>
          <Movement moved={city.moved} long={mine} />
        </View>
        {mine && target ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.target}>{target.gap} to pass {target.city.name}</Text> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.value, mine && styles.inkMine]}>{city.hits}</Text>
    </View>
  );
}

/** The page's own colour, from nothing to solid: the list dissolves into the page rather than ending on a line. */
function Fade({ height }: { height: number }) {
  useTheme();
  const id = useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.6" stopColor={colors.bg} stopOpacity={0.85} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#f${id})`} />
      </Svg>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: spacing.xs },
  title: { ...typography.title, color: colors.text },
  left: { ...typography.small, ...font('600'), color: colors.text },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm, minHeight: 20 },
  // The head row: tucked under the news line, a little room before the first row (and off your tinted one).
  boardHead: { marginTop: -2, paddingBottom: 6 },
  news: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  when: { color: colors.textFaint },
  rows: {},
  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW_H, paddingHorizontal: spacing.md, gap: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(12), minHeight: 58 },
  // Big, heavy, tabular: the place is the first thing read, as on a standings table.
  // The place's column: a coin's width, the numerals below 3rd centred under the coins.
  rankCol: { width: RANK_W, alignItems: 'center' },
  rank: { ...font('700'), fontSize: 22, letterSpacing: -0.6, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rankLow: { color: colors.textFaint },
  inkMine: { color: colors.brand },
  nameCol: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...typography.body, ...font('500'), fontSize: 16, color: colors.text, flexShrink: 1 },
  nameMine: { ...font('600'), color: colors.brand },
  target: { ...typography.small, ...font('500'), color: colors.text },
  value: { ...font('700'), fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  // Your row, under the top 3: set apart by space alone (no dots), the city behind you fading under it.
  yours: { marginTop: spacing.md },
  more: { marginTop: -16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32 },
  moreClear: { marginTop: spacing.xs },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
  invite: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginBottom: spacing.xs },
  inviteText: { ...typography.smallStrong, color: colors.brand },
});
