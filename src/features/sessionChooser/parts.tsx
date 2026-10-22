import { brandBoxShadow } from '@/theme/fillMode';
import { PRESS_DIM, PRESS_SHRINK } from '@/theme/press';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { LiveDot } from '@/components/LiveDot';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { CardWash, cardLook } from '@/components/session/SessionCard';
import { Duration } from '@/components/session/Duration';
import { BrandWash } from '@/components/ui';
import type { DetectedActivity } from '@/data/types';
import { activityTitle, activityWhen, spokenDuration } from '@/features/activity/format';
import { pickSource } from '@/features/activity/recent';
import { formatDistance, isTennisActivity, workoutIcon } from '@/features/activity/workouts';
import type { CalendarDay } from '@/features/sessionChooser/useSessionChoices';
import { duration } from '@/lib/format';
import { useTheme, useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, lift, radius, spacing, typography, withAlpha } from '@/theme';
import { TextScale } from '@/theme/textScale';

/*
 * The pieces the Session sheet is built from (+ → Session, app/new-session.tsx),
 * in the app's own language: the session box's cream with its shirt fade and the
 * court's faint lines (SessionCard), its big green figures, white rows on the
 * soft lift, and green kept for the things to press.
 */

/** "Tennis", "Run · 3.1 mi": what a tracker's session was, as the log list says it. */
export function waitingTitle(x: DetectedActivity): string {
  const far = isTennisActivity(x) ? null : formatDistance(x.distanceM);
  return far ? `${activityTitle(x)} · ${far}` : activityTitle(x);
}

/** When a tracker's session started, short enough for one line on a small phone: "11:47 am" (today's needs no "Today"), "Yesterday 6:04 pm", "Mon 12 Oct 7:02 am". */
export function startedWords(x: Pick<DetectedActivity, 'startedAt' | 'endedAt'>): string {
  const start = new Date(x.startedAt);
  const day = activityWhen(x, new Date(), '|').split('|')[0];
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?([AP]M)$/i, (_, m: string) => ` ${m.toLowerCase()}`);
  return day === 'Today' ? time : `${day} ${time}`;
}

/** The words a screen reader says for a tracker's session, the same as today's list ("Log it: Tennis, 1h 24m, WHOOP, Today, …"). */
export const waitingLabel = (x: DetectedActivity) => `Log it: ${activityTitle(x)}, ${duration(x.minutes)}, ${pickSource({ type: 'tracker', activity: x })}, ${activityWhen(x)}`;

/**
 * "Start a session" as the session box itself: the cream card with its fade,
 * a green dot breathing beside the words (still for anyone who has asked for
 * less motion: LiveDot), the clock at rest in the card's ink, your usual
 * court under it, and a round green Start. The clock is a size down and not
 * green, so the week strip's time above it stays the one big green number
 * and the round Start is the thing to press. The whole card is the button:
 * it opens Start a session (court, Practice or Match, then Start), as
 * Start now did.
 */
export function StartHero({ court, onPress }: { court: { name: string; why: string } | null; onPress: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const look = cardLook(theme);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Start a session${court ? ` at ${court.name}` : ''}. A timer, from Start to Finish`}
      onPress={onPress}
      style={({ pressed }) => [styles.hero, { backgroundColor: look.fill, borderColor: look.border }, pressed && styles.pressedCard]}
    >
      <CardWash look={look} radius={24} />
      <View style={styles.heroTop}>
        <LiveDot size={8} color={look.figure} />
        <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.eyebrow, { color: look.eyebrow }]}>START A SESSION</Text>
      </View>
      <View style={styles.heroMiddle}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.clock, { color: look.ink }]} maxFontSizeMultiplier={1.2}>0:00:00</Text>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.heroNote, { color: look.muted }]} numberOfLines={1}>The clock runs from Start to Finish.</Text>
        </View>
        <View style={[styles.go, { boxShadow: brandBoxShadow }]}>
          <BrandWash radius={30} />
          <Ionicons name="play" size={26} color={colors.brandInk} style={styles.goIcon} />
        </View>
      </View>
      <View style={[styles.heroFoot, { borderTopColor: look.lines }]}>
        <CourtGlyph size={15} color={look.figure} />
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.heroCourt, { color: look.ink }]} numberOfLines={1}>{court ? court.name : 'Pick your court as you start'}</Text>
        {court ? <Text maxFontSizeMultiplier={TextScale.TITLE} style={[styles.heroWhy, { color: look.muted }]} numberOfLines={1}>{court.why}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * A tracker's session waiting to be logged: how long, big, with the
 * tracker's tag; what and when under it; and a green "Log it" that opens
 * its Log it page straight away (Post session, or Save privately).
 */
export function WaitingRow({ activity: x, onPress, first }: { activity: DetectedActivity; onPress: () => void; first?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={waitingLabel(x)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={isTennisActivity(x) ? 'tennisball-outline' : workoutIcon(x.sport)} size={20} color={colors.brand} />
      </View>
      <View style={styles.rowWords}>
        <View style={styles.rowHeroLine}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.rowHero}>{duration(x.minutes)}</Text>
          <View style={styles.tag}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.tagText} numberOfLines={1}>{pickSource({ type: 'tracker', activity: x })}</Text></View>
        </View>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.rowTitle} numberOfLines={1}>{`${waitingTitle(x)} · ${startedWords(x)}`}</Text>
      </View>
      <View style={styles.logIt}>
        <BrandWash radius={radius.pill} />
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.logItText}>Log it</Text>
      </View>
    </Pressable>
  );
}

/** The quieter way in: the by-hand log, straight to its form. */
export function ByHandRow({ onPress, note = 'Practice, a match or a workout.' }: { onPress: () => void; note?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Log one yourself" onPress={onPress} style={({ pressed }) => [styles.byHand, pressed && styles.pressed]}>
      <View style={styles.byHandIcon}><Ionicons name="add" size={20} color={colors.text} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.byHandTitle}>Log one yourself</Text>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.byHandNote} numberOfLines={1}>{note}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

/** A small head over a part of the page, with how many when it helps ("Waiting to log · 2"). */
export function PartHead({ title, count, hint }: { title: string; count?: number; hint?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.partHead}>
      <View style={styles.partTitleRow}>
        <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.partTitle} accessibilityRole="header">{title}</Text>
        {count ? <View style={styles.count}><Text maxFontSizeMultiplier={TextScale.CARD} style={styles.countText}>{count}</Text></View> : null}
      </View>
      {hint ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.partHint}>{hint}</Text> : null}
    </View>
  );
}

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The week strip at the top of the Session sheet (Oct 16, owner, after
 * seeing the looks side by side: "do a with week strip"): your This week,
 * laid straight on the sheet rather than in a box of its own, so it reads as your week and the Start
 * card under it stays the one thing to press. Your time on court this week
 * is the one big green number; the streak badge sits beside "This week"
 * from Day 2 on (as on your profile and Your sessions); under them, Monday
 * to Sunday, the days you played ticked, today still to play a solid ring
 * with a breathing dot, and the days still to come small soft dots.
 *
 * The week is Monday to Sunday and its time is worked out as Your sessions'
 * This week card and the Weekly recap do (useSessionChoices' week),
 * so the two never disagree. Tennis only, as there: a run fills no day.
 * A brand-new week says "Your week starts here" instead of a row of rings.
 * A screen reader hears it as one line, not eleven stops.
 */
export function WeekStrip({ minutes, streak, days }: { minutes: number; streak: number; days: CalendarDay[] }) {
  const styles = useThemedStyles(styleDefinitions);
  const { theme } = useTheme();
  const look = cardLook(theme);
  // On the sheet's own ground, not in the box: the green-box court (Clean) takes the page's colours, every other court its box's.
  const figure = look.filled ? colors.brand : look.figure;
  const ink = look.filled ? colors.text : look.ink;
  const muted = look.filled ? colors.textMuted : look.muted;
  const eyebrow = look.filled ? colors.brand : look.eyebrow;
  const played = days.filter((d) => d.minutes > 0).length;
  const todayOn = days.some((d) => d.today && d.minutes > 0);
  const shownStreak = streak >= 2 ? streak : 0;
  const spoken = `This week: ${minutes > 0 ? `${spokenDuration(minutes)} on court, ${played} ${played === 1 ? 'day' : 'days'} played` : 'nothing on court yet'}${shownStreak ? `, day ${shownStreak} streak` : ''}. Today ${todayOn ? 'played' : 'not played yet'}.`;
  return (
    <View style={styles.strip} accessible accessibilityRole="summary" accessibilityLabel={spoken}>
      <View style={styles.stripInner} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.stripTop}>
          <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.eyebrow, { color: eyebrow }]}>THIS WEEK</Text>
          {shownStreak ? (
            <View style={[styles.streak, styles.streakStrip]}>
              <Ionicons name="flame" size={14} color={colors.clay} />
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.streakText}>{`Day ${shownStreak} streak`}</Text>
            </View>
          ) : null}
        </View>
        {minutes > 0 ? (
          <View style={styles.stripLine}>
            <Duration minutes={minutes} size={36} color={figure} unitColor={muted} play />
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.stripNote, styles.stripWords, { color: muted }]}>on court</Text>
          </View>
        ) : (
          <View style={styles.stripFresh}>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.stripFreshTitle, { color: figure }]}>{shownStreak ? 'Keep it going today' : 'Your week starts here'}</Text>
            <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.stripNote, { color: muted }]}>Play or log tennis today and it gets its tick.</Text>
          </View>
        )}
        <View style={[styles.dots, styles.stripDots]}>
          {days.map((d) => {
            const on = d.minutes > 0;
            // Today not yet played is the one to fill: a solid ring with a breathing dot.
            const invite = d.today && !on;
            // Days still to come, and the days gone of a week with nothing in it yet: small soft dots, not empty rings.
            const quiet = d.later || (played === 0 && !d.today);
            return (
              <View key={d.day} style={[styles.dotCol, styles.stripCol]}>
                <View style={[styles.dot, styles.stripDot, { borderColor: on || invite ? figure : quiet ? 'transparent' : withAlpha(figure, 0.24) }, on && { backgroundColor: figure }, invite && styles.stripInvite]}>
                  {on ? <Ionicons name="checkmark" size={13} color={colors.brandInk} /> : invite ? <LiveDot size={8} color={figure} /> : quiet ? <View style={[styles.stripQuiet, { backgroundColor: withAlpha(figure, 0.22) }]} /> : null}
                </View>
                <Text maxFontSizeMultiplier={TextScale.CHROME} style={[styles.dotLetter, styles.stripLetter, { color: d.today ? ink : muted }, d.today && styles.dotLetterToday]}>{d.today ? 'Today' : DAY_LETTER[new Date(`${d.day}T12:00:00`).getDay()]}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  pressedCard: { transform: [{ scale: PRESS_SHRINK }] },
  hero: { ...lift, borderRadius: 24, borderWidth: 1, padding: spacing.lg, paddingBottom: 14, gap: 10, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { ...font('600'), fontSize: 11, letterSpacing: 0.9 },
  heroMiddle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clock: { ...font('600'), fontSize: 30, lineHeight: 36, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  heroNote: { ...typography.small, marginTop: 2 },
  go: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  goIcon: { marginLeft: 4 },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  heroCourt: { ...font('600'), fontSize: 14, flexShrink: 1 },
  heroWhy: { ...typography.small, flexShrink: 0 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1, minWidth: 0, gap: 2 },
  rowHeroLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowHero: { fontSize: 21, lineHeight: 26, ...font('600'), letterSpacing: -0.5, color: colors.text, fontVariant: ['tabular-nums'] },
  tag: { flexShrink: 1, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  tagText: { fontSize: 11, lineHeight: 15, ...font('600'), letterSpacing: 0.2, color: colors.textMuted },
  rowTitle: { fontSize: 14, lineHeight: 19, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  logIt: { minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logItText: { ...font('600'), fontSize: 14, color: colors.brandInk },

  byHand: { ...lift, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14, paddingHorizontal: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  byHandIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  byHandTitle: { ...typography.bodyStrong, color: colors.text },
  byHandNote: { ...typography.small, color: colors.textMuted },

  partHead: { gap: 2, paddingHorizontal: 2 },
  partTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partTitle: { ...typography.heading, color: colors.text },
  partHint: { ...typography.small, color: colors.textMuted },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  countText: { ...font('700'), fontSize: 12, color: colors.brandInk },

  stripTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stripNote: { ...typography.small, marginTop: 2 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface },
  streakText: { ...font('600'), fontSize: 13, color: colors.text },
  dots: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  dotCol: { alignItems: 'center', gap: 6 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dotLetter: { ...font('500'), fontSize: 12 },
  dotLetterToday: { ...font('700') },
  // The week strip: on the sheet's own ground, sized for a sheet.
  strip: { paddingHorizontal: 2 },
  stripInner: { gap: 10 },
  streakStrip: { minHeight: 26, paddingHorizontal: 9, ...lift },
  stripLine: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  stripWords: { marginBottom: 6 },
  stripFresh: { gap: 2 },
  stripFreshTitle: { ...font('600'), fontSize: 22, lineHeight: 27, letterSpacing: -0.6 },
  stripDots: { paddingTop: 2 },
  stripCol: { gap: 4, minWidth: 34 },
  stripDot: { width: 28, height: 28, borderRadius: 14 },
  stripInvite: { borderWidth: 2 },
  stripQuiet: { width: 6, height: 6, borderRadius: 3 },
  stripLetter: { fontSize: 11 },
});
