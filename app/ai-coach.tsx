import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CourtSpinner } from '@/components/CourtSpinner';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Chip, Field, Screen, StatTile, SegmentedControl } from '@/components/ui';
import { askAiCoach } from '@/data/api';
import { generatePlan } from '@/features/aiCoach/planGenerator';
import { duration, formatDate } from '@/lib/format';
import { healthSignal } from '@/lib/integrations';
import { useApp } from '@/store/AppContext';
import type { AiMessage, TrainingBlockKind } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const BLOCK_META: Record<TrainingBlockKind, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  'on-court': { icon: 'tennisball-outline', tint: colors.brand },
  fitness: { icon: 'barbell-outline', tint: colors.court },
  recovery: { icon: 'moon-outline', tint: colors.hard },
  'match-play': { icon: 'trophy-outline', tint: colors.warning },
  mental: { icon: 'bulb-outline', tint: '#8A6BE0' },
};

export default function Train() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, healthHistory, integrations } = useApp();
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [section, setSection] = useState<'ask' | 'plan'>('ask');
  const [prompt, setPrompt] = useState('');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);

  const signal = useMemo(() => healthSignal(healthHistory, integrations), [healthHistory, integrations]);

  const plan = useMemo(() => {
    if (!currentUser) return null;
    return generatePlan({ profile: currentUser.profile, health: healthHistory });
  }, [currentUser, healthHistory]);

  if (!currentUser || !plan) {
    return (
      <Screen title="AI Coach">
        <CourtSpinner size={28} />
      </Screen>
    );
  }

  const totalMinutes = plan.days
    .flatMap((d) => d.blocks)
    .reduce((sum, b) => sum + b.minutes, 0);
  const onCourtDays = plan.days.filter((d) => !d.restDay).length;

  const send = async () => {
    const text = prompt.trim();
    if (!text) return;
    const mine: AiMessage = {
      id: `m-${Date.now()}`,
      role: 'user',
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, mine]);
    setPrompt('');
    setThinking(true);
    const p = currentUser.profile;
    const context = [
      `Rating: ${p.skillSystem} ${p.rating}. Style: ${p.playStyle}, ${p.handedness}-handed, ${p.backhand} backhand. Prefers ${p.preferredSurface}. Fitness: ${p.fitnessLevel}. ${p.sessionsPerWeek} sessions a week, ${p.yearsPlaying} years playing.`,
      `Goals: ${p.goals.map((g) => g.label).join('; ') || 'none set'}.`,
      `Injury and schedule notes: ${p.constraints.filter((c) => c.active).map((c) => `${c.kind}: ${c.label}`).join('; ') || 'none'}.`,
      p.tournaments[0] ? `Next tournament: ${p.tournaments[0].name} on ${formatDate(p.tournaments[0].startsAt)}.` : 'No tournament scheduled.',
      `This week's plan: ${plan.headline}. ${plan.summary} Days: ${plan.days.map((d) => `${d.label} ${d.restDay ? 'rest' : d.blocks.map((b) => b.title).join(' + ')}`).join('; ')}.`,
      signal.recovery !== undefined ? `Recovery ${signal.recovery}% (3-day avg)${signal.sleepHours !== undefined ? `, sleep ${signal.sleepHours}h` : ''}${signal.hrvMs !== undefined ? `, HRV ${signal.hrvMs}ms` : ''}.` : 'No wearable connected.',
    ].join('\n');
    const history = messages.map((m) => ({ role: m.role, body: m.body }));
    const started = Date.now();
    const reply = await askAiCoach(text, context, history);
    // A reply that lands instantly reads as canned, even when it is not.
    await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
    setMessages((prev) => [
      ...prev,
      { id: `m-${Date.now()}-r`, role: 'coach', body: reply, createdAt: new Date().toISOString() },
    ]);
    setThinking(false);
  };

  return (
    <Screen title="AI Coach" subtitle="Your next step on court." onBack={() => goBack()}>
      <SegmentedControl segments={[{value:'ask',label:'Ask coach'},{value:'plan',label:'My plan'}]} value={section} onChange={setSection}/>
      {section === 'plan' && <>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <Text style={styles.summaryTag}>AI COACH · WEEK OF {formatDate(plan.weekOf).toUpperCase()}</Text>
        </View>
        <Text style={styles.summary}>{plan.summary}</Text>
        <View style={styles.tileRow}>
          <StatTile label="Sessions" value={String(onCourtDays)} hint="this week" />
          <StatTile label="Volume" value={duration(totalMinutes)} hint="planned" />
          <Pressable accessibilityRole="link" accessibilityLabel="Recovery and health" onPress={() => router.push('/health')} style={{ flex: 1 }}>
            <StatTile
              label="Recovery"
              value={signal.recovery !== undefined ? `${signal.recovery}%` : '—'}
              hint={signal.recovery !== undefined ? '3-day avg · details' : 'connect a wearable'}
              tint={signal.recovery !== undefined && signal.recovery < 65 ? colors.warning : colors.text}
            />
          </Pressable>
        </View>
        <View style={styles.focusRow}>
          {plan.focusAreas.map((f) => (
            <Chip key={f} label={f} small />
          ))}
        </View>
      </Card>

      {plan.cautions.length > 0 ? (
        <Card style={styles.cautionCard}>
          <View style={styles.cautionHead}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.cautionTitle}>Working around</Text>
          </View>
          {plan.cautions.map((c) => (
            <Text key={c} style={styles.caution}>
              • {c}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This week</Text>
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
                <Text style={[styles.dayColLabel, open && { color: colors.brand }]}>{day.label.slice(0, 3).toUpperCase()}</Text>
                <View style={[styles.dayColIcon, meta && { backgroundColor: `${meta.tint}22` }]}>
                  <Ionicons name={meta ? meta.icon : 'moon-outline'} size={18} color={meta ? meta.tint : colors.textFaint} />
                </View>
                <Text numberOfLines={2} style={styles.dayColTitle}>{day.restDay ? 'Rest' : main?.title}</Text>
                <Text style={styles.dayColMinutes}>{day.restDay ? '—' : duration(dayMinutes)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {plan.days.filter((d) => d.dayIndex === openDay).map((day) => (
          <Card key={day.id} style={styles.dayCard}>
            <View style={styles.dayHead}>
              <Text style={styles.dayTitle}>{day.label}</Text>
              <Text style={styles.dayMinutes}>{day.restDay ? 'Recovery day' : duration(day.blocks.reduce((sum, b) => sum + b.minutes, 0))}</Text>
            </View>
            <View style={styles.blockList}>
              {day.blocks.map((block) => {
                const meta = BLOCK_META[block.kind];
                return (
                  <View key={block.id} style={styles.block}>
                    <View style={styles.blockHead}>
                      <Ionicons name={meta.icon} size={15} color={meta.tint} />
                      <Text style={styles.blockTitle}>{block.title}</Text>
                      <Text style={styles.blockMinutes}>{duration(block.minutes)}</Text>
                    </View>
                    {block.detail.map((d) => (
                      <Text key={d} style={styles.blockDetail}>
                        • {d}
                      </Text>
                    ))}
                    <Text style={styles.rationale}>{block.rationale}</Text>
                  </View>
                );
              })}
              {day.restDay && !day.blocks.length ? <Text style={styles.blockDetail}>Nothing scheduled. Sleep, eat, walk.</Text> : null}
            </View>
          </Card>
        ))}
        {openDay === null ? <Text style={styles.healthNote}>Tap a day to see the session.</Text> : null}
      </View>
      </>}
      {section === 'ask' && <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ask your coach</Text>
        {!messages.length && <View style={{gap:12}}>
          <Text style={styles.healthNote}>Get help with your next session, technique, or recovery.</Text>
          <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
            {['What should I work on today?', 'How can I improve my serve?', 'Help me plan a lighter session'].map(text=><Chip key={text} label={text} onPress={()=>setPrompt(text)}/>)}
          </View>
        </View>}
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.message, m.role === 'user' ? styles.messageMine : styles.messageCoach]}
          >
            <Text style={styles.messageText}>{m.body}</Text>
          </View>
        ))}
        {thinking ? (
          <View style={[styles.message, styles.messageCoach]}>
            <ThinkingDots />
          </View>
        ) : null}
        <Field
          value={prompt}
          onChangeText={setPrompt}
          placeholder="What would you like help with?"
          multiline
          minHeight={80}
          onSubmitEditing={send}
        />
        <Button label="Send" onPress={send} disabled={thinking || prompt.trim().length === 0} />
      </View>}
    </Screen>
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
  week: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 2 },
  dayCol: { width: 96, gap: 8, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  dayColOpen: { borderColor: colors.brand },
  dayColRest: { backgroundColor: colors.bgElevated },
  dayColLabel: { ...typography.caption, color: colors.textMuted },
  dayColIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dayColTitle: { ...typography.smallStrong, color: colors.text, lineHeight: 17, minHeight: 34 },
  dayColMinutes: { ...typography.caption, color: colors.textFaint, letterSpacing: 0 },
  summaryCard: { gap: spacing.md, marginBottom: spacing.lg },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryTag: { ...typography.caption, color: colors.brand },
  summary: { ...typography.body, color: colors.text, lineHeight: 22 },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cautionCard: { gap: spacing.sm, marginBottom: spacing.lg, borderColor: `${colors.warning}44` },
  cautionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cautionTitle: { ...typography.smallStrong, color: colors.warning },
  caution: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  section: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayCard: { gap: spacing.md },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dayBadgeRest: { backgroundColor: colors.surfaceAlt },
  dayBadgeText: { ...typography.caption, color: colors.brandInk },
  dayTitle: { ...typography.smallStrong, color: colors.text, flex: 1 },
  dayMinutes: { ...typography.small, color: colors.textFaint },
  blockList: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  block: { gap: 3 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockTitle: { ...typography.smallStrong, color: colors.text, flex: 1 },
  blockMinutes: { ...typography.caption, color: colors.textFaint },
  blockDetail: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  rationale: { ...typography.small, color: colors.textFaint, fontStyle: 'italic', lineHeight: 19, paddingTop: 2 },
  healthCard: { gap: spacing.md },
  healthNote: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  message: {
    borderRadius: radius.md,
    padding: spacing.md,
    maxWidth: '92%',
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: colors.brandDim },
  messageCoach: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  messageText: { ...typography.small, color: colors.text, lineHeight: 20 },
});
