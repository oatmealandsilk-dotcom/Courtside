import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

export function Divider({ inset = false }: { inset?: boolean }) {
  return <View style={[styles.line, inset && { marginHorizontal: spacing.lg }]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
