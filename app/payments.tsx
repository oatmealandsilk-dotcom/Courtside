import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { EmptyState, Screen } from '@/components/ui';
import { goBack } from '@/lib/goBack';
import { formatDate, money } from '@/lib/format';
import { statusLabel } from '@/features/coaching/bookings';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, font, spacing, typography } from '@/theme';

/**
 * Every coaching booking you have paid for, with what it cost and whether
 * the money came back. Cards are entered on Stripe's own page each time, so
 * there is nothing saved here to manage.
 */
export default function Payments() {
  const styles = useThemedStyles(styleDefinitions);
  const { coachingRequests, coaches, users, currentUserId } = useApp();
  const paid = coachingRequests
    .filter((r) => r.userId === currentUserId && !!r.paidAt && !!r.priceCents)
    .sort((a, b) => Date.parse(b.paidAt!) - Date.parse(a.paidAt!));
  const spent = paid.filter((r) => !r.refundedAt).reduce((sum, r) => sum + (r.priceCents ?? 0), 0);

  return (
    <Screen title="Payments" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>You pay for coaching on Stripe’s own page, so CourtSide never sees or keeps your card. Receipts come from Stripe by email.</Text>
      {paid.length === 0 ? (
        <EmptyState icon="card-outline" title="No payments yet" body="Coaching you book shows up here." />
      ) : (
        <>
          <Text style={styles.total}>{money(spent)} spent on coaching</Text>
          <View style={styles.group}>
            {paid.map((r, index) => {
              const coach = coaches.find((c) => c.id === r.coachId);
              const who = users.find((u) => u.id === coach?.userId)?.name ?? 'A coach';
              const service = coach?.services.find((s) => s.id === r.serviceId);
              const back = !!r.refundedAt;
              return (
                <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(`/coach-request/${r.id}`)} style={({ pressed }) => [styles.row, index > 0 && styles.line, pressed && { backgroundColor: colors.surfaceAlt }]}>
                  <View style={styles.words}>
                    <Text style={styles.title} numberOfLines={1}>{service?.title ?? 'Coaching'} · {who}</Text>
                    <Text style={styles.meta}>{formatDate(r.paidAt!)} · {statusLabel(r)}</Text>
                  </View>
                  <Text style={[styles.amount, back && styles.amountBack]}>{back ? `+${money(r.priceCents!)}` : money(r.priceCents!)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  total: { ...typography.smallStrong, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  group: { borderRadius: 20, backgroundColor: colors.surface, overflow: 'hidden' },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  words: { flex: 1, gap: 2, minWidth: 0 },
  title: { ...typography.body, ...font('500'), color: colors.text },
  meta: { ...typography.small, color: colors.textMuted },
  amount: { ...typography.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  amountBack: { color: colors.success },
});
