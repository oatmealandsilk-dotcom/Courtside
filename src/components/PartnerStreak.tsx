import React, { type RefObject, useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/Avatar';
import { Collapse } from '@/components/ui/Collapse';
import { Box, Row, SectionHead } from '@/components/tennis/ProfileParts';
import type { ID, PartnerStreak } from '@/data/types';
import * as haptics from '@/lib/haptics';
import { useIsFocused } from '@/lib/useIsFocused';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, spacing, typography } from '@/theme';
import { LESS_AI, LESS_AI_ROUND2, corner } from '@/theme/look';

/*
 * Weekly streaks with hitting partners (sweep R12, Oct 20, owner: yes).
 * Like a friend streak, but by the week, because tennis is weekly: two
 * players on the same logged session (the tag accepted) at least once a
 * week, Monday to Sunday, keep it going. It shows only to the two of them,
 * on each other's profile beside Head to head and in their own Tennis
 * profile, and only while the teen rules let them see each other (the
 * server decides: my_partner_streaks, migration 180). A small celebration
 * at 4, 10 and 25 weeks, once.
 */

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Played together this week" or, while the week is open, the next week to make: an invitation, never a warning. */
const weekWords = (p: PartnerStreak) => (p.thisWeek ? 'You’ve played together this week' : `Hit together this week to make it ${p.weeks + 1}`);
/** The plain fact, for the hand-made look's rows (Oct 24): no nudge. */
const weekFact = (p: PartnerStreak) => (p.thisWeek ? 'Played together this week' : 'Not yet this week');

/**
 * The hand-made look (Oct 24): your streak with them as one muted line under
 * their follower counts, "🔥 2 weeks in a row with you". Nothing with no streak.
 * The streaks load after the profile has drawn, so the line opens with a
 * smooth height change rather than popping in and shoving the profile down.
 */
export function PartnerStreakLine({ userId, gap = 0, name, left = false }: {
  userId: ID;
  /** The page's own gap between its lines: the line carries it inside its fold, so while closed it takes no room at all. */
  gap?: number;
  /** Their name: the line then reads "🔥 2-week streak with Dev" (Oct 25, "D all for less ai", item 12). */
  name?: string;
  /** Set at the left, under a left-aligned profile's counts. */
  left?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const streaks = usePartnerStreaks();
  const p = streaks?.find((s) => s.userId === userId);
  const said = !p ? '' : name ? `${p.weeks}-week streak with ${firstOf(name)}` : `${p.weeks} ${p.weeks === 1 ? 'week' : 'weeks in a row'} with you`;
  return (
    <View style={[styles.lineFold, { marginTop: -gap }]}>
      <Collapse open={!!p} unclip>
        {p ? (
          <View style={{ paddingTop: gap }}>
            <Text style={[styles.line, left && styles.lineLeft]} accessibilityLabel={`Partner streak: ${said}`}>🔥 {said}</Text>
          </View>
        ) : null}
      </Collapse>
    </View>
  );
}

/**
 * Your streaks, asked for when shown and again whenever your tags change
 * (one accepted, taken off, a session's day moved).
 */
export function usePartnerStreaks(): PartnerStreak[] | null {
  const { actions, sessionTags, currentUserId, partnerStreaks } = useApp();
  const { loadPartnerStreaks } = actions;
  useEffect(() => { void loadPartnerStreaks().catch(() => undefined); }, [loadPartnerStreaks, sessionTags, currentUserId]);
  return partnerStreaks;
}

/**
 * Whether a view has been on screen: its page on top, the app open, and at
 * least half of it inside the window. Checked a few times a second while
 * there is something waiting to be seen (`watch`), and only then; once true
 * it stays true for that view.
 */
function useSeenOnScreen(ref: RefObject<View | null>, watch: boolean): boolean {
  const focused = useIsFocused();
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!watch || seen || !focused) return;
    let alive = true;
    const look = () => {
      const node = ref.current;
      if (!node || AppState.currentState !== 'active') return;
      node.measureInWindow((x, y, w, h) => {
        if (!alive || !(w > 0 && h > 0)) return;
        const win = Dimensions.get('window');
        const shownH = Math.min(y + h, win.height) - Math.max(y, 0);
        const shownW = Math.min(x + w, win.width) - Math.max(x, 0);
        if (shownH >= h / 2 && shownW >= w / 2) setSeen(true);
      });
    };
    look();
    const t = setInterval(look, 300);
    return () => { alive = false; clearInterval(t); };
  }, [ref, watch, seen, focused]);
  return seen;
}

/**
 * A milestone reached and not yet celebrated: it waits until the streak is
 * actually on screen (scrolled into view, its page on top), then plays (with
 * a light buzz), stays for as long as the card is up, and is told to the
 * server as seen only then, so it is never used up unseen and never shown
 * again for that run.
 */
function useCelebration(p: PartnerStreak | undefined, ref: RefObject<View | null>): number | null {
  const { actions } = useApp();
  const [showing, setShowing] = useState<number | null>(null);
  const [told, setTold] = useState<string | null>(null);
  const userId = p?.userId;
  const milestone = p?.celebrate ?? null;
  const key = userId && milestone ? `${userId}:${milestone}` : null;
  const onScreen = useSeenOnScreen(ref, !!key && told !== key);
  useEffect(() => {
    if (!userId || !milestone || !key || !onScreen || told === key) return;
    setTold(key);
    setShowing(milestone);
    actions.seenPartnerStreak(userId, milestone);
  }, [userId, milestone, key, onScreen, told, actions]);
  // The buzz on its own clock, so the redraw from setTold above can't cancel it (found in review).
  useEffect(() => {
    if (showing == null) return undefined;
    const t = setTimeout(() => haptics.reward(), 380);
    return () => clearTimeout(t);
  }, [showing]);
  return showing;
}

/** The flame (the same 🔥 as the reminder) in its round tile; on a milestone the tile turns green and the flame pops in with a few sparks. */
function Flame({ size = 40, celebrate = false }: { size?: number; celebrate?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const pop = useSharedValue(celebrate ? 0.4 : 1);
  const burst = useSharedValue(0);
  useEffect(() => {
    if (!celebrate) return;
    pop.value = withSequence(withSpring(1.22, { damping: 7, stiffness: 220 }), withSpring(1, { damping: 12, stiffness: 180 }));
    burst.value = withDelay(120, withTiming(1, { duration: 700 }));
  }, [celebrate, pop, burst]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const sparks = [0, 1, 2, 3, 4, 5];
  return (
    <View style={[styles.flameTile, { width: size, height: size, borderRadius: size / 2 }, celebrate && styles.flameTileOn]}>
      {celebrate ? sparks.map((i) => <Spark key={i} index={i} of={sparks.length} burst={burst} radius={size * 0.62} />) : null}
      <Animated.View style={flameStyle}>
        <Text style={{ fontSize: Math.round(size * 0.48), lineHeight: Math.round(size * 0.62) }} accessible={false}>🔥</Text>
      </Animated.View>
    </View>
  );
}

/** One spark of the celebration: out from the flame and gone. */
function Spark({ index, of, burst, radius }: { index: number; of: number; burst: SharedValue<number>; radius: number }) {
  const styles = useThemedStyles(styleDefinitions);
  const angle = (index / of) * Math.PI * 2 - Math.PI / 2;
  const style = useAnimatedStyle(() => {
    const t = burst.value;
    return {
      opacity: t <= 0 || t >= 1 ? 0 : 1 - t,
      transform: [{ translateX: Math.cos(angle) * radius * t }, { translateY: Math.sin(angle) * radius * t }, { scale: 1 - t * 0.5 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.spark, style]} />;
}

/**
 * On someone's profile, under Head to head: your streak with them, when you
 * have one. Nothing otherwise, and nothing on your own profile.
 */
export function PartnerStreakCard({ userId, name }: { userId: ID; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const streaks = usePartnerStreaks();
  const p = streaks?.find((s) => s.userId === userId);
  const box = useRef<View>(null);
  const party = useCelebration(p, box);
  // The streaks load after the page has drawn: the card opens with a smooth height
  // change rather than dropping in and shoving everything below it (Oct 22).
  // Under the hand-made look the streak is one line under their counts instead (PartnerStreakLine; item 12 for round 2).
  if (!p || LESS_AI || LESS_AI_ROUND2) return <Collapse open={false} unclip>{null}</Collapse>;
  const first = firstOf(name);
  const title = `${p.weeks}-week streak with ${first}`;
  const eyebrow = party ? `${party} weeks in a row!` : 'Partner streak';
  return (
    <Collapse open unclip>
    <View style={styles.cardGap}>
    <View
      ref={box}
      collapsable={false}
      style={[styles.card, party ? styles.cardOn : null]}
      accessible
      accessibilityLabel={`${party ? `New milestone, ${party} weeks in a row. ` : ''}${p.weeks}-week streak with ${first}. ${weekWords(p)}.`}
    >
      <Flame celebrate={!!party} />
      <View style={styles.words}>
        <Text style={[styles.eyebrow, party ? styles.eyebrowOn : null]} numberOfLines={1}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.sub} numberOfLines={2}>{weekWords(p)}</Text>
      </View>
    </View>
    </View>
    </Collapse>
  );
}

/**
 * In your Tennis profile (Activity): every streak you have going, longest
 * first, each opening that player's profile. Nothing while you have none.
 */
export function PartnerStreaksBox({ gap = 0 }: {
  /** The page's own gap between sections: the box carries it inside its fold, so while closed it takes no room at all. */
  gap?: number;
} = {}) {
  const streaks = usePartnerStreaks();
  const { users } = useApp();
  const rows = (streaks ?? []).filter((p) => users.some((u) => u.id === p.userId));
  // Loaded after the Tennis profile has drawn: it opens smoothly instead of dropping in (Oct 22).
  return (
    <View style={{ marginTop: -gap }}>
    <Collapse open={rows.length > 0} unclip>
      {rows.length ? (
        <View style={{ paddingTop: gap }}>
          {/* No count circle beside the heading (Oct 25, "D all for less ai", item 10). */}
          <SectionHead title="Partner streaks" count={rows.length > 1 && !LESS_AI_ROUND2 ? rows.length : undefined} />
          <Box>
            {rows.map((p, i) => <StreakRow key={p.userId} p={p} first={i === 0} />)}
          </Box>
        </View>
      ) : null}
    </Collapse>
    </View>
  );
}

function StreakRow({ p, first }: { p: PartnerStreak; first: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const { users } = useApp();
  const box = useRef<View>(null);
  const party = useCelebration(p, box);
  const u = users.find((x) => x.id === p.userId);
  if (!u) return null;
  const name = firstOf(u.name);
  return (
    <View ref={box} collapsable={false}>
      <Row
        first={first}
        lead={party ? <Flame size={40} celebrate /> : <Avatar name={u.name} seed={u.avatarSeed} uri={u.avatarUrl} size={40} />}
        title={
          <Text style={styles.rowTitle} numberOfLines={1}>
            {/* One flame a streak (item 10): on a milestone the lead is the flame, so the title goes without its own. */}
            {LESS_AI_ROUND2 && party ? null : <Text style={styles.rowFlame}>🔥 </Text>}{`${p.weeks}-week streak with ${name}`}
          </Text>
        }
        sub={
          <Text style={[styles.rowSub, party ? styles.rowSubOn : null]} numberOfLines={1}>
            {/* Plain words (item 10): "4 weeks in a row", and the plain fact otherwise, no nudge. */}
            {party ? (LESS_AI_ROUND2 ? `${party} weeks in a row` : `${party} weeks in a row! Keep it going`) : LESS_AI || LESS_AI_ROUND2 ? weekFact(p) : weekWords(p)}
          </Text>
        }
        chevron
        accessibilityRole="link"
        accessibilityLabel={`${party ? `New milestone, ${party} weeks in a row. ` : ''}${p.weeks}-week streak with ${name}. ${weekWords(p)}. Opens ${name}’s profile`}
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
      />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 16, borderRadius: corner(20), backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' },
  // The space under the card, inside the fold, so it opens and closes with it.
  cardGap: { paddingBottom: spacing.md },
  cardOn: { borderColor: colors.brand },
  words: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { ...typography.smallStrong, color: colors.textMuted },
  eyebrowOn: { color: colors.brand },
  title: { ...font('700'), fontSize: 18, letterSpacing: -0.2, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted },
  flameTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  flameTileOn: { backgroundColor: colors.brand },
  spark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  rowTitle: { ...font('600'), fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  rowFlame: { fontSize: 15 },
  rowSub: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  rowSubOn: { ...font('600'), color: colors.brand },
  line: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  lineLeft: { textAlign: 'left', marginTop: 0 },
  // The streak line's fold spans the page, so its words sit centred under the follower counts.
  lineFold: { alignSelf: 'stretch' },
});
