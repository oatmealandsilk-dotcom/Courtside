import { useThemedStyles } from '@/theme/ThemeProvider';
import React, { useEffect } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/ui';
import { rememberShareTarget } from '@/features/invite/referral';
import { colors, lift, radius, spacing, typography } from '@/theme';
import { IPHONE_APP_URL, closeJoinSheet, useJoinSheet } from './joinAsk';
import { noteAppTap } from './campaign';

/**
 * The one sign-up ask in guest mode (Oct 17, owner: "it's just when you
 * want to actually do something that requires profile it will make you sign
 * up, that way we can provide value and make ppl want to sign up and know our
 * brand rather than a automatic straight up promotion"). It opens only when
 * a guest tries something that needs a profile, never on its own, and "Not
 * now" (or a tap outside, or Escape) puts them straight back to reading.
 *
 * Either account button remembers the page they were on, and the app opens
 * there again once they are in (useShareLanding). Reporting stays possible
 * without an account: an email to support that names only what it was about.
 *
 * It slides up on its own layer, over the tab bar, never fading anything
 * the bar's glass sits in (Oct 17: a fading parent left the glass see-through).
 */
export function JoinSheet() {
  const styles = useThemedStyles(styleDefinitions);
  const insets = useSafeAreaInsets();
  const ask = useJoinSheet();
  const pathname = usePathname();

  useEffect(() => {
    if (!ask || Platform.OS !== 'web') return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeJoinSheet(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);

  if (!ask) return null;
  const go = async (create: boolean) => {
    const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search.replace(/([?&])(ref|r)=[^&]*/g, '$1').replace(/[?&]+$/, '') : '';
    const label = `Make a free account to ${ask.what}`;
    if (ask.target) await rememberShareTarget(ask.target.href, create ? ask.target.joinHit : undefined, { label, host: ask.target.host });
    else await rememberShareTarget(`${pathname}${search}`, undefined, { label });
    closeJoinSheet();
    router.push({ pathname: '/sign-in', params: { mode: create ? 'create' : 'sign-in' } });
  };
  const report = ask.report;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Not now" style={StyleSheet.absoluteFill} onPress={closeJoinSheet} />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(260)} exiting={SlideOutDown.duration(200)} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.inner}>
          <View style={styles.grab} />
          <View style={styles.mark}><BrandMark size={30} /></View>
          <Text accessibilityRole="header" style={styles.title}>Join CourtSide to {ask.what}</Text>
          <Text style={styles.body}>It’s free. Post your clips, find people to hit with, and ask real coaches about your game.</Text>
          <Button label="Create a free account" full onPress={() => { void go(true); }} />
          <Button label="I already have an account" variant="secondary" full onPress={() => { void go(false); }} />
          {report ? (
            <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void Linking.openURL(`mailto:support@courtsidebase.com?subject=${encodeURIComponent(`Report ${report}`)}`); closeJoinSheet(); }} style={styles.quiet}>
              <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
              <Text style={styles.quietText}>No account? <Text style={styles.quietLink}>Email us about it</Text></Text>
            </Pressable>
          ) : null}
          <View style={styles.foot}>
            <Pressable accessibilityRole="link" accessibilityLabel="Get the iPhone app" hitSlop={8} onPress={() => { noteAppTap(); void Linking.openURL(IPHONE_APP_URL); }} style={styles.quiet}>
              <Ionicons name="logo-apple" size={15} color={colors.textMuted} />
              <Text style={styles.quietText}>Get the iPhone app</Text>
            </Pressable>
            <Pressable accessibilityRole="button" hitSlop={8} onPress={closeJoinSheet} style={styles.quiet}>
              <Text style={styles.quietText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styleDefinitions = StyleSheet.create({
  dim: { backgroundColor: colors.overlay },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.md, paddingHorizontal: spacing.lg, ...lift },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.xs },
  mark: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.brandDim, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, color: colors.text },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22, marginTop: -spacing.xs },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: spacing.xs },
  quietText: { ...typography.small, color: colors.textMuted },
  quietLink: { ...typography.smallStrong, color: colors.brand },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
});
