import { useThemedStyles } from '@/theme/ThemeProvider';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

/** A hairline of dots rather than a solid rule — the waitlist page's section break. */
export function DottedRule({ gap = spacing.xl }: { gap?: number }) {
  const styles = useThemedStyles(styleDefinitions);
  return <View style={[styles.rule, { marginVertical: gap }]} />;
}

const styleDefinitions = StyleSheet.create({
  rule: { height: 0, borderTopWidth: 1, borderStyle: 'dotted', borderTopColor: colors.borderStrong, opacity: 0.7 },
});
