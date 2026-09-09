import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '@/theme';

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  right?: ReactNode;
  padded?: boolean;
  onBack?: () => void;
  compactTitle?: boolean;
}

export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  right,
  padded = true,
  onBack,
  compactTitle = false,
}: Props) {
  const insets = useSafeAreaInsets();

  const header = title || onBack ? (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={compactTitle ? styles.titleCompact : styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;

  const body = (
    <View style={[padded && styles.padded, { paddingBottom: spacing.xxxl }]}>{children}</View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.display, color: colors.text },
  titleCompact: { ...typography.title, color: colors.text },
  back: { paddingRight: spacing.xs, paddingVertical: spacing.xs },
  subtitle: { ...typography.small, color: colors.textMuted },
  padded: { paddingHorizontal: spacing.lg },
});
