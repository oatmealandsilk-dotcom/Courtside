import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

export function Divider({ inset = false }: { inset?: boolean }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.line, inset && { marginHorizontal: spacing.lg }]} />;
}

const styleDefinitions = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
