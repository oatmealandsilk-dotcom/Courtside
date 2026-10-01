import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { BrandMark } from '@/components/BrandMark';
import { useLeave } from '@/components/LeaveCurtain';
import { Button } from '@/components/ui';
import { Wash } from '@/components/Wash';
import { openLegal, TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { StatusShade } from '@/components/StatusShade';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography, font, lift } from '@/theme';

/**
 * The short version of the terms. Each rule is a plain headline and the
 * sentence behind it; the first keeps App Review's own words about
 * objectionable content and abusive users.
 */
const RULES = [
  { head: 'Be respectful', body: 'No harassment, hate speech, threats or sexual content. CourtSide has zero tolerance for objectionable content or abusive users.' },
  { head: 'Report problems', body: 'Tap ••• on any post or profile to report it. We review every report within 24 hours.' },
  { head: 'Enforcement', body: 'Content that breaks these rules is removed, and accounts that break them may be suspended.' },
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
  // Clear of the status bar and the home bar, the same as every page before the app.
  const space = useGateSpace();
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: space.top }]}>
        <Animated.View entering={enter(0)}><BrandMark size={40} /></Animated.View>
        <Animated.View entering={enter(1)} style={styles.head}>
          <Text style={styles.title}>Community guidelines</Text>
          <Text style={styles.lead}>Please read and agree to these before you continue. You only need to do this once.</Text>
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
      {/* The guidelines scroll; they stop at the status bar instead of running under the clock. */}
      <StatusShade wash={{ height: 420 }} />

      <Animated.View entering={enter(4)} style={[styles.footer, { paddingBottom: space.footer }]}>
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
  card: { ...lift, borderRadius: 20, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
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
