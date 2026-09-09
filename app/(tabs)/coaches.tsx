import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CoachCard } from '@/components/CoachCard';
import { Card, Chip, EmptyState, Screen } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useApp } from '@/store/AppContext';
import type { CoachSpecialty } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const SPECIALTIES: (CoachSpecialty | 'all')[] = [
  'all',
  'serve',
  'forehand',
  'backhand',
  'strategy',
  'fitness',
  'mental',
  'juniors',
];

const STATUS_META: Record<string, { label: string; tint: string }> = {
  submitted: { label: 'Submitted', tint: colors.textMuted },
  'in-review': { label: 'In review', tint: colors.warning },
  answered: { label: 'Answered', tint: colors.court },
  draft: { label: 'Draft', tint: colors.textFaint },
};

export default function Coaches() {
  const { coaches, users, coachingRequests, currentUserId } = useApp();
  const [specialty, setSpecialty] = useState<CoachSpecialty | 'all'>('all');

  const visible = useMemo(
    () =>
      specialty === 'all' ? coaches : coaches.filter((c) => c.specialties.includes(specialty)),
    [coaches, specialty],
  );

  const myRequests = coachingRequests.filter((r) => r.userId === currentUserId);

  return (
    <Screen title="Coaches" subtitle="Send footage or a question, get a real answer back">
      {myRequests.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>Your requests</Text>
          <View style={styles.list}>
            {myRequests.map((request) => {
              const coach = coaches.find((c) => c.id === request.coachId);
              const coachUser = users.find((u) => u.id === coach?.userId);
              const meta = STATUS_META[request.status] ?? STATUS_META.submitted;
              return (
                <Card
                  key={request.id}
                  onPress={() => router.push(`/coach/${request.coachId}`)}
                  style={styles.requestCard}
                >
                  <View style={styles.requestHead}>
                    <Text style={styles.requestCoach}>{coachUser?.name ?? 'Coach'}</Text>
                    <View style={[styles.status, { borderColor: meta.tint }]}>
                      <Text style={[styles.statusText, { color: meta.tint }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.requestQuestion} numberOfLines={2}>
                    {request.question}
                  </Text>
                  {request.videoLabel ? (
                    <View style={styles.videoRow}>
                      <Ionicons name="videocam-outline" size={14} color={colors.textFaint} />
                      <Text style={styles.videoLabel}>{request.videoLabel}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.requestTime}>
                    {request.status === 'answered' && request.respondedAt
                      ? `Answered ${relativeTime(request.respondedAt)} ago`
                      : `Sent ${relativeTime(request.createdAt)} ago`}
                  </Text>
                </Card>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.sectionTitle}>Find a coach</Text>
        <View style={styles.filterRow}>
          {SPECIALTIES.map((s) => (
            <Chip
              key={s}
              label={s === 'all' ? 'All' : s}
              selected={specialty === s}
              onPress={() => setSpecialty(s)}
              small
            />
          ))}
        </View>

        {visible.length === 0 ? (
          <EmptyState icon="people-outline" title="No coaches match that filter" />
        ) : (
          <View style={styles.list}>
            {visible.map((coach) => (
              <CoachCard
                key={coach.id}
                coach={coach}
                user={users.find((u) => u.id === coach.userId)}
                onPress={() => router.push(`/coach/${coach.id}`)}
              />
            ))}
          </View>
        )}
      </View>

      <Text style={styles.note}>
        Payments are not wired up in this build. Booking a service records the request locally so the
        flow is walkable end to end.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: { gap: spacing.md },
  requestCard: { gap: spacing.sm },
  requestHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  requestCoach: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  status: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  statusText: { ...typography.caption },
  requestQuestion: { ...typography.small, color: colors.textMuted, lineHeight: 20 },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  videoLabel: { ...typography.small, color: colors.textFaint },
  requestTime: { ...typography.caption, color: colors.textFaint },
  note: { ...typography.small, color: colors.textFaint, lineHeight: 20, paddingTop: spacing.md },
});
