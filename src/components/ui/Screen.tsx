import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { LAYOUT, useResponsive } from '@/lib/useResponsive';
import { colors, spacing, typography } from '@/theme';

/**
 * How far down each route was left, kept outside React so it survives the
 * screen being unmounted and rebuilt — which is exactly what happens when you
 * swipe to another tab and back.
 */
const scrollMemory = new Map<string, number>();

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
  /**
   * Which screen this is, for remembering scroll position. Needed because a
   * screen drawn as a swipe preview sees the route you are leaving, not its
   * own — without this, Coaching's position would be applied to Profile.
   */
  memoryKey?: string;
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
  memoryKey,
}: Props) {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const key = memoryKey ?? pathname;
  const scroller = useRef<ScrollView | null>(null);
  // Captured once so the starting offset is set before the first paint rather
  // than scrolled to afterwards, which is what made it jump into place.
  const initial = useRef(scrollMemory.get(key) ?? 0);
  const restored = useRef(initial.current === 0);
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
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          // Set before the first paint, so there is no visible jump. Web ignores
          // this, which is what the fallback below is for.
          contentOffset={{ x: 0, y: initial.current }}
          onScroll={(event) => scrollMemory.set(key, event.nativeEvent.contentOffset.y)}
          onContentSizeChange={(_width, height) => {
            if (restored.current) return;
            // Wait until the content is tall enough to hold the position,
            // otherwise the scroll clamps to the bottom of a half-built page.
            if (height > initial.current) {
              restored.current = true;
              scroller.current?.scrollTo({ y: initial.current, animated: false });
            }
          }}
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
