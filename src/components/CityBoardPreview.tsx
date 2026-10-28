import { PRESS_DIM } from '@/theme/press';
import React, { useId, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { MIN_PLAYERS, daysLeftLabel, isFinal, monthName, morePlayersWords, nextTarget, ordinal, rankCities, sessionsWords, whenWords, type RankedCity } from '@/features/cityBoard/board';
import { BoardHead, Medal, Movement, hasCoin } from '@/features/cityBoard/BoardBits';
import { cityLabel, zeroCities, type ZeroCity } from '@/features/cityBoard/catalog';
import { useCityBoard } from '@/features/cityBoard/useCityBoard';
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
 * Find Players, in place of "You're early in …" (owner, Oct 27: "maybe we
 * just replace it with the leaderboard that fades"), under Up to hit / "Most
 * active in <city>" (owner, Oct 28: "People first"): this
 * month's city board, fading into the page, with "See all cities" on the
 * fade. One tap opens the full board. The numbers are the server's
 * (city_board, migration 196), yours up to the minute in your own city.
 *
 * Which rows (owner, Oct 27): always the true board, never your city faked
 * into the top.
 *   - Your city in the top 5: the top of the board, yours tinted in place.
 *   - Lower: the top 3, then your city as its own row with its real place
 *     and the one number that matters to you ("69 to pass Denver"), then the
 *     city right behind you, fading.
 *   - Your city not ranked yet: "Durham needs 2 more players to make the
 *     board" (never whether one other is there), and the way to invite.
 *   - No town the boards know: how to pick one.
 * Under the ranked cities, every other city at 0 (owner, Oct 28: "Also add
 * the other cities on the list. You can just put them at 0"), nearest to
 * yours first, so the board is never one lonely row: a dash for a place,
 * 0 sessions. They come from the phone's own list (catalog.ts), never the
 * server, so a city with too few players to rank looks exactly like one
 * with nobody. Yours, not ranked yet, is among them, tinted, its number a
 * dash (you know you played there).
 * Movement this week sits beside each city; a city on a run gets the filled mark.
 * Find Players shows it while it is on its way, while any city is ranked, or
 * (in a month with none ranked yet) while you have a town: your city at the
 * top of the cities at 0. With no town and none ranked it is an A to Z of
 * zeros that says nothing, so Find Players keeps its own card there.
 */
export function CityBoardPreview() {
  const styles = useThemedStyles(styleDefinitions);
  const { status, board, cities, month } = useCityBoard();
  const ranked = useMemo(() => rankCities(cities, 'total'), [cities]);
  const me = board?.me ?? null;
  const homeId = me?.cityId ?? null;
  // The ranked cities, then every other at 0, nearest to yours first (never by anything they did). In a month
  // with none ranked yet (the first days of one), every city at 0, yours first.
  const ready = status === 'ready';
  const rows = useMemo<Row[]>(() => (ready ? [...ranked, ...zeroCities(new Set(ranked.map((c) => c.id)), homeId)] : []), [ready, ranked, homeId]);
  const mine = ranked.find((c) => c.id === homeId) ?? null;
  const unranked = !mine && me?.cityId && me.cityName ? { name: cityLabel({ name: me.cityName, region: me.region ?? '' }), needed: me.playersNeeded ?? MIN_PLAYERS } : null;
  const noTown = status === 'ready' && !!me && !me.cityId;
  // Your city's row, ranked or (not yet) at 0.
  const home = homeId ? rows.find((c) => c.id === homeId) ?? null : null;
  const at = home ? rows.indexOf(home) : -1;
  const apart = at >= IN_RUN;
  const top = apart ? rows.slice(0, 3) : rows.slice(0, Math.max(5, at + 2));
  const below = apart ? rows[at + 1] ?? null : null;
  const target = mine ? nextTarget(ranked, mine.id, 'total') : null;
  const final = isFinal(month);

  // One line of news under the title, the race's latest: about your city when there is one.
  const moment = useMemo(() => {
    if (!board) return null;
    const name = (id: string) => { const c = board.cities.find((x) => x.id === id); return c ? cityLabel(c) : null; };
    const now = new Date();
    const lines = board.events.flatMap((e) => {
      const who = name(e.who);
      const passed = name(e.passed);
      const when = whenWords(e.at, now);
      return who && passed && when ? [{ text: `${who} passed ${passed}`, when, yours: e.who === mine?.id || e.passed === mine?.id }] : [];
    });
    return lines.find((l) => l.yours) ?? lines[0] ?? null;
  }, [board, mine]);

  // The last row dissolves into the page; never your own.
  const fadeRows = apart ? (below ? 1 : 0) : Math.min(1.6, Math.max(0, top.length - 1 - at));
  const title = final ? `Cities in ${monthName(month)}` : 'Cities this month';
  const loading = status === 'loading';
  const listed = rows.length > 0;

  // What VoiceOver hears for the card (one link): the line under the title, then the rows it shows, each with its unit ("512 sessions").
  const shown = [...top, ...(apart && home ? [home, ...(below ? [below] : [])] : [])];
  const spokenRows = shown.map((c) => rowWords(c, c.id === homeId)).join('. ');
  const spokenNote = unranked ? ` ${unranked.name} needs ${morePlayersWords(unranked.needed)} to make the board.`
    : noTown ? ' Pick your town from the search in Edit profile to join a city board.'
      : moment ? ` ${moment.text}, ${moment.when}.` : '';
  // The link under the note ("Invite a hitting partner", "Edit profile"): while the card is one link for VoiceOver,
  // its children are hidden from it, so the same link is offered as the card's action; with no list (the card is
  // not a link then), VoiceOver reaches the link itself.
  const extra = unranked ? { label: 'Invite a hitting partner', go: '/invite' as const } : noTown ? { label: 'Edit profile', go: '/edit-profile' as const } : null;

  return (
    <Pressable
      accessible={loading || listed}
      accessibilityRole="link"
      accessibilityLabel={loading ? `${title}. Loading` : `${title}, by tennis sessions logged.${spokenNote}${spokenRows ? ` ${spokenRows}.` : ''} See all cities`}
      accessibilityActions={listed && extra ? [{ name: 'extra', label: extra.label }] : undefined}
      onAccessibilityAction={(e) => { if (extra && e.nativeEvent.actionName === 'extra') router.push(extra.go); }}
      disabled={!loading && !listed}
      onPress={() => router.push('/city-board')}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: PRESS_DIM }]}
    >
      <View style={styles.head}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>{title}</Text>
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.left}>{daysLeftLabel(month)}</Text>
      </View>
      {unranked ? (
        <View style={styles.newsRow}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.news}>{unranked.name} needs {morePlayersWords(unranked.needed)} to make the board.</Text>
        </View>
      ) : noTown ? (
        <View style={styles.newsRow}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.news}>Pick your town from the search in Edit profile to join a city board.</Text>
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
      ) : noTown ? (
        <Pressable accessibilityRole="link" accessibilityLabel="Edit profile to pick your town" hitSlop={6} onPress={() => router.push('/edit-profile')} style={({ pressed }) => [styles.invite, pressed && { opacity: PRESS_DIM }]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.inviteText}>Edit profile</Text>
        </Pressable>
      ) : null}
      {/* Round 5 (owner, Oct 28: "something on the top that says like position or rank ... and then city, and then sessions"). */}
      {loading || listed ? <BoardHead name="City" value="Sessions" rankWidth={RANK_W} style={styles.boardHead} /> : null}
      {loading ? (
        // Still coming: the rows' own shapes, quiet, so nothing jumps when they land.
        <View style={styles.rows}>
          {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} line={i > 0} />)}
          <Fade height={ROW_H * 1.6} />
        </View>
      ) : listed ? (
        <View style={styles.rows}>
          {top.map((c, i) => <PreviewRow key={c.id} city={c} mine={c.id === homeId} line={i > 0 && top[i - 1].id !== homeId && c.id !== homeId} target={c.id === mine?.id ? target : null} final={final} />)}
          {apart && home ? (
            <View style={styles.yours}>
              <PreviewRow city={home} mine target={target} final={final} />
              {below ? <PreviewRow city={below} mine={false} /> : null}
            </View>
          ) : null}
          {fadeRows > 0 ? <Fade height={ROW_H * fadeRows} /> : null}
        </View>
      ) : null}
      {listed ? (
        <View style={[styles.more, fadeRows === 0 && styles.moreClear]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.moreText}>See all cities</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** A row still loading: a coin's place, a name's length, a number's width, in the page's faintest ink. */
function SkeletonRow({ line }: { line: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.row, line && styles.rowLine]}>
      <View style={styles.rankCol}><View style={styles.skelCoin} /></View>
      <View style={styles.nameCol}><View style={styles.skelName} /></View>
      <View style={styles.skelValue} />
    </View>
  );
}

/** A row on the card: a ranked city, or one at 0. */
type Row = RankedCity | ZeroCity;
const isZero = (c: Row): c is ZeroCity => 'zero' in c;

/** What VoiceOver hears for a row: "1st, Raleigh, your city, 68 sessions"; "Not ranked, Greensboro, 0 sessions"; yours not ranked: no number. */
const rowWords = (c: Row, mine: boolean) => (isZero(c)
  ? `Not ranked, ${cityLabel(c)}${mine ? ', your city' : ', 0 sessions'}`
  : `${ordinal(c.rank)}, ${cityLabel(c)}${mine ? ', your city' : ''}, ${sessionsWords(c.sessions)}`);

/**
 * A city's row here: place, name, this week's movement, sessions logged. Yours is tinted, with the number to chase under its name.
 * A city at 0: a dash for its place (no place yet, rather than a long tie for 2nd) and 0, both in the faint ink of
 * the places below 3rd; yours, not ranked yet, a dash for its number too.
 */
function PreviewRow({ city, mine, line = false, target = null, final = false }: { city: Row; mine: boolean; line?: boolean; target?: ReturnType<typeof nextTarget>; /** Last month's, on the 1st: how far behind it finished. */ final?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const zero = isZero(city);
  const podium = !zero && city.rank <= 3;
  return (
    <View style={[styles.row, mine ? styles.rowMine : line && styles.rowLine]}>
      {/* 1st to 3rd on a coin of their metal (round 3); yours keeps its metal, its name says it is yours. */}
      <View style={styles.rankCol}>
        {!zero && hasCoin(city.rank)
          ? <Medal rank={city.rank} size={RANK_W} fontSize={16} markSize={22} />
          : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, !podium && styles.rankLow, zero && styles.rankDash, mine && styles.inkMine]}>{zero ? '–' : city.rank}</Text>}
      </View>
      <View style={styles.nameCol}>
        <View style={styles.nameLine}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, mine && styles.nameMine]}>{cityLabel(city)}</Text>
          {!zero ? <Movement moved={city.moved} long={mine} /> : null}
        </View>
        {mine && target ? <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={styles.target}>{!final ? `${target.gap} to pass ${cityLabel(target.city)}` : target.gap === 1 ? `Level with ${cityLabel(target.city)}` : `${target.gap - 1} behind ${cityLabel(target.city)}`}</Text> : null}
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.value, zero && styles.valueZero, mine && styles.inkMine]}>{zero ? (mine ? '–' : '0') : city.sessions}</Text>
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
  // Quiet, as "3 near you" beside Open to hit: the title is the heading, this is its aside.
  left: { ...typography.small, color: colors.textMuted },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xs, minHeight: 20 },
  // Owner, Oct 28: "A bit too cluttered here under cities and 4 days left. It should be like the headers. And then
  // the table chart". The title stands alone as a section heading; clear room; then the table, its head row on top.
  boardHead: { marginTop: spacing.lg },
  news: { ...typography.small, color: colors.textMuted, flexShrink: 1 },
  when: { color: colors.textFaint },
  // A little room under the head's hairline, so a tinted first row (yours) never sits on it.
  rows: { paddingTop: spacing.xs },
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
  // A city at 0: a light dash for its place, its number in the faint ink of the places below 3rd, so the ranked numbers read first.
  rankDash: { ...font('500') },
  valueZero: { color: colors.textFaint },
  // Your row, under the top 3: set apart by space alone (no dots), the city behind you fading under it.
  yours: { marginTop: spacing.md },
  more: { marginTop: -16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 32 },
  moreClear: { marginTop: spacing.xs },
  moreText: { ...typography.smallStrong, color: colors.textMuted },
  invite: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  inviteText: { ...typography.smallStrong, color: colors.brand },
  skelCoin: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceAlt },
  skelName: { width: '46%', height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },
  skelValue: { width: 30, height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },
});
