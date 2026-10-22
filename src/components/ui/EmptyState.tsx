import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MarkDraw } from '@/components/MarkDraw';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { CoachGlyph, CourtDraw } from '@/components/CourtDraw';
import { SIG } from '@/features/signature/look';

interface Props {
  /** An icon for this particular emptiness; without one, the mark. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** One of the app's own drawn glyphs (a court, a hit), in place of the icon. */
  glyph?: React.ReactNode;
  title: string;
  body?: string;
  /** Where to go from here: an empty screen should never be a dead end. */
  action?: { label: string; onPress: () => void };
}

/** Nothing here yet: a quiet mark, a line on why, and air around it. */
export function EmptyState({ icon, glyph, title, body, action }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  // Design preview (?sig=1, web only): a court drawing itself in, in place of a stock icon. A lock keeps its icon (it means privacy, not emptiness).
  if (SIG) {
    const art = glyph ?? (icon && icon.startsWith('lock') ? <Ionicons name={icon} size={26} color={colors.textFaint} /> : icon && icon.startsWith('sparkles') ? <CoachGlyph size={30} color={colors.textFaint} /> : <CourtDraw width={88} />);
    return (
      <View style={[styles.wrap, { gap: spacing.md }]}>
        {art}
        <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.title, { maxWidth: 260 }]}>{title}</Text>
        {body ? <Text maxFontSizeMultiplier={TextScale.CARD} style={[styles.body, { maxWidth: 260 }]}>{body}</Text> : null}
        {action ? <View style={styles.action}><Button label={action.label} variant="secondary" onPress={action.onPress} /></View> : null}
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      {glyph ?? (icon ? <Ionicons name={icon} size={26} color={colors.textFaint} /> : <MarkDraw size={30} color={colors.borderStrong} play={false} />)}
      <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.title}>{title}</Text>
      {body ? <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.body}>{body}</Text> : null}
      {action ? <View style={styles.action}><Button label={action.label} variant="secondary" onPress={action.onPress} /></View> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  title: { ...typography.heading, color: colors.text, textAlign: 'center', marginTop: spacing.xs },
  body: { ...typography.small, color: colors.textMuted, textAlign: 'center', maxWidth: 300, lineHeight: 19 },
  action: { marginTop: spacing.md },
});
