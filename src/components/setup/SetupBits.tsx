import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { SetupCount } from '@/features/onboarding/setupCount';
import { useGateSpace } from '@/lib/useGateSpace';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/*
 * Setup's shared top and bottom (Oct 20 sweep: "Setup says '2 / 2' and a
 * Finish button, then shows four more pages, each with different buttons").
 * Every setup page draws the same thin progress bar with "Step 3 of 6", and
 * the same pinned bottom: one full-width main button, with any second way
 * on as a quiet word under it.
 */

/** The bar and "Step 3 of 6". Nothing when the page is not part of a setup run. */
export function SetupProgress({ count }: { count: SetupCount | null }) {
  const styles = useThemedStyles(styleDefinitions);
  const share = count ? (count.index + 1) / count.total : 0;
  // Grows from the step before, so moving on reads as progress.
  const fill = useRef(new Animated.Value(count ? count.index / count.total : 0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: share, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [share, fill]);
  if (!count) return null;
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Step ${count.index + 1} of ${count.total}`}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]} />
      </View>
      <Text style={styles.label}>Step {count.index + 1} of {count.total}</Text>
    </View>
  );
}

interface Action { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; dim?: boolean }

/**
 * The pinned bottom of a setup page: the main button full width, then a
 * quieter way on (Back, Not now, Sign out) as a word under it.
 */
export function SetupFooter({ primary, secondary, link, children }: {
  primary: Action;
  /** A second choice of equal standing (Connect WHOOP beside Connect Apple Health), full width under the main one. */
  secondary?: Action;
  link?: { label: string; onPress: () => void; disabled?: boolean; accessibilityLabel?: string };
  /** Drawn above the main button (an error line, a second connect button). */
  children?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const space = useGateSpace();
  return (
    <View style={[styles.footer, { paddingBottom: space.footer }]}>
      {children}
      <Button label={primary.label} onPress={primary.onPress} disabled={primary.disabled} loading={primary.loading} dim={primary.dim} full />
      {secondary ? <Button label={secondary.label} variant="secondary" onPress={secondary.onPress} disabled={secondary.disabled} loading={secondary.loading} dim={secondary.dim} full /> : null}
      {link ? (
        <Pressable accessibilityRole="button" accessibilityLabel={link.accessibilityLabel ?? link.label} disabled={link.disabled} hitSlop={8} onPress={link.onPress} style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}>
          <Text style={styles.linkText}>{link.label}</Text>
        </Pressable>
      ) : <View style={styles.linkSpace} />}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  track: { height: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', transformOrigin: 'left', backgroundColor: colors.brand },
  label: { ...typography.small, color: colors.textFaint, fontVariant: ['tabular-nums'] },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.xs, maxWidth: 460, width: '100%', alignSelf: 'center' },
  link: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center' },
  linkPressed: { opacity: 0.6 },
  linkText: { ...typography.smallStrong, color: colors.textMuted },
  // The same height with no second way on, so the main button sits at one height on every page.
  linkSpace: { height: 36 },
});
