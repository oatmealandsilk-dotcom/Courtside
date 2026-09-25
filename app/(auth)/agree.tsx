import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { openLegal, TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography, font } from '@/theme';

/** The short version of the terms, numbered like a code of conduct rather than dressed up. */
const RULES = [
  'No harassment, hate, threats or sexual content. There is no tolerance for objectionable content or abusive users.',
  'Report anything that breaks these from the ••• menu. Every report is read within 24 hours.',
  'Posts that break them come down, and accounts can be suspended.',
];

/**
 * The terms, asked once of any account that has not agreed to the current
 * ones: a Google sign-up (which never saw the form), an account made before
 * sign-up asked, or everyone after the terms change. Built as a sibling of
 * the birthday question — same mark, same column, same plain voice.
 */
export default function Agree() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { termsVersion, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already agreed (a stale link, or the back button): nothing to do here.
  if (termsVersion === TERMS_VERSION) return <Redirect href="/" />;

  const agree = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await actions.acceptTerms();
      router.replace('/');
    } catch {
      setError('Could not save that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <BrandMark size={44} />
        <View style={styles.head}>
          <Text style={styles.title}>Terms of Use</Text>
          <Text style={styles.lead}>Everyone agrees to these once. The short version:</Text>
        </View>

        <View style={styles.rules}>
          {RULES.map((rule, index) => (
            <View key={rule} style={styles.rule}>
              <Text style={styles.number}>{index + 1}</Text>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.fine}>
          Agreeing means you accept the full{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.link}>Terms of Use</Text>
          {' '}and have read the{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('privacy')} style={styles.link}>Privacy Policy</Text>.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button label="I agree" loading={busy} onPress={agree} full />
          <Button label="Sign out" variant="ghost" onPress={() => { actions.signOut(); router.replace('/sign-in'); }} full />
        </View>
      </ScrollView>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted },
  // Set in type and ruled off with hairlines, like a printed code of conduct.
  rules: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rule: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  number: { ...typography.smallStrong, color: colors.textFaint, width: 14, lineHeight: 21, fontVariant: ['tabular-nums'] },
  ruleText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },
  fine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  link: { color: colors.text, ...font('600'), textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger },
  actions: { gap: spacing.xs },
});
