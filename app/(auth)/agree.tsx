import React, { useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';

import { BrandMark } from '@/components/BrandMark';
import { useLeave } from '@/components/LeaveCurtain';
import { SetupFooter, SetupProgress, setupLook } from '@/components/setup/SetupBits';
import { useSetupCount } from '@/features/onboarding/setupCount';
import { ONBOARDING_V2 } from '@/features/onboarding/onboardingV2';
import { Wash } from '@/components/Wash';
import { openLegal, TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useGateSpace } from '@/lib/useGateSpace';
import { useAndroidBack } from '@/lib/androidBack';
import { StatusShade } from '@/components/StatusShade';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, spacing, typography, font, lift } from '@/theme';
import { TextScale } from '@/theme/textScale';
import { corner } from '@/theme/look';

/**
 * The short version of the terms. Each rule is a plain headline and the
 * sentence behind it; the first keeps App Review's own words about
 * objectionable content and abusive users.
 */
const RULES = [
  { head: 'Be respectful', body: 'No harassment, hate speech, threats or sexual content. CourtSide has zero tolerance for objectionable content or abusive users.' },
  { head: 'Report problems', body: 'Tap ••• on any post or profile to report it. We review every report within 24 hours.' },
  { head: 'Enforcement', body: 'Content that breaks these rules is removed, and accounts that break them may be suspended.' },
  // The Terms' "When CourtSide features your post" in one line (owner, Oct 5: on for everyone, disclosed).
  { head: 'Featured posts', body: 'CourtSide may feature your posts on its Instagram, credited to you. Switch it off on any post when you share it, or later in Edit post.' },
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
  // Part of setup for a new account: setup's one step count (Oct 20 sweep). An account already set up, agreeing to new terms, sees none.
  const setupCount = useSetupCount('agree', true);
  // Android's Back leaves the app, as on any first page: popping this gate only
  // showed the page under it for a moment before the gate came back.
  useAndroidBack(() => { BackHandler.exitApp(); return true; });

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
      {/* The sign-up redraw (ONBOARDING_V2): setup's own faint wash, no mark, the bar at setup's one height. */}
      {ONBOARDING_V2 ? <Wash height={setupLook.wash.height} strength={setupLook.wash.strength} /> : <Wash height={420} />}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: ONBOARDING_V2 && setupCount ? space.header : space.top }]}>
        {setupCount ? <Animated.View entering={enter(0)}><SetupProgress count={setupCount} /></Animated.View> : null}
        {ONBOARDING_V2 ? null : <Animated.View entering={enter(0)}><BrandMark size={40} /></Animated.View>}
        <Animated.View entering={enter(1)} style={styles.head}>
          <Text maxFontSizeMultiplier={TextScale.TITLE} style={styles.title}>Community guidelines</Text>
          <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.lead}>Please read and agree to these before you continue. You only need to do this once.</Text>
        </Animated.View>

        <Animated.View entering={enter(2)} style={ONBOARDING_V2 ? styles.cardV2 : styles.card}>
          {RULES.map((rule, index) => (
            <View key={rule.head} style={[styles.rule, index > 0 && styles.ruleLine]}>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.ruleHead}>{rule.head}</Text>
              <Text maxFontSizeMultiplier={TextScale.CARD} style={styles.ruleBody}>{rule.body}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.Text entering={enter(3)} style={styles.fine}>
          Agreeing means you accept the full{' '}
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.link}>Terms of Use</Text>
          {' '}and have read the{' '}
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="link" onPress={() => openLegal('privacy')} style={styles.link}>Privacy Policy</Text>. Each rule is explained in the{' '}
          <Text maxFontSizeMultiplier={TextScale.CARD} accessibilityRole="link" onPress={() => router.push('/guidelines')} style={styles.link}>Community Guidelines</Text>.
        </Animated.Text>
      </ScrollView>
      {/* The guidelines scroll; they stop at the status bar instead of running under the clock. */}
      <StatusShade wash={ONBOARDING_V2 ? setupLook.wash : { height: 420 }} />

      {/* Setup's bottom, the same on every setup page: the main button, and the quieter way out as a word under it. */}
      <Animated.View entering={enter(4)}>
        <SetupFooter primary={{ label: 'I agree', loading: busy, onPress: () => { void agree(); } }} link={{ label: 'Sign out', onPress: () => leave(() => { actions.signOut(); router.replace('/sign-in'); }) }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </SetupFooter>
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
  card: { ...lift, borderRadius: corner(20), backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  rule: { gap: 4, paddingVertical: spacing.lg },
  ruleLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  ruleHead: { ...typography.bodyStrong, color: colors.text },
  ruleBody: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  fine: { ...typography.small, color: colors.textMuted, lineHeight: 19 },
  link: { color: colors.text, ...font('600'), textDecorationLine: 'underline' },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  // The redraw (ONBOARDING_V2): the rules in a hairline inset card (the title sits the page's own 24pt gap under the bar).
  cardV2: { ...setupLook.inset, paddingHorizontal: spacing.lg },
});
