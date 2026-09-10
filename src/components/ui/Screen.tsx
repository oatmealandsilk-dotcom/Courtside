import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
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
  /** Desktop-only right-hand column, Instagram style. Ignored below the desktop breakpoint. */
  rail?: ReactNode;
  headerWrapper?: (header: ReactNode) => ReactNode;
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
  rail,
  headerWrapper,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { isPhone, isDesktop } = useResponsive();

  const showRail = Boolean(rail) && isDesktop;
  // Centred column, like Instagram's 935px container.
  const columnWidth = showRail ? LAYOUT.feedColumn : LAYOUT.soloColumn;
  const containerWidth = showRail ? columnWidth + LAYOUT.rail + spacing.xxl : columnWidth;

  const constrain = (node: ReactNode) =>
    isPhone ? node : <View style={[styles.constrain, { maxWidth: containerWidth }]}>{node}</View>;

  const header =
    title || onBack ? (
      constrain(
        <View style={[styles.header, !isPhone && styles.headerWide]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.headerText}>
            <Text style={compactTitle || !isPhone ? styles.titleCompact : styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>,
      )
    ) : null;

  const main = (
    <View style={[padded && styles.padded, { paddingBottom: spacing.xxxl, flex: showRail ? 1 : undefined }]}>
      {children}
    </View>
  );

  const body = constrain(
    showRail ? (
      <View style={styles.withRail}>
        <View style={[styles.column, { maxWidth: columnWidth }]}>{main}</View>
        <View style={[styles.rail, { width: LAYOUT.rail }]}>{rail}</View>
      </View>
    ) : (
      main
    ),
  );

  return (
    <View style={[styles.root, { paddingTop: isPhone ? insets.top : spacing.sm }]}>
      {headerWrapper ? headerWrapper(header) : header}
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

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  constrain: { width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerWide: { paddingTop: spacing.xl, paddingBottom: spacing.lg },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.display, color: colors.text },
  titleCompact: { ...typography.title, color: colors.text },
  back: { paddingRight: spacing.xs, paddingVertical: spacing.xs },
  subtitle: { ...typography.small, color: colors.textMuted },
  padded: { paddingHorizontal: spacing.lg },
  withRail: { flexDirection: 'row', gap: spacing.xxl, alignItems: 'flex-start' },
  column: { flex: 1 },
  rail: { paddingTop: spacing.lg, paddingRight: spacing.lg },
});
