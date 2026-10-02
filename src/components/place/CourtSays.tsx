import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CourtFactsLine } from '@/components/place/CourtLife';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * What players say about a court, on its page: "Lights · Usually busy
 * weekday evenings · Some cracks (3 players)", the newest note (an adult's,
 * never named), and Add what you know. Before anyone has said anything, the
 * same heading asks for it, so the facts start somewhere.
 */
export function CourtSays({ courtId, name }: { courtId: string; name: string }) {
  const styles = useThemedStyles(styleDefinitions);
  return (
    <View style={styles.wrap}>
      <Text accessibilityRole="header" style={styles.title}>What players say</Text>
      <CourtFactsLine courtId={courtId} name={name} />
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  wrap: { gap: spacing.sm },
  // The same head as the page's Open hits and Played here.
  title: { ...typography.heading, color: colors.text },
});
