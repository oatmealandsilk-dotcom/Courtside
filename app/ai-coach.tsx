import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Chip, Field, Screen, StatTile } from '@/components/ui';
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
  const { currentUser, healthHistory, integrations } = useApp();
  const [openDay, setOpenDay] = useState<number | null>(0);
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
        <ActivityIndicator color={colors.brand} />
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
    const context = `${currentUser.profile.skillSystem} ${currentUser.profile.rating}, ${plan.headline.toLowerCase()}`;
    const reply = await askAiCoach(text, context);
    setMessages((prev) => [
      ...prev,
      { id: `m-${Date.now()}-r`, role: 'coach', body: reply, createdAt: new Date().toISOString() },
    ]);
    setThinking(false);
  };

  return (
    <Screen title="AI Coach" subtitle={plan.headline} onBack={() => router.back()}>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <Text style={styles.summaryTag}>AI COACH · WEEK OF {formatDate(plan.weekOf).toUpperCase()}</Text>
        </View>
        <Text style={styles.summary}>{plan.summary}</Text>
        <View style={styles.tileRow}>
          <StatTile label="Sessions" value={String(onCourtDays)} hint="this week" />
          <StatTile label="Volume" value={duration(totalMinutes)} hint="planned" />
          <StatTile
            label="Recovery"
            value={signal.recovery !== undefined ? `${signal.recovery}%` : '—'}
            hint={signal.recovery !== undefined ? '3-day avg' : 'connect a wearable'}
            tint={signal.recovery !== undefined && signal.recovery < 65 ? colors.warning : colors.text}
          />
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
        {plan.days.map((day) => {
          const open = openDay === day.dayIndex;
          const dayMinutes = day.blocks.reduce((sum, b) => sum + b.minutes, 0);
          return (
            <Card
              key={day.id}
              onPress={() => setOpenDay(open ? null : day.dayIndex)}
              style={styles.dayCard}
            >
              <View style={styles.dayHead}>
                <View style={[styles.dayBadge, day.restDay && styles.dayBadgeRest]}>
                  <Text style={[styles.dayBadgeText, day.restDay && { color: colors.textMuted }]}>
                    {day.label.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.dayTitle}>
                  {day.restDay ? 'Recovery' : day.blocks.map((b) => b.title).slice(1, 3).join(' + ')}
                </Text>
                <Text style={styles.dayMinutes}>{duration(dayMinutes)}</Text>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textFaint}
                />
              </View>

              {open ? (
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
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Health inputs</Text>
          <Button label="Manage" variant="ghost" onPress={() => router.push('/health')} />
        </View>
        <Card style={styles.healthCard}>
          <View style={styles.tileRow}>
            <StatTile
              label="Sleep"
              value={signal.sleepHours !== undefined ? `${signal.sleepHours}h` : '—'}
              hint="3-day avg"
            />
            <StatTile label="HRV" value={signal.hrvMs !== undefined ? `${signal.hrvMs}ms` : '—'} hint="3-day avg" />
            <StatTile
              label="Protein"
              value={signal.proteinGrams !== undefined ? `${signal.proteinGrams}g` : '—'}
              hint="per day"
            />
          </View>
          <Text style={styles.healthNote}>
            {signal.hasWearable && signal.hasNutrition
              ? 'Recovery and nutrition are both feeding the plan. Intensity moves automatically when these drop.'
              : 'Connect a wearable and a nutrition app so the plan can react to how you actually recover.'}
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ask your coach</Text>
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
            <ActivityIndicator color={colors.brand} size="small" />
          </View>
        ) : null}
        <Field
          value={prompt}
          onChangeText={setPrompt}
          placeholder="e.g. My shoulder is sore, what should I swap out on Thursday?"
          multiline
          minHeight={80}
        />
        <Button label="Send" onPress={send} disabled={thinking || prompt.trim().length === 0} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
