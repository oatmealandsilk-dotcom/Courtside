import { PRESS_DIM } from '@/theme/press';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { Button, Screen } from '@/components/ui';
import { PAGE_WASH, PageWashContext } from '@/components/ui/pageWash';
import { Wash } from '@/components/Wash';
import { BoardHead, Medal, Movement, hasCoin, medalInk } from '@/features/cityBoard/BoardBits';
import { BOARD_MONTH, MIN_PLAYERS, MOMENTS, MY_DEMO_HITS, RESETS_ON, cityById, isHot, nextTarget, ordinal, rankCities, sessionsWords, type BoardMode, type RankedCity } from '@/features/cityBoard/mock';
import { useHomeCityId } from '@/features/cityBoard/useHomeCity';
import { useBarInset } from '@/features/navigation/barInset';
import { goBack } from '@/lib/goBack';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/** The podium's rows are taller, their numbers bigger: the top 3 read first. */
const PODIUM_H = 74;
const ROW_H = 62;
/** The line under 3rd. */
const CUT_H = 20;
/** The "you" dock over the bottom while your row is off screen: its row is a list row, drawn this far above the bar. */
const YOU_H = 62;
const DOCK_ROW_TOP = YOU_H + 10;
const DOCK_PAD = 4;
/** Where row i starts in the list (fixed heights, so the bar and the opening scroll know without measuring). */
const rowTop = (i: number) => (i < 3 ? i * PODIUM_H : 3 * PODIUM_H + CUT_H + (i - 3) * ROW_H);
const rowHeight = (i: number) => (i < 3 ? PODIUM_H : ROW_H);
/** The place column: a podium coin's width, giving back 2 points after it (the head's "Rank" is centred over it). */
const RANK_W = 40;
const RANK_SHIFT = -2;

/** In a browser the page's own sticky positioning pins the table's head, exactly in step with the scroll (as the Tennis profile's tabs). */
const WEB = Platform.OS === 'web';
const webSticky = WEB ? ({ position: 'sticky', top: 0 } as unknown as ViewStyle) : null;
/** A browser element's place on the screen (React Native for Web's views are the page's own elements). */
const rect = (node: unknown): DOMRect | null => {
  const el = node as { getBoundingClientRect?: () => DOMRect } | null;
  return el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
};

/**
 * DESIGN MOCK (design/city-board), round 2. The whole board as a standings
 * table (owner, Oct 27: the first one "looks hella AI and hella plain"):
 *
 *   - big, heavy place numbers; the top 3 taller, with a line under 3rd;
 *   - this week's movement beside each city, and the one filled mark for a
 *     city on a run (up 3 or more this week);
 *   - your city tinted, with the number to chase and what you added to it;
 *   - opening it scrolls to your city ("when you tap in to the leaderboard,
 *     it will scroll down to where your city is at");
 *   - while your row is off screen, it rides along the bottom (in place of
 *     the old "5 ⋮ 9" gap), one tap back to it;
 *   - Sessions / Per player as the value column's own heading, the way a
 *     stats table is sorted, not a segmented switch (round 4: "Sessions",
 *     the app's own word for a logged one, where it said "Hits");
 *   - a head row under them, Rank · City · Sessions ("Per player" on that
 *     tab), the rows' numbers bare (round 5, owner, Oct 28: "something on
 *     the top that says like position or rank or whatever and then city, and
 *     then sessions. Like a header"); scrolled down the long list, the tabs
 *     and the head row stay pinned at the top, so the columns stay named;
 *   - the week's moments on top ("Raleigh passed Atlanta · today").
 * Starts again on the 1st.
 */
export default function CityBoard() {
  const styles = useThemedStyles(styleDefinitions);
  const [mode, setMode] = useState<BoardMode>('total');
  const board = useMemo(() => rankCities(mode), [mode]);
  const homeId = useHomeCityId();
  const mine = board.find((c) => c.id === homeId) ?? null;
  const at = mine ? board.indexOf(mine) : -1;
  const unrankedHome = !mine && homeId ? cityById(homeId) : null;
  const per = mode === 'per';
  const target = mine ? nextTarget(board, mine.id) : null;
  const open = (id: string) => router.push({ pathname: '/city/[id]', params: { id } });

  // The week's news: yours first, two lines at most.
  const moments = useMemo(() => {
    const ordered = [...MOMENTS].sort((a, b) => Number(b.who === homeId || b.passed === homeId) - Number(a.who === homeId || a.passed === homeId));
    return ordered.slice(0, 2).flatMap((m) => {
      const who = cityById(m.who);
      const passed = cityById(m.passed);
      return who && passed ? [{ key: `${m.who}-${m.passed}`, text: `${who.name} passed ${passed.name}`, when: m.when }] : [];
    });
  }, [homeId]);

  // ---- Where your row is, and whether it is on screen (all on the UI thread) ----
  const scrollRef = useRef<ScrollView | null>(null);
  const offsetY = useSharedValue(0);
  const listY = useSharedValue(0);
  const viewTop = useSharedValue(0);
  const { height: windowH } = useWindowDimensions();
  const barInset = useBarInset();
  const reduced = useReducedMotion();
  const probe = useRef<View | null>(null);
  const [placed, setPlaced] = useState(false);
  const myTop = at >= 0 ? rowTop(at) : -1;
  const myH = at >= 0 ? rowHeight(at) : 0;
  // The part of the page you can see, below the title and above the bar and the "you" bar.
  const seeH = useSharedValue(windowH);
  useEffect(() => { seeH.value = windowH - viewTop.value - barInset; }, [windowH, barInset, seeH, viewTop, placed]);
  // The table's head (the tabs and the Rank · City · Sessions row): where it sits in the page, and its height.
  // Scrolled past, it is pinned over the top of what you can see, and covers that much of it.
  const headTop = useSharedValue(1e9);
  const headH = useSharedValue(0);

  const showYou = useSharedValue(0);
  useAnimatedReaction(
    () => {
      if (myTop < 0 || listY.value <= 0) return false;
      const top = listY.value + myTop - offsetY.value;
      const bottom = top + myH;
      // Gone up under the pinned head (or off the top), or still below the dock's own row: the dock stands in for
      // it until the real row scrolls up into the very spot the dock's row is drawn in, then hands over.
      const cover = offsetY.value > headTop.value ? headH.value : 0;
      return bottom < cover + 4 || top > seeH.value - DOCK_ROW_TOP + DOCK_PAD + 1;
    },
    (off, was) => {
      if (off === was) return;
      // Handing over in place is instant (the two rows are the same, in the same spot); coming back from off the top slides up.
      const cover = offsetY.value > headTop.value ? headH.value : 0;
      const fromTop = off && listY.value + myTop + myH - offsetY.value < cover + 4;
      showYou.value = fromTop && !reduced ? withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }) : (off ? 1 : 0);
    },
    [myTop, myH, reduced],
  );
  const youStyle = useAnimatedStyle(() => ({ opacity: showYou.value, transform: [{ translateY: (1 - showYou.value) * 24 }] }));

  const scrollToMine = useCallback((animated: boolean) => {
    if (myTop < 0) return;
    // Your row a little above the middle of what you can see, under the head that will be pinned by then.
    const mid = listY.value + myTop + myH / 2;
    const free = mid - seeH.value * 0.45;
    const y = Math.max(0, free > headTop.value ? mid - headH.value - (seeH.value - headH.value) * 0.45 : free);
    scrollRef.current?.scrollTo({ y, animated });
  }, [myTop, myH, listY, seeH, headTop, headH]);

  // Opening the board takes you to your city, once the page has slid in, if it is not already in view.
  const opened = useRef(false);
  useEffect(() => {
    if (!placed || opened.current || myTop < 0) return;
    opened.current = true;
    // Already in the top half of what you can see: nothing to do.
    if (listY.value + myTop + myH / 2 < seeH.value * 0.55) return;
    const t = setTimeout(() => scrollToMine(!reduced), 380);
    return () => clearTimeout(t);
  }, [placed, myTop, myH, listY, seeH, scrollToMine, reduced]);

  // The one number to chase: "62 to pass Austin", "Level with New York" (per player), or the lead.
  const chaseWords = !mine ? '' : target
    ? (per && target.city.value - mine.value < 0.05 ? `Level with ${target.city.name}` : `${per ? target.gap.toFixed(1) : target.gap} to pass ${target.city.name}`)
    : `${per ? (mine.value - (board[1]?.value ?? 0)).toFixed(1) : mine.hits - (board[1]?.hits ?? 0)} clear of ${board[1]?.name ?? 'the rest'}`;
  const valueOf = (c: RankedCity) => (per ? c.value.toFixed(1) : String(c.hits));
  const subOf = (c: RankedCity) => {
    if (c.id === mine?.id) {
      return per ? chaseWords : `${chaseWords} · you added ${MY_DEMO_HITS}`;
    }
    if (per) return `${sessionsWords(c.hits)} · ${c.players} players`;
    // A city on a run says how long it has lasted (from 2 weeks: "1 weeks running" says nothing).
    return isHot(c) && (c.run ?? 0) >= 2 ? `${c.players} players · climbing ${c.run} weeks running` : `${c.players} players`;
  };

  return (
    <View style={styles.root}>
      <Screen title="Cities" subtitle={`${BOARD_MONTH} · resets ${RESETS_ON}`} compactTitle onBack={() => goBack()} scrollRef={scrollRef} offsetY={offsetY}>
        <View
          ref={probe}
          onLayout={() => {
            // Where the scrolling part starts on screen (under the title), measured once at the top.
            probe.current?.measureInWindow((_x, y) => { viewTop.value = y; setPlaced(true); });
          }}
        />
        {/* The week's moments: one line each, newest first. */}
        {moments.length && !per ? (
          <View style={styles.moments}>
            {moments.map((m) => (
              <View key={m.key} style={styles.moment}>
                <Ionicons name="caret-up" size={11} color={colors.success} />
                <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={styles.momentText}>{m.text}</Text>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.momentWhen}>{m.when}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* The table's head: how many, and what it is ranked by (tap the other to re-rank); under it, what each
            column is. Pinned at the top while the long list scrolls under it. */}
        <PinnedHead offsetY={offsetY} viewTop={viewTop} headTop={headTop} headH={headH}>
        <View style={styles.tableHead}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={styles.headCount}>{board.length} cities</Text>
          <View style={styles.sorts} accessibilityRole="tablist" accessibilityLabel="Rank cities by">
            {([['total', 'Sessions'], ['per', 'Per player']] as const).map(([value, label]) => {
              const on = mode === value;
              return (
                <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'per' ? 'Sessions per player' : 'Sessions'} accessibilityState={{ selected: on }} hitSlop={8} onPress={() => setMode(value)} style={styles.sort}>
                  <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.sortText, on && styles.sortOn]}>{label}</Text>
                  <View style={[styles.sortBar, on && styles.sortBarOn]} />
                </Pressable>
              );
            })}
          </View>
        </View>
        {/* Round 5: what each column is, in the rows' own columns; the right one follows the tab. */}
        <BoardHead name="City" value={per ? 'Per player' : 'Sessions'} valueSpoken={per ? 'Sessions per player' : 'Sessions'} rankWidth={RANK_W} rankShift={RANK_SHIFT} style={styles.boardHead} />
        </PinnedHead>

        <View style={styles.list} onLayout={(e) => { listY.value = e.nativeEvent.layout.y; }}>
          {board.map((c, i) => (
            <React.Fragment key={c.id}>
              {i === 3 ? <View style={styles.cut}><View style={styles.cutLine} /></View> : null}
              <Pressable accessibilityRole="link" accessibilityLabel={`${ordinal(c.rank)}, ${c.name}, ${per ? `${valueOf(c)} sessions per player` : sessionsWords(c.hits)}`} onPress={() => open(c.id)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
                <TableRow city={c} mine={c.id === mine?.id} podium={i < 3} line={i !== 0 && i !== 3 && board[i - 1].id !== mine?.id && c.id !== mine?.id} value={valueOf(c)} sub={subOf(c)} showMove={!per} />
              </Pressable>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.after}>
          {unrankedHome || cityById('cary') ? (
            <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.unranked}>
              {(unrankedHome ?? cityById('cary'))!.name} needs {MIN_PLAYERS - (unrankedHome ?? cityById('cary'))!.players} more players to be ranked.
            </Text>
          ) : null}
          {mine || unrankedHome ? (
            <View style={styles.climb}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.climbHead}>Help {(mine ?? unrankedHome)!.name} climb</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.climbBody}>Every session a player from here logs counts.</Text>
              <View style={styles.climbButton}><Button label="Invite a hitting partner" variant="secondary" onPress={() => router.push('/invite')} full /></View>
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.fine}>A city's number is the tennis sessions logged this month by players who call it home. A city needs {MIN_PLAYERS} players to be ranked.</Text>
        </View>
      </Screen>

      {/* Yours, docked over the bottom while its row is off screen (in place of the old "5 ⋮ 9"): the
          same row, in the page's own ground down to the bottom edge, so nothing shows through under
          it. Scrolling down to it hands over in place; one tap takes you there. */}
      {mine ? (
        <Animated.View pointerEvents="box-none" style={[styles.dock, { height: barInset + DOCK_ROW_TOP }, youStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${mine.name}, ${ordinal(mine.rank)}, ${per ? `${valueOf(mine)} sessions per player` : sessionsWords(mine.hits)}. Show on the board`} onPress={() => scrollToMine(!reduced)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
            <TableRow city={mine} mine podium={false} line={false} value={valueOf(mine)} sub={subOf(mine)} showMove={!per} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * DESIGN MOCK, round 5. The table's head (the tabs and the Rank · City ·
 * Sessions row), pinned over the top of the page once the list scrolls up
 * under it, so the columns stay named all the way down the board. Pinned the
 * way the Tennis profile's tabs are: on a phone it is carried down by the
 * page's own scroll on the animation thread (`offsetY`, from Screen), frame
 * for frame with the finger; in a browser by the page's sticky positioning.
 * While pinned it stands on a band of the page's colour that hides the rows
 * passing under it, with a hairline along its foot, and the page's faint wash
 * carried on behind it where the wash still reaches (on a phone the wash
 * scrolls up with the page; in a browser it stays put).
 */
function PinnedHead({ offsetY, viewTop, headTop, headH, children }: {
  offsetY: SharedValue<number>;
  /** Where the scrolling part starts on screen (the wash is drawn from the screen's top). */
  viewTop: SharedValue<number>;
  /** Set here: where the head sits in the page, and its height. */
  headTop: SharedValue<number>;
  headH: SharedValue<number>;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  // Phone: pinned once the page has scrolled it to the top, and from then on moved down exactly as far as the page moves up.
  const pin = useAnimatedStyle(() => (WEB ? {} : { transform: [{ translateY: Math.max(0, offsetY.value - headTop.value) }] }));
  const bandShown = useAnimatedStyle(() => (WEB ? {} : { opacity: offsetY.value > headTop.value ? 1 : 0 }));
  // Phone: the band's copy of the wash sits where the page's own is, which scrolls up with the page.
  const washAt = useAnimatedStyle(() => (WEB ? {} : { transform: [{ translateY: -viewTop.value - Math.max(0, offsetY.value) }] }));

  // Browser: whether the head is pinned, and where the page's wash falls behind its band then.
  const frame = useContext(PageWashContext);
  const spot = useRef<View>(null);
  const [webPinned, setWebPinned] = useState<{ top: number; left: number; width: number } | null | false>(false);
  const onWebPin = useCallback((on: boolean) => {
    if (!on) { setWebPinned(false); return; }
    // Pinned, the band's top is the top of the scrolling part, which sits `y` below the wash's top;
    // across, the wash spans the scrolling part from its left edge, and the band starts a gutter left of the head.
    const f = frame?.current;
    const box = f ? rect(f.node) : null;
    const head = rect(spot.current);
    setWebPinned(f && box && head ? { top: -f.y, left: box.left - (head.left - spacing.lg), width: box.width } : null);
  }, [frame]);
  useAnimatedReaction(
    () => WEB && offsetY.value > headTop.value,
    (on, was) => { if (WEB && on !== was && (on || was !== null)) runOnJS(onWebPin)(on); },
  );

  return (
    <Animated.View
      onLayout={(e) => { const { y, height } = e.nativeEvent.layout; headTop.value = y; headH.value = height; }}
      style={[styles.pinSpot, webSticky, pin]}
    >
      {WEB ? (
        webPinned !== false ? (
          <View pointerEvents="none" style={styles.pinBand}>
            {webPinned ? <Wash height={PAGE_WASH.height} strength={PAGE_WASH.strength} style={{ top: webPinned.top, left: webPinned.left, width: webPinned.width, right: undefined }} /> : null}
            <View style={styles.pinLine} />
          </View>
        ) : null
      ) : (
        <Animated.View pointerEvents="none" style={[styles.pinBand, bandShown]}>
          <Animated.View style={[StyleSheet.absoluteFill, washAt]}><Wash height={PAGE_WASH.height} strength={PAGE_WASH.strength} /></Animated.View>
          <View style={styles.pinLine} />
        </Animated.View>
      )}
      <View ref={spot}>{children}</View>
    </Animated.View>
  );
}

function TableRow({ city, mine, podium, line, value, sub, showMove }: { city: RankedCity; mine: boolean; podium: boolean; line: boolean; value: string; sub: string; showMove: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.row, { height: podium ? PODIUM_H : ROW_H }, mine ? styles.rowMine : line && styles.rowLine]}>
      {/* 1st to 3rd on a coin of their metal (round 3, owner: "have first second third be gold silver bronze").
          By place, not by row: two cities level on 2nd both wear silver. Yours keeps its metal; its name says it is yours. */}
      <View style={styles.rankCol}>
        {hasCoin(city.rank)
          ? <Medal rank={city.rank} size={RANK_W} fontSize={21} />
          : <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.rank, podium ? styles.rankPodium : styles.rankLow, mine && styles.rankMine, medalInk(city.rank) ? { color: medalInk(city.rank)! } : null]}>{city.rank}</Text>}
      </View>
      <View style={styles.nameCol}>
        <View style={styles.nameLine}>
          <Text maxFontSizeMultiplier={TextScale.CARD} numberOfLines={1} style={[styles.name, podium && styles.namePodium, mine && styles.nameMine]}>{city.name}</Text>
          {showMove ? <Movement moved={city.moved} /> : null}
        </View>
        <Text maxFontSizeMultiplier={TextScale.CHROME} numberOfLines={1} style={[styles.sub, mine && styles.subMine]}>{sub}</Text>
      </View>
      <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.value, podium && styles.valuePodium, mine && styles.valueMine]}>{value}</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1 },
  moments: { gap: 6, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  moment: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  momentText: { ...typography.body, ...font('500'), color: colors.text, flexShrink: 1 },
  momentWhen: { ...typography.small, color: colors.textFaint, marginLeft: 'auto', paddingLeft: spacing.sm },
  tableHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  headCount: { ...typography.small, color: colors.textFaint, paddingBottom: 10 },
  sorts: { flexDirection: 'row', gap: spacing.lg },
  sort: { alignItems: 'center', paddingTop: 8, minHeight: 40, justifyContent: 'flex-end' },
  sortText: { ...typography.small, ...font('500'), color: colors.textFaint, paddingBottom: 7 },
  sortOn: { ...font('700'), color: colors.text },
  sortBar: { height: 2.5, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'transparent', marginBottom: -1.5 },
  sortBarOn: { backgroundColor: colors.brand },
  // The head row: under the tabs' line, close over the first row (whose coin has room of its own above it).
  boardHead: { paddingTop: 10, paddingBottom: 7 },
  list: {},
  // Behind the pinned head only: the page's colour, out over the 16-point gutters, so nothing passing under shows;
  // a hairline along its foot as wide as the rows' (the tabs' line above is the same width), where the list goes under.
  pinBand: { position: 'absolute', top: 0, bottom: 0, left: -spacing.lg, right: -spacing.lg, overflow: 'hidden', backgroundColor: colors.bg },
  pinLine: { position: 'absolute', bottom: 0, left: spacing.lg, right: spacing.lg, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  pinSpot: { zIndex: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowMine: { backgroundColor: colors.brandDim, borderRadius: corner(14) },
  // The place: big, heavy and tabular, a standings table's first column.
  // The place's column: a podium coin's width, every numeral centred under the coins; it gives back the
  // two points it grew by (from 38), so the names start where they did and their lines still fit.
  rankCol: { width: RANK_W, marginRight: RANK_SHIFT, alignItems: 'center' },
  rank: { ...font('700'), fontSize: 26, letterSpacing: -1, textAlign: 'center', fontVariant: ['tabular-nums'], color: colors.text },
  rankPodium: { fontSize: 34, letterSpacing: -1.4, color: colors.text },
  rankLow: { color: colors.textFaint },
  rankMine: { color: colors.brand },
  nameCol: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...font('600'), fontSize: 17, letterSpacing: -0.2, color: colors.text, flexShrink: 1 },
  namePodium: { fontSize: 18 },
  nameMine: { color: colors.brand },
  sub: { ...typography.small, color: colors.textFaint },
  subMine: { ...typography.small, ...font('500'), color: colors.text },
  value: { ...font('700'), fontSize: 17, color: colors.text, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  valuePodium: { fontSize: 19 },
  valueMine: { color: colors.brand },
  // Under 3rd: the podium's edge.
  cut: { height: CUT_H, justifyContent: 'center' },
  cutLine: { height: 1, backgroundColor: colors.text, opacity: 0.7, marginHorizontal: spacing.md },
  after: { paddingTop: spacing.lg, gap: spacing.lg },
  unranked: { ...typography.small, color: colors.textMuted, paddingHorizontal: spacing.md },
  climb: { alignItems: 'center', gap: 4, paddingTop: spacing.lg },
  climbHead: { ...typography.heading, color: colors.text, textAlign: 'center' },
  climbBody: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  climbButton: { alignSelf: 'stretch', marginTop: spacing.md, maxWidth: 440, width: '100%', marginHorizontal: 'auto' },
  fine: { ...typography.small, color: colors.textFaint, lineHeight: 19, textAlign: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + YOU_H },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: DOCK_PAD, paddingHorizontal: spacing.lg, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
