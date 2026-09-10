import { useThemedStyles } from '@/theme/ThemeProvider';
import { PlayerName } from '@/components/PlayerName';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar, Card, Chip } from '@/components/ui';
import { money } from '@/lib/format';
import type { Coach, User } from '@/data/types';
import { colors, spacing, typography } from '@/theme';

interface Props {
  coach: Coach;
  user: User | undefined;
  onPress: () => void;
}

export function CoachCard({ coach, user, onPress }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const cheapest = coach.services.reduce(
    (min, s) => (s.priceCents < min ? s.priceCents : min),
    coach.services[0]?.priceCents ?? 0,
  );

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Avatar name={user?.name ?? 'Coach'} seed={user?.avatarSeed ?? coach.id} size={52} ring />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <PlayerName userId={user?.id} style={styles.name} numberOfLines={1}>
              {user?.name ?? 'Coach'}
            </PlayerName>
            {coach.verified ? <Ionicons name="shield-checkmark" size={15} color={colors.brand} /> : null}
          </View>
          <Text style={styles.headline} numberOfLines={2}>
            {coach.headline}
          </Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color={colors.warning} />
            <Text style={styles.rating}>
              {coach.ratingAvg.toFixed(1)} ({coach.ratingCount})
            </Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.rating}>replies in ~{coach.responseTimeHours}h</Text>
          </View>
        </View>
      </View>

      <View style={styles.tagRow}>
        {coach.specialties.slice(0, 4).map((s) => (
          <Chip key={s} label={s} small />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.price}>From {money(cheapest)}</Text>
        <Text style={styles.services}>
          {coach.services.length} {coach.services.length === 1 ? 'service' : 'services'}
        </Text>
      </View>
    </Card>
  );
}

const styleDefinitions = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', gap: spacing.md },
  headerText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...typography.heading, color: colors.text },
  headline: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rating: { ...typography.small, color: colors.textFaint },
  dot: { color: colors.textFaint },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  price: { ...typography.bodyStrong, color: colors.brand },
  services: { ...typography.small, color: colors.textFaint },
});
