import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

import { CourtSpinner } from '@/components/CourtSpinner';
import { Tappable } from '@/components/Tappable';
import { Button } from '@/components/ui';
import { ONBOARDING_V2 } from '@/features/onboarding/onboardingV2';
import type { SetupCount } from '@/features/onboarding/setupCount';
import { useGateSpace } from '@/lib/useGateSpace';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { PRESS_SHRINK } from '@/theme/press';
import { TextScale } from '@/theme/textScale';

/*
 * Setup's shared top and bottom (Oct 20 sweep: "Setup says '2 / 2' and a
 * Finish button, then shows four more pages, each with different buttons").
 * Every setup page draws the same thin progress bar with "Step 3 of 6", and
 * the same pinned bottom: one full-width main button, with any second way
 * on as a quiet word under it.
 */

/** The bar and "Step 3 of 6". Nothing when the page is not part of a setup run. */
export function SetupProgress({ count }: { count: SetupCount | null }) {
  return ONBOARDING_V2 ? <SegmentedProgress count={count} /> : <BarProgress count={count} />;
}

function BarProgress({ count }: { count: SetupCount | null }) {
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
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.label}>Step {count.index + 1} of {count.total}</Text>
    </View>
  );
}

/**
 * The sign-up redraw's progress (ONBOARDING_V2): one short segment a step,
 * the ones done and the one you are on in green, the rest a hairline grey.
 * Only the current segment moves, filling from the left as the page opens.
 * "Step 3 of 6" is said to VoiceOver, not drawn.
 */
function SegmentedProgress({ count }: { count: SetupCount | null }) {
  const styles = useThemedStyles(styleDefinitions);
  if (!count) return null;
  return (
    <View style={styles.segments} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${count.index + 1} of ${count.total}`}>
      {Array.from({ length: count.total }, (_, i) => (
        <View key={i} style={[styles.segment, i < count.index && styles.segmentDone]}>
          {/* Keyed by the step, so moving on fills the new one afresh. */}
          {i === count.index ? <SegmentFill key={count.index} /> : null}
        </View>
      ))}
    </View>
  );
}

function SegmentFill() {
  const styles = useThemedStyles(styleDefinitions);
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [fill]);
  return <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]} />;
}

/**
 * A full-width quiet button (ONBOARDING_V2): the "Not now" of the Who can see
 * you card. A soft grey fill, no border, dark words, the same height and
 * corners as the green one, so a second way on is as plain to see without
 * a second green button on the page. Drawn here so Button stays as it is
 * everywhere else.
 */
export function QuietButton({ label, onPress, icon, disabled, loading, dim, accessibilityLabel }: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  /** Looks faded but stays tappable, as Button's dim does. */
  dim?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const inactive = !!disabled || !!loading;
  return (
    <Tappable
      disabled={inactive}
      onPress={onPress}
      scaleTo={PRESS_SHRINK}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.quiet, (inactive || !!dim) && styles.quietOff]}
    >
      <View style={styles.quietInner}>
        {loading ? <CourtSpinner size={18} ink={colors.text} /> : icon ? <Ionicons name={icon} size={17} color={colors.text} /> : null}
        <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.quietText}>{label}</Text>
      </View>
    </Tappable>
  );
}

/** A small capital label over a block of plain lines, the Tennis profile card's look ("AT 18 AND OVER"). */
export function CapsLabel({ children }: { children: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.caps}>{children.toUpperCase()}</Text>;
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
      {secondary ? (ONBOARDING_V2
        ? <QuietButton label={secondary.label} onPress={secondary.onPress} disabled={secondary.disabled} loading={secondary.loading} dim={secondary.dim} />
        : <Button label={secondary.label} variant="secondary" onPress={secondary.onPress} disabled={secondary.disabled} loading={secondary.loading} dim={secondary.dim} full />) : null}
      {link ? (
        <Pressable accessibilityRole="button" accessibilityLabel={link.accessibilityLabel ?? link.label} disabled={link.disabled} hitSlop={8} onPress={link.onPress} style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.linkText}>{link.label}</Text>
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
  // ONBOARDING_V2's pieces.
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 1.5, backgroundColor: colors.border, overflow: 'hidden' },
  segmentDone: { backgroundColor: colors.brand },
  quiet: {
    alignSelf: 'stretch', minHeight: buttonShape.height, paddingVertical: 10, paddingHorizontal: spacing.xl,
    borderRadius: buttonShape.radius, ...buttonShape.curve, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  quietOff: { opacity: 0.5 },
  quietInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quietText: { ...typography.bodyStrong, color: colors.text },
  caps: { ...typography.caption, letterSpacing: 0.6, color: colors.textMuted },
});

/**
 * The redraw's shared measures (ONBOARDING_V2), so every step lines up with the next.
 * Spread inside a page's own StyleSheet.create, so each court's colours are swapped in.
 */
export const setupLook = {
  /**
   * The faint court wash behind the top of every setup page (Oct 29, owner: "Do you think throwing a tiny tiny
   * gradient in the set up screens will help or no. Like the ones in community tab near the bottom. But even less
   * maybe"): the "You're early" card's strength (0.6), about 70% of the Community page's own (0.85). The court's own
   * colours (Wash), scaled by the wash switch in theme/look.ts, so WASH 'none' takes it off here too. Static: drawn
   * once as the page's first child, never inside a step that slides or fades.
   */
  wash: { height: 360, strength: 0.6 } as const,
  /** Under the progress bar, to the title. */
  titleGap: spacing.xl,
  /** Between groups. */
  sectionGap: spacing.xl,
  /** An inset list or card: the page a shade off, a hairline round it, no shadow. */
  inset: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' as const },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, lineHeight: 21, color: colors.textMuted },
  /** A chip: 36pt, never a pill. */
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.chip, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.body, ...font('500'), fontSize: 14, color: colors.text },
};
