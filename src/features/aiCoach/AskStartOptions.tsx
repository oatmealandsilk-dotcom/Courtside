import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useThemedStyles } from '@/theme/ThemeProvider';
import { PRESS_DIM } from '@/theme/press';
import { colors, spacing, typography } from '@/theme';
import { duration, formatDate } from '@/lib/format';
import { playStyleLabel } from '@/lib/badges';
import type { PlayerProfile, TrainingDay, TrainingPlan } from '@/data/types';

/**
 * DESIGN OPTIONS ONLY (Nov 3 sweep, U19): what the AI coach's Ask side shows
 * before the first question. Shown on the web demo with ?var=ai-coach-ask:A…D;
 * without it (and always on a phone) the page is today's. Nothing here sends
 * anything or changes what the coach is told.
 */

/** Today's day in the week the coach wrote (the plan's days run Monday to Sunday). */
export function todayInPlan(plan: TrainingPlan, now = new Date()): TrainingDay | undefined {
  return plan.days.find((d) => d.dayIndex === (now.getDay() + 6) % 7);
}

/** A day's main work: its longest block, as the week strip and the morning reminder name it. */
function mainBlock(day: TrainingDay) {
  if (!day.blocks.length) return null;
  return day.blocks.reduce((best, b) => (b.minutes > best.minutes ? b : best), day.blocks[0]);
}

function dayMinutes(day: TrainingDay) {
  return day.blocks.reduce((sum, b) => sum + b.minutes, 0);
}

/** A: today's session from his own week, under the box, with a plain way to ask about it. */
export function AskToday({ plan, onAsk, onWeek }: { plan: TrainingPlan; onAsk: (text: string) => void; onWeek: () => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const day = todayInPlan(plan);
  if (!day) return null;
  const main = mainBlock(day);
  const title = day.restDay ? 'Rest day' : main?.title ?? 'Training';
  return (
    <View style={styles.block}>
      <Text style={styles.caption}>Today · {day.label}</Text>
      <View style={styles.todayHead}>
        <Text style={styles.todayTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.todayMinutes}>{duration(dayMinutes(day))}</Text>
      </View>
      {day.blocks.map((b) => (
        <View key={b.id} style={styles.row}>
          <Text style={styles.rowText} numberOfLines={1}>{b.title}</Text>
          <Text style={styles.rowMeta}>{duration(b.minutes)}</Text>
        </View>
      ))}
      <View style={styles.links}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onAsk(day.restDay ? 'What should I do on my rest day?' : `How should I approach today’s ${title.toLowerCase()}?`)} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
          <Text style={styles.link}>Ask about today</Text>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={onWeek} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
          <Text style={styles.linkQuiet}>See the week</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** B: what the coach goes on, in plain rows, with the way to change it. */
export function AskKnows({ profile, recovery, tracker }: { profile: PlayerProfile; recovery?: number; tracker: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  const limits = profile.constraints.filter((c) => c.active).map((c) => c.label);
  const goal = profile.goals.find((g) => !g.done)?.label;
  const next = profile.tournaments[0];
  const rows: [string, string][] = [
    ['Level', `${profile.skillSystem} ${profile.rating}`],
    ['Style', `${playStyleLabel[profile.playStyle]}, ${profile.handedness}-handed`],
    ['Goal', goal ?? 'None set'],
    ['Working around', limits.length ? limits.join(', ') : 'Nothing set'],
    ['Recovery', recovery !== undefined ? `${recovery}%, 3-day average` : tracker ? 'Tracker connected, no recent numbers' : 'No tracker connected'],
    ...(next ? [['Next event', `${next.name}, ${formatDate(next.startsAt)}`] as [string, string]] : []),
  ];
  return (
    <View style={styles.block}>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>What it knows</Text>
        <Pressable accessibilityRole="link" accessibilityLabel="Edit what the coach knows" hitSlop={8} onPress={() => router.push('/profile-details')} style={({ pressed }) => pressed && { opacity: PRESS_DIM }}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** C: a few questions worth asking, written from his own week, as plain rows that fill the box. */
export function AskAbout({ plan, profile, onPick }: { plan: TrainingPlan; profile: PlayerProfile; onPick: (text: string) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const day = todayInPlan(plan);
  const main = day && !day.restDay ? mainBlock(day) : null;
  const focus = plan.focusAreas[0];
  const limit = profile.constraints.find((c) => c.active)?.label;
  const questions = [
    main ? `How should I approach today’s ${main.title.toLowerCase()}?` : 'What should I do on my rest day?',
    focus ? `A drill for ${focus.toLowerCase()} I can do alone?` : 'How can I improve my serve?',
    limit ? `How do I train around ${limit.toLowerCase()}?` : 'Help me plan a lighter session',
    'What should I eat before a match?',
  ];
  return (
    <View style={styles.blockTight}>
      <Text style={[styles.caption, { paddingBottom: spacing.xs }]}>Ask about</Text>
      {questions.map((q) => (
        <Pressable key={q} accessibilityRole="button" accessibilityLabel={`Ask: ${q}`} onPress={() => onPick(q)} style={({ pressed }) => [styles.qRow, pressed && { opacity: PRESS_DIM }]}>
          <Text style={styles.qText} numberOfLines={2}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** D: the opening line, written by the app from today's plan (not by the AI), so the talk has already started. */
export function openingLine(plan: TrainingPlan, firstName: string) {
  const day = todayInPlan(plan);
  const main = day && !day.restDay ? mainBlock(day) : null;
  if (!day) return `Hi ${firstName}. Ask me anything about your game.`;
  if (!main) return `Hi ${firstName}. Today is a rest day in your week: an easy walk and some mobility. Want ideas for it, or something else on your game?`;
  return `Hi ${firstName}. Today is ${main.title.toLowerCase()}, ${duration(dayMinutes(day))} in all. Want a warm-up for it, or something else on your game?`;
}

const styleDefinitions = StyleSheet.create({
  block: { gap: spacing.sm, marginTop: spacing.lg },
  blockTight: { marginTop: spacing.sm },
  caption: { ...typography.small, color: colors.textMuted },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingBottom: spacing.xs },
  todayTitle: { ...typography.heading, color: colors.text, flex: 1 },
  todayMinutes: { ...typography.small, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, paddingVertical: spacing.sm + 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { ...typography.body, color: colors.text, flex: 1 },
  rowMeta: { ...typography.small, color: colors.textFaint },
  rowLabel: { ...typography.small, color: colors.textMuted, width: 112 },
  rowValue: { ...typography.body, color: colors.text, flex: 1 },
  links: { flexDirection: 'row', gap: spacing.xl, paddingTop: spacing.sm },
  link: { ...typography.smallStrong, color: colors.brand },
  linkQuiet: { ...typography.smallStrong, color: colors.textMuted },
  qRow: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  qText: { ...typography.body, color: colors.text },
});
