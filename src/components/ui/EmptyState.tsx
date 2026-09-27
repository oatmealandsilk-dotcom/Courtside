import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MarkDraw } from '@/components/MarkDraw';
import { Button } from './Button';
import { colors, spacing, typography } from '@/theme';

interface Props {
  /** An icon for this particular emptiness; without one, the mark. */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  /** Where to go from here: an empty screen should never be a dead end. */
  action?: { label: string; onPress: () => void };
}

/** Nothing here yet: a quiet mark, a line on why, and air around it. */
export function EmptyState({ icon, title, body, action }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      {icon ? <Ionicons name={icon} size={26} color={colors.textFaint} /> : <MarkDraw size={30} color={colors.borderStrong} play={false} />}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
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
