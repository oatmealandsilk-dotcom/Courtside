import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { Screen, Toggle } from '@/components/ui';
import { useApp } from '@/store/AppContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme';

export default function PrivacyCentre() {
  const styles = useThemedStyles(styleDefinitions);
  const { currentUser, blockedIds, mutedIds, actions } = useApp();
  const receipts = currentUser?.readReceiptsEnabled !== false;

  return (
    <Screen title="Privacy center" compactTitle onBack={() => goBack()}>
      <Text style={styles.lead}>
        What CourtSide keeps, who can see it, and the switches that change that.
      </Text>

      <Text style={styles.sectionTitle}>WHAT WE STORE</Text>
      <View style={styles.card}>
        {[
          ['Your profile', 'Name, handle, city, rating, play style, goals, injury notes.'],
          ['What you post', 'Clips, posts, discussions, answers, and questions to coaches.'],
          ['Health data', 'Only what you connect in Health and nutrition. It feeds the AI coach and never appears on your profile.'],
          ['Messages', 'Kept so both people can read them. Blocking someone removes the conversation for you.'],
        ].map(([title, body], index) => (
          <View key={title} style={[styles.item, index > 0 && styles.rowBorder]}>
            <Text style={styles.itemTitle}>{title}</Text>
            <Text style={styles.itemBody}>{body}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>YOUR CONTROLS</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Private account</Text>
            <Text style={styles.rowDetail}>Only followers see your posts, hits and stats. New followers have to ask, and you say yes or no.</Text>
          </View>
          <Toggle value={!!currentUser?.isPrivate} onChange={actions.setPrivateAccount} accessibilityLabel="Private account" />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Ionicons name="checkmark-done-outline" size={20} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Read receipts</Text>
            <Text style={styles.rowDetail}>Let people see when you have read their messages</Text>
          </View>
          <Toggle value={receipts} onChange={actions.setReadReceiptsEnabled} accessibilityLabel="Read receipts" />
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push('/blocked')} style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="close-circle-outline" size={20} color={colors.text} />
          <Text style={styles.rowLabel}>Blocked players</Text>
          <Text style={styles.rowDetail}>{blockedIds.length || 'None'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/muted')} style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="volume-mute-outline" size={20} color={colors.text} />
          <Text style={styles.rowLabel}>Muted players</Text>
          <Text style={styles.rowDetail}>{mutedIds.length || 'None'}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/activity')} style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="time-outline" size={20} color={colors.text} />
          <Text style={styles.rowLabel}>Your activity</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>THIS BUILD</Text>
      <View style={styles.card}>
        <View style={styles.item}>
          <Text style={styles.itemBody}>
            {isSupabaseConfigured ? 'Your posts, follows, messages and settings are saved to your account so they are there on any device. Health links and payments are not live yet, so nothing from those leaves this device.' : 'This is a demo running on sample data. Nothing you type, post, or connect leaves your device, and it is gone when you close the app.'}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  lead: { ...typography.small, color: colors.textMuted, lineHeight: 20, paddingBottom: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1, paddingTop: spacing.md, paddingBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 3 },
  itemTitle: { ...typography.smallStrong, color: colors.text },
  itemBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  rowDetail: { ...typography.small, color: colors.textFaint },
});
