import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen, Toggle } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { openLegal } from '@/lib/legal';
import { colors, spacing, typography } from '@/theme';

export default function PrivacyCentre() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, blockedIds, mutedIds, actions } = useApp();
  const receipts = currentUser?.readReceiptsEnabled !== false;
  const link = (icon: keyof typeof Ionicons.glyphMap, label: string, value: string | undefined, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={19} color={colors.textMuted} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowDetail}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
    </Pressable>
  );

  return (
    <Screen title="Privacy" compactTitle onBack={() => goBack()}>
      <Text style={styles.sectionTitle}>Your controls</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="lock-closed-outline" size={19} color={colors.textMuted} />
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.rowLabel}>Private account</Text>
            <Text style={styles.rowDetail}>Only followers see your posts</Text>
          </View>
          <Toggle value={!!currentUser?.isPrivate} onChange={actions.setPrivateAccount} accessibilityLabel="Private account" />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Ionicons name="checkmark-done-outline" size={19} color={colors.textMuted} />
          <Text style={styles.rowLabel}>Read receipts</Text>
          <Toggle value={receipts} onChange={actions.setReadReceiptsEnabled} accessibilityLabel="Read receipts" />
        </View>
        {link('close-circle-outline', 'Blocked', String(blockedIds.length || 'None'), () => router.push('/blocked'))}
        {link('volume-mute-outline', 'Muted', String(mutedIds.length || 'None'), () => router.push('/muted'))}
        {link('time-outline', 'Your activity', undefined, () => router.push('/activity'))}
      </View>

      <Pressable accessibilityRole="link" onPress={() => openLegal('privacy')} hitSlop={8} style={styles.policy}>
        <Text style={styles.policyText}>{isSupabaseConfigured ? 'Read the full privacy policy' : 'Demo build: nothing leaves this device. Privacy policy'}</Text>
        <Ionicons name="open-outline" size={14} color={colors.textFaint} />
      </Pressable>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  // Quiet, the way Settings reads: short labels, the value at the right,
  // flat grouped lists with a hairline edge instead of a raised shadow.
  sectionTitle: { ...typography.small, color: colors.textFaint, paddingHorizontal: spacing.sm, paddingTop: spacing.lg, paddingBottom: 6 },
  card: { borderRadius: 16, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, minHeight: 48 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, fontSize: 15, color: colors.text, flex: 1 },
  rowDetail: { ...typography.small, fontSize: 14, color: colors.textFaint },
  policy: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg },
  policyText: { ...typography.small, color: colors.textFaint },
});
