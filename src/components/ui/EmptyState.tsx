import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}

/** Nothing here yet: the icon in a tinted tile, a line on why, and air around it. */
export function EmptyState({ icon = 'tennisball-outline', title, body }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      <View style={styles.tile}>
        <Ionicons name={icon} size={24} color={colors.brand} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  tile: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.small, color: colors.textMuted, textAlign: 'center', maxWidth: 300, lineHeight: 19 },
});
