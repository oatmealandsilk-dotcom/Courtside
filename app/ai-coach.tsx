import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CourtSpinner } from '@/components/CourtSpinner';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Avatar, Chip, EmptyState, Screen, SegmentedControl, Toggle } from '@/components/ui';
import { TipComposer } from '@/components/TipComposer';
import { CourtGlyph } from '@/components/map/CourtGlyph';
import { askAiCoach, fetchAiPlan, type AiCoachReply, type CoachOption } from '@/data/api';
import { generatePlan } from '@/features/aiCoach/planGenerator';
import { useAiCoachLive, useAiCoachOn } from '@/features/aiCoach/switch';
import { useAiCoachConsent } from '@/features/aiCoach/consent';
import { usePaidBooking } from '@/features/coaching/bookings';
import { openLegal } from '@/lib/legal';
import { confirmReport } from '@/lib/confirm';
import { planRemindersSupported, readPlanReminders, schedulePlanReminders, setPlanReminders } from '@/features/aiCoach/planReminder';
import { show as showToast } from '@/lib/toast';
import { duration, formatDate, experienceLabel, hoursAndMinutes } from '@/lib/format';
import { healthSignal, withoutSource } from '@/lib/integrations';
import { useApp } from '@/store/AppContext';
import type { AiMessage, PlayerProfile, TrainingBlockKind, TrainingPlan } from '@/data/types';
import { colors, lift, spacing, typography } from '@/theme';

type BlockIconName = keyof typeof Ionicons.glyphMap | 'court';
// The tint is a palette slot, looked up when the week draws: read once at load,
// a colour would stay the light theme's (dark green on New York's navy).
const BLOCK_META: Record<TrainingBlockKind, { icon: BlockIconName; tint: keyof typeof colors }> = {
  'on-court': { icon: 'court', tint: 'brand' },
  fitness: { icon: 'barbell-outline', tint: 'court' },
  recovery: { icon: 'moon-outline', tint: 'hard' },
  'match-play': { icon: 'trophy-outline', tint: 'warning' },
  mental: { icon: 'bulb-outline', tint: 'textMuted' },
};
/**
 * A block's icon: time on court is the court, drawn the app's way; the rest are Ionicons.
 * Each sits in the same icon-sized square, so the titles beside them and the days under them line up.
 */
function BlockIcon({ icon, size, color }: { icon: BlockIconName; size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {icon === 'court' ? <CourtGlyph size={Math.round(size * 0.88)} color={color} /> : <Ionicons name={icon} size={size} color={color} />}
    </View>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A short fingerprint of the profile, so the coach writes a new week only when something about you changed. */
function fingerprint(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** The health line the coach is told: recovery, sleep and HRV, whichever another source than WHOOP gave. */
function healthLine(signal: ReturnType<typeof healthSignal>, whoop: boolean) {
  const sleep = signal.sleepHours !== undefined ? `sleep ${hoursAndMinutes(signal.sleepHours)}` : null;
  const hrv = signal.hrvMs !== undefined ? `HRV ${signal.hrvMs}ms` : null;
  if (signal.recovery !== undefined) return `Recovery ${signal.recovery}% (3-day avg)${sleep ? `, ${sleep}` : ''}${hrv ? `, ${hrv}` : ''}.`;
  if (sleep || hrv) { const s = [sleep, hrv].filter(Boolean).join(', '); return `${s[0].toUpperCase()}${s.slice(1)} (3-day avg).`; }
  if (whoop) return 'WHOOP is connected, but its numbers are not shared with the coach.';
  return signal.hasWearable ? 'No recent wearable numbers.' : 'No wearable connected.';
}

/** What the coach is told about you: the profile, and recovery when a wearable gave some. */
function aboutYou(p: PlayerProfile, signal: ReturnType<typeof healthSignal>, whoop: boolean) {
  return [
    `Rating: ${p.skillSystem} ${p.rating}. Style: ${p.playStyle}, ${p.handedness}-handed, ${p.backhand} backhand. Prefers ${p.preferredSurface}. Fitness: ${p.fitnessLevel}. ${p.sessionsPerWeek !== undefined ? `${p.sessionsPerWeek} sessions a week` : 'Sessions a week not given'}, ${p.yearsPlaying !== undefined ? `${experienceLabel(p.yearsPlaying)} playing` : 'years playing not given'}.`,
    `Goals: ${p.goals.map((g) => g.label).join('; ') || 'none set'}.`,
    `Injury and schedule notes: ${p.constraints.filter((c) => c.active).map((c) => `${c.kind}: ${c.label}`).join('; ') || 'none'}.`,
    p.tournaments[0] ? `Next tournament: ${p.tournaments[0].name} on ${formatDate(p.tournaments[0].startsAt)}.` : 'No tournament scheduled.',
    healthLine(signal, whoop),
  ].join('\n');
}

/**
 * The address on its own opens nothing while the coach is switched off: the
 * coach turns on for everyone once its key is added on the server.
 */
export default function AiCoachRoute() {
  const on = useAiCoachOn();
  const consent = useAiCoachConsent();
  const { currentUser } = useApp();
  const [later, setLater] = useState(false);
  if (on === undefined || (on && consent.agreed === undefined)) {
    return <Screen title="AI Coach" compactTitle onBack={() => goBack()}><View style={{ paddingVertical: 60, alignItems: 'center' }}><CourtSpinner size={28} /></View></Screen>;
  }
  if (!on) {
    return (
      <Screen title="AI Coach" compactTitle onBack={() => goBack()}>
        <EmptyState icon="sparkles-outline" title="AI coach is coming soon" body="A weekly plan, and a coach to ask about your game." />
      </Screen>
    );
  }
  // Before anything leaves the phone: a clear yes to sending it to Anthropic (Apple 5.1.2(i)
  // and 5.1.3). This comes before the week is asked for, which happens as soon as the coach opens.
  if (!consent.agreed) return <AiCoachConsent onAgree={consent.agree} />;
  // First time in: the coach asks what it needs (fitness, sessions, a goal,
  // a tournament), which joining no longer does. Skippable; it just plans less well.
  const p = currentUser?.profile;
  if (p && !later && p.goals.length === 0 && p.sessionsPerWeek === undefined) {
    return (
      <Screen title="AI Coach" compactTitle onBack={() => goBack()}>
        <View style={introStyles.card}>
          <View style={introStyles.mark}><Ionicons name="sparkles" size={20} color={colors.brand} /></View>
          <Text style={introStyles.title}>Two quick questions first</Text>
          <Text style={introStyles.body}>How fit you are, how often you can play, and what you’re working toward. The coach plans your week around them.</Text>
          <Pressable accessibilityRole="button" onPress={() => { setLater(true); router.push({ pathname: '/onboarding', params: { from: 'coach', step: '3' } }); }} style={({ pressed }) => [introStyles.go, pressed && { opacity: 0.85 }]}>
            <Text style={introStyles.goText}>Start</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setLater(true)} hitSlop={8}><Text style={introStyles.later}>Skip for now</Text></Pressable>
        </View>
      </Screen>
    );
  }
  return <Train />;
}

/**
 * The one-time question before the AI coach is used: who powers it, exactly
 * what is sent, and a clear Agree or Not now. "Not now" goes back and sends
 * nothing. The answer is kept with the account (migration 115), the server
 * checks it too, and Coach memory has the way to take it back.
 */
function AiCoachConsent({ onAgree }: { onAgree: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const agree = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await onAgree().catch(() => false);
    setBusy(false);
    if (!ok) setFailed(true);
  };
  const sent = [
    'Your questions, and your recent chats with the coach',
    'Your tennis profile: rating, play style, goals, injury and schedule notes, next tournament',
    'If Apple Health is connected: your recent sleep and heart rate variability',
  ];
  return (
    <Screen title="AI Coach" compactTitle onBack={() => goBack()}>
      <View style={introStyles.card}>
        <View style={introStyles.mark}><Ionicons name="sparkles" size={20} color={colors.brand} /></View>
        <Text style={introStyles.title}>Before you use the AI coach</Text>
        <Text style={introStyles.body}>The AI coach is powered by Claude, an AI made by Anthropic. To answer you and plan your week, CourtSide sends Anthropic:</Text>
        <View style={introStyles.list}>
          {sent.map((line) => (
            <View key={line} style={introStyles.item}>
              <Ionicons name="checkmark" size={16} color={colors.brand} />
              <Text style={introStyles.itemText}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={introStyles.body}>Numbers from WHOOP are never sent. Anthropic does not use it to train its AI. You can stop any time from Settings → Account center → Coach memory.</Text>
        <Pressable accessibilityRole="link" onPress={() => openLegal('privacy')} hitSlop={8}><Text style={introStyles.link}>Read the privacy policy</Text></Pressable>
        {failed ? <Text style={introStyles.error}>That didn’t save. Check your connection and try again.</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void agree(); }} style={({ pressed }) => [introStyles.go, (pressed || busy) && { opacity: 0.85 }]}>
          <Text style={introStyles.goText}>{busy ? 'Saving…' : 'Agree'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => goBack()} hitSlop={8}><Text style={introStyles.later}>Not now</Text></Pressable>
      </View>
    </Screen>
  );
}

const introStyles = StyleSheet.create({
  list: { alignSelf: 'stretch', gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  itemText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 22 },
  link: { ...typography.smallStrong, color: colors.brand },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  card: { ...lift, alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: 20, backgroundColor: colors.surface, marginTop: spacing.lg },
  mark: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  go: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14, borderRadius: 999, backgroundColor: colors.brand, marginTop: spacing.sm },
  goText: { ...typography.bodyStrong, color: colors.brandInk },
  later: { ...typography.smallStrong, color: colors.textMuted, paddingVertical: spacing.sm },
});

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
  const { currentUser, healthHistory, integrations, coaches, users, actions } = useApp();
  // Prices are only given to the coach where paid booking is open; otherwise it suggests coaches without one.
  const paidBooking = usePaidBooking();
  // A morning reminder opens straight onto that day of the plan.
  const params = useLocalSearchParams<{ section?: string; day?: string }>();
  const [openDay, setOpenDay] = useState<number | null>(params.day !== undefined && /^[0-6]$/.test(params.day) ? Number(params.day) : null);
  const [section, setSection] = useState<'ask' | 'plan'>(params.section === 'plan' ? 'plan' : 'ask');
  const [draft, setDraft] = useState<{ text: string; n: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | undefined>(undefined);
  const [lines, setLines] = useState<Line[]>([]);

  // WHOOP's numbers stay out of everything the coach is told or writes from (WHOOP's terms bar AI use):
  // the summary, and the stand-in week that goes into each question when the coach's own week is not in.
  // The Recovery tile is only drawn here, on this phone, so it shows every source.
  const shown = useMemo(() => healthSignal(healthHistory, integrations), [healthHistory, integrations]);
  const shared = useMemo(() => withoutSource(healthHistory, 'whoop'), [healthHistory]);
  const signal = useMemo(() => healthSignal(shared, integrations, { skipSource: 'whoop' }), [shared, integrations]);
  const whoopOn = integrations.some((i) => i.provider === 'whoop' && i.connected);
  const about = currentUser ? aboutYou(currentUser.profile, signal, whoopOn) : '';
  const standIn = useMemo(() => (currentUser ? generatePlan({ profile: currentUser.profile, health: shared }) : null), [currentUser, shared]);

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

  // Morning reminders: set again from the plan on screen each time it is
  // opened, so they always match the week you last saw.
  const [remind, setRemind] = useState(false);
  useEffect(() => { void readPlanReminders().then(setRemind); }, []);
  const settled = written !== undefined;
  useEffect(() => { if (remind && settled && plan) void schedulePlanReminders(plan); }, [remind, settled, plan?.id, plan?.weekOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRemind = async (next: boolean) => {
    setRemind(next);
    const result = await setPlanReminders(next);
    if (result === 'denied') {
      setRemind(false);
      showToast({ title: 'Alerts are off for CourtSide', body: 'Turn them on in your phone’s Settings to get the morning reminder.', icon: 'notifications-off-outline' });
    } else if (result === 'on' && settled && plan) {
      // Set now the switch is saved: the effect above ran as it flipped, before
      // the switch was saved, found it still off and set nothing, and nothing
      // ran it again until the week was next opened.
      void schedulePlanReminders(plan);
    }
  };

  // Coaches the AI may suggest when a person would help more: real ones only.
  const options: CoachOption[] = coaches
    .filter((c) => UUID.test(c.id) && c.services.length)
    .map((c) => ({ id: c.id, name: users.find((u) => u.id === c.userId)?.name ?? 'Coach', specialties: c.specialties, fromCents: paidBooking ? Math.min(...c.services.map((s) => s.priceCents)) : 0 }));

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
              {/* Any answer the AI wrote can be reported, as everything else in the app can
                  (Google Play's AI-generated content rule). The report carries the answer's
                  start, within the 200 characters a report's target may be (migration 36). */}
              {m.role !== 'user' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Report this answer"
                  hitSlop={8}
                  style={styles.report}
                  onPress={() => confirmReport('answer', () => {
                    actions.reportUser('ai-coach', `ai-reply:${m.body.slice(0, 180)}`);
                    showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
                  })}
                >
                  <Text style={styles.reportText}>Report</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {thinking ? <View style={[styles.bubble, styles.theirs]}><ThinkingDots /></View> : null}
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

          <TipComposer
            key={draft?.n ?? 0}
            initial={draft?.text}
            placeholder="What would you like help with?"
            accessibilityLabel="Message the AI coach"
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
            {/* The week the AI wrote can be reported, as its answers can (Google Play's
                AI-generated content rule). Never the simpler plan the app writes itself. */}
            {written ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Report this week"
                hitSlop={8}
                style={styles.report}
                onPress={() => confirmReport('week', () => {
                  actions.reportUser('ai-coach', `ai-plan:${plan.headline.slice(0, 180)}`);
                  showToast({ title: 'Thanks — a person will review this', icon: 'flag-outline' });
                })}
              >
                <Text style={styles.reportText}>Report</Text>
              </Pressable>
            ) : null}
            <View style={styles.tileRow}>
              <Stat label="Sessions" value={String(onCourtDays)} hint="this week" />
              <Stat label="Volume" value={duration(totalMinutes)} hint="planned" />
              <Pressable accessibilityRole="link" accessibilityLabel="Recovery and health" onPress={() => router.push('/health')} style={styles.statPress}>
                <Stat
                  label="Recovery"
                  value={shown.recovery !== undefined ? `${shown.recovery}%` : '—'}
                  hint={shown.recovery !== undefined ? '3-day avg' : 'no wearable'}
                  tint={shown.recovery !== undefined && shown.recovery < 65 ? colors.warning : undefined}
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
                // Named after its longest block, as the morning reminder is: the serve work, not the warm-up every day opens with.
                const main = day.restDay || !day.blocks.length ? null : day.blocks.reduce((best, b) => (b.minutes > best.minutes ? b : best), day.blocks[0]);
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
                    <BlockIcon icon={meta ? meta.icon : 'moon-outline'} size={18} color={meta ? colors[meta.tint] : colors.textFaint} />
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
                        <BlockIcon icon={meta.icon} size={15} color={colors[meta.tint]} />
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
          {planRemindersSupported ? (
            <View style={styles.remind}>
              <Ionicons name="alarm-outline" size={20} color={colors.textMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.remindTitle}>Morning reminder</Text>
                <Text style={styles.remindBody}>Today’s session at 8am on training days.</Text>
              </View>
              <Toggle value={remind} onChange={(v) => { void toggleRemind(v); }} accessibilityLabel="Morning reminder with today’s session" />
            </View>
          ) : null}
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
  report: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm },
  reportText: { ...typography.caption, color: colors.textFaint },
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
  remind: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, marginBottom: spacing.xl },
  remindTitle: { ...typography.bodyStrong, color: colors.text },
  remindBody: { ...typography.caption, color: colors.textMuted },
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
