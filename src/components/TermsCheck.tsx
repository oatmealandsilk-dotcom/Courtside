import React from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { openLegal } from '@/lib/legal';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography } from '@/theme';

/**
 * The terms, agreed to on purpose, on the sign-up form: a round check that
 * starts empty, the documents linked inside the sentence, and the one rule
 * that matters written out underneath.
 *
 * Tapping a link opens the page and nothing else — without stopping it there,
 * a browser would also count the tap as ticking the box.
 */
export function TermsCheck({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const styles = useThemedStyles(styleDefinitions);
  const open = (page: 'terms' | 'privacy') => (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    openLegal(page);
  };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel="I agree to the Terms of Use and Privacy Policy"
      onPress={() => onChange(!checked)}
      hitSlop={6}
      style={styles.row}
    >
      <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={checked ? colors.brand : colors.textFaint} />
      <View style={styles.words}>
        <Text style={styles.label}>
          I agree to the{' '}
          <Text accessibilityRole="link" onPress={open('terms')} style={styles.link}>Terms of Use</Text>
          {' '}and{' '}
          <Text accessibilityRole="link" onPress={open('privacy')} style={styles.link}>Privacy Policy</Text>
          .
        </Text>
        <Text style={styles.rule}>CourtSide has no tolerance for objectionable content or abusive users.</Text>
      </View>
    </Pressable>
  );
}

const styleDefinitions = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  words: { flex: 1, gap: 3 },
  label: { ...typography.small, color: colors.text, lineHeight: 19 },
  link: { fontWeight: '700', color: colors.text, textDecorationLine: 'underline' },
  rule: { ...typography.small, fontSize: 12, lineHeight: 17, color: colors.textFaint },
});
