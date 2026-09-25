import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Screen } from '@/components/ui';
import { appleHealthAvailable } from '@/features/health/appleHealth';
import { relativeTime } from '@/lib/format';
import { show as showToast } from '@/lib/toast';
import { useApp } from '@/store/AppContext';
import type { Integration } from '@/data/types';
import { colors, radius, spacing, typography } from '@/theme';

/** What each source is, in a line, and how it connects. */
const ABOUT: Partial<Record<Integration['provider'], { icon: keyof typeof Ionicons.glyphMap; line: string; how: string }>> = {
  'apple-health': { icon: 'heart-outline', line: 'Sleep, HRV, resting heart rate, steps, active energy.', how: 'Reads the Health app on this phone.' },
  whoop: { icon: 'pulse-outline', line: 'Recovery, strain, HRV, resting heart rate, sleep.', how: 'Signs in to WHOOP once; then it syncs on its own.' },
  cronometer: { icon: 'nutrition-outline', line: 'Calories, protein, carbs, fat.', how: 'Reads the export file Cronometer gives you (Settings → Data → Export).' },
};

/**
 * Where the coach's numbers come from. Three sources, each a row: what it
 * gives, whether it is connected, and one button that does the real thing —
 * Apple Health asks the phone, WHOOP opens its sign-in, Cronometer takes a file.
 */
export default function Health() {
  const styles = useThemedStyles(styleDefinitions);
  const { integrations, healthHistory, actions } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const latest = healthHistory[0];
  const connected = integrations.filter((i) => i.connected).length;

  const run = async (provider: Integration['provider'], what: 'toggle' | 'sync') => {
    setBusy(provider);
    try {
      if (what === 'toggle') await actions.toggleIntegration(provider); else await actions.syncHealth(provider);
    } catch (err) {
      showToast({ title: 'Could not connect', body: err instanceof Error ? err.message : 'Try again in a moment.', icon: 'alert-circle-outline' });
    } finally {
      setBusy(null);
    }
  };

  const stat = (label: string, value: string | null) => (
    <View style={styles.stat}><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value ?? '—'}</Text><Text style={styles.statLabel} numberOfLines={1}>{label}</Text></View>
  );

  return (
    <Screen title="Health" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>{connected ? 'The coach plans around these.' : 'Connect a source and the coach plans around how recovered you are.'}</Text>

      {latest ? (
        <View style={styles.today}>
          <Text style={styles.todayTitle}>Latest<Text style={styles.todayDate}> · {new Date(latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></Text>
          <View style={styles.stats}>
            {stat('Recovery', latest.recovery ? `${latest.recovery}%` : null)}
            {stat('Sleep', latest.sleepHours ? `${latest.sleepHours}h` : null)}
            {stat('HRV', latest.hrvMs ? `${latest.hrvMs}` : null)}
            {stat('Resting HR', latest.restingHeartRate ? `${latest.restingHeartRate}` : null)}
          </View>
          <View style={styles.stats}>
            {stat('Calories', latest.calories ? `${latest.calories}` : null)}
            {stat('Protein', latest.proteinGrams ? `${latest.proteinGrams}g` : null)}
            {stat('Steps', latest.steps ? latest.steps.toLocaleString() : null)}
            {stat('Days', `${healthHistory.length}`)}
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {integrations.map((i, index) => {
          const about = ABOUT[i.provider];
          if (!about) return null;
          const loading = busy === i.provider;
          const needsBuild = i.provider === 'apple-health' && Platform.OS === 'ios' && !appleHealthAvailable();
          const wrongPhone = i.provider === 'apple-health' && Platform.OS !== 'ios';
          const blocked = needsBuild || wrongPhone;
          return (
            <View key={i.provider} style={[styles.row, index > 0 && styles.rowLine]}>
              <View style={[styles.disc, i.connected && styles.discOn]}>
                <Ionicons name={about.icon} size={20} color={i.connected ? colors.brandInk : colors.text} />
              </View>
              <View style={styles.words}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{i.label}</Text>
                  {i.connected ? <View style={styles.dot} /> : null}
                </View>
                <Text style={styles.line}>{about.line}</Text>
                <Text style={styles.how}>
                  {i.connected && i.lastSyncedAt ? `Synced ${relativeTime(i.lastSyncedAt)}.` : blocked ? (wrongPhone ? 'iPhone only.' : 'Available in the App Store version of CourtSide.') : about.how}
                </Text>
                {i.connected ? (
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Sync ${i.label}`} disabled={loading} onPress={() => run(i.provider, 'sync')} style={styles.small}>
                      <Ionicons name="refresh" size={14} color={colors.text} /><Text style={styles.smallText}>{i.provider === 'cronometer' ? 'Import again' : 'Sync now'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Disconnect ${i.label}`} disabled={loading} onPress={() => run(i.provider, 'toggle')} style={styles.smallGhost}>
                      <Text style={styles.smallGhostText}>Disconnect</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {loading ? (
                <CourtSpinner size={26} />
              ) : i.connected ? null : (
                <Pressable accessibilityRole="button" accessibilityLabel={`Connect ${i.label}`} accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => run(i.provider, 'toggle')} style={[styles.connect, blocked && styles.connectOff]}>
                  <Text style={[styles.connectText, blocked && styles.connectTextOff]}>{i.provider === 'cronometer' ? 'Import' : 'Connect'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.foot}>Only you and the coach see these. Disconnecting stops new numbers; what was already read stays until you delete your account.</Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  today: { gap: spacing.md, paddingBottom: spacing.xl },
  todayTitle: { ...typography.heading, color: colors.text },
  todayDate: { ...typography.small, color: colors.textFaint },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statValue: { ...typography.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.caption, color: colors.textMuted, letterSpacing: 0.2 },
  list: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  disc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  discOn: { backgroundColor: colors.brand },
  words: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.bodyStrong, color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  line: { ...typography.small, color: colors.textMuted },
  how: { ...typography.small, color: colors.textFaint, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  small: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  smallText: { ...typography.smallStrong, color: colors.text },
  smallGhost: { height: 32, paddingHorizontal: 8, justifyContent: 'center' },
  smallGhostText: { ...typography.smallStrong, color: colors.textMuted },
  connect: { height: 36, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  connectOff: { backgroundColor: colors.surfaceAlt },
  connectText: { ...typography.smallStrong, color: colors.brandInk },
  connectTextOff: { color: colors.textFaint },
  foot: { ...typography.small, color: colors.textFaint, lineHeight: 18, paddingTop: spacing.lg },
});
