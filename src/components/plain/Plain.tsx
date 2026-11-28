import { PRESS_DIM } from '@/theme/press';
import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { buttonShape, colors, font, radius, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';

/**
 * The pieces of the no-boxes look (features/noBoxes): the website sign-up ask
 * the owner chose (D, "Plain", Nov 28) taken apart so every other spot can be
 * put together from it. Words left-aligned in sentence case, a regular-weight
 * headline, the main action a compact ink button sized to its word (the
 * theme's text colour: near-black on a light court, cream on a dark one), the
 * other choice as words, small corners, no icon tile, no glow, no green slab.
 */

/** A browser evens out a wrapped line, so a sentence never ends on one word alone. */
const EVEN_WEB = Platform.OS === 'web' ? ({ textWrap: 'pretty' } as unknown as TextStyle) : null;

type Tone = 'ink' | 'danger';

/** The one filled button: ink, sized to its word. `danger` for an answer that deletes or cuts someone off. */
export function InkButton({ label, onPress, onPressIn, tone = 'ink', small = false, loading = false, disabled = false, accessibilityLabel, style, nativeRef }: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  tone?: Tone;
  small?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  nativeRef?: React.Ref<View>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  const off = disabled || loading;
  // Words on a red button are read from the colours when drawing (theme's onDanger note: white is also a page colour).
  const labelColor = tone === 'danger' ? { color: colors.onDanger } : null;
  return (
    <Pressable
      ref={nativeRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      onPressIn={onPressIn}
      hitSlop={small ? buttonShape.smallSlop : 0}
      style={({ pressed }) => [styles.ink, small ? styles.inkSmall : styles.inkFull, tone === 'danger' && styles.danger, off && styles.off, pressed && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator size="small" color={tone === 'danger' ? colors.onDanger : colors.bg} /> : (
        <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={[styles.inkText, small && styles.inkTextSmall, labelColor]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** A choice as words: no box, no fill. `muted` for the quiet one ("Not now"), `brand` for a small green accent. */
export function TextAction({ label, onPress, onPressIn, tone = 'ink', small = false, accessibilityLabel, style, nativeRef, disabled = false }: {
  label: string;
  onPress: () => void;
  onPressIn?: () => void;
  tone?: 'ink' | 'muted' | 'brand' | 'danger';
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  nativeRef?: React.Ref<View>;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <Pressable
      ref={nativeRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      hitSlop={8}
      style={({ pressed }) => [styles.link, small ? styles.linkSmall : styles.linkFull, disabled && styles.off, pressed && styles.pressed, style]}
    >
      <Text maxFontSizeMultiplier={TextScale.TITLE} numberOfLines={1} style={[styles.linkText, small && styles.linkTextSmall, tone === 'muted' && styles.muted, tone === 'brand' && styles.brand, tone === 'danger' && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

/** The answers, at the right: the words first, the one filled button last. Wraps under large text. */
export function PlainActions({ children, align = 'end', style }: { children: React.ReactNode; align?: 'end' | 'start'; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.actions, align === 'start' && styles.actionsStart, style]}>{children}</View>;
}

/**
 * The words: a regular-weight headline and one plain line under it, left-aligned.
 * `size` lg for a page of its own (a pop-up, a whole screen), md for a note in a list.
 */
export function PlainWords({ title, body, size = 'md', titleId, bodyId, titleRef, children, style }: {
  title: string;
  body?: string | null;
  size?: 'md' | 'lg';
  titleId?: string;
  bodyId?: string;
  titleRef?: React.Ref<Text>;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={style}>
      <Text ref={titleRef} nativeID={titleId} accessibilityRole="header" maxFontSizeMultiplier={TextScale.CARD} style={[size === 'lg' ? styles.titleLg : styles.titleMd, EVEN_WEB]}>{title}</Text>
      {body ? <Text nativeID={bodyId} maxFontSizeMultiplier={TextScale.CARD} style={[size === 'lg' ? styles.bodyLg : styles.bodyMd, EVEN_WEB]}>{body}</Text> : null}
      {children}
    </View>
  );
}

/**
 * A note in place of a list or a page (nothing here yet, a failed load, a locked page): the words at the
 * left of the page's own margin, the way out as a compact button or words under them. No mark on top.
 */
export function PlainNote({ title, body, action, secondary, style, size = 'md', children }: {
  title: string;
  body?: string | null;
  action?: { label: string; onPress: () => void; loading?: boolean; accessibilityLabel?: string } | null;
  secondary?: { label: string; onPress: () => void; accessibilityLabel?: string } | null;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
  children?: React.ReactNode;
}) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={[styles.note, style]}>
      <PlainWords title={title} body={body} size={size} />
      {children}
      {action || secondary ? (
        <PlainActions align="start" style={styles.noteActions}>
          {action ? <InkButton small label={action.label} onPress={action.onPress} loading={action.loading} accessibilityLabel={action.accessibilityLabel} /> : null}
          {secondary ? <TextAction small label={secondary.label} onPress={secondary.onPress} accessibilityLabel={secondary.accessibilityLabel} /> : null}
        </PlainActions>
      ) : null}
    </View>
  );
}

/** The sheet a pop-up becomes on a phone: the surface from the foot, small top corners, a hairline edge. */
export const plainSheet = {
  backgroundColor: colors.surface,
  borderTopLeftRadius: radius.lg,
  borderTopRightRadius: radius.lg,
  borderWidth: StyleSheet.hairlineWidth,
  borderBottomWidth: 0,
  borderColor: colors.border,
  paddingTop: spacing.xl + spacing.xs,
  paddingHorizontal: spacing.xl,
  boxShadow: '0px -4px 16px rgba(0, 0, 0, 0.10)',
  ...buttonShape.curve,
} as const;

/** The same words as a card in the middle of a computer's window: small corners, the theme's overlay shadow. */
export const plainDialog = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border,
  paddingTop: spacing.xl + spacing.xs,
  paddingBottom: spacing.xl,
  paddingHorizontal: spacing.xl,
  boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.14)',
  ...buttonShape.curve,
} as const;

/** Plain-look text styles for spots that keep their own layout. */
export const plainText = {
  titleLg: { ...font('400'), fontSize: 22, lineHeight: 29, letterSpacing: -0.3, color: colors.text },
  titleMd: { ...font('500'), fontSize: 17, lineHeight: 23, letterSpacing: -0.2, color: colors.text },
  bodyLg: { ...typography.body, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm },
  bodyMd: { ...typography.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: spacing.xs },
} as const;

const styleDefinitions = StyleSheet.create({
  pressed: { opacity: PRESS_DIM },
  off: { opacity: 0.45 },
  ink: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, ...buttonShape.curve },
  inkFull: { minHeight: buttonShape.height, paddingHorizontal: spacing.xl, borderRadius: radius.md },
  inkSmall: { minHeight: buttonShape.smallHeight, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  danger: { backgroundColor: colors.danger },
  inkText: { ...font('600'), fontSize: buttonShape.label, color: colors.bg },
  inkTextSmall: { fontSize: buttonShape.smallLabel },
  link: { alignItems: 'center', justifyContent: 'center' },
  linkFull: { minHeight: buttonShape.height, paddingHorizontal: spacing.md },
  linkSmall: { minHeight: buttonShape.smallHeight, paddingHorizontal: spacing.sm },
  linkText: { ...font('600'), fontSize: buttonShape.label, color: colors.text },
  linkTextSmall: { fontSize: buttonShape.smallLabel },
  muted: { ...font('500'), color: colors.textMuted },
  brand: { color: colors.brand },
  dangerText: { color: colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.xl },
  actionsStart: { justifyContent: 'flex-start' },
  titleLg: plainText.titleLg,
  titleMd: plainText.titleMd,
  bodyLg: plainText.bodyLg,
  bodyMd: plainText.bodyMd,
  note: { alignSelf: 'stretch', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  noteActions: { marginTop: spacing.lg },
});
