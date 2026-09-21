import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { openLegal, TERMS_VERSION } from '@/lib/legal';
import { useApp } from '@/store/AppContext';
import { useThemedStyles } from '@/theme/ThemeProvider';
import { colors, radius, spacing, typography } from '@/theme';

/** The three things worth knowing before agreeing: a short name, then the rule itself. */
const GROUND_RULES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'people-outline', title: 'Respect every player', body: 'No harassment, hate, threats or sexual content.' },
  { icon: 'flag-outline', title: 'Report what’s wrong', body: 'Tap ••• on any post or profile. Every report is reviewed within 24 hours.' },
  { icon: 'shield-checkmark-outline', title: 'Rules are enforced', body: 'Posts that break them come down, and accounts can be suspended.' },
];

/**
 * The terms, asked once of any account that has not agreed to the current
 * ones: a Google sign-up (which never saw the form), an account made before
 * sign-up asked, or everyone after the terms change. The whole screen is the
 * question, so the button is the answer; declining just means signing out.
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxxl }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.head}>
          <BrandMark size={52} />
          <Text style={styles.title}>Before you step on court</Text>
          <Text style={styles.lead}>A few ground rules keep CourtSide a good place to play.</Text>
        </Animated.View>

        <View style={styles.card}>
          {GROUND_RULES.map((rule, index) => (
            <Animated.View key={rule.title} entering={FadeInDown.delay(120 + index * 90).duration(380)}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.rule}>
                <View style={styles.tile}>
                  <Ionicons name={rule.icon} size={20} color={colors.brand} />
                </View>
                <View style={styles.ruleWords}>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                  <Text style={styles.ruleBody}>{rule.body}</Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>

      <Animated.View entering={FadeIn.delay(420).duration(400)} style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.fine}>
          By continuing you agree to the{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('terms')} style={styles.fineLink}>Terms of Use</Text>
          {' '}and acknowledge the{' '}
          <Text accessibilityRole="link" onPress={() => openLegal('privacy')} style={styles.fineLink}>Privacy Policy</Text>
          . CourtSide has no tolerance for objectionable content or abusive users.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Agree and continue" loading={busy} onPress={agree} full />
        <Text accessibilityRole="button" onPress={() => { actions.signOut(); router.replace('/sign-in'); }} style={styles.signOut}>Sign out</Text>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xxl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  head: { alignItems: 'center', gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  lead: { ...typography.body, color: colors.textMuted, textAlign: 'center', maxWidth: 300 },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.lg },
  // The line between rules starts where the words do, not under the icon.
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 40 + spacing.md },
  tile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandDim },
  ruleWords: { flex: 1, gap: 3 },
  ruleTitle: { ...typography.bodyStrong, color: colors.text },
  ruleBody: { ...typography.small, color: colors.textMuted, lineHeight: 18 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md, maxWidth: 480, width: '100%', alignSelf: 'center' },
  fine: { ...typography.small, fontSize: 12, lineHeight: 17, color: colors.textFaint, textAlign: 'center' },
  fineLink: { color: colors.text, fontWeight: '600' },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  signOut: { ...typography.smallStrong, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xs },
});
