import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/lib/goBack';
import { Ionicons } from '@expo/vector-icons';

import { BrandMark } from '@/components/BrandMark';
import { Screen } from '@/components/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme';

const VERSION = '0.1.0';

export default function About() {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Screen title="About" compactTitle onBack={() => goBack()}>
      <View style={styles.hero}>
        <BrandMark size={56} />
        <Text style={styles.name}>CourtSide</Text>
        <Text style={styles.version}>Version {VERSION} · demo build</Text>
      </View>

      <Text style={styles.body}>
        Social media, discussion, and coaching for tennis players. Log your sessions and matches, ask
        the questions nobody answers well, and get coaching — human or AI — that actually knows your game.
      </Text>

      <View style={styles.card}>
        {[
          { icon: 'help-circle-outline', label: 'Help', to: '/help' },
          { icon: 'shield-checkmark-outline', label: 'Privacy center', to: '/privacy' },
          { icon: 'ribbon-outline', label: 'Apply to be a coach', to: '/coach-apply' },
        ].map((row, index) => (
          <Pressable key={row.label} accessibilityRole="link" onPress={() => router.push(row.to)} style={[styles.row, index > 0 && styles.rowBorder]}>
            <Ionicons name={row.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.text} />
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>GOOD TO KNOW</Text>
      <View style={styles.card}>
        {[
          'Training, injury, and nutrition content is general information, not medical advice.',
          'Coaches are verified by hand: credentials, ratings, and references.',
          isSupabaseConfigured ? 'Your account and what you post are saved securely so they follow you between devices.' : 'This build runs on sample data. Nothing leaves your device.',
        ].map((line, index) => (
          <View key={line} style={[styles.item, index > 0 && styles.rowBorder]}>
            <Text style={styles.itemBody}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>Made for people who would rather be on court.</Text>
    </Screen>
  );
}

const styleDefinitions = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  name: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  version: { ...typography.small, color: colors.textFaint },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22, textAlign: 'center', paddingBottom: spacing.xl },
  sectionTitle: { ...typography.caption, color: colors.textMuted, letterSpacing: 1.1, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { ...typography.body, color: colors.text, flex: 1 },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  itemBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  footer: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xxl, letterSpacing: 0 },
});
