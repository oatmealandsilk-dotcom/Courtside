import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CourtSpinner } from '@/components/CourtSpinner';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Chip, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { TipComposer } from '@/components/TipComposer';
import { askAiCoach, fetchAiPlan, type AiCoachReply, type CoachOption } from '@/data/api';
import { generatePlan } from '@/features/aiCoach/planGenerator';
import { useAiCoachLive, useAiCoachOn } from '@/features/aiCoach/switch';
import { duration, formatDate } from '@/lib/format';
import { healthSignal } from '@/lib/integrations';
import { useApp } from '@/store/AppContext';
import type { AiMessage, PlayerProfile, TrainingBlockKind, TrainingPlan } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

const BLOCK_META: Record<TrainingBlockKind, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  'on-court': { icon: 'tennisball-outline', tint: colors.brand },
  fitness: { icon: 'barbell-outline', tint: colors.court },
  recovery: { icon: 'moon-outline', tint: colors.hard },
  'match-play': { icon: 'trophy-outline', tint: colors.warning },
  mental: { icon: 'bulb-outline', tint: colors.textMuted },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A short fingerprint of the profile, so the coach writes a new week only when something about you changed. */
function fingerprint(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** What the coach is told about you: the profile, and recovery when a wearable is connected. */
function aboutYou(p: PlayerProfile, signal: ReturnType<typeof healthSignal>) {
  return [
    `Rating: ${p.skillSystem} ${p.rating}. Style: ${p.playStyle}, ${p.handedness}-handed, ${p.backhand} backhand. Prefers ${p.preferredSurface}. Fitness: ${p.fitnessLevel}. ${p.sessionsPerWeek} sessions a week, ${p.yearsPlaying} years playing.`,
    `Goals: ${p.goals.map((g) => g.label).join('; ') || 'none set'}.`,
    `Injury and schedule notes: ${p.constraints.filter((c) => c.active).map((c) => `${c.kind}: ${c.label}`).join('; ') || 'none'}.`,
    p.tournaments[0] ? `Next tournament: ${p.tournaments[0].name} on ${formatDate(p.tournaments[0].startsAt)}.` : 'No tournament scheduled.',
    signal.recovery !== undefined ? `Recovery ${signal.recovery}% (3-day avg)${signal.sleepHours !== undefined ? `, sleep ${signal.sleepHours}h` : ''}${signal.hrvMs !== undefined ? `, HRV ${signal.hrvMs}ms` : ''}.` : 'No wearable connected.',
  ].join('\n');
}

/**
 * The address on its own opens nothing while the coach is switched off: the
 * coach turns on for everyone once its key is added on the server.
 */
export default function AiCoachRoute() {
  const on = useAiCoachOn();
  if (on === undefined) {
    return <Screen title="AI Coach" compactTitle onBack={() => goBack()}><View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View></Screen>;
  }
  if (!on) {
    return (
      <Screen title="AI Coach" compactTitle onBack={() => goBack()}>
        <EmptyState icon="sparkles-outline" title="AI coach is coming soon" body="A weekly plan, and a coach to ask about your game." />
      </Screen>
    );
  }
  return <Train />;
}

type Line = AiMessage & { handoff?: AiCoachReply['handoff'] };

/**
 * The AI coach: ask it about your game, or open the week it wrote for you.
 * Replies come from the model through the server, with memory of earlier
 * conversations; the week is written once and kept until your profile
 * changes. Calm surfaces, no borders, the way the rest of the app reads.
 */
function Train() {
  const styles = useThemedStyles(styleDefinitions);
  const live = useAiCoachLive();
  const { currentUser, healthHistory, integrations, coaches, users } = useApp();
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [section, setSection] = useState<'ask' | 'plan'>('ask');
  const [draft, setDraft] = useState<{ text: string; n: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [lines, setLines] = useState<Line[]>([]);

  const signal = useMemo(() => healthSignal(healthHistory, integrations), [healthHistory, integrations]);
  const about = currentUser ? aboutYou(currentUser.profile, signal) : '';
  const standIn = useMemo(() => (currentUser ? generatePlan({ profile: currentUser.profile, health: healthHistory }) : null), [currentUser, healthHistory]);

  // The week the coach wrote: asked for once per profile, kept by the server for the week.
  const [written, setWritten] = useState<TrainingPlan | null | undefined>(live ? undefined : null);
  const asked = useRef('');
  useEffect(() => {
    if (!live || !about) return;
    const hash = fingerprint(about);
    if (asked.current === hash) return;
    asked.current = hash;
    setWritten(undefined);
    void fetchAiPlan(about, hash).then(setWritten).catch(() => setWritten(null));
  }, [live, about]);
  const plan = written ?? standIn;

  // Coaches the AI may suggest when a person would help more: real ones only.
  const options: CoachOption[] = coaches
    .filter((c) => UUID.test(c.id) && c.services.length)
    .map((c) => ({ id: c.id, name: users.find((u) => u.id === c.userId)?.name ?? 'Coach', specialties: c.specialties, fromCents: Math.min(...c.services.map((s) => s.priceCents)) }));

  if (!currentUser || !plan) {
    return <Screen title="AI Coach" compactTitle onBack={() => goBack()}><View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View></Screen>;
  }

  const ask = async (text: string) => {
    setError('');
    setLines((prev) => [...prev, { id: `m-${Date.now()}`, role: 'user', body: text, createdAt: new Date().toISOString() }]);
    setThinking(true);
    const context = `${about}\nThis week's plan: ${plan.headline}. ${plan.summary} Days: ${plan.days.map((d) => `${d.label} ${d.restDay ? 'rest' : d.blocks.map((b) => b.title).join(' + ')}`).join('; ')}.`;
    const started = Date.now();
    try {
      const answer = await askAiCoach(text, context, options, live);
      // A reply that lands instantly reads as canned, even when it is not.
      await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
      setLines((prev) => [...prev, { id: `m-${Date.now()}-r`, role: 'coach', body: answer.reply, createdAt: new Date().toISOString(), handoff: answer.handoff }]);
      if (typeof answer.remaining === 'number') setRemaining(answer.remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The coach is unavailable right now. Try again in a minute.');
    } finally {
      setThinking(false);
    }
  };

  const totalMinutes = plan.days.flatMap((d) => d.blocks).reduce((sum, b) => sum + b.minutes, 0);
  const onCourtDays = plan.days.filter((d) => !d.restDay).length;

  return (
    <Screen title="AI Coach" compactTitle onBack={() => goBack()}>
      <SegmentedControl segments={[{ value: 'ask', label: 'Ask' }, { value: 'plan', label: 'This week' }]} value={section} onChange={setSection} />

      {section === 'ask' ? (
        <View style={styles.section}>
          {!lines.length ? (
            <View style={styles.intro}>
              <Text style={styles.lead}>Ask about your next session, a shot, or recovery. It answers from your profile and this week’s plan, and remembers what you talk about.</Text>
              <View style={styles.chips}>
                {['What should I work on today?', 'How can I improve my serve?', 'Help me plan a lighter session'].map((text) => (
                  <Chip key={text} label={text} onPress={() => setDraft({ text, n: Date.now() })} />
                ))}
              </View>
            </View>
          ) : null}

          {lines.map((m) => (
            <View key={m.id} style={styles.lineWrap}>
              <View style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
                <Text style={styles.bubbleText}>{m.body}</Text>
              </View>
              {m.handoff ? <Handoff coachId={m.handoff.coachId} line={m.handoff.line} /> : null}
            </View>
          ))}
          {thinking ? <View style={[styles.bubble, styles.theirs]}><ThinkingDots /></View> : null}
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

          <TipComposer
            key={draft?.n ?? 0}
            initial={draft?.text}
            placeholder="What would you like help with?"
            onSubmit={(text) => { void ask(text); }}
          />
          <View style={styles.footRow}>
            <Text style={styles.fine}>{remaining !== undefined && remaining < 20 ? `${remaining} ${remaining === 1 ? 'question' : 'questions'} left today · ` : ''}General training information, not medical advice.</Text>
            {live ? (
              <Pressable accessibilityRole="link" onPress={() => router.push('/coach-memory')} hitSlop={8}>
                <Text style={styles.link}>What it remembers</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : written === undefined ? (
        <View style={styles.writing}>
          <CourtSpinner size={28} />
          <Text style={styles.writingTitle}>Writing your week</Text>
          <Text style={styles.writingBody}>The first one takes up to a minute. After that it opens straight away, and a new one is written when your profile changes.</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.weekOf}>Week of {formatDate(plan.weekOf)}{written ? '' : live ? ' · a simpler plan, the coach could not be reached' : ''}</Text>
            <Text style={styles.headline}>{plan.headline}</Text>
            <Text style={styles.summary}>{plan.summary}</Text>
            <View style={styles.tileRow}>
              <Stat label="Sessions" value={String(onCourtDays)} hint="this week" />
              <Stat label="Volume" value={duration(totalMinutes)} hint="planned" />
              <Pressable accessibilityRole="link" accessibilityLabel="Recovery and health" onPress={() => router.push('/health')} style={styles.statPress}>
                <Stat
                  label="Recovery"
                  value={signal.recovery !== undefined ? `${signal.recovery}%` : '—'}
                  hint={signal.recovery !== undefined ? '3-day avg' : 'no wearable'}
                  tint={signal.recovery !== undefined && signal.recovery < 65 ? colors.warning : undefined}
                />
              </Pressable>
            </View>
            {plan.focusAreas.length ? (
              <View style={styles.chips}>{plan.focusAreas.map((f) => <Chip key={f} label={f} small />)}</View>
            ) : null}
          </View>

          {plan.cautions.length > 0 ? (
            <View style={styles.cautionCard}>
              <View style={styles.cautionHead}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.cautionTitle}>Working around</Text>
              </View>
              {plan.cautions.map((c) => <Text key={c} style={styles.caution}>{c}</Text>)}
            </View>
          ) : null}

          <View style={styles.section}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nativeID="week-strip" contentContainerStyle={styles.week} style={{ marginHorizontal: -spacing.lg }}>
              {plan.days.map((day) => {
                const open = openDay === day.dayIndex;
                const dayMinutes = day.blocks.reduce((sum, b) => sum + b.minutes, 0);
                const main = day.restDay ? null : day.blocks.find((b) => b.kind === 'on-court') ?? day.blocks[0];
                const meta = main ? BLOCK_META[main.kind] : null;
                return (
                  <Pressable
                    key={day.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: open }}
                    accessibilityLabel={`${day.label}: ${day.restDay ? 'rest' : main?.title}`}
                    onPress={() => setOpenDay(open ? null : day.dayIndex)}
                    style={[styles.dayCol, open && styles.dayColOpen, day.restDay && styles.dayColRest]}
                  >
                    <Text style={[styles.dayColLabel, open && { color: colors.brand }]}>{day.label.slice(0, 3)}</Text>
                    <Ionicons name={meta ? meta.icon : 'moon-outline'} size={18} color={meta ? meta.tint : colors.textFaint} />
                    <Text numberOfLines={2} style={styles.dayColTitle}>{day.restDay ? 'Rest' : main?.title}</Text>
                    <Text style={styles.dayColMinutes}>{day.restDay ? '—' : duration(dayMinutes)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {plan.days.filter((d) => d.dayIndex === openDay).map((day) => (
              <View key={day.id} style={styles.dayCard}>
                <View style={styles.dayHead}>
                  <Text style={styles.dayTitle}>{day.label}</Text>
                  <Text style={styles.dayMinutes}>{day.restDay ? 'Recovery day' : duration(day.blocks.reduce((sum, b) => sum + b.minutes, 0))}</Text>
                </View>
                {day.blocks.map((block) => {
                  const meta = BLOCK_META[block.kind];
                  return (
                    <View key={block.id} style={styles.block}>
                      <View style={styles.blockHead}>
                        <Ionicons name={meta.icon} size={15} color={meta.tint} />
                        <Text style={styles.blockTitle}>{block.title}</Text>
                        <Text style={styles.blockMinutes}>{duration(block.minutes)}</Text>
                      </View>
                      {block.detail.map((d) => <Text key={d} style={styles.blockDetail}>• {d}</Text>)}
                      <Text style={styles.rationale}>{block.rationale}</Text>
                    </View>
                  );
                })}
                {day.restDay && !day.blocks.length ? <Text style={styles.blockDetail}>Nothing scheduled. Sleep, eat, walk.</Text> : null}
              </View>
            ))}
            {openDay === null ? <Text style={styles.fine}>Tap a day to see the session.</Text> : null}
          </View>
        </>
      )}
    </Screen>
  );
}

/** One figure in the week's summary: no box, just the number and what it is. */
function Stat({ label, value, hint, tint }: { label: string; value: string; hint: string; tint?: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tint ? { color: tint } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statHint} numberOfLines={1}>{hint}</Text>
    </View>
  );
}

/** The coach's suggestion to take this to a person, with the way to them. */
function Handoff({ coachId, line }: { coachId: string; line: string }) {
  const styles = useThemedStyles(styleDefinitions);
  const { coaches, users } = useApp();
  const coach = coaches.find((c) => c.id === coachId);
  const user = users.find((u) => u.id === coach?.userId);
  if (!coach) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/coach/${coach.id}`)} style={({ pressed }) => [styles.handoff, pressed && { opacity: 0.8 }]}>
      <Avatar name={user?.name ?? 'Coach'} seed={coach.id} uri={user?.avatarUrl} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.handoffName}>{user?.name ?? 'A coach'}</Text>
        <Text style={styles.handoffLine}>{line}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

/** Three dots that rise in turn — the coach reading before answering. */
function ThinkingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 260, useNativeDriver: true }),
          Animated.delay(480 - i * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
      <Text style={{ ...typography.small, color: colors.textFaint, marginLeft: 4 }}>Coach is thinking</Text>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  section: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  intro: { gap: spacing.md },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lineWrap: { gap: spacing.sm },
  bubble: { borderRadius: 18, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brandDim },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleText: { ...typography.body, color: colors.text, lineHeight: 22 },
  handoff: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, maxWidth: '88%' },
  handoffName: { ...typography.smallStrong, color: colors.text },
  handoffLine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  error: { ...typography.small, color: colors.danger },
  footRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  fine: { flex: 1, ...typography.caption, color: colors.textFaint, lineHeight: 17 },
  link: { ...typography.smallStrong, color: colors.brand },
  writing: { alignItems: 'center', gap: spacing.sm, paddingVertical: 56, paddingHorizontal: spacing.xl },
  writingTitle: { ...typography.heading, color: colors.text, marginTop: spacing.md },
  writingBody: { ...typography.small, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
  // The week, on one quiet surface: no border, a shade off the page.
  summaryCard: { gap: spacing.md, marginTop: spacing.lg, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  weekOf: { ...typography.small, color: colors.textMuted },
  headline: { ...typography.title, color: colors.text },
  summary: { ...typography.body, color: colors.text, lineHeight: 22 },
  tileRow: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  statPress: { flex: 1, minWidth: 0 },
  stat: { flex: 1, minWidth: 0, gap: 1 },
  statLabel: { ...typography.small, color: colors.textMuted },
  statValue: { ...typography.title, color: colors.text },
  statHint: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  cautionCard: { gap: spacing.sm, marginTop: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: `${colors.warning}14` },
  cautionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cautionTitle: { ...typography.smallStrong, color: colors.warning },
  caution: { ...typography.small, color: colors.text, lineHeight: 20 },
  week: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 2 },
  dayCol: { width: 92, gap: 8, padding: spacing.md, borderRadius: 18, backgroundColor: colors.surface },
  dayColOpen: { backgroundColor: colors.brandDim },
  dayColRest: { backgroundColor: colors.bgElevated },
  dayColLabel: { ...typography.smallStrong, color: colors.textMuted },
  dayColTitle: { ...typography.smallStrong, color: colors.text, lineHeight: 17, minHeight: 34 },
  dayColMinutes: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  dayCard: { gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dayTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  dayMinutes: { ...typography.small, color: colors.textFaint },
  block: { gap: 3 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockTitle: { ...typography.smallStrong, color: colors.text, flex: 1 },
  blockMinutes: { ...typography.caption, color: colors.textFaint },
  blockDetail: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  rationale: { ...typography.small, color: colors.textFaint, fontStyle: 'italic', lineHeight: 19, paddingTop: 2 },
});
