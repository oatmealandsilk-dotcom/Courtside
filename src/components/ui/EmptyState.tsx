import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography } from '@/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}

export function EmptyState({ icon = 'tennisball-outline', title, body }: Props) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={30} color={colors.textFaint} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  title: { ...typography.heading, color: colors.text, textAlign: 'center' },
  body: { ...typography.small, color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
});
