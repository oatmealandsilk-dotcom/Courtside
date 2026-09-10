import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { tierColor, type AchievementProgress } from '@/lib/badges';
import { colors, radius, spacing, typography } from '@/theme';

export function AchievementGrid({ items }: { items: AchievementProgress[] }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.grid}>
      {items.map(({ achievement, unlocked, progress }) => {
        const tint = tierColor(achievement.tier);
        return (
          <View
            key={achievement.id}
            style={[
              styles.tile,
              { borderColor: unlocked ? `${tint}66` : colors.border, opacity: unlocked ? 1 : 0.55 },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: unlocked ? `${tint}22` : colors.surfaceAlt }]}>
              <Ionicons
                name={(unlocked ? achievement.icon : 'lock-closed') as keyof typeof Ionicons.glyphMap}
                size={18}
                color={unlocked ? tint : colors.textFaint}
              />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {achievement.name}
            </Text>
            <Text style={styles.desc} numberOfLines={2}>
              {achievement.description}
            </Text>
            {!unlocked ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            ) : (
              <Text style={[styles.tier, { color: tint }]}>{achievement.tier.toUpperCase()}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: 150,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 5,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.smallStrong, color: colors.text },
  desc: { ...typography.small, color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  tier: { ...typography.caption, fontSize: 9 },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand },
});
