import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, Screen, StatTile } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { providerSetup } from '@/lib/integrations';
import { useApp } from '@/store/AppContext';
import type { Integration } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

const CATEGORY_LABEL: Record<Integration['category'], string> = {
  nutrition: 'Nutrition',
  wearable: 'Wearables',
  activity: 'Activity',
};

const CATEGORY_ORDER: Integration['category'][] = ['wearable', 'nutrition', 'activity'];

export default function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const { integrations, healthHistory, actions } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const latest = healthHistory[0];

  const toggle = async (provider: Integration['provider']) => {
    setBusy(provider);
    await actions.toggleIntegration(provider);
    setBusy(null);
  };

  return (
    <Screen title="Health inputs" compactTitle onBack={() => router.back()}>
      {latest ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yesterday</Text>
          <View style={styles.tileRow}>
            <StatTile label="Recovery" value={`${latest.recovery}%`} />
            <StatTile label="Sleep" value={`${latest.sleepHours}h`} />
            <StatTile label="HRV" value={`${latest.hrvMs}ms`} />
          </View>
          <View style={styles.tileRow}>
            <StatTile label="Calories" value={String(latest.calories)} />
            <StatTile label="Protein" value={`${latest.proteinGrams}g`} />
            <StatTile label="Steps" value={String(latest.steps)} />
          </View>
        </View>
      ) : null}

      {CATEGORY_ORDER.map((category) => {
        const group = integrations.filter((i) => i.category === category);
        if (group.length === 0) return null;
        return (
          <View key={category} style={styles.section}>
            <Text style={styles.sectionTitle}>{CATEGORY_LABEL[category]}</Text>
            {group.map((integration) => {
              const setup = providerSetup[integration.provider];
              const loading = busy === integration.provider;
              return (
                <Card key={integration.provider} style={styles.card}>
                  <View style={styles.head}>
                    <View style={styles.headText}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{integration.label}</Text>
                        {integration.connected ? (
                          <View style={styles.connected}>
                            <Ionicons name="checkmark-circle" size={12} color={colors.court} />
                            <Text style={styles.connectedText}>CONNECTED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.provides}>{integration.provides.join(' · ')}</Text>
                      {integration.lastSyncedAt ? (
                        <Text style={styles.synced}>Synced {relativeTime(integration.lastSyncedAt)} ago</Text>
                      ) : null}
                    </View>
                    {loading ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <Button
                        label={integration.connected ? 'Disconnect' : 'Connect'}
                        variant={integration.connected ? 'ghost' : 'secondary'}
                        onPress={() => toggle(integration.provider)}
                      />
                    )}
                  </View>
                  <View style={styles.todo}>
                    <Text style={styles.todoLabel}>
                      {setup.authMethod === 'healthkit' ? 'HEALTHKIT' : setup.authMethod.toUpperCase()}
                    </Text>
                    <Text style={styles.todoText}>{setup.todo}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        );
      })}

      <Text style={styles.footnote}>
        Connecting is simulated in this build: it flips a local flag so the AI coach starts reading the
        mock history. Each card lists what still needs building for the real integration.
      </Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  section: { gap: spacing.md, paddingBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  card: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.text },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  connectedText: { ...typography.caption, fontSize: 9, color: colors.court },
  provides: { ...typography.small, color: colors.textMuted },
  synced: { ...typography.caption, color: colors.textFaint },
  todo: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 3,
  },
  todoLabel: { ...typography.caption, color: colors.hard },
  todoText: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  footnote: { ...typography.small, color: colors.textFaint, lineHeight: 19 },
});
