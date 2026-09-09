import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { LevelPill } from '@/components/LevelPill';
import { duration, money, relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import { colors, radius, spacing, typography } from '@/theme';

const KIND_LABEL: Record<string, string> = {
  'video-review': 'Video review',
  'written-qa': 'Written Q&A',
  'live-session': 'Live session',
  plan: 'Training plan',
};

export default function CoachDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coaches, users, coachingRequests, currentUserId, actions } = useApp();

  const coach = coaches.find((c) => c.id === id);
  const user = users.find((u) => u.id === coach?.userId);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [attachVideo, setAttachVideo] = useState(false);
  const [sent, setSent] = useState(false);

  if (!coach || !user) {
    return (
      <Screen title="Coach" compactTitle onBack={() => router.back()}>
        <EmptyState icon="alert-circle-outline" title="Coach not found" />
      </Screen>
    );
  }

  const myRequests = coachingRequests.filter(
    (r) => r.coachId === coach.id && r.userId === currentUserId,
  );

  const service = coach.services.find((s) => s.id === selectedService);

  const submit = () => {
    if (!service || question.trim().length === 0) return;
    actions.submitCoachingRequest(
      coach.id,
      service.id,
      question.trim(),
      attachVideo ? 'session-clip.mp4 · 0:58' : undefined,
    );
    setQuestion('');
    setSelectedService(null);
    setAttachVideo(false);
    setSent(true);
  };

  return (
    <Screen title={user.name} compactTitle onBack={() => router.back()}>
      <Card style={styles.hero}>
        <View style={styles.heroRow}>
          <Avatar name={user.name} seed={user.avatarSeed} size={62} ring />
          <View style={styles.heroText}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{user.name}</Text>
              {coach.verified ? <Ionicons name="shield-checkmark" size={16} color={colors.brand} /> : null}
            </View>
            <Text style={styles.headline}>{coach.headline}</Text>
            <View style={styles.pillRow}>
              <LevelPill profile={user.profile} small />
              <Chip label={`${coach.yearsCoaching} yrs coaching`} small />
            </View>
          </View>
        </View>
        <Text style={styles.bio}>{user.bio}</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.statText}>
              {coach.ratingAvg.toFixed(1)} from {coach.ratingCount} players
            </Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={14} color={colors.textFaint} />
            <Text style={styles.statText}>Replies in ~{coach.responseTimeHours}h</Text>
          </View>
        </View>
        <View style={styles.credentials}>
          {coach.credentials.map((c) => (
            <View key={c} style={styles.credRow}>
              <Ionicons name="checkmark" size={13} color={colors.court} />
              <Text style={styles.credText}>{c}</Text>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        {coach.services.map((s) => {
          const active = selectedService === s.id;
          return (
            <Card
              key={s.id}
              onPress={() => {
                setSelectedService(active ? null : s.id);
                setSent(false);
              }}
              style={[styles.service, active ? { borderColor: colors.brand } : null]}
            >
              <View style={styles.serviceHead}>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.servicePrice}>{money(s.priceCents)}</Text>
              </View>
              <Text style={styles.serviceDesc}>{s.description}</Text>
              <View style={styles.serviceMeta}>
                <Chip label={KIND_LABEL[s.kind] ?? s.kind} small />
                <Text style={styles.turnaround}>Turnaround {duration(s.turnaroundHours * 60)}</Text>
              </View>
            </Card>
          );
        })}
      </View>

      {service ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send your request</Text>
          <Card style={styles.requestForm}>
            <Text style={styles.selected}>
              {service.title} · {money(service.priceCents)}
            </Text>
            <Field
              label="What do you want looked at?"
              value={question}
              onChangeText={setQuestion}
              placeholder="Be specific. What happens, when it happens, and what you have already tried."
              multiline
            />
            <Button
              label={attachVideo ? 'Footage attached ✓' : 'Attach footage'}
              variant="secondary"
              onPress={() => setAttachVideo((v) => !v)}
            />
            <Text style={styles.uploadNote}>
              Uploads are stubbed in this build — attaching adds a placeholder clip so the flow works
              end to end.
            </Text>
            <Button label={`Send request · ${money(service.priceCents)}`} onPress={submit} disabled={question.trim().length === 0} full />
            <Text style={styles.uploadNote}>
              No payment is taken. Wiring this to Stripe Connect is the next step.
            </Text>
          </Card>
        </View>
      ) : null}

      {sent ? (
        <Card style={styles.sentCard}>
          <Ionicons name="checkmark-circle" size={18} color={colors.court} />
          <Text style={styles.sentText}>Request sent. You will see it in the Coaches tab.</Text>
        </Card>
      ) : null}

      {myRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your history with {user.name.split(' ')[0]}</Text>
          {myRequests.map((r) => (
            <Card key={r.id} style={styles.historyCard}>
              <Text style={styles.historyQuestion}>{r.question}</Text>
              <Text style={styles.historyMeta}>
                {r.status === 'answered' ? 'Answered' : 'Waiting'} · sent {relativeTime(r.createdAt)} ago
              </Text>
              {r.response ? <Text style={styles.historyResponse}>{r.response}</Text> : null}
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md },
  heroRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroText: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.title, color: colors.text },
  headline: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  pillRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', paddingTop: 2 },
  bio: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { ...typography.small, color: colors.textFaint },
  credentials: { gap: 4 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  credText: { ...typography.small, color: colors.textMuted },
  section: { gap: spacing.md, paddingTop: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  service: { gap: spacing.sm },
  serviceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  serviceTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  servicePrice: { ...typography.bodyStrong, color: colors.brand },
  serviceDesc: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  turnaround: { ...typography.caption, color: colors.textFaint },
  requestForm: { gap: spacing.md },
  selected: { ...typography.smallStrong, color: colors.brand },
  uploadNote: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  sentCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, borderColor: `${colors.court}66` },
  sentText: { ...typography.small, color: colors.text, flex: 1 },
  historyCard: { gap: spacing.sm },
  historyQuestion: { ...typography.smallStrong, color: colors.text, lineHeight: 20 },
  historyMeta: { ...typography.caption, color: colors.textFaint },
  historyResponse: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 21,
    borderLeftWidth: 2,
    borderLeftColor: colors.brand,
    paddingLeft: spacing.md,
    marginTop: spacing.xs,
  },
});
