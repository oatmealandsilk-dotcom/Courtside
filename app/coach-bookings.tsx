import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, EmptyState, Screen, SegmentedControl } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { money, relativeTime } from '@/lib/format';
import { dueText, isOpen, isOverdue, statusLabel } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * A coach's bookings: the open ones first, soonest due at the top, then the
 * answered and refunded ones. Pull down to check for new ones.
 */
export default function CoachBookings() {
  const styles = useThemedStyles(styleDefinitions);
  const { coaches, coachingRequests, users, currentUserId, ready, actions } = useApp();
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const coach = coaches.find((c) => c.userId === currentUserId);
  const refresh = useCallback(() => actions.refreshCoaching(), [actions]);
  useEffect(() => { if (ready) void refresh(); }, [ready, refresh]);

  const mine = coachingRequests.filter((r) => r.paidAt || !r.priceCents).filter((r) => (coach && r.coachId === coach.id) || r.coachUserId === currentUserId);
  const open = mine.filter(isOpen).sort((a, b) => Date.parse(a.dueAt ?? a.createdAt) - Date.parse(b.dueAt ?? b.createdAt));
  const done = mine.filter((r) => !isOpen(r)).sort((a, b) => Date.parse(b.respondedAt ?? b.refundedAt ?? b.createdAt) - Date.parse(a.respondedAt ?? a.refundedAt ?? a.createdAt));
  const list = tab === 'open' ? open : done;
  const earned = mine.filter((r) => r.status === 'answered').reduce((sum, r) => sum + (r.priceCents ?? 0) - (r.feeCents ?? 0), 0);

  return (
    <Screen title="Bookings" compactTitle onBack={() => goBack('/coach-studio')} onRefresh={refresh}>
      <SegmentedControl segments={[{ value: 'open', label: open.length ? `Open · ${open.length}` : 'Open' }, { value: 'done', label: 'Done' }]} value={tab} onChange={setTab} />
      {earned ? <Text style={styles.earned}>{money(earned)} earned from answered bookings, before Stripe’s card fee.</Text> : null}
      {list.length === 0 ? (
        <EmptyState icon="file-tray-outline" title={tab === 'open' ? 'Nothing waiting' : 'Nothing here yet'} body={tab === 'open' ? 'New bookings arrive here, with a notification.' : 'Answered and refunded bookings collect here.'} />
      ) : (
        <View style={styles.group}>
          {list.map((r, index) => {
            const player = users.find((u) => u.id === r.userId);
            const service = coach?.services.find((s) => s.id === r.serviceId);
            const late = isOverdue(r);
            return (
              <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(`/coach-request/${r.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
                <Avatar name={player?.name ?? '?'} seed={player?.avatarSeed ?? r.id} uri={player?.avatarUrl} size={40} />
                <View style={styles.words}>
                  <Text style={styles.title} numberOfLines={2}>{r.question}</Text>
                  <Text style={[styles.meta, late && { color: colors.danger }]} numberOfLines={1}>
                    {player?.name ?? 'Player'} · {service?.title ?? 'Booking'} · {isOpen(r) && r.dueAt ? (late ? 'late' : `due ${dueText(r.dueAt)}`) : `${statusLabel(r, true)} ${relativeTime(r.respondedAt ?? r.refundedAt ?? r.createdAt)}`}
                  </Text>
                </View>
                {r.status === 'submitted' ? <View style={styles.dot} accessibilityLabel="New" /> : <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  earned: { ...typography.small, color: colors.textMuted, marginTop: spacing.md },
  group: { marginTop: spacing.lg, borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  words: { flex: 1, gap: 3, minWidth: 0 },
  title: { ...typography.body, ...font('500'), color: colors.text, lineHeight: 21 },
  meta: { ...typography.small, color: colors.textMuted },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
});
