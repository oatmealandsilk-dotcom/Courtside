import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { useLeave } from '@/components/LeaveCurtain';
import { Button } from '@/components/ui';
import { Wash } from '@/components/Wash';
import { openLegal, TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography, font } from '@/theme';

/**
 * The short version of the terms. Each rule is a plain headline and the
 * sentence behind it; the first keeps App Review's own words about
 * objectionable content and abusive users.
 */
const RULES = [
  { head: 'Respect everyone', body: 'No harassment, hate, threats or sexual content. There is no tolerance for objectionable content or abusive users.' },
  { head: 'Report what is wrong', body: 'Tap ••• on any post or profile. Every report is read within 24 hours.' },
  { head: 'Breaking them has consequences', body: 'Posts that break these come down, and accounts can be suspended.' },
];

/** Each part arrives a beat after the one above it. */
const enter = (i: number) => FadeInDown.delay(90 + i * 70).duration(420).easing(Easing.out(Easing.cubic));

/**
 * The terms, asked once of any account that has not agreed to the current
 * ones: a Google sign-up (which never saw the form), an account made before
 * sign-up asked, or everyone after the terms change. Rules in one quiet
 * list on the page's wash; the answer pinned at the bottom, where a thumb is.
 */
export default function Agree() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const { termsVersion, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { leave, curtain } = useLeave();

  // Already agreed (a stale link, or the back button): nothing to do here.
  if (termsVersion === TERMS_VERSION && !busy) return <Redirect href="/" />;

  const agree = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await actions.acceptTerms();
      leave(() => router.replace('/'));
    } catch {
      setError('Could not save that. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Wash height={420} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]}>
        <Animated.View entering={enter(0)}><BrandMark size={40} /></Animated.View>
        <Animated.View entering={enter(1)} style={styles.head}>
          <Text style={styles.title}>Before you play</Text>
          <Text style={styles.lead}>Three rules keep CourtSide a good place to talk tennis. You agree to them once.</Text>
        </Animated.View>

        <Animated.View entering={enter(2)} style={styles.card}>
          {RULES.map((rule, index) => (
            <View key={rule.head} style={[styles.rule, index > 0 && styles.ruleLine]}>
              <Text style={styles.ruleHead}>{rule.head}</Text>
              <Text style={styles.ruleBody}>{rule.body}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.Text entering={enter(3)} style={styles.fine}>
          Agreeing means you accept the full{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.link}>Terms of Use</Text>
          {' '}and have read the{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('privacy')} style={styles.link}>Privacy Policy</Text>.
        </Animated.Text>
      </ScrollView>

      <Animated.View entering={enter(4)} style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="I agree" loading={busy} onPress={agree} full />
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" hitSlop={8} onPress={() => leave(() => { actions.signOut(); router.replace('/sign-in'); })} style={styles.signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </Animated.View>
      {curtain}
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
  head: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  lead: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  // One quiet list, the way Settings reads: a shade off the page, hairlines between.
  card: { borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  rule: { gap: 4, paddingVertical: spacing.lg },
  ruleLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  ruleHead: { ...typography.bodyStrong, color: colors.text },
  ruleBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  fine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  link: { color: colors.text, ...font('600'), textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  // The answer stays put at the bottom while the rules scroll.
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.xs, maxWidth: 460, width: '100%', alignSelf: 'center' },
  signOut: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  signOutText: { ...typography.smallStrong, color: colors.textMuted },
});
